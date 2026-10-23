/**
 * Rate limiter — token-bucket algorithm with bounded memory.
 *
 * Unbounded-key growth (never evicted Map keys) was the old leak: every distinct
 * rate-limit key — client IP, user id, fingerprint — lived forever. Now:
 *
 * - Idle buckets are swept: a bucket that was not touched for 2 full refill cycles
 *   (clamped to the sweep interval) is dropped and starts full next time, exactly as
 *   it would have anyway by then.
 * - The Map is capped at `maxKeys` (default 10 000). On overflow the limiter first
 *   evicts buckets idle beyond their sweep threshold; only when ALL buckets are hot
 *   does it reject the NEW key as limited (429) without disturbing anyone already
 *   being tracked. A rotating-key flood therefore costs bounded memory and can only
 *   deny service to new buckets, never to users already in a bucket.
 *
 * The sweep timer is unref'd: it never keeps the process alive.
 */
import type { IRateLimiter } from '../../domain/ports/index.js';

interface BucketState {
  tokens: number;
  lastRefill: number;
  lastAccess: number;
  capacity: number;
  refillInterval: number; // ms per token
}

export interface RateLimiterOptions {
  /** Maximum concurrent buckets. Overflow: evict idle ones, else reject-as-limited. */
  maxKeys?: number;
  /** Injectable clock for tests. */
  now?: () => number;
  /** Sweep cadence (ms). Defaults to one minute. */
  sweepIntervalMs?: number;
}

const DEFAULT_MAX_KEYS = 10_000;
const DEFAULT_SWEEP_INTERVAL_MS = 60_000;
/** A bucket is evictable after 2 full refill cycles, at least one sweep apart. */
const IDLE_REFILL_CYCLES = 2;

export class TokenBucketRateLimiter implements IRateLimiter {
  private buckets = new Map<string, BucketState>();
  private maxKeys: number;
  private clock: () => number;
  private sweepIntervalMs: number;
  private sweeper: ReturnType<typeof setInterval> | null = null;

  constructor(options: RateLimiterOptions = {}) {
    this.maxKeys = Math.max(1, options.maxKeys ?? DEFAULT_MAX_KEYS);
    this.clock = options.now ?? Date.now;
    this.sweepIntervalMs = Math.max(1, options.sweepIntervalMs ?? DEFAULT_SWEEP_INTERVAL_MS);
  }

  /** Buckets idle at least this long may be dropped (they are full again anyway). */
  private idleEvictAfterMs(bucket: BucketState): number {
    return Math.max(IDLE_REFILL_CYCLES * bucket.capacity * bucket.refillInterval, this.sweepIntervalMs);
  }

  /** Drops idle buckets; returns how many were dropped (exposed for tests). */
  sweep(nowMs = this.clock()): number {
    let dropped = 0;
    for (const [key, bucket] of this.buckets) {
      if (nowMs - bucket.lastAccess >= this.idleEvictAfterMs(bucket)) {
        this.buckets.delete(key);
        dropped++;
      }
    }
    return dropped;
  }

  private ensureSweeper(): void {
    if (this.sweeper || typeof setInterval === 'undefined') return;
    this.sweeper = setInterval(() => this.sweep(), this.sweepIntervalMs);
    this.sweeper.unref?.();
  }

  private bucketFor(key: string, limit: number, windowSeconds: number): BucketState {
    const capacity = limit;
    const refillInterval = (windowSeconds * 1000) / limit;
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { tokens: capacity, lastRefill: this.clock(), lastAccess: this.clock(), capacity, refillInterval };
      this.buckets.set(key, bucket);
      return bucket;
    }
    bucket.capacity = capacity;
    bucket.refillInterval = refillInterval;
    bucket.lastAccess = this.clock();
    return bucket;
  }

  private refill(bucket: BucketState): void {
    const now = this.clock();
    const elapsed = now - bucket.lastRefill;
    const refillTokens = Math.floor(elapsed / bucket.refillInterval);
    if (refillTokens > 0) {
      bucket.tokens = Math.min(bucket.capacity, bucket.tokens + refillTokens);
      bucket.lastRefill = now;
    }
  }

  async isAllowed(key: string, limit: number, windowSeconds: number): Promise<boolean> {
    this.ensureSweeper();
    const existing = this.peek(key);
    if (existing) {
      existing.lastAccess = this.clock();
      this.refill(existing);
    }
    if (!existing && this.buckets.size >= this.maxKeys) {
      // Room for one more: drop an idle bucket first; if every bucket is hot (flood),
      // refuse the NEW key rather than evicting a bucket somebody is actively using.
      if (this.sweep() === 0 && this.buckets.size >= this.maxKeys) return false;
    }
    const bucket = this.bucketFor(key, limit, windowSeconds);
    this.refill(bucket);
    if (bucket.tokens >= 1) {
      bucket.tokens--;
      return true;
    }
    return false;
  }

  /** Map.get without inserting. */
  private peek(key: string): BucketState | undefined {
    return this.buckets.get(key);
  }

  async reset(key: string): Promise<void> {
    this.buckets.delete(key);
  }
}
