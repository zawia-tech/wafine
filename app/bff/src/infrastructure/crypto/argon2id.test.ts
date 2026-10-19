import { describe, it, expect } from 'bun:test';
import { Argon2idKeyDerivationService } from './argon2id.js';

/**
 * Client/server KEK parity.
 *
 * The web client derives the KEK (app/web/src/lib/crypto.ts `deriveKek`) and
 * the BFF unwraps with it, so both derivations must be byte-identical. The
 * vector below was produced by the client's libsodium-wrappers-sumo
 * implementation for these exact inputs and parameters (m=64 MiB, t=3, p=1,
 * v=0x13, salt=BLAKE2b-16(device_secret)). app/web/src/derive-kek.test.ts
 * asserts the same vector, so a drift on either side fails both suites.
 */
const PASSPHRASE = 'test-passphrase';
const DEVICE_SECRET = Uint8Array.from({ length: 32 }, (_, i) => i);
const EXPECTED_KEK_HEX =
  'da4b448797ab195b1d9d7081ce6b9f5546e3296e0fa72db4d504bcc610f1b33b';

describe('Argon2idKeyDerivationService.deriveKek', () => {
  it('matches the client-side test vector', async () => {
    const service = new Argon2idKeyDerivationService();
    const kek = await service.deriveKek(PASSPHRASE, DEVICE_SECRET);

    expect(kek).toBeInstanceOf(Uint8Array);
    expect(kek.length).toBe(32);
    expect(Buffer.from(kek).toString('hex')).toBe(EXPECTED_KEK_HEX);
  });

  it('is deterministic and sensitive to the passphrase', async () => {
    const service = new Argon2idKeyDerivationService();

    const first = await service.deriveKek(PASSPHRASE, DEVICE_SECRET);
    const again = await service.deriveKek(PASSPHRASE, DEVICE_SECRET);
    const other = await service.deriveKek('other-passphrase', DEVICE_SECRET);

    expect(Buffer.from(first).equals(Buffer.from(again))).toBe(true);
    expect(Buffer.from(first).equals(Buffer.from(other))).toBe(false);
  });
});
