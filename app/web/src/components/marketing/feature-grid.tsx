import type { ReactElement } from 'react';
import { Section } from './section';
import { SectionHeading } from '@/components/ui/section-heading';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { siteLinks } from '@/lib/site-links';

/**
 * One icon per feature, in items[] order — pacing, keys, API, QR, residency,
 * open-core. Decorative only: the card title carries the meaning, and the icon is
 * aria-hidden, so adding a locale never needs a new icon.
 */
const ICONS: ReactElement[] = [
  // pacing: a gauge needle mid-sweep
  <svg key="pace" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
    <path d="M4 15a8 8 0 1 1 16 0" />
    <path d="M12 15 16 9" />
    <circle cx="12" cy="15" r="1.4" fill="currentColor" stroke="none" />
  </svg>,
  // per-session keys
  <svg key="key" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="8" cy="14" r="4" />
    <path d="M11 11 20 2m-4 4 2 2m-5 1 2 2" />
  </svg>,
  // REST + MCP: code brackets
  <svg key="api" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m8 7-5 5 5 5M16 7l5 5-5 5M13 4l-2 16" />
  </svg>,
  // QR linking
  <svg key="qr" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <path d="M14 14h3v3h-3zM20 14v3m-6 3h3m1-4h3v3h-3" />
  </svg>,
  // data residency: a pin on a small globe arc
  <svg key="residency" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z" />
  </svg>,
  // open-core: an open box
  <svg key="open" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 8.5 12 4l9 4.5L12 13 3 8.5Z" />
    <path d="M3 8.5v7L12 20l9-4.5v-7M12 13v7" />
  </svg>,
];

/**
 * Bento layout (6 cells, desktop): the pacing cell is the wide anchor with its
 * gap strip; two narrow cells follow; three mid cells share the middle row; the
 * open-core cell runs the full width as the inverted pine close. Every span is
 * a plain Tailwind col-span, direction-neutral under RTL.
 */
const CELL_SPANS = [
  'sm:col-span-2 lg:col-span-4',
  'sm:col-span-2 lg:col-span-2',
  'lg:col-span-2',
  'lg:col-span-2',
  'lg:col-span-2',
  'sm:col-span-2 lg:col-span-6',
] as const;

export function FeatureGrid() {
  const t = useTranslations('features');
  const items = t.raw('items') as Array<{ title: string; body: string }>;
  const { docsUrl } = siteLinks();
  return (
    <Section id="features" tone="base-200">
      <SectionHeading eyebrow={t('eyebrow')} heading={t('heading')} />
      <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        {items.map((item, index) => (
          <li key={item.title} className={`reveal ${CELL_SPANS[index]}`}>
            <BentoCell index={index} title={item.title} body={item.body} docsUrl={docsUrl} cta={t('cta')} />
          </li>
        ))}
      </ul>
    </Section>
  );
}

function BentoCell({ index, title, body, docsUrl, cta }: { index: number; title: string; body: string; docsUrl: string; cta: string }) {
  if (index === 0) {
    // Paced sending — the wide anchor cell carries the gap strip.
    return (
      <Card variant="bordered" className="h-full transition-shadow hover:shadow-raised">
        <div className="card-body h-full justify-between gap-3">
          <div className="flex flex-col items-start gap-2.5">
            <CellHead index={index} title={title} />
            <p className="text-sm leading-relaxed text-base-content/75">{body}</p>
          </div>
          <PacingStrip />
        </div>
      </Card>
    );
  }
  if (index === 5) {
    // Open-core — full-width inverted band, closed by one daisyUI button.
    return (
      <Card className="card bg-neutral text-neutral-content">
        <div className="card-body gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-2.5 md:max-w-2xl">
            <CellHead index={index} title={title} inverted />
            <p className="text-sm leading-relaxed text-neutral-content/80">{body}</p>
          </div>
          <Button href={docsUrl} variant="secondary" className="shrink-0">
            {cta}
          </Button>
        </div>
      </Card>
    );
  }
  const accent = index === 1; // per-session keys get the masked-prefix chip
  return (
    <Card variant="bordered" className="h-full transition-shadow hover:shadow-raised">
      <div className="card-body h-full gap-2.5">
        <CellHead index={index} title={title} />
        <p className="text-sm leading-relaxed text-base-content/75">{body}</p>
        {accent && (
          <p aria-hidden="true" className="mt-1">
            <code className="rounded-field bg-base-200 px-2.5 py-1.5 text-xs font-mono text-base-content/80">
              X-API-Key: wf_live_····
            </code>
          </p>
        )}
      </div>
    </Card>
  );
}

function CellHead({ index, title, inverted = false }: { index: number; title: string; inverted?: boolean }) {
  return (
    <>
      <span
        className={`flex h-11 w-11 items-center justify-center rounded-2xl ${
          inverted ? 'bg-primary-content/15 text-primary-content' : 'bg-primary/10 text-primary'
        }`}
      >
        {ICONS[index]}
      </span>
      <h3 className={`text-base font-semibold ${inverted ? 'text-neutral-content' : ''}`}>{title}</h3>
    </>
  );
}

/**
 * The pacing mechanism as a strip: messages (dots) with the enforced gap between
 * them. aria-hidden — the cell title explains it; the shapes just anchor it.
 */
function PacingStrip() {
  return (
    <div aria-hidden="true" className="flex items-center gap-1.5">
      <span className="size-2 rounded-full bg-primary/80" />
      <span className="size-2 rounded-full bg-primary/80" />
      <span className="h-1.5 min-w-10 flex-1 max-w-24 rounded-full bg-secondary/50" />
      <span className="size-2 rounded-full bg-primary/80" />
      <span className="size-2 rounded-full bg-primary/90" />
      <span className="size-2 rounded-full bg-primary/70" />
    </div>
  );
}
