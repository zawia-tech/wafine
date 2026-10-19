import { describe, expect, test } from 'bun:test';
import { localeAlternates, localizedHref, stripLocalePrefix } from './locale-urls';

describe('stripLocalePrefix', () => {
  test('leaves default-locale paths untouched', () => {
    expect(stripLocalePrefix('/')).toBe('/');
    expect(stripLocalePrefix('/privacy')).toBe('/privacy');
  });

  test('strips a non-default locale prefix', () => {
    expect(stripLocalePrefix('/fr')).toBe('/');
    expect(stripLocalePrefix('/ar/privacy')).toBe('/privacy');
    expect(stripLocalePrefix('/fr/blog/introducing-wafine/')).toBe('/blog/introducing-wafine');
  });
});

describe('localizedHref', () => {
  test('omits the prefix for the default locale', () => {
    expect(localizedHref('en', '/')).toBe('/');
    expect(localizedHref('en', '/privacy')).toBe('/privacy');
  });

  test('prefixes non-default locales', () => {
    expect(localizedHref('fr', '/')).toBe('/fr');
    expect(localizedHref('ar', '/privacy')).toBe('/ar/privacy');
  });
});

describe('localeAlternates', () => {
  test('canonical follows the page and locale, not the site root', () => {
    expect(localeAlternates('fr', '/fr/privacy').canonical).toBe('/fr/privacy');
    expect(localeAlternates('ar', '/ar').canonical).toBe('/ar');
    expect(localeAlternates('en', '/privacy').canonical).toBe('/privacy');
  });

  test('languages cover every locale plus x-default', () => {
    const alternates = localeAlternates('fr', '/fr/privacy');
    expect(alternates.languages).toEqual({
      en: '/privacy',
      fr: '/fr/privacy',
      ar: '/ar/privacy',
      'x-default': '/privacy',
    });
  });
});
