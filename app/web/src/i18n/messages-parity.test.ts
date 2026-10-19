import { describe, expect, test } from 'bun:test';
import en from '../../messages/en.json';
import fr from '../../messages/fr.json';
import ar from '../../messages/ar.json';

/** Every leaf key path under `node`, e.g. `signup.intro`. */
function leafKeys(node: unknown, prefix = ''): string[] {
  if (node === null || typeof node !== 'object') return [prefix];
  return Object.entries(node as Record<string, unknown>).flatMap(([key, value]) =>
    leafKeys(value, prefix ? `${prefix}.${key}` : key),
  );
}

/** Namespaces rendered on the auth and signed-in user pages; a missing key there shows English. */
const NAMESPACES = ['auth', 'appNav', 'whatsappPage', 'messagesPage', 'common'] as const;

describe('message catalog parity', () => {
  for (const ns of NAMESPACES) {
    const expected = leafKeys(en[ns]).sort();
    for (const [locale, catalog] of [
      ['fr', fr],
      ['ar', ar],
    ] as const) {
      test(`${locale}.json has every ${ns} key from en.json`, () => {
        expect(leafKeys(catalog[ns]).sort()).toEqual(expected);
      });

      test(`${locale}.json ${ns} strings are non-empty and keep the placeholders`, () => {
        const enFlat = flatten(en[ns]);
        const flat = flatten(catalog[ns]);
        for (const [key, enValue] of Object.entries(enFlat)) {
          expect(flat[key]?.trim().length ?? 0).toBeGreaterThan(0);
          expect(placeholders(flat[key] ?? '')).toEqual(placeholders(enValue));
        }
      });
    }
  }
});

function flatten(node: unknown, prefix = '', out: Record<string, string> = {}): Record<string, string> {
  if (typeof node === 'string') out[prefix] = node;
  else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) flatten(value, prefix ? `${prefix}.${key}` : key, out);
  }
  return out;
}

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
