import { describe, it, expect, beforeEach } from 'bun:test';
import type {
  IIdentityProvider,
  IdentityUser,
  SignInResult,
  SignUpResult,
} from '../../domain/ports/index.js';
import { InMemoryAccountsRepository } from '../persistence/in-memory-accounts.js';
import { InMemoryWaitlistRepository } from '../persistence/in-memory-waitlist.js';
import { HealthAggregator } from '../../infrastructure/health/health-aggregator.js';
import { createApp } from './app.js';

/** Fake Supabase Auth: users and bearer tokens kept in memory. */
class FakeIdentity implements IIdentityProvider {
  users = new Map<string, IdentityUser & { password: string }>();
  deleted: string[] = [];
  signUpCalls = 0;
  private seq = 0;

  async signUp(email: string, password: string): Promise<SignUpResult> {
    this.signUpCalls++;
    if ([...this.users.values()].some((u) => u.email === email)) return { status: 'exists' };
    const userId = `00000000-0000-4000-8000-${String(++this.seq).padStart(12, '0')}`;
    this.users.set(userId, { userId, email, emailConfirmed: false, password });
    return { status: 'created', userId, emailConfirmationRequired: true };
  }

  async signIn(email: string, password: string): Promise<SignInResult> {
    const u = [...this.users.values()].find((x) => x.email === email && x.password === password);
    if (!u) return { status: 'invalid_credentials' };
    if (!u.emailConfirmed) return { status: 'email_not_confirmed' };
    return {
      status: 'ok',
      tokens: { accessToken: `tok:${u.userId}`, refreshToken: `ref:${u.userId}`, expiresIn: 3600 },
      user: u,
    };
  }

  async refresh() {
    return null;
  }

  async getUser(accessToken: string): Promise<IdentityUser | null> {
    return this.users.get(accessToken.replace(/^tok:/, '')) ?? null;
  }

  async deleteUser(userId: string): Promise<void> {
    this.deleted.push(userId);
    this.users.delete(userId);
  }

  /** Test helper: create a confirmed user and return its bearer header. */
  confirmed(email: string): { Authorization: string } {
    const userId = `11111111-0000-4000-8000-${String(++this.seq).padStart(12, '0')}`;
    this.users.set(userId, { userId, email, emailConfirmed: true, password: 'pw-pw-pw-pw' });
    return { Authorization: `Bearer tok:${userId}` };
  }
}

const ADMIN = 'admin@example.com';
const NUMBER = '+212600000042';

let accounts: InMemoryAccountsRepository;
let identity: FakeIdentity;
let waitlist: InMemoryWaitlistRepository;
let app: ReturnType<typeof createApp>;

function build(
  authLimit = { limit: 1000, windowSeconds: 60 },
  waitlistLimit = { limit: 1000, windowSeconds: 60 },
) {
  accounts = new InMemoryAccountsRepository();
  identity = new FakeIdentity();
  waitlist = new InMemoryWaitlistRepository();
  app = createApp({
    health: new HealthAggregator([]),
    accounts,
    identity,
    adminEmails: [ADMIN],
    corsOrigins: [],
    authRateLimit: authLimit,
    waitlistRateLimit: waitlistLimit,
    waitlist,
  });
}

const json = (body: unknown, headers: Record<string, string> = {}) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify(body),
});

const signUp = (phone: string, email = 'user@example.com') =>
  app.request('/auth/signup', json({ email, password: 'correct-horse', phone }));

beforeEach(() => build());

describe('sign-up allowlist', () => {
  it('refuses a number that is not on the allowlist', async () => {
    const res = await signUp(NUMBER);
    expect(res.status).toBe(403);
    expect(identity.signUpCalls).toBe(0);
    expect(await accounts.findProfileByPhone(NUMBER)).toBeNull();
  });

  it('accepts an allowlisted number and binds it to the new user', async () => {
    await accounts.addAllowlisted(NUMBER, ADMIN);
    const res = await signUp('+212 600-000-042', 'User@Example.com');
    expect(res.status).toBe(201);
    const body = (await res.json()) as { phone: string; emailConfirmationRequired: boolean };
    expect(body.phone).toBe(NUMBER);
    const profile = await accounts.findProfileByPhone(NUMBER);
    expect(profile?.email).toBe('user@example.com');
  });

  it('rejects a malformed or national-format number', async () => {
    await accounts.addAllowlisted(NUMBER, ADMIN);
    expect((await signUp('0600000042')).status).toBe(400);
    expect(identity.signUpCalls).toBe(0);
  });

  it('refuses a second account for the same number', async () => {
    await accounts.addAllowlisted(NUMBER, ADMIN);
    expect((await signUp(NUMBER, 'a@example.com')).status).toBe(201);
    expect((await signUp(NUMBER, 'b@example.com')).status).toBe(409);
    expect(identity.users.size).toBe(1);
  });

  it('does not bind when the email is already registered', async () => {
    await accounts.addAllowlisted(NUMBER, ADMIN);
    await accounts.addAllowlisted('+212600000000', ADMIN);
    expect((await signUp(NUMBER, 'a@example.com')).status).toBe(201);
    expect((await signUp('+212600000000', 'a@example.com')).status).toBe(409);
    expect(await accounts.findProfileByPhone('+212600000000')).toBeNull();
  });

  it('rolls back the login when the number is taken in a race', async () => {
    await accounts.addAllowlisted(NUMBER, ADMIN);
    // Another request claims the number between the pre-check and the bind.
    const original = accounts.findProfileByPhone.bind(accounts);
    accounts.findProfileByPhone = async (p) => {
      const found = await original(p);
      if (!found) await accounts.bindProfile({ userId: 'other', email: 'o@example.com', phoneE164: p });
      return found;
    };
    const res = await signUp(NUMBER, 'late@example.com');
    expect(res.status).toBe(409);
    expect(identity.deleted).toHaveLength(1);
    expect(identity.users.size).toBe(0);
  });

  it('rolls back the login when the bind throws', async () => {
    await accounts.addAllowlisted(NUMBER, ADMIN);
    accounts.bindProfile = async () => {
      throw new Error('db unavailable');
    };
    const res = await signUp(NUMBER, 'boom@example.com');
    expect(res.status).toBe(500);
    expect(identity.deleted).toHaveLength(1);
    expect(identity.users.size).toBe(0);
  });

  it('throttles repeated unauthenticated attempts per client IP', async () => {
    build({ limit: 2, windowSeconds: 60 });
    const call = () =>
      app.request('/auth/login', json({ email: 'x@example.com', password: 'nope' }, { 'cf-connecting-ip': '1.2.3.4' }));
    expect((await call()).status).toBe(401);
    expect((await call()).status).toBe(401);
    expect((await call()).status).toBe(429);
  });
});

describe('request validation', () => {
  it('returns a string error, not the raw ZodError, for an invalid body', async () => {
    const res = await app.request('/auth/signup', json({ email: 'a@b', password: 'correct-horse', phone: NUMBER }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: unknown };
    expect(typeof body.error).toBe('string');
    expect(body.error).toBeTruthy();
  });
});

describe('auth error codes', () => {
  const codeOf = async (res: Response) => {
    const body = (await res.json()) as { error: unknown; code?: string };
    expect(typeof body.error).toBe('string');
    return { status: res.status, code: body.code };
  };

  it('tags every sign-up refusal with a stable code next to the English message', async () => {
    expect(await codeOf(await signUp(NUMBER))).toEqual({ status: 403, code: 'not_invited' });

    await accounts.addAllowlisted(NUMBER, ADMIN);
    expect(await codeOf(await signUp('0600000042'))).toEqual({ status: 400, code: 'invalid_phone' });
    expect((await signUp(NUMBER, 'a@example.com')).status).toBe(201);
    expect(await codeOf(await signUp(NUMBER, 'b@example.com'))).toEqual({ status: 409, code: 'phone_taken' });

    await accounts.addAllowlisted('+212600000000', ADMIN);
    expect(await codeOf(await signUp('+212600000000', 'a@example.com'))).toEqual({
      status: 409,
      code: 'email_taken',
    });
  });

  it('maps identity-provider refusals to weak_password and rate_limited', async () => {
    await accounts.addAllowlisted(NUMBER, ADMIN);
    identity.signUp = async () => ({ status: 'weak_password', message: 'Password should be stronger' });
    const weak = await signUp(NUMBER);
    expect(weak.status).toBe(400);
    expect(await weak.json()).toEqual({ error: 'Password should be stronger', code: 'weak_password' });

    identity.signUp = async () => ({ status: 'rate_limited' });
    expect(await codeOf(await signUp(NUMBER))).toEqual({ status: 429, code: 'rate_limited' });
  });

  it('tags an invalid body with invalid_input', async () => {
    const res = await app.request('/auth/signup', json({ email: 'a@b', password: 'correct-horse', phone: NUMBER }));
    expect(await codeOf(res)).toEqual({ status: 400, code: 'invalid_input' });
  });

  it('tags the per-IP auth throttle with rate_limited', async () => {
    build({ limit: 1, windowSeconds: 60 });
    const call = () =>
      app.request('/auth/login', json({ email: 'x@example.com', password: 'nope' }, { 'cf-connecting-ip': '1.2.3.4' }));
    await call();
    expect(await codeOf(await call())).toEqual({ status: 429, code: 'rate_limited' });
  });

  it('tags login and refresh refusals', async () => {
    const bad = await app.request('/auth/login', json({ email: 'x@example.com', password: 'bad' }));
    expect(await codeOf(bad)).toEqual({ status: 401, code: 'invalid_credentials' });

    await accounts.addAllowlisted(NUMBER, ADMIN);
    await signUp(NUMBER);
    const unconfirmed = await app.request('/auth/login', json({ email: 'user@example.com', password: 'correct-horse' }));
    expect(await codeOf(unconfirmed)).toEqual({ status: 403, code: 'email_not_confirmed' });

    const expired = await app.request('/auth/refresh', json({ refreshToken: 'ref:gone' }));
    expect(await codeOf(expired)).toEqual({ status: 401, code: 'session_expired' });
  });

  it('keeps the plain { error } envelope for routes without a code', async () => {
    const res = await app.request('/api/me');
    expect(res.status).toBe(401);
    expect(Object.keys((await res.json()) as object)).toEqual(['error']);
  });
});

describe('login', () => {
  it('requires a confirmed email and reports admin status', async () => {
    await accounts.addAllowlisted(NUMBER, ADMIN);
    await signUp(NUMBER, ADMIN);
    const body = { email: ADMIN, password: 'correct-horse' };
    expect((await app.request('/auth/login', json(body))).status).toBe(403);

    [...identity.users.values()][0]!.emailConfirmed = true;
    const ok = await app.request('/auth/login', json(body));
    expect(ok.status).toBe(200);
    const tokens = (await ok.json()) as { accessToken: string; isAdmin: boolean };
    expect(tokens.isAdmin).toBe(true);
    expect(tokens.accessToken).toStartWith('tok:');
  });

  it('rejects wrong credentials with 401', async () => {
    const res = await app.request('/auth/login', json({ email: 'x@example.com', password: 'bad' }));
    expect(res.status).toBe(401);
  });
});

describe('auth middleware', () => {
  it('returns 401, not 500, when the Authorization header is missing', async () => {
    const res = await app.request('/api/me');
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: string }).error).toContain('Authorization');
  });

  it('returns 401 for a malformed header or an unknown token', async () => {
    expect((await app.request('/api/me', { headers: { Authorization: 'Basic abc' } })).status).toBe(401);
    expect((await app.request('/api/me', { headers: { Authorization: 'Bearer tok:nope' } })).status).toBe(401);
  });

  it('serves /api/me with the bound number', async () => {
    await accounts.addAllowlisted(NUMBER, ADMIN);
    await signUp(NUMBER);
    const [user] = [...identity.users.values()];
    user!.emailConfirmed = true;
    const res = await app.request('/api/me', { headers: { Authorization: `Bearer tok:${user!.userId}` } });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ email: 'user@example.com', isAdmin: false, phone: NUMBER });
  });
});

describe('admin routes', () => {
  it('rejects unauthenticated callers with 401', async () => {
    expect((await app.request('/api/admin/allowlist')).status).toBe(401);
  });

  it('forbids non-admin users on every admin route', async () => {
    const headers = identity.confirmed('user@example.com');
    expect((await app.request('/api/admin/allowlist', { headers })).status).toBe(403);
    expect((await app.request('/api/admin/allowlist', json({ phone: NUMBER }, headers))).status).toBe(403);
    expect(
      (await app.request(`/api/admin/allowlist/${encodeURIComponent(NUMBER)}`, { method: 'DELETE', headers })).status,
    ).toBe(403);
    expect(await accounts.isAllowlisted(NUMBER)).toBe(false);
  });

  it('does not grant admin to an unconfirmed admin email', async () => {
    const userId = '22222222-0000-4000-8000-000000000001';
    identity.users.set(userId, { userId, email: ADMIN, emailConfirmed: false, password: 'x' });
    const res = await app.request('/api/admin/allowlist', { headers: { Authorization: `Bearer tok:${userId}` } });
    expect(res.status).toBe(403);
  });

  it('lets an admin add, list and remove numbers', async () => {
    const headers = identity.confirmed(ADMIN);

    const added = await app.request('/api/admin/allowlist', json({ phone: '+212 600 000 042' }, headers));
    expect(added.status).toBe(201);
    expect(((await added.json()) as { phone: string }).phone).toBe(NUMBER);
    expect((await app.request('/api/admin/allowlist', json({ phone: NUMBER }, headers))).status).toBe(200);

    const list = (await (await app.request('/api/admin/allowlist', { headers })).json()) as {
      entries: Array<{ phoneE164: string; addedBy: string; boundEmail: string | null }>;
    };
    expect(list.entries).toHaveLength(1);
    expect(list.entries[0]).toMatchObject({ phoneE164: NUMBER, addedBy: ADMIN, boundEmail: null });

    expect((await app.request('/api/admin/allowlist', json({ phone: '0629' }, headers))).status).toBe(400);

    const del = await app.request(`/api/admin/allowlist/${encodeURIComponent(NUMBER)}`, { method: 'DELETE', headers });
    expect(del.status).toBe(204);
    expect(
      (await app.request(`/api/admin/allowlist/${encodeURIComponent(NUMBER)}`, { method: 'DELETE', headers })).status,
    ).toBe(404);
  });

  it('removing a number revokes its binding and blocks later sign-ups', async () => {
    const headers = identity.confirmed(ADMIN);
    await accounts.addAllowlisted(NUMBER, ADMIN);
    await signUp(NUMBER);
    await app.request(`/api/admin/allowlist/${encodeURIComponent(NUMBER)}`, { method: 'DELETE', headers });
    expect(await accounts.findProfileByPhone(NUMBER)).toBeNull();
    expect((await signUp(NUMBER, 'again@example.com')).status).toBe(403);
  });
});

describe('admin waitlist', () => {
  const seed = (email: string, waNumber: string | null = NUMBER) =>
    waitlist.add({ email, waNumber, useCase: null, locale: 'en' });

  async function list(headers: Record<string, string>, query = '') {
    const res = await app.request(`/api/admin/waitlist${query}`, { headers });
    expect(res.status).toBe(200);
    return (await res.json()) as {
      entries: Array<{ id: string; email: string; status: string }>;
      total: number;
      limit: number;
      offset: number;
      sourceCounts: Array<{ field: string; value: string; total: number; last7Days: number }>;
    };
  }

  const invite = (id: string, body: unknown, headers: Record<string, string>) =>
    app.request(`/api/admin/waitlist/${id}/invite`, json(body, headers));
  const action = (id: string, name: string, headers: Record<string, string>) =>
    app.request(`/api/admin/waitlist/${id}/${name}`, json({}, headers));

  it('rejects unauthenticated callers with 401', async () => {
    expect((await app.request('/api/admin/waitlist')).status).toBe(401);
    expect((await app.request('/api/admin/waitlist/00000000-0000-4000-8000-000000000009/invite', json({}))).status).toBe(
      401,
    );
  });

  it('forbids non-admin users on both routes', async () => {
    await seed('lead@example.com');
    const user = identity.confirmed('user@example.com');
    const adminHeaders = identity.confirmed(ADMIN);
    const { id } = (await list(adminHeaders)).entries[0]!;

    expect((await app.request('/api/admin/waitlist', { headers: user })).status).toBe(403);
    expect((await invite(id, {}, user)).status).toBe(403);
    expect((await action(id, 'reject', user)).status).toBe(403);
    expect((await action(id, 'remove', user)).status).toBe(403);
    expect((await app.request(`/api/admin/waitlist/${id}`, { headers: user })).status).toBe(403);
    expect((await app.request('/api/admin/waitlist/bulk', json({ ids: [id], action: 'reject' }, user))).status).toBe(403);

    // Nothing was invited while the caller was refused.
    expect(await accounts.isAllowlisted(NUMBER)).toBe(false);
    expect((await list(adminHeaders)).entries[0]).toMatchObject({ id, status: 'pending' });
  });

  it('paginates newest entries and filters by status', async () => {
    const adminHeaders = identity.confirmed(ADMIN);
    await seed('a@example.com');
    await seed('b@example.com');
    await seed('c@example.com');

    const first = await list(adminHeaders, '?limit=2');
    expect(first).toMatchObject({ total: 3, limit: 2, offset: 0 });
    expect(first.entries).toHaveLength(2);
    const second = await list(adminHeaders, '?limit=2&offset=2');
    expect(second.entries).toHaveLength(1);
    expect(new Set([...first.entries, ...second.entries].map((e) => e.email))).toEqual(
      new Set(['a@example.com', 'b@example.com', 'c@example.com']),
    );

    expect((await invite(first.entries[0]!.id, {}, adminHeaders)).status).toBe(201);
    expect((await list(adminHeaders, '?status=pending')).total).toBe(2);
    const invited = await list(adminHeaders, '?status=invited');
    expect(invited.total).toBe(1);
    expect(invited.entries[0]!.email).toBe(first.entries[0]!.email);
  });

  it('returns only aggregate campaign counts with total and last-seven-day values', async () => {
    const adminHeaders = identity.confirmed(ADMIN);
    await waitlist.add({
      email: 'source-a@example.com', waNumber: null, useCase: null, locale: 'en',
      sourceRef: 'zawia', utmSource: 'community', utmCampaign: 'launch',
    });
    const result = await list(adminHeaders);
    expect(result.sourceCounts).toEqual([
      { field: 'ref', value: 'zawia', total: 1, last7Days: 1 },
      { field: 'utm_campaign', value: 'launch', total: 1, last7Days: 1 },
      { field: 'utm_source', value: 'community', total: 1, last7Days: 1 },
    ]);
    expect(JSON.stringify(result.sourceCounts)).not.toContain('source-a@example.com');
  });

  it('limits in-memory source counts to the top 20 values per field in descending order', async () => {
    const fields = [
      ['ref', 'sourceRef'],
      ['source', 'utmSource'],
      ['campaign', 'utmCampaign'],
    ] as const;
    for (const [prefix, field] of fields) {
      for (let total = 2; total <= 22; total++) {
        for (let i = 0; i < total; i++) {
          await waitlist.add({
            email: `${prefix}-${total}-${i}@example.com`, waNumber: null, useCase: null, locale: 'en',
            ...(field === 'sourceRef' ? { sourceRef: `${prefix}-${total}` } : {}),
            ...(field === 'utmSource' ? { utmSource: `${prefix}-${total}` } : {}),
            ...(field === 'utmCampaign' ? { utmCampaign: `${prefix}-${total}` } : {}),
          });
        }
      }
    }
    const counts = await waitlist.sourceCounts();
    for (const field of ['ref', 'utm_source', 'utm_campaign']) {
      const values = counts.filter((count) => count.field === field);
      expect(values).toHaveLength(20);
      expect(values.map((item) => item.total)).toEqual(Array.from({ length: 20 }, (_, i) => 22 - i));
    }
  });

  it('refuses an out-of-range page or an unknown status', async () => {
    const adminHeaders = identity.confirmed(ADMIN);
    expect((await app.request('/api/admin/waitlist?limit=0', { headers: adminHeaders })).status).toBe(400);
    expect((await app.request('/api/admin/waitlist?status=nope', { headers: adminHeaders })).status).toBe(400);
  });

  it('invites a lead: allowlist first, then marks the entry invited', async () => {
    const adminHeaders = identity.confirmed(ADMIN);
    await seed('lead@example.com');
    const { id } = (await list(adminHeaders)).entries[0]!;

    const res = await invite(id, {}, adminHeaders);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id, phone: NUMBER, created: true, status: 'invited' });
    expect(await accounts.isAllowlisted(NUMBER)).toBe(true);
    expect((await list(adminHeaders)).entries[0]).toMatchObject({ id, status: 'invited' });
  });

  it('is idempotent: inviting twice adds no second number', async () => {
    const adminHeaders = identity.confirmed(ADMIN);
    await seed('twice@example.com');
    const { id } = (await list(adminHeaders)).entries[0]!;

    expect((await invite(id, {}, adminHeaders)).status).toBe(201);
    const again = await invite(id, {}, adminHeaders);
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ id, phone: NUMBER, created: false, status: 'invited' });

    const allowlist = await accounts.listAllowlist();
    expect(allowlist).toHaveLength(1);
    expect(allowlist[0]).toMatchObject({ phoneE164: NUMBER, addedBy: ADMIN });
    expect((await list(adminHeaders, '?status=invited')).total).toBe(1);
  });

  it('takes the number in the body when the lead did not give one', async () => {
    const adminHeaders = identity.confirmed(ADMIN);
    await seed('nonum@example.com', null);
    const { id } = (await list(adminHeaders)).entries[0]!;

    const missing = await invite(id, {}, adminHeaders);
    expect(missing.status).toBe(400);
    expect(((await missing.json()) as { error: string }).error).toContain('no WhatsApp number');
    expect((await list(adminHeaders)).entries[0]!.status).toBe('pending');

    const ok = await invite(id, { phone: '+212 600-000-042' }, adminHeaders);
    expect(ok.status).toBe(201);
    expect(await ok.json()).toMatchObject({ phone: NUMBER, created: true });
    expect(await accounts.isAllowlisted(NUMBER)).toBe(true);
    const details = await app.request(`/api/admin/waitlist/${id}`, { headers: adminHeaders });
    expect(await details.json()).toMatchObject({
      entry: { id, status: 'invited', invitedAt: expect.any(String) },
      events: [{ action: 'invited', fromStatus: 'pending', toStatus: 'invited' }],
    });
  });

  it('rejects a malformed invite number and an unknown entry', async () => {
    const adminHeaders = identity.confirmed(ADMIN);
    await seed('bad@example.com', null);
    const { id } = (await list(adminHeaders)).entries[0]!;

    expect((await invite(id, { phone: '0629' }, adminHeaders)).status).toBe(400);
    expect(await accounts.isAllowlisted(NUMBER)).toBe(false);
    expect((await list(adminHeaders)).entries[0]!.status).toBe('pending');

    expect((await invite('00000000-0000-4000-8000-000000000009', {}, adminHeaders)).status).toBe(404);
  });

  it('searches email and number and exposes the full lead details', async () => {
    const adminHeaders = identity.confirmed(ADMIN);
    await waitlist.add({
      email: 'details@example.com',
      waNumber: NUMBER,
      useCase: 'Order updates',
      locale: 'fr',
      sourceRef: 'community',
      utmSource: 'facebook',
      utmCampaign: 'october',
    });
    const byEmail = await list(adminHeaders, '?search=DETAILS%40');
    expect(byEmail.entries).toHaveLength(1);
    const byNumber = await list(adminHeaders, '?search=600000042');
    expect(byNumber.entries).toHaveLength(1);
    const detail = await app.request(`/api/admin/waitlist/${byEmail.entries[0]!.id}`, { headers: adminHeaders });
    expect(await detail.json()).toMatchObject({
      entry: {
        email: 'details@example.com',
        waNumber: NUMBER,
        useCase: 'Order updates',
        sourceRef: 'community',
        utmSource: 'facebook',
        utmCampaign: 'october',
      },
      events: [],
    });
  });

  it('rejects, reopens, and soft-removes a lead while keeping its data and audit history', async () => {
    const adminHeaders = identity.confirmed(ADMIN);
    await waitlist.add({
      email: 'retained@example.com',
      waNumber: NUMBER,
      useCase: 'Keep this note',
      locale: 'en',
      sourceRef: 'referral',
      utmSource: 'community',
      utmCampaign: 'launch',
    });
    const id = (await list(adminHeaders)).entries[0]!.id;

    expect((await action(id, 'reject', adminHeaders)).status).toBe(200);
    expect((await list(adminHeaders, '?status=rejected')).entries[0]).toMatchObject({ id, status: 'rejected' });
    expect((await action(id, 'reopen', adminHeaders)).status).toBe(200);
    expect((await action(id, 'remove', adminHeaders)).status).toBe(200);
    expect((await action(id, 'remove', adminHeaders)).status).toBe(409);

    const removed = await list(adminHeaders, '?status=removed');
    expect(removed.entries[0]).toMatchObject({ id, status: 'removed', email: 'retained@example.com' });
    const detail = await app.request(`/api/admin/waitlist/${id}`, { headers: adminHeaders });
    expect(await detail.json()).toMatchObject({
      entry: { id, useCase: 'Keep this note', sourceRef: 'referral', removedAt: expect.any(String) },
      events: [
        { action: 'rejected', fromStatus: 'pending', toStatus: 'rejected', adminId: expect.any(String) },
        { action: 'reopened', fromStatus: 'rejected', toStatus: 'pending' },
        { action: 'removed', fromStatus: 'pending', toStatus: 'removed' },
      ],
    });
  });

  it('bulk-approves and bulk-rejects only pending leads', async () => {
    const adminHeaders = identity.confirmed(ADMIN);
    await seed('bulk-a@example.com');
    await seed('bulk-b@example.com');
    const ids = (await list(adminHeaders, '?limit=2')).entries.map((entry) => entry.id);

    const approved = await app.request('/api/admin/waitlist/bulk', json({ ids, action: 'approve' }, adminHeaders));
    expect(approved.status).toBe(200);
    expect((await approved.json() as { results: Array<{ id: string; status: string }> }).results).toEqual(ids.map((id) => ({ id, status: 'invited' })));
    expect(await accounts.isAllowlisted(NUMBER)).toBe(true);

    await seed('bulk-c@example.com');
    const pendingIds = (await list(adminHeaders, '?status=pending')).entries.map((entry) => entry.id);
    const rejected = await app.request('/api/admin/waitlist/bulk', json({ ids: pendingIds, action: 'reject' }, adminHeaders));
    expect(rejected.status).toBe(200);
    expect((await list(adminHeaders, '?status=rejected')).total).toBe(1);
  });
});

describe('public waitlist', () => {
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    app.request('/waitlist', json(body, headers));

  it('stores a lead, normalising the number and defaulting the locale', async () => {
    const res = await post({
      email: 'Visitor@Example.com',
      waNumber: '+212 600-000-042',
      ref: 'zawia',
      utm_source: 'Facebook',
      utm_campaign: 'launch-2026',
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true });
    expect(waitlist.all()).toHaveLength(1);
    expect(waitlist.all()[0]).toMatchObject({
      email: 'visitor@example.com',
      waNumber: NUMBER,
      useCase: null,
      locale: 'en',
      sourceRef: 'zawia',
      utmSource: 'facebook',
      utmCampaign: 'launch-2026',
    });
  });

  it('drops invalid campaign tags without rejecting the sign-up', async () => {
    const res = await post({
      email: 'tagged@example.com',
      ref: 'bad tag',
      utm_source: 'A'.repeat(65),
      utm_campaign: 42,
    });
    expect(res.status).toBe(201);
    expect(waitlist.all()[0]).toMatchObject({ sourceRef: null, utmSource: null, utmCampaign: null });
  });

  it('accepts a lead without a number and keeps the note and locale', async () => {
    const res = await post({ email: 'a@example.com', useCase: 'Order confirmations', locale: 'fr' });
    expect(res.status).toBe(201);
    expect(waitlist.all()[0]).toMatchObject({ waNumber: null, useCase: 'Order confirmations', locale: 'fr' });
  });

  it('is idempotent on the address and never reveals whether it was already there', async () => {
    expect((await post({ email: 'dup@example.com', useCase: 'first' })).status).toBe(201);
    expect((await post({ email: 'DUP@example.com', useCase: 'second' })).status).toBe(201);
    expect(waitlist.all()).toHaveLength(1);
    expect(waitlist.all()[0]!.useCase).toBe('first');
  });

  it('rejects a national-format number with a format hint', async () => {
    const res = await post({ email: 'a@example.com', waNumber: '0600000042' });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain('international format');
    expect(waitlist.all()).toHaveLength(0);
  });

  it('rejects a malformed email or locale with a string error', async () => {
    for (const body of [{ email: 'nope' }, { email: 'a@example.com', locale: 'not a locale!' }]) {
      const res = await post(body);
      expect(res.status).toBe(400);
      expect(typeof ((await res.json()) as { error: unknown }).error).toBe('string');
    }
    expect(waitlist.all()).toHaveLength(0);
  });

  it('throttles repeated submissions per client IP', async () => {
    build(undefined, { limit: 2, windowSeconds: 60 });
    const call = () => post({ email: 'a@example.com' }, { 'cf-connecting-ip': '9.9.9.9' });
    expect((await call()).status).toBe(201);
    expect((await call()).status).toBe(201);
    expect((await call()).status).toBe(429);
  });

  it('is not mounted when no storage is wired', async () => {
    const bare = createApp({
      health: new HealthAggregator([]),
      accounts: new InMemoryAccountsRepository(),
      identity: new FakeIdentity(),
      adminEmails: [],
      corsOrigins: [],
    });
    expect((await bare.request('/waitlist', json({ email: 'a@example.com' }))).status).toBe(404);
  });
});
