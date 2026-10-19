import { describe, it, expect, beforeEach } from 'bun:test';
import { randomBytes } from 'node:crypto';
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
import { InMemoryOAuthRepository } from '../persistence/in-memory-oauth.js';
import { HealthAggregator } from '../../infrastructure/health/health-aggregator.js';
import { SecretBox } from '../../infrastructure/crypto/secret-box.js';
import { pkceS256, redirectUriAllowed, redirectUriMatches } from './routes/oauth.js';
import { createApp } from './app.js';

const API = 'https://api.example.test';
const WEB = 'https://wa.example.test';
const CLAUDE_CB = 'https://claude.ai/api/mcp/auth_callback';
const U1 = '11111111-0000-4000-8000-000000000001';

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
}

class FakeGateway implements IWhatsAppGateway {
  sessions = new Map<string, OpenWaSession>();
  keys = new Map<string, CreateApiKeyInput & { revoked: boolean; apiKey: string }>();
  private seq = 0;
  async listSessions() {
    return [...this.sessions.values()];
  }
  async listChats() {
    return [];
  }
  async listMessages() {
    return { data: [] };
  }
  async getSession(id: string) {
    return this.sessions.get(id)!;
  }
  async createSession({ name }: { name: string }) {
    const s: OpenWaSession = { id: `aaaaaaaa-0000-4000-8000-00000000000${++this.seq}`, name, status: 'created', phone: null, lastError: null };
    this.sessions.set(s.id, s);
    return s;
  }
  async startSession(id: string) {
    const s = this.sessions.get(id)!;
    s.status = 'qr_ready';
    return s;
  }
  async getQr(id: string): Promise<QrCode> {
    return { sessionId: id, qrCode: 'data:,', status: 'qr_ready' };
  }
  async logoutSession() {}
  async deleteSession(id: string) {
    this.sessions.delete(id);
  }
  async createApiKey(input: CreateApiKeyInput): Promise<CreatedApiKey> {
    const id = `key-${++this.seq}`;
    const apiKey = `owa_k1_engine_${id}`;
    this.keys.set(id, { ...input, revoked: false, apiKey });
    return { id, keyPrefix: apiKey.slice(0, 12), apiKey };
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

let app: ReturnType<typeof createApp>;
let gateway: FakeGateway;
let engineCalls: { url: string; headers: Headers }[];
const user = { Authorization: `Bearer tok:${U1}` };

beforeEach(async () => {
  const accounts = new InMemoryAccountsRepository();
  await accounts.addAllowlisted('+212600000042', 'seed');
  await accounts.bindProfile({ userId: U1, email: 'a@x.co', phoneE164: '+212600000042' });
  const identity = new FakeIdentity();
  identity.users.set(U1, { userId: U1, email: 'a@x.co', emailConfirmed: true });
  const tenancy = new InMemoryWaTenancyRepository();
  gateway = new FakeGateway();
  engineCalls = [];
  app = createApp({
    health: new HealthAggregator([]),
    accounts,
    identity,
    adminEmails: [],
    corsOrigins: [],
    authRateLimit: { limit: 1000, windowSeconds: 60 },
    wa: {
      gateway,
      tenancy,
      openwaBaseUrl: 'http://engine:2785',
      publicApiUrl: API,
      fetchImpl: (async (url: string | URL | Request, init?: RequestInit) => {
        engineCalls.push({ url: String(url), headers: new Headers(init?.headers) });
        return new Response('event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{}}\n\n', {
          headers: { 'content-type': 'text/event-stream' },
        });
      }) as typeof fetch,
      oauth: {
        repo: new InMemoryOAuthRepository(tenancy),
        box: new SecretBox(randomBytes(32).toString('base64')),
        webUrl: WEB,
      },
    },
  });
});

const form = (fields: Record<string, string>) => ({
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(fields).toString(),
});

async function register(redirectUris = [CLAUDE_CB]) {
  const res = await app.request('/oauth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ client_name: 'Claude', redirect_uris: redirectUris }),
  });
  return { res, body: (await res.json()) as { client_id: string } };
}

const verifier = 'v'.repeat(43) + randomBytes(16).toString('hex');

async function authorize(clientId: string, extra: Record<string, string> = {}) {
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: CLAUDE_CB,
    code_challenge: pkceS256(verifier),
    code_challenge_method: 'S256',
    state: 'st-1',
    scope: 'whatsapp offline_access',
    resource: `${API}/mcp`,
    ...extra,
  });
  return app.request(`/oauth/authorize?${q}`);
}

async function approvedCode(clientId: string) {
  const res = await authorize(clientId);
  const requestId = new URL(res.headers.get('location')!).searchParams.get('request')!;
  const approve = await app.request(`/api/oauth/requests/${requestId}/approve`, { method: 'POST', headers: user });
  const { redirectTo } = (await approve.json()) as { redirectTo: string };
  return new URL(redirectTo);
}

async function exchange(clientId: string, code: string, v = verifier) {
  const res = await app.request(
    '/oauth/token',
    form({ grant_type: 'authorization_code', code, redirect_uri: CLAUDE_CB, client_id: clientId, code_verifier: v, resource: `${API}/mcp` }),
  );
  return { res, body: (await res.json()) as Record<string, string> };
}

const mcp = (token: string) =>
  app.request('/mcp', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  });

describe('discovery (what Claude reads first)', () => {
  it('answers an unauthenticated MCP call with 401 + resource_metadata', async () => {
    const res = await app.request('/mcp', { method: 'POST', body: '{}' });
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toBe(
      `Bearer resource_metadata="${API}/.well-known/oauth-protected-resource/mcp", scope="whatsapp"`,
    );
  });

  it('serves protected resource and authorization server metadata', async () => {
    const prm = (await (await app.request('/.well-known/oauth-protected-resource/mcp')).json()) as Record<string, unknown>;
    expect(prm).toMatchObject({ resource: `${API}/mcp`, authorization_servers: [API] });
    const as = (await (await app.request('/.well-known/oauth-authorization-server')).json()) as Record<string, unknown>;
    expect(as).toMatchObject({
      issuer: API,
      registration_endpoint: `${API}/oauth/register`,
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
    });
  });
});

describe('registration', () => {
  it("accepts only Claude's callback and loopback redirects", async () => {
    expect((await register()).res.status).toBe(201);
    expect((await register(['http://localhost:3118/callback'])).res.status).toBe(201);
    expect((await register(['https://evil.example/cb'])).res.status).toBe(400);
    expect((await register(['http://evil.example/cb'])).res.status).toBe(400);
  });

  it('matches loopback redirects without the port', () => {
    expect(redirectUriAllowed('http://127.0.0.1:5555/callback')).toBe(true);
    expect(redirectUriMatches('http://localhost:9999/callback', ['http://localhost:3118/callback'])).toBe(true);
    expect(redirectUriMatches('http://localhost:9999/other', ['http://localhost:3118/callback'])).toBe(false);
    expect(redirectUriMatches('https://claude.ai/api/mcp/auth_callback?x=1', [CLAUDE_CB])).toBe(false);
  });
});

describe('authorization code flow', () => {
  it('refuses unknown clients and unregistered redirects without redirecting', async () => {
    expect((await authorize('owa_c_nope')).status).toBe(400);
    const { body } = await register();
    const res = await authorize(body.client_id, { redirect_uri: 'https://evil.example/cb' });
    expect(res.status).toBe(400);
    expect(res.headers.get('location')).toBeNull();
  });

  it('requires PKCE S256', async () => {
    const { body } = await register();
    const res = await authorize(body.client_id, { code_challenge_method: 'plain' });
    const loc = new URL(res.headers.get('location')!);
    expect(loc.origin + loc.pathname).toBe(CLAUDE_CB);
    expect(loc.searchParams.get('error')).toBe('invalid_request');
    expect(loc.searchParams.get('state')).toBe('st-1');
  });

  it('sends the user to consent, which needs a Supabase session and a WhatsApp session', async () => {
    const { body } = await register();
    const res = await authorize(body.client_id);
    expect(res.status).toBe(302);
    const loc = new URL(res.headers.get('location')!);
    expect(loc.origin + loc.pathname).toBe(`${WEB}/oauth/consent`);
    const id = loc.searchParams.get('request')!;

    expect((await app.request(`/api/oauth/requests/${id}`)).status).toBe(401);
    const info = (await (await app.request(`/api/oauth/requests/${id}`, { headers: user })).json()) as Record<string, unknown>;
    expect(info).toMatchObject({ clientName: 'Claude', redirectHost: 'claude.ai', hasSession: false, loopback: false });
    expect((await app.request(`/api/oauth/requests/${id}/approve`, { method: 'POST', headers: user })).status).toBe(409);
  });

  it('issues tokens, mints a scoped engine key, and proxies MCP with the engine key only', async () => {
    await app.request('/api/wa/session', { method: 'POST', headers: user });
    const { body: client } = await register();
    const cb = await approvedCode(client.client_id);
    expect(cb.searchParams.get('state')).toBe('st-1');
    expect(cb.searchParams.get('iss')).toBe(API);

    const { res, body } = await exchange(client.client_id, cb.searchParams.get('code')!);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(body).toMatchObject({ token_type: 'Bearer', expires_in: 3600, scope: 'whatsapp offline_access' });

    const [sessionId] = [...gateway.sessions.keys()];
    const engineKey = [...gateway.keys.values()][0]!;
    expect(engineKey).toMatchObject({ role: 'operator', allowedSessions: [sessionId] });

    const r = await mcp(body['access_token']!);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('text/event-stream');
    expect(engineCalls.at(-1)!.url).toBe('http://engine:2785/mcp');
    expect(engineCalls.at(-1)!.headers.get('x-api-key')).toBe(engineKey.apiKey);
    expect(JSON.stringify([...engineCalls.at(-1)!.headers])).not.toContain(body['access_token']!);

    // The code is single-use.
    expect((await exchange(client.client_id, cb.searchParams.get('code')!)).res.status).toBe(400);
  });

  it('rejects a wrong PKCE verifier and burns the code', async () => {
    await app.request('/api/wa/session', { method: 'POST', headers: user });
    const { body: client } = await register();
    const code = (await approvedCode(client.client_id)).searchParams.get('code')!;
    expect((await exchange(client.client_id, code, 'w'.repeat(50))).body['error']).toBe('invalid_grant');
    expect((await exchange(client.client_id, code)).res.status).toBe(400);
    expect(gateway.keys.size).toBe(0);
  });
});

describe('refresh rotation, reuse detection, revocation', () => {
  async function connected() {
    await app.request('/api/wa/session', { method: 'POST', headers: user });
    const { body: client } = await register();
    const code = (await approvedCode(client.client_id)).searchParams.get('code')!;
    return { clientId: client.client_id, tokens: (await exchange(client.client_id, code)).body };
  }

  it('rotates refresh tokens and revokes everything on reuse', async () => {
    const { clientId, tokens } = await connected();
    const r1 = await app.request('/oauth/token', form({ grant_type: 'refresh_token', refresh_token: tokens['refresh_token']!, client_id: clientId }));
    expect(r1.status).toBe(200);
    const t2 = (await r1.json()) as Record<string, string>;
    expect(t2['refresh_token']).not.toBe(tokens['refresh_token']);
    expect((await mcp(t2['access_token']!)).status).toBe(200);

    const reuse = await app.request('/oauth/token', form({ grant_type: 'refresh_token', refresh_token: tokens['refresh_token']!, client_id: clientId }));
    expect(reuse.status).toBe(400);
    expect(((await reuse.json()) as Record<string, string>)['error']).toBe('invalid_grant');
    expect((await mcp(t2['access_token']!)).status).toBe(401);
    expect([...gateway.keys.values()][0]!.revoked).toBe(true);
  });

  it('lists connected apps and revokes one from the web', async () => {
    const { tokens } = await connected();
    const list = (await (await app.request('/api/oauth/grants', { headers: user })).json()) as { grants: { id: string; clientName: string }[] };
    expect(list.grants).toHaveLength(1);
    expect(list.grants[0]!.clientName).toBe('Claude');
    expect((await app.request(`/api/oauth/grants/${list.grants[0]!.id}`, { method: 'DELETE', headers: user })).status).toBe(204);
    expect((await mcp(tokens['access_token']!)).status).toBe(401);
    expect([...gateway.keys.values()][0]!.revoked).toBe(true);
  });

  it('RFC 7009 revoke ends the connection; deleting the session kills connector keys too', async () => {
    const { tokens } = await connected();
    expect((await app.request('/oauth/revoke', form({ token: tokens['access_token']! }))).status).toBe(200);
    expect((await mcp(tokens['access_token']!)).status).toBe(401);

    const again = await connected();
    expect((await app.request('/api/wa/session', { method: 'DELETE', headers: user })).status).toBe(204);
    expect([...gateway.keys.values()].every((k) => k.revoked)).toBe(true);
    expect((await mcp(again.tokens['access_token']!)).status).toBe(401);
  });

  it('rejects unknown grant types and clients', async () => {
    expect((await app.request('/oauth/token', form({ grant_type: 'client_credentials', client_id: 'x' }))).status).toBe(401);
    const { clientId } = await connected();
    const res = await app.request('/oauth/token', form({ grant_type: 'password', client_id: clientId }));
    expect(((await res.json()) as Record<string, string>)['error']).toBe('unsupported_grant_type');
  });
});

describe('SecretBox', () => {
  it('round-trips and refuses tampering or a different binding', () => {
    const box = new SecretBox(randomBytes(32).toString('base64'));
    const sealed = box.seal('owa_k1_secret', 'grant-1');
    expect(box.open(sealed, 'grant-1')).toBe('owa_k1_secret');
    expect(() => box.open(sealed, 'grant-2')).toThrow();
    const parts = sealed.split('.');
    parts[3] = Buffer.from('x' + Buffer.from(parts[3]!, 'base64url').toString('latin1')).toString('base64url');
    expect(() => box.open(parts.join('.'), 'grant-1')).toThrow();
    expect(() => new SecretBox('c2hvcnQ=')).toThrow();
  });
});
