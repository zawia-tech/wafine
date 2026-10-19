/**
 * Admin backoffice API. Mount behind the auth middleware and `loadAdminRole`; every route below
 * states the permission it needs (`can(...)`, matrix in domain/user-roles.ts).
 *
 *   allowlist           invite numbers (always mounted)
 *   waitlist            read the landing-page leads and invite one (needs waitlist storage)
 *   settings            API send caps + workflow pacing (env defaults overlaid by saved values)
 *   sessions            every WhatsApp session: engine status, API sends today, override, keys, connectors
 *   sessions/:id/limits per-session send-cap override
 *   keys/:id, grants/:id  revoke a user's API key or Claude connector (here and at the engine)
 *   users               list, disable/enable, change role (owner only), role history
 *
 * Send caps count only API traffic (/wa/*, /mcp, auto-replies); what the number's owner sends from
 * the phone or WhatsApp Web never counts (see gateway-proxy.ts).
 */

import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import type {
  IAccountsRepository,
  IAdminRepository,
  IOAuthRepository,
  ISendBudget,
  IWaTenancyRepository,
  IWaitlistRepository,
  IWhatsAppGateway,
} from '../../../domain/ports/index.js';
import { normalizeE164 } from '../../../domain/value-objects/phone.js';
import type { RuntimeSettingsService } from '../../../infrastructure/settings/runtime-settings.js';
import { USER_ROLES, type UserRole } from '../../../domain/user-roles.js';
import { requirePermission as can } from '../../../infrastructure/auth/admin-authorization.js';
import { effectiveLimits } from '../../../infrastructure/settings/runtime-settings.js';
import { zJson, zQuery } from '../validation.js';

const addBody = z.object({ phone: z.string().max(40) });

/** The invite only needs a number when the lead did not give one with the form. */
const inviteBody = z.object({ phone: z.string().trim().max(40).optional() }).strict();

const waitlistQuery = z.object({
  status: z.enum(['pending', 'invited', 'rejected', 'removed']).optional(),
  search: z.string().trim().max(128).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const waitlistBulkBody = z.object({
  ids: z.array(z.string().uuid()).min(1).max(50).refine((ids) => new Set(ids).size === ids.length),
  action: z.enum(['approve', 'reject']),
}).strict();

const int = (min: number, max: number) => z.number().int().min(min).max(max);

const settingsBody = z
  .object({
    sendLimits: z.object({ perDay: int(1, 100_000), perMinute: int(1, 1000) }).partial().strict(),
    workflow: z
      .object({
        minGapMs: int(0, 600_000),
        maxPerMinuteSession: int(1, 120),
        maxPerMinuteContact: int(1, 60),
        backoffMs: int(0, 86_400_000),
      })
      .partial()
      .strict(),
  })
  .partial()
  .strict();

const overrideBody = z
  .object({ perDay: int(1, 100_000).nullable(), perMinute: int(1, 1000).nullable() })
  .strict();

const userBody = z.object({ disabled: z.boolean() }).strict();
const userRoleBody = z.object({ role: z.enum(USER_ROLES) }).strict();

export interface AdminBackofficeDeps {
  repo: IAdminRepository;
  settings: RuntimeSettingsService;
  budget: ISendBudget;
  tenancy: IWaTenancyRepository;
  gateway: IWhatsAppGateway;
  oauth?: IOAuthRepository;
  adminEmails: readonly string[];
}

function parsePhone(raw: string): string {
  const phone = normalizeE164(raw);
  if (!phone) {
    throw new HTTPException(400, { message: 'Phone must be in international format, e.g. +212 6XX XX XX XX' });
  }
  return phone;
}

export function adminRoutes(
  accounts: IAccountsRepository,
  backoffice?: AdminBackofficeDeps,
  waitlist?: IWaitlistRepository,
  configuredAdminEmails: readonly string[] = backoffice?.adminEmails ?? [],
): Hono {
  const r = new Hono();
  const admins = new Set(configuredAdminEmails.map((e) => e.trim().toLowerCase()).filter(Boolean));

  r.get('/allowlist', can('allowlist:read'), async (c) => c.json({ entries: await accounts.listAllowlist() }));

  r.post('/allowlist', can('allowlist:manage'), zJson(addBody), async (c) => {
    const phone = parsePhone(c.req.valid('json').phone);
    const created = await accounts.addAllowlisted(phone, c.get('auth').email);
    return c.json({ phone, created }, created ? 201 : 200);
  });

  r.delete('/allowlist/:phone', can('allowlist:manage'), async (c) => {
    // `+` arrives URL-encoded (%2B); a raw `+` may have been decoded to a space.
    const phone = parsePhone(c.req.param('phone').replace(/^\s/, '+'));
    // Removing a number also drops its profile binding, so it must not be a way around the
    // owner protections below.
    const profile = await accounts.findProfileByPhone(phone);
    if (profile && admins.has(profile.email.toLowerCase())) {
      throw new HTTPException(400, { message: 'ADMIN_EMAILS owners cannot be removed from the allowlist.' });
    }
    if (profile?.role === 'owner') {
      throw new HTTPException(409, { message: 'This number belongs to an owner; change their role first.' });
    }
    if (!(await accounts.removeAllowlisted(phone))) {
      throw new HTTPException(404, { message: 'Number is not on the allowlist' });
    }
    return c.body(null, 204);
  });

  // Waitlist leads: mounted only with storage wired, like the public form's route.
  if (waitlist) {
    r.get('/waitlist', can('waitlist:read'), zQuery(waitlistQuery), async (c) => {
      const { status, search, limit, offset } = c.req.valid('query');
      const page = await waitlist.list({ status, search, limit, offset });
      const sourceCounts = await waitlist.sourceCounts();
      return c.json({ entries: page.entries, total: page.total, limit, offset, sourceCounts });
    });

    r.get('/waitlist/:id', can('waitlist:read'), async (c) => {
      const id = c.req.param('id');
      const entry = await waitlist.get(id);
      if (!entry) throw new HTTPException(404, { message: 'Waitlist entry not found' });
      return c.json({ entry, events: await waitlist.events(id) });
    });

    r.post('/waitlist/:id/invite', can('waitlist:decide'), zJson(inviteBody), async (c) => {
      const entry = await waitlist.get(c.req.param('id'));
      if (!entry) throw new HTTPException(404, { message: 'Waitlist entry not found' });

      // The allowlist is keyed by number, so an entry without a usable one has to supply it here.
      const body = c.req.valid('json');
      let phone: string | null;
      if (body.phone) phone = parsePhone(body.phone);
      else phone = entry.waNumber ? normalizeE164(entry.waNumber) : null;
      if (!phone) {
        throw new HTTPException(400, {
          message: 'This entry has no WhatsApp number; send one in the body as phone, e.g. +212 6XX XX XX XX',
        });
      }
      if (entry.status === 'invited') return c.json({ id: entry.id, phone, created: false, status: 'invited' }, 200);
      if (entry.status !== 'pending') throw new HTTPException(409, { message: 'Only pending leads can be approved.' });

      // Order matters and both steps are idempotent: the allowlist is what sign-up checks, so it is
      // written first and `created` reports whether this call changed anything; marking the entry
      // invited afterwards only records it. A failure in between leaves a pending entry whose next
      // invite is a no-op on both sides.
      const created = await accounts.addAllowlisted(phone, c.get('auth').email);
      if (!(await waitlist.markInvited(entry.id, c.get('auth').userId))) {
        throw new HTTPException(409, { message: 'This lead changed while it was being approved.' });
      }
      return c.json({ id: entry.id, phone, created, status: 'invited' }, created ? 201 : 200);
    });

    r.post('/waitlist/:id/reject', can('waitlist:decide'), async (c) => {
      const id = c.req.param('id');
      if (!(await waitlist.get(id))) throw new HTTPException(404, { message: 'Waitlist entry not found' });
      if (!(await waitlist.reject(id, c.get('auth').userId))) {
        throw new HTTPException(409, { message: 'Only pending leads can be rejected.' });
      }
      return c.json({ id, status: 'rejected' });
    });

    r.post('/waitlist/:id/remove', can('waitlist:remove'), async (c) => {
      const id = c.req.param('id');
      if (!(await waitlist.get(id))) throw new HTTPException(404, { message: 'Waitlist entry not found' });
      if (!(await waitlist.remove(id, c.get('auth').userId))) {
        throw new HTTPException(409, { message: 'This lead is already removed.' });
      }
      return c.json({ id, status: 'removed' });
    });

    r.post('/waitlist/:id/reopen', can('waitlist:decide'), async (c) => {
      const id = c.req.param('id');
      if (!(await waitlist.get(id))) throw new HTTPException(404, { message: 'Waitlist entry not found' });
      if (!(await waitlist.reopen(id, c.get('auth').userId))) {
        throw new HTTPException(409, { message: 'Only rejected leads can be reopened.' });
      }
      return c.json({ id, status: 'pending' });
    });

    r.post('/waitlist/bulk', can('waitlist:decide'), zJson(waitlistBulkBody), async (c) => {
      const { ids, action } = c.req.valid('json');
      const entries = await Promise.all(ids.map((id) => waitlist.get(id)));
      if (entries.some((entry) => !entry)) throw new HTTPException(404, { message: 'A waitlist entry was not found.' });
      const found = entries.filter((entry) => entry !== null);
      if (found.some((entry) => entry.status !== 'pending')) {
        throw new HTTPException(409, { message: 'Bulk actions are only available for pending leads.' });
      }
      if (action === 'approve' && found.some((entry) => !entry.waNumber || !normalizeE164(entry.waNumber))) {
        throw new HTTPException(400, { message: 'Every lead must have a valid number to approve in bulk.' });
      }

      const results: { id: string; status: 'invited' | 'rejected' }[] = [];
      for (const entry of found) {
        if (action === 'approve') {
          const phone = normalizeE164(entry.waNumber!)!;
          await accounts.addAllowlisted(phone, c.get('auth').email);
          if (!(await waitlist.markInvited(entry.id, c.get('auth').userId))) {
            throw new HTTPException(409, { message: 'A lead changed while the bulk approval was running.' });
          }
          results.push({ id: entry.id, status: 'invited' });
        } else {
          if (!(await waitlist.reject(entry.id, c.get('auth').userId))) {
            throw new HTTPException(409, { message: 'A lead changed while the bulk rejection was running.' });
          }
          results.push({ id: entry.id, status: 'rejected' });
        }
      }
      return c.json({ results });
    });
  }

  if (!backoffice) return r;
  const { repo, settings, budget, tenancy, gateway, oauth } = backoffice;
  r.get('/settings', can('settings:read'), async (c) => c.json(await settings.current()));

  r.put('/settings', can('settings:manage'), zJson(settingsBody), async (c) =>
    c.json(await settings.update(c.req.valid('json'), c.get('auth').email)),
  );

  r.get('/sessions', can('sessions:read'), async (c) => {
    const [users, overrides, current, engine] = await Promise.all([
      repo.listUsers(),
      repo.listOverrides(),
      settings.current(),
      // The dashboard stays usable when the engine is down; status is then unknown.
      gateway.listSessions().catch(() => null),
    ]);
    const status = new Map((engine ?? []).map((s) => [s.id, s.status]));
    const sessions = await Promise.all(
      users
        .filter((u) => u.session)
        .map(async (u) => {
          const s = u.session!;
          const override = overrides.get(s.openwaSessionId) ?? null;
          const limits = effectiveLimits(current.sendLimits, override);
          const [usage, keys, grants] = await Promise.all([
            budget.usage(s.openwaSessionId),
            tenancy.listKeys(u.userId),
            oauth ? oauth.listGrants(u.userId) : Promise.resolve([]),
          ]);
          return {
            userId: u.userId,
            email: u.email,
            phone: u.phoneE164,
            openwaSessionId: s.openwaSessionId,
            name: s.name,
            createdAt: s.createdAt,
            status: status.get(s.openwaSessionId) ?? null,
            usage: { today: usage.today, ...limits, resetsInSeconds: usage.resetsInSeconds },
            override,
            keys,
            grants: grants.map((g) => ({
              grantId: g.id,
              clientName: g.clientName,
              createdAt: g.createdAt,
              lastUsedAt: g.lastUsedAt,
            })),
          };
        }),
    );
    return c.json({ sessions });
  });

  r.put('/sessions/:id/limits', can('sessions:manage'), zJson(overrideBody), async (c) => {
    const body = c.req.valid('json');
    const override = body.perDay === null && body.perMinute === null ? null : body;
    if (!(await settings.setOverride(c.req.param('id'), override, c.get('auth').email))) {
      throw new HTTPException(404, { message: 'Session not found' });
    }
    return c.json({ override });
  });

  r.delete('/keys/:id', can('sessions:manage'), async (c) => {
    const keyId = c.req.param('id');
    const owner = await repo.findKeyOwner(keyId);
    if (!owner || !(await tenancy.revokeKey(owner, keyId))) {
      throw new HTTPException(404, { message: 'Key not found or already revoked' });
    }
    await gateway.revokeApiKey(keyId).catch((err) => console.error('gateway revoke failed', keyId, err));
    return c.body(null, 204);
  });

  r.delete('/grants/:id', can('sessions:manage'), async (c) => {
    if (!oauth) throw new HTTPException(404, { message: 'Connectors are not enabled' });
    const keyId = await oauth.revokeGrant(c.req.param('id'));
    if (!keyId) throw new HTTPException(404, { message: 'Connection not found or already revoked' });
    await gateway.revokeApiKey(keyId).catch((err) => console.error('engine key revoke failed', keyId, err));
    return c.body(null, 204);
  });

  /** Stored role, except that ADMIN_EMAILS accounts are always owners (bootstrap). */
  const roleOf = (u: { email: string; role: UserRole }): UserRole => (admins.has(u.email.toLowerCase()) ? 'owner' : u.role);
  const findUser = async (userId: string) => (await repo.listUsers()).find((u) => u.userId === userId) ?? null;

  r.get('/users', can('users:read'), async (c) => {
    const users = await repo.listUsers();
    return c.json({
      users: users.map((u) => ({
        userId: u.userId,
        email: u.email,
        phone: u.phoneE164,
        createdAt: u.createdAt,
        role: roleOf(u),
        /** From ADMIN_EMAILS: always owner, cannot be demoted or disabled here. */
        bootstrapOwner: admins.has(u.email.toLowerCase()),
        hasSession: u.session !== null,
        disabled: u.disabledAt !== null,
        closureRequestedAt: u.closureRequestedAt,
      })),
    });
  });

  r.get('/users/:id/role-events', can('users:read'), async (c) => {
    const userId = c.req.param('id');
    if (!(await repo.getUserRole(userId))) throw new HTTPException(404, { message: 'User not found' });
    return c.json({ events: await repo.listUserRoleEvents(userId) });
  });

  r.put('/users/:id/role', can('roles:manage'), zJson(userRoleBody), async (c) => {
    const userId = c.req.param('id');
    const target = await findUser(userId);
    if (!target) throw new HTTPException(404, { message: 'User not found' });
    if (admins.has(target.email.toLowerCase())) {
      throw new HTTPException(409, { message: 'ADMIN_EMAILS owners cannot be demoted; remove them from ADMIN_EMAILS first.' });
    }
    const { role } = c.req.valid('json');
    const auth = c.get('auth');
    const result = await repo.setUserRole({
      userId,
      role,
      changedBy: auth.userId,
      changedByEmail: auth.email,
      bootstrapOwnerEmails: [...admins],
    });
    if (result === 'not_found') throw new HTTPException(404, { message: 'User not found' });
    if (result === 'last_owner') {
      throw new HTTPException(409, { message: 'This is the last owner; make someone else owner first.' });
    }
    return c.json({ userId, role, changed: result === 'changed' });
  });

  r.put('/users/:id', can('users:manage'), zJson(userBody), async (c) => {
    const userId = c.req.param('id');
    const { disabled } = c.req.valid('json');
    if (disabled) {
      const target = await findUser(userId);
      if (target && admins.has(target.email.toLowerCase())) {
        throw new HTTPException(400, { message: 'ADMIN_EMAILS owners cannot be disabled; remove them from ADMIN_EMAILS first.' });
      }
      if (target && roleOf(target) === 'owner' && c.get('role') !== 'owner') {
        throw new HTTPException(403, { message: 'Only an owner can disable an owner.' });
      }
      if (userId === c.get('auth').userId) {
        throw new HTTPException(400, { message: 'You cannot disable your own account.' });
      }
    }
    if (!(await settings.setUserDisabled(userId, disabled))) {
      throw new HTTPException(404, { message: 'User not found' });
    }
    return c.json({ userId, disabled });
  });

  return r;
}
