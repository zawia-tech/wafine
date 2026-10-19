/**
 * Rate limiter — token-bucket algorithm.
 */

import type { IRateLimiter } from '../../domain/ports/index.js';

interface BucketState {
  tokens: number;
  lastRefill: number;
  capacity: number;
  refillInterval: number; // ms per token
}

export class TokenBucketRateLimiter implements IRateLimiter {
  private buckets = new Map<string, BucketState>();

  private bucketFor(key: string, limit: number, windowSeconds: number): BucketState {
    const capacity = limit;
    const refillInterval = (windowSeconds * 1000) / limit;
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { tokens: capacity, lastRefill: Date.now(), capacity, refillInterval };
      this.buckets.set(key, bucket);
      return bucket;
    }
    bucket.capacity = capacity;
    bucket.refillInterval = refillInterval;
    return bucket;
  }

  private refill(bucket: BucketState): void {
    const now = Date.now();
    const elapsed = now - bucket.lastRefill;
    const refillTokens = Math.floor(elapsed / bucket.refillInterval);
    if (refillTokens > 0) {
      bucket.tokens = Math.min(bucket.capacity, bucket.tokens + refillTokens);
      bucket.lastRefill = now;
    }
  }

  async isAllowed(key: string, limit: number, windowSeconds: number): Promise<boolean> {
    const bucket = this.bucketFor(key, limit, windowSeconds);

    this.refill(bucket);
    if (bucket.tokens >= 1) {
      bucket.tokens--;
      return true;
    }
    return false;
  }

  async reset(key: string): Promise<void> {
    this.buckets.delete(key);
  }
}
