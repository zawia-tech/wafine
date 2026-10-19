/**
 * Short-lived read links for archived chat media: `GET /api/wa/media-url` (Supabase session) and
 * `GET /wa/media-url` (user API key), both `?path=<mediaPath>`.
 *
 * The media bucket is private: no public hostname, no r2.dev URL, no Cloudflare Access. Message
 * lists from the engine carry `mediaPath` (`chat-media/<sessionId>/<file>`); once the caller is
 * authenticated the BFF signs a GET for that key, and only inside the caller's own session prefix.
 * A link to a missing object (retention purge, or a file the engine kept on its local fallback during
 * an R2 outage) answers 404 at R2; the engine route `sessions/<own>/messages/<chat>/<msg>/media`
 * still serves the bytes in that case.
 */

import type { Context } from 'hono';
import type { IMediaUrlSigner } from '../../../domain/ports/index.js';

export interface MediaUrlDeps {
  signer: IMediaUrlSigner;
  /** Link lifetime in seconds, clamped to [60, 3600]. */
  ttlSeconds: number;
}

/** The archive's file name: `<uuid>.<ext>`, the extension derived from the mimetype (`bin` if unknown). */
const ARCHIVE_FILE = /^[0-9A-Za-z-]{1,64}\.[a-z0-9]{1,32}$/;

/** The key and its session when `path` is shaped like an archive key, else null. */
export function parseArchiveKey(path: string | undefined): { key: string; sessionId: string } | null {
  const parts = (path ?? '').split('/');
  if (parts.length !== 3) return null;
  const [root, sessionId, file] = parts as [string, string, string];
  if (root !== 'chat-media' || !/^[0-9A-Za-z-]{1,64}$/.test(sessionId) || !ARCHIVE_FILE.test(file)) {
    return null;
  }
  return { key: parts.join('/'), sessionId };
}

export function clampTtl(seconds: number): number {
  return Math.min(Math.max(Number.isFinite(seconds) ? Math.trunc(seconds) : 300, 60), 3600);
}

export async function mediaUrlResponse(c: Context, deps: MediaUrlDeps, ownSessionId: string): Promise<Response> {
  const key = parseArchiveKey(c.req.query('path'));
  if (!key) return c.json({ error: 'path must be a chat-media storage key (a message mediaPath)' }, 400);
  if (key.sessionId !== ownSessionId) return c.json({ error: 'Not allowed for this session' }, 403);
  const ttl = clampTtl(deps.ttlSeconds);
  const url = await deps.signer.presignGet(key.key, ttl);
  c.header('cache-control', 'no-store');
  return c.json({ url, expiresAt: new Date(Date.now() + ttl * 1000).toISOString() });
}
