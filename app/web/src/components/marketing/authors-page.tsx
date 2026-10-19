'use client';

import { useTranslations } from 'next-intl';
import { SiteFooter } from './site-footer';
import { SiteHeader } from './site-header';
import { SkipLink } from './section';
import { AUTHOR } from '@/lib/authors';

const AUTHOR_LINKS = {
  github: AUTHOR.github,
  zawia: AUTHOR.zawia,
  academy: 'https://ai4x.academy',
} as const;

const linkClass = 'font-medium text-primary underline hover:text-primary-focus';

export function AuthorsPage() {
  const t = useTranslations('authors');

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

        <section aria-labelledby="author-name" className="mb-14">
          <article className="flex flex-col gap-6 rounded-box border border-base-300 bg-base-100 p-6 sm:flex-row sm:p-8">
            <div
              aria-hidden="true"
              className="flex size-20 shrink-0 items-center justify-center rounded-full bg-[#1c5c42] font-display text-2xl font-semibold text-[#fcfaf6]"
            >
              MM
            </div>
            <div>
              <h2 id="author-name" className="font-display text-xl font-semibold tracking-tight sm:text-2xl">
                {t('author.name')}
              </h2>
              <p className="mt-1 text-sm font-medium text-secondary">{t('author.role')}</p>
              <p className="mt-3 text-base leading-relaxed text-base-content/75">
                {t('author.bio1')}
                <br />
                {t('author.bio2')}
              </p>
              <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                <li>
                  <a href={AUTHOR_LINKS.github} target="_blank" rel="noopener noreferrer me" className={linkClass}>
                    {t('author.github')}
                  </a>
                </li>
                <li>
                  <a href={AUTHOR_LINKS.zawia} target="_blank" rel="noopener noreferrer" className={linkClass}>
                    {t('author.zawia')}
                  </a>
                </li>
              </ul>
            </div>
          </article>
        </section>

        <section className="rounded-box border border-base-300 bg-base-100 p-6 sm:p-8">
          <h2 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">{t('community.heading')}</h2>
          <ul className="mt-4 space-y-2 text-base">
            <li>
              <a href={AUTHOR_LINKS.zawia} target="_blank" rel="noopener noreferrer" className={linkClass}>
                {t('community.zawia')}
              </a>
            </li>
            <li>
              <a href={AUTHOR_LINKS.academy} target="_blank" rel="noopener noreferrer" className={linkClass}>
                {t('community.academy')}
              </a>
            </li>
          </ul>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
