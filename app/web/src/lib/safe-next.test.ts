import { describe, expect, it } from 'bun:test';
import { safeNext } from './safe-next';

describe('safeNext', () => {
  it('keeps same-origin paths', () => {
    expect(safeNext('/oauth/consent?request=abc')).toBe('/oauth/consent?request=abc');
  });
  it('rejects absolute and protocol-relative targets', () => {
    for (const bad of [null, '', 'https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)']) {
      expect(safeNext(bad)).toBeNull();
    }
  });
});
