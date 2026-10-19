import { Section } from './section';
import { SectionHeading } from '@/components/ui/section-heading';
import { useTranslations } from 'next-intl';

export function Faq() {
  const t = useTranslations('faq');
  const items = t.raw('items') as Array<{ q: string; a: string }>;
  return (
    <Section id="faq">
      <div className="grid gap-10 lg:grid-cols-[1fr_1.6fr] lg:gap-16">
        <div className="reveal">
          <SectionHeading eyebrow={t('eyebrow')} heading={t('heading')} align="left" />
        </div>
        <div className="reveal">
          <div className="divide-y divide-base-300 overflow-hidden rounded-box border border-base-300 bg-base-100">
            {items.map((item, index) => (
              <details key={item.q} open={index === 0} className="group px-4">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 py-3 text-start font-medium">
                  <span className="min-w-0">{item.q}</span>
                  <Chevron />
                </summary>
                <p className="pb-4 text-sm text-base-content/75">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
}

function Chevron() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="shrink-0 text-base-content/75 transition-transform group-open:rotate-180">
      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
