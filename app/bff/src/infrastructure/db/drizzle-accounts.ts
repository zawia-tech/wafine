import { desc, eq, sql } from 'drizzle-orm';
import type {
  AllowlistEntry,
  BindResult,
  IAccountsRepository,
  NewUserProfile,
  UserProfile,
} from '../../domain/ports/index.js';
import type { Db } from './client.js';
import { allowlistedNumbers, userProfiles } from './schema/index.js';

export class DrizzleAccountsRepository implements IAccountsRepository {
  constructor(private readonly db: Db) {}

  async listAllowlist(): Promise<AllowlistEntry[]> {
    const rows = await this.db
      .select({
        phoneE164: allowlistedNumbers.phoneE164,
        addedBy: allowlistedNumbers.addedBy,
        addedAt: allowlistedNumbers.addedAt,
        boundEmail: userProfiles.email,
      })
      .from(allowlistedNumbers)
      .leftJoin(userProfiles, eq(userProfiles.phoneE164, allowlistedNumbers.phoneE164))
      .orderBy(desc(allowlistedNumbers.addedAt));
    return rows;
  }

  async isAllowlisted(phoneE164: string): Promise<boolean> {
    const rows = await this.db
      .select({ p: allowlistedNumbers.phoneE164 })
      .from(allowlistedNumbers)
      .where(eq(allowlistedNumbers.phoneE164, phoneE164))
      .limit(1);
    return rows.length > 0;
  }

  async addAllowlisted(phoneE164: string, addedBy: string): Promise<boolean> {
    const rows = await this.db
      .insert(allowlistedNumbers)
      .values({ phoneE164, addedBy })
      .onConflictDoNothing()
      .returning({ p: allowlistedNumbers.phoneE164 });
    return rows.length > 0;
  }

  async removeAllowlisted(phoneE164: string): Promise<boolean> {
    // user_profiles.phone_e164 has ON DELETE CASCADE, so the binding goes with it.
    const rows = await this.db
      .delete(allowlistedNumbers)
      .where(eq(allowlistedNumbers.phoneE164, phoneE164))
      .returning({ p: allowlistedNumbers.phoneE164 });
    return rows.length > 0;
  }

  async findProfileByUserId(userId: string): Promise<UserProfile | null> {
    const rows = await this.db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1);
    return rows[0] ?? null;
  }

  async findProfileByPhone(phoneE164: string): Promise<UserProfile | null> {
    const rows = await this.db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.phoneE164, phoneE164))
      .limit(1);
    return rows[0] ?? null;
  }

  async updateDisplayName(userId: string, displayName: string | null): Promise<boolean> {
    const rows = await this.db
      .update(userProfiles)
      .set({ displayName })
      .where(eq(userProfiles.userId, userId))
      .returning({ id: userProfiles.userId });
    return rows.length > 0;
  }

  async updateProfileEmail(userId: string, email: string): Promise<void> {
    await this.db.update(userProfiles).set({ email }).where(eq(userProfiles.userId, userId));
  }

  async requestClosure(userId: string): Promise<Date | null> {
    // coalesce keeps the first request's timestamp when the user asks twice.
    const rows = await this.db
      .update(userProfiles)
      .set({ closureRequestedAt: sql`coalesce(${userProfiles.closureRequestedAt}, now())` })
      .where(eq(userProfiles.userId, userId))
      .returning({ at: userProfiles.closureRequestedAt });
    return rows[0]?.at ?? null;
  }

  async bindProfile(profile: NewUserProfile): Promise<BindResult> {
    if (!(await this.isAllowlisted(profile.phoneE164))) return 'not_allowlisted';
    try {
      const rows = await this.db
        .insert(userProfiles)
        // Every new account starts as a plain `user`; roles are only ever granted by an owner.
        .values({ userId: profile.userId, email: profile.email, phoneE164: profile.phoneE164, role: 'user' })
        .onConflictDoNothing()
        .returning({ id: userProfiles.userId });
      if (rows.length > 0) return 'ok';
    } catch (err) {
      // Number removed from the allowlist between the check and the insert (FK violation).
      if (isPgError(err, '23503')) return 'not_allowlisted';
      throw err;
    }
    // Conflict on user_id (PK) or phone_e164 (unique): tell them apart.
    return (await this.findProfileByUserId(profile.userId)) ? 'user_exists' : 'phone_taken';
  }
}

function isPgError(err: unknown, code: string): boolean {
  let e: unknown = err;
  // drizzle wraps driver errors in `cause`
  while (e && typeof e === 'object') {
    if ((e as { code?: unknown }).code === code) return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}
