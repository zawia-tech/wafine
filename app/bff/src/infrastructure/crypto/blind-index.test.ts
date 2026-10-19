import { describe, it, expect } from 'bun:test';
import { HmacBlindIndexService } from './blind-index.js';

describe('HmacBlindIndexService', () => {
  const service = new HmacBlindIndexService();
  const key = new Uint8Array(32).fill(42);

  it('produces deterministic indexes for the same input', () => {
    const a = service.computeIndex('+212612345678', key, 'phone');
    const b = service.computeIndex('+212612345678', key, 'phone');
    expect(a).toEqual(b);
  });

  it('normalizes phone numbers before indexing', () => {
    const a = service.computeIndex(service.normalize('+212 612 345 678'), key, 'phone');
    const b = service.computeIndex(service.normalize('+212612345678'), key, 'phone');
    expect(a).toEqual(b);
  });

  it('is sensitive to the key', () => {
    const k1 = new Uint8Array(32).fill(1);
    const k2 = new Uint8Array(32).fill(2);
    const a = service.computeIndex('+212612345678', k1, 'phone');
    const b = service.computeIndex('+212612345678', k2, 'phone');
    expect(a).not.toEqual(b);
  });

  it('is sensitive to the column context', () => {
    const a = service.computeIndex('+212612345678', key, 'phone');
    const b = service.computeIndex('+212612345678', key, 'jid');
    expect(a).not.toEqual(b);
  });

  it('is sensitive to the value', () => {
    const a = service.computeIndex('+212612345678', key, 'phone');
    const b = service.computeIndex('+212699999999', key, 'phone');
    expect(a).not.toEqual(b);
  });

  it('truncates to 16 bytes (128 bits)', () => {
    const idx = service.computeIndex('+212612345678', key, 'phone');
    expect(idx.length).toBe(16);
  });
});
