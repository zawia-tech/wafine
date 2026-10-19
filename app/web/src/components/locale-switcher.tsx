'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { routing, type Locale } from '@/i18n/routing';

/**
 * Locale switcher (rebrand-plan §3.5, tasks 13).
 *
 * Uses next-intl's `Link`/`usePathname` — not `next/link`'s `locale` prop, which only
 * works with Next's own i18n routing and silently ignored the locale here (every option
 * pointed at `/`). The current path is kept, so switching on `/fr/privacy` lands on
 * `/ar/privacy`, not on the home page.
 */
export function LocaleSwitcher() {
  const t = useTranslations('common');
  const locale = useLocale();
  const pathname = usePathname();

  return (
    <div className="dropdown dropdown-end">
      <div tabIndex={0} role="button" aria-label={t('language')} className="btn btn-ghost btn-sm min-h-11">
        {locale.toUpperCase()}
      </div>
      <ul tabIndex={0} className="dropdown-content menu rounded-box z-50 w-32 bg-base-100 p-2 shadow-floating">
        {routing.locales.map((l: Locale) => (
          <li key={l}>
            <Link href={pathname} locale={l} className={l === locale ? 'menu-active' : ''}>
              {l === 'en' ? 'English' : l === 'fr' ? 'Français' : 'العربية'}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
