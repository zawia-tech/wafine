/**
 * In-memory workflow state: per-tenant rule toggles, greeting cooldown ledger, webhook replay guard.
 * State resets on restart — acceptable for the PoC; swap behind the same ports to persist.
 */

import type {
  IIdempotencyStore,
  IWorkflowStore,
  WorkflowRuleId,
  WorkflowSettings,
} from '../../domain/ports/index.js';

const RULE_IDS: readonly WorkflowRuleId[] = ['ping-pong', 'greeting'];

const MAX_ENTRIES = 50_000;

/** Insertion-ordered map of key → expiry that evicts expired entries, then the oldest. */
class ExpiringKeys {
  private readonly expiries = new Map<string, number>();

  constructor(private readonly now: () => number) {}

  claim(key: string, ttlMs: number): boolean {
    const now = this.now();
    const expiry = this.expiries.get(key);
    if (expiry !== undefined && expiry > now) return false;
    this.expiries.delete(key);
    this.expiries.set(key, now + ttlMs);
    if (this.expiries.size > MAX_ENTRIES) this.evict(now);
    return true;
  }

  release(key: string): void {
    this.expiries.delete(key);
  }

  private evict(now: number): void {
    for (const [key, expiry] of this.expiries) {
      if (expiry <= now) this.expiries.delete(key);
    }
    while (this.expiries.size > MAX_ENTRIES) {
      const oldest = this.expiries.keys().next().value;
      if (oldest === undefined) break;
      this.expiries.delete(oldest);
    }
  }
}

export class InMemoryIdempotencyStore implements IIdempotencyStore {
  private readonly keys: ExpiringKeys;

  constructor(now: () => number = Date.now) {
    this.keys = new ExpiringKeys(now);
  }

  async claim(key: string, ttlMs: number): Promise<boolean> {
    return this.keys.claim(key, ttlMs);
  }

  async release(key: string): Promise<void> {
    this.keys.release(key);
  }
}

export class InMemoryWorkflowStore implements IWorkflowStore {
  private readonly settings = new Map<string, WorkflowSettings>();
  private readonly cooldowns: ExpiringKeys;

  /** `defaultEnabled`: initial state of every rule for a tenant that has never toggled. */
  constructor(
    private readonly defaultEnabled = false,
    now: () => number = Date.now,
  ) {
    this.cooldowns = new ExpiringKeys(now);
  }

  private initial(): WorkflowSettings {
    return {
      rules: Object.fromEntries(RULE_IDS.map((id) => [id, this.defaultEnabled])) as Record<
        WorkflowRuleId,
        boolean
      >,
    };
  }

  async getSettings(tenantId: string): Promise<WorkflowSettings> {
    const found = this.settings.get(tenantId) ?? this.initial();
    return { rules: { ...found.rules } };
  }

  async setRuleEnabled(
    tenantId: string,
    ruleId: WorkflowRuleId,
    enabled: boolean,
  ): Promise<WorkflowSettings> {
    const next = await this.getSettings(tenantId);
    next.rules[ruleId] = enabled;
    this.settings.set(tenantId, next);
    return { rules: { ...next.rules } };
  }

  async claimCooldown(
    tenantId: string,
    ruleId: WorkflowRuleId,
    contactKey: string,
    windowMs: number,
  ): Promise<boolean> {
    return this.cooldowns.claim(`${tenantId}:${ruleId}:${contactKey}`, windowMs);
  }

  async releaseCooldown(tenantId: string, ruleId: WorkflowRuleId, contactKey: string): Promise<void> {
    this.cooldowns.release(`${tenantId}:${ruleId}:${contactKey}`);
  }
}
