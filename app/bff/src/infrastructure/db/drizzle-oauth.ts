import { and, desc, eq, isNull } from 'drizzle-orm';
import type {
  IOAuthRepository,
  NewOAuthGrant,
  OAuthClient,
  OAuthGrantView,
  OAuthTokenKind,
  ResolvedToken,
} from '../../domain/ports/index.js';
import type { Db } from './client.js';
import { oauthClients, oauthGrants, oauthTokens, waSessions } from './schema/index.js';

export class DrizzleOAuthRepository implements IOAuthRepository {
  constructor(private readonly db: Db) {}

  async createClient(client: Omit<OAuthClient, 'createdAt'>): Promise<void> {
    await this.db.insert(oauthClients).values(client);
  }

  async getClient(clientId: string): Promise<OAuthClient | null> {
    const rows = await this.db.select().from(oauthClients).where(eq(oauthClients.clientId, clientId)).limit(1);
    return rows[0] ?? null;
  }

  async createGrant(grant: NewOAuthGrant): Promise<void> {
    await this.db.insert(oauthGrants).values(grant);
  }

  async listGrants(userId: string): Promise<OAuthGrantView[]> {
    return this.db
      .select({
        id: oauthGrants.id,
        clientId: oauthGrants.clientId,
        clientName: oauthClients.clientName,
        scope: oauthGrants.scope,
        createdAt: oauthGrants.createdAt,
        lastUsedAt: oauthGrants.lastUsedAt,
      })
      .from(oauthGrants)
      .innerJoin(oauthClients, eq(oauthClients.clientId, oauthGrants.clientId))
      .where(and(eq(oauthGrants.userId, userId), isNull(oauthGrants.revokedAt)))
      .orderBy(desc(oauthGrants.createdAt));
  }

  async revokeGrant(grantId: string, userId?: string): Promise<string | null> {
    const where = userId
      ? and(eq(oauthGrants.id, grantId), eq(oauthGrants.userId, userId), isNull(oauthGrants.revokedAt))
      : and(eq(oauthGrants.id, grantId), isNull(oauthGrants.revokedAt));
    const rows = await this.db
      .update(oauthGrants)
      .set({ revokedAt: new Date() })
      .where(where)
      .returning({ keyId: oauthGrants.openwaKeyId });
    if (!rows[0]) return null;
    await this.db.delete(oauthTokens).where(eq(oauthTokens.grantId, grantId));
    return rows[0].keyId;
  }

  async activeGrantKeyIds(userId: string): Promise<string[]> {
    const rows = await this.db
      .select({ keyId: oauthGrants.openwaKeyId })
      .from(oauthGrants)
      .where(and(eq(oauthGrants.userId, userId), isNull(oauthGrants.revokedAt)));
    return rows.map((r) => r.keyId);
  }

  async addToken(token: { hash: string; grantId: string; kind: OAuthTokenKind; expiresAt: Date }): Promise<void> {
    await this.db
      .insert(oauthTokens)
      .values({ tokenHash: token.hash, grantId: token.grantId, kind: token.kind, expiresAt: token.expiresAt });
  }

  async findToken(hash: string): Promise<ResolvedToken | null> {
    const rows = await this.db
      .select({
        grantId: oauthTokens.grantId,
        kind: oauthTokens.kind,
        expiresAt: oauthTokens.expiresAt,
        usedAt: oauthTokens.usedAt,
        clientId: oauthGrants.clientId,
        userId: oauthGrants.userId,
        openwaKeyEnc: oauthGrants.openwaKeyEnc,
        scope: oauthGrants.scope,
        openwaSessionId: waSessions.openwaSessionId,
      })
      .from(oauthTokens)
      .innerJoin(oauthGrants, eq(oauthGrants.id, oauthTokens.grantId))
      .innerJoin(waSessions, eq(waSessions.userId, oauthGrants.userId))
      .where(and(eq(oauthTokens.tokenHash, hash), isNull(oauthGrants.revokedAt)))
      .limit(1);
    const r = rows[0];
    return r ? { ...r, kind: r.kind as OAuthTokenKind } : null;
  }

  async markRefreshUsed(hash: string): Promise<boolean> {
    const rows = await this.db
      .update(oauthTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(oauthTokens.tokenHash, hash), eq(oauthTokens.kind, 'refresh'), isNull(oauthTokens.usedAt)))
      .returning({ h: oauthTokens.tokenHash });
    return rows.length > 0;
  }

  async touchGrant(grantId: string): Promise<void> {
    await this.db.update(oauthGrants).set({ lastUsedAt: new Date() }).where(eq(oauthGrants.id, grantId));
  }
}
