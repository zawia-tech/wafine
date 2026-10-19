import { describe, expect, it } from 'bun:test';
import {
  diffSettings,
  formatDuration,
  formatMs,
  formatPhone,
  overrideToForm,
  parseIntInRange,
  parseOptionalIntInRange,
  settingsToForm,
  statusBadgeClass,
  statusLabel,
  usageLevel,
  usagePercent,
  validateOverrideForm,
  validateSettingsForm,
} from './admin-format';

const base = {
  sendLimits: { perDay: 500, perMinute: 10 },
  workflow: { minGapMs: 2000, maxPerMinuteSession: 20, maxPerMinuteContact: 3, backoffMs: 60000 },
};

describe('parseIntInRange', () => {
  const bounds = { min: 1, max: 1000 };

  it('accepts whole numbers inside the bounds, trimming spaces', () => {
    expect(parseIntInRange(' 42 ', bounds)).toEqual({ ok: true, value: 42 });
    expect(parseIntInRange('1', bounds)).toEqual({ ok: true, value: 1 });
    expect(parseIntInRange('1000', bounds)).toEqual({ ok: true, value: 1000 });
  });

  it('rejects blanks, decimals, signs and exponents', () => {
    expect(parseIntInRange('', bounds)).toEqual({ ok: false, error: 'Required' });
    for (const raw of ['1.5', '-3', '+3', '1e3', 'abc']) {
      expect(parseIntInRange(raw, bounds).ok).toBe(false);
    }
  });

  it('rejects values outside the bounds with the range in the message', () => {
    expect(parseIntInRange('0', bounds)).toEqual({ ok: false, error: 'Between 1 and 1,000' });
    expect(parseIntInRange('1001', bounds).ok).toBe(false);
  });

  it('allows zero when the minimum is zero', () => {
    expect(parseIntInRange('0', { min: 0, max: 10 })).toEqual({ ok: true, value: 0 });
  });

  it('treats blank as null only in the optional variant', () => {
    expect(parseOptionalIntInRange('  ', bounds)).toEqual({ ok: true, value: null });
    expect(parseOptionalIntInRange('0', bounds).ok).toBe(false);
  });
});

describe('validateSettingsForm', () => {
  it('round-trips settings through the form', () => {
    const r = validateSettingsForm(settingsToForm(base));
    expect(r).toEqual({ ok: true, value: base });
  });

  it('enforces each field range', () => {
    const r = validateSettingsForm({
      perDay: '100001',
      perMinute: '0',
      minGapMs: '600001',
      maxPerMinuteSession: '121',
      maxPerMinuteContact: '61',
      backoffMs: '86400001',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(Object.keys(r.errors).sort()).toEqual(
        ['backoffMs', 'maxPerMinuteContact', 'maxPerMinuteSession', 'minGapMs', 'perDay', 'perMinute'].sort(),
      );
    }
  });

  it('accepts the documented upper and lower edges', () => {
    const r = validateSettingsForm({
      perDay: '100000',
      perMinute: '1000',
      minGapMs: '0',
      maxPerMinuteSession: '1',
      maxPerMinuteContact: '60',
      backoffMs: '86400000',
    });
    expect(r.ok).toBe(true);
  });
});

describe('diffSettings', () => {
  it('returns null when nothing changed', () => {
    expect(diffSettings(base, structuredClone(base))).toBeNull();
  });

  it('sends only the changed fields of each section', () => {
    const next = structuredClone(base);
    next.sendLimits.perDay = 800;
    next.workflow.backoffMs = 0;
    expect(diffSettings(base, next)).toEqual({ sendLimits: { perDay: 800 }, workflow: { backoffMs: 0 } });
  });

  it('omits an untouched section', () => {
    const next = structuredClone(base);
    next.workflow.maxPerMinuteContact = 5;
    expect(diffSettings(base, next)).toEqual({ workflow: { maxPerMinuteContact: 5 } });
  });
});

describe('validateOverrideForm', () => {
  it('maps blanks to null (use the global cap)', () => {
    expect(validateOverrideForm({ perDay: '', perMinute: '' })).toEqual({
      ok: true,
      value: { perDay: null, perMinute: null },
    });
    expect(validateOverrideForm({ perDay: '50', perMinute: '' })).toEqual({
      ok: true,
      value: { perDay: 50, perMinute: null },
    });
  });

  it('reports per-field errors with the global ranges', () => {
    const r = validateOverrideForm({ perDay: '0', perMinute: '1001' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['perDay', 'perMinute']);
  });

  it('builds the form from an override, null fields becoming blank', () => {
    expect(overrideToForm(null)).toEqual({ perDay: '', perMinute: '' });
    expect(overrideToForm({ perDay: 20, perMinute: null })).toEqual({ perDay: '20', perMinute: '' });
  });
});

describe('formatDuration', () => {
  it('humanises seconds', () => {
    expect(formatDuration(0)).toBe('now');
    expect(formatDuration(-5)).toBe('now');
    expect(formatDuration(Number.NaN)).toBe('now');
    expect(formatDuration(45)).toBe('45s');
    expect(formatDuration(125)).toBe('2m 5s');
    expect(formatDuration(720)).toBe('12m');
    expect(formatDuration(3600)).toBe('1h');
    expect(formatDuration(3 * 3600 + 5 * 60 + 9)).toBe('3h 5m');
    expect(formatDuration(2 * 86400 + 4 * 3600)).toBe('2d 4h');
    expect(formatDuration(86400)).toBe('1d');
  });
});

describe('formatMs', () => {
  it('reads milliseconds as a short human hint', () => {
    expect(formatMs(0)).toBe('off');
    expect(formatMs(250)).toBe('250 ms');
    expect(formatMs(1500)).toBe('1.5 s');
    expect(formatMs(2000)).toBe('2 s');
    expect(formatMs(90_000)).toBe('1m 30s');
    expect(formatMs(86_400_000)).toBe('1d');
  });
});

describe('usage', () => {
  it('computes a clamped percentage', () => {
    expect(usagePercent(0, 100)).toBe(0);
    expect(usagePercent(50, 200)).toBe(25);
    expect(usagePercent(300, 200)).toBe(100);
    expect(usagePercent(1, 0)).toBe(100);
  });

  it('flags the level at 80% and at the cap', () => {
    expect(usageLevel(79, 100)).toBe('ok');
    expect(usageLevel(80, 100)).toBe('warn');
    expect(usageLevel(100, 100)).toBe('full');
    expect(usageLevel(0, 0)).toBe('full');
  });
});

describe('display helpers', () => {
  it('maps engine statuses to badges and labels', () => {
    expect(statusBadgeClass('ready')).toBe('badge-success');
    expect(statusBadgeClass('failed')).toBe('badge-error');
    expect(statusBadgeClass('something_new')).toBe('badge-ghost');
    expect(statusBadgeClass(null)).toBe('badge-ghost');
    expect(statusLabel('qr_ready')).toBe('qr ready');
    expect(statusLabel(null)).toBe('unknown');
  });

  it('formats phones with exactly one plus', () => {
    expect(formatPhone('212600000000')).toBe('+212600000000');
    expect(formatPhone('+212600000000')).toBe('+212600000000');
    expect(formatPhone(null)).toBe('—');
  });
});
