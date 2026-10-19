import type {
  ActiveKeyOwner,
  IWaTenancyRepository,
  WaApiKeyRecord,
  WaSessionRecord,
} from '../../domain/ports/index.js';

/** Non-persistent WhatsApp tenancy store: tests, and local dev without DATABASE_URL. */
export class InMemoryWaTenancyRepository implements IWaTenancyRepository {
  private sessions = new Map<string, WaSessionRecord>();
  private keys = new Map<string, WaApiKeyRecord & { keyHash: string }>();

  /** Not on the port: lets the in-memory admin repository join sessions and keys. */
  allSessions(): WaSessionRecord[] {
    return [...this.sessions.values()];
  }

  keyOwner(keyId: string): string | null {
    return this.keys.get(keyId)?.userId ?? null;
  }

  async getSession(userId: string): Promise<WaSessionRecord | null> {
    return this.sessions.get(userId) ?? null;
  }

  async createSession(record: Omit<WaSessionRecord, 'createdAt'>): Promise<boolean> {
    if (this.sessions.has(record.userId)) return false;
    this.sessions.set(record.userId, { ...record, createdAt: new Date() });
    return true;
  }

  async deleteSession(userId: string): Promise<void> {
    this.sessions.delete(userId);
    for (const [id, k] of this.keys) if (k.userId === userId) this.keys.delete(id);
  }

  async listKeys(userId: string): Promise<WaApiKeyRecord[]> {
    return [...this.keys.values()]
      .filter((k) => k.userId === userId)
      .map(({ keyHash: _h, ...k }) => k)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async addKey(key: { id: string; userId: string; keyPrefix: string; keyHash: string }): Promise<void> {
    this.keys.set(key.id, { ...key, createdAt: new Date(), revokedAt: null });
  }

  async revokeKey(userId: string, keyId: string): Promise<boolean> {
    const k = this.keys.get(keyId);
    if (!k || k.userId !== userId || k.revokedAt) return false;
    k.revokedAt = new Date();
    return true;
  }

  async findActiveKeyByHash(keyHash: string): Promise<ActiveKeyOwner | null> {
    const k = [...this.keys.values()].find((x) => x.keyHash === keyHash && !x.revokedAt);
    const s = k ? this.sessions.get(k.userId) : undefined;
    return k && s ? { keyId: k.id, userId: k.userId, openwaSessionId: s.openwaSessionId } : null;
  }
}
