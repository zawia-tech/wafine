/**
 * Supabase Auth (GoTrue) adapter. The anon key is used for end-user calls (sign-up,
 * sign-in, refresh, resolve token, and the self-service calls made with the user's own access
 * token); the service-role key is used only for `deleteUser`. Neither key ever leaves the BFF.
 */

import type {
  EmailChangeResult,
  IIdentityProvider,
  ISelfServiceIdentity,
  IdentityUser,
  PasswordUpdateResult,
  SignInResult,
  SignUpResult,
  TokenSet,
} from '../../domain/ports/index.js';

export interface SupabaseIdentityConfig {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
  fetchImpl?: typeof fetch;
}

interface GoTrueUser {
  id: string;
  email?: string;
  email_confirmed_at?: string | null;
  identities?: unknown[] | null;
}

interface GoTrueSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: GoTrueUser;
}

export class SupabaseIdentityProvider implements IIdentityProvider, ISelfServiceIdentity {
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly cfg: SupabaseIdentityConfig) {
    this.base = `${cfg.url.replace(/\/$/, '')}/auth/v1`;
    this.fetchImpl = cfg.fetchImpl ?? fetch;
  }

  private call(path: string, init: { method?: string; body?: unknown; key?: string; bearer?: string }) {
    const key = init.key ?? this.cfg.anonKey;
    return this.fetchImpl(`${this.base}${path}`, {
      method: init.method ?? 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${init.bearer ?? key}`,
        'Content-Type': 'application/json',
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(10_000),
    });
  }

  async signUp(email: string, password: string, metadata: Record<string, string>): Promise<SignUpResult> {
    const res = await this.call('/signup', { body: { email, password, data: metadata } });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.status === 429) return { status: 'rate_limited' };
    if (!res.ok) {
      const code = String(body['error_code'] ?? body['code'] ?? '');
      if (code === 'user_already_exists' || code === 'email_exists') return { status: 'exists' };
      if (code === 'weak_password') {
        return { status: 'weak_password', message: String(body['msg'] ?? body['message'] ?? 'Password too weak') };
      }
      if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit') {
        return { status: 'rate_limited' };
      }
      throw new Error(`Supabase signup failed: ${res.status} ${code}`);
    }
    // With "Confirm email" on, the response is the user itself; with it off it is a session.
    const session = body as unknown as Partial<GoTrueSession> & GoTrueUser;
    const user: GoTrueUser = session.user ?? session;
    // Existing email + confirmations on: GoTrue returns an obfuscated user with no identities.
    if (Array.isArray(user.identities) && user.identities.length === 0) return { status: 'exists' };
    return {
      status: 'created',
      userId: user.id,
      emailConfirmationRequired: !user.email_confirmed_at,
    };
  }

  async signIn(email: string, password: string): Promise<SignInResult> {
    const res = await this.call('/token?grant_type=password', { body: { email, password } });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.ok) {
      const s = body as unknown as GoTrueSession;
      return { status: 'ok', tokens: toTokens(s), user: toUser(s.user) };
    }
    const code = String(body['error_code'] ?? '');
    if (code === 'email_not_confirmed') return { status: 'email_not_confirmed' };
    if (res.status === 400 || res.status === 401 || code === 'invalid_credentials') {
      return { status: 'invalid_credentials' };
    }
    throw new Error(`Supabase sign-in failed: ${res.status} ${code}`);
  }

  async refresh(refreshToken: string) {
    const res = await this.call('/token?grant_type=refresh_token', { body: { refresh_token: refreshToken } });
    if (res.status === 400 || res.status === 401) return null;
    if (!res.ok) throw new Error(`Supabase refresh failed: ${res.status}`);
    const s = (await res.json()) as GoTrueSession;
    return { tokens: toTokens(s), user: toUser(s.user) };
  }

  async getUser(accessToken: string): Promise<IdentityUser | null> {
    const res = await this.call('/user', { method: 'GET', bearer: accessToken });
    if (res.status === 401 || res.status === 403) return null;
    if (!res.ok) throw new Error(`Supabase get-user failed: ${res.status}`);
    return toUser((await res.json()) as GoTrueUser);
  }

  async updateEmail(accessToken: string, email: string, redirectTo: string): Promise<EmailChangeResult> {
    const res = await this.call(`/user?redirect_to=${encodeURIComponent(redirectTo)}`, {
      method: 'PUT',
      bearer: accessToken,
      body: { email },
    });
    if (res.ok) return 'sent';
    const code = await errorCode(res);
    if (res.status === 429 || code === 'over_email_send_rate_limit') return 'rate_limited';
    if (code === 'email_exists' || code === 'user_already_exists') return 'email_taken';
    if (code === 'email_address_invalid' || code === 'validation_failed') return 'invalid_email';
    throw new Error(`Supabase email change failed: ${res.status} ${code}`);
  }

  async updatePassword(accessToken: string, password: string): Promise<PasswordUpdateResult> {
    const res = await this.call('/user', { method: 'PUT', bearer: accessToken, body: { password } });
    if (res.ok) return { status: 'ok' };
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const code = String(body['error_code'] ?? body['code'] ?? '');
    if (code === 'weak_password') {
      return { status: 'weak_password', message: String(body['msg'] ?? body['message'] ?? 'Password too weak') };
    }
    if (code === 'same_password') return { status: 'same_password' };
    if (res.status === 401 || res.status === 403) return { status: 'invalid_token' };
    throw new Error(`Supabase password update failed: ${res.status} ${code}`);
  }

  async sendPasswordReset(email: string, redirectTo: string): Promise<'sent' | 'rate_limited'> {
    const res = await this.call(`/recover?redirect_to=${encodeURIComponent(redirectTo)}`, { body: { email } });
    if (res.status === 429) return 'rate_limited';
    const code = res.ok ? '' : await errorCode(res);
    if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit') return 'rate_limited';
    // Any other answer is reported as "sent": the caller must not learn whether the address exists.
    if (!res.ok) console.error('password reset request failed', res.status, code);
    return 'sent';
  }

  async signOutAll(accessToken: string): Promise<void> {
    const res = await this.call('/logout?scope=global', { bearer: accessToken });
    // 401/403/404: the token is already gone, which is the outcome asked for.
    if (!res.ok && ![401, 403, 404].includes(res.status)) throw new Error(`Supabase sign-out failed: ${res.status}`);
  }

  async deleteUser(userId: string): Promise<void> {
    const res = await this.call(`/admin/users/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      key: this.cfg.serviceRoleKey,
    });
    if (!res.ok && res.status !== 404) throw new Error(`Supabase delete-user failed: ${res.status}`);
  }
}

async function errorCode(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return String(body['error_code'] ?? body['code'] ?? '');
}

function toUser(u: GoTrueUser): IdentityUser {
  return { userId: u.id, email: (u.email ?? '').toLowerCase(), emailConfirmed: Boolean(u.email_confirmed_at) };
}

function toTokens(s: GoTrueSession): TokenSet {
  return { accessToken: s.access_token, refreshToken: s.refresh_token, expiresIn: s.expires_in };
}
