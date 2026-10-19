'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { AppHeader } from '@/components/app-header';
import { ApiError, getMe } from '@/lib/bff';
import { getSession, isSessionExpired } from '@/lib/session';
import { AllowlistTab } from './allowlist-tab';
import { ComingSoonTab } from './coming-soon-tab';
import { SendLimitsTab } from './send-limits-tab';
import { SessionsTab } from './sessions-tab';
import { UsersTab } from './users-tab';
import { WaitlistTab } from './waitlist-tab';
import { abilities, visibleTabs, type AdminTabId } from '@/lib/admin-permissions';
import { Link } from '@/i18n/navigation';

type TabId = AdminTabId;

function renderTab(id: TabId, permissions: string[]) {
  const can = abilities(permissions);
  switch (id) {
    case 'limits':
      return <SendLimitsTab canManage={can.manageSettings} />;
    case 'sessions':
      return <SessionsTab canManageLimits={can.manageSessions} canRevokeKeys={can.manageSessions} canRevokeGrants={can.manageSessions} />;
    case 'users':
      return <UsersTab canManageUsers={can.manageUsers} canManageRoles={can.manageRoles} />;
    case 'allowlist':
      return <AllowlistTab canManage={can.manageAllowlist} />;
    case 'waitlist':
      return <WaitlistTab canDecide={can.decideWaitlist} canRemove={can.removeWaitlist} />;
    case 'billing':
      return <ComingSoonTab title="Billing" />;
    case 'crm':
      return <ComingSoonTab title="CRM" />;
  }
}

/**
 * Admin backoffice. The BFF is the gate (a permission per route, 403 otherwise); `getMe()` only
 * decides what to render: a 403 view for a plain `user`, else the tabs its permissions allow. The active tab lives in the URL hash so it survives a reload.
 * Panels mount on first visit and stay mounted, so switching tabs keeps unsaved edits.
 */
export default function AdminPage() {
  const router = useRouter();
  const tt = useTranslations('admin.tabs');
  const tf = useTranslations('admin.forbidden');
  const [ready, setReady] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<TabId>('limits');
  const [visited, setVisited] = useState<ReadonlySet<TabId>>(() => new Set<TabId>(['limits']));
  const [permissions, setPermissions] = useState<string[]>([]);
  const tabRefs = useRef<Partial<Record<TabId, HTMLButtonElement | null>>>({});

  function select(id: TabId) {
    setActive(id);
    setVisited((v) => (v.has(id) ? v : new Set(v).add(id)));
    window.history.replaceState(null, '', `#${id}`);
  }

  useEffect(() => {
    const session = getSession();
    if (!session || isSessionExpired()) {
      router.push('/auth/login');
      return;
    }
    // The server decides who is an admin; the cached flag is only a hint for the UI.
    getMe()
      .then((me) => {
        if (!me.isAdmin) {
          setForbidden(true);
          return;
        }
        setPermissions(me.permissions);
        const available = visibleTabs(me.permissions);
        const fromHash = window.location.hash.slice(1);
        const selected = available.find((id) => id === fromHash) ?? available[0];
        if (selected) {
          setActive(selected);
          setVisited(new Set<TabId>([selected]));
        }
        setReady(true);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) router.push('/auth/login');
        else if (err instanceof ApiError && err.status === 403) setForbidden(true);
        else setError(err instanceof Error ? err.message : 'Failed to load');
      });
  }, [router]);

  const availableTabs = visibleTabs(permissions).map((id) => ({ id, label: id }));

  // WAI-ARIA tabs pattern: arrows move between tabs (and activate), Home/End jump to the ends.
  function onTabKeyDown(e: React.KeyboardEvent, index: number) {
    let next: number | null = null;
    if (e.key === 'ArrowRight') next = (index + 1) % availableTabs.length;
    else if (e.key === 'ArrowLeft') next = (index - 1 + availableTabs.length) % availableTabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = availableTabs.length - 1;
    const tab = next === null ? undefined : availableTabs[next];
    if (!tab) return;
    e.preventDefault();
    select(tab.id);
    tabRefs.current[tab.id]?.focus();
  }

  if (forbidden) {
    return (
      <main className="mx-auto w-full max-w-5xl p-4">
        <AppHeader />
        <section role="alert" aria-labelledby="admin-forbidden-title" className="card mx-auto mt-8 max-w-lg border border-base-300 bg-base-100">
          <div className="card-body gap-3">
            <p className="font-mono text-sm text-base-content/65">403</p>
            <h1 id="admin-forbidden-title" className="text-2xl font-bold">{tf('title')}</h1>
            <p className="text-base-content/75">{tf('body')}</p>
            <div className="card-actions">
              <Link href="/messages" className="btn btn-primary h-11 min-h-11">{tf('back')}</Link>
            </div>
          </div>
        </section>
      </main>
    );
  }

  if (!ready) {
    return (
      <main className="mx-auto w-full max-w-5xl p-4">
        <AppHeader />
        {error ? (
          <div role="alert" className="alert alert-error">
            <span>{error}</span>
          </div>
        ) : (
          <p className="flex items-center gap-2 text-base-content/75">
            <span className="loading loading-spinner loading-sm" />
            Loading…
          </p>
        )}
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-5xl p-4">
      <AppHeader />
      <h1 className="mb-4 text-2xl font-bold">Admin</h1>

      {/* Scrolls sideways on narrow screens instead of wrapping into a second row. */}
      <div className="-mx-4 mb-4 overflow-x-auto px-4">
        <div role="tablist" aria-label="Admin sections" className="tabs tabs-border w-max min-w-full">
          {availableTabs.map((t, i) => (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[t.id] = el;
              }}
              type="button"
              role="tab"
              id={`admin-tab-${t.id}`}
              aria-selected={active === t.id}
              aria-controls={`admin-panel-${t.id}`}
              tabIndex={active === t.id ? 0 : -1}
              onClick={() => select(t.id)}
              onKeyDown={(e) => onTabKeyDown(e, i)}
              className={`tab h-11 whitespace-nowrap ${active === t.id ? 'tab-active font-semibold' : ''}`}
            >
              {tt(t.label)}
            </button>
          ))}
        </div>
      </div>

      {availableTabs.map((t) =>
        visited.has(t.id) ? (
          <div
            key={t.id}
            role="tabpanel"
            id={`admin-panel-${t.id}`}
            aria-labelledby={`admin-tab-${t.id}`}
            hidden={active !== t.id}
            tabIndex={0}
            className="rounded-box focus:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            {renderTab(t.id, permissions)}
          </div>
        ) : null,
      )}
    </main>
  );
}
