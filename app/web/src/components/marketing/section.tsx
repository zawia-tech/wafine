import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';

export function SkipLink() {
  const t = useTranslations('common');
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:absolute focus:inset-s-4 focus:top-4 focus:z-50 focus:rounded-field focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-content"
    >
      {t('skipToContent')}
    </a>
  );
}

/** `pine` is the dark brand band (neutral role): the connector panel and the waitlist. */
export type SectionTone = 'base-100' | 'base-200' | 'pine';

export function Section({
  id,
  tone = 'base-100',
  children,
}: {
  id?: string;
  tone?: SectionTone;
  children: ReactNode;
}) {
  const surface =
    tone === 'pine' ? 'bg-neutral text-neutral-content' : tone === 'base-200' ? 'bg-base-200' : 'bg-base-100';
  const border = tone === 'pine' ? 'border-neutral' : 'border-base-300';
  return (
    <section id={id} className={`border-t ${border} ${surface}`}>
      <div className="mx-auto max-w-6xl px-4 py-14 sm:py-20">{children}</div>
    </section>
  );
}
