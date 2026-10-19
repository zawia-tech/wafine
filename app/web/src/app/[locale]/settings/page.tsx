'use client';

import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { AppHeader } from '@/components/app-header';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { authErrorKey } from '@/lib/auth-errors';
import {
  displayNameError,
  emailError,
  newPasswordError,
  normalizeDisplayName,
  type AccountFieldError,
} from '@/lib/account-validation';
import {
  ApiError,
  changeEmail,
  changePassword,
  getAccount,
  requestAccountClosure,
  signOutEverywhere,
  updateDisplayName,
  type Account,
} from '@/lib/bff';
import { clearSession, getSession, isSessionExpired } from '@/lib/session';

type Status = { kind: 'ok' | 'error'; text: string } | null;

/**
 * Account self-service: display name, e-mail, password, WhatsApp number (read-only), sign out of
 * all devices, and a closure request (KEEP ALL DATA: it disables the account for admin review,
 * nothing is deleted). The BFF scopes every call to the signed-in account.
 */
export default function SettingsPage() {
  const t = useTranslations('settingsPage');
  const tAuth = useTranslations('auth');
  const router = useRouter();
  const [account, setAccount] = useState<Account | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    const session = getSession();
    if (!session || isSessionExpired()) {
      router.push('/auth/login');
      return;
    }
    getAccount()
      .then(setAccount)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) router.push('/auth/login');
        else setLoadFailed(true);
      });
  }, [router]);

  /** Translated message for a failed BFF call (codes shared with the auth screens). */
  const apiError = (err: unknown) => tAuth(authErrorKey(err));

  function endSession() {
    clearSession();
    router.push('/auth/login');
  }

  return (
    <main className="mx-auto w-full max-w-3xl p-4">
      <AppHeader phone={account?.phone} />
      <h1 className="mb-4 text-2xl font-bold">{t('title')}</h1>
      {loadFailed ? (
        <Alert variant="error" role="alert">
          <span>{t('loadFailed')}</span>
        </Alert>
      ) : !account ? (
        <p className="flex items-center gap-2 text-base-content/75">
          <span className="loading loading-spinner loading-sm" />
          {t('loading')}
        </p>
      ) : (
        <div className="space-y-4">
          <ProfileSection account={account} onSaved={(displayName) => setAccount({ ...account, displayName })} apiError={apiError} />
          <EmailSection account={account} apiError={apiError} />
          <PasswordSection apiError={apiError} />
          <Section title={t('whatsapp.title')}>
            <p dir="ltr" className="font-mono text-base rtl:text-right">
              {account.phone ?? t('whatsapp.none')}
            </p>
            <p className="text-sm text-base-content/75">{t('whatsapp.readOnly')}</p>
          </Section>
          <SessionsSection apiError={apiError} onDone={endSession} />
          <ClosureSection account={account} apiError={apiError} onDone={endSession} />
        </div>
      )}
    </main>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <Card variant="bordered">
      <section className="card-body gap-3" aria-labelledby={id}>
        <h2 id={id} className="text-lg font-semibold">
          {title}
        </h2>
        {children}
      </section>
    </Card>
  );
}

function StatusLine({ status }: { status: Status }) {
  if (!status) return null;
  return (
    <Alert variant={status.kind === 'ok' ? 'success' : 'error'} role={status.kind === 'ok' ? 'status' : 'alert'}>
      <span>{status.text}</span>
    </Alert>
  );
}

type ApiErrorText = (err: unknown) => string;

function ProfileSection({ account, onSaved, apiError }: { account: Account; onSaved: (name: string | null) => void; apiError: ApiErrorText }) {
  const t = useTranslations('settingsPage');
  const id = useId();
  const [name, setName] = useState(account.displayName ?? '');
  const [fieldError, setFieldError] = useState<AccountFieldError | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setStatus(null);
    const problem = displayNameError(name);
    setFieldError(problem);
    if (problem) return;
    setBusy(true);
    try {
      const saved = await updateDisplayName(normalizeDisplayName(name));
      setName(saved.displayName ?? '');
      onSaved(saved.displayName);
      setStatus({ kind: 'ok', text: t('saved') });
    } catch (err) {
      setStatus({ kind: 'error', text: apiError(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title={t('profile.title')}>
      <form onSubmit={submit} className="space-y-3" noValidate>
        <Field label={t('profile.displayName')} htmlFor={id} hint={t('profile.displayNameHint')} error={fieldError ? t(`errors.${fieldError}`) : undefined}>
          <input
            id={id}
            className="input w-full"
            value={name}
            maxLength={120}
            autoComplete="name"
            aria-invalid={fieldError ? true : undefined}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Button type="submit" disabled={busy}>
          {busy ? t('saving') : t('save')}
        </Button>
      </form>
      <StatusLine status={status} />
    </Section>
  );
}

function EmailSection({ account, apiError }: { account: Account; apiError: ApiErrorText }) {
  const t = useTranslations('settingsPage');
  const id = useId();
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState<AccountFieldError | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setStatus(null);
    const problem = emailError(email, account.email);
    setFieldError(problem);
    if (problem) return;
    setBusy(true);
    try {
      const res = await changeEmail(email.trim());
      setEmail('');
      setStatus({ kind: 'ok', text: t('email.checkInbox', { email: res.email }) });
    } catch (err) {
      setStatus({ kind: 'error', text: apiError(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title={t('email.title')}>
      <p className="text-sm">
        <span className="text-base-content/75">{t('email.current')}: </span>
        <span dir="ltr" className="break-all font-medium">
          {account.email}
        </span>
      </p>
      <form onSubmit={submit} className="space-y-3" noValidate>
        <Field label={t('email.new')} htmlFor={id} error={fieldError ? t(`errors.${fieldError}`) : undefined}>
          <input
            id={id}
            type="email"
            dir="ltr"
            className="input w-full"
            value={email}
            placeholder="you@example.com"
            autoComplete="email"
            aria-invalid={fieldError ? true : undefined}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </Field>
        <Button type="submit" disabled={busy}>
          {busy ? t('saving') : t('email.submit')}
        </Button>
      </form>
      <StatusLine status={status} />
    </Section>
  );
}

function PasswordSection({ apiError }: { apiError: ApiErrorText }) {
  const t = useTranslations('settingsPage');
  const ids = { current: useId(), next: useId(), confirm: useId() };
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fieldError, setFieldError] = useState<{ field: 'current' | 'next' | 'confirm'; error: AccountFieldError } | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setStatus(null);
    if (!current) {
      setFieldError({ field: 'current', error: 'currentRequired' });
      return;
    }
    const problem = newPasswordError(next, confirm, current);
    setFieldError(problem ? { field: problem === 'passwordMismatch' ? 'confirm' : 'next', error: problem } : null);
    if (problem) return;
    setBusy(true);
    try {
      await changePassword(current, next);
      setCurrent('');
      setNext('');
      setConfirm('');
      setStatus({ kind: 'ok', text: t('password.changed') });
    } catch (err) {
      setStatus({ kind: 'error', text: apiError(err) });
    } finally {
      setBusy(false);
    }
  }

  const errorFor = (field: 'current' | 'next' | 'confirm') =>
    fieldError?.field === field ? t(`errors.${fieldError.error}`) : undefined;

  return (
    <Section title={t('password.title')}>
      <form onSubmit={submit} className="space-y-3" noValidate>
        <Field label={t('password.current')} htmlFor={ids.current} error={errorFor('current')}>
          <input id={ids.current} type="password" className="input w-full" value={current} autoComplete="current-password" onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <Field label={t('password.new')} htmlFor={ids.next} hint={t('password.hint')} error={errorFor('next')}>
          <input id={ids.next} type="password" className="input w-full" value={next} autoComplete="new-password" onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Field label={t('password.confirm')} htmlFor={ids.confirm} error={errorFor('confirm')}>
          <input id={ids.confirm} type="password" className="input w-full" value={confirm} autoComplete="new-password" onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <Button type="submit" disabled={busy}>
          {busy ? t('saving') : t('password.submit')}
        </Button>
      </form>
      <StatusLine status={status} />
    </Section>
  );
}

/** Two-step confirm without a modal: the first click asks, the second acts. */
function ConfirmButton({ label, question, confirmLabel, busy, onConfirm }: { label: string; question: string; confirmLabel: string; busy: boolean; onConfirm: () => void }) {
  const t = useTranslations('settingsPage');
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <Button type="button" variant="outline" className="text-error" disabled={busy} onClick={() => setAsking(true)}>
        {label}
      </Button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={question}>
      <span className="text-sm font-medium">{question}</span>
      <Button type="button" className="btn-error" disabled={busy} onClick={onConfirm}>
        {confirmLabel}
      </Button>
      <Button type="button" variant="ghost" disabled={busy} onClick={() => setAsking(false)}>
        {t('cancel')}
      </Button>
    </div>
  );
}

function SessionsSection({ apiError, onDone }: { apiError: ApiErrorText; onDone: () => void }) {
  const t = useTranslations('settingsPage');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  async function run() {
    setBusy(true);
    setStatus(null);
    try {
      await signOutEverywhere();
      onDone();
    } catch (err) {
      setStatus({ kind: 'error', text: apiError(err) });
      setBusy(false);
    }
  }

  return (
    <Section title={t('sessions.title')}>
      <p className="text-sm text-base-content/75">{t('sessions.intro')}</p>
      <div>
        <ConfirmButton label={t('sessions.submit')} question={t('sessions.confirm')} confirmLabel={t('sessions.submit')} busy={busy} onConfirm={() => void run()} />
      </div>
      <StatusLine status={status} />
    </Section>
  );
}

function ClosureSection({ account, apiError, onDone }: { account: Account; apiError: ApiErrorText; onDone: () => void }) {
  const t = useTranslations('settingsPage');
  const locale = useLocale();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  async function run() {
    setBusy(true);
    setStatus(null);
    try {
      await requestAccountClosure();
      onDone();
    } catch (err) {
      setStatus({ kind: 'error', text: apiError(err) });
      setBusy(false);
    }
  }

  return (
    <Section title={t('closure.title')}>
      {account.closureRequestedAt ? (
        <p className="text-sm">{t('closure.requested', { date: new Date(account.closureRequestedAt).toLocaleDateString(locale) })}</p>
      ) : (
        <>
          <p className="text-sm text-base-content/75">{t('closure.intro')}</p>
          <div>
            <ConfirmButton label={t('closure.submit')} question={t('closure.confirm')} confirmLabel={t('closure.confirmYes')} busy={busy} onConfirm={() => void run()} />
          </div>
        </>
      )}
      <StatusLine status={status} />
    </Section>
  );
}
