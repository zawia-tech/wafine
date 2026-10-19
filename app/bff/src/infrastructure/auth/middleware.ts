/**
 * Auth middleware — resolves a Supabase access token (via the identity provider)
 * to the calling user and decides admin status from the `ADMIN_EMAILS` list.
 * Missing/invalid credentials throw HTTPException(401); `app.onError` renders it.
 */

import { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { IIdentityProvider } from '../../domain/ports/index.js';

export interface AuthContext {
  userId: string;
  /**
   * Tenant the caller acts for. PoC: one tenant per user, so this is the verified Supabase
   * user id. Only ever derived from the verified session, never from a request header.
   */
  tenantId: string;
  email: string;
  isAdmin: boolean;
}

declare module 'hono' {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

export function createAuthMiddleware(identity: IIdentityProvider, adminEmails: readonly string[]) {
  const admins = new Set(adminEmails.map((e) => e.trim().toLowerCase()).filter(Boolean));

  return async (c: Context, next: Next) => {
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ') || authHeader.length <= 7) {
      throw new HTTPException(401, { message: 'Missing or invalid Authorization header' });
    }

    const user = await identity.getUser(authHeader.slice(7));
    if (!user) {
      throw new HTTPException(401, { message: 'Session expired or invalid' });
    }

    c.set('auth', {
      userId: user.userId,
      tenantId: user.userId,
      email: user.email,
      // Admin only for a confirmed email, so nobody can claim an admin address by signing
      // up with it before its owner does.
      isAdmin: user.emailConfirmed && admins.has(user.email),
    });

    await next();
  };
}

export async function requireAdmin(c: Context, next: Next) {
  if (!c.get('auth').isAdmin) {
    throw new HTTPException(403, { message: 'Admin access required' });
  }
  await next();
}
