/**
 * Roles and the admin permission matrix: the one place that says who may do what in /admin.
 *
 * Every admin BFF route names the permission it needs (`requirePermission` in
 * infrastructure/auth/admin-authorization.ts); the web reads the same list from `GET /api/me`
 * to show, hide or disable tabs and actions. Changing a role's reach is an edit to MATRIX only.
 */

export const USER_ROLES = ['owner', 'admin', 'support', 'viewer', 'user'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const PERMISSIONS = [
  'allowlist:read',
  'allowlist:manage',
  'waitlist:read',
  /** Approve (invite), reject and reopen leads, one by one or in bulk. */
  'waitlist:decide',
  /** Soft-remove a lead (status `removed`; the row is kept). */
  'waitlist:remove',
  'settings:read',
  /** Global API send caps and workflow pacing. */
  'settings:manage',
  'sessions:read',
  /** Per-session send-cap overrides, revoking API keys and Claude connectors. */
  'sessions:manage',
  'users:read',
  /** Disable / enable accounts. */
  'users:manage',
  /** Change another account's role. Owner only. */
  'roles:manage',
  /** Billing (tab not built yet). Owner only. */
  'billing:manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const READ_ONLY: readonly Permission[] = ['allowlist:read', 'waitlist:read', 'settings:read', 'sessions:read', 'users:read'];

const MATRIX: Record<UserRole, readonly Permission[]> = {
  owner: PERMISSIONS,
  admin: PERMISSIONS.filter((p) => p !== 'roles:manage' && p !== 'billing:manage'),
  support: ['allowlist:read', 'waitlist:read', 'waitlist:decide', 'sessions:read', 'users:read'],
  viewer: READ_ONLY,
  user: [],
};

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && (USER_ROLES as readonly string[]).includes(value);
}

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return MATRIX[role].includes(permission);
}

export function permissionsForRole(role: UserRole): readonly Permission[] {
  return MATRIX[role];
}

/** Any role above `user` may open /admin (what it sees there is per permission). */
export function canOpenAdmin(role: UserRole): boolean {
  return MATRIX[role].length > 0;
}

/**
 * The role a request acts with. A confirmed `ADMIN_EMAILS` identity is always `owner` (the
 * bootstrap: it cannot be demoted, whatever the stored row says); everyone else gets the stored
 * role, and an account without a profile row is a plain `user`.
 */
export function effectiveUserRole(isBootstrapOwner: boolean, storedRole: UserRole | null | undefined): UserRole {
  if (isBootstrapOwner) return 'owner';
  return isUserRole(storedRole) ? storedRole : 'user';
}
