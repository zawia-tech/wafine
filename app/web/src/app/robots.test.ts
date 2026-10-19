import { describe, expect, test } from 'bun:test';
import robots from './robots';
import { SITE } from '@/lib/site';

describe('robots metadata route', () => {
  test('allows the public surfaces and disallows the private ones', () => {
    const output = robots();
    const rule = Array.isArray(output.rules) ? output.rules[0] : output.rules;
    expect(rule?.userAgent).toBe('*');
    expect(rule?.allow).toEqual(expect.arrayContaining(['/', '/blog', '/llms.txt']));
    expect(rule?.disallow).toEqual(
      expect.arrayContaining(['/admin', '/auth', '/api', '/oauth', '/app']),
    );
  });

  test('sitemap is built from SITE, never a hardcoded host', () => {
    const output = robots();
    const sitemap = Array.isArray(output.sitemap) ? output.sitemap[0] : output.sitemap;
    expect(sitemap).toBe(`${SITE.url}/sitemap.xml`);
    expect(sitemap?.endsWith('/sitemap.xml')).toBe(true);
  });
});
