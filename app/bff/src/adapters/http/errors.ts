/**
 * Machine-readable error codes for the BFF error envelope.
 *
 * Every error response stays `{ error: string }` (English, for API clients and logs); routes that
 * a UI localizes also send a stable `code`, so the web maps it to its own message catalog
 * instead of showing the English text. The codes are a public contract: add, never rename.
 */

import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

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
  // Account self-service and password reset.
  'wrong_password',
  'same_password',
  'invalid_email',
  'reset_link_invalid',
  'bootstrap_owner',
] as const;

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];

/** An HTTPException that also carries a stable `code` into the `{ error, code }` envelope. */
export class CodedHTTPException extends HTTPException {
  constructor(
    status: ContentfulStatusCode,
    readonly code: AuthErrorCode,
    message: string,
  ) {
    super(status, { message });
  }
}
