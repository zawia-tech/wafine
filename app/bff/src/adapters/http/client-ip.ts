/**
 * Client-IP extraction for rate limiting (shared by app.ts and routes/oauth.ts).
 *
 * Prod path: browser -> Vercel /api/bff proxy -> Vercel rewrite project -> Tailscale
 * Funnel -> BFF. Every proxy on that path appends to `x-forwarded-for`, so the client
 * IP sits N entries from the RIGHT, where N is the number of proxies the BFF operator
 * vouches for — the number of entries that ONLY our infrastructure can write. Anything
 * further to the left was sent by the client itself and is trivially forged.
 *
 * Env:
 *   TRUSTED_PROXY_HOPS       how many rightmost x-forwarded-for entries to trust
 *                            (default 1). Each trusted proxy between the client and
 *                            the BFF adds one hop.
 *   TRUST_CF_CONNECTING_IP   only set to 1 if Cloudflare itself (the tunnel ingress,
 *                            not a client-supplied value) is the proxy directly in
 *                            front of the BFF; the header takes precedence when set.
 *
 * Fallback: when no trusted header yields an IP, the request is keyed on a fingerprint
 * of its stable headers (user-agent, accept-language, accept-encoding, the raw
 * forwarded chain). That keeps distinct clients in distinct buckets — unlike the old
 * shared `unknown` bucket, one abuser can no longer lock out everyone else on an
 * unauthenticated route — but the fingerprint is client-spoofable, so a determined
 * attacker can rotate it to side-step the limit. Headerless requests (no UA, no Accept-*
 * and no forwarded chain) share one `unknown` bucket again, same trade-off. Only
 * TRUSTED_PROXY_HOPS fixes attribution; the Vercel rewrite + Funnel hop count must be
 * confirmed against a live request.
 */
import { createHash } from 'node:crypto';

export interface ClientIpConfig {
  /** How many rightmost x-forwarded-for entries only our proxies can write. Default 1. */
  trustedProxyHops: number;
  /** `cf-connecting-ip` is only client-unfixable behind Cloudflare's own ingress. Default false. */
  trustCfConnectingIp: boolean;
}

/**
 * The whole Hono Context fits this shape via `c.req`; do NOT pass a bare Context, whose
 * own `header()` is the response-header setter.
 */
export interface HeaderReader {
  req: { header(name: string): string | undefined | void };
}

/** Coerces a Hono-style header read into a plain string or undefined. */
const str = (value: string | undefined | void): string | undefined =>
  typeof value === 'string' ? value : undefined;

/** Adapts anything exposing `req.header` (Hono Context) into a reader. */
const reader = (c: HeaderReader): ((name: string) => string | undefined) =>
  (name) => str(c.req.header(name));

export function clientIpConfigFromEnv(
  read: (name: string) => string | undefined = (name) => process.env[name],
): ClientIpConfig {
  const raw = Number.parseInt(read('TRUSTED_PROXY_HOPS') ?? '', 10);
  return {
    trustedProxyHops: Number.isInteger(raw) && raw >= 0 ? raw : 1,
    trustCfConnectingIp: read('TRUST_CF_CONNECTING_IP') === '1',
  };
}

export function clientIpFor(c: HeaderReader, config: ClientIpConfig): string {
  const get = reader(c);
  if (config.trustCfConnectingIp) {
    const cf = get('cf-connecting-ip')?.trim();
    if (cf) return cf;
  }
  const xff = get('x-forwarded-for');
  const entries = xff
    ?.split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  // With N trusted proxies each appending one entry, the client IP is the Nth entry
  // from the RIGHT: entries[len - hops]. Everything to its left is client-writable.
  const index = entries ? entries.length - config.trustedProxyHops : -1;
  const fromXff = entries && index >= 0 ? entries[index] : undefined;
  if (fromXff) return fromXff;
  // Nothing trustworthy at hop depth: fingerprint the stable request headers.
  if (!get('user-agent') && !get('accept-language') && !get('accept-encoding') && !xff) {
    return 'unknown';
  }
  return `fp:${fingerprint(c)}`;
}

function fingerprint(c: HeaderReader): string {
  const get = reader(c);
  const chain = [get('user-agent'), get('accept-language'), get('accept-encoding'), get('x-forwarded-for')]
    .map((value) => value ?? '\0')
    .join('\x1f');
  return createHash('sha256').update(chain).digest('base64url').slice(0, 32);
}

/** Per-request key used by every rate limiter. Single copy — imported by app.ts and oauth.ts. */
export function clientIp(c: HeaderReader): string {
  return clientIpFor(c, clientIpConfigFromEnv());
}
