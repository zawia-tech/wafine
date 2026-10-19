/** Read only the supported, bounded campaign tags from the current landing-page URL. */
export function waitlistAttribution(search: string): {
  ref?: string;
  utm_source?: string;
  utm_campaign?: string;
} {
  const params = new URLSearchParams(search);
  const result: { ref?: string; utm_source?: string; utm_campaign?: string } = {};
  for (const key of ['ref', 'utm_source', 'utm_campaign'] as const) {
    const value = params.get(key);
    const normalized = value?.toLowerCase();
    if (normalized !== undefined && normalized.length <= 64 && /^[a-z0-9_-]+$/.test(normalized)) {
      result[key] = normalized;
    }
  }
  return result;
}
