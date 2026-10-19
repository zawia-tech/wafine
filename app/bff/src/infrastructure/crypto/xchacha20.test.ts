import { describe, it, expect } from 'bun:test';
import { XChaCha20Poly1305Service } from './xchacha20.js';

describe('XChaCha20Poly1305Service', () => {
  it('round-trips a message with AAD binding', async () => {
    const service = new XChaCha20Poly1305Service();
    const dek = await service.generateDek();
    const aad = new TextEncoder().encode('tenant|messages|row-1|1|1');
    const plaintext = new TextEncoder().encode('hello e2e');

    const payload = await service.encrypt(plaintext, dek, aad);
    expect(payload.algId).toBe('xchacha20poly1305');
    expect(payload.ciphertext.length).toBe(plaintext.length + 16);

    const decrypted = await service.decrypt(payload, dek, aad);
    expect(new TextDecoder().decode(decrypted)).toBe('hello e2e');
  });

  it('rejects decryption when the AAD does not match', async () => {
    const service = new XChaCha20Poly1305Service();
    const dek = await service.generateDek();
    const payload = await service.encrypt(
      new TextEncoder().encode('secret'),
      dek,
      new TextEncoder().encode('aad-a'),
    );

    await expect(
      service.decrypt(payload, dek, new TextEncoder().encode('aad-b')),
    ).rejects.toThrow(/Decryption failed/);
  });

  it('wraps and unwraps a DEK with the tenant KEK', async () => {
    const service = new XChaCha20Poly1305Service();
    const dek = await service.generateDek();
    const kek = await service.generateDek();

    const wrapped = await service.wrapDek(dek, kek);
    expect(wrapped.version).toBe(1);

    const unwrapped = await service.unwrapDek(wrapped, kek);
    expect(Buffer.from(unwrapped).equals(Buffer.from(dek))).toBe(true);
  });

  it('refuses a DEK that is not 32 bytes', async () => {
    const service = new XChaCha20Poly1305Service();
    await expect(
      service.encrypt(new Uint8Array([1]), new Uint8Array(16), new Uint8Array()),
    ).rejects.toThrow(/DEK must be 32 bytes/);
  });

  it('rejects wrong-length nonces and KEKs', async () => {
    const service = new XChaCha20Poly1305Service();
    const dek = await service.generateDek();
    const aad = new TextEncoder().encode('aad');
    const payload = await service.encrypt(new TextEncoder().encode('x'), dek, aad);
    await expect(service.decrypt({ ...payload, nonce: payload.nonce.subarray(0, 12) }, dek, aad)).rejects.toThrow('nonce must be 24 bytes');
    await expect(service.wrapDek(dek, new Uint8Array(16))).rejects.toThrow('KEK must be 32 bytes');
    const wrapped = await service.wrapDek(dek, dek);
    await expect(service.unwrapDek({ ...wrapped, nonce: new Uint8Array(8) }, dek)).rejects.toThrow('nonce must be 24 bytes');
  });
});
