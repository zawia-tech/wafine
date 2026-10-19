import { describe, it, expect, beforeAll } from 'bun:test';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from './schema/index.js';
import { DrizzleAccountsRepository } from './drizzle-accounts.js';

// Runs the real migration SQL against an in-process Postgres (every migration: the profile
// schema includes later columns such as `disabled_at`).
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

const P = '+212600000042';
const U1 = '00000000-0000-4000-8000-000000000001';
const U2 = '00000000-0000-4000-8000-000000000002';

let repo: DrizzleAccountsRepository;

beforeAll(async () => {
  const pg = new PGlite();
  for (const m of MIGRATIONS) await pg.exec(readFileSync(m, 'utf8').replaceAll('--> statement-breakpoint', ''));
  repo = new DrizzleAccountsRepository(drizzle(pg, { schema }));
});

describe('DrizzleAccountsRepository (Postgres semantics)', () => {
  it('refuses to bind a number that is not allowlisted', async () => {
    expect(await repo.bindProfile({ userId: U1, email: 'a@x.c', phoneE164: P })).toBe('not_allowlisted');
  });

  it('adds idempotently, binds once, and reports conflicts', async () => {
    expect(await repo.addAllowlisted(P, 'admin@x.c')).toBe(true);
    expect(await repo.addAllowlisted(P, 'admin@x.c')).toBe(false);
    expect(await repo.isAllowlisted(P)).toBe(true);

    expect(await repo.bindProfile({ userId: U1, email: 'a@x.c', phoneE164: P })).toBe('ok');
    expect(await repo.bindProfile({ userId: U2, email: 'b@x.c', phoneE164: P })).toBe('phone_taken');
    expect(await repo.bindProfile({ userId: U1, email: 'a@x.c', phoneE164: P })).toBe('user_exists');

    expect((await repo.findProfileByPhone(P))?.userId).toBe(U1);
    expect((await repo.findProfileByUserId(U1))?.phoneE164).toBe(P);
  });

  it('lists entries with the bound email and who added them', async () => {
    const [entry] = await repo.listAllowlist();
    expect(entry).toMatchObject({ phoneE164: P, addedBy: 'admin@x.c', boundEmail: 'a@x.c' });
  });

  it('stores the display name (with the SQL length check) and keeps the first closure request', async () => {
    expect(await repo.updateDisplayName(U1, 'Amal')).toBe(true);
    expect((await repo.findProfileByUserId(U1))?.displayName).toBe('Amal');
    await expect(repo.updateDisplayName(U1, 'x'.repeat(81))).rejects.toThrow();
    expect(await repo.updateDisplayName(U1, null)).toBe(true);
    expect(await repo.updateDisplayName(U2, 'Nobody')).toBe(false);

    const first = await repo.requestClosure(U1);
    expect(first).toBeInstanceOf(Date);
    expect((await repo.requestClosure(U1))?.getTime()).toBe(first!.getTime());
    expect(await repo.requestClosure(U2)).toBeNull();
  });

  it('removing a number cascades to its binding', async () => {
    expect(await repo.removeAllowlisted(P)).toBe(true);
    expect(await repo.findProfileByUserId(U1)).toBeNull();
    expect(await repo.removeAllowlisted(P)).toBe(false);
    expect(await repo.listAllowlist()).toEqual([]);
  });
});
