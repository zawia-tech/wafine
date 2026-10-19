'use client';

import { BrandMark } from '@/components/brand';
import { CopyField } from '@/components/copy-field';
import { SiteFooter } from './site-footer';
import { SiteHeader } from './site-header';
import { SkipLink } from './section';
import { useTranslations } from 'next-intl';
import { BRAND_BUBBLE_PATH, BRAND_WORD_PATH, BRAND_WORD_TRANSFORM } from '@/lib/brand-paths';

const FULL_MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <path d="${BRAND_BUBBLE_PATH}" fill="#1c5c42"/>
  <path d="${BRAND_WORD_PATH}" fill="#fcfaf6" transform="${BRAND_WORD_TRANSFORM}"/>
</svg>`;

const BUBBLE_ONLY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <path d="${BRAND_BUBBLE_PATH}" fill="#1c5c42"/>
</svg>`;

interface ColorSwatch {
  nameKey: string;
  descKey: string;
  hex: string;
  bgClass: string;
  textClass: string;
  border?: boolean;
}

const COLOR_SWATCHES: readonly ColorSwatch[] = [
  { nameKey: 'pine', descKey: 'pineDesc', hex: '#1c5c42', bgClass: 'bg-[#1c5c42]', textClass: 'text-white' },
  { nameKey: 'paper', descKey: 'paperDesc', hex: '#fcfaf6', bgClass: 'bg-[#fcfaf6]', textClass: 'text-neutral', border: true },
  { nameKey: 'clay', descKey: 'clayDesc', hex: '#a5562f', bgClass: 'bg-[#a5562f]', textClass: 'text-white' },
  { nameKey: 'sand', descKey: 'sandDesc', hex: '#f4efe6', bgClass: 'bg-[#f4efe6]', textClass: 'text-neutral', border: true },
  { nameKey: 'ink', descKey: 'inkDesc', hex: '#2c3a33', bgClass: 'bg-[#2c3a33]', textClass: 'text-white' },
];

/** `contactEmail` comes from the server page: `siteLinks()` reads env dynamically, which is not inlined in client bundles. */
export function BrandPage({ contactEmail }: { contactEmail: string }) {
  const t = useTranslations('brand');
  const tokens = { contactEmail };

  return (
    <>
      <SkipLink />
      <SiteHeader />
      <main id="main-content" className="mx-auto max-w-4xl px-4 py-14 sm:py-20">
        <header className="mb-14">
          <p className="text-sm font-semibold uppercase tracking-wider text-secondary">{t('eyebrow')}</p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-5xl">{t('title')}</h1>
          <p className="mt-4 text-lg text-base-content/75">{t('lead')}</p>
        </header>

        {/* About WaFine & Origins */}
        <section className="mb-14 rounded-box border border-base-300 bg-base-100 p-6 sm:p-8">
          <h2 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">{t('intro.heading')}</h2>
          <p className="mt-3 text-base leading-relaxed text-base-content/75">{t('intro.body')}</p>
          <p className="mt-3 text-base leading-relaxed text-base-content/75">
            {t('intro.community')}{' '}
            <a
              href="https://zawia.tech"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary underline hover:text-primary-focus"
            >
              Zawia.tech
            </a>{' '}
            ·{' '}
            <a
              href="https://ai4x.academy"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary underline hover:text-primary-focus"
            >
              ai4x.academy
            </a>
          </p>
        </section>

        {/* Naming & Spelling */}
        <section className="mb-14">
          <h2 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">{t('naming.heading')}</h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            <div className="rounded-box border border-base-300 bg-base-100 p-6">
              <span className="text-xs font-semibold uppercase tracking-wider text-secondary">{t('naming.latinScript')}</span>
              <p className="mt-2 font-display text-3xl font-semibold tracking-tight text-primary">
                {t('naming.productName')}
              </p>
              <p className="mt-2 text-sm text-base-content/75">{t('naming.rules')}</p>
            </div>
            <div className="rounded-box border border-base-300 bg-base-100 p-6">
              <span className="text-xs font-semibold uppercase tracking-wider text-secondary">{t('naming.arabicScript')}</span>
              <p className="mt-2 font-display text-3xl font-semibold tracking-tight text-primary">
                {t('naming.arabicName')}
              </p>
              <p className="mt-2 text-sm text-base-content/75">{t('naming.darijaNote')}</p>
            </div>
          </div>
          <div className="mt-4 rounded-box border border-warning/30 bg-warning/5 p-4 text-sm text-base-content/85">
            {t('naming.unofficial')}
          </div>
        </section>

        {/* Logos & Assets */}
        <section className="mb-14">
          <h2 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">{t('logos.heading')}</h2>
          <p className="mt-2 text-base text-base-content/75">{t('logos.subhead')}</p>

          <div className="mt-6 grid gap-6 sm:grid-cols-3">
            {/* Standard Mark */}
            <div className="flex flex-col justify-between rounded-box border border-base-300 bg-base-100 p-6">
              <div className="flex h-32 items-center justify-center">
                <BrandMark size={84} />
              </div>
              <p className="mt-4 text-center text-sm font-medium">{t('logos.markLabel')}</p>
            </div>

            {/* Inverted Mark */}
            <div className="flex flex-col justify-between rounded-box border border-neutral bg-neutral p-6 text-neutral-content">
              <div className="flex h-32 items-center justify-center">
                <BrandMark size={84} inverted />
              </div>
              <p className="mt-4 text-center text-sm font-medium">{t('logos.invertedLabel')}</p>
            </div>

            {/* Letter-free small icon */}
            <div className="flex flex-col justify-between rounded-box border border-base-300 bg-base-100 p-6">
              <div className="flex h-32 items-center justify-center">
                <svg width="64" height="64" viewBox="0 0 512 512" fill="none" aria-hidden="true">
                  <path d={BRAND_BUBBLE_PATH} className="fill-primary" />
                </svg>
              </div>
              <p className="mt-4 text-center text-sm font-medium">{t('logos.smallIconLabel')}</p>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            <CopyField label={t('logos.fullMarkSvgLabel')} value={FULL_MARK_SVG} multiline />
            <CopyField label={t('logos.bubbleOnlySvgLabel')} value={BUBBLE_ONLY_SVG} multiline />
          </div>

          <p className="mt-4 text-sm text-base-content/70">{t('logos.rules')}</p>
        </section>

        {/* Colour Palette */}
        <section className="mb-14">
          <h2 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">{t('colors.heading')}</h2>
          <p className="mt-2 text-base text-base-content/75">{t('colors.subhead')}</p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {COLOR_SWATCHES.map((swatch) => (
              <div
                key={swatch.nameKey}
                className="overflow-hidden rounded-box border border-base-300 bg-base-100 shadow-sm"
              >
                <div
                  className={`h-24 ${swatch.bgClass} ${swatch.border ? 'border-b border-base-300' : ''} flex items-end p-4`}
                >
                  <span className={`font-mono text-sm font-bold ${swatch.textClass}`}>{swatch.hex}</span>
                </div>
                <div className="p-4">
                  <h3 className="font-semibold">{t(`colors.${swatch.nameKey}`)}</h3>
                  <p className="mt-1 text-xs text-base-content/75">{t(`colors.${swatch.descKey}`)}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Typography */}
        <section className="mb-14">
          <h2 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">{t('typography.heading')}</h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-3">
            <div className="rounded-box border border-base-300 bg-base-100 p-6">
              <span className="font-display text-2xl font-semibold text-primary">{t('typography.fredoka')}</span>
              <p className="mt-3 text-sm text-base-content/75">{t('typography.fredokaDesc')}</p>
            </div>
            <div className="rounded-box border border-base-300 bg-base-100 p-6">
              <span className="font-sans text-2xl font-semibold">{t('typography.inter')}</span>
              <p className="mt-3 text-sm text-base-content/75">{t('typography.interDesc')}</p>
            </div>
            <div className="rounded-box border border-base-300 bg-base-100 p-6">
              <span className="text-2xl font-semibold">{t('typography.noto')}</span>
              <p className="mt-3 text-sm text-base-content/75">{t('typography.notoDesc')}</p>
            </div>
          </div>
        </section>

        {/* Voice & Principles */}
        <section className="mb-14 rounded-box border border-base-300 bg-base-100 p-6 sm:p-8">
          <h2 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">{t('voice.heading')}</h2>
          <p className="mt-3 text-base leading-relaxed text-base-content/75">{t('voice.principles')}</p>
        </section>

        {/* Trademark & Disclaimer */}
        <section className="rounded-box border border-base-300 bg-base-200/50 p-6 sm:p-8">
          <h2 className="font-display text-lg font-semibold tracking-tight">{t('disclaimer.heading')}</h2>
          <p className="mt-2 text-sm leading-relaxed text-base-content/70">{t('disclaimer.body')}</p>
          <p className="mt-4 text-sm text-base-content/70">{t('disclaimer.contact', tokens)}</p>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
