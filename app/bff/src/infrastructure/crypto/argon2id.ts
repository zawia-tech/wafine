/**
 * Argon2id key derivation service.
 * Derives KEK from passphrase + device_secret (1Password pattern).
 *
 * In production, this runs in a Web Worker on the client.
 * The BFF only needs it for server-side verification (e.g., recovery).
 */

import { argon2id, hash as argon2Hash } from 'argon2';
import sodium from 'libsodium-wrappers';
import type { IKeyDerivationService } from '../../domain/ports/index.js';

/** crypto_pwhash_SALTBYTES — the minimal libsodium build strips the constant. */
const SALT_BYTES = 16;

export class Argon2idKeyDerivationService implements IKeyDerivationService {
  private memoryKb: number;
  private iterations: number;
  private parallelism: number;

  constructor(memoryKb = 65536, iterations = 3, parallelism = 1) {
    this.memoryKb = memoryKb;
    this.iterations = iterations;
    this.parallelism = parallelism;
  }

  /**
   * Derive KEK from passphrase + device_secret.
   * KEK = Argon2id(passphrase || device_secret, salt=BLAKE2b-16(device_secret))
   *
   * Must stay byte-identical to app/web/src/lib/crypto.ts `deriveKek`: the
   * client derives the KEK and the BFF unwraps with it, so the salt derivation
   * and Argon2id parameters (m=64 MiB, t=3, p=1, v=0x13) are pinned by the
   * shared test vector in argon2id.test.ts.
   */
  async deriveKek(passphrase: string, deviceSecret: Uint8Array): Promise<Uint8Array> {
    const input = new Uint8Array([...new TextEncoder().encode(passphrase), ...deviceSecret]);

    // libsodium rejects any salt that is not exactly 16 bytes, so neither side
    // can pass the 32-byte device secret itself.
    await sodium.ready;
    const salt = sodium.crypto_generichash(SALT_BYTES, deviceSecret, null);

    const hash = await argon2Hash(Buffer.from(input), {
      raw: true,
      salt: Buffer.from(salt),
      memoryCost: this.memoryKb,
      timeCost: this.iterations,
      parallelism: this.parallelism,
      hashLength: 32,
      type: argon2id, // Argon2Type.argon2id = 2
    });

    return new Uint8Array(hash);
  }

  /**
   * Generate a random device secret (32 bytes).
   */
  generateDeviceSecret(): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(32));
  }

  /**
   * Generate a random recovery mnemonic (256-bit entropy → 24 BIP39 words).
   * This is a placeholder — real implementation needs a BIP39 wordlist.
   */
  generateRecoveryMnemonic(): string {
    const entropy = crypto.getRandomValues(new Uint8Array(32));
    // TODO: Replace with proper BIP39 encoding
    // For now, return hex as a placeholder
    return Array.from(entropy)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
}
