import { describe, it, expect, beforeEach } from 'bun:test';
import type {
  CreateApiKeyInput,
  CreatedApiKey,
  IIdentityProvider,
  IWhatsAppGateway,
  IdentityUser,
  OpenWaSession,
  QrCode,
  SendResult,
} from '../../domain/ports/index.js';
import { InMemoryAccountsRepository } from '../persistence/in-memory-accounts.js';
import { InMemoryWaTenancyRepository } from '../persistence/in-memory-wa-tenancy.js';
import { HealthAggregator } from '../../infrastructure/health/health-aggregator.js';
import { OpenWaApiError } from '../../infrastructure/gateway/openwa-http-client.js';
import { mcpSendCount, restPathAllowed, restSendCount } from './routes/gateway-proxy.js';
import { clampTtl, parseArchiveKey } from './routes/media-url.js';
import { createApp } from './app.js';
import { InMemoryAdminRepository } from '../persistence/in-memory-admin.js';
import { RuntimeSettingsService } from '../../infrastructure/settings/runtime-settings.js';
import { CountingSendBudget, MemoryCounterStore } from '../../infrastructure/send-budget/send-budget.js';

/** Minimal Supabase stand-in: bearer `tok:<userId>` resolves to that user. */
class FakeIdentity implements IIdentityProvider {
  users = new Map<string, IdentityUser>();
  async signUp(): Promise<never> {
    throw new Error('unused');
  }
  async signIn(): Promise<never> {
    throw new Error('unused');
  }
  async refresh() {
    return null;
  }
  async getUser(token: string) {
    return this.users.get(token.replace(/^tok:/, '')) ?? null;
  }
  async deleteUser() {}
  add(userId: string, email: string) {
    this.users.set(userId, { userId, email, emailConfirmed: true });
    return { Authorization: `Bearer tok:${userId}` };
  }
}

/** In-memory OpenWA engine: sessions, QR and scoped keys. */
class FakeGateway implements IWhatsAppGateway {
  sessions = new Map<string, OpenWaSession>();
  keys = new Map<string, CreateApiKeyInput & { revoked: boolean }>();
  loggedOut: string[] = [];
  chatReads: { sessionId: string; limit: number; offset: number }[] = [];
  messageReads: { sessionId: string; chatId: string; limit: number; offset: number; inlineMedia: false }[] = [];
  private seq = 0;

  async listSessions() {
    return [...this.sessions.values()];
  }
  async listChats(sessionId: string, query: { limit: number; offset: number }) {
    this.chatReads.push({ sessionId, ...query });
    return [{ id: `${sessionId}@c.us`, name: `Chat ${sessionId}`, lastMessage: { body: 'hello' } }];
  }
  async listMessages(
    sessionId: string,
    query: { chatId: string; limit: number; offset: number; inlineMedia: false },
  ) {
    this.messageReads.push({ sessionId, ...query });
    return { data: [{ id: 'message-1', body: `from ${sessionId}`, fromMe: false }] };
  }
  async getSession(id: string) {
    const s = this.sessions.get(id);
    if (!s) throw new OpenWaApiError(404, null, 'not found');
    return s;
  }
  async createSession({ name }: { name: string }) {
    if ([...this.sessions.values()].some((s) => s.name === name)) throw new OpenWaApiError(409, null, 'taken');
    const id = `aaaaaaaa-0000-4000-8000-${String(++this.seq).padStart(12, '0')}`;
    const s: OpenWaSession = { id, name, status: 'created', phone: null, lastError: null };
    this.sessions.set(id, s);
    return s;
  }
  async startSession(id: string) {
    const s = await this.getSession(id);
    if (s.status !== 'created' && s.status !== 'disconnected') throw new OpenWaApiError(400, null, 'started');
    s.status = 'qr_ready';
    return s;
  }
  async getQr(id: string): Promise<QrCode> {
    const s = await this.getSession(id);
    if (s.status !== 'qr_ready') throw new OpenWaApiError(400, null, 'no qr');
    return { sessionId: id, qrCode: 'data:image/png;base64,QR', status: s.status };
  }
  async logoutSession(id: string) {
    this.loggedOut.push(id);
    const s = await this.getSession(id);
    s.status = 'disconnected';
    s.phone = null;
  }
  async deleteSession(id: string) {
    this.sessions.delete(id);
  }
  async createApiKey(input: CreateApiKeyInput): Promise<CreatedApiKey> {
    const id = `key-${++this.seq}`;
    this.keys.set(id, { ...input, revoked: false });
    return { id, keyPrefix: `owa_k1_${id}`.slice(0, 12), apiKey: `owa_k1_secret_${id}` };
  }
  async revokeApiKey(id: string) {
    const k = this.keys.get(id);
    if (k) k.revoked = true;
  }
  async sendText(): Promise<SendResult> {
    throw new Error('unused');
  }
  async sendMedia(): Promise<SendResult> {
    throw new Error('unused');
  }
  async health() {
    return true;
  }
}

const U1 = '11111111-0000-4000-8000-000000000001';
const U2 = '11111111-0000-4000-8000-000000000002';
const N1 = '+212600000042';
const N2 = '+212600000002';

/** Records what it was asked to sign; the URL just echoes the key. */
class FakeSigner {
  signed: { key: string; ttl: number }[] = [];
  async presignGet(key: string, ttl: number) {
    this.signed.push({ key, ttl });
    return `https://r2.example.test/${key}?X-Amz-Expires=${ttl}`;
  }
}

let gateway: FakeGateway;
let signer: FakeSigner;
let upstream: { url: string; init: RequestInit }[];
let app: ReturnType<typeof createApp>;
let h1: { Authorization: string };
let h2: { Authorization: string };
let hA: { Authorization: string };
let upstreamStatus: number;
let budget: CountingSendBudget;

beforeEach(async () => {
  const accounts = new InMemoryAccountsRepository();
  const identity = new FakeIdentity();
  gateway = new FakeGateway();
  signer = new FakeSigner();
  upstream = [];
  for (const [u, n, e] of [
    [U1, N1, 'a@x.co'],
    [U2, N2, 'b@x.co'],
  ] as const) {
    await accounts.addAllowlisted(n, 'seed');
    await accounts.bindProfile({ userId: u, email: e, phoneE164: n });
  }
  h1 = identity.add(U1, 'a@x.co');
  h2 = identity.add(U2, 'b@x.co');
  hA = identity.add('11111111-0000-4000-8000-0000000000ad', 'admin@x.co');
  upstreamStatus = 200;
  const tenancy = new InMemoryWaTenancyRepository();
  const adminRepo = new InMemoryAdminRepository(accounts, tenancy);
  // ttl 0: every read sees the latest admin write.
  const settings = new RuntimeSettingsService(
    adminRepo,
    {
      sendLimits: { perDay: 3, perMinute: 2 },
      workflow: { minGapMs: 3000, maxPerMinuteSession: 6, maxPerMinuteContact: 2, backoffMs: 900000 },
    },
    0,
  );
  budget = new CountingSendBudget(new MemoryCounterStore(), (id) => settings.limitsFor(id));
  app = createApp({
    health: new HealthAggregator([]),
    accounts,
    identity,
    adminEmails: ['admin@x.co'],
    corsOrigins: [],
    backoffice: { repo: adminRepo, settings, budget },
    wa: {
      gateway,
      tenancy,
      sendBudget: budget,
      openwaBaseUrl: 'http://engine:2785',
      publicApiUrl: 'https://api.example.test',
      media: { signer, ttlSeconds: 120 },
      fetchImpl: (async (url: string | URL | Request, init?: RequestInit) => {
        upstream.push({ url: String(url), init: init ?? {} });
        return new Response(JSON.stringify({ ok: true }), {
          status: upstreamStatus,
          headers: { 'content-type': 'application/json', 'x-internal': 'secret' },
        });
      }) as typeof fetch,
    },
  });
});

const post = (path: string, headers: Record<string, string>) => app.request(path, { method: 'POST', headers });

async function createSession(h = h1) {
  const res = await post('/api/wa/session', h);
  return { res, body: (await res.json()) as { session: OpenWaSession } };
}

async function mintKey(h = h1) {
  const res = await post('/api/wa/keys', h);
  return { res, body: (await res.json()) as { id: string; apiKey: string; sessionId: string; mcpUrl: string } };
}

describe('/api/wa session lifecycle', () => {
  it('requires a Supabase session', async () => {
    expect((await app.request('/api/wa/session')).status).toBe(401);
  });

  it('creates, starts and serves the QR for the caller only', async () => {
    expect(await (await app.request('/api/wa/session', { headers: h1 })).json()).toEqual({ session: null });

    const { res, body } = await createSession();
    expect(res.status).toBe(201);
    expect(body.session.status).toBe('qr_ready');
    expect((await post('/api/wa/session', h1)).status).toBe(409);

    const qr = await (await app.request('/api/wa/session/qr', { headers: h1 })).json();
    expect(qr).toEqual({ qrCode: 'data:image/png;base64,QR', status: 'qr_ready' });

    // Another user sees nothing of it.
    expect(await (await app.request('/api/wa/session', { headers: h2 })).json()).toEqual({ session: null });
    expect((await app.request('/api/wa/session/qr', { headers: h2 })).status).toBe(404);
  });

  it('returns a null QR while the engine has none, instead of failing', async () => {
    const { body } = await createSession();
    gateway.sessions.get(body.session.id)!.status = 'authenticating';
    expect(await (await app.request('/api/wa/session/qr', { headers: h1 })).json()).toEqual({
      qrCode: null,
      status: 'authenticating',
    });
  });

  it('logs out a device linked with a number other than the invited one', async () => {
    const { body } = await createSession();
    Object.assign(gateway.sessions.get(body.session.id)!, { status: 'ready', phone: '212699999999' });
    const res = (await (await app.request('/api/wa/session', { headers: h1 })).json()) as {
      session: { status: string };
      error: string;
    };
    expect(res.session.status).toBe('phone_mismatch');
    expect(res.error).toContain(N1);
    expect(gateway.loggedOut).toEqual([body.session.id]);
  });

  it('accepts the invited number', async () => {
    const { body } = await createSession();
    Object.assign(gateway.sessions.get(body.session.id)!, { status: 'ready', phone: '212600000042' });
    const res = (await (await app.request('/api/wa/session', { headers: h1 })).json()) as {
      session: { status: string; phone: string };
    };
    expect(res.session).toMatchObject({ status: 'ready', phone: '212600000042' });
    expect(gateway.loggedOut).toEqual([]);
  });

  it('delete revokes the keys and removes the session', async () => {
    const { body } = await createSession();
    const key = await mintKey();
    const res = await app.request('/api/wa/session', { method: 'DELETE', headers: h1 });
    expect(res.status).toBe(204);
    expect(gateway.sessions.has(body.session.id)).toBe(false);
    expect(gateway.keys.get(key.body.id)?.revoked).toBe(true);
    expect((await app.request('/wa/sessions', { headers: { 'X-API-Key': key.body.apiKey } })).status).toBe(401);
  });
});

describe('/api/wa chats and messages', () => {
  it('derives the session from the authenticated user and never accepts another session id', async () => {
    const own = await createSession(h1);
    const other = await createSession(h2);

    const chats = await app.request(`/api/wa/chats?sessionId=${other.body.session.id}`, { headers: h1 });
    expect(chats.status).toBe(200);
    expect(await chats.json()).toMatchObject({ chats: [{ id: `${own.body.session.id}@c.us` }] });
    expect(gateway.chatReads).toEqual([{ sessionId: own.body.session.id, limit: 100, offset: 0 }]);

    const messages = await app.request(
      `/api/wa/messages?chatId=${encodeURIComponent(`${other.body.session.id}@c.us`)}&limit=25&offset=5`,
      { headers: h1 },
    );
    expect(messages.status).toBe(200);
    expect(gateway.messageReads).toEqual([
      { sessionId: own.body.session.id, chatId: `${other.body.session.id}@c.us`, limit: 25, offset: 5, inlineMedia: false },
    ]);
  });

  it('validates pagination and requires a chat id for messages', async () => {
    await createSession();
    expect((await app.request('/api/wa/chats?limit=101', { headers: h1 })).status).toBe(400);
    expect((await app.request('/api/wa/messages', { headers: h1 })).status).toBe(400);
  });
});

describe('/api/wa/keys', () => {
  it('mints an operator key scoped to the caller session, shown once', async () => {
    const { body: s } = await createSession();
    const { res, body } = await mintKey();
    expect(res.status).toBe(201);
    expect(body.apiKey).toStartWith('owa_k1_');
    expect(body.mcpUrl).toBe('https://api.example.test/mcp');
    expect(gateway.keys.get(body.id)).toMatchObject({ role: 'operator', allowedSessions: [s.session.id] });

    const list = (await (await app.request('/api/wa/keys', { headers: h1 })).json()) as { keys: object[] };
    expect(list.keys).toHaveLength(1);
    expect(JSON.stringify(list)).not.toContain(body.apiKey);
  });

  it('needs a session first, and caps active keys', async () => {
    expect((await post('/api/wa/keys', h1)).status).toBe(404);
    await createSession();
    for (let i = 0; i < 5; i++) expect((await mintKey()).res.status).toBe(201);
    expect((await mintKey()).res.status).toBe(409);
  });

  it("revokes only the caller's own key", async () => {
    await createSession();
    await createSession(h2);
    const k1 = await mintKey();
    expect((await app.request(`/api/wa/keys/${k1.body.id}`, { method: 'DELETE', headers: h2 })).status).toBe(404);
    expect((await app.request(`/api/wa/keys/${k1.body.id}`, { method: 'DELETE', headers: h1 })).status).toBe(204);
    expect(gateway.keys.get(k1.body.id)?.revoked).toBe(true);
  });
});

describe('key-authenticated passthrough', () => {
  it('rejects missing, foreign and non-issued keys', async () => {
    expect((await app.request('/wa/sessions')).status).toBe(401);
    expect((await app.request('/wa/sessions', { headers: { 'X-API-Key': 'owa_k1_not-issued' } })).status).toBe(401);
    expect((await app.request('/wa/sessions', { headers: { 'X-API-Key': 'admin-bootstrap' } })).status).toBe(401);
    expect(upstream).toHaveLength(0);
  });

  it('forwards to the engine with the key, own session only, and strips internal headers', async () => {
    await createSession();
    const { body } = await mintKey();
    const k = { 'X-API-Key': body.apiKey, 'X-Tenant-Id': 'evil' };

    const ok = await app.request(`/wa/sessions/${body.sessionId}/messages/send-text`, {
      method: 'POST',
      headers: { ...k, 'content-type': 'application/json' },
      body: JSON.stringify({ chatId: '1@c.us', text: 'hi' }),
    });
    expect(ok.status).toBe(200);
    expect(ok.headers.get('x-internal')).toBeNull();
    const sent = upstream[0]!;
    expect(sent.url).toBe(`http://engine:2785/api/sessions/${body.sessionId}/messages/send-text`);
    const sentHeaders = new Headers(sent.init.headers);
    expect(sentHeaders.get('x-api-key')).toBe(body.apiKey);
    expect(sentHeaders.get('x-tenant-id')).toBeNull();

    // Bearer form works too.
    expect(
      (await app.request('/wa/sessions', { headers: { Authorization: `Bearer ${body.apiKey}` } })).status,
    ).toBe(200);

    // Another session, admin routes, and deleting the session are refused before the engine.
    const before = upstream.length;
    for (const [method, path] of [
      ['GET', '/wa/sessions/aaaaaaaa-0000-4000-8000-999999999999/chats'],
      ['GET', '/wa/auth/api-keys'],
      ['GET', '/wa/settings'],
      ['DELETE', `/wa/sessions/${body.sessionId}`],
      ['POST', `/wa/sessions/${body.sessionId}/force-kill`],
      ['GET', `/wa/sessions/${body.sessionId}/..%2F..%2Fauth`],
    ] as const) {
      expect((await app.request(path, { method, headers: k })).status).toBe(403);
    }
    expect(upstream.length).toBe(before);
  });

  it('proxies MCP as POST only', async () => {
    await createSession();
    const { body } = await mintKey();
    expect((await app.request('/mcp', { headers: { 'X-API-Key': body.apiKey } })).status).toBe(405);
    const res = await app.request('/mcp', {
      method: 'POST',
      headers: { 'X-API-Key': body.apiKey, 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    expect(res.status).toBe(200);
    expect(upstream.at(-1)?.url).toBe('http://engine:2785/mcp');
    expect(new Headers(upstream.at(-1)?.init.headers).get('accept')).toBe('application/json, text/event-stream');
  });

  it('stops working once the key is revoked', async () => {
    await createSession();
    const { body } = await mintKey();
    await app.request(`/api/wa/keys/${body.id}`, { method: 'DELETE', headers: h1 });
    expect((await app.request('/wa/sessions', { headers: { 'X-API-Key': body.apiKey } })).status).toBe(401);
  });
});

describe('media-url (presigned links into the private media bucket)', () => {
  const file = '0b0e5f7e-1c2d-4e3f-8a9b-0c1d2e3f4a5b.jpg';

  it('signs a key of the caller session only, for a Supabase session', async () => {
    expect((await app.request(`/api/wa/media-url?path=chat-media/x/${file}`)).status).toBe(401);
    expect((await app.request(`/api/wa/media-url?path=chat-media/x/${file}`, { headers: h1 })).status).toBe(404);

    const { body } = await createSession();
    const own = `chat-media/${body.session.id}/${file}`;
    const res = await app.request(`/api/wa/media-url?path=${encodeURIComponent(own)}`, { headers: h1 });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const out = (await res.json()) as { url: string; expiresAt: string };
    expect(out.url).toBe(`https://r2.example.test/${own}?X-Amz-Expires=120`);
    expect(Date.parse(out.expiresAt) - Date.now()).toBeGreaterThan(100_000);
    expect(signer.signed).toEqual([{ key: own, ttl: 120 }]);

    // Another user's session prefix: refused, nothing signed.
    const other = await createSession(h2);
    const foreign = `chat-media/${other.body.session.id}/${file}`;
    expect((await app.request(`/api/wa/media-url?path=${encodeURIComponent(foreign)}`, { headers: h1 })).status).toBe(403);
    expect(signer.signed).toHaveLength(1);
  });

  it('signs for a user API key, answered by the BFF and never forwarded', async () => {
    await createSession();
    const { body } = await mintKey();
    const own = `chat-media/${body.sessionId}/${file}`;
    expect((await app.request(`/wa/media-url?path=${own}`)).status).toBe(401);
    const res = await app.request(`/wa/media-url?path=${own}`, { headers: { 'X-API-Key': body.apiKey } });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { url: string }).url).toContain(own);
    const foreign = `chat-media/aaaaaaaa-0000-4000-8000-999999999999/${file}`;
    expect((await app.request(`/wa/media-url?path=${foreign}`, { headers: { 'X-API-Key': body.apiKey } })).status).toBe(403);
    expect(upstream).toHaveLength(0);
  });

  it('rejects anything that is not an archive key', async () => {
    const { body } = await createSession();
    const sid = body.session.id;
    for (const path of [
      '',
      `chat-media/${sid}`,
      `status-media/${sid}/${file}`,
      `chat-media/${sid}/../${file}`,
      `chat-media/${sid}/sub/${file}`,
      `/chat-media/${sid}/${file}`,
      `chat-media/${sid}/${file}?x=1`,
      `chat-media/${sid}/evil.svg+xml`,
    ]) {
      const res = await app.request(`/api/wa/media-url?path=${encodeURIComponent(path)}`, { headers: h1 });
      expect(res.status).toBe(400);
    }
    expect(signer.signed).toHaveLength(0);
  });

  it('parses keys and clamps the lifetime', () => {
    expect(parseArchiveKey(`chat-media/s-1/${file}`)).toEqual({ key: `chat-media/s-1/${file}`, sessionId: 's-1' });
    expect(parseArchiveKey(undefined)).toBeNull();
    expect(clampTtl(5)).toBe(60);
    expect(clampTtl(86_400)).toBe(3600);
    expect(clampTtl(Number.NaN)).toBe(300);
  });
});

describe('restPathAllowed', () => {
  const S = 'aaaaaaaa-0000-4000-8000-000000000001';
  it.each([
    ['GET', ['sessions'], true],
    ['POST', ['sessions'], false],
    ['GET', ['sessions', S], true],
    ['DELETE', ['sessions', S], false],
    ['POST', ['sessions', S, 'logout'], true],
    ['PUT', ['sessions', S, 'config'], false],
    ['GET', ['sessions', S.toUpperCase(), 'chats'], true],
    ['GET', ['webhooks'], false],
    ['GET', ['sessions', S, '..', 'x'], false],
    ['GET', ['sessions', S, '../../auth'], false],
    ['GET', ['sessions', S, 'a\\b'], false],
  ] as const)('%s %p -> %p', (method, segs, expected) => {
    expect(restPathAllowed(method, [...segs], S)).toBe(expected);
  });
});

const sendText = (sessionId: string, key: string) =>
  app.request(`/wa/sessions/${sessionId}/messages/send-text`, {
    method: 'POST',
    headers: { 'X-API-Key': key, 'content-type': 'application/json' },
    body: JSON.stringify({ chatId: '1@c.us', text: 'hi' }),
  });

const mcpCall = (key: string, name: string, id: number | null = 1) =>
  app.request('/mcp', {
    method: 'POST',
    headers: { 'X-API-Key': key, 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', ...(id === null ? {} : { id }), method: 'tools/call', params: { name, arguments: {} } }),
  });

const enc = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).buffer as ArrayBuffer;

describe('send classification', () => {
  it('counts REST sends only', () => {
    expect(restSendCount('POST', ['sessions', 's', 'messages', 'send-text'], undefined)).toBe(1);
    expect(restSendCount('POST', ['sessions', 's', 'messages', 'reply'], undefined)).toBe(1);
    expect(restSendCount('POST', ['sessions', 's', 'messages', 'react'], undefined)).toBe(0);
    expect(restSendCount('GET', ['sessions', 's', 'messages', 'send-text'], undefined)).toBe(0);
    expect(restSendCount('POST', ['sessions', 's', 'chats'], undefined)).toBe(0);
    expect(restSendCount('POST', ['sessions', 's', 'messages', 'send-bulk'], enc({ messages: [1, 2, 3] }))).toBe(3);
    expect(restSendCount('POST', ['sessions', 's', 'messages', 'send-bulk'], undefined)).toBe(1);
  });

  it('counts MCP send tool calls, single or batched', () => {
    const call = (name: string) => ({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name } });
    expect(mcpSendCount(enc(call('MessageSendText')))).toBe(1);
    expect(mcpSendCount(enc(call('MessageList')))).toBe(0);
    expect(mcpSendCount(enc({ jsonrpc: '2.0', id: 1, method: 'tools/list' }))).toBe(0);
    expect(mcpSendCount(enc([call('MessageReply'), call('MessageForward'), call('SessionFindAll')]))).toBe(2);
    expect(mcpSendCount(undefined)).toBe(0);
  });
});

describe('API send budget', () => {
  it('caps API sends per session and leaves reads free', async () => {
    await createSession();
    const { body } = await mintKey();
    expect((await sendText(body.sessionId, body.apiKey)).status).toBe(200);
    expect((await sendText(body.sessionId, body.apiKey)).status).toBe(200);
    // Third send in the same minute: the per-minute cap (2) refuses it before the engine.
    const before = upstream.length;
    const refused = await sendText(body.sessionId, body.apiKey);
    expect(refused.status).toBe(429);
    expect(refused.headers.get('retry-after')).toBeTruthy();
    expect(await refused.json()).toMatchObject({ code: 'API_SEND_LIMIT', window: 'minute', limit: 2 });
    expect(upstream.length).toBe(before);
    // Reads never count.
    expect((await app.request('/wa/sessions', { headers: { 'X-API-Key': body.apiKey } })).status).toBe(200);
    expect((await budget.usage(body.sessionId)).today).toBe(2);
  });

  it('refunds a send the engine refused', async () => {
    await createSession();
    const { body } = await mintKey();
    upstreamStatus = 409;
    expect((await sendText(body.sessionId, body.apiKey)).status).toBe(409);
    expect((await budget.usage(body.sessionId)).today).toBe(0);
  });

  it('answers a refused MCP send as a tool error, and leaves other tools alone', async () => {
    await createSession();
    const { body } = await mintKey();
    await mcpCall(body.apiKey, 'MessageSendText');
    await mcpCall(body.apiKey, 'MessageSendText');
    const before = upstream.length;
    const res = await mcpCall(body.apiKey, 'MessageSendText', 7);
    expect(res.status).toBe(200);
    const rpc = (await res.json()) as { id: number; result: { isError: boolean; content: { text: string }[] } };
    expect(rpc.id).toBe(7);
    expect(rpc.result.isError).toBe(true);
    expect(rpc.result.content[0]!.text).toContain('per minute');
    expect(upstream.length).toBe(before);
    expect((await mcpCall(body.apiKey, 'MessageList')).status).toBe(200);
    // A notification (no id) cannot carry a tool result: plain 429.
    expect((await mcpCall(body.apiKey, 'MessageSendText', null)).status).toBe(429);
  });
});

describe('/api/admin backoffice', () => {
  const put = (path: string, body: unknown, h = hA) =>
    app.request(path, { method: 'PUT', headers: { ...h, 'content-type': 'application/json' }, body: JSON.stringify(body) });

  it('is admin only', async () => {
    expect((await app.request('/api/admin/settings', { headers: h1 })).status).toBe(403);
    expect((await app.request('/api/admin/settings', { headers: hA })).status).toBe(200);
  });

  it('edits global settings with validation, and the budget follows', async () => {
    const res = await put('/api/admin/settings', { sendLimits: { perMinute: 5 } });
    expect(res.status).toBe(200);
    const s = (await res.json()) as { sendLimits: { perDay: number; perMinute: number }; updatedBy: string };
    expect(s.sendLimits).toEqual({ perDay: 3, perMinute: 5 });
    expect(s.updatedBy).toBe('admin@x.co');
    expect((await put('/api/admin/settings', { sendLimits: { perDay: 0 } })).status).toBe(400);
    expect((await put('/api/admin/settings', { sendLimits: { bogus: 1 } })).status).toBe(400);

    await createSession();
    const { body } = await mintKey();
    for (let i = 0; i < 3; i++) expect((await sendText(body.sessionId, body.apiKey)).status).toBe(200);
    const refused = await sendText(body.sessionId, body.apiKey);
    expect(await refused.json()).toMatchObject({ window: 'day', limit: 3 });
  });

  it('lists sessions with usage, and applies and clears a per-session override', async () => {
    await createSession();
    const { body } = await mintKey();
    await sendText(body.sessionId, body.apiKey);
    expect((await put(`/api/admin/sessions/${body.sessionId}/limits`, { perDay: 10, perMinute: null })).status).toBe(200);
    expect((await put('/api/admin/sessions/aaaaaaaa-0000-4000-8000-999999999999/limits', { perDay: 1, perMinute: null })).status).toBe(404);

    const list = (await (await app.request('/api/admin/sessions', { headers: hA })).json()) as {
      sessions: { openwaSessionId: string; email: string; usage: { today: number; perDay: number; perMinute: number }; override: unknown; keys: unknown[] }[];
    };
    const row = list.sessions.find((s) => s.openwaSessionId === body.sessionId)!;
    expect(row.email).toBe('a@x.co');
    expect(row.usage).toMatchObject({ today: 1, perDay: 10, perMinute: 2 });
    expect(row.override).toEqual({ perDay: 10, perMinute: null });
    expect(row.keys).toHaveLength(1);

    const cleared = await put(`/api/admin/sessions/${body.sessionId}/limits`, { perDay: null, perMinute: null });
    expect(await cleared.json()).toEqual({ override: null });
  });

  it('revokes a user key here and at the engine', async () => {
    await createSession();
    const { body } = await mintKey();
    expect((await app.request(`/api/admin/keys/${body.id}`, { method: 'DELETE', headers: hA })).status).toBe(204);
    expect(gateway.keys.get(body.id)?.revoked).toBe(true);
    expect((await app.request('/wa/sessions', { headers: { 'X-API-Key': body.apiKey } })).status).toBe(401);
    expect((await app.request(`/api/admin/keys/${body.id}`, { method: 'DELETE', headers: hA })).status).toBe(404);
  });

  it('disables a user everywhere, and never an admin', async () => {
    await createSession();
    const { body } = await mintKey();
    const users = (await (await app.request('/api/admin/users', { headers: hA })).json()) as {
      users: { userId: string; hasSession: boolean; disabled: boolean }[];
    };
    expect(users.users.find((u) => u.userId === U1)).toMatchObject({ hasSession: true, disabled: false });

    expect(await (await put(`/api/admin/users/${U1}`, { disabled: true })).json()).toEqual({ userId: U1, disabled: true });
    expect((await app.request('/api/wa/session', { headers: h1 })).status).toBe(403);
    expect((await app.request('/wa/sessions', { headers: { 'X-API-Key': body.apiKey } })).status).toBe(403);
    expect((await app.request('/api/wa/session', { headers: h2 })).status).toBe(200);

    await put(`/api/admin/users/${U1}`, { disabled: false });
    expect((await app.request('/api/wa/session', { headers: h1 })).status).toBe(200);
    expect((await put('/api/admin/users/11111111-0000-4000-8000-999999999999', { disabled: true })).status).toBe(404);
  });
});
