/**
 * Account self-service over the real app: every route acts on the caller only, password changes
 * re-check the current password, closure disables without deleting, and the forgot/reset flow
 * never reveals whether an address has an account.
 */
import { beforeEach, describe, expect, it } from 'bun:test';
import type {
  EmailChangeResult,
  IIdentityProvider,
  ISelfServiceIdentity,
  IdentityUser,
  IWhatsAppGateway,
  PasswordUpdateResult,
  SignInResult,
} from '../../../domain/ports/index.js';
import { HealthAggregator } from '../../../infrastructure/health/health-aggregator.js';
import { RuntimeSettingsService } from '../../../infrastructure/settings/runtime-settings.js';
import { CountingSendBudget, MemoryCounterStore } from '../../../infrastructure/send-budget/send-budget.js';
import { InMemoryAccountsRepository } from '../../persistence/in-memory-accounts.js';
import { InMemoryAdminRepository } from '../../persistence/in-memory-admin.js';
import { InMemoryWaTenancyRepository } from '../../persistence/in-memory-wa-tenancy.js';
import { createApp } from '../app.js';

const A = '22222222-0000-4000-8000-000000000001';
const B = '22222222-0000-4000-8000-000000000002';
const OWNER = '22222222-0000-4000-8000-000000000003';
const PASSWORDS: Record<string, string> = { [A]: 'old-password-a', [B]: 'old-password-b', [OWNER]: 'owner-password' };

/** Supabase Auth stand-in: tokens are `tok:<userId>`; records every self-service call. */
class FakeIdentity implements IIdentityProvider, ISelfServiceIdentity {
  users = new Map<string, IdentityUser>();
  calls: string[] = [];
  revoked = new Set<string>();
  emailResult: EmailChangeResult = 'sent';
  resetResult: 'sent' | 'rate_limited' = 'sent';

  async signUp(): Promise<never> {
    throw new Error('unused');
  }
  async signIn(email: string, password: string): Promise<SignInResult> {
    const user = [...this.users.values()].find((u) => u.email === email);
    if (!user || PASSWORDS[user.userId] !== password) return { status: 'invalid_credentials' };
    return { status: 'ok', user, tokens: { accessToken: `tok:${user.userId}`, refreshToken: 'r', expiresIn: 3600 } };
  }
  async refresh() {
    return null;
  }
  async getUser(token: string) {
    const id = token.replace(/^tok:/, '');
    return this.revoked.has(id) ? null : (this.users.get(id) ?? null);
  }
  async deleteUser() {}

  async updateEmail(token: string, email: string, redirectTo: string): Promise<EmailChangeResult> {
    this.calls.push(`email ${token} ${email} ${redirectTo}`);
    return this.emailResult;
  }
  async updatePassword(token: string, password: string): Promise<PasswordUpdateResult> {
    const id = token.replace(/^tok:/, '');
    if (!this.users.has(id)) return { status: 'invalid_token' };
    if (PASSWORDS[id] === password) return { status: 'same_password' };
    this.calls.push(`password ${token}`);
    PASSWORDS[id] = password;
    return { status: 'ok' };
  }
  async sendPasswordReset(email: string, redirectTo: string) {
    this.calls.push(`reset ${email} ${redirectTo}`);
    return this.resetResult;
  }
  async signOutAll(token: string) {
    this.calls.push(`signout ${token}`);
  }
}

let app: ReturnType<typeof createApp>;
let accounts: InMemoryAccountsRepository;
let identity: FakeIdentity;
let settings: RuntimeSettingsService;

const headers = (id: string) => ({ Authorization: `Bearer tok:${id}`, 'Content-Type': 'application/json' });
const call = (method: string, path: string, id: string | null, body?: unknown) =>
  app.request(path, {
    method,
    headers: id ? headers(id) : { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

beforeEach(async () => {
  PASSWORDS[A] = 'old-password-a';
  PASSWORDS[B] = 'old-password-b';
  accounts = new InMemoryAccountsRepository();
  identity = new FakeIdentity();
  const tenancy = new InMemoryWaTenancyRepository();
  const adminRepo = new InMemoryAdminRepository(accounts, tenancy);
  settings = new RuntimeSettingsService(
    adminRepo,
    { sendLimits: { perDay: 3, perMinute: 2 }, workflow: { minGapMs: 3000, maxPerMinuteSession: 6, maxPerMinuteContact: 2, backoffMs: 900000 } },
    0,
  );
  const budget = new CountingSendBudget(new MemoryCounterStore(), (sid) => settings.limitsFor(sid));
  const gateway = { listSessions: async () => [] } as unknown as IWhatsAppGateway;
  app = createApp({
    health: new HealthAggregator([]),
    accounts,
    identity,
    selfService: identity,
    webUrl: 'https://app.example.com/',
    adminEmails: ['owner@example.com'],
    corsOrigins: [],
    backoffice: { repo: adminRepo, settings, budget },
    wa: { gateway, tenancy, sendBudget: budget, openwaBaseUrl: 'http://engine:2785', publicApiUrl: 'https://api.example.test' },
  });
  for (const [n, id, email] of [[1, A, 'a@example.com'], [2, B, 'b@example.com'], [3, OWNER, 'owner@example.com']] as const) {
    identity.users.set(id, { userId: id, email, emailConfirmed: true });
    await accounts.addAllowlisted(`+21260000010${n}`, 'seed');
    await accounts.bindProfile({ userId: id, email, phoneE164: `+21260000010${n}` });
  }
});

describe('profile', () => {
  it('returns the caller own account, number read-only', async () => {
    const res = await call('GET', '/api/account', A);
    expect(await res.json()).toEqual({ email: 'a@example.com', displayName: null, phone: '+212600000101', closureRequestedAt: null });
  });

  it('sets, normalises and clears the display name of the caller only', async () => {
    const res = await call('PATCH', '/api/account/profile', A, { displayName: '  Amal   Example ' });
    expect(await res.json()).toEqual({ displayName: 'Amal Example' });
    expect((await accounts.findProfileByUserId(A))?.displayName).toBe('Amal Example');
    expect((await accounts.findProfileByUserId(B))?.displayName).toBeNull();
    const me = (await (await call('GET', '/api/me', A)).json()) as { displayName: string };
    expect(me.displayName).toBe('Amal Example');
    await call('PATCH', '/api/account/profile', A, { displayName: '' });
    expect((await accounts.findProfileByUserId(A))?.displayName).toBeNull();
  });

  it('rejects a too-long name and any attempt to target another user', async () => {
    expect((await call('PATCH', '/api/account/profile', A, { displayName: 'x'.repeat(81) })).status).toBe(400);
    const other = await call('PATCH', '/api/account/profile', A, { displayName: 'Hijack', userId: B });
    expect(other.status).toBe(400);
    expect((await accounts.findProfileByUserId(B))?.displayName).toBeNull();
  });

  it('needs a session', async () => {
    expect((await call('GET', '/api/account', null)).status).toBe(401);
    expect((await call('PATCH', '/api/account/profile', null, { displayName: 'x' })).status).toBe(401);
  });

  it('copies a confirmed e-mail change into the profile', async () => {
    identity.users.set(A, { userId: A, email: 'new-a@example.com', emailConfirmed: true });
    await call('GET', '/api/account', A);
    expect((await accounts.findProfileByUserId(A))?.email).toBe('new-a@example.com');
  });
});

describe('e-mail change', () => {
  it('starts the change with the caller token and the settings link', async () => {
    const res = await call('POST', '/api/account/email', A, { email: 'New-A@Example.com' });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ status: 'check_inbox', email: 'new-a@example.com' });
    expect(identity.calls).toEqual(['email tok:' + A + ' new-a@example.com https://app.example.com/settings']);
  });

  it('maps a taken address and refuses ADMIN_EMAILS owners', async () => {
    identity.emailResult = 'email_taken';
    const taken = await call('POST', '/api/account/email', A, { email: 'b@example.com' });
    expect(taken.status).toBe(409);
    expect(((await taken.json()) as { code: string }).code).toBe('email_taken');
    expect((await call('POST', '/api/account/email', OWNER, { email: 'x@example.com' })).status).toBe(409);
  });
});

describe('password change', () => {
  it('re-checks the current password before changing it', async () => {
    const wrong = await call('POST', '/api/account/password', A, { currentPassword: 'nope', newPassword: 'new-password-1' });
    expect(wrong.status).toBe(400);
    expect(((await wrong.json()) as { code: string }).code).toBe('wrong_password');
    expect(identity.calls).toEqual([]);

    const ok = await call('POST', '/api/account/password', A, { currentPassword: 'old-password-a', newPassword: 'new-password-1' });
    expect(ok.status).toBe(200);
    expect(identity.calls).toEqual([`password tok:${A}`]);
    expect(PASSWORDS[B]).toBe('old-password-b');
  });

  it("does not accept another user's current password", async () => {
    const res = await call('POST', '/api/account/password', A, { currentPassword: 'old-password-b', newPassword: 'new-password-1' });
    expect(res.status).toBe(400);
  });

  it('applies the sign-up strength rule and refuses the same password', async () => {
    expect((await call('POST', '/api/account/password', A, { currentPassword: 'old-password-a', newPassword: 'short' })).status).toBe(400);
    const same = await call('POST', '/api/account/password', A, { currentPassword: 'old-password-a', newPassword: 'old-password-a' });
    expect(((await same.json()) as { code: string }).code).toBe('same_password');
  });
});

describe('sessions and closure', () => {
  it('signs the caller out of every device', async () => {
    expect((await call('POST', '/api/account/sign-out-all', A)).status).toBe(204);
    expect(identity.calls).toEqual([`signout tok:${A}`]);
  });

  it('flags closure, disables the account and keeps every row (KEEP ALL DATA)', async () => {
    const res = await call('POST', '/api/account/closure', A);
    expect(res.status).toBe(202);
    const profile = await accounts.findProfileByUserId(A);
    expect(profile).not.toBeNull();
    expect(profile?.closureRequestedAt).toBeInstanceOf(Date);
    expect(await settings.isUserDisabled(A)).toBe(true);
    expect(await settings.isUserDisabled(B)).toBe(false);
    expect(identity.calls).toContain(`signout tok:${A}`);
    // The disabled account is refused afterwards; the admin sees the request in the Users tab.
    expect((await call('GET', '/api/account', A)).status).toBe(403);
    const users = (await (await call('GET', '/api/admin/users', OWNER)).json()) as { users: { userId: string; closureRequestedAt: string | null; disabled: boolean }[] };
    expect(users.users.find((u) => u.userId === A)).toMatchObject({ disabled: true });
    expect(users.users.find((u) => u.userId === A)?.closureRequestedAt).toBeTruthy();
    expect(users.users.find((u) => u.userId === B)?.closureRequestedAt).toBeNull();
  });

  it('refuses closure for an ADMIN_EMAILS owner', async () => {
    expect((await call('POST', '/api/account/closure', OWNER)).status).toBe(409);
  });
});

describe('forgot and reset password', () => {
  it('answers the same for known and unknown addresses and links to /auth/reset', async () => {
    const known = await call('POST', '/auth/forgot', null, { email: 'a@example.com' });
    const unknown = await call('POST', '/auth/forgot', null, { email: 'nobody@example.com' });
    expect([known.status, unknown.status]).toEqual([202, 202]);
    expect(await known.json()).toEqual(await unknown.json());
    expect(identity.calls[0]).toBe('reset a@example.com https://app.example.com/auth/reset');
  });

  it('sets a new password from a valid recovery token and refuses an invalid one', async () => {
    const ok = await call('POST', '/auth/reset', null, { accessToken: `tok:${A}`, password: 'brand-new-pass' });
    expect(ok.status).toBe(200);
    expect(PASSWORDS[A]).toBe('brand-new-pass');
    const bad = await call('POST', '/auth/reset', null, { accessToken: 'tok:unknown', password: 'brand-new-pass' });
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { code: string }).code).toBe('reset_link_invalid');
    expect((await call('POST', '/auth/reset', null, { accessToken: `tok:${A}`, password: 'short' })).status).toBe(400);
  });
});
