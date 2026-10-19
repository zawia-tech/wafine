import { and, desc, eq, isNull } from 'drizzle-orm';
import type {
  ActiveKeyOwner,
  IWaTenancyRepository,
  WaApiKeyRecord,
  WaSessionRecord,
} from '../../domain/ports/index.js';
import type { Db } from './client.js';
import { waApiKeys, waSessions } from './schema/index.js';

export class DrizzleWaTenancyRepository implements IWaTenancyRepository {
  constructor(private readonly db: Db) {}

  async getSession(userId: string): Promise<WaSessionRecord | null> {
    const rows = await this.db.select().from(waSessions).where(eq(waSessions.userId, userId)).limit(1);
    return rows[0] ?? null;
  }

  async createSession(record: Omit<WaSessionRecord, 'createdAt'>): Promise<boolean> {
    const rows = await this.db
      .insert(waSessions)
      .values(record)
      .onConflictDoNothing()
      .returning({ id: waSessions.userId });
    return rows.length > 0;
  }

  async deleteSession(userId: string): Promise<void> {
    // wa_api_keys.user_id cascades from wa_sessions.
    await this.db.delete(waSessions).where(eq(waSessions.userId, userId));
  }

  async listKeys(userId: string): Promise<WaApiKeyRecord[]> {
    return this.db
      .select({
        id: waApiKeys.id,
        userId: waApiKeys.userId,
        keyPrefix: waApiKeys.keyPrefix,
        createdAt: waApiKeys.createdAt,
        revokedAt: waApiKeys.revokedAt,
      })
      .from(waApiKeys)
      .where(eq(waApiKeys.userId, userId))
      .orderBy(desc(waApiKeys.createdAt));
  }

  async addKey(key: { id: string; userId: string; keyPrefix: string; keyHash: string }): Promise<void> {
    await this.db.insert(waApiKeys).values(key);
  }

  async revokeKey(userId: string, keyId: string): Promise<boolean> {
    const rows = await this.db
      .update(waApiKeys)
      .set({ revokedAt: new Date() })
      .where(and(eq(waApiKeys.id, keyId), eq(waApiKeys.userId, userId), isNull(waApiKeys.revokedAt)))
      .returning({ id: waApiKeys.id });
    return rows.length > 0;
  }

  async findActiveKeyByHash(keyHash: string): Promise<ActiveKeyOwner | null> {
    const rows = await this.db
      .select({
        keyId: waApiKeys.id,
        userId: waApiKeys.userId,
        openwaSessionId: waSessions.openwaSessionId,
      })
      .from(waApiKeys)
      .innerJoin(waSessions, eq(waSessions.userId, waApiKeys.userId))
      .where(and(eq(waApiKeys.keyHash, keyHash), isNull(waApiKeys.revokedAt)))
      .limit(1);
    return rows[0] ?? null;
  }
}
