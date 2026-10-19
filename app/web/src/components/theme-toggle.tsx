'use client';

import { useTranslations } from 'next-intl';
import { useTheme } from '@/components/theme-provider';

/** Light/dark switch, shared by the app header and the auth screens. */
export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const t = useTranslations('common');
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === 'wafine-dark' ? t('themeToLight') : t('themeToDark')}
      className="btn btn-ghost btn-square"
    >
      {theme === 'wafine-dark' ? <IconSun /> : <IconMoon />}
    </button>
  );
}

function IconSun() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" strokeLinecap="round" />
    </svg>
  );
}

function IconMoon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
