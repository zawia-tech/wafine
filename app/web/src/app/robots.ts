import type { MetadataRoute } from 'next';
import { SITE } from '@/lib/site';

/**
 * `/robots.txt` as a Next metadata route (the i18n worker ships `sitemap.ts` and
 * was told not to add `robots.ts`, so this branch owns it). Built from SITE:
 * the sitemap line is `${SITE.url}/sitemap.xml`, never a hardcoded host.
 *
 * `force-dynamic` so SITE is read from the deployment env at request time,
 * matching every other env-driven route in this app.
 */
export const dynamic = 'force-dynamic';

/** Public, indexable surfaces. */
const ALLOW = [
  '/',
  '/blog',
  '/privacy',
  '/terms',
  '/llms.txt',
  '/llms.md',
  '/llms-full.txt',
  '/humans.txt',
];

/** Private or non-indexable surfaces: account, API, auth and the app itself. */
const DISALLOW = [
  '/admin',
  '/auth',
  '/api',
  '/oauth',
  '/app',
  '/messages',
  '/whatsapp',
  '/workflows',
  '/settings',
  '/contacts',
  '/agent-builder',
  '/mcp-marketplace',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: ALLOW, disallow: DISALLOW }],
    sitemap: `${SITE.url}/sitemap.xml`,
  };
}
