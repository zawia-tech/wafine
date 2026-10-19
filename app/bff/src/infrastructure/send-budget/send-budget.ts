/**
 * Counter-backed send budget: a per-session UTC-day cap plus a per-minute burst cap.
 *
 * Valkey in production (the counters survive a BFF restart, so a redeploy does not hand out a fresh
 * day), memory in tests and local dev. Admission is INCRBY-then-check: an over-cap increment is
 * rolled back at once, so a refused send never consumes budget and concurrent sends cannot both
 * slip past the last slot.
 */

import type { Redis } from 'ioredis';
import type {
  ISendBudget,
  SendBudgetDecision,
  SendBudgetLimits,
  SendTicket,
} from '../../domain/ports/index.js';

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;
/** Day counters outlive their day a little so a clock skew at midnight cannot reopen one. */
const DAY_TTL_SECONDS = 2 * 86_400;
const MINUTE_TTL_SECONDS = 120;

export const DEFAULT_SEND_BUDGET: SendBudgetLimits = { perDay: 300, perMinute: 10 };

export interface CounterStore {
  /** Add `by` to the counter, setting its TTL, and return the new value. */
  incr(key: string, by: number, ttlSeconds: number): Promise<number>;
  decr(key: string, by: number): Promise<void>;
  get(key: string): Promise<number>;
}

export class MemoryCounterStore implements CounterStore {
  private readonly counters = new Map<string, { value: number; expiresAt: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  async incr(key: string, by: number, ttlSeconds: number): Promise<number> {
    const t = this.now();
    const cur = this.counters.get(key);
    const value = (cur && cur.expiresAt > t ? cur.value : 0) + by;
    this.counters.set(key, { value, expiresAt: t + ttlSeconds * 1000 });
    return value;
  }

  async decr(key: string, by: number): Promise<void> {
    const cur = this.counters.get(key);
    if (cur) cur.value = Math.max(0, cur.value - by);
  }

  async get(key: string): Promise<number> {
    const cur = this.counters.get(key);
    return cur && cur.expiresAt > this.now() ? cur.value : 0;
  }
}

export class RedisCounterStore implements CounterStore {
  constructor(private readonly redis: Redis) {}

  async incr(key: string, by: number, ttlSeconds: number): Promise<number> {
    const res = await this.redis.multi().incrby(key, by).expire(key, ttlSeconds).exec();
    const [err, value] = res?.[0] ?? [new Error('send budget: empty MULTI reply'), null];
    if (err) throw err;
    return Number(value);
  }

  async decr(key: string, by: number): Promise<void> {
    await this.redis.decrby(key, by);
  }

  async get(key: string): Promise<number> {
    return Number((await this.redis.get(key)) ?? 0);
  }
}

/** Fixed caps, or a lookup per session (admin settings + per-session override). */
export type LimitsSource = SendBudgetLimits | ((sessionId: string) => Promise<SendBudgetLimits>);

export class CountingSendBudget implements ISendBudget {
  constructor(
    private readonly store: CounterStore,
    private readonly limits: LimitsSource = DEFAULT_SEND_BUDGET,
    private readonly now: () => number = Date.now,
  ) {}

  private dayKey(sessionId: string, dayStart: number): string {
    return `sendbudget:day:${sessionId}:${new Date(dayStart).toISOString().slice(0, 10)}`;
  }

  async usage(sessionId: string): Promise<{ today: number; resetsInSeconds: number }> {
    const t = this.now();
    const dayStart = Math.floor(t / DAY_MS) * DAY_MS;
    return {
      today: await this.store.get(this.dayKey(sessionId, dayStart)),
      resetsInSeconds: Math.ceil((dayStart + DAY_MS - t) / 1000),
    };
  }

  async take(sessionId: string, count: number): Promise<SendBudgetDecision> {
    const t = this.now();
    const dayStart = Math.floor(t / DAY_MS) * DAY_MS;
    const minute = Math.floor(t / MINUTE_MS);
    const untilTomorrow = Math.ceil((dayStart + DAY_MS - t) / 1000);
    const untilNextMinute = Math.ceil(((minute + 1) * MINUTE_MS - t) / 1000);
    const { perDay, perMinute } = typeof this.limits === 'function' ? await this.limits(sessionId) : this.limits;

    // A request larger than a whole window can never pass; say so rather than consume anything.
    if (count > perDay) return { allowed: false, window: 'day', limit: perDay, retryAfterSeconds: untilTomorrow };
    if (count > perMinute) {
      return { allowed: false, window: 'minute', limit: perMinute, retryAfterSeconds: untilNextMinute };
    }

    const dayKey = this.dayKey(sessionId, dayStart);
    const minuteKey = `sendbudget:min:${sessionId}:${minute}`;

    if ((await this.store.incr(dayKey, count, DAY_TTL_SECONDS)) > perDay) {
      await this.store.decr(dayKey, count);
      return { allowed: false, window: 'day', limit: perDay, retryAfterSeconds: untilTomorrow };
    }
    if ((await this.store.incr(minuteKey, count, MINUTE_TTL_SECONDS)) > perMinute) {
      await this.store.decr(minuteKey, count);
      await this.store.decr(dayKey, count);
      return { allowed: false, window: 'minute', limit: perMinute, retryAfterSeconds: untilNextMinute };
    }
    return { allowed: true, ticket: { sessionId, count, dayKey, minuteKey } };
  }

  async refund(ticket: SendTicket): Promise<void> {
    await this.store.decr(ticket.dayKey, ticket.count);
    await this.store.decr(ticket.minuteKey, ticket.count);
  }
}

/** Human-readable refusal, shared by the REST 429 body and the MCP tool error. */
export function describeRefusal(d: Extract<SendBudgetDecision, { allowed: false }>): string {
  return d.window === 'day'
    ? `API daily send limit of ${d.limit} reached for this WhatsApp session; it resets at 00:00 UTC (in ${d.retryAfterSeconds}s). Messages you send from the phone or WhatsApp Web do not count.`
    : `API send rate of ${d.limit} per minute reached for this WhatsApp session; retry in ${d.retryAfterSeconds}s.`;
}
