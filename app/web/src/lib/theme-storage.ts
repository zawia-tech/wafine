/**
 * Persisted light/dark choice — the value behind `data-theme` on <html>.
 *
 * Kept out of the provider so the read/write rules and the one-time pre-rebrand
 * migration are testable without React or a DOM.
 */

export type Theme = 'wafine-light' | 'wafine-dark';

export const STORAGE_KEY = 'wafine_theme';

/** Pre-rebrand key; migrated once on first read, then deleted. */
const LEGACY_STORAGE_KEY = 'waasel_theme';

/**
 * Theme names older keys could still hold, mapped onto today's names.
 * `wafine` (the light theme before the brand pass) is included so a stored
 * pre-rename value keeps working instead of silently falling back to light.
 */
const REMAP: Record<string, Theme> = {
  openwa: 'wafine-light',
  'openwa-dark': 'wafine-dark',
  wafine: 'wafine-light',
};

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function defaultStorage(): StorageLike | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined; // touching the getter itself throws (sandboxed frame, blocked storage)
  }
}

function isTheme(value: string): value is Theme {
  return value === 'wafine-light' || value === 'wafine-dark';
}

/**
 * The user's stored choice, or null when they never picked one (or storage is
 * unavailable), so the caller falls back to the OS setting.
 *
 * Older values are remapped in place: the pre-rebrand `waasel_theme` key (dropped
 * once read), and the pre-rename light name `wafine` under the current key.
 */
export function readStoredTheme(storage?: StorageLike): Theme | null {
  const store = storage ?? defaultStorage();
  if (!store) return null;
  try {
    const stored = store.getItem(STORAGE_KEY);
    if (stored !== null && stored !== '') {
      if (isTheme(stored)) return stored;
      const remapped = REMAP[stored];
      if (!remapped) return null;
      try {
        store.setItem(STORAGE_KEY, remapped);
      } catch {
        // storage full or write-blocked: the remapped choice still applies this page view
      }
      return remapped;
    }

    const legacy = store.getItem(LEGACY_STORAGE_KEY);
    if (legacy === null) return null;
    store.removeItem(LEGACY_STORAGE_KEY);
    const migrated = legacy === '' ? undefined : REMAP[legacy];
    if (!migrated) return null;
    try {
      store.setItem(STORAGE_KEY, migrated);
    } catch {
      // storage full or write-blocked: the choice still applies to this page view
    }
    return migrated;
  } catch {
    return null; // storage unavailable (private mode, blocked): fall back to the system setting
  }
}

/** Persist the user's choice; a write failure keeps the choice for this page view only. */
export function writeStoredTheme(theme: Theme, storage?: StorageLike): void {
  const store = storage ?? defaultStorage();
  if (!store) return;
  try {
    store.setItem(STORAGE_KEY, theme);
  } catch {
    // storage unavailable: nothing to persist to
  }
}
