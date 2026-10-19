/**
 * Server-side proxy core for /api/bff/[...path] (docs/05-bff-frontend-plan.md, decision D7).
 *
 * The browser only ever talks to this app's own origin. The route handler forwards the call
 * to the BFF over the network path configured in BFF_URL, which stays server-only: it is read
 * from process.env here, in server code, and is never inlined into a client bundle or echoed
 * in a response. Do not import this module from client components.
 *
 * Trust model: forward an allowlist of request headers rather than strip a denylist, so a
 * header nobody thought of never reaches the BFF. In particular the tenant is NEVER taken
 * from the client: the BFF derives it from the verified Supabase session (sign-up change,
 * #20), and any client-supplied tenant header is dropped here as well.
 */

/** Largest request body we forward. The BFF only takes small JSON bodies today. */
export const MAX_BODY_BYTES = 1024 * 1024;
/** Upstream deadline; Vercel would otherwise hold the function open. */
export const UPSTREAM_TIMEOUT_MS = 15_000;

/**
 * The only upstream path prefixes the browser may reach: `/api/*` (session-authenticated),
 * `/auth/*` (sign-up, login, refresh; rate-limited in the BFF) and `/waitlist` (public, its own
 * per-IP rate limit). `/webhook/*` and `/health/*` stay private.
 */
const ALLOWED_PREFIXES = new Set(['api', 'auth', 'waitlist']);
/** Cookie holding the session; every other cookie on wa.<zone> is dropped before forwarding. */
const SESSION_COOKIE = 'wafine_session';

const METHODS_WITH_BODY = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Request headers forwarded to the BFF. Everything else (host, x-tenant-*, x-forwarded-*, cf-access-*, ...) is dropped. */
const FORWARD_REQUEST_HEADERS = ['authorization', 'content-type', 'accept', 'accept-language', 'x-request-id'];
/** Response headers returned to the browser. Hop-by-hop and server-identifying headers are dropped. */
const FORWARD_RESPONSE_HEADERS = ['content-type', 'cache-control', 'retry-after', 'x-request-id', 'etag'];

export interface ProxyConfig {
  /** BFF base URL; undefined or invalid yields a 503 without ever naming it. */
  bffUrl?: string | undefined;
  /** Cloudflare Access service token pair; both or neither. */
  accessClientId?: string | undefined;
  accessClientSecret?: string | undefined;
  fetchImpl?: typeof fetch;
}

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): ProxyConfig {
  return {
    bffUrl: env['BFF_URL'],
    accessClientId: env['CF_ACCESS_CLIENT_ID'],
    accessClientSecret: env['CF_ACCESS_CLIENT_SECRET'],
  };
}

function json(status: number, error: string, message: string, extra?: HeadersInit): Response {
  return new Response(JSON.stringify({ error, message }), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...extra },
  });
}

/** Validate the catch-all segments and build the upstream URL, or null if the path is not allowed. */
export function buildUpstreamUrl(bffUrl: string, segments: string[], search: string): URL | null {
  if (segments.length === 0 || !ALLOWED_PREFIXES.has(segments[0] ?? '')) return null;
  for (const seg of segments) {
    // Next hands us decoded segments, so an encoded `..` or `/` arrives literally.
    if (seg === '' || seg === '.' || seg === '..' || /[/\\\0]/.test(seg)) return null;
  }
  const base = new URL(bffUrl);
  if (base.protocol !== 'https:' && base.protocol !== 'http:') return null;
  const basePath = base.pathname.replace(/\/+$/, '');
  const url = new URL(base.origin);
  url.pathname = `${basePath}/${segments.map(encodeURIComponent).join('/')}`;
  url.search = search;
  return url;
}

/** Same-origin check for state-changing calls: the session rides in a cookie, so cross-site posts must not pass. */
function crossSite(req: Request): boolean {
  if (!UNSAFE_METHODS.has(req.method)) return false;
  const fetchSite = req.headers.get('sec-fetch-site');
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') return true;
  const origin = req.headers.get('origin');
  if (origin) {
    const host = req.headers.get('host') ?? new URL(req.url).host;
    try {
      if (new URL(origin).host !== host) return true;
    } catch {
      return true;
    }
  }
  return false;
}

function sessionCookie(req: Request): string | null {
  const header = req.headers.get('cookie');
  if (!header) return null;
  const pairs = header
    .split(';')
    .map((p) => p.trim())
    .filter((p) => p.startsWith(`${SESSION_COOKIE}=`));
  return pairs.length ? pairs.join('; ') : null;
}

/** Read at most MAX_BODY_BYTES, counting as the stream arrives so a missing or lying content-length cannot bypass the cap. */
async function readCapped(req: Request): Promise<Uint8Array<ArrayBuffer> | 'too-large'> {
  const declared = Number(req.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return 'too-large';
  if (!req.body) return new Uint8Array();
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => undefined);
      return 'too-large';
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function proxyToBff(req: Request, segments: string[], config: ProxyConfig): Promise<Response> {
  if (!config.bffUrl) {
    return json(503, 'bff_not_configured', 'The backend is not configured for this deployment.');
  }
  let upstream: URL | null;
  try {
    upstream = buildUpstreamUrl(config.bffUrl, segments, new URL(req.url).search);
  } catch {
    return json(503, 'bff_not_configured', 'The backend is not configured for this deployment.');
  }
  if (!upstream) return json(404, 'not_found', 'Unknown API path.');
  if (crossSite(req)) return json(403, 'cross_site', 'Cross-site requests are not allowed.');

  const headers = new Headers();
  for (const name of FORWARD_REQUEST_HEADERS) {
    const value = req.headers.get(name);
    if (value) headers.set(name, value);
  }
  const cookie = sessionCookie(req);
  if (cookie) headers.set('cookie', cookie);
  if (config.accessClientId && config.accessClientSecret) {
    headers.set('cf-access-client-id', config.accessClientId);
    headers.set('cf-access-client-secret', config.accessClientSecret);
  }

  let body: Uint8Array<ArrayBuffer> | undefined;
  if (METHODS_WITH_BODY.has(req.method)) {
    const read = await readCapped(req);
    if (read === 'too-large') {
      return json(413, 'payload_too_large', `Request body exceeds ${MAX_BODY_BYTES} bytes.`);
    }
    if (read.byteLength > 0) body = read;
  }

  let res: Response;
  try {
    res = await (config.fetchImpl ?? fetch)(upstream, {
      method: req.method,
      headers,
      body,
      // A redirect from the upstream is never followed: it would be Cloudflare Access sending us to
      // its login page, and following (or relaying) it would leak the Access team domain.
      redirect: 'manual',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
    return timedOut
      ? json(504, 'bff_timeout', 'The backend took too long to respond.')
      : json(502, 'bff_unreachable', 'The backend is unreachable.');
  }

  if (res.status >= 300 && res.status < 400) {
    await res.body?.cancel().catch(() => undefined);
    return json(502, 'bff_unexpected_redirect', 'The backend answered with a redirect.');
  }

  const out = new Headers({ 'cache-control': 'no-store' });
  for (const name of FORWARD_RESPONSE_HEADERS) {
    const value = res.headers.get(name);
    if (value) out.set(name, value);
  }
  for (const cookieValue of res.headers.getSetCookie()) out.append('set-cookie', cookieValue);

  return new Response(req.method === 'HEAD' ? null : res.body, { status: res.status, headers: out });
}
