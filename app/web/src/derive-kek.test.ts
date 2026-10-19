import { describe, it, expect } from 'bun:test';
import { deriveKek, generateDeviceSecret, zeroize } from './lib/crypto';

/**
 * Regression: `crypto_pwhash` (Argon2id) exists only in the libsodium *-sumo*
 * build. With plain `libsodium-wrappers` it is undefined and `deriveKek`
 * throws — device enrollment is broken, not just this test. Importing
 * `./lib/crypto` therefore pins the sumo build on the enrollment path.
 */
describe('deriveKek', () => {
  it('derives a 32-byte KEK via Argon2id', async () => {
    const deviceSecret = generateDeviceSecret();
    const kek = await deriveKek('correct horse battery staple', deviceSecret);

    expect(kek).toBeInstanceOf(Uint8Array);
    expect(kek.length).toBe(32);
    expect(kek.some((b) => b !== 0)).toBe(true);
  });

  it('matches the BFF test vector (app/bff/src/infrastructure/crypto/argon2id.test.ts)', async () => {
    // Same inputs as the BFF's argon2id.test.ts: the client derives the KEK
    // and the BFF unwraps with it, so both implementations must produce these
    // exact bytes (m=64 MiB, t=3, p=1, salt=BLAKE2b-16(device_secret)).
    const deviceSecret = Uint8Array.from({ length: 32 }, (_, i) => i);
    const kek = await deriveKek('test-passphrase', deviceSecret);

    expect(Buffer.from(kek).toString('hex')).toBe(
      'da4b448797ab195b1d9d7081ce6b9f5546e3296e0fa72db4d504bcc610f1b33b',
    );
  });

  it('is deterministic for the same passphrase and device secret', async () => {
    const deviceSecret = generateDeviceSecret();
    const params: [string, Uint8Array, number, number, number] = [
      'pw',
      deviceSecret,
      65536,
      3,
      1,
    ];

    const first = await deriveKek(...params);
    const second = await deriveKek(...params);

    expect(first).toEqual(second);

    zeroize(first);
    zeroize(second);
    expect(first.every((b) => b === 0)).toBe(true);
  }, { timeout: 20000 });
});
