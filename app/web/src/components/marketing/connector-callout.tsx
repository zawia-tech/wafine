import { CopyField } from '@/components/copy-field';
import { Section } from './section';
import { SectionHeading } from '@/components/ui/section-heading';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { siteLinks } from '@/lib/site-links';

export function ConnectorCallout() {
  const t = useTranslations('connector');
  const { connectorUrl, docsUrl } = siteLinks();
  const steps = t.raw('steps') as { connect: string; paste: string; signIn: string };
  const stepList = [steps.connect, steps.paste, steps.signIn];
  return (
    <Section id="connector" tone="pine">
      <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
        <div className="reveal">
            <SectionHeading eyebrow={t('eyebrow')} heading={t('heading')} align="left" tone="pine" />
            <p className="mt-5 text-base text-neutral-content/80">{t('body')}</p>
            <ol className="mt-6 space-y-3">
              {stepList.map((step, index) => (
                <li key={step} className="flex gap-3 text-sm text-neutral-content/80">
                  <Badge size="sm" className="shrink-0">
                    {index + 1}
                  </Badge>
                  <span className="min-w-0">{step.replace('{connectorUrl}', connectorUrl)}</span>
                </li>
              ))}
            </ol>
            <a
              href={docsUrl}
              className="link link-hover mt-6 inline-block text-sm font-medium text-neutral-content underline underline-offset-4"
            >
              {t('docsLabel')}
            </a>
          </div>
        {/* The cream card keeps the copy fields on paper while the band stays dark. */}
          <Card className="reveal text-base-content">
            <div className="card-body gap-3">
              <CopyField label={t('urlFieldLabel')} value={connectorUrl} />
              <p className="mt-1 text-sm font-medium">{t('snippetHeading')}</p>
              <CopyField label={t('snippetFieldLabel')} value={`claude mcp add --transport http whatsapp ${connectorUrl}`} />
              <p className="text-xs text-base-content/75">{t('consentNote')}</p>
            </div>
          </Card>
      </div>
    </Section>
  );
}
