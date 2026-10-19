/**
 * Pure helpers behind the admin waitlist tab: which number to invite and how to read a page.
 *
 * Kept free of React and fetch so the invite rules are unit-tested directly; the tab in
 * app/[locale]/admin/waitlist-tab.tsx only renders what these return.
 */

import type { WaitlistEntry, WaitlistStatus } from './bff';

/** One screen of leads per request; matches the BFF's default. */
export const WAITLIST_PAGE_SIZE = 20;

/** A lead that left no number cannot be invited until the admin types one. */
export function needsPhone(entry: Pick<WaitlistEntry, 'waNumber'>): boolean {
  return !entry.waNumber;
}

/**
 * Canonical form of a typed number, mirroring the BFF's parsePhone
 * (app/bff/src/domain/value-objects/phone.ts): strip separators, 00 → +, then
 * require + and 7–15 digits. Returns null when it is not a usable number.
 */
export function normalizeInvitePhone(raw: string): string | null {
  const stripped = raw.trim().replace(/[\s.\-()]/g, '');
  const withPlus = stripped.startsWith('00') ? `+${stripped.slice(2)}` : stripped;
  return /^\+[1-9]\d{6,14}$/.test(withPlus) ? withPlus : null;
}

export type InvitePhone =
  | { ok: true; phone: string; fromEntry: boolean }
  | { ok: false; error: 'missing' | 'invalid' };

/**
 * The number to send with the invite: a typed one wins over the one the lead left, and an
 * empty input falls back to it. `invalid` means the admin typed something unusable.
 */
export function resolveInvitePhone(entry: Pick<WaitlistEntry, 'waNumber'>, input: string): InvitePhone {
  if (input.trim() !== '') {
    const phone = normalizeInvitePhone(input);
    return phone ? { ok: true, phone, fromEntry: false } : { ok: false, error: 'invalid' };
  }
  const stored = entry.waNumber ? normalizeInvitePhone(entry.waNumber) : null;
  return stored ? { ok: true, phone: stored, fromEntry: true } : { ok: false, error: 'missing' };
}

/** daisyUI badge tone for a waitlist status, so pending and invited read differently. */
export function waitlistBadgeClass(status: WaitlistStatus): string {
  return { pending: 'badge-warning', invited: 'badge-success', rejected: 'badge-error', removed: 'badge-ghost' }[status];
}

/** Total pages for a total/limit pair; never below 1 so the pager shows "1 of 1" when empty. */
export function pageCount(total: number, limit: number = WAITLIST_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / Math.max(1, limit)));
}
