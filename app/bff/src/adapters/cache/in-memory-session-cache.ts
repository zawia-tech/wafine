import type { ISessionCache } from '../../domain/ports/index.js';

export interface CachedKek {
  kek: Uint8Array;
  expiresAt: number;
}

export class InMemorySessionCache implements ISessionCache {
  private store = new Map<string, CachedKek>();

  async cacheKek(sessionId: string, kek: Uint8Array, ttlSeconds: number): Promise<void> {
    this.store.set(sessionId, {
      kek,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  async getKek(sessionId: string): Promise<Uint8Array | null> {
    const entry = this.store.get(sessionId);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      entry.kek.fill(0);
      this.store.delete(sessionId);
      return null;
    }
    return entry.kek;
  }

  async invalidateKek(sessionId: string): Promise<void> {
    const entry = this.store.get(sessionId);
    if (entry) {
      entry.kek.fill(0);
      this.store.delete(sessionId);
    }
  }
}
