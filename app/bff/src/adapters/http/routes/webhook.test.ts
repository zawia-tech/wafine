import { describe, it, expect } from 'bun:test';
import { createHmac } from 'node:crypto';
import { Hono } from 'hono';
import { registerWebhookRoutes } from './webhook.js';
import { registerWorkflowRoutes } from './workflows.js';
import { WorkflowEngine } from '../../../domain/workflows/engine.js';
import { HmacWebhookVerifier } from '../../../infrastructure/gateway/webhook-verifier.js';
import { InMemoryIdempotencyStore, InMemoryWorkflowStore } from '../../../infrastructure/workflows/memory-stores.js';
import { StaticWorkflowDirectory } from '../../../infrastructure/workflows/static-directory.js';
import { PacedReplySender, DEFAULT_PACING } from '../../../infrastructure/workflows/paced-sender.js';
import { OpenWaApiError } from '../../../infrastructure/gateway/openwa-http-client.js';
import { TokenBucketRateLimiter } from '../../../infrastructure/auth/rate-limit.js';
import type { SendOutcome, SendTextInput } from '../../../domain/ports/index.js';

const SECRET = 'test-webhook-secret-0123456789';
const SESSION = 'session-1';
const TENANT = 'tenant-1';
const ALLOWED = '212600000042@c.us';
const STRANGER = '212611111111@c.us';
const DAY = 24 * 60 * 60 * 1000;

function setup(options: { enabled?: boolean; gatewayError?: () => Error } = {}) {
  const clock = { time: 1_700_000_000_000 };
  const sent: SendTextInput[] = [];
  const sleeps: number[] = [];
  const gateway = {
    sendText: async (input: SendTextInput) => {
      if (options.gatewayError) throw options.gatewayError();
      sent.push(input);
      return { messageId: `m${sent.length}`, timestamp: '' };
    },
  };
  const sender = new PacedReplySender(gateway, new TokenBucketRateLimiter(), DEFAULT_PACING, {
    now: () => clock.time,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock.time += ms;
    },
    random: () => 0.5,
  });
  const directory = new StaticWorkflowDirectory([
    { tenantId: TENANT, sessionId: SESSION, allowlist: ['+212 600-000042'] },
  ]);
  const store = new InMemoryWorkflowStore(options.enabled ?? true, () => clock.time);

  // Capture each queued reply's delivery so tests can await the paced send.
  const deliveries: Promise<SendOutcome>[] = [];
  const engine = new WorkflowEngine(directory, directory, store, sender);
  const handle = engine.handle.bind(engine);
  engine.handle = async (message) => {
    const decision = await handle(message);
    if (decision.status === 'queued') deliveries.push(decision.delivery);
    return decision;
  };

  const app = new Hono();
  registerWebhookRoutes(app, {
    verifier: new HmacWebhookVerifier(SECRET),
    engine,
    replayGuard: new InMemoryIdempotencyStore(() => clock.time),
  });

  let counter = 0;
  async function deliver(body: string, from = ALLOWED, extra: Record<string, unknown> = {}) {
    const raw = JSON.stringify({
      event: 'message.received',
      timestamp: new Date(clock.time).toISOString(),
      sessionId: SESSION,
      idempotencyKey: `idem-${++counter}`,
      deliveryId: `del-${counter}`,
      data: { chatId: from, from, body, type: 'chat', fromMe: false, isGroup: false, ...extra },
    });
    return post(raw);
  }
  function post(raw: string, signature?: string) {
    return app.request('/webhook/openwa', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-OpenWA-Signature': signature ?? `sha256=${createHmac('sha256', SECRET).update(raw).digest('hex')}`,
      },
      body: raw,
    });
  }
  const settle = () => Promise.all(deliveries.splice(0));
  return { app, clock, sent, sleeps, store, deliver, post, settle, deliveries };
}

describe('POST /webhook/openwa', () => {
  it('rejects a bad or missing signature and sends nothing', async () => {
    const t = setup();
    const raw = JSON.stringify({ event: 'message.received', sessionId: SESSION, data: { chatId: ALLOWED, body: 'ping' } });

    expect((await t.post(raw, 'sha256=deadbeef')).status).toBe(401);
    const unsigned = await t.app.request('/webhook/openwa', { method: 'POST', body: raw });
    expect(unsigned.status).toBe(401);
    await t.settle();
    expect(t.sent).toHaveLength(0);
  });

  it('caps the body before reading it all, without draining the request', async () => {
    const t = setup();
    const chunk = new Uint8Array(32 * 1024);
    const total = 4 * 1024 * 1024;
    let produced = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (produced >= total) {
          controller.close();
          return;
        }
        produced += chunk.byteLength;
        controller.enqueue(chunk);
      },
    });

    const res = await t.app.request('/webhook/openwa', {
      method: 'POST',
      headers: { 'X-OpenWA-Signature': 'sha256=deadbeef' },
      body,
      duplex: 'half',
    });

    expect(res.status).toBe(413);
    expect(produced).toBeLessThan(1_000_000);
  });

  it('fails closed when no webhook secret is configured', async () => {
    const t = setup();
    const app = new Hono();
    registerWebhookRoutes(app, {
      verifier: new HmacWebhookVerifier(''),
      engine: new WorkflowEngine({ tenantForSession: async () => null }, { isAllowed: async () => false }, t.store, {
        send: async () => 'sent',
      }),
      replayGuard: new InMemoryIdempotencyStore(),
    });
    const res = await app.request('/webhook/openwa', { method: 'POST', body: '{}' });
    expect(res.status).toBe(401);
  });

  it('replies pong to ping, after a human-like delay', async () => {
    const t = setup();
    const res = await t.deliver('ping');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, queued: 'ping-pong' });
    expect(await t.settle()).toEqual(['sent']);
    expect(t.sent).toEqual([{ sessionId: SESSION, chatId: ALLOWED, text: 'pong' }]);
    expect(t.sleeps[0]).toBeGreaterThan(1000);
  });

  it('matches ping case-insensitively but not as part of a longer sentence', async () => {
    const t = setup();
    await t.deliver(' PING! ');
    await t.deliver('ping me later');
    expect(await t.settle()).toEqual(['sent']);
    expect(t.sent.map((m) => m.text)).toEqual(['pong']);
  });

  for (const word of ['hello', 'Hi', 'salam', 'bonjour']) {
    it(`greets on "${word}"`, async () => {
      const t = setup();
      await t.deliver(word);
      expect(await t.settle()).toEqual(['sent']);
      expect(t.sent).toHaveLength(1);
      expect(t.sent[0]?.text).toContain('automated reply');
    });
  }

  it('greets a contact at most once per 24h', async () => {
    const t = setup();
    await t.deliver('hello');
    await t.settle();
    t.clock.time += DAY - 60_000;
    const second = await t.deliver('salam');
    expect(await second.json()).toEqual({ ok: true, ignored: 'cooldown' });
    expect(t.sent).toHaveLength(1);

    t.clock.time += 2 * 60_000;
    await t.deliver('bonjour');
    await t.settle();
    expect(t.sent).toHaveLength(2);
  });

  it('does not use up the greeting slot when the reply is not delivered', async () => {
    const t = setup({ gatewayError: () => new OpenWaApiError(500, null, 'down') });
    await t.deliver('hello');
    expect(await t.settle()).toEqual(['failed']);
    // Slot released: the same contact is eligible again.
    const again = await t.deliver('hello');
    expect(await again.json()).toEqual({ ok: true, queued: 'greeting' });
    await t.settle();
  });

  it('ignores contacts that are not on the tenant allowlist', async () => {
    const t = setup();
    const res = await t.deliver('ping', STRANGER);
    expect(await res.json()).toEqual({ ok: true, ignored: 'not_allowlisted' });
    await t.settle();
    expect(t.sent).toHaveLength(0);
  });

  it('ignores unknown sessions, groups, own messages and non-text', async () => {
    const t = setup();
    const unknown = await t.post(
      JSON.stringify({
        event: 'message.received',
        sessionId: 'other',
        idempotencyKey: 'x',
        data: { chatId: ALLOWED, body: 'ping', type: 'chat' },
      }),
    );
    expect(await unknown.json()).toEqual({ ok: true, ignored: 'unknown_session' });
    expect(await (await t.deliver('ping', '120363@g.us', { isGroup: true })).json()).toEqual({
      ok: true,
      ignored: 'not_direct_chat',
    });
    expect(await (await t.deliver('ping', ALLOWED, { fromMe: true })).json()).toEqual({
      ok: true,
      ignored: 'from_me',
    });
    expect(await (await t.deliver('ping', ALLOWED, { type: 'image' })).json()).toEqual({
      ok: true,
      ignored: 'not_text',
    });
    expect(t.sent).toHaveLength(0);
  });

  it('ignores other event types and unmatched text', async () => {
    const t = setup();
    const status = await t.post(
      JSON.stringify({ event: 'session.status', sessionId: SESSION, data: { status: 'ready' } }),
    );
    expect(await status.json()).toEqual({ ok: true, ignored: 'not_message_event' });
    expect(await (await t.deliver('what time do you open?')).json()).toEqual({ ok: true, ignored: 'no_match' });
  });

  it('does nothing while the tenant has the workflow switched off', async () => {
    const t = setup({ enabled: false });
    expect(await (await t.deliver('ping')).json()).toEqual({ ok: true, ignored: 'rule_disabled' });
    expect(t.sent).toHaveLength(0);
  });

  it('treats a replayed delivery as a no-op', async () => {
    const t = setup();
    const raw = JSON.stringify({
      event: 'message.received',
      sessionId: SESSION,
      idempotencyKey: 'same-key',
      data: { chatId: ALLOWED, body: 'ping', type: 'chat' },
    });
    expect(await (await t.post(raw)).json()).toEqual({ ok: true, queued: 'ping-pong' });
    expect(await (await t.post(raw)).json()).toEqual({ ok: true, ignored: 'duplicate' });
    await t.settle();
    expect(t.sent).toHaveLength(1);
  });

  it('respects the gateway send pacing: one 429 stops all further sends, with no retry', async () => {
    let calls = 0;
    const t = setup({
      gatewayError: () => {
        calls++;
        return new OpenWaApiError(429, { code: 'SEND_PACING_LIMITED' }, 'paced');
      },
    });
    await t.deliver('ping');
    expect(await t.settle()).toEqual(['gateway_paced']);
    await t.deliver('ping');
    expect(await t.settle()).toEqual(['dropped_backoff']);
    expect(calls).toBe(1);
  });
});

describe('/api/workflows', () => {
  function workflowApp() {
    const store = new InMemoryWorkflowStore(false);
    const app = new Hono();
    // Stands in for the Supabase auth middleware, which sets `tenantId` to the verified
    // user id. `X-Test-User` only simulates different signed-in users in this harness.
    app.use('/api/*', async (c, next) => {
      const user = c.req.header('X-Test-User') ?? 't1';
      c.set('auth', { userId: user, tenantId: user, email: `${user}@example.test`, isAdmin: false });
      await next();
    });
    registerWorkflowRoutes(app, store);
    return app;
  }
  type WorkflowView = { workflows: { id: string; enabled: boolean }[] };
  const view = async (res: Response) => (await res.json()) as WorkflowView;
  const put = (app: Hono, path: string, body: unknown, tenant = 't1') =>
    app.request(path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Test-User': tenant },
      body: JSON.stringify(body),
    });

  it('starts off, toggles per rule and per tenant', async () => {
    const app = workflowApp();
    const initial = await view(await app.request('/api/workflows'));
    expect(initial.workflows.map((w) => w.enabled)).toEqual([false, false]);

    const one = await view(await put(app, '/api/workflows/ping-pong', { enabled: true }));
    expect(one.workflows.find((w) => w.id === 'ping-pong')?.enabled).toBe(true);
    expect(one.workflows.find((w) => w.id === 'greeting')?.enabled).toBe(false);

    const other = await view(await app.request('/api/workflows', { headers: { 'X-Test-User': 't2' } }));
    expect(other.workflows.every((w) => !w.enabled)).toBe(true);
  });

  it('has no master switch over all rules', async () => {
    const app = workflowApp();
    const res = await put(app, '/api/workflows', { enabled: true });
    expect(res.status).toBe(404);
  });

  it('rejects unknown rules and bad bodies', async () => {
    const app = workflowApp();
    expect((await put(app, '/api/workflows/nope', { enabled: true })).status).toBe(404);
    expect((await put(app, '/api/workflows/ping-pong', { enabled: 'yes' })).status).toBe(400);
  });
});
