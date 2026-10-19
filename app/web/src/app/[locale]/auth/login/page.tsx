'use client';

import { useState } from 'react';
import { Link } from '@/i18n/navigation';
import { useRouter } from '@/i18n/navigation';
import { AuthShell, Field, buttonClass } from '@/components/auth-form';
import { useTranslations } from 'next-intl';
import { login } from '@/lib/bff';
import { authErrorKey } from '@/lib/auth-errors';
import { safeNext } from '@/lib/safe-next';

export default function LoginPage() {
  const t = useTranslations('auth.login');
  const tAuth = useTranslations('auth');
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      // The BFF's login answer already applies the role rule (any role above `user`).
      const session = await login(email, password);
      const next = safeNext(new URLSearchParams(window.location.search).get('next'));
      router.push(next ?? (session.isAdmin ? '/admin' : '/whatsapp'));
    } catch (err) {
      setError(tAuth(authErrorKey(err)));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell title={t("title")}>
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
          autoComplete="current-password"
          required
        />
        <p className="-mt-2 text-end text-sm">
          <Link href="/auth/forgot" className="link link-primary">
            {t('forgot')}
          </Link>
        </p>
        <button type="submit" disabled={loading} className={buttonClass}>
          {loading ? <span className="loading loading-spinner loading-sm" /> : null}
          {loading ? t('submitting') : t('submit')}
        </button>
      </form>
      <p className="text-center text-sm text-base-content/75">
        {t('invited')}{' '}
        <Link href="/auth/signup" className="link link-primary">
          {t('createAccount')}
        </Link>
      </p>
    </AuthShell>
  );
}
