/**
 * Typed client for the BFF's auth, account and admin routes.
 *
 * Every call goes to this app's own origin under /api/bff; the Next.js route handler
 * (app/api/bff/[...path]/route.ts) forwards it to the BFF. The BFF address is server-only
 * config and is never referenced from client code. The browser never sees a Supabase key,
 * only the access/refresh tokens the BFF hands back.
 */

import { clearSession, getSession, setSession, type Session } from './session';

export const BFF_BASE = '/api/bff';

/** `path` is the BFF path, e.g. `/api/workflows`. Credentials stay first-party (same origin). */
export function bffFetch(path: string, init: RequestInit = {}): Promise<Response> {
  if (!path.startsWith('/api/')) throw new Error(`BFF path must start with /api/: ${path}`);
  return fetch(`${BFF_BASE}${path}`, { ...init, credentials: 'same-origin' });
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    /** Stable machine code from the BFF envelope (`{ error, code }`), when the route sends one. */
    public readonly code?: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const { token, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (rest.body) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let res: Response;
  try {
    res = await fetch(`${BFF_BASE}${path}`, { ...rest, headers, credentials: 'same-origin' });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Try again in a moment.', 'network_error');
  }
  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
  if (!res.ok) {
    throw new ApiError(
      res.status,
      body.error ?? `Request failed (${res.status})`,
      typeof body.code === 'string' ? body.code : undefined,
    );
  }
  return body as T;
}

interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  email: string;
  isAdmin: boolean;
}

function toSession(t: TokenResponse): Session {
  return {
    token: t.accessToken,
    refreshToken: t.refreshToken,
    expiresAt: Date.now() + t.expiresIn * 1000,
    email: t.email,
    isAdmin: t.isAdmin,
  };
}

export async function signUp(input: { email: string; password: string; phone: string }) {
  return request<{ ok: true; phone: string; emailConfirmationRequired: boolean }>('/auth/signup', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function login(email: string, password: string): Promise<Session> {
  const session = toSession(
    await request<TokenResponse>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  );
  setSession(session);
  return session;
}

/** Forgot password: the BFF answers the same whether or not the address has an account. */
export async function requestPasswordReset(email: string): Promise<void> {
  await request<{ status: 'check_inbox' }>('/auth/forgot', { method: 'POST', body: JSON.stringify({ email }) });
}

/** Set a new password with the recovery token from the reset e-mail link. */
export async function resetPassword(accessToken: string, password: string): Promise<void> {
  await request<{ ok: true }>('/auth/reset', { method: 'POST', body: JSON.stringify({ accessToken, password }) });
}

/** Public waitlist sign-up from the landing page: anonymous, no session, no bearer token. */
export async function joinWaitlist(input: {
  email: string;
  waNumber: string;
  useCase: string;
  locale: string;
  ref?: string;
  utm_source?: string;
  utm_campaign?: string;
}): Promise<void> {
  await request<{ ok: true }>('/waitlist', { method: 'POST', body: JSON.stringify(input) });
}

/** Valid access token, refreshing it if it is about to expire. Null means logged out. */
async function accessToken(): Promise<string | null> {
  const session = getSession();
  if (!session) return null;
  if (Date.now() < session.expiresAt - 30_000) return session.token;
  try {
    const next = toSession(
      await request<TokenResponse>('/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refreshToken: session.refreshToken }),
      }),
    );
    setSession(next);
    return next.token;
  } catch {
    clearSession();
    return null;
  }
}

export async function authed<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await accessToken();
  if (!token) throw new ApiError(401, 'Please log in again.');
  try {
    return await request<T>(path, { ...init, token });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) clearSession();
    throw err;
  }
}

/** Mirrors app/bff/src/domain/user-roles.ts. */
export const USER_ROLES = ['owner', 'admin', 'support', 'viewer', 'user'] as const;
export type UserRole = (typeof USER_ROLES)[number];
export type AdminPermission =
  | 'allowlist:read'
  | 'allowlist:manage'
  | 'waitlist:read'
  | 'waitlist:decide'
  | 'waitlist:remove'
  | 'settings:read'
  | 'settings:manage'
  | 'sessions:read'
  | 'sessions:manage'
  | 'users:read'
  | 'users:manage'
  | 'roles:manage'
  | 'billing:manage';

export interface Me {
  userId: string;
  email: string;
  /** Any role above `user`: may open /admin. */
  isAdmin: boolean;
  role: UserRole;
  /** What the role may do in /admin; the BFF checks the same list on every admin route. */
  permissions: AdminPermission[];
  phone: string | null;
  /** Shown instead of the e-mail when set (settings page). */
  displayName: string | null;
}

export interface AllowlistEntry {
  phoneE164: string;
  addedBy: string;
  addedAt: string;
  boundEmail: string | null;
}

export const getMe = () => authed<Me>('/api/me');

export const listAllowlist = () =>
  authed<{ entries: AllowlistEntry[] }>('/api/admin/allowlist').then((r) => r.entries);

export const addAllowlisted = (phone: string) =>
  authed<{ phone: string; created: boolean }>('/api/admin/allowlist', {
    method: 'POST',
    body: JSON.stringify({ phone }),
  });

export const removeAllowlisted = (phoneE164: string) =>
  authed<void>(`/api/admin/allowlist/${encodeURIComponent(phoneE164)}`, { method: 'DELETE' });

// ── Waitlist (admin) ──────────────────────────────────────────

export type WaitlistStatus = 'pending' | 'invited' | 'rejected' | 'removed';
export type WaitlistEventAction = 'invited' | 'rejected' | 'removed' | 'reopened';

export interface WaitlistEntry {
  id: string;
  email: string;
  /** The number the visitor left, if any; the invite needs one either way. */
  waNumber: string | null;
  useCase: string | null;
  locale: string;
  status: WaitlistStatus;
  createdAt: string;
  invitedAt: string | null;
  removedAt: string | null;
  sourceRef?: string | null;
  utmSource?: string | null;
  utmCampaign?: string | null;
}

export interface WaitlistEvent {
  id: string;
  waitlistId: string;
  adminId: string;
  action: WaitlistEventAction;
  createdAt: string;
  fromStatus: WaitlistStatus;
  toStatus: WaitlistStatus;
}

export interface WaitlistPage {
  entries: WaitlistEntry[];
  /** Matching entries, ignoring limit/offset. */
  total: number;
  limit: number;
  offset: number;
  sourceCounts: WaitlistSourceCount[];
}

export interface WaitlistSourceCount {
  field: 'ref' | 'utm_source' | 'utm_campaign';
  value: string;
  total: number;
  last7Days: number;
}

export const listWaitlist = (params: { status?: WaitlistStatus; search?: string; limit?: number; offset?: number } = {}) => {
  const query = new URLSearchParams();
  if (params.status) query.set('status', params.status);
  if (params.search?.trim()) query.set('search', params.search.trim());
  if (params.limit !== undefined) query.set('limit', String(params.limit));
  if (params.offset !== undefined) query.set('offset', String(params.offset));
  const qs = query.toString();
  return authed<WaitlistPage>(`/api/admin/waitlist${qs ? `?${qs}` : ''}`);
};

/** Invite a lead: the BFF adds the number to the allowlist and marks the entry invited. */
export const inviteWaitlistEntry = (id: string, phone?: string) =>
  authed<{ id: string; phone: string; created: boolean; status: WaitlistStatus }>(
    `/api/admin/waitlist/${encodeURIComponent(id)}/invite`,
    { method: 'POST', body: JSON.stringify(phone ? { phone } : {}) },
  );

export const getWaitlistDetails = (id: string) =>
  authed<{ entry: WaitlistEntry; events: WaitlistEvent[] }>(`/api/admin/waitlist/${encodeURIComponent(id)}`);
export const rejectWaitlistEntry = (id: string) =>
  authed<{ id: string; status: 'rejected' }>(`/api/admin/waitlist/${encodeURIComponent(id)}/reject`, { method: 'POST' });
export const removeWaitlistEntry = (id: string) =>
  authed<{ id: string; status: 'removed' }>(`/api/admin/waitlist/${encodeURIComponent(id)}/remove`, { method: 'POST' });
export const reopenWaitlistEntry = (id: string) =>
  authed<{ id: string; status: 'pending' }>(`/api/admin/waitlist/${encodeURIComponent(id)}/reopen`, { method: 'POST' });
export const bulkWaitlistEntries = (ids: string[], action: 'approve' | 'reject') =>
  authed<{ results: Array<{ id: string; status: 'invited' | 'rejected' }> }>('/api/admin/waitlist/bulk', {
    method: 'POST',
    body: JSON.stringify({ ids, action }),
  });

// ── WhatsApp session, API keys, connection info ───────────────

export type WaStatus =
  | 'created'
  | 'initializing'
  | 'qr_ready'
  | 'authenticating'
  | 'ready'
  | 'disconnected'
  | 'action_required'
  | 'failed'
  | 'phone_mismatch';

export interface WaSession {
  id: string;
  name: string;
  status: WaStatus;
  phone: string | null;
  lastError: string | null;
}

export interface WaKey {
  id: string;
  keyPrefix: string;
  createdAt: string;
  revokedAt: string | null;
}

export interface NewWaKey {
  id: string;
  keyPrefix: string;
  /** Plaintext key: shown once, never retrievable again. */
  apiKey: string;
  restBase: string;
  mcpUrl: string;
  sessionId: string;
}

export const getWaSession = () => authed<{ session: WaSession | null; error?: string }>('/api/wa/session');
export const createWaSession = () => authed<{ session: WaSession }>('/api/wa/session', { method: 'POST' });
export const startWaSession = () => authed<{ session: WaSession }>('/api/wa/session/start', { method: 'POST' });
export const logoutWaSession = () => authed<{ ok: true }>('/api/wa/session/logout', { method: 'POST' });
export const deleteWaSession = () => authed<void>('/api/wa/session', { method: 'DELETE' });
export const getWaQr = () => authed<{ qrCode: string | null; status: WaStatus }>('/api/wa/session/qr');
export const listWaKeys = () => authed<{ keys: WaKey[] }>('/api/wa/keys').then((r) => r.keys);
export const createWaKey = () => authed<NewWaKey>('/api/wa/keys', { method: 'POST' });
export const revokeWaKey = (id: string) => authed<void>(`/api/wa/keys/${encodeURIComponent(id)}`, { method: 'DELETE' });
export const getWaConnectInfo = () =>
  authed<{ restBase: string; mcpUrl: string; authHeader: string }>('/api/wa/connect-info');

// ── OAuth connectors (Claude) ─────────────────────────────────

export interface OAuthRequestInfo {
  clientName: string;
  redirectHost: string;
  /** True when the app redirects to this computer (Claude Code), not to claude.ai. */
  loopback: boolean;
  scope: string;
  hasSession: boolean;
}

export interface ConnectedApp {
  id: string;
  clientId: string;
  clientName: string;
  scope: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export const getOAuthRequest = (id: string) =>
  authed<OAuthRequestInfo>(`/api/oauth/requests/${encodeURIComponent(id)}`);
export const approveOAuthRequest = (id: string) =>
  authed<{ redirectTo: string }>(`/api/oauth/requests/${encodeURIComponent(id)}/approve`, { method: 'POST' });
export const denyOAuthRequest = (id: string) =>
  authed<{ redirectTo: string }>(`/api/oauth/requests/${encodeURIComponent(id)}/deny`, { method: 'POST' });
export const listConnectedApps = () => authed<{ grants: ConnectedApp[] }>('/api/oauth/grants').then((r) => r.grants);
export const revokeConnectedApp = (id: string) =>
  authed<void>(`/api/oauth/grants/${encodeURIComponent(id)}`, { method: 'DELETE' });

// ── Account self-service (settings page) ─────────────────────

export interface Account {
  email: string;
  displayName: string | null;
  /** Read-only: an admin changes it. */
  phone: string | null;
  closureRequestedAt: string | null;
}

export const getAccount = () => authed<Account>('/api/account');

export const updateDisplayName = (displayName: string | null) =>
  authed<{ displayName: string | null }>('/api/account/profile', {
    method: 'PATCH',
    body: JSON.stringify({ displayName }),
  });

/** Starts an e-mail change; Supabase sends the confirmation link. */
export const changeEmail = (email: string) =>
  authed<{ status: 'check_inbox'; email: string }>('/api/account/email', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });

export const changePassword = (currentPassword: string, newPassword: string) =>
  authed<{ ok: true }>('/api/account/password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  });

/** Ends every session of the account, this one included. */
export const signOutEverywhere = () => authed<void>('/api/account/sign-out-all', { method: 'POST' });

/** KEEP ALL DATA: flags the account for admin review and disables it; nothing is deleted. */
export const requestAccountClosure = () =>
  authed<{ closureRequestedAt: string }>('/api/account/closure', { method: 'POST' });
