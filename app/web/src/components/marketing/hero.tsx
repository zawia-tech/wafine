import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { siteLinks } from '@/lib/site-links';
import { HeroStage } from './hero-stage';

export function Hero() {
  const t = useTranslations('hero');
  const { docsUrl } = siteLinks();
  return (
    <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-14 sm:py-20 lg:grid-cols-12 lg:gap-16">
      <div className="reveal lg:col-span-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-secondary">{t('eyebrow')}</p>
        <h1 className="mt-4 max-w-2xl text-3xl font-bold tracking-tight text-balance sm:text-4xl lg:text-5xl">
          {t('h1')}
        </h1>
        <p className="mt-5 max-w-xl text-base text-base-content/75 sm:text-lg">{t('subhead')}</p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button href="#waitlist">{t('primaryCta')}</Button>
          <Button href={docsUrl} variant="outline">
            {t('secondaryCta')}
          </Button>
        </div>
      </div>
      <HeroStage className="lg:col-span-6" thread={t.raw('thread')} caption={t('caption')} />
    </div>
  );
}
