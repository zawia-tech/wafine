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
import type { InMemoryAccountsRepository } from './in-memory-accounts.js';
import type { InMemoryWaTenancyRepository } from './in-memory-wa-tenancy.js';

/** Non-persistent admin store: tests, and local dev without DATABASE_URL. */
export class InMemoryAdminRepository implements IAdminRepository {
  private settings: StoredSettings | null = null;
  private overrides = new Map<string, SessionLimitOverride>();
  private disabled = new Map<string, Date>();
  private roleEvents: UserRoleEvent[] = [];

  constructor(
    private readonly accounts: InMemoryAccountsRepository,
    private readonly tenancy: InMemoryWaTenancyRepository,
  ) {}

  async getSettings(): Promise<StoredSettings | null> {
    return this.settings;
  }

  async saveSettings(value: StoredSettings['value'], updatedBy: string): Promise<void> {
    this.settings = { value, updatedAt: new Date(), updatedBy };
  }

  async getOverride(openwaSessionId: string): Promise<SessionLimitOverride | null> {
    return this.overrides.get(openwaSessionId) ?? null;
  }

  async listOverrides(): Promise<Map<string, SessionLimitOverride>> {
    return new Map(this.overrides);
  }

  async setOverride(openwaSessionId: string, override: SessionLimitOverride | null): Promise<boolean> {
    if (!this.tenancy.allSessions().some((s) => s.openwaSessionId === openwaSessionId)) return false;
    if (!override || (override.perDay === null && override.perMinute === null)) {
      this.overrides.delete(openwaSessionId);
    } else {
      this.overrides.set(openwaSessionId, { ...override });
    }
    return true;
  }

  async listUsers(): Promise<AdminUserRecord[]> {
    const sessions = new Map(this.tenancy.allSessions().map((s) => [s.userId, s]));
    return this.accounts
      .allProfiles()
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((p) => {
        const s = sessions.get(p.userId);
        return {
          ...p,
          disabledAt: this.disabled.get(p.userId) ?? null,
          session: s ? { openwaSessionId: s.openwaSessionId, name: s.name, createdAt: s.createdAt } : null,
        };
      });
  }

  async getUserRole(userId: string): Promise<UserRole | null> {
    return (await this.accounts.findProfileByUserId(userId))?.role ?? null;
  }

  async setUserRole(input: SetUserRoleInput): Promise<SetUserRoleResult> {
    const { userId, role, changedBy, changedByEmail, bootstrapOwnerEmails } = input;
    const current = await this.getUserRole(userId);
    if (current === null) return 'not_found';
    if (current === role) return 'unchanged';
    if (current === 'owner' && role !== 'owner') {
      const bootstrap = new Set(bootstrapOwnerEmails);
      const others = this.accounts
        .allProfiles()
        .filter((p) => p.userId !== userId && (p.role === 'owner' || bootstrap.has(p.email.toLowerCase())));
      if (others.length === 0) return 'last_owner';
    }
    if (!this.accounts.updateRole(userId, role)) return 'not_found';
    this.roleEvents.push({ id: crypto.randomUUID(), userId, changedBy, changedByEmail, fromRole: current, toRole: role, createdAt: new Date() });
    return 'changed';
  }

  async listUserRoleEvents(userId: string): Promise<UserRoleEvent[]> {
    return this.roleEvents.filter((event) => event.userId === userId).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async setUserDisabled(userId: string, disabled: boolean): Promise<boolean> {
    if (!this.accounts.allProfiles().some((p) => p.userId === userId)) return false;
    if (disabled) this.disabled.set(userId, new Date());
    else this.disabled.delete(userId);
    return true;
  }

  async isUserDisabled(userId: string): Promise<boolean> {
    return this.disabled.has(userId);
  }

  async findKeyOwner(keyId: string): Promise<string | null> {
    return this.tenancy.keyOwner(keyId);
  }
}
