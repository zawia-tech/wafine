import { createI18nMiddleware } from 'fumadocs-core/i18n/middleware';
import { i18n } from '@/lib/i18n';

// Pairs with the `redirects()` in `next.config.mjs`: those rewrite the former `/docs/*` URLs to
// `/` this app now serves every page at, with no default-locale prefix (`hideLocale`).
export default createI18nMiddleware(i18n);

export const config = {
  // Skip API handlers, framework assets and anything with a file extension (static files in
  // `public/`, `/sitemap.xml`, `/robots.txt`) so the locale rewrite cannot hide them.
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
