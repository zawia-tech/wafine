/**
 * Admin backoffice port: runtime settings (API send caps, workflow pacing), per-session send-cap
 * overrides, and user administration. Only `/api/admin/*` (ADMIN_EMAILS) writes through it.
 */

import type { SendBudgetLimits } from './send-budget.js';
import type { UserRole } from '../user-roles.js';

export interface WorkflowPacingSettings {
  minGapMs: number;
  maxPerMinuteSession: number;
  maxPerMinuteContact: number;
  backoffMs: number;
}

export interface RuntimeSettings {
  sendLimits: SendBudgetLimits;
  workflow: WorkflowPacingSettings;
}

/** What is stored: only the fields an admin changed, layered over the env defaults when read. */
export interface StoredSettings {
  value: { sendLimits?: Partial<SendBudgetLimits>; workflow?: Partial<WorkflowPacingSettings> };
  updatedAt: Date;
  updatedBy: string;
}

/** Per-session cap; a null field falls back to the global value. */
export interface SessionLimitOverride {
  perDay: number | null;
  perMinute: number | null;
}

export interface AdminUserRecord {
  userId: string;
  email: string;
  phoneE164: string;
  role: UserRole;
  createdAt: Date;
  disabledAt: Date | null;
  /** The user asked to close the account (settings page); pending admin review. */
  closureRequestedAt: Date | null;
  session: { openwaSessionId: string; name: string; createdAt: Date } | null;
}

/** Audit row for one role change: who (id + email at the time), when, from, to. */
export interface UserRoleEvent {
  id: string;
  userId: string;
  changedBy: string;
  changedByEmail: string;
  fromRole: UserRole;
  toRole: UserRole;
  createdAt: Date;
}

export interface SetUserRoleInput {
  userId: string;
  role: UserRole;
  changedBy: string;
  changedByEmail: string;
  /**
   * Lower-cased ADMIN_EMAILS. Profiles with these emails count as owners whatever their stored
   * role, so the last-owner check sees the bootstrap owners too.
   */
  bootstrapOwnerEmails: readonly string[];
}

/**
 * `last_owner`: the change would leave no owner at all (stored owners + bootstrap owners), so it
 * is refused. The check and the write share one transaction.
 */
export type SetUserRoleResult = 'changed' | 'unchanged' | 'not_found' | 'last_owner';

export interface IAdminRepository {
  getSettings(): Promise<StoredSettings | null>;
  saveSettings(value: StoredSettings['value'], updatedBy: string): Promise<void>;

  getOverride(openwaSessionId: string): Promise<SessionLimitOverride | null>;
  listOverrides(): Promise<Map<string, SessionLimitOverride>>;
  /** `null` clears it. Returns false when the session is unknown. */
  setOverride(openwaSessionId: string, override: SessionLimitOverride | null, updatedBy: string): Promise<boolean>;

  listUsers(): Promise<AdminUserRecord[]>;
  getUserRole(userId: string): Promise<UserRole | null>;
  /** Change a role and write its audit row in the same transaction. */
  setUserRole(input: SetUserRoleInput): Promise<SetUserRoleResult>;
  listUserRoleEvents(userId: string): Promise<UserRoleEvent[]>;
  /** Returns false when the user is unknown. */
  setUserDisabled(userId: string, disabled: boolean): Promise<boolean>;
  isUserDisabled(userId: string): Promise<boolean>;
  /** Owner of an API key (any state), for admin revocation. */
  findKeyOwner(keyId: string): Promise<string | null>;
}
