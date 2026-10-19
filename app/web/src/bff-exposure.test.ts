import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
import { proxy } from './proxy';

const webRoot = join(import.meta.dirname, '..');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe('BFF address stays server-only', () => {
  it('is absent from the built client bundle (run `next build` with BFF_URL set to enable)', () => {
    const bffUrl = process.env['BFF_URL'];
    const staticDir = join(webRoot, '.next', 'static');
    if (!bffUrl || !existsSync(staticDir)) return;
    const host = new URL(bffUrl).host;
    for (const f of walk(staticDir)) {
      const text = readFileSync(f, 'utf8');
      expect(text.includes(host)).toBe(false);
      expect(text.includes('localhost:4000')).toBe(false);
    }
  });

  it('keeps CSP connect-src at self only, whatever BFF_URL says', () => {
    process.env['BFF_URL'] = 'https://bff.internal.example';
    const res = proxy(new NextRequest('https://wa.example.com/'));
    const csp = res.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("connect-src 'self';");
    expect(csp).not.toContain('bff.internal.example');
    // PR 15's nonce policy is untouched.
    expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic' 'wasm-unsafe-eval'/);
    delete process.env['BFF_URL'];
  });
});
