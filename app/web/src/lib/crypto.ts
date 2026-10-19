/**
 * Client-side crypto — XChaCha20-Poly1305 + Argon2id via libsodium-wrappers-sumo.
 * Runs in the browser; keys never leave the client.
 *
 * The *-sumo build is required: `crypto_pwhash` (Argon2id) exists only in sumo.
 * The minimal `libsodium-wrappers` build leaves it undefined, so `deriveKek`
 * throws and device enrollment cannot complete. Tradeoff: sumo is a larger
 * bundle than the minimal build. If that ever becomes a constraint,
 * `@noble/hashes` offers an audited pure-JS argon2id — a separate change with
 * its own review.
 */

import sodium from 'libsodium-wrappers-sumo';

let initialized = false;

async function ensureInitialized(): Promise<void> {
  if (!initialized) {
    await sodium.ready;
    initialized = true;
  }
}

/**
 * Encrypt plaintext with a DEK.
 * Returns { ciphertext, nonce } — the caller is responsible for storing both.
 */
export async function encrypt(
  plaintext: Uint8Array,
  dek: Uint8Array,
  aad?: Uint8Array,
): Promise<{ ciphertext: Uint8Array; nonce: Uint8Array }> {
  await ensureInitialized();

  const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
  const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    plaintext,
    aad ?? null,
    null,
    nonce,
    dek,
  );

  return {
    ciphertext: new Uint8Array(ciphertext),
    nonce: new Uint8Array(nonce),
  };
}

/**
 * Decrypt ciphertext with a DEK.
 */
export async function decrypt(
  ciphertext: Uint8Array,
  nonce: Uint8Array,
  dek: Uint8Array,
  aad?: Uint8Array,
): Promise<Uint8Array> {
  await ensureInitialized();

  const plaintext = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
    null,
    ciphertext,
    aad ?? null,
    nonce,
    dek,
  );

  return new Uint8Array(plaintext);
}

/**
 * Generate a random DEK (32 bytes).
 */
export async function generateDek(): Promise<Uint8Array> {
  await ensureInitialized();
  return new Uint8Array(sodium.randombytes_buf(32));
}

/**
 * Derive KEK from passphrase + device_secret using Argon2id.
 * This should run in a Web Worker to avoid blocking the UI.
 */
export async function deriveKek(
  passphrase: string,
  deviceSecret: Uint8Array,
  memoryKb = 65536,
  iterations = 3,
  parallelism = 1,
): Promise<Uint8Array> {
  await ensureInitialized();

  const input = new Uint8Array([...new TextEncoder().encode(passphrase), ...deviceSecret]);

  // libsodium's argon2id wrapper requires the salt to be exactly
  // crypto_pwhash_SALTBYTES (16) bytes, so derive it from the 32-byte device
  // secret rather than passing the secret itself as the salt.
  const salt = sodium.crypto_generichash(
    sodium.crypto_pwhash_SALTBYTES,
    deviceSecret,
    null,
  );

  const hash = sodium.crypto_pwhash(
    32,
    input,
    salt,
    iterations,
    memoryKb * 1024, // memlimit in bytes
    sodium.crypto_pwhash_ALG_ARGON2ID13,
  );

  return new Uint8Array(hash);
}

/**
 * Generate a random device secret (32 bytes).
 */
export function generateDeviceSecret(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

/**
 * Zeroize a buffer by overwriting with zeros.
 */
export function zeroize(buf: Uint8Array): void {
  if (buf && buf.length > 0) {
    buf.fill(0);
  }
}
