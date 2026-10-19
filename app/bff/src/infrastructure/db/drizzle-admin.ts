import { and, asc, eq, inArray, isNotNull, or, sql } from 'drizzle-orm';
import type {
  AdminUserRecord,
  IAdminRepository,
  SessionLimitOverride,
  SetUserRoleInput,
  SetUserRoleResult,
  StoredSettings,
  UserRoleEvent,
} from '../../domain/ports/index.js';
import type { UserRole } from '../../domain/user-roles.js';
import type { Db } from './client.js';
import { bffSettings, userProfiles, userRoleEvents, waApiKeys, waSessionLimits, waSessions } from './schema/index.js';

const RUNTIME_KEY = 'runtime';

export class DrizzleAdminRepository implements IAdminRepository {
  constructor(private readonly db: Db) {}

  async getSettings(): Promise<StoredSettings | null> {
    const rows = await this.db.select().from(bffSettings).where(eq(bffSettings.key, RUNTIME_KEY)).limit(1);
    const row = rows[0];
    return row
      ? { value: row.value as StoredSettings['value'], updatedAt: row.updatedAt, updatedBy: row.updatedBy }
      : null;
  }

  async saveSettings(value: StoredSettings['value'], updatedBy: string): Promise<void> {
    const now = new Date();
    await this.db
      .insert(bffSettings)
      .values({ key: RUNTIME_KEY, value, updatedAt: now, updatedBy })
      .onConflictDoUpdate({ target: bffSettings.key, set: { value, updatedAt: now, updatedBy } });
  }

  async getOverride(openwaSessionId: string): Promise<SessionLimitOverride | null> {
    const rows = await this.db
      .select({ perDay: waSessionLimits.perDay, perMinute: waSessionLimits.perMinute })
      .from(waSessionLimits)
      .where(eq(waSessionLimits.openwaSessionId, openwaSessionId))
      .limit(1);
    return rows[0] ?? null;
  }

  async listOverrides(): Promise<Map<string, SessionLimitOverride>> {
    const rows = await this.db.select().from(waSessionLimits);
    return new Map(rows.map((r) => [r.openwaSessionId, { perDay: r.perDay, perMinute: r.perMinute }]));
  }

  async setOverride(
    openwaSessionId: string,
    override: SessionLimitOverride | null,
    updatedBy: string,
  ): Promise<boolean> {
    const known = await this.db
      .select({ id: waSessions.openwaSessionId })
      .from(waSessions)
      .where(eq(waSessions.openwaSessionId, openwaSessionId))
      .limit(1);
    if (known.length === 0) return false;
    if (!override || (override.perDay === null && override.perMinute === null)) {
      await this.db.delete(waSessionLimits).where(eq(waSessionLimits.openwaSessionId, openwaSessionId));
      return true;
    }
    const set = { perDay: override.perDay, perMinute: override.perMinute, updatedAt: new Date(), updatedBy };
    await this.db
      .insert(waSessionLimits)
      .values({ openwaSessionId, ...set })
      .onConflictDoUpdate({ target: waSessionLimits.openwaSessionId, set });
    return true;
  }

  async listUsers(): Promise<AdminUserRecord[]> {
    const rows = await this.db
      .select({
        userId: userProfiles.userId,
        email: userProfiles.email,
        phoneE164: userProfiles.phoneE164,
        role: userProfiles.role,
        createdAt: userProfiles.createdAt,
        disabledAt: userProfiles.disabledAt,
        closureRequestedAt: userProfiles.closureRequestedAt,
        openwaSessionId: waSessions.openwaSessionId,
        sessionName: waSessions.name,
        sessionCreatedAt: waSessions.createdAt,
      })
      .from(userProfiles)
      .leftJoin(waSessions, eq(waSessions.userId, userProfiles.userId))
      .orderBy(asc(userProfiles.createdAt));
    return rows.map((r) => ({
      userId: r.userId,
      email: r.email,
      phoneE164: r.phoneE164,
      role: r.role,
      createdAt: r.createdAt,
      disabledAt: r.disabledAt,
      closureRequestedAt: r.closureRequestedAt,
      session:
        r.openwaSessionId && r.sessionName && r.sessionCreatedAt
          ? { openwaSessionId: r.openwaSessionId, name: r.sessionName, createdAt: r.sessionCreatedAt }
          : null,
    }));
  }

  async getUserRole(userId: string): Promise<UserRole | null> {
    const [row] = await this.db.select({ role: userProfiles.role }).from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1);
    return row?.role ?? null;
  }

  async setUserRole(input: SetUserRoleInput): Promise<SetUserRoleResult> {
    const { userId, role, changedBy, changedByEmail, bootstrapOwnerEmails } = input;
    return this.db.transaction(async (tx) => {
      // Lock the target and every owner row in one statement, in user_id order: two owners
      // demoting each other at once then queue on the same lock order instead of deadlocking,
      // and the second one sees the first one's change (last-owner check stays exact).
      const isOwner = or(
        eq(userProfiles.role, 'owner'),
        bootstrapOwnerEmails.length > 0 ? inArray(sql`lower(${userProfiles.email})`, [...bootstrapOwnerEmails]) : undefined,
      );
      const locked = await tx
        .select({ id: userProfiles.userId, role: userProfiles.role })
        .from(userProfiles)
        .where(or(eq(userProfiles.userId, userId), isOwner))
        .orderBy(asc(userProfiles.userId))
        .for('update');
      const current = locked.find((row) => row.id === userId);
      if (!current) return 'not_found';
      if (current.role === role) return 'unchanged';
      if (current.role === 'owner' && role !== 'owner') {
        if (!locked.some((row) => row.id !== userId)) return 'last_owner';
      }
      await tx.update(userProfiles).set({ role }).where(eq(userProfiles.userId, userId));
      await tx.insert(userRoleEvents).values({ userId, changedBy, changedByEmail, fromRole: current.role, toRole: role });
      return 'changed';
    });
  }

  async listUserRoleEvents(userId: string): Promise<UserRoleEvent[]> {
    return this.db.select().from(userRoleEvents).where(eq(userRoleEvents.userId, userId)).orderBy(asc(userRoleEvents.createdAt), asc(userRoleEvents.id));
  }

  async setUserDisabled(userId: string, disabled: boolean): Promise<boolean> {
    const rows = await this.db
      .update(userProfiles)
      .set({ disabledAt: disabled ? new Date() : null })
      .where(eq(userProfiles.userId, userId))
      .returning({ id: userProfiles.userId });
    return rows.length > 0;
  }

  async isUserDisabled(userId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: userProfiles.userId })
      .from(userProfiles)
      .where(and(eq(userProfiles.userId, userId), isNotNull(userProfiles.disabledAt)))
      .limit(1);
    return rows.length > 0;
  }

  async findKeyOwner(keyId: string): Promise<string | null> {
    const rows = await this.db
      .select({ userId: waApiKeys.userId })
      .from(waApiKeys)
      .where(eq(waApiKeys.id, keyId))
      .limit(1);
    return rows[0]?.userId ?? null;
  }
}
