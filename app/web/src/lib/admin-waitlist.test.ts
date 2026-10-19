import { describe, expect, it } from 'bun:test';
import {
  needsPhone,
  normalizeInvitePhone,
  pageCount,
  resolveInvitePhone,
  WAITLIST_PAGE_SIZE,
  waitlistBadgeClass,
} from './admin-waitlist';

const NUMBER = '+212600000000';

describe('normalizeInvitePhone', () => {
  it('canonicalises separators and a 00 prefix', () => {
    expect(normalizeInvitePhone(' +212 600-000-000 ')).toBe(NUMBER);
    expect(normalizeInvitePhone('00212600000000')).toBe(NUMBER);
    expect(normalizeInvitePhone('+(212) 600.000.000')).toBe('+212600000000');
  });

  it('rejects national, too-short and non-numeric input', () => {
    expect(normalizeInvitePhone('0629000000')).toBeNull();
    expect(normalizeInvitePhone('+21260')).toBeNull();
    expect(normalizeInvitePhone('+212 600 000 000 0000')).toBeNull();
    expect(normalizeInvitePhone('')).toBeNull();
    expect(normalizeInvitePhone('nope')).toBeNull();
  });
});

describe('resolveInvitePhone', () => {
  it('prefers a typed number over the one the lead left', () => {
    expect(resolveInvitePhone({ waNumber: '+212611111111' }, '+212 600 000 000')).toEqual({
      ok: true,
      phone: NUMBER,
      fromEntry: false,
    });
  });

  it('falls back to the number the lead left when the input is blank', () => {
    expect(resolveInvitePhone({ waNumber: '00212600000000' }, '   ')).toEqual({
      ok: true,
      phone: NUMBER,
      fromEntry: true,
    });
  });

  it('flags an unusable typed number instead of silently using the stored one', () => {
    expect(resolveInvitePhone({ waNumber: '+212611111111' }, '0629')).toEqual({ ok: false, error: 'invalid' });
  });

  it('reports a missing number when there is neither input nor a stored one', () => {
    expect(resolveInvitePhone({ waNumber: null }, '')).toEqual({ ok: false, error: 'missing' });
    expect(resolveInvitePhone({ waNumber: '' }, '')).toEqual({ ok: false, error: 'missing' });
  });
});

describe('needsPhone', () => {
  it('is true only when the lead left nothing', () => {
    expect(needsPhone({ waNumber: null })).toBe(true);
    expect(needsPhone({ waNumber: '' })).toBe(true);
    expect(needsPhone({ waNumber: NUMBER })).toBe(false);
  });
});

describe('waitlistBadgeClass', () => {
  it('gives invited and pending distinct tones', () => {
    expect(waitlistBadgeClass('invited')).toBe('badge-success');
    expect(waitlistBadgeClass('pending')).toBe('badge-warning');
    expect(waitlistBadgeClass('rejected')).toBe('badge-error');
    expect(waitlistBadgeClass('removed')).toBe('badge-ghost');
  });
});

describe('pageCount', () => {
  it('rounds up and never reports zero pages', () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(1)).toBe(1);
    expect(pageCount(WAITLIST_PAGE_SIZE)).toBe(1);
    expect(pageCount(WAITLIST_PAGE_SIZE + 1)).toBe(2);
    expect(pageCount(45, 20)).toBe(3);
  });
});
