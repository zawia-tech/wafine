import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AuthorsPage } from '@/components/marketing/authors-page';
import { authorJsonLd } from '@/lib/authors';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'authors' });
  return {
    title: t('title'),
    description: t('lead'),
  };
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'authors' });
  const jsonLd = authorJsonLd({ role: t('author.role') });
  return (
    <>
      <script
        type="application/ld+json"
        // JSON-LD from static, trusted values; `<` is escaped so the payload cannot close the tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      <AuthorsPage />
    </>
  );
}
