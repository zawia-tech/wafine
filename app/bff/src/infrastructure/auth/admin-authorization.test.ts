import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { InMemoryAccountsRepository } from '../../adapters/persistence/in-memory-accounts.js';
import type { UserRole } from '../../domain/user-roles.js';
import { loadAdminRole, requirePermission } from './admin-authorization.js';

const ACTOR = '00000000-0000-4000-8000-000000000001';
const PHONE = '+212600000001';

async function makeApp(role: UserRole | null, isBootstrapOwner = false) {
  const accounts = new InMemoryAccountsRepository();
  if (role) {
    await accounts.addAllowlisted(PHONE, 'seed');
    await accounts.bindProfile({ userId: ACTOR, email: 'member@example.com', phoneE164: PHONE });
    accounts.updateRole(ACTOR, role);
  }
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.set('auth', { userId: ACTOR, tenantId: ACTOR, email: 'member@example.com', isAdmin: isBootstrapOwner });
    await next();
  });
  app.use('/api/admin/*', loadAdminRole(accounts));
  app.get('/api/admin/settings', requirePermission('settings:read'), (c) => c.json({ role: c.get('role') }));
  app.put('/api/admin/settings', requirePermission('settings:manage'), (c) => c.json({ ok: true }));
  return app;
}

describe('admin authorization', () => {
  it('answers 403 to a plain user and to an account without a profile', async () => {
    expect((await (await makeApp('user')).request('/api/admin/settings')).status).toBe(403);
    expect((await (await makeApp(null)).request('/api/admin/settings')).status).toBe(403);
  });

  it('checks the route permission against the stored role', async () => {
    const viewer = await makeApp('viewer');
    expect((await viewer.request('/api/admin/settings')).status).toBe(200);
    expect((await viewer.request('/api/admin/settings', { method: 'PUT' })).status).toBe(403);
    const admin = await makeApp('admin');
    expect((await admin.request('/api/admin/settings', { method: 'PUT' })).status).toBe(200);
  });

  it('treats the bootstrap identity as owner even with no profile or a lower stored role', async () => {
    expect(await (await (await makeApp(null, true)).request('/api/admin/settings')).json()).toEqual({ role: 'owner' });
    expect(await (await (await makeApp('viewer', true)).request('/api/admin/settings')).json()).toEqual({ role: 'owner' });
  });

  it('denies a guarded route when no role was loaded', async () => {
    const app = new Hono();
    app.get('/x', requirePermission('settings:read'), (c) => c.text('ok'));
    expect((await app.request('/x')).status).toBe(403);
  });
});
