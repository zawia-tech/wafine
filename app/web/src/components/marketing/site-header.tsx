import { Brand } from '@/components/brand';
import { ThemeToggle } from '@/components/theme-toggle';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { siteLinks } from '@/lib/site-links';
import { Button } from '@/components/ui/button';

export function SiteHeader() {
  const t = useTranslations('nav');
  const { docsUrl } = siteLinks();
  const navItems: Array<{ id: string; href: string; label: string }> = [
    { id: 'how', href: '#how', label: t('how') },
    { id: 'connector', href: '#connector', label: t('connector') },
    { id: 'waitlist', href: '#waitlist', label: t('waitlist') },
    { id: 'blog', href: '/blog', label: t('blog') },
    { id: 'docs', href: docsUrl, label: t('docs') },
    { id: 'signin', href: '/auth/login', label: t('signin') },
  ];
  return (
    <header className="sticky top-0 z-30 border-b border-base-300 bg-base-100/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2">
        <Brand href="/" />
        <nav aria-label={t('main')} className="ms-auto hidden items-center gap-1 md:flex">
          {navItems.map((item) => (
            <Button key={item.id} href={item.href} variant="ghost" className="font-normal">
              {item.label}
            </Button>
          ))}
        </nav>
        <div className="ms-auto flex items-center gap-1 md:ms-2">
          <Link href="/auth/login" className="btn btn-ghost min-h-11 md:hidden">
            {t('signin')}
          </Link>
          <LocaleSwitcher />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
