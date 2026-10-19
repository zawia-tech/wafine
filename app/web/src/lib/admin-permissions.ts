/**
 * What the admin UI shows for a set of permissions (from `GET /api/me`).
 *
 * Pure so it is unit-tested directly. The BFF checks the same permission on every admin route
 * (app/bff/src/domain/user-roles.ts); this only decides what to render, it is not a boundary.
 */

import type { AdminPermission, UserRole } from './bff';

export const ADMIN_TAB_IDS = ['limits', 'sessions', 'users', 'allowlist', 'waitlist', 'billing', 'crm'] as const;
export type AdminTabId = (typeof ADMIN_TAB_IDS)[number];

/** The permission a tab needs to be shown at all. Billing and CRM are owner-only previews. */
export const TAB_PERMISSION: Record<AdminTabId, AdminPermission> = {
  limits: 'settings:read',
  sessions: 'sessions:read',
  users: 'users:read',
  allowlist: 'allowlist:read',
  waitlist: 'waitlist:read',
  billing: 'billing:manage',
  crm: 'billing:manage',
};

export function visibleTabs(permissions: readonly string[]): AdminTabId[] {
  return ADMIN_TAB_IDS.filter((id) => permissions.includes(TAB_PERMISSION[id]));
}

/** Per-action switches the tabs take as props. */
export interface AdminAbilities {
  manageSettings: boolean;
  manageSessions: boolean;
  manageUsers: boolean;
  manageRoles: boolean;
  manageAllowlist: boolean;
  decideWaitlist: boolean;
  removeWaitlist: boolean;
}

export function abilities(permissions: readonly string[]): AdminAbilities {
  const has = (p: AdminPermission) => permissions.includes(p);
  return {
    manageSettings: has('settings:manage'),
    manageSessions: has('sessions:manage'),
    manageUsers: has('users:manage'),
    manageRoles: has('roles:manage'),
    manageAllowlist: has('allowlist:manage'),
    decideWaitlist: has('waitlist:decide'),
    removeWaitlist: has('waitlist:remove'),
  };
}

/** Roles an owner may pick in the Users tab (owner included: more than one owner is allowed). */
export const ASSIGNABLE_ROLES: readonly UserRole[] = ['owner', 'admin', 'support', 'viewer', 'user'];

/** A role selector is shown only to owners, never for ADMIN_EMAILS owners (bootstrap, fixed). */
export function canEditRole(manageRoles: boolean, target: { bootstrapOwner: boolean }): boolean {
  return manageRoles && !target.bootstrapOwner;
}
