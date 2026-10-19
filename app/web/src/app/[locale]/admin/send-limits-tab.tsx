'use client';

import { useEffect, useState } from 'react';
import { getAdminSettings, updateAdminSettings, type AdminSettings } from '@/lib/admin-api';
import {
  SEND_LIMIT_BOUNDS,
  WORKFLOW_BOUNDS,
  diffSettings,
  formatMs,
  parseIntInRange,
  settingsToForm,
  validateSettingsForm,
  type Bounds,
  type FieldErrors,
  type SettingsField,
  type SettingsForm,
} from '@/lib/admin-format';

const COUNTING_NOTE =
  'Counts only messages sent through the API, MCP (Claude) and auto-replies. Messages typed on the phone or WhatsApp Web never count.';

interface FieldSpec {
  key: SettingsField;
  label: string;
  help: string;
  bounds: Bounds;
  /** Show a "= 2 s" style hint under millisecond fields. */
  ms?: boolean;
}

const LIMIT_FIELDS: FieldSpec[] = [
  { key: 'perDay', label: 'Messages per day', help: 'Per session, resets daily.', bounds: SEND_LIMIT_BOUNDS.perDay },
  { key: 'perMinute', label: 'Messages per minute', help: 'Per session, burst cap.', bounds: SEND_LIMIT_BOUNDS.perMinute },
];

const WORKFLOW_FIELDS: FieldSpec[] = [
  {
    key: 'minGapMs',
    label: 'Minimum gap between replies (ms)',
    help: 'Wait at least this long between two auto-replies from one session. 0 = no gap.',
    bounds: WORKFLOW_BOUNDS.minGapMs,
    ms: true,
  },
  {
    key: 'maxPerMinuteSession',
    label: 'Max replies per minute, per session',
    help: 'Across all contacts of one number.',
    bounds: WORKFLOW_BOUNDS.maxPerMinuteSession,
  },
  {
    key: 'maxPerMinuteContact',
    label: 'Max replies per minute, per contact',
    help: 'To one chat.',
    bounds: WORKFLOW_BOUNDS.maxPerMinuteContact,
  },
  {
    key: 'backoffMs',
    label: 'Back-off after a limit is hit (ms)',
    help: 'Pause auto-replies for this long once a pacing limit trips. 0 = no pause.',
    bounds: WORKFLOW_BOUNDS.backoffMs,
    ms: true,
  },
];

export function SendLimitsTab({ canManage }: { canManage: boolean }) {
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [form, setForm] = useState<SettingsForm | null>(null);
  const [errors, setErrors] = useState<FieldErrors<SettingsField>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  function apply(s: AdminSettings) {
    setSettings(s);
    setForm(settingsToForm(s));
    setErrors({});
  }

  useEffect(() => {
    getAdminSettings()
      .then(apply)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'));
  }, []);

  function onChange(key: SettingsField, value: string) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
    setSaved(null);
    // Clear a field's error as soon as it becomes valid; new errors wait for submit.
    if (errors[key]) {
      const spec = [...LIMIT_FIELDS, ...WORKFLOW_FIELDS].find((f) => f.key === key);
      if (spec && parseIntInRange(value, spec.bounds).ok) {
        setErrors((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      }
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form || !settings) return;
    setError(null);
    setSaved(null);
    const result = validateSettingsForm(form);
    if (!result.ok) {
      setErrors(result.errors);
      const first = Object.keys(result.errors)[0];
      if (first) document.getElementById(`limits-${first}`)?.focus();
      return;
    }
    setErrors({});
    const patch = diffSettings(settings, result.value);
    if (!patch) {
      setSaved('No changes to save.');
      return;
    }
    setBusy(true);
    try {
      apply(await updateAdminSettings(patch));
      setSaved('Saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }

  if (!form || !settings) {
    return error ? (
      <div role="alert" className="alert alert-error">
        <span>{error}</span>
      </div>
    ) : (
      <p className="flex items-center gap-2 text-base-content/75">
        <span className="loading loading-spinner loading-sm" />
        Loading…
      </p>
    );
  }

  const pristine = settingsToForm(settings);
  const dirty = (Object.keys(pristine) as SettingsField[]).some((k) => pristine[k] !== form[k].trim());

  function field(spec: FieldSpec) {
    const id = `limits-${spec.key}`;
    const err = errors[spec.key];
    const raw = form?.[spec.key] ?? '';
    const parsed = parseIntInRange(raw, spec.bounds);
    return (
      <div key={spec.key} className="flex w-full flex-col">
        <label htmlFor={id} className="flex select-none items-center justify-between px-1 pt-2 pb-1">
          <span className="text-sm font-medium text-base-content">{spec.label}</span>
        </label>
        <input
          id={id}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          readOnly={!canManage}
          value={raw}
          onChange={(e) => onChange(spec.key, e.target.value)}
          aria-invalid={err ? true : undefined}
          aria-describedby={`${id}-help${err ? ` ${id}-err` : ''}`}
          className={`input w-full ${err ? 'input-error' : ''}`}
        />
        <p id={`${id}-help`} className="mt-1 text-xs text-base-content/75">
          {spec.help} {spec.bounds.min.toLocaleString('en-US')}–{spec.bounds.max.toLocaleString('en-US')}
          {spec.ms && parsed.ok ? ` · ${formatMs(parsed.value)}` : ''}
        </p>
        {err && (
          <p id={`${id}-err`} className="mt-1 text-xs text-error">
            {err}
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <h2 className="mb-1 text-xl font-bold">Send limits</h2>
      <p className="mb-4 text-sm text-base-content/75">{COUNTING_NOTE}</p>

      {error && (
        <div role="alert" className="alert alert-error mb-4">
          <span>{error}</span>
        </div>
      )}

      <section aria-labelledby="limits-caps-title" className="card mb-4 border border-base-300 bg-base-100">
        <div className="card-body gap-3">
          <h3 id="limits-caps-title" className="card-title text-lg">
            Global API send caps
          </h3>
          <p className="text-sm text-base-content/75">
            Default for every session. Override one session in Sessions &amp; usage.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">{LIMIT_FIELDS.map(field)}</div>
        </div>
      </section>

      <section aria-labelledby="limits-pacing-title" className="card mb-4 border border-base-300 bg-base-100">
        <div className="card-body gap-3">
          <h3 id="limits-pacing-title" className="card-title text-lg">
            Auto-reply pacing
          </h3>
          <p className="text-sm text-base-content/75">
            Applies to workflow auto-replies on top of the caps above, to keep numbers human-paced.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">{WORKFLOW_FIELDS.map(field)}</div>
        </div>
      </section>

      {canManage ? <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <button type="submit" disabled={busy || !dirty} className="btn btn-primary w-full sm:w-auto">
          {busy && <span className="loading loading-spinner loading-sm" />}
          Save changes
        </button>
        <button
          type="button"
          disabled={busy || !dirty}
          onClick={() => {
            setForm(settingsToForm(settings));
            setErrors({});
            setSaved(null);
          }}
          className="btn btn-ghost w-full sm:w-auto"
        >
          Reset
        </button>
        <span role="status" className="text-sm text-base-content/75">
          {saved}
        </span>
      </div> : <p className="text-sm text-base-content/70">Read-only access</p>}
      {settings.updatedAt && (
        <p className="mt-3 text-xs text-base-content/75">
          Last changed {new Date(settings.updatedAt).toLocaleString()}
          {settings.updatedBy ? ` by ${settings.updatedBy}` : ''}
        </p>
      )}
    </form>
  );
}
