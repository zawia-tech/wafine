/**
 * XChaCha20-Poly1305 crypto service — domain layer implementation.
 * Uses libsodium-wrappers for the AEAD construction.
 *
 * This is the ONLY place that touches libsodium directly.
 * All other code goes through the ICryptoService port.
 */

import sodium from 'libsodium-wrappers';
import type { EncryptedPayload, WrappedKey, ICryptoService } from '../../domain/ports/index.js';

// libsodium constants
const XCHACHA20POLY1305_IETF_KEYBYTES = 32;
const XCHACHA20POLY1305_IETF_NPUBBYTES = 24;

function assertLength(name: string, value: Uint8Array, expected: number): void {
  if (value.length !== expected) throw new Error(`${name} must be ${expected} bytes, got ${value.length}`);
}

export class XChaCha20Poly1305Service implements ICryptoService {
  private initialized = false;

  async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await sodium.ready;
      this.initialized = true;
    }
  }

  async encrypt(
    plaintext: Uint8Array,
    dek: Uint8Array,
    aad: Uint8Array,
  ): Promise<EncryptedPayload> {
    await this.ensureInitialized();

    if (dek.length !== XCHACHA20POLY1305_IETF_KEYBYTES) {
      throw new Error(`DEK must be ${XCHACHA20POLY1305_IETF_KEYBYTES} bytes, got ${dek.length}`);
    }

    // Generate a random 192-bit nonce — no counter state, no reuse footgun
    const nonce = sodium.randombytes_buf(XCHACHA20POLY1305_IETF_NPUBBYTES);

    const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
      plaintext,
      aad,
      null, // additional data (we use AAD parameter)
      nonce,
      dek,
    );

    return {
      ciphertext: new Uint8Array(ciphertext),
      nonce: new Uint8Array(nonce),
      version: 1,
      algId: 'xchacha20poly1305',
    };
  }

  async decrypt(
    payload: EncryptedPayload,
    dek: Uint8Array,
    aad: Uint8Array,
  ): Promise<Uint8Array> {
    await this.ensureInitialized();

    if (dek.length !== XCHACHA20POLY1305_IETF_KEYBYTES) {
      throw new Error(`DEK must be ${XCHACHA20POLY1305_IETF_KEYBYTES} bytes, got ${dek.length}`);
    }

    assertLength('nonce', payload.nonce, XCHACHA20POLY1305_IETF_NPUBBYTES);

    try {
      const plaintext = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
        null, // secret nonce (not used)
        payload.ciphertext,
        aad,
        payload.nonce,
        dek,
      );
      return new Uint8Array(plaintext);
    } catch (err) {
      throw new Error(`Decryption failed: ${err instanceof Error ? err.message : 'unknown'}`, { cause: err });
    }
  }

  async generateDek(): Promise<Uint8Array> {
    await this.ensureInitialized();
    return new Uint8Array(sodium.randombytes_buf(XCHACHA20POLY1305_IETF_KEYBYTES));
  }

  async wrapDek(dek: Uint8Array, kek: Uint8Array): Promise<WrappedKey> {
    await this.ensureInitialized();
    assertLength('DEK', dek, XCHACHA20POLY1305_IETF_KEYBYTES);
    assertLength('KEK', kek, XCHACHA20POLY1305_IETF_KEYBYTES);

    // Use XChaCha20-Poly1305 for key wrapping too — same primitive, random nonce
    const nonce = sodium.randombytes_buf(XCHACHA20POLY1305_IETF_NPUBBYTES);
    const wrapped = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
      dek,
      null, // no AAD for key wrapping
      null,
      nonce,
      kek,
    );

    return {
      wrappedKey: new Uint8Array(wrapped),
      nonce: new Uint8Array(nonce),
      version: 1,
      algId: 'xchacha20poly1305',
    };
  }

  async unwrapDek(wrapped: WrappedKey, kek: Uint8Array): Promise<Uint8Array> {
    await this.ensureInitialized();
    assertLength('KEK', kek, XCHACHA20POLY1305_IETF_KEYBYTES);
    assertLength('nonce', wrapped.nonce, XCHACHA20POLY1305_IETF_NPUBBYTES);

    try {
      const dek = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
        null,
        wrapped.wrappedKey,
        null,
        wrapped.nonce,
        kek,
      );
      return new Uint8Array(dek);
    } catch (err) {
      throw new Error(`Key unwrap failed: ${err instanceof Error ? err.message : 'unknown'}`, { cause: err });
    }
  }
}
