/**
 * Accounts ports — invite allowlist, user→number binding, and the identity provider
 * (Supabase Auth). Only the BFF talks to the identity provider with privileged keys.
 */

import type { UserRole } from '../user-roles.js';

// ── Entities ──────────────────────────────────────────────────

export interface AllowlistEntry {
  phoneE164: string;
  /** Email of the admin who added it (or `seed:env` for the startup seed). */
  addedBy: string;
  addedAt: Date;
  /** Email of the user who has claimed this number, if any. */
  boundEmail: string | null;
}

export interface UserProfile {
  userId: string;
  email: string;
  /** The WhatsApp number this user will link; the QR-connect step must match it. */
  phoneE164: string;
  role: UserRole;
  /** Optional name shown instead of the e-mail. */
  displayName: string | null;
  /** Set when the user asked to close the account; the account is disabled until reviewed. */
  closureRequestedAt: Date | null;
  createdAt: Date;
}

/** Fields a new profile never carries: the repository sets them (role `user`, no name, open). */
export type NewUserProfile = Omit<UserProfile, 'createdAt' | 'role' | 'displayName' | 'closureRequestedAt'>;

export type BindResult = 'ok' | 'phone_taken' | 'user_exists' | 'not_allowlisted';

// ── Repository ────────────────────────────────────────────────

export interface IAccountsRepository {
  listAllowlist(): Promise<AllowlistEntry[]>;
  isAllowlisted(phoneE164: string): Promise<boolean>;
  /** Idempotent. Returns true if the number was newly added. */
  addAllowlisted(phoneE164: string, addedBy: string): Promise<boolean>;
  /** Removes the number and any user binding to it. Returns false if it was not listed. */
  removeAllowlisted(phoneE164: string): Promise<boolean>;
  findProfileByUserId(userId: string): Promise<UserProfile | null>;
  findProfileByPhone(phoneE164: string): Promise<UserProfile | null>;
  /** Atomically claim an allowlisted number for a user. New profiles always start as `user`. */
  bindProfile(profile: NewUserProfile): Promise<BindResult>;
  /** Self-service. `null` clears the name. Returns false when the user has no profile. */
  updateDisplayName(userId: string, displayName: string | null): Promise<boolean>;
  /** Keep the stored e-mail in step with Supabase Auth after a confirmed change. */
  updateProfileEmail(userId: string, email: string): Promise<void>;
  /**
   * Mark the account as closure-requested (idempotent: the first timestamp is kept). Returns the
   * timestamp, or null when the user has no profile. Disabling is the caller's job.
   */
  requestClosure(userId: string): Promise<Date | null>;
}

// ── Identity provider ─────────────────────────────────────────

export interface IdentityUser {
  userId: string;
  email: string;
  emailConfirmed: boolean;
}

export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  /** Seconds until the access token expires. */
  expiresIn: number;
}

export type SignUpResult =
  | { status: 'created'; userId: string; emailConfirmationRequired: boolean }
  | { status: 'exists' }
  | { status: 'weak_password'; message: string }
  | { status: 'rate_limited' };

export type SignInResult =
  | { status: 'ok'; tokens: TokenSet; user: IdentityUser }
  | { status: 'invalid_credentials' }
  | { status: 'email_not_confirmed' };

export type EmailChangeResult = 'sent' | 'email_taken' | 'rate_limited' | 'invalid_email';
export type PasswordUpdateResult =
  | { status: 'ok' }
  | { status: 'weak_password'; message: string }
  | { status: 'same_password' }
  | { status: 'invalid_token' };

/**
 * Self-service calls on the caller's own Supabase Auth user, made with *their* access token
 * (never the service-role key), so an account can only ever change itself.
 */
export interface ISelfServiceIdentity {
  /** Starts an e-mail change; Supabase sends the confirmation link(s). */
  updateEmail(accessToken: string, email: string, redirectTo: string): Promise<EmailChangeResult>;
  updatePassword(accessToken: string, password: string): Promise<PasswordUpdateResult>;
  /** Always resolves the same way whether or not the e-mail exists (no account enumeration). */
  sendPasswordReset(email: string, redirectTo: string): Promise<'sent' | 'rate_limited'>;
  /** Revokes every refresh token of the user (all devices). */
  signOutAll(accessToken: string): Promise<void>;
}

export interface IIdentityProvider {
  signUp(email: string, password: string, metadata: Record<string, string>): Promise<SignUpResult>;
  signIn(email: string, password: string): Promise<SignInResult>;
  refresh(refreshToken: string): Promise<{ tokens: TokenSet; user: IdentityUser } | null>;
  /** Resolve an access token to its user, or null if invalid/expired. */
  getUser(accessToken: string): Promise<IdentityUser | null>;
  /** Privileged: remove a user (used to roll back a sign-up that lost the number race). */
  deleteUser(userId: string): Promise<void>;
}
