'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { formatPhone } from '@/lib/admin-format';
import { needsPhone, pageCount, resolveInvitePhone, WAITLIST_PAGE_SIZE, waitlistBadgeClass } from '@/lib/admin-waitlist';
import { bulkWaitlistEntries, getWaitlistDetails, inviteWaitlistEntry, listWaitlist, rejectWaitlistEntry, removeWaitlistEntry, reopenWaitlistEntry, type WaitlistEntry, type WaitlistEvent, type WaitlistSourceCount, type WaitlistStatus } from '@/lib/bff';
import { InlineConfirm } from './inline-confirm';

type Filter = WaitlistStatus | 'all';

/** `canDecide`: approve/reject/reopen (one or bulk). `canRemove`: soft remove. Read-only otherwise. */
export function WaitlistTab({ canDecide, canRemove }: { canDecide: boolean; canRemove: boolean }) {
  const t = useTranslations('admin.waitlist');
  const [filter, setFilter] = useState<Filter>('all');
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<{ entries: WaitlistEntry[]; total: number; limit: number; sourceCounts: WaitlistSourceCount[] } | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [details, setDetails] = useState<{ entry: WaitlistEntry; events: WaitlistEvent[] } | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => { setSearch(searchDraft.trim()); setOffset(0); }, 250);
    return () => clearTimeout(timer);
  }, [searchDraft]);

  const load = useCallback((status: Filter, off: number, term: string) => listWaitlist({ ...(status === 'all' ? {} : { status }), search: term, limit: WAITLIST_PAGE_SIZE, offset: off }).then((next) => {
    setPage({ entries: next.entries, total: next.total, limit: next.limit, sourceCounts: next.sourceCounts });
    setSelected([]);
    if (next.entries.length === 0 && off > 0 && next.total > 0) setOffset(Math.max(0, off - next.limit));
  }), []);

  useEffect(() => {
    let cancelled = false;
    load(filter, offset, search).then(() => { if (!cancelled) setLoadFailed(false); }).catch(() => { if (!cancelled) setLoadFailed(true); });
    return () => { cancelled = true; };
  }, [load, filter, offset, search]);

  async function refresh() {
    await load(filter, offset, search);
    if (details) setDetails(await getWaitlistDetails(details.entry.id));
  }
  async function run(operation: () => Promise<unknown>) {
    setBusy(true); setNotice(null);
    try { await operation(); }
    catch (err) { setNotice(err instanceof Error ? err.message : t('requestFailed')); }
    // Refresh even after a failure: a bulk action can commit some leads before one fails.
    try { await refresh(); } catch { /* the operation's notice already explains the failure */ }
    finally { setBusy(false); }
  }
  async function invite(entry: WaitlistEntry) {
    const phone = resolveInvitePhone(entry, drafts[entry.id] ?? '');
    if (!phone.ok) { setNotice(t(phone.error === 'invalid' ? 'phoneInvalid' : 'phoneMissing')); return; }
    await run(() => inviteWaitlistEntry(entry.id, phone.phone));
  }
  async function openDetails(entry: WaitlistEntry) {
    setDetails(null);
    try { setDetails(await getWaitlistDetails(entry.id)); }
    catch (err) { setNotice(err instanceof Error ? err.message : t('requestFailed')); }
  }

  const entries = page?.entries ?? [];
  const pending = entries.filter((entry) => entry.status === 'pending');
  const total = page?.total ?? 0;
  const limit = page?.limit ?? WAITLIST_PAGE_SIZE;
  const current = Math.floor(offset / limit) + 1;
  const pages = pageCount(total, limit);
  const allPendingSelected = pending.length > 0 && pending.every((entry) => selected.includes(entry.id));
  const statusKey = (status: WaitlistStatus) => ({ pending: 'statusPending', invited: 'statusInvited', rejected: 'statusRejected', removed: 'statusRemoved' })[status];

  return <>
    <h2 className="mb-1 text-xl font-bold">{t('title')}</h2>
    <p className="mb-4 text-sm text-base-content/75">{t('intro')}</p>
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
      <label className="form-control w-full sm:max-w-sm"><span className="label-text mb-1">{t('searchLabel')}</span><input type="search" value={searchDraft} onChange={(e) => setSearchDraft(e.target.value)} placeholder={t('searchPlaceholder')} className="input input-bordered h-11 min-h-11" /></label>
      <label className="form-control w-full sm:w-52"><span className="label-text mb-1">{t('statusFilterLabel')}</span><select value={filter} onChange={(e) => { setFilter(e.target.value as Filter); setOffset(0); }} className="select select-bordered h-11 min-h-11">
        <option value="all">{t('statusAll')}</option>{(['pending', 'invited', 'rejected', 'removed'] as const).map((status) => <option key={status} value={status}>{t(statusKey(status))}</option>)}
      </select></label>
    </div>
    {loadFailed && <div role="alert" className="alert alert-error mb-4">{t('loadFailed')}</div>}
    {notice && <div role="alert" className="alert alert-error mb-4">{notice}</div>}
    {page && page.sourceCounts.length > 0 && <section aria-labelledby="waitlist-sources-title" className="mb-6">
      <h3 id="waitlist-sources-title" className="mb-2 font-semibold">{t('sourceCountsTitle')}</h3><div className="overflow-x-auto rounded-box border border-base-300"><table className="table table-sm"><thead><tr><th>{t('source')}</th><th>{t('sourceValue')}</th><th>{t('sourceTotal')}</th><th>{t('sourceLast7Days')}</th></tr></thead><tbody>{page.sourceCounts.map((item) => <tr key={`${item.field}:${item.value}`}><td>{t(item.field === 'ref' ? 'sourceRef' : item.field === 'utm_source' ? 'utmSource' : 'utmCampaign')}</td><td className="break-all font-mono text-sm">{item.value}</td><td>{item.total}</td><td>{item.last7Days}</td></tr>)}</tbody></table></div>
    </section>}
    {!page ? (!loadFailed && <p className="flex items-center gap-2 text-base-content/75"><span className="loading loading-spinner loading-sm" />{t('loading')}</p>) : entries.length === 0 ? <div className="alert">{t(search ? 'emptySearch' : filter === 'all' ? 'empty' : 'emptyFiltered')}</div> : <>
      {canDecide && selected.length > 0 && <div className="mb-3 flex flex-wrap items-center gap-2"><span className="text-sm">{t('selectedCount', { count: selected.length })}</span>
        <button className="btn btn-primary btn-sm h-11 min-h-11" disabled={busy} onClick={() => void run(() => bulkWaitlistEntries(selected, 'approve'))}>{t('bulkApprove')}</button>
        <button className="btn btn-outline btn-sm h-11 min-h-11" disabled={busy} onClick={() => void run(() => bulkWaitlistEntries(selected, 'reject'))}>{t('bulkReject')}</button>
      </div>}
      <div className="overflow-x-auto rounded-box border border-base-300"><table className="table">
        <thead><tr><th>{canDecide && <input type="checkbox" className="checkbox" aria-label={t('selectPending')} checked={allPendingSelected} onChange={(e) => setSelected(e.target.checked ? pending.map((entry) => entry.id) : [])} />}</th><th>{t('colEmail')}</th><th>{t('colPhone')}</th><th>{t('colRequested')}</th><th>{t('colStatus')}</th><th>{t('colAction')}</th></tr></thead>
        <tbody>{entries.map((entry) => <tr key={entry.id}>
          <td>{canDecide && entry.status === 'pending' && <input type="checkbox" className="checkbox" checked={selected.includes(entry.id)} aria-label={t('selectEmail', { email: entry.email })} onChange={(e) => setSelected((ids) => e.target.checked ? [...ids, entry.id] : ids.filter((id) => id !== entry.id))} />}</td>
          <td className="break-all">{entry.email}</td><td className="whitespace-nowrap font-mono text-sm">{formatPhone(entry.waNumber)}</td><td className="whitespace-nowrap text-xs">{new Date(entry.createdAt).toLocaleDateString()}</td>
          <td><span className={`badge badge-sm ${waitlistBadgeClass(entry.status)}`}>{t(statusKey(entry.status))}</span></td>
          <td><div className="flex min-w-56 flex-wrap items-center gap-1">
            <button type="button" className="btn btn-ghost btn-sm h-11 min-h-11" onClick={() => void openDetails(entry)}>{t('details')}</button>
            {canDecide && entry.status === 'pending' && <>{needsPhone(entry) && <input type="tel" inputMode="tel" value={drafts[entry.id] ?? ''} onChange={(e) => setDrafts((d) => ({ ...d, [entry.id]: e.target.value }))} placeholder={t('phonePlaceholder')} aria-label={t('phoneLabel', { email: entry.email })} className="input input-sm h-11 min-h-11 w-full font-mono" />}<button className="btn btn-primary btn-sm h-11 min-h-11" disabled={busy} onClick={() => void invite(entry)}>{t('invite')}</button><button className="btn btn-ghost btn-sm h-11 min-h-11" disabled={busy} onClick={() => void run(() => rejectWaitlistEntry(entry.id))}>{t('reject')}</button></>}
            {canDecide && entry.status === 'rejected' && <button className="btn btn-outline btn-sm h-11 min-h-11" disabled={busy} onClick={() => void run(() => reopenWaitlistEntry(entry.id))}>{t('reopen')}</button>}
            {canRemove && entry.status !== 'removed' && <InlineConfirm label={t('remove')} question={t('removeQuestion', { email: entry.email })} confirmLabel={t('confirmRemove')} disabled={busy} onConfirm={() => run(() => removeWaitlistEntry(entry.id))} />}
          </div></td>
        </tr>)}</tbody>
      </table></div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-base-content/75">{t('page', { page: current, pages })} · {t('count', { count: total })}</p><div className="flex gap-2"><button disabled={offset === 0 || busy} onClick={() => setOffset(Math.max(0, offset - limit))} className="btn btn-sm h-11 min-h-11">{t('previous')}</button><button disabled={offset + limit >= total || busy} onClick={() => setOffset(offset + limit)} className="btn btn-sm h-11 min-h-11">{t('next')}</button></div></div>
    </>}
    {details && <div className="modal modal-open" role="dialog" aria-modal="true" aria-labelledby="waitlist-detail-title"><div className="modal-box max-h-[90vh] max-w-2xl overflow-y-auto"><h3 id="waitlist-detail-title" className="text-lg font-bold">{details.entry.email}</h3><dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">{[[t('colPhone'), formatPhone(details.entry.waNumber)], [t('colStatus'), t(statusKey(details.entry.status))], [t('requestedAt'), new Date(details.entry.createdAt).toLocaleString()], [t('invitedAt'), details.entry.invitedAt ? new Date(details.entry.invitedAt).toLocaleString() : t('notAvailable')], [t('useCase'), details.entry.useCase || t('notAvailable')], [t('sourceRef'), details.entry.sourceRef || t('notAvailable')], [t('utmSource'), details.entry.utmSource || t('notAvailable')], [t('utmCampaign'), details.entry.utmCampaign || t('notAvailable')], [t('removedAt'), details.entry.removedAt ? new Date(details.entry.removedAt).toLocaleString() : t('notAvailable')]].map(([label, value]) => <div key={label}><dt className="text-xs text-base-content/65">{label}</dt><dd className="break-words">{value}</dd></div>)}</dl><h4 className="mt-6 font-semibold">{t('history')}</h4>{details.events.length === 0 ? <p className="mt-2 text-sm text-base-content/70">{t('noHistory')}</p> : <ol className="mt-2 space-y-2">{details.events.map((event) => <li key={event.id} className="rounded-box bg-base-200 p-3 text-sm"><span className="font-medium">{t(({ invited: 'eventInvited', rejected: 'eventRejected', removed: 'eventRemoved', reopened: 'eventReopened' } as const)[event.action])}</span><span className="mx-2">·</span>{t(statusKey(event.fromStatus))} → {t(statusKey(event.toStatus))}<div className="text-xs text-base-content/65">{new Date(event.createdAt).toLocaleString()} · {t('adminId')}: {event.adminId}</div></li>)}</ol>}<div className="modal-action"><button className="btn h-11 min-h-11" onClick={() => setDetails(null)}>{t('close')}</button></div></div><button className="modal-backdrop" aria-label={t('close')} onClick={() => setDetails(null)} /></div>}
  </>;
}
