import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { ApiError, joinWaitlist, listAllowlist, login, removeAllowlisted, signUp } from './bff';
import { clearSession, getSession } from './session';

const realFetch = globalThis.fetch;
let calls: Array<{ url: string; init?: RequestInit }> = [];

function mockFetch(status: number, body: unknown) {
  calls = [];
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(status === 204 ? null : JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
}

beforeEach(() => clearSession());
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('bff client', () => {
  it('stores the session on login and sends the bearer token on admin calls', async () => {
    mockFetch(200, { accessToken: 'at', refreshToken: 'rt', expiresIn: 3600, email: 'a@b.c', isAdmin: true });
    const session = await login('a@b.c', 'pw');
    expect(session.isAdmin).toBe(true);
    expect(getSession()?.token).toBe('at');

    mockFetch(200, { entries: [] });
    await listAllowlist();
    expect(new Headers(calls[0]?.init?.headers).get('Authorization')).toBe('Bearer at');
  });

  it('url-encodes the + of an E.164 number on delete', async () => {
    mockFetch(200, { accessToken: 'at', refreshToken: 'rt', expiresIn: 3600, email: 'a@b.c', isAdmin: true });
    await login('a@b.c', 'pw');
    mockFetch(204, null);
    await removeAllowlisted('+212600000042');
    expect(calls[0]?.url).toEndWith('/api/admin/allowlist/%2B212600000042');
  });

  it('surfaces the server error message and drops the session on 401', async () => {
    mockFetch(200, { accessToken: 'at', refreshToken: 'rt', expiresIn: 3600, email: 'a@b.c', isAdmin: false });
    await login('a@b.c', 'pw');
    mockFetch(401, { error: 'Session expired or invalid' });
    const err = await listAllowlist().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).toBe('Session expired or invalid');
    expect(getSession()).toBeNull();
  });

  it('carries the BFF error code on the ApiError', async () => {
    mockFetch(403, { error: 'This number has not been invited.', code: 'not_invited' });
    const err = (await signUp({ email: 'user@example.com', password: 'pw-pw-pw-pw', phone: '+212600000000' }).catch(
      (e) => e,
    )) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(403);
    expect(err.code).toBe('not_invited');
    expect(err.message).toBe('This number has not been invited.');

    mockFetch(500, { error: 'Internal server error' });
    expect(((await signUp({ email: 'user@example.com', password: 'x', phone: '' }).catch((e) => e)) as ApiError).code).toBeUndefined();
  });

  it('refuses admin calls with no session', async () => {
    mockFetch(200, {});
    const err = await listAllowlist().catch((e) => e);
    expect((err as ApiError).status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it('posts the waitlist sign-up anonymously, with no bearer token', async () => {
    mockFetch(201, { ok: true });
    await joinWaitlist({ email: 'a@b.c', waNumber: '', useCase: '', locale: 'en' });
    expect(calls[0]?.url).toEndWith('/waitlist');
    expect(calls[0]?.init?.method).toBe('POST');
    expect(new Headers(calls[0]?.init?.headers).get('Authorization')).toBeNull();
    expect(calls[0]?.init?.body).toBe(
      JSON.stringify({ email: 'a@b.c', waNumber: '', useCase: '', locale: 'en' }),
    );
  });

  it('posts the referral tag with the anonymous waitlist sign-up', async () => {
    mockFetch(201, { ok: true });
    await joinWaitlist({ email: 'a@b.c', waNumber: '', useCase: '', locale: 'en', ref: 'zawia' });
    expect(JSON.parse(String(calls[0]?.init?.body))).toMatchObject({ ref: 'zawia' });
    expect(new Headers(calls[0]?.init?.headers).get('Authorization')).toBeNull();
  });
});
