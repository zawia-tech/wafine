import type {
  IOAuthRepository,
  IWaTenancyRepository,
  NewOAuthGrant,
  OAuthClient,
  OAuthGrantView,
  OAuthTokenKind,
  ResolvedToken,
} from '../../domain/ports/index.js';

type Grant = NewOAuthGrant & { createdAt: Date; lastUsedAt: Date | null; revokedAt: Date | null };
type Token = { grantId: string; kind: OAuthTokenKind; expiresAt: Date; usedAt: Date | null };

/** Non-persistent OAuth store: tests, and local dev without DATABASE_URL. */
export class InMemoryOAuthRepository implements IOAuthRepository {
  private clients = new Map<string, OAuthClient>();
  private grants = new Map<string, Grant>();
  private tokens = new Map<string, Token>();

  /** Needs the tenancy store to resolve a token's session, like the SQL join does. */
  constructor(private readonly tenancy: IWaTenancyRepository) {}

  async createClient(client: Omit<OAuthClient, 'createdAt'>): Promise<void> {
    this.clients.set(client.clientId, { ...client, createdAt: new Date() });
  }

  async getClient(clientId: string): Promise<OAuthClient | null> {
    return this.clients.get(clientId) ?? null;
  }

  async createGrant(grant: NewOAuthGrant): Promise<void> {
    this.grants.set(grant.id, { ...grant, createdAt: new Date(), lastUsedAt: null, revokedAt: null });
  }

  async listGrants(userId: string): Promise<OAuthGrantView[]> {
    return [...this.grants.values()]
      .filter((g) => g.userId === userId && !g.revokedAt)
      .map((g) => ({
        id: g.id,
        clientId: g.clientId,
        clientName: this.clients.get(g.clientId)?.clientName ?? g.clientId,
        scope: g.scope,
        createdAt: g.createdAt,
        lastUsedAt: g.lastUsedAt,
      }))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async revokeGrant(grantId: string, userId?: string): Promise<string | null> {
    const g = this.grants.get(grantId);
    if (!g || g.revokedAt || (userId && g.userId !== userId)) return null;
    g.revokedAt = new Date();
    for (const [h, t] of this.tokens) if (t.grantId === grantId) this.tokens.delete(h);
    return g.openwaKeyId;
  }

  async activeGrantKeyIds(userId: string): Promise<string[]> {
    return [...this.grants.values()].filter((g) => g.userId === userId && !g.revokedAt).map((g) => g.openwaKeyId);
  }

  async addToken(token: { hash: string; grantId: string; kind: OAuthTokenKind; expiresAt: Date }): Promise<void> {
    this.tokens.set(token.hash, { grantId: token.grantId, kind: token.kind, expiresAt: token.expiresAt, usedAt: null });
  }

  async findToken(hash: string): Promise<ResolvedToken | null> {
    const t = this.tokens.get(hash);
    const g = t ? this.grants.get(t.grantId) : undefined;
    if (!t || !g || g.revokedAt) return null;
    const session = await this.tenancy.getSession(g.userId);
    if (!session) return null;
    return {
      grantId: g.id,
      clientId: g.clientId,
      userId: g.userId,
      kind: t.kind,
      expiresAt: t.expiresAt,
      usedAt: t.usedAt,
      openwaKeyEnc: g.openwaKeyEnc,
      openwaSessionId: session.openwaSessionId,
      scope: g.scope,
    };
  }

  async markRefreshUsed(hash: string): Promise<boolean> {
    const t = this.tokens.get(hash);
    if (!t || t.kind !== 'refresh' || t.usedAt) return false;
    t.usedAt = new Date();
    return true;
  }

  async touchGrant(grantId: string): Promise<void> {
    const g = this.grants.get(grantId);
    if (g) g.lastUsedAt = new Date();
  }
}
