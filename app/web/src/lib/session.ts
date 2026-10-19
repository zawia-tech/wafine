/**
 * Session management — Supabase access/refresh tokens issued by the BFF.
 * Tokens live in memory and are mirrored to sessionStorage (this tab only, cleared when
 * it closes) so a reload does not log the user out. Never localStorage.
 * KEKs are cached in memory only.
 */

const SESSION_KEY = 'wafine_session';
const KEK_CACHE_KEY = 'wafine_kek_cache';

export interface Session {
  /** Access token (Supabase JWT), sent as `Authorization: Bearer`. */
  token: string;
  refreshToken: string;
  /** Access-token expiry, epoch ms. */
  expiresAt: number;
  email: string;
  isAdmin: boolean;
}

let currentSession: Session | null = null;

export function getSession(): Session | null {
  if (currentSession) return currentSession;
  try {
    const raw = globalThis.sessionStorage?.getItem(SESSION_KEY);
    if (raw) currentSession = JSON.parse(raw) as Session;
  } catch {
    // storage unavailable or corrupt: behave as logged out
  }
  return currentSession;
}

export function setSession(session: Session): void {
  currentSession = session;
  try {
    globalThis.sessionStorage?.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // in-memory only
  }
}

export function clearSession(): void {
  currentSession = null;
  try {
    globalThis.sessionStorage?.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
  // Also clear any cached KEK
  clearKekCache();
}

/**
 * Cache the unwrapped KEK in memory only.
 * Never persist to localStorage or sessionStorage.
 */
let cachedKek: Uint8Array | null = null;

export function cacheKek(kek: Uint8Array): void {
  cachedKek = kek;
}

export function getCachedKek(): Uint8Array | null {
  return cachedKek;
}

export function clearKekCache(): void {
  if (cachedKek) {
    cachedKek.fill(0); // zeroize
    cachedKek = null;
  }
}

/**
 * Check if the session is expired.
 */
export function isSessionExpired(): boolean {
  const session = getSession();
  if (!session) return true;
  return Date.now() >= session.expiresAt;
}
