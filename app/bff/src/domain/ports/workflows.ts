/**
 * Workflow ports — per-tenant auto-reply rules driven by OpenWA webhooks.
 */

export type WorkflowRuleId = 'ping-pong' | 'greeting';

export interface WorkflowSettings {
  rules: Record<WorkflowRuleId, boolean>;
}

/** The slice of an OpenWA `message.received` event the workflow engine needs. */
export interface InboundMessage {
  sessionId: string;
  /** Chat to reply into (`<digits>@c.us` for a 1:1 chat). */
  chatId: string;
  body: string;
  type: string;
  fromMe: boolean;
  isGroup: boolean;
  isStatusBroadcast: boolean;
}

export type SendOutcome =
  | 'sent'
  | 'dropped_backoff'
  | 'dropped_rate_limit'
  | 'dropped_queue_full'
  | 'dropped_too_long'
  | 'gateway_paced'
  | 'failed';

export interface ReplyRequest {
  sessionId: string;
  chatId: string;
  text: string;
}

/** Outbound path for automated replies. Implementations must pace; callers must not retry. */
export interface IReplySender {
  send(request: ReplyRequest): Promise<SendOutcome>;
}

export type IgnoreReason =
  | 'not_message_event'
  | 'from_me'
  | 'not_direct_chat'
  | 'not_text'
  | 'unknown_session'
  | 'not_allowlisted'
  | 'no_match'
  | 'rule_disabled'
  | 'cooldown';

export type WorkflowDecision =
  | { status: 'ignored'; reason: IgnoreReason }
  | { status: 'queued'; ruleId: WorkflowRuleId; delivery: Promise<SendOutcome> };

/** Maps an OpenWA session to the tenant that owns it. */
export interface ITenantDirectory {
  tenantForSession(sessionId: string): Promise<string | null>;
}

/** Contacts a tenant has opted in to automated replies. */
export interface IContactAllowlist {
  isAllowed(tenantId: string, chatId: string): Promise<boolean>;
}

export interface IWorkflowStore {
  getSettings(tenantId: string): Promise<WorkflowSettings>;
  setRuleEnabled(tenantId: string, ruleId: WorkflowRuleId, enabled: boolean): Promise<WorkflowSettings>;
  /** Atomically take the `(tenant, rule, contact)` slot; false while an earlier claim is inside `windowMs`. */
  claimCooldown(tenantId: string, ruleId: WorkflowRuleId, contactKey: string, windowMs: number): Promise<boolean>;
  releaseCooldown(tenantId: string, ruleId: WorkflowRuleId, contactKey: string): Promise<void>;
}

/** Replay protection for webhook deliveries (OpenWA retries on non-2xx). */
export interface IIdempotencyStore {
  /** True the first time `key` is seen inside `ttlMs`. */
  claim(key: string, ttlMs: number): Promise<boolean>;
  release(key: string): Promise<void>;
}
