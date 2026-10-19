'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { usePathname, useRouter } from '@/i18n/navigation';
import { ThemeToggle } from '@/components/theme-toggle';
import { Brand } from '@/components/brand';
import { clearSession, getSession } from '@/lib/session';
import { getMe } from '@/lib/bff';
import { useClientValue } from '@/lib/use-client-value';

/**
 * App chrome: a daisyUI navbar with the account summary, the page links and the theme switch.
 *
 * The mobile menu is a controlled overlay panel rather than daisyUI's CSS-only `dropdown`:
 * the checkbox/focus hacks fight React state, and this keeps Esc-to-close, focus restore and
 * aria-expanded in one place. Panel rows and the two icon buttons are all ≥44px tall (plain
 * `btn` / `btn-square` are 48px); the desktop text links stay `btn-sm` (32px, above the 24px
 * minimum), which is fine for a pointer.
 */
export function AppHeader({ phone }: { phone?: string | null }) {
  const t = useTranslations('common');
  const tNav = useTranslations('appNav');
  const router = useRouter();
  const pathname = usePathname();
  // The session lives in sessionStorage, so it is read after hydration (null on the server).
  const session = useClientValue(getSession, null);
  // From GET /api/me, tied to the token it was fetched with: admin access for roles above
  // `user`, and the display name shown instead of the e-mail.
  const [me, setMe] = useState<{ token: string; allowed: boolean; displayName: string | null } | null>(null);
  const [open, setOpen] = useState(false);
  // Close the menu when the route changes: adjust state while rendering (React's pattern for
  // "reset on prop change") instead of a setState inside an effect.
  const [menuPath, setMenuPath] = useState(pathname);
  if (menuPath !== pathname) {
    setMenuPath(pathname);
    setOpen(false);
  }
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!session) return;
    let active = true;
    getMe()
      .then((r) => {
        if (active) setMe({ token: session.token, allowed: r.isAdmin, displayName: r.displayName ?? null });
      })
      .catch(() => {
        if (active) setMe({ token: session.token, allowed: session.isAdmin, displayName: null });
      });
    return () => {
      active = false;
    };
  }, [session]);
  const current = session && me?.token === session.token ? me : null;

  // Close the menu on Esc.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  function logout() {
    clearSession();
    router.push('/auth/login');
  }

  const links: Array<{ href: string; label: string }> = [
    ...(session?.isAdmin || current?.allowed ? [{ href: '/admin', label: tNav('admin') }] : []),
    { href: '/whatsapp', label: tNav('whatsapp') },
    { href: '/messages', label: tNav('messages') },
    ...(session ? [{ href: '/settings', label: tNav('settings') }] : []),
  ];

  const account = [current?.displayName || session?.email, phone ? `+${phone.replace(/^\+/, '')}` : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <header className="sticky top-0 z-30 -mx-4 mb-4 border-b border-base-300 bg-base-100/95 px-4 backdrop-blur-sm">
      <div className="navbar min-h-14 gap-2 px-0">
        <div className="navbar-start gap-1">
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls={menuId}
            aria-label={open ? t('closeMenu') : t('openMenu')}
            className="btn btn-ghost btn-square md:hidden"
          >
            {open ? <IconClose /> : <IconMenu />}
          </button>
          <Brand href="/whatsapp" />
        </div>

        <div className="navbar-end gap-1">
          <span className="mr-2 hidden max-w-64 truncate text-sm text-base-content/75 lg:block" title={account}>
            {account}
          </span>
          <nav className="hidden items-center gap-1 md:flex">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={pathname === link.href ? 'page' : undefined}
                className={`btn btn-ghost btn-sm ${pathname === link.href ? 'btn-active' : ''}`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <ThemeToggle />
          <button type="button" onClick={logout} className="btn btn-ghost btn-sm hidden md:inline-flex">
            {t('logout')}
          </button>
        </div>
      </div>

      {open && (
        <>
          {/* Tapping outside closes the panel; the button is inert to assistive tech. */}
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default bg-base-content/20 md:hidden"
          />
          <ul
            id={menuId}
            className="absolute inset-x-4 top-full z-50 mt-1 space-y-1 rounded-box border border-base-300 bg-base-100 p-2 shadow-floating md:hidden"
          >
            {account && (
              <li className="truncate px-3 py-2 text-sm text-base-content/75" title={account}>
                {account}
              </li>
            )}
            {links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={() => setOpen(false)}
                  aria-current={pathname === link.href ? 'page' : undefined}
                  className={`btn btn-ghost h-12 w-full justify-start ${pathname === link.href ? 'btn-active' : ''}`}
                >
                  {link.label}
                </Link>
              </li>
            ))}
            <li>
              <button type="button" onClick={logout} className="btn btn-ghost h-12 w-full justify-start">
                {t('logout')}
              </button>
            </li>
          </ul>
        </>
      )}
    </header>
  );
}

function IconMenu() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
    </svg>
  );
}
