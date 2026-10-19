'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { AppHeader } from '@/components/app-header';
import { CopyField } from '@/components/copy-field';
import {
  ApiError,
  createWaKey,
  createWaSession,
  deleteWaSession,
  getMe,
  getWaConnectInfo,
  getWaQr,
  getWaSession,
  listConnectedApps,
  listWaKeys,
  revokeConnectedApp,
  logoutWaSession,
  revokeWaKey,
  startWaSession,
  type ConnectedApp,
  type NewWaKey,
  type WaKey,
  type WaSession,
  type WaStatus,
} from '@/lib/bff';
import { getSession, isSessionExpired } from '@/lib/session';

/** Badge color per status: green once linked, amber when a human must act, red on failure. */
const STATUS_BADGE: Record<WaStatus, string> = {
  created: 'badge-ghost',
  initializing: 'badge-info',
  qr_ready: 'badge-info',
  authenticating: 'badge-info',
  ready: 'badge-success',
  disconnected: 'badge-warning',
  action_required: 'badge-warning',
  failed: 'badge-error',
  phone_mismatch: 'badge-error',
};

/** Statuses during which the page keeps polling the session and QR. */
const LIVE: WaStatus[] = ['created', 'initializing', 'qr_ready', 'authenticating'];

/** Max live API keys per session; mirrors the BFF's own limit. */
const MAX_KEYS = 5;

export default function WhatsAppPage() {
  const t = useTranslations('whatsappPage');
  const locale = useLocale();
  const when = (iso: string) => new Date(iso).toLocaleString(locale);
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [phone, setPhone] = useState<string | null>(null);
  const [session, setSession] = useState<WaSession | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [keys, setKeys] = useState<WaKey[]>([]);
  const [apps, setApps] = useState<ConnectedApp[]>([]);
  const [newKey, setNewKey] = useState<NewWaKey | null>(null);
  const [info, setInfo] = useState<{ restBase: string; mcpUrl: string } | null>(null);
  const [busy, setBusy] = useState(false);
  // Localized headline plus the raw BFF detail (kept for the tooltip, not shown inline).
  const [error, setError] = useState<{ key: 'loadFailed' | 'requestFailed'; detail?: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    const r = await getWaSession();
    setSession(r.session);
    setSessionError(r.error ?? null);
    if (r.session && r.session.status === 'qr_ready') {
      const q = await getWaQr();
      setQr(q.qrCode);
    } else {
      setQr(null);
    }
    if (r.session) {
      setKeys(await listWaKeys());
      setApps(await listConnectedApps().catch(() => []));
    }
    return r.session;
  }, []);

  // Poll while the session is starting or waiting for a scan (the QR rotates every few seconds).
  // The recursion goes through the inner `next`, not `schedule` itself: a callback cannot
  // read its own binding before it is declared (React Compiler lint, react-hooks 7).
  const schedule = useCallback(
    (first: WaSession | null) => {
      const next = (s: WaSession | null) => {
        if (timer.current) clearTimeout(timer.current);
        if (s && LIVE.includes(s.status)) {
          timer.current = setTimeout(() => {
            refresh()
              .then(next)
              .catch(() => next(s));
          }, 3000);
        }
      };
      next(first);
    },
    [refresh],
  );

  useEffect(() => {
    const s = getSession();
    if (!s || isSessionExpired()) {
      router.push('/auth/login');
      return;
    }
    Promise.all([getMe(), getWaConnectInfo()])
      .then(async ([me, ci]) => {
        setPhone(me.phone);
        setInfo(ci);
        setReady(true);
        schedule(await refresh());
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) router.push('/auth/login');
        else setError({ key: 'loadFailed', detail: err instanceof Error ? err.message : undefined });
      });
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [router, refresh, schedule]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      schedule(await refresh());
    } catch (err) {
      setError({ key: 'requestFailed', detail: err instanceof Error ? err.message : undefined });
    } finally {
      setBusy(false);
    }
  }

  function revokeKey(key: WaKey) {
    void run(async () => {
      await revokeWaKey(key.id);
      if (newKey?.id === key.id) setNewKey(null);
    });
  }

  function disconnectApp(app: ConnectedApp) {
    void run(() => revokeConnectedApp(app.id));
  }

  if (!ready) {
    return (
      <main className="mx-auto w-full max-w-2xl p-4">
        <AppHeader phone={phone} />
        {error ? (
          <div role="alert" className="alert alert-error">
            <span title={error.detail}>{t(error.key)}</span>
          </div>
        ) : (
          <p className="flex items-center gap-2 text-base-content/75">
            <span className="loading loading-spinner loading-sm" />
            {t('loading')}
          </p>
        )}
      </main>
    );
  }

  const activeKeys = keys.filter((k) => !k.revokedAt);
  const sessionId = session?.id ?? '<session-id>';
  const keyForSnippet = newKey?.apiKey ?? '<your-api-key>';

  return (
    <main className="mx-auto w-full max-w-2xl p-4">
      <AppHeader phone={phone} />
      <h1 className="mb-4 text-2xl font-bold">{t('title')}</h1>
      {error && (
        <div role="alert" className="alert alert-error mb-4">
          <span title={error.detail}>{t(error.key)}</span>
        </div>
      )}

      {/* ── Session ─────────────────────────────────────── */}
      <section className="card mb-4 border border-base-300 bg-base-100">
        <div className="card-body gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="card-title text-lg">{t('session')}</h2>
            {session && (
              <span className={`badge ${STATUS_BADGE[session.status] ?? 'badge-ghost'}`}>
                {t.has(`status.${session.status}`) ? t(`status.${session.status}`) : session.status}
              </span>
            )}
          </div>

          {!session ? (
            <>
              <p className="text-sm text-base-content/75">
                {t('linkPrompt', { phone: phone ?? '' })}
              </p>
              <div className="card-actions">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(createWaSession)}
                  className="btn btn-primary w-full sm:w-auto"
                >
                  {t('createSession')}
                </button>
              </div>
            </>
          ) : (
            <>
              {session.phone && (
                <p className="text-sm">
                  {t('linkedNumber')} <span className="font-mono">+{session.phone.replace(/^\+/, '')}</span>
                </p>
              )}
              {sessionError && (
                <div role="alert" className="alert alert-error text-sm">
                  <span>{sessionError}</span>
                </div>
              )}
              {session.lastError && (
                <div role="alert" className="alert alert-warning text-sm">
                  <span>{session.lastError}</span>
                </div>
              )}

              {session.status === 'qr_ready' && (
                <div className="my-2">
                  {qr ? (
                    <div className="mx-auto w-fit rounded-box bg-white p-3">
                      {/* eslint-disable-next-line @next/next/no-img-element -- data: URL from the engine */}
                      <img src={qr} alt={t('qrAlt')} width={264} height={264} className="block" />
                    </div>
                  ) : (
                    <p className="flex items-center gap-2 text-sm text-base-content/75">
                      <span className="loading loading-spinner loading-sm" />
                      {t('waitingQr')}
                    </p>
                  )}
                  <p className="mt-3 text-xs text-base-content/75">
                    {t('qrSteps', { phone: phone ?? '' })}
                  </p>
                </div>
              )}

              <div className="card-actions flex-wrap gap-2">
                {['disconnected', 'failed', 'action_required', 'phone_mismatch'].includes(session.status) && (
                  <button type="button" disabled={busy} onClick={() => run(startWaSession)} className="btn btn-primary">
                    {t('startAgain')}
                  </button>
                )}
                {session.status === 'ready' && (
                  <button type="button" disabled={busy} onClick={() => run(logoutWaSession)} className="btn btn-outline">
                    {t('unlink')}
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm(t('deleteConfirm'))) {
                      void run(async () => {
                        await deleteWaSession();
                        setNewKey(null);
                        setKeys([]);
                        setApps([]);
                      });
                    }
                  }}
                  className="btn btn-outline btn-error"
                >
                  {t('deleteSession')}
                </button>
              </div>
            </>
          )}
        </div>
      </section>

      {/* ── API keys ────────────────────────────────────── */}
      {session && (
        <section className="card mb-4 border border-base-300 bg-base-100">
          <div className="card-body gap-3">
            <h2 className="card-title text-lg">{t('apiKeys')}</h2>
            <p className="text-sm text-base-content/75">
              {t('apiKeysIntro')}
            </p>

            {newKey && (
              <div className="rounded-box border border-warning bg-warning/10 p-3">
                <p className="mb-1 text-sm font-semibold">{t('newKey')}</p>
                <CopyField label={t('apiKey')} value={newKey.apiKey} secret />
              </div>
            )}

            <div className="card-actions items-center gap-3">
              <button
                type="button"
                disabled={busy || activeKeys.length >= MAX_KEYS}
                onClick={() =>
                  run(async () => {
                    setNewKey(await createWaKey());
                  })
                }
                className="btn btn-primary w-full sm:w-auto"
              >
                {t('generateKey')}
              </button>
              {activeKeys.length >= MAX_KEYS && (
                <span className="text-xs text-base-content/75">{t('maxKeys', { max: MAX_KEYS })}</span>
              )}
            </div>

            {keys.length > 0 && (
              <>
                {/* Table from md up */}
                <div className="hidden overflow-x-auto md:block">
                  <table className="table table-sm">
                    <thead>
                      <tr>
                        <th>{t('key')}</th>
                        <th>{t('created')}</th>
                        <th className="text-right">{t('actions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {keys.map((k) => (
                        <tr key={k.id}>
                          <td className="font-mono text-xs">{k.keyPrefix}…</td>
                          <td className="text-xs">{when(k.createdAt)}</td>
                          <td className="text-right">
                            {k.revokedAt ? (
                              <span className="badge badge-ghost badge-sm">{t('revoked')}</span>
                            ) : (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => revokeKey(k)}
                                className="btn btn-ghost btn-sm text-error"
                              >
                                {t('revoke')}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Cards below md: a five-column table cannot fit 360px */}
                <ul className="space-y-2 md:hidden">
                  {keys.map((k) => (
                    <li key={k.id} className="rounded-box border border-base-300 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <span className="min-w-0 break-all font-mono text-xs">{k.keyPrefix}…</span>
                        {k.revokedAt ? (
                          <span className="badge badge-ghost badge-sm shrink-0">{t('revoked')}</span>
                        ) : (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => revokeKey(k)}
                            className="btn btn-ghost btn-sm h-11 shrink-0 text-error"
                          >
                            {t('revoke')}
                          </button>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-base-content/75">
                        {t('createdAt', { date: when(k.createdAt) })}
                      </p>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </section>
      )}

      {/* ── Claude ──────────────────────────────────────── */}
      {session && info && (
        <section className="card mb-4 border border-base-300 bg-base-100">
          <div className="card-body gap-3">
            <h2 className="card-title text-lg">{t('claudeTitle')}</h2>
            <p className="text-sm text-base-content/75">
              {t('claudeIntro')}
            </p>
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              <li>{t('claudeStep1')}</li>
              <li>{t('claudeStep2')}</li>
              <li>{t('claudeStep3')}</li>
            </ol>
            <CopyField label={t('connectorUrl')} value={info.mcpUrl} />

            <h3 className="mt-1 text-sm font-semibold">{t('connectedApps')}</h3>
            {apps.length === 0 ? (
              <p className="text-sm text-base-content/75">{t('noApps')}</p>
            ) : (
              <>
                <div className="hidden overflow-x-auto md:block">
                  <table className="table table-sm">
                    <tbody>
                      {apps.map((a) => (
                        <tr key={a.id}>
                          <td>{a.clientName}</td>
                          <td className="text-xs">
                            {t('appConnected', { date: when(a.createdAt) })}
                            {a.lastUsedAt ? ` · ${t('appLastUsed', { date: when(a.lastUsedAt) })}` : ''}
                          </td>
                          <td className="text-right">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => disconnectApp(a)}
                              className="btn btn-ghost btn-sm text-error"
                            >
                              {t('disconnect')}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <ul className="space-y-2 md:hidden">
                  {apps.map((a) => (
                    <li key={a.id} className="rounded-box border border-base-300 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <span className="min-w-0 wrap-break-word font-medium">{a.clientName}</span>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => disconnectApp(a)}
                          className="btn btn-ghost btn-sm h-11 shrink-0 text-error"
                        >
                          {t('disconnect')}
                        </button>
                      </div>
                      <p className="mt-1 text-xs text-base-content/75">
                        {t('appConnected', { date: when(a.createdAt) })}
                        {a.lastUsedAt ? ` · ${t('appLastUsed', { date: when(a.lastUsedAt) })}` : ''}
                      </p>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </section>
      )}

      {/* ── Connect ─────────────────────────────────────── */}
      {session && info && (
        <section className="card mb-4 border border-base-300 bg-base-100">
          <div className="card-body gap-3">
            <h2 className="card-title text-lg">{t('connectTitle')}</h2>
            <div>
              <CopyField label={t('sessionId')} value={sessionId} />
              <CopyField label={t('restBase')} value={info.restBase} />
              <CopyField label={t('mcpEndpoint')} value={info.mcpUrl} />
            </div>

            <h3 className="text-sm font-semibold">{t('sendRest')}</h3>
            <CopyField
              label="curl"
              value={`curl -X POST ${info.restBase}/sessions/${sessionId}/messages/send-text -H "X-API-Key: ${keyForSnippet}" -H "Content-Type: application/json" -d '{"chatId":"212600000000@c.us","text":"Hello"}'`}
            />

            <h3 className="text-sm font-semibold">{t('otherMcp')}</h3>
            <CopyField
              label="Claude Code"
              value={`claude mcp add --transport http whatsapp ${info.mcpUrl} --header "X-API-Key: ${keyForSnippet}"`}
            />
            <CopyField
              label={t('genericMcp')}
              value={JSON.stringify({
                mcpServers: { whatsapp: { type: 'http', url: info.mcpUrl, headers: { 'X-API-Key': keyForSnippet } } },
              })}
            />
            <p className="text-xs text-base-content/75">
              {t('banWarning')}
            </p>
          </div>
        </section>
      )}
    </main>
  );
}
