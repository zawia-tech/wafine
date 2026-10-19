/**
 * Send budget port: how many outbound WhatsApp sends the BFF's own API surfaces may make per
 * OpenWA session — the `/wa/*` REST passthrough, `/mcp` tool calls and workflow auto-replies.
 *
 * Counted here rather than in the engine on purpose. OpenWA's own pacing counts every OUTGOING row
 * of the session, and a linked number's owner keeps using it from the phone and WhatsApp Web: their
 * own messages land as OUTGOING rows too, so a personal number used that way exhausts the engine's
 * daily cap without a single API send. Only what passes through the BFF is ours to limit.
 */

export interface SendBudgetLimits {
  /** Sends per session per UTC day. */
  perDay: number;
  /** Sends per session per minute (burst guard). */
  perMinute: number;
}

/** Proof of an admitted send, handed back to `refund` when the gateway did not send it. */
export interface SendTicket {
  readonly sessionId: string;
  readonly count: number;
  readonly dayKey: string;
  readonly minuteKey: string;
}

export type SendBudgetDecision =
  | { allowed: true; ticket: SendTicket }
  | { allowed: false; window: 'day' | 'minute'; limit: number; retryAfterSeconds: number };

export interface ISendBudget {
  /** Admit `count` sends for the session, or refuse without consuming anything. */
  take(sessionId: string, count: number): Promise<SendBudgetDecision>;
  /** Give an admitted send back (the engine refused it or never answered). */
  refund(ticket: SendTicket): Promise<void>;
  /** Sends admitted today (UTC) and the seconds until the day resets. */
  usage(sessionId: string): Promise<{ today: number; resetsInSeconds: number }>;
}
