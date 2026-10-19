import { describe, it, expect } from 'bun:test';
import { InMemorySessionCache } from './adapters/cache/in-memory-session-cache.js';

describe('zeroize expired KEK', () => {
  it('zeroizes expired entries', async () => {
    const c = new InMemorySessionCache();
    const kek = new Uint8Array([1, 2, 3, 4, 5]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (c as any).store?.set?.('s', { kek, expiresAt: Date.now() - 1000 });
    // Fallback if store private - test via behavior
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((c as any).store) {
      const got = await c.getKek('s');
      expect(got).toBeNull();
      expect(kek.every((b) => b === 0)).toBe(true);
    } else {
      // Real implementation - inject expired via cacheKek with negative ttl then get
      await c.cacheKek('t', kek, -1);
      const got = await c.getKek('t');
      expect(got).toBeNull();
      expect(kek.every((b) => b === 0)).toBe(true);
    }
  });
});
