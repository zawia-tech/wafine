import { SiteFooter } from './site-footer';
import { SiteHeader } from './site-header';
import { SkipLink } from './section';
import { Hero } from './hero';
import { HowItWorks } from './how-it-works';
import { ConnectorCallout } from './connector-callout';
import { FeatureGrid } from './feature-grid';
import { WaitlistSection } from './waitlist-section';
import { Faq } from './faq';

export function Landing() {
  return (
    <>
      <SkipLink />
      <SiteHeader />
      <main id="main-content">
        <Hero />
        <HowItWorks />
        <ConnectorCallout />
        <FeatureGrid />
        <WaitlistSection />
        <Faq />
      </main>
      <SiteFooter />
    </>
  );
}
