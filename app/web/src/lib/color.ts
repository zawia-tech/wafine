/**
 * Hex → OKLCH helpers.
 *
 * The white-label contract hands us hex strings; `applyTheme()` (src/lib/white-label.ts)
 * converts them to `oklch(<components>)` for the daisyUI 5 role variables (`--color-primary`,
 * `--color-base-100`, …). The component string (`49.12% 0.3096 275.75`) is the format daisyUI 4
 * stored in `--p`; it is kept because wrapping it in `oklch()` gives a valid CSS colour.
 *
 * Only hex is supported because that is what `WhiteLabelTheme` documents. Conversion is
 * sRGB → linear sRGB → OKLab → OKLCH (Björn Ottosson's matrices, as used by CSS Color 4).
 */

/** sRGB → linear-sRGB transfer function. */
function toLinear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

/** Parse `#rgb`, `#rrggbb`, `#rrggbbaa` (alpha ignored) into 0-255 channels, or null. */
export function parseHexColor(hex: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(hex.trim());
  const digits = match?.[1];
  if (!digits) return null;

  const expanded =
    digits.length === 3
      ? digits
          .split('')
          .map((d) => `${d}${d}`)
          .join('')
      : digits.slice(0, 6);

  return [
    Number.parseInt(expanded.slice(0, 2), 16),
    Number.parseInt(expanded.slice(2, 4), 16),
    Number.parseInt(expanded.slice(4, 6), 16),
  ];
}

/** OKLab lightness (0-1) for a hex color, or null when the hex is unparseable. */
export function oklchLightness(hex: string): number | null {
  const rgb = parseHexColor(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((c) => toLinear(c / 255)) as [number, number, number];

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  return 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
}

/** Drop trailing zeros so `100.00` → `100`, `0.30960` → `0.3096`. */
function trim(value: number, decimals: number): string {
  return Number.parseFloat(value.toFixed(decimals)).toString();
}

/**
 * Convert a hex color to OKLCH components (`"49.12% 0.3096 275.75"`), the inside of `oklch()`.
 * Returns null for anything that is not hex, so the caller can keep the theme default.
 */
export function hexToOklchComponents(hex: string): string | null {
  const rgb = parseHexColor(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((c) => toLinear(c / 255)) as [number, number, number];

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;

  const rawChroma = Math.sqrt(a * a + bb * bb);
  // Gray colors leave float residue in a/b, which atan2 turns into a meaningless hue; snap
  // them to a pure neutral so `#ffffff` is `100% 0 0` and not `100% 0 89.88`.
  const chroma = rawChroma < 1e-4 ? 0 : rawChroma;
  const hue = chroma === 0 ? 0 : (Math.atan2(bb, a) * 180) / Math.PI;
  const normalizedHue = hue < 0 ? hue + 360 : hue;

  return `${trim(lightness * 100, 2)}% ${trim(chroma, 4)} ${trim(normalizedHue, 2)}`;
}

/**
 * Component string for text placed *on* the given color (daisyUI's `--color-primary-content`
 * and friends; wrap it in `oklch()`).
 * Light backgrounds get near-black text, dark backgrounds white.
 */
export function readableContentComponents(background: string): string {
  const lightness = oklchLightness(background);
  return lightness !== null && lightness > 0.7
    ? (hexToOklchComponents('#0b1220') ?? '0% 0 0')
    : (hexToOklchComponents('#ffffff') ?? '100% 0 0');
}
