import type { Metadata } from 'next';
import { SiteFooter } from '@/components/marketing/site-footer';
import { SiteHeader } from '@/components/marketing/site-header';
import { SkipLink } from '@/components/marketing/section';

export const metadata: Metadata = {
  title: 'Blog',
};

/**
 * Marketing chrome for the whole `/blog` section: the same skip link, header and
 * footer the landing uses, so the blog does not look like a different site.
 *
 * Self-contained on purpose (brief wafine-blog-w2): when the i18n worker moves the
 * marketing routes under `app/[locale]/`, this layout moves with them as one unit.
 */
export default function BlogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <SkipLink />
      <SiteHeader />
      <main id="main-content" className="mx-auto max-w-3xl px-4 py-14 sm:py-20">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
