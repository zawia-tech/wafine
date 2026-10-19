/**
 * Pure helpers for the admin backoffice: field bounds, form validation, settings diffing and
 * display formatting. No React and no fetch, so it is unit-tested directly.
 */

import type { AdminSettings, AdminSettingsPatch, LimitOverride, SendLimits, WorkflowPacing } from './admin-api';

export interface Bounds {
  min: number;
  max: number;
}

/** Field bounds; the BFF validates the same ranges, these only give early feedback. */
export const SEND_LIMIT_BOUNDS: Record<keyof SendLimits, Bounds> = {
  perDay: { min: 1, max: 100_000 },
  perMinute: { min: 1, max: 1_000 },
};

export const WORKFLOW_BOUNDS: Record<keyof WorkflowPacing, Bounds> = {
  minGapMs: { min: 0, max: 600_000 },
  maxPerMinuteSession: { min: 1, max: 120 },
  maxPerMinuteContact: { min: 1, max: 60 },
  backoffMs: { min: 0, max: 86_400_000 },
};

export type ParseResult = { ok: true; value: number } | { ok: false; error: string };

/** Whole number within `bounds`. Rejects blanks, signs, decimals and exponents. */
export function parseIntInRange(raw: string, bounds: Bounds): ParseResult {
  const text = raw.trim();
  if (text === '') return { ok: false, error: 'Required' };
  if (!/^\d+$/.test(text)) return { ok: false, error: 'Whole number only' };
  const value = Number(text);
  if (!Number.isSafeInteger(value) || value < bounds.min || value > bounds.max) {
    return { ok: false, error: `Between ${bounds.min.toLocaleString('en-US')} and ${bounds.max.toLocaleString('en-US')}` };
  }
  return { ok: true, value };
}

/** Like `parseIntInRange`, but a blank field means "no value" (null). */
export function parseOptionalIntInRange(
  raw: string,
  bounds: Bounds,
): { ok: true; value: number | null } | { ok: false; error: string } {
  return raw.trim() === '' ? { ok: true, value: null } : parseIntInRange(raw, bounds);
}

export type FieldErrors<K extends string> = Partial<Record<K, string>>;

export type ValidationResult<T, K extends string> =
  | { ok: true; value: T }
  | { ok: false; errors: FieldErrors<K> };

function validateAll<K extends string>(
  form: Record<K, string>,
  bounds: Record<K, Bounds>,
): ValidationResult<Record<K, number>, K> {
  const value = {} as Record<K, number>;
  const errors: FieldErrors<K> = {};
  for (const key of Object.keys(bounds) as K[]) {
    const r = parseIntInRange(form[key] ?? '', bounds[key]);
    if (r.ok) value[key] = r.value;
    else errors[key] = r.error;
  }
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, value };
}

export type SettingsField = keyof SendLimits | keyof WorkflowPacing;
export type SettingsForm = Record<SettingsField, string>;

export function settingsToForm(s: Pick<AdminSettings, 'sendLimits' | 'workflow'>): SettingsForm {
  return {
    perDay: String(s.sendLimits.perDay),
    perMinute: String(s.sendLimits.perMinute),
    minGapMs: String(s.workflow.minGapMs),
    maxPerMinuteSession: String(s.workflow.maxPerMinuteSession),
    maxPerMinuteContact: String(s.workflow.maxPerMinuteContact),
    backoffMs: String(s.workflow.backoffMs),
  };
}

export function validateSettingsForm(
  form: SettingsForm,
): ValidationResult<{ sendLimits: SendLimits; workflow: WorkflowPacing }, SettingsField> {
  const limits = validateAll<keyof SendLimits>(form, SEND_LIMIT_BOUNDS);
  const workflow = validateAll<keyof WorkflowPacing>(form, WORKFLOW_BOUNDS);
  if (!limits.ok || !workflow.ok) {
    return {
      ok: false,
      errors: { ...(limits.ok ? {} : limits.errors), ...(workflow.ok ? {} : workflow.errors) },
    };
  }
  return { ok: true, value: { sendLimits: limits.value, workflow: workflow.value } };
}

function diffObject<T extends object>(before: T, after: T): Partial<T> | undefined {
  const out: Partial<T> = {};
  for (const key of Object.keys(after) as Array<keyof T>) {
    if (after[key] !== before[key]) out[key] = after[key];
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Only the fields that changed, so a save never overwrites values it did not touch. Null = no change. */
export function diffSettings(
  before: Pick<AdminSettings, 'sendLimits' | 'workflow'>,
  after: Pick<AdminSettings, 'sendLimits' | 'workflow'>,
): AdminSettingsPatch | null {
  const patch: AdminSettingsPatch = {};
  const sendLimits = diffObject(before.sendLimits, after.sendLimits);
  const workflow = diffObject(before.workflow, after.workflow);
  if (sendLimits) patch.sendLimits = sendLimits;
  if (workflow) patch.workflow = workflow;
  return sendLimits || workflow ? patch : null;
}

export interface OverrideForm {
  perDay: string;
  perMinute: string;
}

export function overrideToForm(o: LimitOverride | null): OverrideForm {
  return {
    perDay: o?.perDay == null ? '' : String(o.perDay),
    perMinute: o?.perMinute == null ? '' : String(o.perMinute),
  };
}

/** Blank fields mean "use the global cap"; both blank clears the override. */
export function validateOverrideForm(
  form: OverrideForm,
): ValidationResult<LimitOverride, keyof OverrideForm> {
  const perDay = parseOptionalIntInRange(form.perDay, SEND_LIMIT_BOUNDS.perDay);
  const perMinute = parseOptionalIntInRange(form.perMinute, SEND_LIMIT_BOUNDS.perMinute);
  if (!perDay.ok || !perMinute.ok) {
    const errors: FieldErrors<keyof OverrideForm> = {};
    if (!perDay.ok) errors.perDay = perDay.error;
    if (!perMinute.ok) errors.perMinute = perMinute.error;
    return { ok: false, errors };
  }
  return { ok: true, value: { perDay: perDay.value, perMinute: perMinute.value } };
}

/** "45s", "12m", "3h 5m", "2d 4h". Negative or non-finite input reads as "now". */
export function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return 'now';
  const s = Math.round(totalSeconds);
  const days = Math.floor(s / 86_400);
  const hours = Math.floor((s % 86_400) / 3_600);
  const minutes = Math.floor((s % 3_600) / 60);
  const seconds = s % 60;
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  if (minutes > 0) return seconds > 0 && minutes < 10 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  return `${seconds}s`;
}

/** Milliseconds field hint: "0 ms" → "off", 1500 → "1.5 s", 90000 → "1m 30s". */
export function formatMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return 'off';
  if (ms < 1_000) return `${ms} ms`;
  if (ms < 60_000) return `${Number((ms / 1_000).toFixed(1))} s`;
  return formatDuration(ms / 1_000);
}

/** Share of the daily cap used, clamped to 0..100. A zero cap counts as full. */
export function usagePercent(today: number, cap: number): number {
  if (cap <= 0) return 100;
  return Math.min(100, Math.max(0, Math.round((today / cap) * 100)));
}

export type UsageLevel = 'ok' | 'warn' | 'full';

export function usageLevel(today: number, cap: number): UsageLevel {
  if (cap <= 0 || today >= cap) return 'full';
  return today / cap >= 0.8 ? 'warn' : 'ok';
}

const STATUS_BADGES: Record<string, string> = {
  ready: 'badge-success',
  created: 'badge-ghost',
  initializing: 'badge-info',
  qr_ready: 'badge-info',
  authenticating: 'badge-info',
  disconnected: 'badge-warning',
  action_required: 'badge-warning',
  failed: 'badge-error',
  phone_mismatch: 'badge-error',
};

/** daisyUI badge class for an engine status; unknown or missing statuses stay neutral. */
export function statusBadgeClass(status: string | null): string {
  return (status && STATUS_BADGES[status]) || 'badge-ghost';
}

/** "qr_ready" → "qr ready"; null → "unknown" (engine unreachable or session gone). */
export function statusLabel(status: string | null): string {
  return status ? status.replace(/_/g, ' ') : 'unknown';
}

/** "+212600000000" for display whether or not the source stored the plus. */
export function formatPhone(phone: string | null): string {
  return phone ? `+${phone.replace(/^\+/, '')}` : '—';
}
