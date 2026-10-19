import { describe, it, expect } from 'bun:test';
import { createHmac } from 'node:crypto';
import { HmacWebhookVerifier } from './webhook-verifier.js';

describe('HmacWebhookVerifier', () => {
  const secret = 'super-secret-value';
  const verifier = new HmacWebhookVerifier(secret);
  const body = new TextEncoder().encode('{"event":"message.received"}');
  const signature = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

  it('accepts a valid signature', () => {
    expect(verifier.verify(body, signature)).toBe(true);
  });

  it('rejects a tampered body', () => {
    expect(verifier.verify(new TextEncoder().encode('{}'), signature)).toBe(false);
  });

  it('rejects a missing signature', () => {
    expect(verifier.verify(body, undefined)).toBe(false);
  });
});
