/**
 * `/api/wa/*` — the signed-in user's own WhatsApp session and API keys.
 *
 * Mounted behind the Supabase auth middleware. Every call is scoped to `auth.userId`;
 * a user can never name another user's OpenWA session or key.
 */

import { createHash } from 'node:crypto';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type {
  IAccountsRepository,
  IOAuthRepository,
  IWaTenancyRepository,
  IWhatsAppGateway,
  OpenWaSession,
} from '../../../domain/ports/index.js';
import { OpenWaApiError } from '../../../infrastructure/gateway/openwa-http-client.js';
import { mediaUrlResponse, type MediaUrlDeps } from './media-url.js';

/** Most active keys a user may hold at once. */
export const MAX_ACTIVE_KEYS = 5;

export interface WaRouteDeps {
  gateway: IWhatsAppGateway;
  tenancy: IWaTenancyRepository;
  accounts: IAccountsRepository;
  /** Public BFF origin shown to users for REST and MCP, e.g. https://api.<your-domain> */
  publicApiUrl: string;
  /** OAuth connections hold their own engine keys; deleting the session revokes them too. */
  oauth?: IOAuthRepository;
  /** Presigned links to archived media. Absent = the route is not mounted. */
  media?: MediaUrlDeps;
}

export const sha256Hex = (value: string) => createHash('sha256').update(value).digest('hex');

const digits = (phone: string) => phone.replace(/\D/g, '');

function sessionView(s: OpenWaSession) {
  return { id: s.id, name: s.name, status: s.status, phone: s.phone, lastError: s.lastError };
}

/** Gateway errors never leak upstream bodies: 404 stays 404, the rest become 502. */
function gatewayError(err: unknown): never {
  if (err instanceof HTTPException) throw err;
  if (err instanceof OpenWaApiError) {
    if (err.status === 404) throw new HTTPException(404, { message: 'WhatsApp session not found.' });
    console.error('gateway call failed', err.status, err.message);
    throw new HTTPException(502, { message: 'The WhatsApp gateway rejected the request. Try again.' });
  }
  throw err;
}

const isStatus = (err: unknown, status: number) => err instanceof OpenWaApiError && err.status === status;

export function waRoutes({ gateway, tenancy, accounts, publicApiUrl, oauth, media }: WaRouteDeps): Hono {
  const r = new Hono();
  const base = publicApiUrl.replace(/\/$/, '');

  async function ownSession(userId: string) {
    const rec = await tenancy.getSession(userId);
    if (!rec) throw new HTTPException(404, { message: 'Create a WhatsApp session first.' });
    return rec;
  }

  r.get('/connect-info', (c) =>
    c.json({ restBase: `${base}/wa`, mcpUrl: `${base}/mcp`, authHeader: 'X-API-Key' }),
  );

  // ── Read views: session id always comes from the caller's tenancy mapping. ──
  r.get('/chats', async (c) => {
    const limit = Number(c.req.query('limit') ?? 100);
    const offset = Number(c.req.query('offset') ?? 0);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0) {
      throw new HTTPException(400, { message: 'Invalid chat pagination.' });
    }
    const rec = await ownSession(c.get('auth').userId);
    return c.json({ chats: await gateway.listChats(rec.openwaSessionId, { limit, offset }).catch(gatewayError) });
  });

  r.get('/messages', async (c) => {
    const chatId = c.req.query('chatId')?.trim();
    const limit = Number(c.req.query('limit') ?? 50);
    const offset = Number(c.req.query('offset') ?? 0);
    if (!chatId || chatId.length > 512 || !Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0) {
      throw new HTTPException(400, { message: 'Invalid message query.' });
    }
    const rec = await ownSession(c.get('auth').userId);
    return c.json({
      messages: await gateway
        .listMessages(rec.openwaSessionId, { chatId, limit, offset, inlineMedia: false })
        .catch(gatewayError),
    });
  });

  // ── Media: short-lived link to an archived file of the caller's own session ──
  if (media) {
    r.get('/media-url', async (c) =>
      mediaUrlResponse(c, media, (await ownSession(c.get('auth').userId)).openwaSessionId),
    );
  }

  // ── Session ────────────────────────────────────────────────
  r.get('/session', async (c) => {
    const { userId } = c.get('auth');
    const rec = await tenancy.getSession(userId);
    if (!rec) return c.json({ session: null });
    let s: OpenWaSession;
    try {
      s = await gateway.getSession(rec.openwaSessionId);
    } catch (err) {
      if (isStatus(err, 404)) {
        // Gone on the gateway (deleted by an operator): forget the stale mapping.
        await tenancy.deleteSession(userId);
        return c.json({ session: null });
      }
      return gatewayError(err);
    }
    if (s.status === 'ready' && s.phone) {
      const profile = await accounts.findProfileByUserId(userId);
      if (profile && digits(profile.phoneE164) !== digits(s.phone)) {
        // Only the invited number may be linked to this account.
        await gateway.logoutSession(s.id).catch((err) => console.error('mismatch logout failed', err));
        return c.json({
          session: { ...sessionView(s), status: 'phone_mismatch', phone: null },
          error: `This account is invited for ${profile.phoneE164}. Scan the QR with that WhatsApp number.`,
        });
      }
    }
    return c.json({ session: sessionView(s) });
  });

  r.post('/session', async (c) => {
    const { userId } = c.get('auth');
    if (await tenancy.getSession(userId)) {
      throw new HTTPException(409, { message: 'You already have a WhatsApp session.' });
    }
    if (!(await accounts.findProfileByUserId(userId))) {
      throw new HTTPException(403, { message: 'Your account has no invited number.' });
    }
    const name = `u-${userId}`;
    let s: OpenWaSession;
    try {
      s = await gateway.createSession({ name });
    } catch (err) {
      if (!isStatus(err, 409)) return gatewayError(err);
      // A session with our deterministic name already exists (earlier half-finished create).
      const existing = (await gateway.listSessions().catch(gatewayError)).find((x) => x.name === name);
      if (!existing) return gatewayError(err);
      s = existing;
    }
    if (!(await tenancy.createSession({ userId, openwaSessionId: s.id, name }))) {
      throw new HTTPException(409, { message: 'You already have a WhatsApp session.' });
    }
    try {
      s = await gateway.startSession(s.id);
    } catch (err) {
      if (!isStatus(err, 400)) return gatewayError(err); // 400 = already started
    }
    return c.json({ session: sessionView(s) }, 201);
  });

  r.post('/session/start', async (c) => {
    const rec = await ownSession(c.get('auth').userId);
    try {
      return c.json({ session: sessionView(await gateway.startSession(rec.openwaSessionId)) });
    } catch (err) {
      if (!isStatus(err, 400)) return gatewayError(err);
      return c.json({ session: sessionView(await gateway.getSession(rec.openwaSessionId).catch(gatewayError)) });
    }
  });

  r.get('/session/qr', async (c) => {
    const rec = await ownSession(c.get('auth').userId);
    try {
      const qr = await gateway.getQr(rec.openwaSessionId);
      return c.json({ qrCode: qr.qrCode, status: qr.status });
    } catch (err) {
      // 400: not started yet, QR not ready yet, or already linked. The client keeps polling.
      if (!isStatus(err, 400)) return gatewayError(err);
      const s = await gateway.getSession(rec.openwaSessionId).catch(gatewayError);
      return c.json({ qrCode: null, status: s.status });
    }
  });

  r.post('/session/logout', async (c) => {
    const rec = await ownSession(c.get('auth').userId);
    await gateway.logoutSession(rec.openwaSessionId).catch(gatewayError);
    return c.json({ ok: true });
  });

  r.delete('/session', async (c) => {
    const { userId } = c.get('auth');
    const rec = await ownSession(userId);
    for (const k of await tenancy.listKeys(userId)) {
      if (!k.revokedAt) await gateway.revokeApiKey(k.id).catch((err) => console.error('revoke failed', k.id, err));
    }
    for (const keyId of (await oauth?.activeGrantKeyIds(userId)) ?? []) {
      await gateway.revokeApiKey(keyId).catch((err) => console.error('revoke failed', keyId, err));
    }
    try {
      await gateway.deleteSession(rec.openwaSessionId);
    } catch (err) {
      if (!isStatus(err, 404)) return gatewayError(err);
    }
    await tenancy.deleteSession(userId);
    return c.body(null, 204);
  });

  // ── API keys ───────────────────────────────────────────────
  r.get('/keys', async (c) => c.json({ keys: await tenancy.listKeys(c.get('auth').userId) }));

  r.post('/keys', async (c) => {
    const { userId } = c.get('auth');
    const rec = await ownSession(userId);
    const active = (await tenancy.listKeys(userId)).filter((k) => !k.revokedAt);
    if (active.length >= MAX_ACTIVE_KEYS) {
      throw new HTTPException(409, { message: `Revoke a key first (at most ${MAX_ACTIVE_KEYS} active keys).` });
    }
    const created = await gateway
      .createApiKey({
        name: `user-${userId.slice(0, 8)}-${Date.now()}`,
        role: 'operator',
        allowedSessions: [rec.openwaSessionId],
      })
      .catch(gatewayError);
    try {
      await tenancy.addKey({ id: created.id, userId, keyPrefix: created.keyPrefix, keyHash: sha256Hex(created.apiKey) });
    } catch (err) {
      await gateway.revokeApiKey(created.id).catch(() => undefined);
      throw err;
    }
    return c.json(
      {
        id: created.id,
        keyPrefix: created.keyPrefix,
        apiKey: created.apiKey,
        restBase: `${base}/wa`,
        mcpUrl: `${base}/mcp`,
        sessionId: rec.openwaSessionId,
      },
      201,
    );
  });

  r.delete('/keys/:id', async (c) => {
    const { userId } = c.get('auth');
    const id = c.req.param('id');
    if (!(await tenancy.revokeKey(userId, id))) throw new HTTPException(404, { message: 'Key not found.' });
    await gateway.revokeApiKey(id).catch((err) => console.error('gateway revoke failed', id, err));
    return c.body(null, 204);
  });

  return r;
}
