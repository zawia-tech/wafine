import { defineRouting } from 'next-intl/routing';

/**
 * Locale routing (rebrand-plan §3.5, tasks 13).
 *
 * `as-needed` keeps English at unprefixed URLs (`/`, `/whatsapp`), so the default locale's
 * URLs do not change; French and Arabic get `/fr/...` and `/ar/...`. The locale cookie is
 * named explicitly so a future cookie rename does not silently drop every preference.
 */
export const routing = defineRouting({
  locales: ['en', 'fr', 'ar'],
  defaultLocale: 'en',
  localePrefix: 'as-needed',
  localeCookie: { name: 'WAFINE_LOCALE', maxAge: 60 * 60 * 24 * 365 },
});

export type Locale = (typeof routing.locales)[number];
