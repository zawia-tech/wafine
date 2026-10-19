import { describe, it, expect } from 'bun:test';
import { zeroize } from './lib/crypto';

describe('zeroize export', () => {
  it('exports zeroize and zeros buffer', () => {
    const buf = new Uint8Array([1,2,3,4]);
    zeroize(buf);
    expect(buf.every(b=>b===0)).toBe(true);
  });
});
