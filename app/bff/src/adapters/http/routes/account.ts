/**
 * Account self-service, mounted at `/api/account` behind the auth middleware.
 *
 * Every route acts on the caller only: the user id comes from the verified session, never from
 * the path or the body (bodies are `.strict()`, so an extra `userId` is a 400). Calls that touch
 * Supabase Auth use the caller's own access token, so they cannot reach another account either.
 *
 *   GET   /                profile: email, display name, WhatsApp number (read-only), closure state
 *   PATCH /profile         display name (null clears it)
 *   POST  /email           start an e-mail change; Supabase mails the confirmation link
 *   POST  /password        change the password after re-checking the current one
 *   POST  /sign-out-all    revoke every session of the account (all devices)
 *   POST  /closure         request account closure: flagged + disabled, nothing deleted
 */

import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type {
  IAccountsRepository,
  IIdentityProvider,
  ISelfServiceIdentity,
} from '../../../domain/ports/index.js';
import { CodedHTTPException as AccountError } from '../errors.js';
import { zJson } from '../validation.js';
import { newPassword } from './auth.js';

/** Trimmed, inner whitespace collapsed, 1-80 chars, no control characters; empty = clear. */
export const displayNameSchema = z
  .string()
  .max(200)
  .transform((s) => s.replace(/\s+/g, ' ').trim())
  .refine((s) => s.length <= 80, 'Display name is at most 80 characters.')
  // eslint-disable-next-line no-control-regex
  .refine((s) => !/[\u0000-\u001f\u007f]/.test(s), 'Display name contains invalid characters.')
  .nullable();

const profileBody = z.object({ displayName: displayNameSchema }).strict();
const emailBody = z.object({ email: z.string().trim().email().max(254) }).strict();
const passwordBody = z
  .object({ currentPassword: z.string().min(1).max(128), newPassword })
  .strict();

export interface AccountRouteDeps {
  accounts: IAccountsRepository;
  /** Used to re-check the current password. */
  identity: IIdentityProvider;
  selfService: ISelfServiceIdentity;
  adminEmails: readonly string[];
  /** Web origin, for the links in Supabase's e-mails. */
  webUrl: string;
  /** Disable the account (admin backoffice). Absent: closure is only flagged. */
  disableUser?: (userId: string) => Promise<boolean>;
}

function bearer(c: Context): string {
  // The auth middleware already checked the header's shape and resolved it to a user.
  return (c.req.header('Authorization') ?? '').slice(7);
}

export function accountRoutes(deps: AccountRouteDeps): Hono {
  const { accounts, identity, selfService } = deps;
  const admins = new Set(deps.adminEmails.map((e) => e.trim().toLowerCase()).filter(Boolean));
  const web = deps.webUrl.replace(/\/$/, '');
  const r = new Hono();

  r.get('/', async (c) => {
    const auth = c.get('auth');
    const profile = await accounts.findProfileByUserId(auth.userId);
    // A confirmed e-mail change shows up in the verified session first: copy it to the profile.
    if (profile && profile.email !== auth.email) await accounts.updateProfileEmail(auth.userId, auth.email);
    return c.json({
      email: auth.email,
      displayName: profile?.displayName ?? null,
      /** Read-only here: an admin changes it (it is bound to the allowlist). */
      phone: profile?.phoneE164 ?? null,
      closureRequestedAt: profile?.closureRequestedAt ?? null,
    });
  });

  r.patch('/profile', zJson(profileBody), async (c) => {
    const raw = c.req.valid('json').displayName;
    const displayName = raw ? raw : null;
    if (!(await accounts.updateDisplayName(c.get('auth').userId, displayName))) {
      throw new AccountError(404, 'invalid_input', 'No profile for this account yet.');
    }
    return c.json({ displayName });
  });

  r.post('/email', zJson(emailBody), async (c) => {
    const email = c.req.valid('json').email.toLowerCase();
    const auth = c.get('auth');
    if (email === auth.email) throw new AccountError(400, 'invalid_email', 'That is already your e-mail.');
    if (admins.has(auth.email)) {
      throw new AccountError(409, 'bootstrap_owner', 'ADMIN_EMAILS owners change their e-mail in the server config.');
    }
    const result = await selfService.updateEmail(bearer(c), email, `${web}/settings`);
    if (result === 'email_taken') throw new AccountError(409, 'email_taken', 'An account with this email already exists.');
    if (result === 'rate_limited') throw new AccountError(429, 'rate_limited', 'Too many e-mails sent, try again later.');
    if (result === 'invalid_email') throw new AccountError(400, 'invalid_email', 'This e-mail address is not valid.');
    return c.json({ status: 'check_inbox', email }, 202);
  });

  r.post('/password', zJson(passwordBody), async (c) => {
    const { currentPassword, newPassword: password } = c.req.valid('json');
    const auth = c.get('auth');
    const check = await identity.signIn(auth.email, currentPassword);
    if (check.status !== 'ok' || check.user.userId !== auth.userId) {
      throw new AccountError(400, 'wrong_password', 'The current password is not correct.');
    }
    const result = await selfService.updatePassword(bearer(c), password);
    if (result.status === 'weak_password') throw new AccountError(400, 'weak_password', result.message);
    if (result.status === 'same_password') {
      throw new AccountError(400, 'same_password', 'Choose a password different from the current one.');
    }
    if (result.status === 'invalid_token') throw new AccountError(401, 'session_expired', 'Session expired, log in again.');
    return c.json({ ok: true });
  });

  r.post('/sign-out-all', async (c) => {
    await selfService.signOutAll(bearer(c));
    return c.body(null, 204);
  });

  r.post('/closure', async (c) => {
    const auth = c.get('auth');
    if (admins.has(auth.email)) {
      throw new AccountError(409, 'bootstrap_owner', 'ADMIN_EMAILS owners cannot close their account here.');
    }
    const at = await accounts.requestClosure(auth.userId);
    if (!at) throw new AccountError(404, 'invalid_input', 'No profile for this account yet.');
    // KEEP ALL DATA: the account is only disabled; an admin reviews the request in /admin.
    await deps.disableUser?.(auth.userId);
    await selfService.signOutAll(bearer(c)).catch((err) => console.error('closure sign-out failed', err));
    return c.json({ closureRequestedAt: at }, 202);
  });

  return r;
}
