import { describe, it, expect } from 'bun:test';
import { normalizeE164 } from './phone.js';

describe('normalizeE164', () => {
  it('accepts canonical E.164', () => {
    expect(normalizeE164('+212600000042')).toBe('+212600000042');
  });

  it('strips separators and the 00 prefix', () => {
    expect(normalizeE164(' +212 (600) 00-00.42 ')).toBe('+212600000042');
    expect(normalizeE164('00212600000042')).toBe('+212600000042');
  });

  it('rejects national, short, long and non-numeric input', () => {
    expect(normalizeE164('0600000042')).toBeNull();
    expect(normalizeE164('+12345')).toBeNull();
    expect(normalizeE164('+1234567890123456')).toBeNull();
    expect(normalizeE164('+0212600000042')).toBeNull();
    expect(normalizeE164('+21262914467a')).toBeNull();
    expect(normalizeE164('')).toBeNull();
  });
});
