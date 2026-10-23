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

describe('TokenBucketRateLimiter memory bounds (fake clock)', () => {
  /** Controllable clock: bump(ms) advances time; the limiter reads the shared value. */
  const fakeClock = () => {
    const ctx = { now: 1_000_000 };
    return { ctx, now: () => ctx.now };
  };
  // idle threshold = max(2 * windowSeconds * 1000, sweepIntervalMs)
  const limiterWith = (now: () => number, maxKeys = 3) =>
    new TokenBucketRateLimiter({ maxKeys, now, sweepIntervalMs: 10 });

  it('sweeps idle buckets and keeps recently used ones', async () => {
    const { ctx, now } = fakeClock();
    const limiter = limiterWith(now);

    await limiter.isAllowed('old', 1, 60);
    await limiter.isAllowed('hot', 1, 60);
    ctx.now += 500_000; // idle well past max(2*window, sweep)
    await limiter.isAllowed('hot', 1, 60); // refreshes 'hot' without a token to spare

    expect(limiter.sweep()).toBe(1);
    // 'old' is gone (fresh bucket next time); 'hot' is retained.
    expect(await limiter.isAllowed('old', 1, 60)).toBe(true);
    expect(limiter.sweep()).toBe(0);
  });

  it('a swept bucket restarts full', async () => {
    const { ctx, now } = fakeClock();
    const limiter = limiterWith(now);

    expect(await limiter.isAllowed('k', 1, 60)).toBe(true);
    expect(await limiter.isAllowed('k', 1, 60)).toBe(false);
    ctx.now += 500_000;
    expect(limiter.sweep()).toBe(1);
    expect(await limiter.isAllowed('k', 1, 60)).toBe(true);
  });

  it('overflow with hot buckets only: the newcomer is rejected, existing buckets untouched', async () => {
    const { now } = fakeClock();
    const limiter = limiterWith(now, 2); // maxKeys 2

    expect(await limiter.isAllowed('a', 1, 60)).toBe(true);
    expect(await limiter.isAllowed('b', 1, 60)).toBe(true);
    // All buckets created within the same tick: nothing is idle ≥ threshold…
    expect(await limiter.isAllowed('c', 1, 60)).toBe(false); // …so the newcomer is limited
    // 'a' kept its exhausted state: it was NOT evicted to make room.
    expect(await limiter.isAllowed('a', 1, 60)).toBe(false);
  });

  it('overflow evicts idle buckets to make room (bounded growth)', async () => {
    const { ctx, now } = fakeClock();
    const limiter = limiterWith(now, 2);

    await limiter.isAllowed('a', 1, 60);
    await limiter.isAllowed('b', 1, 60);
    ctx.now += 500_000; // a and b idle: slots are reclaimable even without an explicit sweep

    await limiter.isAllowed('c', 1, 60); // true: the internal sweep freed both idle slots
    await limiter.isAllowed('d', 1, 60); // true: only 'c' inside, still below the cap
    expect(await limiter.isAllowed('e', 1, 60)).toBe(false); // cap reached, all hot → newcomer limited
  });

  it('away from the cap the limiter behaves as before', async () => {
    const { ctx, now } = fakeClock();
    const limiter = limiterWith(now);

    expect(await limiter.isAllowed('x', 2, 60)).toBe(true);
    expect(await limiter.isAllowed('x', 2, 60)).toBe(true);
    expect(await limiter.isAllowed('x', 2, 60)).toBe(false);
    ctx.now += 60_001;
    expect(await limiter.isAllowed('x', 2, 60)).toBe(true);
  });
});
