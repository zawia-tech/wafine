/**
 * Runtime settings: env defaults, overlaid by what an admin saved from /admin, overlaid (for send
 * caps) by a per-session override. Reads are cached briefly so a send does not cost a DB round
 * trip; an admin write through this service drops the cache, so the change applies at once here.
 */

import type {
  IAdminRepository,
  RuntimeSettings,
  SendBudgetLimits,
  SessionLimitOverride,
  StoredSettings,
} from '../../domain/ports/index.js';

export interface ResolvedSettings extends RuntimeSettings {
  updatedAt: Date | null;
  updatedBy: string | null;
}

interface Cached<T> {
  value: T;
  expiresAt: number;
}

export class RuntimeSettingsService {
  private settings: Cached<ResolvedSettings> | null = null;
  private readonly overrides = new Map<string, Cached<SessionLimitOverride | null>>();
  private readonly disabled = new Map<string, Cached<boolean>>();

  constructor(
    private readonly repo: IAdminRepository,
    private readonly defaults: RuntimeSettings,
    private readonly ttlMs = 15_000,
    private readonly now: () => number = Date.now,
  ) {}

  async current(): Promise<ResolvedSettings> {
    if (this.settings && this.settings.expiresAt > this.now()) return this.settings.value;
    const stored = await this.repo.getSettings();
    const value = merge(this.defaults, stored);
    this.settings = { value, expiresAt: this.now() + this.ttlMs };
    return value;
  }

  async update(patch: StoredSettings['value'], updatedBy: string): Promise<ResolvedSettings> {
    const stored = (await this.repo.getSettings())?.value ?? {};
    const next: StoredSettings['value'] = {
      sendLimits: { ...stored.sendLimits, ...patch.sendLimits },
      workflow: { ...stored.workflow, ...patch.workflow },
    };
    await this.repo.saveSettings(next, updatedBy);
    this.settings = null;
    return this.current();
  }

  async override(sessionId: string): Promise<SessionLimitOverride | null> {
    const hit = this.overrides.get(sessionId);
    if (hit && hit.expiresAt > this.now()) return hit.value;
    const value = await this.repo.getOverride(sessionId);
    this.overrides.set(sessionId, { value, expiresAt: this.now() + this.ttlMs });
    return value;
  }

  async setOverride(sessionId: string, o: SessionLimitOverride | null, by: string): Promise<boolean> {
    const ok = await this.repo.setOverride(sessionId, o, by);
    this.overrides.delete(sessionId);
    return ok;
  }

  /** The caps that apply to one session right now. */
  async limitsFor(sessionId: string): Promise<SendBudgetLimits> {
    return effectiveLimits((await this.current()).sendLimits, await this.override(sessionId));
  }

  async isUserDisabled(userId: string): Promise<boolean> {
    const hit = this.disabled.get(userId);
    if (hit && hit.expiresAt > this.now()) return hit.value;
    const value = await this.repo.isUserDisabled(userId);
    this.disabled.set(userId, { value, expiresAt: this.now() + this.ttlMs });
    return value;
  }

  async setUserDisabled(userId: string, disabled: boolean): Promise<boolean> {
    const ok = await this.repo.setUserDisabled(userId, disabled);
    this.disabled.delete(userId);
    return ok;
  }
}

export function effectiveLimits(global: SendBudgetLimits, o: SessionLimitOverride | null): SendBudgetLimits {
  return { perDay: o?.perDay ?? global.perDay, perMinute: o?.perMinute ?? global.perMinute };
}

function merge(defaults: RuntimeSettings, stored: StoredSettings | null): ResolvedSettings {
  return {
    sendLimits: { ...defaults.sendLimits, ...stored?.value.sendLimits },
    workflow: { ...defaults.workflow, ...stored?.value.workflow },
    updatedAt: stored?.updatedAt ?? null,
    updatedBy: stored?.updatedBy ?? null,
  };
}
