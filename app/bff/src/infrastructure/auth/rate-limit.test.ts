import { describe, it, expect } from 'bun:test';
import { TokenBucketRateLimiter } from './rate-limit.js';

describe('TokenBucketRateLimiter', () => {
  it('allows `limit` requests per window, then denies', async () => {
    const limiter = new TokenBucketRateLimiter();

    for (let i = 0; i < 3; i++) {
      expect(await limiter.isAllowed('tenant:/api/messages', 3, 60)).toBe(true);
    }
    expect(await limiter.isAllowed('tenant:/api/messages', 3, 60)).toBe(false);
  });

  it('tracks keys independently', async () => {
    const limiter = new TokenBucketRateLimiter();

    expect(await limiter.isAllowed('a', 1, 60)).toBe(true);
    expect(await limiter.isAllowed('a', 1, 60)).toBe(false);
    expect(await limiter.isAllowed('b', 1, 60)).toBe(true);
  });

  it('refills tokens as the window elapses', async () => {
    const limiter = new TokenBucketRateLimiter();

    expect(await limiter.isAllowed('refill', 2, 1)).toBe(true);
    expect(await limiter.isAllowed('refill', 2, 1)).toBe(true);
    expect(await limiter.isAllowed('refill', 2, 1)).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(await limiter.isAllowed('refill', 2, 1)).toBe(true);
  });
});
