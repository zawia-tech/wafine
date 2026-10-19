/**
 * Maps a BFF auth error to a key under the `auth.errors` message namespace.
 *
 * The BFF sends `{ error, code }`: `error` is English for API clients, `code` is the stable
 * contract the UI translates. Anything without a known code (a 500, a proxy error, a code added
 * to the BFF later) falls back to the generic localized message, never to the raw English text.
 */

import { ApiError } from './bff';

export const AUTH_ERROR_CODES = [
  'invalid_input',
  'invalid_phone',
  'not_invited',
  'phone_taken',
  'email_taken',
  'weak_password',
  'rate_limited',
  'invalid_credentials',
  'email_not_confirmed',
  'session_expired',
  'wrong_password',
  'same_password',
  'invalid_email',
  'reset_link_invalid',
  'bootstrap_owner',
  'network_error',
] as const;

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];
export type AuthErrorKey = `errors.${AuthErrorCode | 'generic'}`;

const known = new Set<string>(AUTH_ERROR_CODES);

/** Message key relative to the `auth` namespace, e.g. `errors.not_invited`. */
export function authErrorKey(err: unknown): AuthErrorKey {
  const code = err instanceof ApiError ? err.code : undefined;
  return code && known.has(code) ? `errors.${code as AuthErrorCode}` : 'errors.generic';
}
