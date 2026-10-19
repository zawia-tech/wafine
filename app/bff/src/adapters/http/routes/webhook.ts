/**
 * OpenWA webhook ingress — `POST /webhook/openwa`.
 * Verifies the HMAC over the raw body before parsing, drops replays, and hands
 * `message.received` events to the workflow engine. Replies are sent after the 2xx.
 */

import type { Hono } from 'hono';
import { z } from 'zod';
import type { IIdempotencyStore, IWebhookVerifier } from '../../../domain/ports/index.js';
import type { WorkflowEngine } from '../../../domain/workflows/engine.js';

const MAX_BODY_BYTES = 256 * 1024;
const REPLAY_WINDOW_MS = 60 * 60 * 1000;

async function readBodyCapped(req: Request, maxBytes: number): Promise<Uint8Array | null> {
  const declared = Number(req.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) return null;

  const stream = req.body;
  if (!stream) return new Uint8Array(0);

  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const raw = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    raw.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return raw;
}

const envelopeSchema = z.object({
  event: z.string(),
  sessionId: z.string().min(1),
  idempotencyKey: z.string().optional(),
  data: z.unknown(),
});

const messageSchema = z.object({
  chatId: z.string(),
  body: z.string().default(''),
  type: z.string().default(''),
  fromMe: z.boolean().default(false),
  isGroup: z.boolean().default(false),
  isStatusBroadcast: z.boolean().optional(),
});

export interface WebhookRouteDeps {
  verifier: IWebhookVerifier;
  engine: WorkflowEngine;
  replayGuard: IIdempotencyStore;
}

export function registerWebhookRoutes(app: Hono, deps: WebhookRouteDeps): void {
  app.post('/webhook/openwa', async (c) => {
    const raw = await readBodyCapped(c.req.raw, MAX_BODY_BYTES);
    if (!raw) return c.json({ error: 'Payload too large' }, 413);

    if (!deps.verifier.verify(raw, c.req.header('X-OpenWA-Signature'))) {
      return c.json({ error: 'Invalid signature' }, 401);
    }

    let envelope: z.infer<typeof envelopeSchema>;
    try {
      envelope = envelopeSchema.parse(JSON.parse(new TextDecoder().decode(raw)));
    } catch {
      return c.json({ error: 'Malformed payload' }, 400);
    }

    if (envelope.event !== 'message.received') {
      return c.json({ ok: true, ignored: 'not_message_event' });
    }

    const message = messageSchema.safeParse(envelope.data);
    if (!message.success) return c.json({ error: 'Malformed message' }, 400);

    const replayKey = c.req.header('X-OpenWA-Idempotency-Key') ?? envelope.idempotencyKey;
    if (replayKey && !(await deps.replayGuard.claim(replayKey, REPLAY_WINDOW_MS))) {
      return c.json({ ok: true, ignored: 'duplicate' });
    }

    try {
      const decision = await deps.engine.handle({
        sessionId: envelope.sessionId,
        chatId: message.data.chatId,
        body: message.data.body,
        type: message.data.type,
        fromMe: message.data.fromMe,
        isGroup: message.data.isGroup,
        isStatusBroadcast: message.data.isStatusBroadcast ?? message.data.chatId.endsWith('@broadcast'),
      });
      if (decision.status === 'ignored') return c.json({ ok: true, ignored: decision.reason });
      return c.json({ ok: true, queued: decision.ruleId });
    } catch (err) {
      // Let OpenWA's retry deliver it again.
      if (replayKey) await deps.replayGuard.release(replayKey);
      throw err;
    }
  });
}
