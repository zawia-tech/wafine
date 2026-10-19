import { describe, it, expect, beforeAll } from 'bun:test';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from './schema/index.js';
import { DrizzleAccountsRepository } from './drizzle-accounts.js';
import { DrizzleWaTenancyRepository } from './drizzle-wa-tenancy.js';

// Replays the real generated SQL (allowlist + profiles, then sessions + keys) in-process.
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
].map(
  (f) => new URL(`../../../drizzle/${f}`, import.meta.url),
);

const U1 = '00000000-0000-4000-8000-000000000001';
const U2 = '00000000-0000-4000-8000-000000000002';
const S1 = 'aaaaaaaa-0000-4000-8000-000000000001';

let repo: DrizzleWaTenancyRepository;
let accounts: DrizzleAccountsRepository;

beforeAll(async () => {
  const pg = new PGlite();
  for (const m of MIGRATIONS) await pg.exec(readFileSync(m, 'utf8').replaceAll('--> statement-breakpoint', ''));
  const db = drizzle(pg, { schema });
  repo = new DrizzleWaTenancyRepository(db);
  accounts = new DrizzleAccountsRepository(db);
  for (const [u, p] of [
    [U1, '+212600000001'],
    [U2, '+212600000002'],
  ] as const) {
    await accounts.addAllowlisted(p, 'seed');
    await accounts.bindProfile({ userId: u, email: `${u}@x.co`, phoneE164: p });
  }
});

describe('DrizzleWaTenancyRepository (Postgres semantics)', () => {
  it('keeps one session per user and a unique engine session id', async () => {
    expect(await repo.createSession({ userId: U1, openwaSessionId: S1, name: 'u-1' })).toBe(true);
    expect(await repo.createSession({ userId: U1, openwaSessionId: S1, name: 'u-1' })).toBe(false);
    expect((await repo.getSession(U1))?.openwaSessionId).toBe(S1);
    expect(await repo.getSession(U2)).toBeNull();
  });

  it('finds active keys by hash only, and scopes revocation to the owner', async () => {
    await repo.addKey({ id: 'k1', userId: U1, keyPrefix: 'owa_k1_abcde', keyHash: 'h1' });
    expect(await repo.findActiveKeyByHash('h1')).toEqual({ keyId: 'k1', userId: U1, openwaSessionId: S1 });
    expect(await repo.findActiveKeyByHash('nope')).toBeNull();

    expect(await repo.revokeKey(U2, 'k1')).toBe(false);
    expect(await repo.revokeKey(U1, 'k1')).toBe(true);
    expect(await repo.revokeKey(U1, 'k1')).toBe(false);
    expect(await repo.findActiveKeyByHash('h1')).toBeNull();
    expect((await repo.listKeys(U1))[0]?.revokedAt).toBeInstanceOf(Date);
  });

  it('refuses a key for a user without a session (FK)', async () => {
    expect(repo.addKey({ id: 'k2', userId: U2, keyPrefix: 'p', keyHash: 'h2' })).rejects.toThrow();
  });

  it('deleting the session removes its keys; removing the number removes everything', async () => {
    await repo.addKey({ id: 'k3', userId: U1, keyPrefix: 'p', keyHash: 'h3' });
    await repo.deleteSession(U1);
    expect(await repo.getSession(U1)).toBeNull();
    expect(await repo.listKeys(U1)).toEqual([]);

    await repo.createSession({ userId: U1, openwaSessionId: S1, name: 'u-1' });
    await accounts.removeAllowlisted('+212600000001');
    expect(await repo.getSession(U1)).toBeNull();
  });
});
