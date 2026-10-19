/**
 * Admin authorization. `loadAdminRole` runs once in front of /api/admin/*: it resolves the
 * caller's role (ADMIN_EMAILS bootstrap owner, else the stored role) and answers 403 to a plain
 * `user`. Each admin route then states the permission it needs with `requirePermission`, checked
 * against the matrix in domain/user-roles.ts. A route with no guard is caught by the route table
 * test in admin-roles.test.ts.
 */

import type { Context, MiddlewareHandler, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { IAccountsRepository } from '../../domain/ports/accounts.js';
import {
  canOpenAdmin,
  effectiveUserRole,
  hasPermission,
  type Permission,
  type UserRole,
} from '../../domain/user-roles.js';

declare module 'hono' {
  interface ContextVariableMap {
    role: UserRole;
  }
}

/** Resolve the caller's role. Exported for /me and login, which report it. */
export async function resolveRole(
  accounts: IAccountsRepository,
  auth: { userId: string; isAdmin: boolean },
): Promise<UserRole> {
  if (auth.isAdmin) return 'owner';
  const profile = await accounts.findProfileByUserId(auth.userId);
  return effectiveUserRole(false, profile?.role);
}

export function loadAdminRole(accounts: IAccountsRepository) {
  return async (c: Context, next: Next) => {
    const role = await resolveRole(accounts, c.get('auth'));
    if (!canOpenAdmin(role)) throw new HTTPException(403, { message: 'Admin access required' });
    c.set('role', role);
    await next();
  };
}

export function requirePermission(permission: Permission): MiddlewareHandler {
  return async (c, next) => {
    const role = c.get('role');
    if (!role || !hasPermission(role, permission)) {
      throw new HTTPException(403, { message: `Your role does not allow this (${permission}).` });
    }
    await next();
  };
}
