import { setRequestLocale, getMessages, getTranslations } from 'next-intl/server';
import { NextIntlClientProvider } from 'next-intl';
import { headers } from 'next/headers';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { routing } from '@/i18n/routing';
import { localeAlternates } from '@/lib/locale-urls';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

// OpenGraph locale tags differ from ours: en → en_US, fr → fr_FR, ar → ar_MA.
const OG_LOCALES: Record<string, string> = { en: 'en_US', fr: 'fr_FR', ar: 'ar_MA' };

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'metadata' });
  const pathname = (await headers()).get('x-pathname') ?? `/${locale}`;
  return {
    title: { default: t('title'), template: t('titleTemplate') },
    description: t('description'),
    alternates: localeAlternates(locale, pathname),
    openGraph: {
      locale: OG_LOCALES[locale] ?? OG_LOCALES.en,
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const messages = await getMessages();
  return <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>;
}
