/**
 * Typed client for the BFF's admin backoffice routes (send limits, sessions, users).
 *
 * Same transport as the rest of `bff.ts`: same-origin `/api/bff` proxy, bearer token from the
 * session, `{ error }` bodies surfaced as `ApiError`. The BFF checks a permission on every route
 * (role matrix in app/bff/src/domain/user-roles.ts) and answers 403 otherwise; nothing here is a
 * security boundary.
 */

import { authed, type UserRole } from './bff';

export interface SendLimits {
  perDay: number;
  perMinute: number;
}

export interface WorkflowPacing {
  minGapMs: number;
  maxPerMinuteSession: number;
  maxPerMinuteContact: number;
  backoffMs: number;
}

export interface AdminSettings {
  sendLimits: SendLimits;
  workflow: WorkflowPacing;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface AdminSettingsPatch {
  sendLimits?: Partial<SendLimits>;
  workflow?: Partial<WorkflowPacing>;
}

export interface LimitOverride {
  perDay: number | null;
  perMinute: number | null;
}

export interface AdminSessionKey {
  id: string;
  keyPrefix: string;
  createdAt: string;
  revokedAt: string | null;
}

export interface AdminSessionGrant {
  grantId: string;
  clientName: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface AdminSession {
  userId: string;
  email: string | null;
  phone: string | null;
  openwaSessionId: string;
  name: string;
  createdAt: string;
  status: string | null;
  usage: { today: number; perDay: number; perMinute: number; resetsInSeconds: number };
  override: LimitOverride | null;
  keys: AdminSessionKey[];
  grants: AdminSessionGrant[];
}

export interface AdminUser {
  userId: string;
  email: string | null;
  phone: string;
  createdAt: string;
  role: UserRole;
  /** From ADMIN_EMAILS: always owner, cannot be demoted or disabled here. */
  bootstrapOwner: boolean;
  hasSession: boolean;
  disabled: boolean;
  /** The user asked to close the account (settings page); pending review. */
  closureRequestedAt: string | null;
}

export interface AdminUserRoleEvent {
  id: string;
  userId: string;
  changedBy: string;
  changedByEmail: string;
  fromRole: AdminUser['role'];
  toRole: AdminUser['role'];
  createdAt: string;
}

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export const getAdminSettings = () => authed<AdminSettings>('/api/admin/settings');

export const updateAdminSettings = (patch: AdminSettingsPatch) =>
  authed<AdminSettings>('/api/admin/settings', json('PUT', patch));

export const listAdminSessions = () =>
  authed<{ sessions: AdminSession[] }>('/api/admin/sessions').then((r) => r.sessions);

/** Both fields null clears the override (the session falls back to the global caps). */
export const setSessionLimits = (openwaSessionId: string, override: LimitOverride) =>
  authed<{ override: LimitOverride | null }>(
    `/api/admin/sessions/${encodeURIComponent(openwaSessionId)}/limits`,
    json('PUT', override),
  ).then((r) => r.override);

export const adminRevokeKey = (keyId: string) =>
  authed<void>(`/api/admin/keys/${encodeURIComponent(keyId)}`, { method: 'DELETE' });

export const adminRevokeGrant = (grantId: string) =>
  authed<void>(`/api/admin/grants/${encodeURIComponent(grantId)}`, { method: 'DELETE' });

export const listAdminUsers = () => authed<{ users: AdminUser[] }>('/api/admin/users').then((r) => r.users);

export const setUserDisabled = (userId: string, disabled: boolean) =>
  authed<{ userId: string; disabled: boolean }>(`/api/admin/users/${encodeURIComponent(userId)}`, json('PUT', { disabled }));

export const setUserRole = (userId: string, role: UserRole) =>
  authed<{ userId: string; role: UserRole; changed: boolean }>(`/api/admin/users/${encodeURIComponent(userId)}/role`, json('PUT', { role }));

export const listUserRoleEvents = (userId: string) =>
  authed<{ events: AdminUserRoleEvent[] }>(`/api/admin/users/${encodeURIComponent(userId)}/role-events`).then((r) => r.events);
