'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { AuthShell, Field, buttonClass } from '@/components/auth-form';
import { requestPasswordReset } from '@/lib/bff';
import { authErrorKey } from '@/lib/auth-errors';
import { emailError } from '@/lib/account-validation';

/** Forgot password: asks the BFF to have Supabase mail a reset link to `/auth/reset`. */
export default function ForgotPasswordPage() {
  const t = useTranslations('auth.forgot');
  const tAuth = useTranslations('auth');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (emailError(email)) {
      setError(tAuth('errors.invalid_email'));
      return;
    }
    setLoading(true);
    try {
      await requestPasswordReset(email.trim());
      setSentTo(email.trim());
    } catch (err) {
      setError(tAuth(authErrorKey(err)));
    } finally {
      setLoading(false);
    }
  }

  if (sentTo) {
    return (
      <AuthShell title={t('sentTitle')}>
        <p role="status" className="text-sm">
          {t('sent', { email: sentTo })}
        </p>
        <Link href="/auth/login" className={buttonClass}>
          {t('backToLogin')}
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t('title')}>
      <p className="text-sm text-base-content/75">{t('intro')}</p>
      {error && (
        <div role="alert" className="alert alert-error text-sm">
          <span>{error}</span>
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Field
          label={t('email')}
          type="email"
          dir="ltr"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          required
        />
        <button type="submit" disabled={loading} className={buttonClass}>
          {loading ? <span className="loading loading-spinner loading-sm" /> : null}
          {loading ? t('submitting') : t('submit')}
        </button>
      </form>
      <p className="text-center text-sm">
        <Link href="/auth/login" className="link link-primary">
          {t('backToLogin')}
        </Link>
      </p>
    </AuthShell>
  );
}
