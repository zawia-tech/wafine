/**
 * Key management — device enrollment, key wrapping/unwrapping.
 * Keys are stored in IndexedDB (wrapped), never in localStorage.
 */

import { generateDek, deriveKek, generateDeviceSecret, zeroize } from './crypto.js';

const DB_NAME = 'wafine-keys';
const DB_VERSION = 1;
const STORE_NAME = 'wrapped-keys';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'keyId' });
      }
    };
  });
}

export interface WrappedKeyEntry {
  keyId: string;
  wrappedKey: Uint8Array;
  nonce: Uint8Array;
  version: number;
  algId: string;
  createdAt: number;
}

/**
 * Store a wrapped key in IndexedDB.
 */
export async function storeWrappedKey(entry: WrappedKeyEntry): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(entry);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

/**
 * Retrieve a wrapped key from IndexedDB.
 */
export async function getWrappedKey(keyId: string): Promise<WrappedKeyEntry | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(keyId);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result ?? null);
  });
}

/**
 * Delete a wrapped key from IndexedDB.
 */
export async function deleteWrappedKey(keyId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(keyId);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

/**
 * Enroll a new device: generate device secret, derive KEK, wrap KEK.
 * Returns the device secret (to be shown once to the user) and the wrapped KEK entry.
 */
export async function enrollDevice(
  passphrase: string,
  tenantId: string,
): Promise<{ deviceSecret: Uint8Array; wrappedKeyEntry: WrappedKeyEntry }> {
  const deviceSecret = generateDeviceSecret();
  const kek = await deriveKek(passphrase, deviceSecret);

  // Generate a random KEK for the tenant (first device)
  const tenantKek = await generateDek();

  // Wrap the tenant KEK with the device-derived KEK
  const { encrypt } = await import('./crypto.js');
  const { ciphertext, nonce } = await encrypt(tenantKek, kek);

  const entry: WrappedKeyEntry = {
    keyId: `${tenantId}:device:${crypto.randomUUID()}`,
    wrappedKey: ciphertext,
    nonce,
    version: 1,
    algId: 'xchacha20poly1305',
    createdAt: Date.now(),
  };

  await storeWrappedKey(entry);

  // Zeroize sensitive material
  zeroize(kek);
  zeroize(tenantKek);

  return { deviceSecret, wrappedKeyEntry: entry };
}
