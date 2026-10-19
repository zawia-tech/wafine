import { describe, expect, test } from 'bun:test';
import en from '../messages/en.json';
import fr from '../messages/fr.json';
import ar from '../messages/ar.json';
import sitemap from './app/sitemap';
import { discoverabilityUrls, llmsFullTxt, llmsTxt } from './lib/discoverability';
import { AUTHOR, authorJsonLd } from './lib/authors';

const LOCALES = [
  ['en', en],
  ['fr', fr],
  ['ar', ar],
] as const;

describe('authors page', () => {
  test('all locales have a complete authors namespace', () => {
    for (const [, messages] of LOCALES) {
      const a = messages.authors;
      expect(a).toBeDefined();
      expect(a.eyebrow).toBeTruthy();
      expect(a.title).toBeTruthy();
      expect(a.lead).toBeTruthy();
      expect(a.author.name).toBe('Mohamed Moughamir');
      expect(a.author.role).toContain('WaFine');
      expect(a.author.bio1).toContain('WaFine');
      expect(a.author.bio1).toContain('OpenWA');
      expect(a.author.bio2).toContain('Zawia.tech');
      expect(a.author.github).toBeTruthy();
      expect(a.author.zawia).toBe('Zawia.tech');
      expect(a.community.heading).toBeTruthy();
      expect(a.community.zawia).toContain('Zawia.tech');
      expect(a.community.academy).toContain('ai4x.academy');
      expect(messages.footer.labels.authors).toBeTruthy();
    }
  });

  test('copy follows naming and claim rules', () => {
    for (const [, messages] of LOCALES) {
      const text = JSON.stringify(messages.authors);
      expect(text).not.toContain('WAFINE');
      const lower = text.toLowerCase();
      for (const banned of ['whatsapp business api', 'works with whatsapp', 'powered by claude', 'sponsored by']) {
        expect(lower).not.toContain(banned);
      }
      // No contact details on the public card.
      expect(text).not.toMatch(/@[a-z0-9-]+\.[a-z]/i);
      expect(text).not.toMatch(/\+\d{6,}/);
    }
  });

  test('JSON-LD describes the author as a schema.org Person', () => {
    const ld = authorJsonLd({ role: en.authors.author.role });
    expect(ld['@context']).toBe('https://schema.org');
    expect(ld['@type']).toBe('Person');
    expect(ld.name).toBe(AUTHOR.name);
    expect(ld.jobTitle).toBe('Founder and maintainer, WaFine');
    expect(ld.sameAs).toContain('https://github.com/moughamir');
    expect(JSON.stringify(ld)).not.toMatch(/email|telephone/i);
  });

  test('sitemap includes /authors for all locales', () => {
    const urls = sitemap().map((e) => e.url);
    expect(urls.some((u) => u.endsWith('/authors') && !u.includes('/fr/') && !u.includes('/ar/'))).toBe(true);
    expect(urls.some((u) => u.endsWith('/fr/authors'))).toBe(true);
    expect(urls.some((u) => u.endsWith('/ar/authors'))).toBe(true);
  });

  test('llms.txt and llms-full link to /authors', () => {
    const urls = discoverabilityUrls();
    expect(llmsTxt(urls)).toContain(`${urls.siteUrl}/authors`);
    expect(llmsFullTxt(urls)).toContain(`${urls.siteUrl}/authors`);
  });
});
