/**
 * Paced reply sender — makes automated replies look like a person typing, and keeps them rare.
 *
 * Per session, sends go through one serial queue: a minimum gap between sends, plus a random
 * "reading" delay and a per-character "typing" delay. Per-contact and per-session rate limits
 * drop excess replies instead of queueing them (abuse guard). The gateway's own pacing
 * (`429 SEND_PACING_LIMITED`) opens a backoff window during which every send is dropped.
 * Each reply is charged to the session's API send budget just before it goes out, like any other
 * API send, and refunded when the gateway does not take it. Nothing is ever retried.
 */

import type { IGatewayLike } from './types.js';
import type {
  IRateLimiter,
  IReplySender,
  ISendBudget,
  ReplyRequest,
  SendOutcome,
} from '../../domain/ports/index.js';
import { OpenWaApiError } from '../gateway/openwa-http-client.js';

export interface PacingConfig {
  /** Minimum gap between two sends on one session. */
  minGapMs: number;
  /** Random "reading" delay before typing starts. */
  thinkMinMs: number;
  thinkMaxMs: number;
  /** Simulated typing speed, capped at `typingMaxMs`. */
  typingMsPerChar: number;
  typingMaxMs: number;
  maxPerMinutePerSession: number;
  maxPerMinutePerContact: number;
  /** Replies waiting on one session; beyond this they are dropped. */
  maxQueue: number;
  /** Replies longer than this are refused (keeps automated/AI text short). */
  maxReplyChars: number;
  /** Backoff after a 429 that carries no Retry-After. */
  defaultBackoffMs: number;
}

export const DEFAULT_PACING: PacingConfig = {
  minGapMs: 3_000,
  thinkMinMs: 1_200,
  thinkMaxMs: 3_500,
  typingMsPerChar: 45,
  typingMaxMs: 4_000,
  maxPerMinutePerSession: 6,
  maxPerMinutePerContact: 2,
  maxQueue: 10,
  maxReplyChars: 600,
  defaultBackoffMs: 15 * 60 * 1000,
};

export interface PacedSenderClock {
  now(): number;
  sleep(ms: number): Promise<void>;
  random(): number;
}

/** Fixed pacing, or a lookup read on every reply (admin-edited settings). */
export type PacingSource = PacingConfig | (() => Promise<PacingConfig>);

const realClock: PacedSenderClock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  random: () => Math.random(),
};

interface SessionLane {
  tail: Promise<unknown>;
  pending: number;
  lastSentAt: number;
  backoffUntil: number;
}

export class PacedReplySender implements IReplySender {
  private readonly lanes = new Map<string, SessionLane>();

  constructor(
    private readonly gateway: IGatewayLike,
    private readonly limiter: IRateLimiter,
    private readonly pacing: PacingSource = DEFAULT_PACING,
    private readonly clock: PacedSenderClock = realClock,
    private readonly budget?: ISendBudget,
  ) {}

  private lane(sessionId: string): SessionLane {
    let lane = this.lanes.get(sessionId);
    if (!lane) {
      lane = { tail: Promise.resolve(), pending: 0, lastSentAt: 0, backoffUntil: 0 };
      this.lanes.set(sessionId, lane);
    }
    return lane;
  }

  async send(request: ReplyRequest): Promise<SendOutcome> {
    const { clock } = this;
    const config = typeof this.pacing === 'function' ? await this.pacing() : this.pacing;
    const lane = this.lane(request.sessionId);

    if (request.text.length > config.maxReplyChars) return 'dropped_too_long';
    if (clock.now() < lane.backoffUntil) return 'dropped_backoff';
    if (lane.pending >= config.maxQueue) return 'dropped_queue_full';

    const contactAllowed = await this.limiter.isAllowed(
      `reply:contact:${request.sessionId}:${request.chatId}`,
      config.maxPerMinutePerContact,
      60,
    );
    if (!contactAllowed) return 'dropped_rate_limit';
    const sessionAllowed = await this.limiter.isAllowed(
      `reply:session:${request.sessionId}`,
      config.maxPerMinutePerSession,
      60,
    );
    if (!sessionAllowed) return 'dropped_rate_limit';

    lane.pending++;
    const run = lane.tail.then(() => this.deliver(lane, request, config));
    lane.tail = run.catch(() => undefined);
    try {
      return await run;
    } finally {
      lane.pending--;
    }
  }

  private async deliver(lane: SessionLane, request: ReplyRequest, config: PacingConfig): Promise<SendOutcome> {
    const { clock } = this;

    const gapWait = Math.max(0, lane.lastSentAt + config.minGapMs - clock.now());
    const think = config.thinkMinMs + clock.random() * (config.thinkMaxMs - config.thinkMinMs);
    const typing = Math.min(request.text.length * config.typingMsPerChar, config.typingMaxMs);
    await clock.sleep(Math.round(gapWait + think + typing));

    // The gateway may have pushed back while this reply waited its turn.
    if (clock.now() < lane.backoffUntil) return 'dropped_backoff';

    const admitted = this.budget ? await this.budget.take(request.sessionId, 1) : null;
    if (admitted && !admitted.allowed) return 'dropped_rate_limit';

    try {
      await this.gateway.sendText(request);
      lane.lastSentAt = clock.now();
      return 'sent';
    } catch (err) {
      if (admitted?.allowed) await this.budget?.refund(admitted.ticket).catch(() => undefined);
      if (err instanceof OpenWaApiError && err.status === 429) {
        const backoffMs = err.retryAfterSeconds
          ? err.retryAfterSeconds * 1000
          : config.defaultBackoffMs;
        lane.backoffUntil = clock.now() + backoffMs;
        return 'gateway_paced';
      }
      return 'failed';
    }
  }
}
