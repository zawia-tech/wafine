/** Same-origin path to return to after login (e.g. the OAuth consent page). Never an absolute URL. */
export function safeNext(raw: string | null): string | null {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return null;
  return raw;
}
