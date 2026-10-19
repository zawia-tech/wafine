/**
 * Public, key-authenticated passthrough to the private OpenWA engine.
 *
 *   /wa/<path>  ->  OpenWA /api/<path>   (REST)
 *   /mcp        ->  OpenWA /mcp          (MCP Streamable HTTP, POST only)
 *   /wa/media-url  answered here: a presigned link to an archived file of the key's session
 *
 * Two gates, both must pass:
 *   1. the BFF: the key's SHA-256 is an active, user-issued key (`wa_api_keys`), so the engine's
 *      bootstrap admin key or any operator key never works from the internet;
 *   2. OpenWA: the key is session-scoped (`allowedSessions = [own session]`, role operator),
 *      and the engine enforces that scope on every route and MCP tool.
 * On top, REST paths are confined to the key owner's own session subtree.
 *
 * Outbound sends (REST `messages/send-*`, `reply`, `forward`, `send-bulk`; MCP `tools/call` of a
 * send tool) are charged to the session's send budget before they are forwarded, and refunded when
 * the engine refuses them. This is the only daily cap that sees API traffic alone: the engine's own
 * pacing also counts what the owner sends from the phone and WhatsApp Web.
 */

import type { Context, Hono } from 'hono';
import type {
  IOAuthRepository,
  ISendBudget,
  IWaTenancyRepository,
  SendBudgetDecision,
} from '../../../domain/ports/index.js';
import type { SecretBox } from '../../../infrastructure/crypto/secret-box.js';
import { TokenBucketRateLimiter } from '../../../infrastructure/auth/rate-limit.js';
import { describeRefusal } from '../../../infrastructure/send-budget/send-budget.js';
import { sha256Hex } from './wa.js';
import { mediaUrlResponse, type MediaUrlDeps } from './media-url.js';

export interface GatewayProxyDeps {
  tenancy: IWaTenancyRepository;
  /** Private engine base URL, e.g. http://openwa-api:2785 */
  openwaBaseUrl: string;
  fetchImpl?: typeof fetch;
  /** Requests per window per key. */
  rateLimit?: { limit: number; windowSeconds: number };
  timeoutMs?: number;
  /** OAuth access tokens on /mcp (Claude connector). Absent = API keys only. */
  oauth?: { repo: IOAuthRepository; box: SecretBox; resourceMetadataUrl: string };
  /** Per-session outbound send cap for API traffic. Absent = sends are not budgeted here. */
  sendBudget?: ISendBudget;
  /** A user disabled from /admin keeps their keys and connectors, but none of them work. */
  isUserDisabled?: (userId: string) => Promise<boolean>;
  /** Presigned links to archived media. Absent = /wa/media-url is not an engine path and is refused. */
  media?: MediaUrlDeps;
}

/** Media sends are base64 JSON; keep a sane ceiling. */
export const MAX_PROXY_BODY_BYTES = 16 * 1024 * 1024;

const FORWARD_REQ = ['content-type', 'accept', 'mcp-protocol-version', 'idempotency-key'];
const FORWARD_RES = ['content-type', 'cache-control', 'retry-after', 'mcp-protocol-version'];

/** Per-session sub-paths a user key may not use through the public edge. */
const BLOCKED_SESSION_ACTIONS = new Set(['force-kill', 'proxy', 'config']);

/** REST message actions that put a message on the wire (one each; `send-bulk` counts its items). */
const REST_SEND_ACTIONS = new Set([
  'send-text',
  'send-template',
  'send-image',
  'send-video',
  'send-audio',
  'send-document',
  'send-location',
  'send-contact',
  'send-sticker',
  'send-poll',
  'reply',
  'forward',
]);

/** OpenWA MCP tools that put a message on the wire (OpenWA/src/core/agent-tools/tools/message.tools.ts). */
export const MCP_SEND_TOOLS = new Set([
  'MessageSendText',
  'MessageSendImage',
  'MessageSendVideo',
  'MessageSendAudio',
  'MessageSendDocument',
  'MessageSendLocation',
  'MessageSendContact',
  'MessageSendSticker',
  'MessageSendTemplate',
  'MessageReply',
  'MessageForward',
]);

function parseJson(body: ArrayBuffer | undefined): unknown {
  if (!body) return undefined;
  try {
    return JSON.parse(new TextDecoder().decode(body));
  } catch {
    return undefined;
  }
}

/** Messages a REST call sends, from its decoded path segments (`sessions/<id>/messages/<action>`). */
export function restSendCount(method: string, segments: string[], body: ArrayBuffer | undefined): number {
  if (method !== 'POST' || segments.length !== 4 || segments[2] !== 'messages') return 0;
  const action = segments[3] ?? '';
  if (REST_SEND_ACTIONS.has(action)) return 1;
  if (action !== 'send-bulk') return 0;
  const parsed = parseJson(body) as { messages?: unknown } | undefined;
  // Unparseable or empty: the engine rejects it, but it still cannot pass for free.
  return Array.isArray(parsed?.messages) ? Math.max(1, parsed.messages.length) : 1;
}

interface JsonRpcCall {
  id?: unknown;
  method?: unknown;
  params?: { name?: unknown };
}

/** MCP send tool calls in a JSON-RPC message or batch. */
export function mcpSendCount(body: ArrayBuffer | undefined): number {
  const parsed = parseJson(body);
  const calls = (Array.isArray(parsed) ? parsed : [parsed]) as (JsonRpcCall | undefined)[];
  return calls.filter(
    (m) => m?.method === 'tools/call' && typeof m.params?.name === 'string' && MCP_SEND_TOOLS.has(m.params.name),
  ).length;
}

type Refusal = Extract<SendBudgetDecision, { allowed: false }>;

function extractKey(c: Context): string | null {
  const header = c.req.header('x-api-key');
  if (header) return header.trim();
  const auth = c.req.header('authorization');
  if (auth?.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return null;
}

/**
 * REST rule: `GET sessions` (OpenWA filters the list to the key's scope), or anything under
 * `sessions/<own session id>/...`, except deleting the session itself and admin-ish actions.
 */
export function restPathAllowed(method: string, segments: string[], ownSessionId: string): boolean {
  // Decoded segments: an encoded `/`, `\` or NUL must never smuggle in a path break.
  if (segments.some((s) => s === '' || s === '.' || s === '..' || /[/\\\0]/.test(s))) return false;
  if (segments[0] !== 'sessions') return false;
  if (segments.length === 1) return method === 'GET';
  if (segments[1]?.toLowerCase() !== ownSessionId.toLowerCase()) return false;
  if (segments.length === 2 && method === 'DELETE') return false;
  if (segments.length >= 3 && BLOCKED_SESSION_ACTIONS.has(segments[2] ?? '')) return false;
  return true;
}

async function readCapped(c: Context): Promise<ArrayBuffer | 'too-large'> {
  const declared = Number(c.req.header('content-length'));
  if (Number.isFinite(declared) && declared > MAX_PROXY_BODY_BYTES) return 'too-large';
  const buf = await c.req.arrayBuffer();
  return buf.byteLength > MAX_PROXY_BODY_BYTES ? 'too-large' : buf;
}

export function registerGatewayProxy(app: Hono, deps: GatewayProxyDeps): void {
  const limiter = new TokenBucketRateLimiter();
  const limit = deps.rateLimit ?? { limit: 120, windowSeconds: 60 };
  const base = deps.openwaBaseUrl.replace(/\/$/, '');
  const doFetch = deps.fetchImpl ?? fetch;
  const timeoutMs = deps.timeoutMs ?? 60_000;

  async function authorise(c: Context) {
    const key = extractKey(c);
    if (!key || !key.startsWith('owa_')) return { error: c.json({ error: 'Missing or invalid API key' }, 401) };
    const owner = await deps.tenancy.findActiveKeyByHash(sha256Hex(key));
    if (!owner) return { error: c.json({ error: 'Missing or invalid API key' }, 401) };
    if (await deps.isUserDisabled?.(owner.userId)) {
      return { error: c.json({ error: 'This account is disabled' }, 403) };
    }
    if (!(await limiter.isAllowed(`key:${owner.keyId}`, limit.limit, limit.windowSeconds))) {
      return { error: c.json({ error: 'Rate limit exceeded' }, 429) };
    }
    return { key, owner };
  }

  /** The request body, read once so a send can be classified before it is forwarded. */
  async function readBody(c: Context): Promise<ArrayBuffer | undefined | 'too-large'> {
    if (['GET', 'HEAD'].includes(c.req.method)) return undefined;
    const read = await readCapped(c);
    if (read === 'too-large') return read;
    return read.byteLength > 0 ? read : undefined;
  }

  function restRefused(c: Context, d: Refusal): Response {
    c.header('Retry-After', String(d.retryAfterSeconds));
    return c.json(
      {
        error: describeRefusal(d),
        code: 'API_SEND_LIMIT',
        window: d.window,
        limit: d.limit,
        retryAfterSeconds: d.retryAfterSeconds,
      },
      429,
    );
  }

  /**
   * A refused MCP send answers as a tool error, so the agent reads why and tells its user, instead
   * of the connector reporting a transport failure. A batch has no single id to answer, so it gets
   * the plain 429.
   */
  function mcpRefused(c: Context, body: ArrayBuffer | undefined, d: Refusal): Response {
    const parsed = parseJson(body) as JsonRpcCall | JsonRpcCall[] | undefined;
    if (!parsed || Array.isArray(parsed) || parsed.id === undefined) return restRefused(c, d);
    return c.json({
      jsonrpc: '2.0',
      id: parsed.id,
      result: { content: [{ type: 'text', text: describeRefusal(d) }], isError: true },
    });
  }

  /**
   * Charge `count` sends to the session, forward, and refund when the engine did not take them.
   * An MCP tool failure still answers 200, so it stays charged: the budget errs towards fewer sends.
   */
  async function forwardBudgeted(
    c: Context,
    url: string,
    key: string,
    body: ArrayBuffer | undefined,
    sessionId: string,
    count: number,
    refused: (d: Refusal) => Response,
  ): Promise<Response> {
    if (!deps.sendBudget || count === 0) return forward(c, url, key, body);
    const decision = await deps.sendBudget.take(sessionId, count);
    if (!decision.allowed) return refused(decision);
    const res = await forward(c, url, key, body);
    if (res.status >= 400) await deps.sendBudget.refund(decision.ticket).catch(() => undefined);
    return res;
  }

  async function forward(c: Context, url: string, key: string, body: ArrayBuffer | undefined): Promise<Response> {
    const headers = new Headers({ 'x-api-key': key });
    for (const name of FORWARD_REQ) {
      const v = c.req.header(name);
      if (v) headers.set(name, v);
    }
    let res: Response;
    try {
      res = await doFetch(url, {
        method: c.req.method,
        headers,
        body,
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
      return c.json({ error: timedOut ? 'Gateway timeout' : 'Gateway unreachable' }, timedOut ? 504 : 502);
    }
    const out = new Headers({ 'cache-control': 'no-store' });
    for (const name of FORWARD_RES) {
      const v = res.headers.get(name);
      if (v) out.set(name, v);
    }
    return new Response(c.req.method === 'HEAD' ? null : res.body, { status: res.status, headers: out });
  }

  // Registered before the passthrough so it answers first; never forwarded to the engine.
  const media = deps.media;
  if (media) {
    app.get('/wa/media-url', async (c) => {
      const auth = await authorise(c);
      if ('error' in auth) return auth.error;
      return mediaUrlResponse(c, media, auth.owner.openwaSessionId);
    });
  }

  app.all('/wa/*', async (c) => {
    const auth = await authorise(c);
    if ('error' in auth) return auth.error;
    const url = new URL(c.req.url);
    const rest = url.pathname.replace(/^\/wa\/?/, '');
    const segments = rest.split('/').map((s) => {
      try {
        return decodeURIComponent(s);
      } catch {
        return '..';
      }
    });
    if (!restPathAllowed(c.req.method, segments, auth.owner.openwaSessionId)) {
      return c.json({ error: 'Not allowed for this key' }, 403);
    }
    const body = await readBody(c);
    if (body === 'too-large') return c.json({ error: 'Request body too large' }, 413);
    const path = segments.map(encodeURIComponent).join('/');
    return forwardBudgeted(
      c,
      `${base}/api/${path}${url.search}`,
      auth.key,
      body,
      auth.owner.openwaSessionId,
      restSendCount(c.req.method, segments, body),
      (d) => restRefused(c, d),
    );
  });

  /** Claude needs a 401 with this pointer to discover the authorization server. */
  function mcpUnauthorized(c: Context) {
    if (deps.oauth) {
      c.header('WWW-Authenticate', `Bearer resource_metadata="${deps.oauth.resourceMetadataUrl}", scope="whatsapp"`);
    }
    return c.json({ error: 'Missing or invalid credentials' }, 401);
  }

  app.all('/mcp', async (c) => {
    if (c.req.method !== 'POST') {
      return c.json({ error: 'Method not allowed: MCP is stateless Streamable HTTP (POST only)' }, 405, {
        Allow: 'POST',
      });
    }
    const presented = extractKey(c);
    const forwardMcp = async (key: string, sessionId: string): Promise<Response> => {
      const body = await readBody(c);
      if (body === 'too-large') return c.json({ error: 'Request body too large' }, 413);
      return forwardBudgeted(c, `${base}/mcp`, key, body, sessionId, mcpSendCount(body), (d) =>
        mcpRefused(c, body, d),
      );
    };
    if (presented && !presented.startsWith('owa_') && deps.oauth) {
      // OAuth access token (Claude connector): opaque, hashed, bound to one grant.
      const t = await deps.oauth.repo.findToken(sha256Hex(presented));
      if (!t || t.kind !== 'access' || t.expiresAt.getTime() < Date.now()) return mcpUnauthorized(c);
      if (await deps.isUserDisabled?.(t.userId)) return c.json({ error: 'This account is disabled' }, 403);
      if (!(await limiter.isAllowed(`grant:${t.grantId}`, limit.limit, limit.windowSeconds))) {
        return c.json({ error: 'Rate limit exceeded' }, 429);
      }
      let engineKey: string;
      try {
        engineKey = deps.oauth.box.open(t.openwaKeyEnc, t.grantId);
      } catch {
        console.error('sealed engine key unreadable for grant', t.grantId);
        return mcpUnauthorized(c);
      }
      void deps.oauth.repo.touchGrant(t.grantId).catch(() => undefined);
      return forwardMcp(engineKey, t.openwaSessionId);
    }
    const auth = await authorise(c);
    if ('error' in auth && auth.error) return auth.error.status === 401 ? mcpUnauthorized(c) : auth.error;
    if (!('key' in auth) || !auth.key) return mcpUnauthorized(c);
    return forwardMcp(auth.key, auth.owner.openwaSessionId);
  });
}
