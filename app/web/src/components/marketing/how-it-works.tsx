import { Section } from './section';
import { SectionHeading } from '@/components/ui/section-heading';
import { useTranslations } from 'next-intl';

export function HowItWorks() {
  const t = useTranslations('howTo');
  const steps = t.raw('steps') as Array<{ title: string; body: string }>;
  return (
    <Section id="how" tone="base-200">
      <SectionHeading eyebrow={t('eyebrow')} heading={t('heading')} intro={t('intro')} />
      <ol className="relative mt-12 grid gap-10 lg:grid-cols-3 lg:gap-8">
        {/* The rail behind the badges ties the three steps into one path (LTR and RTL). */}
        <span aria-hidden="true" className="absolute inset-s-7 inset-e-7 top-7 hidden h-px bg-base-300 lg:block" />
        {steps.map((step, i) => (
          <li key={step.title} className="reveal relative">
            <span className="relative z-10 flex h-14 w-14 items-center justify-center rounded-full bg-primary font-display text-xl font-semibold text-primary-content shadow-raised">
              {i + 1}
            </span>
            <h3 className="mt-5 text-lg font-semibold">{step.title}</h3>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-base-content/75">{step.body}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}
