import { describe, it, expect } from 'bun:test';
import { randomBytes } from 'node:crypto';
import { SecretBox } from './secret-box.js';

const box = new SecretBox(randomBytes(32).toString('base64'));

describe('SecretBox', () => {
  it('round-trips a secret bound to its aad', () => {
    expect(box.open(box.seal('openwa-key', 'grant:1'), 'grant:1')).toBe('openwa-key');
  });

  it('rejects a box opened with another aad', () => {
    expect(() => box.open(box.seal('openwa-key', 'grant:1'), 'grant:2')).toThrow();
  });

  it('rejects a truncated authentication tag', () => {
    const [v, iv, tag, ct] = box.seal('openwa-key', 'grant:1').split('.');
    const short = Buffer.from(tag!, 'base64url').subarray(0, 4).toString('base64url');
    expect(() => box.open([v, iv, short, ct].join('.'), 'grant:1')).toThrow('unsupported sealed secret');
  });

  it('rejects a wrong-length iv', () => {
    const [v, , tag, ct] = box.seal('openwa-key', 'grant:1').split('.');
    expect(() => box.open([v, randomBytes(8).toString('base64url'), tag, ct].join('.'), 'grant:1')).toThrow(
      'unsupported sealed secret',
    );
  });

  it('rejects a key that is not 32 bytes', () => {
    expect(() => new SecretBox(randomBytes(16).toString('base64'))).toThrow();
  });
});
