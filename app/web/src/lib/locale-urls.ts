import { routing } from '@/i18n/routing';

/** Canonical + hreflang alternates for one localized page. */
export interface LocaleAlternates {
  canonical: string;
  languages: Record<string, string>;
}

/**
 * Per-page canonical and hreflang alternates for a localized route.
 *
 * The root layout used to set `alternates.canonical: '/'` site-wide, so `/fr`, `/ar` and
 * `/fr/privacy` all canonicalized to the English home page — Google would treat them as
 * duplicates and might never index them. The locale layout now derives the canonical from
 * the request pathname (see `x-pathname` in src/proxy.ts) instead.
 */

const { locales, defaultLocale } = routing;

/** Drop a leading `/fr` / `/ar` (the default locale is unprefixed) leaving `/` or `/path`. */
export function stripLocalePrefix(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, '') || '/';
  for (const locale of locales) {
    if (locale === defaultLocale) continue;
    if (trimmed === `/${locale}`) return '/';
    if (trimmed.startsWith(`/${locale}/`)) return trimmed.slice(locale.length + 1);
  }
  return trimmed;
}

/** `/privacy` + `fr` → `/fr/privacy`; `/` + `en` → `/`. */
export function localizedHref(locale: string, pathWithoutLocale: string): string {
  const path = pathWithoutLocale === '/' ? '' : pathWithoutLocale;
  return locale === defaultLocale ? path || '/' : `/${locale}${path}`;
}

export function localeAlternates(locale: string, pathname: string): LocaleAlternates {
  const path = stripLocalePrefix(pathname);
  const languages = Object.fromEntries(locales.map((l) => [l, localizedHref(l, path)]));
  return {
    canonical: localizedHref(locale, path),
    languages: { ...languages, 'x-default': localizedHref(defaultLocale, path) },
  };
}
