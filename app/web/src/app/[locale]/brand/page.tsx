import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { BrandPage } from '@/components/marketing/brand-page';
import { siteLinks } from '@/lib/site-links';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'brand' });
  return {
    title: t('title'),
    description: t('lead'),
  };
}

export default function Page() {
  return <BrandPage contactEmail={siteLinks().contactEmail} />;
}
