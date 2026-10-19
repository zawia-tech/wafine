'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { AuthShell, Field, buttonClass } from '@/components/auth-form';
import { resetPassword } from '@/lib/bff';
import { authErrorKey } from '@/lib/auth-errors';
import { newPasswordError, recoveryTokenFromHash } from '@/lib/account-validation';
import { clearSession } from '@/lib/session';

/**
 * Landing page of the Supabase reset e-mail (`${SITE_URL}/auth/reset#access_token=…&type=recovery`).
 * The recovery token is read from the URL fragment (never sent to a server log), removed from the
 * address bar, and handed to the BFF once with the new password.
 */
export default function ResetPasswordPage() {
  const t = useTranslations('auth.reset');
  const tAuth = useTranslations('auth');
  const tSettings = useTranslations('settingsPage');
  // undefined: not read yet (first render, server); null: the link has no usable token.
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const found = recoveryTokenFromHash(window.location.hash);
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname + window.location.search);
    // Reading the fragment needs the browser, so this cannot be computed during render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToken(found);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError(null);
    const problem = newPasswordError(password, confirm);
    if (problem) {
      setError(tSettings(`errors.${problem}`));
      return;
    }
    setLoading(true);
    try {
      await resetPassword(token, password);
      // Any session stored in this tab belongs to the old password: start clean.
      clearSession();
      setDone(true);
    } catch (err) {
      setError(tAuth(authErrorKey(err)));
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <AuthShell title={t('doneTitle')}>
        <p role="status" className="text-sm">
          {t('done')}
        </p>
        <Link href="/auth/login" className={buttonClass}>
          {t('goToLogin')}
        </Link>
      </AuthShell>
    );
  }

  if (token === null) {
    return (
      <AuthShell title={t('title')}>
        <div role="alert" className="alert alert-error text-sm">
          <span>{t('invalidLink')}</span>
        </div>
        <Link href="/auth/forgot" className={buttonClass}>
          {t('askAgain')}
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t('title')}>
      {error && (
        <div role="alert" className="alert alert-error text-sm">
          <span>{error}</span>
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Field
          label={t('password')}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          hint={t('hint')}
          required
        />
        <Field
          label={t('confirm')}
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          required
        />
        <button type="submit" disabled={loading || !token} className={buttonClass}>
          {loading ? <span className="loading loading-spinner loading-sm" /> : null}
          {loading ? t('submitting') : t('submit')}
        </button>
      </form>
    </AuthShell>
  );
}
