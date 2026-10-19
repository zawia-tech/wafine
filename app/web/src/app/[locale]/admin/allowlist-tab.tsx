'use client';

import { useCallback, useEffect, useState } from 'react';
import { addAllowlisted, listAllowlist, removeAllowlisted, type AllowlistEntry } from '@/lib/bff';

/** Invite allowlist: the pre-backoffice /admin page, moved into a tab with its behaviour unchanged. */
export function AllowlistTab({ canManage }: { canManage: boolean }) {
  const [entries, setEntries] = useState<AllowlistEntry[]>([]);
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => listAllowlist().then(setEntries), []);

  useEffect(() => {
    reload().catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'));
  }, [reload]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    await run(async () => {
      await addAllowlisted(phone);
      setPhone('');
    });
  }

  function onRemove(entry: AllowlistEntry) {
    const warn = entry.boundEmail
      ? `Remove ${entry.phoneE164}? ${entry.boundEmail} is bound to it and will lose the link.`
      : `Remove ${entry.phoneE164} from the allowlist?`;
    if (window.confirm(warn)) void run(() => removeAllowlisted(entry.phoneE164));
  }

  return (
    <>
      <h2 className="mb-4 text-xl font-bold">Invite allowlist</h2>

      {canManage && <form onSubmit={onAdd} className="card mb-4 border border-base-300 bg-base-100">
        <div className="card-body gap-3">
          <label htmlFor="admin-phone" className="text-sm font-medium">
            Invite a WhatsApp number
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="admin-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+212 6XX XX XX XX"
              autoComplete="tel"
              className="input w-full sm:min-w-0 sm:flex-1"
              required
            />
            <button type="submit" disabled={busy} className="btn btn-primary w-full sm:w-auto">
              Add
            </button>
          </div>
          <p className="text-xs text-base-content/75">
            International format (E.164), e.g. +212 6XX XX XX XX. They can sign up only with this number.
          </p>
        </div>
      </form>}

      {error && (
        <div role="alert" className="alert alert-error mb-4">
          <span>{error}</span>
        </div>
      )}

      {entries.length === 0 ? (
        <div className="alert">
          <span>{canManage ? 'No numbers yet. Add one to invite someone.' : 'No numbers yet.'}</span>
        </div>
      ) : (
        <>
          {/* Table from md up */}
          <div className="hidden overflow-x-auto rounded-box border border-base-300 md:block">
            <table className="table">
              <thead>
                <tr>
                  <th>Number</th>
                  <th>Status</th>
                  <th>Added by</th>
                  <th>Added</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.phoneE164}>
                    <td className="font-mono">{e.phoneE164}</td>
                    <td>
                      {e.boundEmail ? (
                        <div>
                          <span className="badge badge-success badge-sm">Registered</span>
                          <div className="mt-1 text-xs">{e.boundEmail}</div>
                        </div>
                      ) : (
                        <span className="badge badge-ghost badge-sm">Invited</span>
                      )}
                    </td>
                    <td>{e.addedBy}</td>
                    <td className="text-xs">{new Date(e.addedAt).toLocaleDateString()}</td>
                    <td className="text-right">
                      {canManage && <button
                        type="button"
                        disabled={busy}
                        onClick={() => onRemove(e)}
                        className="btn btn-ghost btn-sm text-error"
                      >
                        Remove
                      </button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Cards below md */}
          <ul className="space-y-2 md:hidden">
            {entries.map((e) => (
              <li key={e.phoneE164} className="rounded-box border border-base-300 p-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 break-all font-mono">{e.phoneE164}</span>
                  {e.boundEmail ? (
                    <span className="badge badge-success badge-sm shrink-0">Registered</span>
                  ) : (
                    <span className="badge badge-ghost badge-sm shrink-0">Invited</span>
                  )}
                </div>
                {e.boundEmail && <p className="mt-1 break-all text-xs">{e.boundEmail}</p>}
                <p className="mt-1 text-xs text-base-content/75">
                  Added by {e.addedBy} · {new Date(e.addedAt).toLocaleDateString()}
                </p>
                {canManage && <button
                  type="button"
                  disabled={busy}
                  onClick={() => onRemove(e)}
                  className="btn btn-ghost btn-sm mt-1 h-11 text-error"
                >
                  Remove
                </button>}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
