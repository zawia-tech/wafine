import { describe, it, expect, beforeAll } from 'bun:test';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from './schema/index.js';
import { DrizzleAccountsRepository } from './drizzle-accounts.js';
import { DrizzleWaTenancyRepository } from './drizzle-wa-tenancy.js';
import { DrizzleAdminRepository } from './drizzle-admin.js';
import type { UserRole } from '../../domain/user-roles.js';

const MIGRATIONS = [
  '0001_last_scrambler.sql',
  '0002_wa_sessions_keys.sql',
  '0003_oauth_connectors.sql',
  '0004_admin_backoffice.sql',
  '0005_waitlist.sql',
  '0006_waitlist_status.sql',
  '0007_waitlist_campaign_tags.sql',
  '0008_waitlist_admin.sql',
  '0009_user_roles.sql',
  '0010_account_settings.sql',
].map((f) => new URL(`../../../drizzle/${f}`, import.meta.url));

const U1 = '00000000-0000-4000-8000-000000000001';
const U2 = '00000000-0000-4000-8000-000000000002';
const S1 = 'aaaaaaaa-0000-4000-8000-000000000001';

let admin: DrizzleAdminRepository;
let tenancy: DrizzleWaTenancyRepository;

beforeAll(async () => {
  const pg = new PGlite();
  for (const m of MIGRATIONS) await pg.exec(readFileSync(m, 'utf8').replaceAll('--> statement-breakpoint', ''));
  const db = drizzle(pg, { schema });
  const accounts = new DrizzleAccountsRepository(db);
  tenancy = new DrizzleWaTenancyRepository(db);
  admin = new DrizzleAdminRepository(db);
  for (const [u, p] of [
    [U1, '+212600000001'],
    [U2, '+212600000002'],
  ] as const) {
    await accounts.addAllowlisted(p, 'seed');
    await accounts.bindProfile({ userId: u, email: `${u}@x.co`, phoneE164: p });
  }
  await tenancy.createSession({ userId: U1, openwaSessionId: S1, name: 'u-1' });
  await tenancy.addKey({ id: 'k1', userId: U1, keyPrefix: 'owa_k1_abc', keyHash: 'h1' });
});

describe('DrizzleAdminRepository (Postgres semantics)', () => {
  it('upserts the runtime settings row', async () => {
    expect(await admin.getSettings()).toBeNull();
    await admin.saveSettings({ sendLimits: { perDay: 50 } }, 'a@x.co');
    await admin.saveSettings({ sendLimits: { perDay: 60 }, workflow: { minGapMs: 0 } }, 'b@x.co');
    expect(await admin.getSettings()).toMatchObject({
      value: { sendLimits: { perDay: 60 }, workflow: { minGapMs: 0 } },
      updatedBy: 'b@x.co',
    });
  });

  it('sets, lists and clears a per-session override, only for known sessions', async () => {
    expect(await admin.setOverride(S1, { perDay: 20, perMinute: null }, 'a@x.co')).toBe(true);
    expect(await admin.setOverride(S1, { perDay: 25, perMinute: 4 }, 'a@x.co')).toBe(true);
    expect(await admin.getOverride(S1)).toEqual({ perDay: 25, perMinute: 4 });
    expect((await admin.listOverrides()).get(S1)).toEqual({ perDay: 25, perMinute: 4 });
    expect(await admin.setOverride('aaaaaaaa-0000-4000-8000-999999999999', { perDay: 1, perMinute: null }, 'a')).toBe(false);
    expect(await admin.setOverride(S1, null, 'a@x.co')).toBe(true);
    expect(await admin.getOverride(S1)).toBeNull();
  });

  it('lists users with their session and toggles disabled', async () => {
    const users = await admin.listUsers();
    expect(users.map((u) => u.userId)).toEqual([U1, U2]);
    expect(users[0]!.session).toMatchObject({ openwaSessionId: S1, name: 'u-1' });
    expect(users[1]!.session).toBeNull();

    expect(await admin.isUserDisabled(U2)).toBe(false);
    expect(await admin.setUserDisabled(U2, true)).toBe(true);
    expect(await admin.isUserDisabled(U2)).toBe(true);
    expect(await admin.setUserDisabled(U2, false)).toBe(true);
    expect(await admin.isUserDisabled(U2)).toBe(false);
    expect(await admin.setUserDisabled('00000000-0000-4000-8000-000000000099', true)).toBe(false);
  });

  it('starts profiles as user, changes a role and records an audit event atomically', async () => {
    const set = (userId: string, role: UserRole, bootstrapOwnerEmails: string[] = []) =>
      admin.setUserRole({ userId, role, changedBy: U1, changedByEmail: 'owner@example.com', bootstrapOwnerEmails });
    expect(await admin.getUserRole(U1)).toBe('user');
    expect(await admin.getUserRole(U2)).toBe('user');
    expect(await set(U2, 'support')).toBe('changed');
    expect(await admin.getUserRole(U2)).toBe('support');
    expect(await set(U2, 'support')).toBe('unchanged');
    expect(await admin.listUserRoleEvents(U2)).toMatchObject([
      { userId: U2, changedBy: U1, changedByEmail: 'owner@example.com', fromRole: 'user', toRole: 'support' },
    ]);
    expect(await set('00000000-0000-4000-8000-000000000099', 'viewer')).toBe('not_found');

    // Last owner: U2 as the only owner cannot step down, unless a bootstrap owner profile exists.
    expect(await set(U2, 'owner')).toBe('changed');
    expect(await set(U2, 'admin')).toBe('last_owner');
    expect(await admin.getUserRole(U2)).toBe('owner');
    expect(await set(U2, 'admin', [`${U1}@x.co`])).toBe('changed');
    expect((await admin.listUserRoleEvents(U2)).map((e) => e.toRole)).toEqual(['support', 'owner', 'admin']);
  });

  it('finds the owner of a key', async () => {
    expect(await admin.findKeyOwner('k1')).toBe(U1);
    expect(await admin.findKeyOwner('nope')).toBeNull();
  });
});
