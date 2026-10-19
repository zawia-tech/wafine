/**
 * WhatsApp phone numbers in E.164 form (`+` then 7–15 digits, first digit non-zero).
 * The allowlist, the user→number binding and the later QR-link check all compare
 * the canonical form produced here.
 */

const E164 = /^\+[1-9]\d{6,14}$/;

/**
 * Canonicalise user input to E.164, or return null if it is not an international number.
 * Accepts spaces, dots, dashes and parentheses as separators and a `00` international prefix.
 * National formats (`0629…`) are rejected: without a country they are ambiguous.
 */
export function normalizeE164(input: string): string | null {
  const stripped = input.trim().replace(/[\s.\-()]/g, '');
  const withPlus = stripped.startsWith('00') ? `+${stripped.slice(2)}` : stripped;
  return E164.test(withPlus) ? withPlus : null;
}
