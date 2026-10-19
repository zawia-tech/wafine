import { describe, expect, it } from 'bun:test';
import { abilities, canEditRole, visibleTabs } from './admin-permissions';
import type { AdminPermission } from './bff';

// Mirrors the BFF matrix (app/bff/src/domain/user-roles.ts) for the roles the UI must handle.
const OWNER: AdminPermission[] = [
  'allowlist:read', 'allowlist:manage', 'waitlist:read', 'waitlist:decide', 'waitlist:remove',
  'settings:read', 'settings:manage', 'sessions:read', 'sessions:manage', 'users:read', 'users:manage',
  'roles:manage', 'billing:manage',
];
const ADMIN = OWNER.filter((p) => p !== 'roles:manage' && p !== 'billing:manage');
const SUPPORT: AdminPermission[] = ['allowlist:read', 'waitlist:read', 'waitlist:decide', 'sessions:read', 'users:read'];
const VIEWER: AdminPermission[] = ['allowlist:read', 'waitlist:read', 'settings:read', 'sessions:read', 'users:read'];

describe('visibleTabs', () => {
  it('shows every tab to an owner and hides the owner-only previews from an admin', () => {
    expect(visibleTabs(OWNER)).toEqual(['limits', 'sessions', 'users', 'allowlist', 'waitlist', 'billing', 'crm']);
    expect(visibleTabs(ADMIN)).toEqual(['limits', 'sessions', 'users', 'allowlist', 'waitlist']);
  });

  it('hides send limits from support, which has no settings permission', () => {
    expect(visibleTabs(SUPPORT)).toEqual(['sessions', 'users', 'allowlist', 'waitlist']);
  });

  it('shows nothing to a plain user', () => {
    expect(visibleTabs([])).toEqual([]);
  });
});

describe('abilities', () => {
  it('gives a viewer no write action', () => {
    expect(Object.values(abilities(VIEWER)).some(Boolean)).toBe(false);
  });

  it('lets support decide on leads but not remove them, change roles or limits', () => {
    expect(abilities(SUPPORT)).toEqual({
      manageSettings: false,
      manageSessions: false,
      manageUsers: false,
      manageRoles: false,
      manageAllowlist: false,
      decideWaitlist: true,
      removeWaitlist: false,
    });
  });

  it('keeps role changes with owners', () => {
    expect(abilities(ADMIN).manageRoles).toBe(false);
    expect(abilities(OWNER).manageRoles).toBe(true);
  });
});

describe('canEditRole', () => {
  it('never offers a selector for an ADMIN_EMAILS owner, nor to a non-owner', () => {
    expect(canEditRole(true, { bootstrapOwner: true })).toBe(false);
    expect(canEditRole(false, { bootstrapOwner: false })).toBe(false);
    expect(canEditRole(true, { bootstrapOwner: false })).toBe(true);
  });
});
