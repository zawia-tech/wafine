/**
 * OpenWA webhook signature verifier (HMAC-SHA256 over the raw body).
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { IWebhookVerifier } from '../../domain/ports/index.js';

export class HmacWebhookVerifier implements IWebhookVerifier {
  constructor(private readonly secret: string) {}

  verify(rawBody: Uint8Array, signature: string | undefined): boolean {
    if (!this.secret || !signature) return false;
    const expected = `sha256=${createHmac('sha256', this.secret).update(rawBody).digest('hex')}`;
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }
}
