import { SiteFooter } from './site-footer';
import { SiteHeader } from './site-header';
import { SkipLink } from './section';
import { useTranslations } from 'next-intl';
import { siteLinks } from '@/lib/site-links';

/** Translation keys of the legal docs, in the order the sections are rendered. */
const DOC_SECTIONS = {
  privacy: ['collect', 'where', 'never', 'choices'],
  terms: ['account', 'use', 'warranty', 'changes'],
} as const;

export type LegalDocKey = keyof typeof DOC_SECTIONS;

export function LegalPage({ docKey }: { docKey: LegalDocKey }) {
  const t = useTranslations('legal');
  const sectionKeys = DOC_SECTIONS[docKey];
  const tokens = { contactEmail: siteLinks().contactEmail };
  return (
    <>
      <SkipLink />
      <SiteHeader />
      <main id="main-content" className="mx-auto max-w-3xl px-4 py-14 sm:py-20">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t(`${docKey}.title`)}</h1>
        <p className="mt-3 text-sm text-base-content/75">
          {t('updatedLabel')}: {t('updated')}
        </p>
        <p className="mt-6 text-base text-base-content/75">{t(`${docKey}.lead`, tokens)}</p>
        <div className="mt-10 space-y-8">
          {sectionKeys.map((section) => (
            <section key={section}>
              <h2 className="text-lg font-semibold">{t(`${docKey}.sections.${section}.heading`)}</h2>
              <p className="mt-2 text-base text-base-content/75">
                {t(`${docKey}.sections.${section}.body`, tokens)}
              </p>
            </section>
          ))}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
