import '../global.css';
import { RootProvider } from 'fumadocs-ui/provider/next';
import { i18nProvider } from 'fumadocs-ui/i18n';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { LANGUAGES, baseOptions, footerText, translations } from '@/lib/layout.shared';
import { source } from '@/lib/source';

// Brand constants mirror app/web/src/lib/site.ts; the docs deploy is a separate Next app, so it
// keeps its own copy rather than importing across apps.
//
// No hostname is hardcoded (owner review on PR #38): the docs base URL comes from `SITE_URL`.
// It is optional at module scope because `docs.yml` builds this app with no env vars — when it
// is unset, `metadataBase` is simply omitted rather than baked to a fallback host. The site is
// public: `app/robots.ts` allows indexing and points crawlers to `app/sitemap.ts`.
const siteUrl = process.env.SITE_URL ?? (process.env.NODE_ENV === 'production' ? undefined : 'http://localhost:3001');
const description =
  'WaFine docs: link your WhatsApp number, then use the REST API, API keys, paced auto-replies and MCP with Claude.';

export const metadata: Metadata = {
  ...(siteUrl ? { metadataBase: new URL(siteUrl) } : {}),
  title: { default: 'WaFine docs', template: '%s | WaFine docs' },
  description,
  openGraph: {
    type: 'website',
    siteName: 'WaFine docs',
    url: '/',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'WaFine docs' }],
  },
  twitter: {
    card: 'summary_large_image',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'WaFine docs' }],
  },
};

export default async function Layout({
  params,
  children,
}: {
  params: Promise<{ lang: string }>;
  children: ReactNode;
}) {
  const { lang } = await params;
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const footer = footerText(lang);

  return (
    <html lang={lang} dir={dir} suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <RootProvider
          i18n={{
            ...i18nProvider(translations, lang),
            locales: LANGUAGES.map((code) => ({ name: translations.get(code).displayName ?? code, locale: code })),
          }}
          dir={dir}
        >
          <DocsLayout tree={source.getPageTree(lang)} {...baseOptions(lang)}>
            {children}
          </DocsLayout>
        </RootProvider>
        <footer className="border-t px-4 py-3 text-center text-xs text-gray-500">
          <p>{footer.brand}</p>
          <p className="mt-1">{footer.legal}</p>
        </footer>
      </body>
    </html>
  );
}
