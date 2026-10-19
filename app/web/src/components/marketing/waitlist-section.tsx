import { Section } from './section';
import { SectionHeading } from '@/components/ui/section-heading';
import { WaitlistForm } from './waitlist-form';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/card';

export function WaitlistSection() {
  const t = useTranslations('waitlist');
  return (
    <Section id="waitlist" tone="pine">
      <SectionHeading eyebrow={t('eyebrow')} heading={t('heading')} intro={t('intro')} tone="pine" />
      <div className="reveal mx-auto mt-10 max-w-lg">
        <Card className="text-base-content">
          <div className="card-body">
            <WaitlistForm />
          </div>
        </Card>
      </div>
    </Section>
  );
}
