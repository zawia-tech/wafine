'use client';

import { useEffect, useState } from 'react';
import Link from "next/link";
import { useRouter } from 'next/navigation';
import {
  ApiError,
  approveOAuthRequest,
  denyOAuthRequest,
  getOAuthRequest,
  type OAuthRequestInfo,
} from '@/lib/bff';
import { getSession, isSessionExpired } from '@/lib/session';
import { useClientValue, useHydrated } from '@/lib/use-client-value';

const readRequestId = () => new URLSearchParams(window.location.search).get('request');

/**
 * OAuth consent for MCP connectors (Claude). Reached from api.<zone>/oauth/authorize with a
 * short-lived request id; approving sends the browser back to the app's registered redirect URI.
 */
export default function ConsentPage() {
  const router = useRouter();
  // The request id comes from the URL, read after hydration (null on the server).
  const hydrated = useHydrated();
  const requestId = useClientValue(readRequestId, null);
  const [info, setInfo] = useState<OAuthRequestInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const error = hydrated && !requestId ? 'Missing sign-in request. Start again from Claude.' : failure;

  useEffect(() => {
    const id = requestId;
    if (!id) return;
    const here = `/oauth/consent?request=${encodeURIComponent(id)}`;
    if (!getSession() || isSessionExpired()) {
      router.push(`/auth/login?next=${encodeURIComponent(here)}`);
      return;
    }
    getOAuthRequest(id)
      .then(setInfo)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          router.push(`/auth/login?next=${encodeURIComponent(here)}`);
        } else {
          setFailure(err instanceof Error ? err.message : 'This sign-in request is no longer valid.');
        }
      });
  }, [router, requestId]);

  async function decide(approve: boolean) {
    if (!requestId) return;
    setBusy(true);
    setFailure(null);
    try {
      const { redirectTo } = approve ? await approveOAuthRequest(requestId) : await denyOAuthRequest(requestId);
      window.location.assign(redirectTo);
    } catch (err) {
      setFailure(err instanceof Error ? err.message : 'Request failed');
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="mb-4 text-2xl font-semibold">Connect to your WhatsApp</h1>
      {error && <p className="mb-4 rounded-sm border border-red-300 p-2 text-sm text-red-600">{error}</p>}
      {!info && !error && <p className="text-base-content/60">Loading…</p>}
      {info && (
        <>
          <p className="mb-3">
            <strong>{info.clientName}</strong> wants to use your WhatsApp account through{' '}
            the WaFine MCP connector.
          </p>
          <ul className="mb-4 list-disc pl-5 text-sm">
            <li>Read your chats, messages, contacts and groups.</li>
            <li>Send messages from your number on your behalf.</li>
            <li>Only your own WhatsApp session. You can disconnect it any time on the WhatsApp page.</li>
          </ul>
          <p className="mb-4 text-sm">
            After you approve, you go back to <strong>{info.redirectHost}</strong>.
          </p>
          {info.loopback && (
            <p className="mb-4 rounded-sm border border-yellow-400 p-2 text-sm">
              This app returns to a program on this computer ({info.redirectHost}). Approve only if you just started
              the connection yourself, for example from Claude Code.
            </p>
          )}
          {!info.hasSession ? (
            <p className="mb-4 text-sm">
              You have no WhatsApp session yet. <Link href="/whatsapp" className="text-primary underline">Create it and scan the QR</Link>,
              then start the connection again from Claude.
            </p>
          ) : (
            <div className="flex gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => void decide(true)}
                className="btn btn-primary btn-sm disabled:opacity-50"
              >
                Allow
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void decide(false)}
                className="rounded-sm border px-4 py-2 disabled:opacity-50"
              >
                Deny
              </button>
            </div>
          )}
        </>
      )}
    </main>
  );
}
