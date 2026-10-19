/**
 * Blind index service — deterministic, keyed, per-tenant.
 * Uses HMAC-SHA256 with a per-column key derived via HKDF.
 */

import { createHmac } from 'node:crypto';
import type { IBlindIndexService } from '../../domain/ports/index.js';

export class HmacBlindIndexService implements IBlindIndexService {
  /**
   * Compute a deterministic blind index.
   * blind_index = HMAC-SHA256(HKDF(IK, "idx/<col>/v1"), normalize(value))[:16]
   */
  computeIndex(value: string, key: Uint8Array, context: string): Uint8Array {
    // Derive a per-column key using HKDF-SHA256
    const columnKey = this.deriveColumnKey(key, context);

    // HMAC-SHA256 with the column key
    const hmac = createHmac('sha256', columnKey);
    hmac.update(value);
    const full = hmac.digest();

    // Truncate to 128 bits (16 bytes)
    return new Uint8Array(full.subarray(0, 16));
  }

  /**
   * Normalize a value before indexing.
   * - Unicode NFC normalization
   * - Trim whitespace
   * - Lowercase
   * - Strip punctuation for phone numbers
   */
  normalize(value: string): string {
    let normalized = value.normalize('NFC').trim().toLowerCase();

    // If it looks like a phone number (starts with + or digits), strip non-digit/non-plus chars
    if (/^\+?\d/.test(normalized)) {
      normalized = normalized.replace(/[^\d+]/g, '');
    }

    return normalized;
  }

  /**
   * Derive a column-specific key from the tenant's blind index key.
   * Uses HKDF-SHA256 (RFC 5869).
   */
  private deriveColumnKey(ik: Uint8Array, context: string): Buffer {
    // HKDF extract
    const prk = createHmac('sha256', Buffer.from('waasel-blind-index-v1'));
    prk.update(ik);
    const prkBuffer = prk.digest();

    // HKDF expand
    const info = Buffer.from(context, 'utf-8');
    const okm = createHmac('sha256', prkBuffer);
    okm.update(info);
    okm.update(Buffer.from([1])); // counter = 1
    return okm.digest();
  }
}
