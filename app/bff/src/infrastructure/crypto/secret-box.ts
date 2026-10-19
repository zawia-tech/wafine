/**
 * AES-256-GCM sealing for secrets the BFF must hold in plaintext form later (the per-connection
 * OpenWA keys behind OAuth grants). Format: v1.<iv>.<tag>.<ciphertext>, base64url parts.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const IV_BYTES = 12;
const TAG_BYTES = 16;

export class SecretBox {
  private readonly key: Buffer;

  constructor(base64Key: string) {
    const key = Buffer.from(base64Key, 'base64');
    if (key.length !== 32) throw new Error('OAUTH_ENC_KEY must be 32 bytes, base64-encoded');
    this.key = key;
  }

  seal(plaintext: string, aad: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv, { authTagLength: TAG_BYTES });
    cipher.setAAD(Buffer.from(aad, 'utf8'));
    const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return ['v1', iv, cipher.getAuthTag(), ct].map((p) => (typeof p === 'string' ? p : p.toString('base64url'))).join('.');
  }

  /** Throws if the box was tampered with, sealed under another key, or bound to another `aad`. */
  open(sealed: string, aad: string): string {
    const [v, iv, tag, ct] = sealed.split('.');
    if (v !== 'v1' || !iv || !tag || ct === undefined) throw new Error('unsupported sealed secret');
    const ivBytes = Buffer.from(iv, 'base64url');
    const tagBytes = Buffer.from(tag, 'base64url');
    // A full-length tag is required: GCM otherwise accepts truncated tags, which weakens forgery resistance.
    if (ivBytes.length !== IV_BYTES || tagBytes.length !== TAG_BYTES) throw new Error('unsupported sealed secret');
    const decipher = createDecipheriv('aes-256-gcm', this.key, ivBytes, { authTagLength: TAG_BYTES });
    decipher.setAAD(Buffer.from(aad, 'utf8'));
    decipher.setAuthTag(tagBytes);
    return Buffer.concat([decipher.update(Buffer.from(ct, 'base64url')), decipher.final()]).toString('utf8');
  }
}
