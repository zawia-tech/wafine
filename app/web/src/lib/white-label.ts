/**
 * White-label theme configuration.
 * In production, this is fetched from the BFF's /api/tenants/[slug]/theme endpoint.
 * For now, we use a default theme.
 */

import { hexToOklchComponents, readableContentComponents } from './color';

export interface WhiteLabelTheme {
  tenantId: string;
  slug: string;
  logoUrl: string | null;
  primaryColor: string;
  fontFamily: string;
  /** Optional: the BFF theme endpoint does not expose these yet. */
  surfaceColor?: string;
  surfaceAltColor?: string;
  textColor?: string;
  textMutedColor?: string;
  borderColor?: string;
  customCss: string | null;
}

export const defaultTheme: WhiteLabelTheme = {
  tenantId: 'default',
  slug: 'default',
  logoUrl: null,
  primaryColor: '#1c5c42',
  fontFamily: 'Inter, system-ui, sans-serif',
  surfaceColor: '#fcfaf6',
  surfaceAltColor: '#f4efe6',
  textColor: '#1a211d',
  textMutedColor: '#5b6560',
  borderColor: '#e3dbcc',
  customCss: null,
};

/**
 * daisyUI 5 role variables applyTheme() writes, keyed by the WhiteLabelTheme field they come
 * from. daisyUI 4 used short component variables (`--p`, `--pc`, `--b1`, `--b2`, `--bc`)
 * holding bare OKLCH components; daisyUI 5 renamed them to `--color-*` holding full colours.
 * The role names (primary, base-100, base-200, base-content) are unchanged.
 */
export const DAISY_ROLE_VARS = {
  primary: '--color-primary',
  primaryContent: '--color-primary-content',
  surface: '--color-base-100',
  surfaceAlt: '--color-base-200',
  border: '--color-base-300',
  text: '--color-base-content',
} as const;

/** `oklch(L C H)` for a hex colour, or null when it is not hex (the theme default then stays). */
function hexToOklch(hex: string): string | null {
  const components = hexToOklchComponents(hex);
  return components ? `oklch(${components})` : null;
}

/**
 * Apply a white-label theme to the document.
 * Sets CSS custom properties on the root element.
 *
 * Two sets of variables are written:
 *  - the WaFine tokens (`--wl-primary-color`, `--color-text-muted`, …) that back the focus
 *    ring and white-label utilities (src/styles/globals.css). Surface aliases reference the
 *    daisyUI base roles directly, so those roles are the only surface values written here;
 *  - daisyUI's own role variables (DAISY_ROLE_VARS), so components and the `primary`/`base-*`
 *    utilities follow the tenant too. Hex input is converted to `oklch()` (a hex without its
 *    leading `#` is accepted too, as it always was).
 *
 * The tenant palette is opaque and mode-agnostic, so these land on `documentElement` and win
 * over whichever theme (`wafine-light`/`wafine-dark`) is active — the same behavior the surface
 * tokens already had. `base-300`, `neutral` and the status roles stay theme-driven.
 *
 * The daisyUI theme names and the storage key were renamed in the WaFine rebrand, then the
 * light theme was renamed again (`wafine` → `wafine-light`) in the brand pass. The remap in
 * `src/lib/theme-storage.ts` maps any cached older value onto the current names once, so an
 * old light/dark choice survives instead of silently resetting.
 */
export function applyTheme(theme: WhiteLabelTheme): void {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  root.style.setProperty('--wl-primary-color', theme.primaryColor);
  root.style.setProperty('--font-family', theme.fontFamily);

  // daisyUI roles: primary (with a readable foreground) and the surface/content trio.
  const primary = hexToOklch(theme.primaryColor);
  if (primary) {
    root.style.setProperty(DAISY_ROLE_VARS.primary, primary);
    root.style.setProperty(DAISY_ROLE_VARS.primaryContent, `oklch(${readableContentComponents(theme.primaryColor)})`);
  }
  const roles: Array<[role: string, hex: string | undefined]> = [
    [DAISY_ROLE_VARS.surface, theme.surfaceColor],
    [DAISY_ROLE_VARS.surfaceAlt, theme.surfaceAltColor],
    [DAISY_ROLE_VARS.border, theme.borderColor],
    [DAISY_ROLE_VARS.text, theme.textColor],
  ];
  for (const [role, hex] of roles) {
    if (hex === undefined) continue;
    const color = hexToOklch(hex);
    if (color) root.style.setProperty(role, color);
  }

  // WaFine text tokens. Surface aliases point directly to daisyUI roles in globals.css.
  const optional: Array<[prop: string, value: string | undefined]> = [
    ['--color-text-muted', theme.textMutedColor],
  ];
  for (const [prop, value] of optional) {
    if (value !== undefined) root.style.setProperty(prop, value);
  }

  if (theme.customCss) {
    const style = document.createElement('style');
    style.textContent = theme.customCss;
    document.head.appendChild(style);
  }
}
