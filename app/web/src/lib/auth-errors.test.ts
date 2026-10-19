import { describe, expect, test } from 'bun:test';
import en from '../../messages/en.json';
import fr from '../../messages/fr.json';
import ar from '../../messages/ar.json';
import { AUTH_ERROR_CODES, authErrorKey } from './auth-errors';
import { ApiError } from './bff';

const catalogs = { en, fr, ar } as const;

/** Codes the BFF sends (app/bff/src/adapters/http/errors.ts); `network_error` is client-side. */
const BFF_CODES = [
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
];

describe('auth error mapping', () => {
  test('covers every code the BFF sends', () => {
    for (const code of BFF_CODES) expect(AUTH_ERROR_CODES as readonly string[]).toContain(code);
  });

  for (const code of AUTH_ERROR_CODES) {
    test(`maps ${code} to its own localized message in en, fr and ar`, () => {
      const key = authErrorKey(new ApiError(400, 'English text from the BFF', code));
      expect(key).toBe(`errors.${code}`);
      for (const [locale, catalog] of Object.entries(catalogs)) {
        const message = (catalog.auth.errors as Record<string, string>)[code];
        expect(message, `${locale}.auth.errors.${code}`).toBeTruthy();
        if (locale !== 'en') expect(message).not.toBe((en.auth.errors as Record<string, string>)[code]);
      }
    });
  }

  test('falls back to the generic message for unknown or missing codes', () => {
    expect(authErrorKey(new ApiError(500, 'Internal server error'))).toBe('errors.generic');
    expect(authErrorKey(new ApiError(418, 'Teapot', 'brand_new_code'))).toBe('errors.generic');
    expect(authErrorKey(new Error('boom'))).toBe('errors.generic');
    expect(authErrorKey('nope')).toBe('errors.generic');
    for (const catalog of Object.values(catalogs)) expect(catalog.auth.errors.generic).toBeTruthy();
  });
});
