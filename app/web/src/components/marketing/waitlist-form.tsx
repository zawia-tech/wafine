'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ApiError, joinWaitlist } from '@/lib/bff';
import { waitlistAttribution } from '@/lib/waitlist-attribution';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';

type Status = 'idle' | 'submitting' | 'success';

/**
 * Waitlist form — email required, WhatsApp number and the note optional, language chosen from
 * a select. Posts straight through the same-origin BFF proxy (`/api/bff/waitlist`).
 *
 * The API answers 201 whether the address is new or already on the list, so the client shows
 * the same confirmation either way and never leaks who is signed up.
 */
export function WaitlistForm() {
  const t = useTranslations('waitlist');
  const locale = useLocale();
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    setStatus('submitting');
    setError('');
    try {
      await joinWaitlist({
        email: String(data.get('email') ?? ''),
        waNumber: String(data.get('waNumber') ?? ''),
        useCase: String(data.get('useCase') ?? ''),
        locale: String(data.get('locale') ?? 'en'),
        ...waitlistAttribution(window.location.search),
      });
      form.reset();
      setStatus('success');
    } catch (err) {
      // 4xx bodies carry a message meant for the user (bad phone format, rate limit).
      const message =
        err instanceof ApiError && err.status < 500 && err.message ? err.message : t('error');
      setError(message);
      setStatus('idle');
    }
  }

  if (status === 'success') {
    return (
      <Alert role="status" variant="success">
        {t('success')}
      </Alert>
    );
  }

  const submitting = status === 'submitting';

  return (
    <form onSubmit={submit} aria-busy={submitting} className="space-y-4">
      <Field label={t('fields.email.label')} htmlFor="waitlist-email" hint={t('fields.email.hint')}>
        <input
          id="waitlist-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          maxLength={254}
          className="input w-full"
        />
      </Field>

      <Field label={t('fields.waNumber.label')} htmlFor="waitlist-wa-number" hint={t('fields.waNumber.hint')}>
          <input
            id="waitlist-wa-number"
            name="waNumber"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            maxLength={40}
            className="input w-full"
          />
      </Field>

      <Field label={t('fields.useCase.label')} htmlFor="waitlist-use-case" hint={t('fields.useCase.hint')}>
          <textarea
            id="waitlist-use-case"
            name="useCase"
            rows={3}
            maxLength={500}
            className="textarea w-full"
          />
      </Field>

      <Field label={t('fields.locale.label')} htmlFor="waitlist-locale" hint={t('fields.locale.hint')}>
          <select
            id="waitlist-locale"
            name="locale"
            defaultValue={locale}
            className="select w-full"
          >
            {(['en', 'fr', 'ar'] as const).map((option) => (
              <option key={option} value={option}>
                {t(`localeOptions.${option}`)}
              </option>
            ))}
          </select>
      </Field>

      {error && (
        <Alert role="alert" variant="error">
          {error}
        </Alert>
      )}

      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? t('submitting') : t('submit')}
      </Button>
      <p className="text-xs text-base-content/75">{t('privacyNote')}</p>
    </form>
  );
}
