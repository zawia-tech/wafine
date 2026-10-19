import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { Fredoka, Inter, Noto_Sans_Arabic } from 'next/font/google';
import { ThemeProvider } from '@/components/theme-provider';
import { SITE } from '@/lib/site';
import '../styles/globals.css';

// Inter has no arabic subset; Noto Sans Arabic covers Arabic glyphs via per-character
// font fallback while Latin keeps Inter. Exposed as CSS variables so globals.css can
// compose the stack (a second className would override, not chain). Fredoka is the
// rounded display face for headings and the wordmark (also no arabic subset).
const inter = Inter({ subsets: ['latin', 'latin-ext'], variable: '--font-inter' });
const notoArabic = Noto_Sans_Arabic({ subsets: ['arabic'], display: 'swap', variable: '--font-noto-arabic' });
const fredoka = Fredoka({ subsets: ['latin', 'latin-ext'], display: 'swap', variable: '--font-fredoka' });

export const dynamic = 'force-dynamic';

const description =
  'Connect a WhatsApp number, build paced auto-reply workflows, and expose it to your apps and agents through one REST API and MCP. By Zawia.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  applicationName: SITE.name,
  title: { default: 'WaFine — WhatsApp gateway for teams', template: '%s · WaFine' },
  description,
  openGraph: {
    type: 'website',
    siteName: SITE.name,
    locale: 'en',
    url: '/',
  },
  twitter: {
    card: 'summary_large_image',
    site: SITE.twitter,
  },
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icon.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/apple-icon.png',
  },
  manifest: '/manifest.webmanifest',
  alternates: {
    canonical: '/',
    languages: { en: '/', fr: '/fr', ar: '/ar', 'x-default': '/' },
  },
  robots: { index: true, follow: true },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const h = await headers();
  const locale = h.get('x-next-intl-locale') ?? SITE.defaultLocale;
  const dir = locale === 'ar' ? 'rtl' : 'ltr';
  return (
    <html lang={locale} dir={dir} suppressHydrationWarning>
      <head>
        {/* Theme colours are authored per data-theme; a reader extension must not repaint them. */}
        <meta name="darkreader-lock" />
      </head>
      <body
        className={`${inter.variable} ${notoArabic.variable} ${fredoka.variable} min-h-screen bg-base-100 text-base-content`}
      >
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
