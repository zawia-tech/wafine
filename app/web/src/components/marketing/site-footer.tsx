import { Brand } from '@/components/brand';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { siteLinks } from '@/lib/site-links';

export function SiteFooter() {
  const t = useTranslations('footer');
  const { contactEmail, docsUrl } = siteLinks();
  const columns = t.raw('columns') as { product: string; resources: string; legal: string };
  const labels = t.raw('labels') as Record<string, string>;
  const groups: Array<{ heading: string; links: string[] }> = [
    { heading: columns.product, links: ['how', 'connector', 'waitlist'] },
    { heading: columns.resources, links: ['docs', 'blog', 'brand', 'authors', 'contact'] },
    { heading: columns.legal, links: ['privacy', 'terms'] },
  ];
  const hrefs: Record<string, string> = {
    how: '#how',
    connector: '#connector',
    waitlist: '#waitlist',
    docs: docsUrl,
    blog: '/blog',
    brand: '/brand',
    authors: '/authors',
    contact: `mailto:${contactEmail}`,
    privacy: '/privacy',
    terms: '/terms',
  };
  return (
    <footer className="bg-neutral text-neutral-content">
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-1">
            <Brand inverted />
            <p className="mt-2 text-sm text-neutral-content/70">by Zawia</p>
          </div>
          {groups.map((column) => (
            <nav key={column.heading} aria-label={column.heading}>
              <p className="text-sm font-semibold">{column.heading}</p>
              <ul className="mt-3 space-y-1">
                {column.links.map((link) => (
                  <li key={link}>
                    {hrefs[link]!.startsWith('/') ? (
                      // Internal pages keep the visitor's locale (/fr/brand, /ar/authors).
                      <Link
                        href={hrefs[link]!}
                        className="inline-flex min-h-7 items-center py-1.5 text-sm text-neutral-content/70 hover:text-neutral-content hover:underline"
                      >
                        {labels[link]}
                      </Link>
                    ) : (
                      <a
                        href={hrefs[link]}
                        className="inline-flex min-h-7 items-center py-1.5 text-sm text-neutral-content/70 hover:text-neutral-content hover:underline"
                      >
                        {labels[link]}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <p className="mt-10 border-t border-neutral-content/20 pt-6 text-sm text-neutral-content/70">{t('credit')}</p>
        <p className="mt-2 text-sm text-neutral-content/70">{t('copyright')}</p>
        <p className="mt-2 text-xs text-neutral-content/70">{t('disclaimer')}</p>
      </div>
    </footer>
  );
}
