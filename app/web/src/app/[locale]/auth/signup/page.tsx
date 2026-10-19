'use client';

import { useState } from 'react';
import { Link } from '@/i18n/navigation';
import { AuthShell, Field, buttonClass } from '@/components/auth-form';
import { useTranslations } from 'next-intl';
import { signUp } from '@/lib/bff';
import { authErrorKey } from '@/lib/auth-errors';

export default function SignUpPage() {
  const t = useTranslations('auth.signup');
  const tAuth = useTranslations('auth');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ confirm: boolean } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await signUp({ email, password, phone });
      setDone({ confirm: res.emailConfirmationRequired });
    } catch (err) {
      setError(tAuth(authErrorKey(err)));
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <AuthShell title={t("createdTitle")}>
        <p>
          {done.confirm
            ? t('confirm')
            : t('noConfirm')}
        </p>
        <Link href="/auth/login" className={buttonClass}>
          {t('goToLogin')}
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t("title")}>
      <p className="text-sm text-base-content/75">{t('intro')}</p>
      {error && (
        <div role="alert" className="alert alert-error text-sm">
          <span>{error}</span>
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field
          label={t("email")}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          required
        />
        <Field
          label={t("password")}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          minLength={8}
          hint={t("passwordHint")}
          required
        />
        <Field
          label={t("phone")}
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+212 6XX XX XX XX"
          hint={t("phoneHint")}
          autoComplete="tel"
          required
        />
        <button type="submit" disabled={loading} className={buttonClass}>
          {loading ? <span className="loading loading-spinner loading-sm" /> : null}
          {loading ? t('submitting') : t('submit')}
        </button>
      </form>
      <p className="text-center text-sm text-base-content/75">
        {t('haveAccount')}{' '}
        <Link href="/auth/login" className="link link-primary">
          {t('login')}
        </Link>
      </p>
    </AuthShell>
  );
}
