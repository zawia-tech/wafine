'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { listAdminUsers, listUserRoleEvents, setUserDisabled, setUserRole, type AdminUser, type AdminUserRoleEvent } from '@/lib/admin-api';
import { formatPhone } from '@/lib/admin-format';
import { ASSIGNABLE_ROLES, canEditRole } from '@/lib/admin-permissions';
import type { UserRole } from '@/lib/bff';
import { InlineConfirm } from './inline-confirm';

/**
 * Registered users: role (selector for owners only), role history, disable/enable.
 * ADMIN_EMAILS owners (bootstrap) cannot be demoted or disabled here; the BFF enforces the same.
 */
export function UsersTab({ canManageUsers, canManageRoles }: { canManageUsers: boolean; canManageRoles: boolean }) {
  const tr = useTranslations('admin.roles');
  const tc = useTranslations('admin.closure');
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roleEvents, setRoleEvents] = useState<{ userId: string; events: AdminUserRoleEvent[] } | null>(null);

  const reload = useCallback(() => listAdminUsers().then(setUsers), []);

  useEffect(() => {
    reload().catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'));
  }, [reload]);

  async function changeRole(user: AdminUser, role: UserRole) {
    setBusy(true);
    setError(null);
    try {
      await setUserRole(user.userId, role);
      setUsers((list) => list?.map((u) => (u.userId === user.userId ? { ...u, role } : u)) ?? list);
      if (roleEvents?.userId === user.userId) setRoleEvents({ userId: user.userId, events: await listUserRoleEvents(user.userId) });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }

  async function toggleRoleHistory(userId: string) {
    if (roleEvents?.userId === userId) {
      setRoleEvents(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setRoleEvents({ userId, events: await listUserRoleEvents(userId) });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }

  async function toggle(user: AdminUser) {
    setBusy(true);
    setError(null);
    try {
      const r = await setUserDisabled(user.userId, !user.disabled);
      setUsers((list) => list?.map((u) => (u.userId === r.userId ? { ...u, disabled: r.disabled } : u)) ?? list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }

  function action(u: AdminUser) {
    if (!canManageUsers || u.bootstrapOwner) return null;
    const who = u.email ?? formatPhone(u.phone);
    return u.disabled ? (
      <InlineConfirm
        label="Enable"
        question={`Enable ${who}?`}
        tone="primary"
        disabled={busy}
        onConfirm={() => toggle(u)}
      />
    ) : (
      <InlineConfirm
        label="Disable"
        question={`Disable ${who}?`}
        disabled={busy}
        onConfirm={() => toggle(u)}
      />
    );
  }

  function badges(u: AdminUser) {
    return (
      <div className="flex flex-wrap gap-1">
        {u.disabled && <span className="badge badge-error badge-sm">disabled</span>}
        {u.closureRequestedAt && (
          <span
            className="badge badge-warning badge-sm"
            title={tc('since', { date: new Date(u.closureRequestedAt).toLocaleDateString() })}
          >
            {tc('badge')}
          </span>
        )}
        {u.hasSession ? (
          <span className="badge badge-success badge-sm">session</span>
        ) : (
          <span className="badge badge-ghost badge-sm">no session</span>
        )}
      </div>
    );
  }

  function roleCell(u: AdminUser, extra = '') {
    if (!canEditRole(canManageRoles, u)) {
      return (
        <span
          className={`badge badge-sm ${u.role === 'owner' ? 'badge-primary' : 'badge-outline'}`}
          title={u.bootstrapOwner ? tr('bootstrap') : undefined}
        >
          {tr(u.role)}
        </span>
      );
    }
    return (
      <select
        aria-label={tr('label', { email: u.email ?? formatPhone(u.phone) })}
        className={`select select-sm h-11 min-h-11 ${extra}`}
        value={u.role}
        disabled={busy}
        onChange={(e) => void changeRole(u, e.target.value as UserRole)}
      >
        {ASSIGNABLE_ROLES.map((role) => (
          <option key={role} value={role}>
            {tr(role)}
          </option>
        ))}
      </select>
    );
  }

  function history(events: AdminUserRoleEvent[]) {
    if (events.length === 0) return <p className="text-sm text-base-content/70">{tr('noHistory')}</p>;
    return (
      <ol className="space-y-1">
        {events.map((event) => (
          <li key={event.id} className="break-all text-sm">
            {tr(event.fromRole)} → {tr(event.toRole)} · {new Date(event.createdAt).toLocaleString()} ·{' '}
            {tr('by', { email: event.changedByEmail })}
          </li>
        ))}
      </ol>
    );
  }

  function historyButton(u: AdminUser) {
    return (
      <button
        type="button"
        className="btn btn-ghost btn-sm h-11 min-h-11"
        disabled={busy}
        aria-expanded={roleEvents?.userId === u.userId}
        onClick={() => void toggleRoleHistory(u.userId)}
      >
        {roleEvents?.userId === u.userId ? tr('hideHistory') : tr('showHistory')}
      </button>
    );
  }

  return (
    <>
      <h2 className="mb-1 text-xl font-bold">Users</h2>
      <p className="mb-4 text-sm text-base-content/75">
        Roles control admin access. Owners from ADMIN_EMAILS cannot be demoted or disabled here. Disabling an account blocks it without deleting it.
      </p>

      {error && (
        <div role="alert" className="alert alert-error mb-4">
          <span>{error}</span>
        </div>
      )}

      {!users ? (
        !error && (
          <p className="flex items-center gap-2 text-base-content/75">
            <span className="loading loading-spinner loading-sm" />
            Loading…
          </p>
        )
      ) : users.length === 0 ? (
        <div className="alert">
          <span>No users yet.</span>
        </div>
      ) : (
        <>
          {/* Table from md up */}
          <div className="hidden overflow-x-auto rounded-box border border-base-300 md:block">
            <table className="table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Created</th>
                  <th>Status</th>
                  <th>{tr('column')}</th>
                  <th>{tr('history')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <Fragment key={u.userId}>
                  <tr className={u.disabled ? 'opacity-70' : undefined}>
                    <td className="break-all">{u.email ?? '—'}</td>
                    <td className="whitespace-nowrap font-mono text-sm">{formatPhone(u.phone)}</td>
                    <td className="text-xs">{new Date(u.createdAt).toLocaleDateString()}</td>
                    <td>{badges(u)}</td>
                    <td>{roleCell(u)}</td>
                    <td>{historyButton(u)}</td>
                    <td className="text-right">{action(u)}</td>
                  </tr>
                  {roleEvents?.userId === u.userId && (
                    <tr>
                      <td colSpan={7}>{history(roleEvents.events)}</td>
                    </tr>
                  )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {/* Cards below md */}
          <ul className="space-y-2 md:hidden">
            {users.map((u) => (
              <li key={u.userId} className="rounded-box border border-base-300 p-3">
                <p className="break-all font-medium">{u.email ?? '—'}</p>
                <p className="font-mono text-xs text-base-content/75">
                  {formatPhone(u.phone)} · joined {new Date(u.createdAt).toLocaleDateString()}
                </p>
                <div className="mt-2">{badges(u)}</div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {roleCell(u, 'w-full')}
                  {historyButton(u)}
                </div>
                {roleEvents?.userId === u.userId && <div className="mt-2">{history(roleEvents.events)}</div>}
                {!u.bootstrapOwner && <div className="mt-1">{action(u)}</div>}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
