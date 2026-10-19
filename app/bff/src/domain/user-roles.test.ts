import { describe, expect, it } from 'bun:test';
import {
  PERMISSIONS,
  USER_ROLES,
  canOpenAdmin,
  effectiveUserRole,
  hasPermission,
  permissionsForRole,
  type Permission,
  type UserRole,
} from './user-roles.js';

/** The matrix spelled out: a change to a role's reach must change this table too. */
const EXPECTED: Record<UserRole, Permission[]> = {
  owner: [...PERMISSIONS],
  admin: PERMISSIONS.filter((p) => p !== 'roles:manage' && p !== 'billing:manage'),
  support: ['allowlist:read', 'waitlist:read', 'waitlist:decide', 'sessions:read', 'users:read'],
  viewer: ['allowlist:read', 'waitlist:read', 'settings:read', 'sessions:read', 'users:read'],
  user: [],
};

describe('permission matrix', () => {
  for (const role of USER_ROLES) {
    it(`gives ${role} exactly its permissions`, () => {
      expect([...permissionsForRole(role)].sort()).toEqual([...EXPECTED[role]].sort());
      for (const p of PERMISSIONS) expect(hasPermission(role, p)).toBe(EXPECTED[role].includes(p));
    });
  }

  it('keeps role changes and billing with owners only', () => {
    expect(USER_ROLES.filter((r) => hasPermission(r, 'roles:manage'))).toEqual(['owner']);
    expect(USER_ROLES.filter((r) => hasPermission(r, 'billing:manage'))).toEqual(['owner']);
  });

  it('gives viewers no write permission', () => {
    expect(permissionsForRole('viewer').every((p) => p.endsWith(':read'))).toBe(true);
  });

  it('opens /admin to every role above user', () => {
    expect(USER_ROLES.filter(canOpenAdmin)).toEqual(['owner', 'admin', 'support', 'viewer']);
  });
});

describe('effectiveUserRole', () => {
  it('makes a bootstrap identity owner whatever is stored', () => {
    expect(effectiveUserRole(true, 'user')).toBe('owner');
    expect(effectiveUserRole(true, null)).toBe('owner');
  });

  it('uses the stored role otherwise, and defaults to user', () => {
    expect(effectiveUserRole(false, 'support')).toBe('support');
    expect(effectiveUserRole(false, 'owner')).toBe('owner');
    expect(effectiveUserRole(false, null)).toBe('user');
    expect(effectiveUserRole(false, 'root' as UserRole)).toBe('user');
  });
});
