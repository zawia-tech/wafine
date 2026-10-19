/**
 * Client-side checks for the settings, forgot-password and reset forms. They mirror the BFF
 * (app/bff/src/adapters/http/routes/account.ts and auth.ts), which validates again: these only
 * give an instant, translated message. Each returns a key under `settingsPage.errors`, or null.
 */

/** Same rule as sign-up (BFF `newPassword`): 8 to 128 characters. */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
export const DISPLAY_NAME_MAX = 80;

export type AccountFieldError =
  | 'nameTooLong'
  | 'nameInvalid'
  | 'emailInvalid'
  | 'emailSame'
  | 'passwordTooShort'
  | 'passwordTooLong'
  | 'passwordMismatch'
  | 'passwordSame'
  | 'currentRequired';

/** What the BFF stores: inner whitespace collapsed and trimmed; empty means "no name". */
export function normalizeDisplayName(raw: string): string | null {
  const name = raw.replace(/\s+/g, ' ').trim();
  return name === '' ? null : name;
}

export function displayNameError(raw: string): AccountFieldError | null {
  const name = normalizeDisplayName(raw);
  if (name === null) return null;
  if (name.length > DISPLAY_NAME_MAX) return 'nameTooLong';
  if (/[\u0000-\u001f\u007f]/.test(name)) return 'nameInvalid';
  return null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function emailError(raw: string, current?: string): AccountFieldError | null {
  const email = raw.trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 254) return 'emailInvalid';
  if (current && email === current.trim().toLowerCase()) return 'emailSame';
  return null;
}

export function newPasswordError(
  password: string,
  confirm: string,
  current?: string,
): AccountFieldError | null {
  if (password.length < PASSWORD_MIN) return 'passwordTooShort';
  if (password.length > PASSWORD_MAX) return 'passwordTooLong';
  if (password !== confirm) return 'passwordMismatch';
  if (current !== undefined && password === current) return 'passwordSame';
  return null;
}

/**
 * The recovery token from a Supabase reset link. GoTrue redirects to
 * `/auth/reset#access_token=…&type=recovery…` (implicit flow); an error comes back as
 * `#error=…&error_description=…`. Returns null when the link carries no usable token.
 */
export function recoveryTokenFromHash(hash: string): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  if (params.get('error')) return null;
  const token = params.get('access_token');
  const type = params.get('type');
  return token && (type === null || type === 'recovery') ? token : null;
}
