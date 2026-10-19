import { describe, expect, test } from 'bun:test';
import en from '../messages/en.json';
import fr from '../messages/fr.json';
import ar from '../messages/ar.json';
import sitemap from './app/sitemap';
import { discoverabilityUrls, llmsFullTxt, llmsTxt } from './lib/discoverability';

describe('brand page and assets', () => {
  test('all locales have complete brand namespace', () => {
    for (const [_locale, messages] of [
      ['en', en],
      ['fr', fr],
      ['ar', ar],
    ] as const) {
      expect(messages.brand).toBeDefined();
      expect(messages.brand.title).toBeTruthy();
      expect(messages.brand.eyebrow).toBeTruthy();
      expect(messages.brand.lead).toBeTruthy();
      expect(messages.brand.intro.heading).toBeTruthy();
      expect(messages.brand.intro.body).toBeTruthy();
      expect(messages.brand.intro.community).toBeTruthy();
      expect(messages.brand.naming.productName).toBe('WaFine');
      expect(messages.brand.naming.arabicName).toBe('وافين');
      expect(messages.brand.naming.latinScript).toBeTruthy();
      expect(messages.brand.naming.arabicScript).toBeTruthy();
      expect(messages.brand.naming.rules).toBeTruthy();
      expect(messages.brand.logos.heading).toBeTruthy();
      expect(messages.brand.logos.fullMarkSvgLabel).toBeTruthy();
      expect(messages.brand.logos.bubbleOnlySvgLabel).toBeTruthy();
      expect(messages.brand.colors.heading).toBeTruthy();
      expect(messages.brand.typography.heading).toBeTruthy();
      expect(messages.brand.voice.heading).toBeTruthy();
      expect(messages.brand.disclaimer.heading).toBeTruthy();
      expect(messages.brand.disclaimer.body).toBeTruthy();
      expect(messages.footer.labels.brand).toBeTruthy();
    }
  });

  test('public copy does not contain editorial check tags or unverified claims', () => {
    for (const messages of [en, fr, ar]) {
      expect(messages.brand.naming.darijaNote).not.toContain('native check needed');
      expect(messages.brand.intro.body).not.toContain('sponsored by Ai4x Academy');
      expect(messages.brand.intro.body).not.toContain('AI teammate');
      expect(messages.brand.intro.body).toContain('Zawia.tech');
      expect(messages.brand.intro.community).toContain('ai4x.academy');
    }
  });

  test('brand disclaimer enforces non-affiliation and no false claims', () => {
    for (const messages of [en, fr, ar]) {
      const disclaimer = messages.brand.disclaimer.body;
      expect(disclaimer.toLowerCase()).not.toContain('works with whatsapp');
      expect(disclaimer.toLowerCase()).not.toContain('powered by whatsapp');
      expect(disclaimer.toLowerCase()).not.toContain('whatsapp business api');
    }
  });

  test('sitemap includes /brand route for all locales', () => {
    const entries = sitemap();
    const urls = entries.map((e) => e.url);
    expect(urls.some((u) => u.endsWith('/brand'))).toBe(true);
    expect(urls.some((u) => u.includes('/fr/brand'))).toBe(true);
    expect(urls.some((u) => u.includes('/ar/brand'))).toBe(true);
  });

  test('discoverability endpoints link to /brand', () => {
    const urls = discoverabilityUrls();
    const llms = llmsTxt(urls);
    expect(llms).toContain(`${urls.siteUrl}/brand`);

    const llmsFull = llmsFullTxt(urls);
    expect(llmsFull).toContain(`${urls.siteUrl}/brand`);
  });
});
