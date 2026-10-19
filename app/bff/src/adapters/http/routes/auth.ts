/**
 * Public auth routes (no bearer token): invite-only sign-up, login, refresh, and the
 * forgot-password flow (request a reset link, then set a new password from that link).
 * Sign-up is accepted only for a phone number on the allowlist, and persists the
 * user→number binding that the connect-by-QR step later enforces.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import type {
  BindResult,
  IAccountsRepository,
  IIdentityProvider,
  ISelfServiceIdentity,
} from '../../../domain/ports/index.js';
import { normalizeE164 } from '../../../domain/value-objects/phone.js';
import { canOpenAdmin, effectiveUserRole } from '../../../domain/user-roles.js';
import { CodedHTTPException as AuthError } from '../errors.js';
import { zJson } from '../validation.js';

/** The one password strength rule: sign-up, password change and reset all use it. */
export const newPassword = z.string().min(8).max(128);

const signUpBody = z.object({
  email: z.string().trim().email().max(254),
  password: newPassword,
  phone: z.string().max(40),
});

const loginBody = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128),
});

const refreshBody = z.object({ refreshToken: z.string().min(1).max(4096) });
const forgotBody = z.object({ email: z.string().trim().email().max(254) });
const resetBody = z.object({ accessToken: z.string().min(1).max(4096), password: newPassword });

export interface AuthRouteDeps {
  accounts: IAccountsRepository;
  identity: IIdentityProvider;
  adminEmails: readonly string[];
  /** Forgot-password flow; the routes are mounted only when provided. */
  selfService?: ISelfServiceIdentity;
  /** Web origin: the reset e-mail links to `${webUrl}/auth/reset`. */
  webUrl?: string;
}

export function authRoutes({ accounts, identity, adminEmails, selfService, webUrl }: AuthRouteDeps): Hono {
  const admins = new Set(adminEmails.map((e) => e.toLowerCase()));
  /** Same rule as the auth middleware + /me: bootstrap owner, else the stored role. */
  const isAdmin = async (user: { userId: string; email: string; emailConfirmed: boolean }) => {
    const bootstrap = user.emailConfirmed && admins.has(user.email.toLowerCase());
    return canOpenAdmin(effectiveUserRole(bootstrap, (await accounts.findProfileByUserId(user.userId))?.role));
  };
  const r = new Hono();

  r.post('/signup', zJson(signUpBody), async (c) => {
    const { email, password, phone } = c.req.valid('json');
    const phoneE164 = normalizeE164(phone);
    if (!phoneE164) {
      throw new AuthError(
        400,
        'invalid_phone',
        'Enter the WhatsApp number in international format, e.g. +212612345678',
      );
    }
    if (!(await accounts.isAllowlisted(phoneE164))) {
      throw new AuthError(
        403,
        'not_invited',
        'This number has not been invited. Ask the admin to add it to the allowlist.',
      );
    }
    if (await accounts.findProfileByPhone(phoneE164)) {
      throw new AuthError(409, 'phone_taken', 'This number already has an account.');
    }

    const normalizedEmail = email.toLowerCase();
    const result = await identity.signUp(normalizedEmail, password, { phone_e164: phoneE164 });
    if (result.status === 'exists') {
      throw new AuthError(409, 'email_taken', 'An account with this email already exists.');
    }
    if (result.status === 'weak_password') throw new AuthError(400, 'weak_password', result.message);
    if (result.status === 'rate_limited') {
      throw new AuthError(429, 'rate_limited', 'Too many sign-ups, try again later.');
    }

    const rollbackSignup = () =>
      identity.deleteUser(result.userId).catch((err) => {
        console.error('signup rollback failed for user', result.userId, err);
      });

    let bound: BindResult;
    try {
      bound = await accounts.bindProfile({
        userId: result.userId,
        email: normalizedEmail,
        phoneE164,
      });
    } catch (err) {
      // The bind failed with a DB/network error: don't leave an orphan login behind.
      await rollbackSignup();
      throw err;
    }
    if (bound !== 'ok') {
      // Lost a race for the number (or it was un-invited meanwhile): don't leave an orphan login.
      await rollbackSignup();
      throw bound === 'not_allowlisted'
        ? new AuthError(403, 'not_invited', 'This number has not been invited.')
        : new AuthError(409, 'phone_taken', 'This number already has an account.');
    }

    return c.json(
      { ok: true, phone: phoneE164, emailConfirmationRequired: result.emailConfirmationRequired },
      201,
    );
  });

  r.post('/login', zJson(loginBody), async (c) => {
    const { email, password } = c.req.valid('json');
    const result = await identity.signIn(email.toLowerCase(), password);
    if (result.status === 'invalid_credentials') {
      throw new AuthError(401, 'invalid_credentials', 'Invalid email or password.');
    }
    if (result.status === 'email_not_confirmed') {
      throw new AuthError(403, 'email_not_confirmed', 'Confirm your email first (check your inbox).');
    }
    return c.json({
      ...result.tokens,
      email: result.user.email,
      isAdmin: await isAdmin(result.user),
    });
  });

  r.post('/refresh', zJson(refreshBody), async (c) => {
    const result = await identity.refresh(c.req.valid('json').refreshToken);
    if (!result) throw new AuthError(401, 'session_expired', 'Session expired, log in again.');
    return c.json({
      ...result.tokens,
      email: result.user.email,
      isAdmin: await isAdmin(result.user),
    });
  });

  if (selfService && webUrl) {
    const resetUrl = `${webUrl.replace(/\/$/, '')}/auth/reset`;

    // Same answer whether or not the address has an account (no enumeration).
    r.post('/forgot', zJson(forgotBody), async (c) => {
      const result = await selfService.sendPasswordReset(c.req.valid('json').email.toLowerCase(), resetUrl);
      if (result === 'rate_limited') {
        throw new AuthError(429, 'rate_limited', 'Too many e-mails sent, try again later.');
      }
      return c.json({ status: 'check_inbox' }, 202);
    });

    // The reset link signs the user in with a short-lived recovery token; it can only change
    // that user's own password.
    r.post('/reset', zJson(resetBody), async (c) => {
      const { accessToken, password } = c.req.valid('json');
      if (!(await identity.getUser(accessToken))) {
        throw new AuthError(400, 'reset_link_invalid', 'This reset link has expired. Ask for a new one.');
      }
      const result = await selfService.updatePassword(accessToken, password);
      if (result.status === 'weak_password') throw new AuthError(400, 'weak_password', result.message);
      if (result.status === 'same_password') {
        throw new AuthError(400, 'same_password', 'Choose a password different from the current one.');
      }
      if (result.status === 'invalid_token') {
        throw new AuthError(400, 'reset_link_invalid', 'This reset link has expired. Ask for a new one.');
      }
      return c.json({ ok: true });
    });
  }

  return r;
}
