import { Hono } from 'hono';
import type { IAccountsRepository } from '../../../domain/ports/index.js';
import { canOpenAdmin, effectiveUserRole, permissionsForRole } from '../../../domain/user-roles.js';

/** `GET /me` — the caller's identity and the WhatsApp number bound to their account. */
export function meRoutes(accounts: IAccountsRepository): Hono {
  const r = new Hono();
  r.get('/me', async (c) => {
    const auth = c.get('auth');
    const profile = await accounts.findProfileByUserId(auth.userId);
    const role = effectiveUserRole(auth.isAdmin, profile?.role);
    return c.json({
      userId: auth.userId,
      email: auth.email,
      /** Any role above `user`: may open /admin. What it can do there is `permissions`. */
      isAdmin: canOpenAdmin(role),
      role,
      permissions: permissionsForRole(role),
      phone: profile?.phoneE164 ?? null,
      /** Shown instead of the e-mail in the header when set. */
      displayName: profile?.displayName ?? null,
    });
  });
  return r;
}
