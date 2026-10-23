/**
 * OAuth 2.1 authorization server for MCP connectors (Claude), per the MCP authorization spec
 * and Claude's connector requirements (docs/10-claude-connector.md):
 *
 *   GET  /.well-known/oauth-protected-resource[/mcp]   RFC 9728
 *   GET  /.well-known/oauth-authorization-server       RFC 8414
 *   POST /oauth/register                               RFC 7591, public clients only
 *   GET  /oauth/authorize                              code + PKCE S256 -> web consent page
 *   POST /oauth/token                                  authorization_code | refresh_token (rotating)
 *   POST /oauth/revoke                                 RFC 7009
 *   /api/oauth/*                                       consent + connected apps (Supabase session)
 *
 * Registration accepts only Claude's hosted callback and loopback redirects, so this server
 * cannot be used to phish users into authorising some other site.
 */

import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { Hono, type Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type {
  IOAuthRepository,
  IWaTenancyRepository,
  IWhatsAppGateway,
} from '../../../domain/ports/index.js';
import type { SecretBox } from '../../../infrastructure/crypto/secret-box.js';
import { TokenBucketRateLimiter } from '../../../infrastructure/auth/rate-limit.js';
import { sha256Hex } from './wa.js';
// Shared with app.ts: trusts only the rightmost TRUSTED_PROXY_HOPS x-forwarded-for
// entries (see ../client-ip.ts for the trust model); never the leftmost entry.
import { clientIp } from '../client-ip.js';

export const ACCESS_TTL_SECONDS = 3600;
export const REFRESH_TTL_SECONDS = 30 * 24 * 3600;
const REQUEST_TTL_MS = 10 * 60_000;
const CODE_TTL_MS = 5 * 60_000;
const SCOPES = ['whatsapp', 'offline_access'] as const;

/** Claude's hosted-app callbacks (claude.ai today, claude.com announced). */
export const HOSTED_CALLBACKS = new Set([
  'https://claude.ai/api/mcp/auth_callback',
  'https://claude.com/api/mcp/auth_callback',
]);

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function parseUrl(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

/** A redirect URI a client may register: Claude's hosted callback, or an http loopback (RFC 8252). */
export function redirectUriAllowed(raw: string): boolean {
  if (HOSTED_CALLBACKS.has(raw)) return true;
  const u = parseUrl(raw);
  return !!u && u.protocol === 'http:' && LOOPBACK_HOSTS.has(u.hostname) && !u.hash && !u.username && !u.password;
}

/** Exact match, except loopback redirects match without the port (RFC 8252 §7.3; Claude Code). */
export function redirectUriMatches(requested: string, registered: readonly string[]): boolean {
  if (registered.includes(requested)) return true;
  const r = parseUrl(requested);
  if (!r || r.protocol !== 'http:' || !LOOPBACK_HOSTS.has(r.hostname)) return false;
  return registered.some((reg) => {
    const g = parseUrl(reg);
    return !!g && g.protocol === 'http:' && g.hostname === r.hostname && g.pathname === r.pathname && g.search === r.search;
  });
}

export function pkceS256(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

const safeEqual = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

const newToken = (prefix: string) => `${prefix}${randomBytes(32).toString('base64url')}`;

interface PendingRequest {
  clientId: string;
  clientName: string;
  redirectUri: string;
  state: string | undefined;
  codeChallenge: string;
  scope: string;
  expiresAt: number;
}

interface PendingCode {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  userId: string;
  scope: string;
  expiresAt: number;
}

/** Short-lived flow state. In memory: a BFF restart only cancels in-flight sign-ins. */
class FlowStore {
  readonly requests = new Map<string, PendingRequest>();
  readonly codes = new Map<string, PendingCode>();
  sweep(now = Date.now()) {
    for (const [k, v] of this.requests) if (v.expiresAt < now) this.requests.delete(k);
    for (const [k, v] of this.codes) if (v.expiresAt < now) this.codes.delete(k);
  }
}

export interface OAuthDeps {
  oauth: IOAuthRepository;
  tenancy: IWaTenancyRepository;
  gateway: IWhatsAppGateway;
  box: SecretBox;
  /** Public BFF origin = OAuth issuer, e.g. https://api.<your-domain> */
  publicApiUrl: string;
  /** Web origin hosting /oauth/consent, e.g. https://<your-domain> */
  webUrl: string;
}

export function canonicalResource(publicApiUrl: string) {
  return `${publicApiUrl.replace(/\/$/, '')}/mcp`;
}

export function protectedResourceMetadataUrl(publicApiUrl: string) {
  return `${publicApiUrl.replace(/\/$/, '')}/.well-known/oauth-protected-resource/mcp`;
}

/** RFC 8707 resource check: accept the MCP URL or the bare origin, case-insensitive host, no trailing slash. */
function resourceOk(raw: string | undefined, publicApiUrl: string): boolean {
  if (!raw) return true;
  const u = parseUrl(raw);
  if (!u || u.hash) return false;
  const norm = `${u.protocol}//${u.host}${u.pathname.replace(/\/$/, '')}`.toLowerCase();
  const issuer = publicApiUrl.replace(/\/$/, '').toLowerCase();
  return norm === `${issuer}/mcp` || norm === issuer;
}

function normaliseScope(raw: string | undefined): string | null {
  const parts = (raw ?? 'whatsapp').split(/\s+/).filter(Boolean);
  if (parts.some((p) => !(SCOPES as readonly string[]).includes(p))) return null;
  if (!parts.includes('whatsapp')) parts.unshift('whatsapp');
  return [...new Set(parts)].join(' ');
}

function oauthError(c: Context, status: 400 | 401, error: string, description?: string) {
  c.header('Cache-Control', 'no-store');
  return c.json({ error, ...(description ? { error_description: description } : {}) }, status);
}

function withParams(base: string, params: Record<string, string | undefined>) {
  const u = new URL(base);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) u.searchParams.set(k, v);
  return u.toString();
}

async function readParams(c: Context): Promise<Record<string, string>> {
  const type = c.req.header('content-type') ?? '';
  if (type.includes('application/json')) {
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(body).filter(([, v]) => typeof v === 'string')) as Record<string, string>;
  }
  const body = await c.req.parseBody().catch(() => ({}));
  return Object.fromEntries(Object.entries(body).filter(([, v]) => typeof v === 'string')) as Record<string, string>;
}

/** Public OAuth endpoints and metadata. Mount at the app root. */
export function registerOAuthPublic(app: Hono, deps: OAuthDeps, flows = new FlowStore()) {
  const issuer = deps.publicApiUrl.replace(/\/$/, '');
  const limiter = new TokenBucketRateLimiter();
  const limited = async (c: Context, bucket: string, limit: number) =>
    !(await limiter.isAllowed(`${bucket}:${clientIp(c)}`, limit, 60));

  const resourceMetadata = {
    resource: canonicalResource(issuer),
    authorization_servers: [issuer],
    // Must equal the authorization-server list below (RFC 9728
    // scopes_supported describes the same scopes the AS grants).
    scopes_supported: [...SCOPES],
    bearer_methods_supported: ['header'],
    resource_name: 'WhatsApp (WAFINE)',
  };
  app.get('/.well-known/oauth-protected-resource', (c) => c.json(resourceMetadata));
  app.get('/.well-known/oauth-protected-resource/mcp', (c) => c.json(resourceMetadata));

  app.get('/.well-known/oauth-authorization-server', (c) =>
    c.json({
      issuer,
      authorization_endpoint: `${issuer}/oauth/authorize`,
      token_endpoint: `${issuer}/oauth/token`,
      registration_endpoint: `${issuer}/oauth/register`,
      revocation_endpoint: `${issuer}/oauth/revoke`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      revocation_endpoint_auth_methods_supported: ['none'],
      scopes_supported: [...SCOPES],
      authorization_response_iss_parameter_supported: true,
    }),
  );

  // ── RFC 7591 dynamic client registration (public clients) ──
  app.post('/oauth/register', async (c) => {
    if (await limited(c, 'oauth-register', 20)) return c.json({ error: 'rate_limited' }, 429);
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return oauthError(c, 400, 'invalid_client_metadata', 'JSON body required');
    const uris = body['redirect_uris'];
    if (!Array.isArray(uris) || uris.length === 0 || uris.length > 5 || !uris.every((u) => typeof u === 'string')) {
      return oauthError(c, 400, 'invalid_redirect_uri', 'redirect_uris must be 1-5 strings');
    }
    if (!uris.every(redirectUriAllowed)) {
      return oauthError(c, 400, 'invalid_redirect_uri', "Only Claude's callback or loopback redirects are allowed");
    }
    const method = body['token_endpoint_auth_method'];
    if (method !== undefined && method !== 'none') {
      return oauthError(c, 400, 'invalid_client_metadata', 'Only public clients (token_endpoint_auth_method none)');
    }
    const rawName = typeof body['client_name'] === 'string' ? body['client_name'] : 'MCP client';
    const clientName = rawName.replace(/[^\p{L}\p{N} ._()-]/gu, '').slice(0, 60) || 'MCP client';
    const clientId = `owa_c_${randomUUID()}`;
    await deps.oauth.createClient({ clientId, clientName, redirectUris: uris as string[] });
    return c.json(
      {
        client_id: clientId,
        client_id_issued_at: Math.floor(Date.now() / 1000),
        client_name: clientName,
        redirect_uris: uris,
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
      },
      201,
    );
  });

  // ── Authorization endpoint: validate, park the request, send the user to the web consent page ──
  app.get('/oauth/authorize', async (c) => {
    flows.sweep();
    const q = c.req.query();
    const client = q['client_id'] ? await deps.oauth.getClient(q['client_id']) : null;
    const redirectUri = q['redirect_uri'] ?? (client?.redirectUris.length === 1 ? client.redirectUris[0] : undefined);
    // Without a known client and a registered redirect URI, never redirect anywhere.
    if (!client || !redirectUri || !redirectUriMatches(redirectUri, client.redirectUris)) {
      return c.text('Invalid OAuth request: unknown client or unregistered redirect_uri.', 400);
    }
    const fail = (error: string, description: string) =>
      c.redirect(withParams(redirectUri, { error, error_description: description, state: q['state'], iss: issuer }), 302);

    if (q['response_type'] !== 'code') return fail('unsupported_response_type', 'response_type must be code');
    if (!q['code_challenge'] || q['code_challenge_method'] !== 'S256') {
      return fail('invalid_request', 'PKCE with code_challenge_method=S256 is required');
    }
    if (!/^[A-Za-z0-9_-]{43,128}$/.test(q['code_challenge'])) return fail('invalid_request', 'Malformed code_challenge');
    if (!resourceOk(q['resource'], issuer)) return fail('invalid_target', 'Unknown resource');
    const scope = normaliseScope(q['scope']);
    if (!scope) return fail('invalid_scope', 'Unsupported scope');

    const requestId = randomBytes(18).toString('base64url');
    flows.requests.set(requestId, {
      clientId: client.clientId,
      clientName: client.clientName,
      redirectUri,
      state: q['state'],
      codeChallenge: q['code_challenge'],
      scope,
      expiresAt: Date.now() + REQUEST_TTL_MS,
    });
    return c.redirect(`${deps.webUrl.replace(/\/$/, '')}/oauth/consent?request=${requestId}`, 302);
  });

  async function issueTokens(c: Context, grantId: string, scope: string) {
    const access = newToken('wao_at_');
    const refresh = newToken('wao_rt_');
    const now = Date.now();
    await deps.oauth.addToken({ hash: sha256Hex(access), grantId, kind: 'access', expiresAt: new Date(now + ACCESS_TTL_SECONDS * 1000) });
    await deps.oauth.addToken({ hash: sha256Hex(refresh), grantId, kind: 'refresh', expiresAt: new Date(now + REFRESH_TTL_SECONDS * 1000) });
    c.header('Cache-Control', 'no-store');
    c.header('Pragma', 'no-cache');
    return c.json({
      access_token: access,
      token_type: 'Bearer',
      expires_in: ACCESS_TTL_SECONDS,
      refresh_token: refresh,
      scope,
    });
  }

  async function revokeAtEngine(keyId: string | null) {
    if (keyId) await deps.gateway.revokeApiKey(keyId).catch((err) => console.error('engine key revoke failed', keyId, err));
  }

  // ── Token endpoint ──
  app.post('/oauth/token', async (c) => {
    if (await limited(c, 'oauth-token', 60)) return c.json({ error: 'rate_limited' }, 429);
    flows.sweep();
    const p = await readParams(c);
    const clientId = p['client_id'];
    if (!clientId) return oauthError(c, 401, 'invalid_client', 'client_id required');
    const client = await deps.oauth.getClient(clientId);
    if (!client) return oauthError(c, 401, 'invalid_client', 'Unknown client');
    if (!resourceOk(p['resource'], issuer)) return oauthError(c, 400, 'invalid_target', 'Unknown resource');

    if (p['grant_type'] === 'authorization_code') {
      const codeHash = p['code'] ? sha256Hex(p['code']) : '';
      const code = flows.codes.get(codeHash);
      flows.codes.delete(codeHash); // single use, even when the exchange fails
      if (!code || code.expiresAt < Date.now() || code.clientId !== clientId) {
        return oauthError(c, 400, 'invalid_grant', 'Invalid or expired code');
      }
      if (p['redirect_uri'] !== code.redirectUri) return oauthError(c, 400, 'invalid_grant', 'redirect_uri mismatch');
      const verifier = p['code_verifier'] ?? '';
      if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) || !safeEqual(pkceS256(verifier), code.codeChallenge)) {
        return oauthError(c, 400, 'invalid_grant', 'PKCE verification failed');
      }
      const session = await deps.tenancy.getSession(code.userId);
      if (!session) return oauthError(c, 400, 'invalid_grant', 'No WhatsApp session for this account');

      // A dedicated engine key per connection, scoped to the user's own session.
      const grantId = `owa_g_${randomUUID()}`;
      const key = await deps.gateway.createApiKey({
        name: `oauth-${code.userId.slice(0, 8)}-${Date.now()}`,
        role: 'operator',
        allowedSessions: [session.openwaSessionId],
      });
      try {
        await deps.oauth.createGrant({
          id: grantId,
          userId: code.userId,
          clientId,
          openwaKeyId: key.id,
          openwaKeyEnc: deps.box.seal(key.apiKey, grantId),
          scope: code.scope,
        });
      } catch (err) {
        await revokeAtEngine(key.id);
        throw err;
      }
      return issueTokens(c, grantId, code.scope);
    }

    if (p['grant_type'] === 'refresh_token') {
      const hash = p['refresh_token'] ? sha256Hex(p['refresh_token']) : '';
      const t = hash ? await deps.oauth.findToken(hash) : null;
      if (!t || t.kind !== 'refresh' || t.clientId !== clientId) return oauthError(c, 400, 'invalid_grant', 'Invalid refresh token');
      if (t.usedAt || !(await deps.oauth.markRefreshUsed(hash))) {
        // Reuse of a rotated refresh token: assume theft and kill the whole connection.
        await revokeAtEngine(await deps.oauth.revokeGrant(t.grantId));
        return oauthError(c, 400, 'invalid_grant', 'Refresh token reuse detected; connection revoked');
      }
      if (t.expiresAt.getTime() < Date.now()) return oauthError(c, 400, 'invalid_grant', 'Refresh token expired');
      return issueTokens(c, t.grantId, t.scope);
    }

    return oauthError(c, 400, 'unsupported_grant_type', 'Use authorization_code or refresh_token');
  });

  // ── RFC 7009 revocation: revoking any token ends the whole connection ──
  // Per RFC 7009 a public client revokes by sending the token value it owns (§2.1): no
  // user session is required, and the endpoint answers 200 whether or not the token
  // existed so probing for valid tokens reveals nothing. `token` is REQUIRED (§2.1),
  // so a request without it is a 400 malformed request — that check leaks nothing.
  // An optional `client_id` must match the token's client, still without an oracle.
  // Revoking the whole
  // grant (not just one token row) also drops the connector's engine key: possession
  // of ANY token of the connection is enough to end all of it.
  app.post('/oauth/revoke', async (c) => {
    if (await limited(c, 'oauth-revoke', 20)) return c.json({ error: 'rate_limited' }, 429);
    const p = await readParams(c);
    if (!p['token']) return oauthError(c, 400, 'invalid_request', 'token parameter required');
    const t = await deps.oauth.findToken(sha256Hex(p['token']));
    if (t && (!p['client_id'] || p['client_id'] === t.clientId)) {
      await revokeAtEngine(await deps.oauth.revokeGrant(t.grantId));
    }
    c.header('Cache-Control', 'no-store');
    return c.body(null, 200);
  });

  return flows;
}

/** Consent + connected apps, behind the Supabase auth middleware. Mount at /api/oauth. */
export function oauthUserRoutes(deps: OAuthDeps, flows: FlowStore): Hono {
  const r = new Hono();
  const issuer = deps.publicApiUrl.replace(/\/$/, '');

  function pending(id: string) {
    flows.sweep();
    const req = flows.requests.get(id);
    if (!req) throw new HTTPException(404, { message: 'This sign-in request expired. Start again from Claude.' });
    return req;
  }

  r.get('/requests/:id', async (c) => {
    const req = pending(c.req.param('id'));
    const session = await deps.tenancy.getSession(c.get('auth').userId);
    return c.json({
      clientName: req.clientName,
      redirectHost: new URL(req.redirectUri).host,
      loopback: !HOSTED_CALLBACKS.has(req.redirectUri),
      scope: req.scope,
      hasSession: !!session,
    });
  });

  r.post('/requests/:id/approve', async (c) => {
    const id = c.req.param('id');
    const req = pending(id);
    const userId = c.get('auth').userId;
    if (!(await deps.tenancy.getSession(userId))) {
      throw new HTTPException(409, { message: 'Create your WhatsApp session first.' });
    }
    flows.requests.delete(id);
    const code = randomBytes(32).toString('base64url');
    flows.codes.set(sha256Hex(code), {
      clientId: req.clientId,
      redirectUri: req.redirectUri,
      codeChallenge: req.codeChallenge,
      userId,
      scope: req.scope,
      expiresAt: Date.now() + CODE_TTL_MS,
    });
    return c.json({ redirectTo: withParams(req.redirectUri, { code, state: req.state, iss: issuer }) });
  });

  r.post('/requests/:id/deny', (c) => {
    const id = c.req.param('id');
    const req = pending(id);
    flows.requests.delete(id);
    return c.json({
      redirectTo: withParams(req.redirectUri, { error: 'access_denied', state: req.state, iss: issuer }),
    });
  });

  r.get('/grants', async (c) => c.json({ grants: await deps.oauth.listGrants(c.get('auth').userId) }));

  r.delete('/grants/:id', async (c) => {
    const keyId = await deps.oauth.revokeGrant(c.req.param('id'), c.get('auth').userId);
    if (!keyId) throw new HTTPException(404, { message: 'Connection not found.' });
    await deps.gateway.revokeApiKey(keyId).catch((err) => console.error('engine key revoke failed', keyId, err));
    return c.body(null, 204);
  });

  return r;
}

export { FlowStore };
