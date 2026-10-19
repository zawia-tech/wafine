import { afterEach, describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hexToOklchComponents } from './color';
import { applyTheme, DAISY_ROLE_VARS, defaultTheme, type WhiteLabelTheme } from './white-label';

/** Just enough of `document` for applyTheme(): a root style map and a <head>. */
function fakeDocument() {
  const props = new Map<string, string>();
  const appended: Array<{ textContent: string }> = [];
  return {
    props,
    appended,
    documentElement: { style: { setProperty: (name: string, value: string) => props.set(name, value) } },
    head: { appendChild: (el: { textContent: string }) => appended.push(el) },
    createElement: () => ({ textContent: '' }),
  };
}

function withDocument(run: (doc: ReturnType<typeof fakeDocument>) => void) {
  const doc = fakeDocument();
  (globalThis as { document?: unknown }).document = doc;
  run(doc);
}

afterEach(() => {
  delete (globalThis as { document?: unknown }).document;
});

const tenant: WhiteLabelTheme = {
  ...defaultTheme,
  tenantId: 't1',
  slug: 'acme',
  primaryColor: '#1a73e8',
  surfaceColor: '#ffffff',
  surfaceAltColor: '#f1f3f4',
  textColor: '#202124',
  textMutedColor: '#5f6368',
  borderColor: '#dadce0',
};

describe('applyTheme', () => {
  it('writes the daisyUI 5 role variables as oklch() colours', () => {
    withDocument((doc) => {
      applyTheme(tenant);
      for (const name of Object.values(DAISY_ROLE_VARS)) {
        expect(doc.props.get(name)).toMatch(/^oklch\([\d.]+% [\d.]+ [\d.]+\)$/);
      }
      expect(doc.props.get('--color-primary')).toBe(`oklch(${hexToOklchComponents('#1a73e8')})`);
      // White text on a mid blue.
      expect(doc.props.get('--color-primary-content')).toBe('oklch(100% 0 0)');
      expect(doc.props.get('--color-base-100')).toBe('oklch(100% 0 0)');
    });
  });

  it('no longer writes the daisyUI 4 short variables', () => {
    withDocument((doc) => {
      applyTheme(tenant);
      for (const legacy of ['--p', '--pc', '--b1', '--b2', '--bc']) expect(doc.props.has(legacy)).toBe(false);
    });
  });

  it('keeps the WaFine tokens: brand colour, font and text aliases', () => {
    withDocument((doc) => {
      applyTheme(tenant);
      expect(doc.props.get('--wl-primary-color')).toBe('#1a73e8');
      expect(doc.props.get('--font-family')).toBe(tenant.fontFamily);
      expect(doc.props.has('--color-surface')).toBe(false);
      expect(doc.props.has('--color-surface-alt')).toBe(false);
      expect(doc.props.has('--color-text')).toBe(false);
      expect(doc.props.get('--color-text-muted')).toBe('#5f6368');
      expect(doc.props.get('--color-base-300')).toBe(`oklch(${hexToOklchComponents('#dadce0')})`);
    });
  });

  it('leaves the theme default in place for non-hex or missing colours', () => {
    withDocument((doc) => {
      applyTheme({ ...tenant, primaryColor: 'tomato', surfaceColor: undefined, textColor: undefined });
      expect(doc.props.has('--color-primary')).toBe(false);
      expect(doc.props.has('--color-primary-content')).toBe(false);
      expect(doc.props.has('--color-base-100')).toBe(false);
      expect(doc.props.has('--color-base-content')).toBe(false);
      expect(doc.props.get('--color-base-200')).toMatch(/^oklch\(/);
    });
  });

  it('dark text on a light tenant primary', () => {
    withDocument((doc) => {
      applyTheme({ ...tenant, primaryColor: '#ffd400' });
      expect(doc.props.get('--color-primary-content')).not.toBe('oklch(100% 0 0)');
    });
  });

  it('appends custom CSS when given', () => {
    withDocument((doc) => {
      applyTheme({ ...tenant, customCss: '.x{color:red}' });
      expect(doc.appended.map((el) => el.textContent)).toEqual(['.x{color:red}']);
    });
  });

  it('is a no-op without a document (server render)', () => {
    expect(() => applyTheme(tenant)).not.toThrow();
  });
});

describe('white-label contract with the stylesheet', () => {
  const css = readFileSync(join(import.meta.dirname, '..', 'styles', 'globals.css'), 'utf8');
  const themeBlock = (name: string) => {
    const start = css.indexOf(`name: '${name}';`);
    expect(start).toBeGreaterThan(-1);
    return css.slice(start, css.indexOf('}', start));
  };

  it('every role variable applyTheme writes is defined by both daisyUI themes', () => {
    for (const theme of ['wafine-light', 'wafine-dark']) {
      const block = themeBlock(theme);
      for (const name of Object.values(DAISY_ROLE_VARS)) expect(block).toContain(`${name}:`);
    }
  });

  it('the WaFine tokens applyTheme writes exist in the stylesheet', () => {
    for (const name of ['--wl-primary-color', '--font-family', '--color-text-muted']) {
      expect(css).toContain(`${name}:`);
    }
    expect(css).toContain('--color-surface: var(--color-base-100)');
    expect(css).toContain('--color-surface-alt: var(--color-base-200)');
    expect(css).toContain('--color-border: var(--color-base-300)');
  });
});
