import { describe, it, expect, beforeAll } from 'bun:test';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from './schema/index.js';
import { DrizzleAccountsRepository } from './drizzle-accounts.js';
import { DrizzleWaTenancyRepository } from './drizzle-wa-tenancy.js';
import { DrizzleOAuthRepository } from './drizzle-oauth.js';

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
const S1 = 'aaaaaaaa-0000-4000-8000-000000000001';
const later = () => new Date(Date.now() + 3600_000);

let oauth: DrizzleOAuthRepository;
let tenancy: DrizzleWaTenancyRepository;

beforeAll(async () => {
  const pg = new PGlite();
  for (const m of MIGRATIONS) await pg.exec(readFileSync(m, 'utf8').replaceAll('--> statement-breakpoint', ''));
  const db = drizzle(pg, { schema });
  const accounts = new DrizzleAccountsRepository(db);
  tenancy = new DrizzleWaTenancyRepository(db);
  oauth = new DrizzleOAuthRepository(db);
  await accounts.addAllowlisted('+212600000001', 'seed');
  await accounts.bindProfile({ userId: U1, email: 'a@x.co', phoneE164: '+212600000001' });
  await tenancy.createSession({ userId: U1, openwaSessionId: S1, name: 'u-1' });
  await oauth.createClient({ clientId: 'c1', clientName: 'Claude', redirectUris: ['https://claude.ai/api/mcp/auth_callback'] });
});

describe('DrizzleOAuthRepository (Postgres semantics)', () => {
  it('resolves tokens through grant and session, and rotates refresh tokens atomically', async () => {
    expect((await oauth.getClient('c1'))?.redirectUris).toEqual(['https://claude.ai/api/mcp/auth_callback']);
    await oauth.createGrant({ id: 'g1', userId: U1, clientId: 'c1', openwaKeyId: 'k1', openwaKeyEnc: 'sealed', scope: 'whatsapp' });
    await oauth.addToken({ hash: 'a1', grantId: 'g1', kind: 'access', expiresAt: later() });
    await oauth.addToken({ hash: 'r1', grantId: 'g1', kind: 'refresh', expiresAt: later() });

    expect(await oauth.findToken('a1')).toMatchObject({ grantId: 'g1', kind: 'access', openwaSessionId: S1, openwaKeyEnc: 'sealed' });
    expect(await oauth.markRefreshUsed('a1')).toBe(false);
    expect(await oauth.markRefreshUsed('r1')).toBe(true);
    expect(await oauth.markRefreshUsed('r1')).toBe(false);
    expect((await oauth.findToken('r1'))?.usedAt).toBeInstanceOf(Date);

    expect((await oauth.listGrants(U1)).map((g) => g.clientName)).toEqual(['Claude']);
    expect(await oauth.activeGrantKeyIds(U1)).toEqual(['k1']);
  });

  it('revocation is owner-scoped and drops the tokens', async () => {
    expect(await oauth.revokeGrant('g1', '00000000-0000-4000-8000-000000000999')).toBeNull();
    expect(await oauth.revokeGrant('g1', U1)).toBe('k1');
    expect(await oauth.revokeGrant('g1')).toBeNull();
    expect(await oauth.findToken('a1')).toBeNull();
    expect(await oauth.listGrants(U1)).toEqual([]);
  });

  it('deleting the WhatsApp session cascades to grants and tokens', async () => {
    await oauth.createGrant({ id: 'g2', userId: U1, clientId: 'c1', openwaKeyId: 'k2', openwaKeyEnc: 's', scope: 'whatsapp' });
    await oauth.addToken({ hash: 'a2', grantId: 'g2', kind: 'access', expiresAt: later() });
    await tenancy.deleteSession(U1);
    expect(await oauth.findToken('a2')).toBeNull();
    expect(await oauth.activeGrantKeyIds(U1)).toEqual([]);
  });
});
