/**
 * Drizzle schema — E2E encryption tables.
 * All ciphertext columns are BYTEA. No plaintext message content is stored.
 */

import {
  pgTable,
  uuid,
  customType,
  text,
  integer,
  bigint,
  timestamp,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import type { WaitlistEventAction, WaitlistStatus } from '../../../domain/ports/waitlist.js';
import type { UserRole } from '../../../domain/user-roles.js';

/**
 * BYTEA column. drizzle-orm 0.36 has no built-in `bytea`, and every
 * ciphertext column in this schema is BYTEA.
 */
const bytea = customType<{ data: Uint8Array; driverData: Uint8Array }>({
  dataType: () => 'bytea',
});

export const tenantKeys = pgTable('tenant_keys', {
  tenantId: uuid('tenant_id').primaryKey(),
  wrappedKek: bytea('wrapped_kek').notNull(),
  kekNonce: bytea('kek_nonce').notNull(),
  kekVersion: integer('kek_version').notNull().default(1),
  algId: text('alg_id').notNull().default('xchacha20poly1305'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const devices = pgTable('devices', {
  deviceId: uuid('device_id').primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenantKeys.tenantId),
  wrappedKek: bytea('wrapped_kek').notNull(),
  devicePublicKey: bytea('device_public_key').notNull(),
  deviceName: text('device_name'),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const messages = pgTable(
  'messages',
  {
    messageId: uuid('message_id').primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    senderRef: text('sender_ref').notNull(),
    recipientRef: text('recipient_ref').notNull(),
    ciphertext: bytea('ciphertext').notNull(),
    wrappedDek: bytea('wrapped_dek').notNull(),
    dekNonce: bytea('dek_nonce').notNull(),
    dekVersion: integer('dek_version').notNull().default(1),
    algId: text('alg_id').notNull().default('xchacha20poly1305'),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_messages_tenant_sent').on(t.tenantId, t.sentAt),
    index('idx_messages_sender').on(t.senderRef),
    index('idx_messages_recipient').on(t.recipientRef),
  ],
);

export const contacts = pgTable(
  'contacts',
  {
    contactId: uuid('contact_id').primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    phoneBlindIndex: bytea('phone_blind_index'),
    jidBlindIndex: bytea('jid_blind_index').notNull(),
    nameCiphertext: bytea('name_ciphertext'),
    nameWrappedDek: bytea('name_wrapped_dek'),
    nameDekNonce: bytea('name_dek_nonce'),
    nameDekVersion: integer('name_dek_version'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_contacts_tenant_phone').on(t.tenantId, t.phoneBlindIndex),
    index('idx_contacts_tenant_jid').on(t.tenantId, t.jidBlindIndex),
  ],
);

export const mediaObjects = pgTable('media_objects', {
  mediaId: uuid('media_id').primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  messageId: uuid('message_id'),
  r2ObjectKey: text('r2_object_key').notNull(),
  ciphertextSize: bigint('ciphertext_size', { mode: 'number' }).notNull(),
  wrappedDek: bytea('wrapped_dek').notNull(),
  dekNonce: bytea('dek_nonce').notNull(),
  dekVersion: integer('dek_version').notNull().default(1),
  secretstreamHeader: bytea('secretstream_header'),
  mimeType: text('mime_type').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const keyRotationJobs = pgTable('key_rotation_jobs', {
  jobId: uuid('job_id').primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  keyType: text('key_type').notNull(),
  oldVersion: integer('old_version').notNull(),
  newVersion: integer('new_version').notNull(),
  cursorPosition: uuid('cursor_position'),
  status: text('status').notNull().default('running'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

export const userRecovery = pgTable('user_recovery', {
  recoveryId: uuid('recovery_id').primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  wrappedUrk: bytea('wrapped_urk').notNull(),
  recoveryNonce: bytea('recovery_nonce').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const auditLog = pgTable(
  'audit_log',
  {
    auditId: uuid('audit_id').primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    actorType: text('actor_type').notNull(),
    actorId: text('actor_id').notNull(),
    action: text('action').notNull(),
    resourceType: text('resource_type').notNull(),
    resourceId: text('resource_id'),
    success: integer('success').notNull(), // 0 | 1 (Drizzle has no native boolean in some drivers)
    detail: jsonb('detail'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_audit_tenant_created').on(t.tenantId, t.createdAt)],
);

export const tenantThemes = pgTable('tenant_themes', {
  tenantId: uuid('tenant_id').primaryKey(),
  slug: text('slug').notNull().unique(),
  logoUrl: text('logo_url'),
  primaryColor: text('primary_color').notNull().default('#1a73e8'),
  fontFamily: text('font_family').notNull().default('Inter'),
  customCss: text('custom_css'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Invite allowlist + user→number binding ────────────────────
// RLS is enabled with no policies: these tables live in `public`, which Supabase
// exposes through PostgREST, and only the BFF (direct Postgres role) may read them.

export const allowlistedNumbers = pgTable('allowlisted_numbers', {
  phoneE164: text('phone_e164').primaryKey(),
  addedBy: text('added_by').notNull(),
  addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

export const userProfiles = pgTable('user_profiles', {
  /** Supabase Auth user id (auth.users.id). */
  userId: uuid('user_id').primaryKey(),
  email: text('email').notNull(),
  phoneE164: text('phone_e164')
    .notNull()
    .unique()
    .references(() => allowlistedNumbers.phoneE164, { onDelete: 'cascade' }),
  role: text('role').$type<UserRole>().notNull().default('user'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  /** Set by an admin: the user's session, API keys and connectors stop working. */
  disabledAt: timestamp('disabled_at', { withTimezone: true }),
  /** Shown instead of the e-mail when set (settings page). 1-80 chars, checked in SQL too. */
  displayName: text('display_name'),
  /** The user asked to close the account (KEEP ALL DATA: the row stays; disabled_at is set too). */
  closureRequestedAt: timestamp('closure_requested_at', { withTimezone: true }),
}).enableRLS();

/**
 * Audit trail of role changes. No foreign key on purpose: the trail outlives the profile row
 * (removing a number from the allowlist cascades to user_profiles). RLS on, no policies.
 */
export const userRoleEvents = pgTable(
  'user_role_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    changedBy: text('changed_by').notNull(),
    changedByEmail: text('changed_by_email').notNull(),
    fromRole: text('from_role').$type<UserRole>().notNull(),
    toRole: text('to_role').$type<UserRole>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('user_role_events_user_created_idx').on(table.userId, table.createdAt)],
).enableRLS();

/** One OpenWA session per user (PoC). Owner-only: RLS on, no policies; the BFF owns the table. */
export const waSessions = pgTable('wa_sessions', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => userProfiles.userId, { onDelete: 'cascade' }),
  openwaSessionId: uuid('openwa_session_id').notNull().unique(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

/** Per-user OpenWA API keys. Only the SHA-256 hash is stored; the plaintext is shown once. */
export const waApiKeys = pgTable('wa_api_keys', {
  /** OpenWA API key id. */
  id: text('id').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => waSessions.userId, { onDelete: 'cascade' }),
  keyPrefix: text('key_prefix').notNull(),
  keyHash: text('key_hash').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
}).enableRLS();

/** OAuth clients registered dynamically (RFC 7591) by MCP connectors such as Claude. */
export const oauthClients = pgTable('oauth_clients', {
  clientId: text('client_id').primaryKey(),
  clientName: text('client_name').notNull(),
  redirectUris: jsonb('redirect_uris').$type<string[]>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

/** One approved connection: user + client + an OpenWA key scoped to the user's session (sealed). */
export const oauthGrants = pgTable('oauth_grants', {
  id: text('id').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => waSessions.userId, { onDelete: 'cascade' }),
  clientId: text('client_id')
    .notNull()
    .references(() => oauthClients.clientId, { onDelete: 'cascade' }),
  openwaKeyId: text('openwa_key_id').notNull(),
  openwaKeyEnc: text('openwa_key_enc').notNull(),
  scope: text('scope').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
}).enableRLS();

/** Opaque access/refresh tokens, SHA-256 only. Refresh tokens rotate; `used_at` detects reuse. */
export const oauthTokens = pgTable('oauth_tokens', {
  tokenHash: text('token_hash').primaryKey(),
  grantId: text('grant_id')
    .notNull()
    .references(() => oauthGrants.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

// ── Admin backoffice ──────────────────────────────────────────

/** Runtime settings edited from /admin (one row per key; `runtime` holds the send caps + pacing). */
export const bffSettings = pgTable('bff_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text('updated_by').notNull(),
}).enableRLS();

/** Per-session API send-cap override; a null column falls back to the global cap. */
export const waSessionLimits = pgTable('wa_session_limits', {
  openwaSessionId: uuid('openwa_session_id')
    .primaryKey()
    .references(() => waSessions.openwaSessionId, { onDelete: 'cascade' }),
  perDay: integer('per_day'),
  perMinute: integer('per_minute'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text('updated_by').notNull(),
}).enableRLS();

// ── Landing-page waitlist ─────────────────────────────────────

/**
 * Public waitlist leads (the landing form). Not an account: nothing here grants access, an
 * admin still invites the number before sign-up accepts it. `email` is the natural key, so a
 * repeat submission is a no-op. `status` is what the admin backoffice reads: `pending` until
 * the entry has been invited into `allowlisted_numbers`, `invited` afterwards.
 */
export const waitlist = pgTable('waitlist', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  /** E.164 when the visitor gave a number; the invite flow uses it as a hint, never as a key. */
  waNumber: text('wa_number'),
  useCase: text('use_case'),
  locale: text('locale').notNull().default('en'),
  sourceRef: text('source_ref'),
  utmSource: text('utm_source'),
  utmCampaign: text('utm_campaign'),
  status: text('status').$type<WaitlistStatus>().notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  invitedAt: timestamp('invited_at', { withTimezone: true }),
  removedAt: timestamp('removed_at', { withTimezone: true }),
}).enableRLS();

export const waitlistEvents = pgTable(
  'waitlist_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    waitlistId: uuid('waitlist_id').notNull().references(() => waitlist.id, { onDelete: 'cascade' }),
    adminId: text('admin_id').notNull(),
    action: text('action').$type<WaitlistEventAction>().notNull(),
    fromStatus: text('from_status').$type<WaitlistStatus>().notNull(),
    toStatus: text('to_status').$type<WaitlistStatus>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_waitlist_events_entry_created').on(t.waitlistId, t.createdAt)],
).enableRLS();
