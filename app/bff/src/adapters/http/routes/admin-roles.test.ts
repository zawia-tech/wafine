/**
 * RBAC over the real app: every /api/admin route, every role, against the permission matrix.
 * Plus the owner protections (ADMIN_EMAILS bootstrap, last owner) and the role-change audit.
 */
import { beforeEach, describe, expect, it } from 'bun:test';
import type { IIdentityProvider, IdentityUser, IWhatsAppGateway } from '../../../domain/ports/index.js';
import { USER_ROLES, hasPermission, type Permission, type UserRole } from '../../../domain/user-roles.js';
import { HealthAggregator } from '../../../infrastructure/health/health-aggregator.js';
import { RuntimeSettingsService } from '../../../infrastructure/settings/runtime-settings.js';
import { CountingSendBudget, MemoryCounterStore } from '../../../infrastructure/send-budget/send-budget.js';
import { InMemoryAccountsRepository } from '../../persistence/in-memory-accounts.js';
import { InMemoryAdminRepository } from '../../persistence/in-memory-admin.js';
import { InMemoryWaTenancyRepository } from '../../persistence/in-memory-wa-tenancy.js';
import { InMemoryWaitlistRepository } from '../../persistence/in-memory-waitlist.js';
import { createApp } from '../app.js';

class FakeIdentity implements IIdentityProvider {
  users = new Map<string, IdentityUser>();
  async signUp(): Promise<never> {
    throw new Error('unused');
  }
  async signIn(): Promise<never> {
    throw new Error('unused');
  }
  async refresh() {
    return null;
  }
  async getUser(token: string) {
    return this.users.get(token.replace(/^tok:/, '')) ?? null;
  }
  async deleteUser() {}
}

const OWNER_EMAIL = 'owner@example.com';
const MISSING = '00000000-0000-4000-8000-00000000ffff';
const id = (n: number) => `11111111-0000-4000-8000-${String(n).padStart(12, '0')}`;
const phone = (n: number) => `+2126000000${String(n).padStart(2, '0')}`;

let app: ReturnType<typeof createApp>;
let accounts: InMemoryAccountsRepository;
let adminRepo: InMemoryAdminRepository;
let identity: FakeIdentity;
/** Bearer headers per role; `owner` is the ADMIN_EMAILS bootstrap owner. */
let as: Record<UserRole, Record<string, string>>;

async function addUser(n: number, email: string, role: UserRole = 'user', withProfile = true) {
  identity.users.set(id(n), { userId: id(n), email, emailConfirmed: true });
  if (withProfile) {
    await accounts.addAllowlisted(phone(n), 'seed');
    expect(await accounts.bindProfile({ userId: id(n), email, phoneE164: phone(n) })).toBe('ok');
    if (role !== 'user') accounts.updateRole(id(n), role);
  }
  return { Authorization: `Bearer tok:${id(n)}`, 'Content-Type': 'application/json' };
}

async function build(opts: { bootstrapProfile?: boolean } = {}) {
  accounts = new InMemoryAccountsRepository();
  identity = new FakeIdentity();
  const tenancy = new InMemoryWaTenancyRepository();
  adminRepo = new InMemoryAdminRepository(accounts, tenancy);
  const settings = new RuntimeSettingsService(
    adminRepo,
    {
      sendLimits: { perDay: 3, perMinute: 2 },
      workflow: { minGapMs: 3000, maxPerMinuteSession: 6, maxPerMinuteContact: 2, backoffMs: 900000 },
    },
    0,
  );
  const budget = new CountingSendBudget(new MemoryCounterStore(), (sid) => settings.limitsFor(sid));
  const gateway = { listSessions: async () => [], revokeApiKey: async () => {} } as unknown as IWhatsAppGateway;
  app = createApp({
    health: new HealthAggregator([]),
    accounts,
    identity,
    adminEmails: [OWNER_EMAIL],
    corsOrigins: [],
    waitlist: new InMemoryWaitlistRepository(),
    backoffice: { repo: adminRepo, settings, budget },
    wa: { gateway, tenancy, sendBudget: budget, openwaBaseUrl: 'http://engine:2785', publicApiUrl: 'https://api.example.test' },
  });
  as = {
    owner: await addUser(1, OWNER_EMAIL, 'user', opts.bootstrapProfile ?? true),
    admin: await addUser(2, 'admin@example.com', 'admin'),
    support: await addUser(3, 'support@example.com', 'support'),
    viewer: await addUser(4, 'viewer@example.com', 'viewer'),
    user: await addUser(5, 'user@example.com'),
  };
}

const call = (method: string, path: string, headers: Record<string, string>, body?: unknown) =>
  app.request(path, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

/**
 * Every admin route and the permission it needs. Bodies are valid and ids point nowhere, so an
 * allowed call ends in 2xx/404/409, never a write to someone else's data.
 */
const ROUTES: { method: string; path: string; pattern: string; permission: Permission; body?: unknown }[] = [
  { method: 'GET', path: '/api/admin/allowlist', pattern: '/api/admin/allowlist', permission: 'allowlist:read' },
  { method: 'POST', path: '/api/admin/allowlist', pattern: '/api/admin/allowlist', permission: 'allowlist:manage', body: { phone: '+212600000090' } },
  { method: 'DELETE', path: `/api/admin/allowlist/${encodeURIComponent('+212600000091')}`, pattern: '/api/admin/allowlist/:phone', permission: 'allowlist:manage' },
  { method: 'GET', path: '/api/admin/waitlist', pattern: '/api/admin/waitlist', permission: 'waitlist:read' },
  { method: 'GET', path: `/api/admin/waitlist/${MISSING}`, pattern: '/api/admin/waitlist/:id', permission: 'waitlist:read' },
  { method: 'POST', path: `/api/admin/waitlist/${MISSING}/invite`, pattern: '/api/admin/waitlist/:id/invite', permission: 'waitlist:decide', body: {} },
  { method: 'POST', path: `/api/admin/waitlist/${MISSING}/reject`, pattern: '/api/admin/waitlist/:id/reject', permission: 'waitlist:decide' },
  { method: 'POST', path: `/api/admin/waitlist/${MISSING}/reopen`, pattern: '/api/admin/waitlist/:id/reopen', permission: 'waitlist:decide' },
  { method: 'POST', path: `/api/admin/waitlist/${MISSING}/remove`, pattern: '/api/admin/waitlist/:id/remove', permission: 'waitlist:remove' },
  { method: 'POST', path: '/api/admin/waitlist/bulk', pattern: '/api/admin/waitlist/bulk', permission: 'waitlist:decide', body: { ids: [MISSING], action: 'reject' } },
  { method: 'GET', path: '/api/admin/settings', pattern: '/api/admin/settings', permission: 'settings:read' },
  { method: 'PUT', path: '/api/admin/settings', pattern: '/api/admin/settings', permission: 'settings:manage', body: {} },
  { method: 'GET', path: '/api/admin/sessions', pattern: '/api/admin/sessions', permission: 'sessions:read' },
  { method: 'PUT', path: `/api/admin/sessions/${MISSING}/limits`, pattern: '/api/admin/sessions/:id/limits', permission: 'sessions:manage', body: { perDay: 1, perMinute: null } },
  { method: 'DELETE', path: `/api/admin/keys/${MISSING}`, pattern: '/api/admin/keys/:id', permission: 'sessions:manage' },
  { method: 'DELETE', path: `/api/admin/grants/${MISSING}`, pattern: '/api/admin/grants/:id', permission: 'sessions:manage' },
  { method: 'GET', path: '/api/admin/users', pattern: '/api/admin/users', permission: 'users:read' },
  { method: 'GET', path: `/api/admin/users/${MISSING}/role-events`, pattern: '/api/admin/users/:id/role-events', permission: 'users:read' },
  { method: 'PUT', path: `/api/admin/users/${MISSING}`, pattern: '/api/admin/users/:id', permission: 'users:manage', body: { disabled: true } },
  { method: 'PUT', path: `/api/admin/users/${MISSING}/role`, pattern: '/api/admin/users/:id/role', permission: 'roles:manage', body: { role: 'viewer' } },
];

beforeEach(() => build());

describe('admin route permissions', () => {
  it('lists every mounted admin route in the table (a new route needs a permission here)', () => {
    const mounted = app.routes
      .filter((r) => r.path.startsWith('/api/admin/') && r.method !== 'ALL')
      .map((r) => `${r.method} ${r.path}`);
    const known = new Set(ROUTES.map((r) => `${r.method} ${r.pattern}`));
    expect(mounted.filter((r) => !known.has(r))).toEqual([]);
    expect([...known].filter((r) => !mounted.includes(r))).toEqual([]);
  });

  for (const role of USER_ROLES) {
    it(`enforces the matrix for ${role}`, async () => {
      for (const route of ROUTES) {
        const res = await call(route.method, route.path, as[role], route.body);
        const label = `${role} ${route.method} ${route.pattern}`;
        if (hasPermission(role, route.permission)) expect({ label, status: res.status }).not.toEqual({ label, status: 403 });
        else expect({ label, status: res.status }).toEqual({ label, status: 403 });
      }
    });
  }

  it('reports role and permissions on /api/me', async () => {
    const me = async (role: UserRole) => (await (await call('GET', '/api/me', as[role])).json()) as { role: string; isAdmin: boolean; permissions: string[] };
    expect(await me('owner')).toMatchObject({ role: 'owner', isAdmin: true });
    expect((await me('owner')).permissions).toContain('roles:manage');
    expect(await me('support')).toMatchObject({ role: 'support', isAdmin: true });
    expect((await me('admin')).permissions).not.toContain('roles:manage');
    expect(await me('user')).toMatchObject({ role: 'user', isAdmin: false, permissions: [] });
  });
});

describe('role changes', () => {
  it('lets an owner change a role and audits who, when, from and to', async () => {
    const res = await call('PUT', `/api/admin/users/${id(5)}/role`, as.owner, { role: 'support' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: id(5), role: 'support', changed: true });
    expect((await accounts.findProfileByUserId(id(5)))?.role).toBe('support');
    // The promoted account acts with its new role straight away.
    expect((await call('GET', '/api/admin/waitlist', as.user)).status).toBe(200);

    const again = await call('PUT', `/api/admin/users/${id(5)}/role`, as.owner, { role: 'support' });
    expect(await again.json()).toMatchObject({ changed: false });

    const events = (await (await call('GET', `/api/admin/users/${id(5)}/role-events`, as.viewer)).json()) as {
      events: { changedBy: string; changedByEmail: string; fromRole: string; toRole: string; createdAt: string }[];
    };
    expect(events.events).toHaveLength(1);
    expect(events.events[0]).toMatchObject({ changedBy: id(1), changedByEmail: OWNER_EMAIL, fromRole: 'user', toRole: 'support' });
    expect(Number.isNaN(Date.parse(events.events[0]!.createdAt))).toBe(false);
  });

  it('refuses role changes from an admin (owner only) and writes no audit row', async () => {
    expect((await call('PUT', `/api/admin/users/${id(5)}/role`, as.admin, { role: 'admin' })).status).toBe(403);
    expect((await accounts.findProfileByUserId(id(5)))?.role).toBe('user');
    expect(await adminRepo.listUserRoleEvents(id(5))).toEqual([]);
  });

  it('never demotes an ADMIN_EMAILS owner', async () => {
    const res = await call('PUT', `/api/admin/users/${id(1)}/role`, as.owner, { role: 'user' });
    expect(res.status).toBe(409);
    const users = (await (await call('GET', '/api/admin/users', as.owner)).json()) as { users: { userId: string; role: string; bootstrapOwner: boolean }[] };
    expect(users.users.find((u) => u.userId === id(1))).toMatchObject({ role: 'owner', bootstrapOwner: true });
    expect(await adminRepo.listUserRoleEvents(id(1))).toEqual([]);
  });

  it('refuses to remove the last owner, and allows it once another owner exists', async () => {
    // The bootstrap owner signed in but never bound a number: it has no profile row to count.
    await build({ bootstrapProfile: false });
    expect((await call('PUT', `/api/admin/users/${id(2)}/role`, as.owner, { role: 'owner' })).status).toBe(200);
    expect((await call('GET', '/api/me', as.admin)).status).toBe(200);
    // id(2) is now the only owner with a profile: it cannot step down.
    const last = await call('PUT', `/api/admin/users/${id(2)}/role`, as.admin, { role: 'admin' });
    expect(last.status).toBe(409);
    expect((await accounts.findProfileByUserId(id(2)))?.role).toBe('owner');

    // A second stored owner makes the demotion safe.
    expect((await call('PUT', `/api/admin/users/${id(3)}/role`, as.admin, { role: 'owner' })).status).toBe(200);
    expect((await call('PUT', `/api/admin/users/${id(2)}/role`, as.admin, { role: 'admin' })).status).toBe(200);
    expect((await adminRepo.listUserRoleEvents(id(2))).map((e) => `${e.fromRole}>${e.toRole}`)).toEqual(['admin>owner', 'owner>admin']);
  });

  it('counts the bootstrap owner, so a stored owner may step down next to one', async () => {
    expect((await call('PUT', `/api/admin/users/${id(2)}/role`, as.owner, { role: 'owner' })).status).toBe(200);
    expect((await call('PUT', `/api/admin/users/${id(2)}/role`, as.admin, { role: 'viewer' })).status).toBe(200);
  });

  it('rejects an unknown role', async () => {
    expect((await call('PUT', `/api/admin/users/${id(5)}/role`, as.owner, { role: 'root' })).status).toBe(400);
  });
});

describe('disabling accounts', () => {
  it('protects owners: never the bootstrap one, a stored one only by an owner', async () => {
    expect((await call('PUT', `/api/admin/users/${id(1)}/role`, as.owner, { role: 'user' })).status).toBe(409);
    expect((await call('PUT', `/api/admin/users/${id(1)}`, as.admin, { disabled: true })).status).toBe(400);
    expect((await call('PUT', `/api/admin/users/${id(3)}/role`, as.owner, { role: 'owner' })).status).toBe(200);
    expect((await call('PUT', `/api/admin/users/${id(3)}`, as.admin, { disabled: true })).status).toBe(403);
    expect((await call('PUT', `/api/admin/users/${id(5)}`, as.admin, { disabled: true })).status).toBe(200);
    expect((await call('PUT', `/api/admin/users/${id(2)}`, as.admin, { disabled: true })).status).toBe(400);
  });

  it('does not let a non-owner drop an owner by removing their number', async () => {
    expect((await call('PUT', `/api/admin/users/${id(3)}/role`, as.owner, { role: 'owner' })).status).toBe(200);
    expect((await call('DELETE', `/api/admin/allowlist/${encodeURIComponent(phone(3))}`, as.admin)).status).toBe(409);
    expect((await call('DELETE', `/api/admin/allowlist/${encodeURIComponent(phone(1))}`, as.admin)).status).toBe(400);
  });
});
