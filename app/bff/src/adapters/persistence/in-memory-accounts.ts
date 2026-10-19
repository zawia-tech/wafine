import type {
  AllowlistEntry,
  BindResult,
  IAccountsRepository,
  NewUserProfile,
  UserProfile,
} from '../../domain/ports/index.js';

/** Non-persistent accounts store: tests, and local dev without DATABASE_URL. */
export class InMemoryAccountsRepository implements IAccountsRepository {
  private allowlist = new Map<string, { addedBy: string; addedAt: Date }>();
  private profiles = new Map<string, UserProfile>();

  /** Not on the port: lets the in-memory admin repository list users. */
  allProfiles(): UserProfile[] {
    return [...this.profiles.values()];
  }

  updateRole(userId: string, role: UserProfile['role']): boolean {
    const profile = this.profiles.get(userId);
    if (!profile) return false;
    this.profiles.set(userId, { ...profile, role });
    return true;
  }

  async listAllowlist(): Promise<AllowlistEntry[]> {
    return [...this.allowlist.entries()]
      .map(([phoneE164, v]) => ({
        phoneE164,
        addedBy: v.addedBy,
        addedAt: v.addedAt,
        boundEmail: [...this.profiles.values()].find((p) => p.phoneE164 === phoneE164)?.email ?? null,
      }))
      .sort((a, b) => b.addedAt.getTime() - a.addedAt.getTime());
  }

  async isAllowlisted(phoneE164: string): Promise<boolean> {
    return this.allowlist.has(phoneE164);
  }

  async addAllowlisted(phoneE164: string, addedBy: string): Promise<boolean> {
    if (this.allowlist.has(phoneE164)) return false;
    this.allowlist.set(phoneE164, { addedBy, addedAt: new Date() });
    return true;
  }

  async removeAllowlisted(phoneE164: string): Promise<boolean> {
    for (const [id, p] of this.profiles) {
      if (p.phoneE164 === phoneE164) this.profiles.delete(id);
    }
    return this.allowlist.delete(phoneE164);
  }

  async findProfileByUserId(userId: string): Promise<UserProfile | null> {
    return this.profiles.get(userId) ?? null;
  }

  async findProfileByPhone(phoneE164: string): Promise<UserProfile | null> {
    return [...this.profiles.values()].find((p) => p.phoneE164 === phoneE164) ?? null;
  }

  async updateDisplayName(userId: string, displayName: string | null): Promise<boolean> {
    const profile = this.profiles.get(userId);
    if (!profile) return false;
    this.profiles.set(userId, { ...profile, displayName });
    return true;
  }

  async updateProfileEmail(userId: string, email: string): Promise<void> {
    const profile = this.profiles.get(userId);
    if (profile) this.profiles.set(userId, { ...profile, email });
  }

  async requestClosure(userId: string): Promise<Date | null> {
    const profile = this.profiles.get(userId);
    if (!profile) return null;
    const at = profile.closureRequestedAt ?? new Date();
    this.profiles.set(userId, { ...profile, closureRequestedAt: at });
    return at;
  }

  async bindProfile(profile: NewUserProfile): Promise<BindResult> {
    if (!this.allowlist.has(profile.phoneE164)) return 'not_allowlisted';
    if (this.profiles.has(profile.userId)) return 'user_exists';
    if ([...this.profiles.values()].some((p) => p.phoneE164 === profile.phoneE164)) return 'phone_taken';
    this.profiles.set(profile.userId, {
      ...profile,
      role: 'user',
      displayName: null,
      closureRequestedAt: null,
      createdAt: new Date(),
    });
    return 'ok';
  }
}
