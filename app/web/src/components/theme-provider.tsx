'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useClientValue } from '@/lib/use-client-value';
import { readStoredTheme, writeStoredTheme, type Theme } from '@/lib/theme-storage';

/**
 * Light/dark theme switch.
 *
 * The theme is a `data-theme` attribute on <html> that daisyUI turns into its CSS variables.
 * It cannot be decided while prerendering: the CSP (src/proxy.ts) forbids the inline
 * bootstrap script the usual no-flash pattern needs, so the attribute is set from this effect
 * and a first paint in the default (light) theme is expected for dark-mode users.
 *
 * Stored in localStorage as an explicit choice (see lib/theme-storage); absent, we follow the
 * OS setting live.
 */

export type { Theme } from '@/lib/theme-storage';

const ThemeContext = createContext<{ theme: Theme; toggle: () => void } | null>(null);

const DARK_QUERY = '(prefers-color-scheme: dark)';

function systemTheme(): Theme {
  return globalThis.matchMedia?.(DARK_QUERY).matches ? 'wafine-dark' : 'wafine-light';
}

function subscribeSystemTheme(onChange: () => void): () => void {
  const media = globalThis.matchMedia?.(DARK_QUERY);
  if (!media) return () => {};
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

const serverTheme = (): Theme => 'wafine-light';

// Read the stored choice once per page view, as the old mount effect did: readStoredTheme()
// can migrate a legacy key, and a snapshot read must return the same value every time.
let storedOnce: Theme | null | undefined;
function readStoredOnce(): Theme | null {
  if (storedOnce === undefined) storedOnce = readStoredTheme();
  return storedOnce;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Server render and hydration use the default (light) theme; the client then resolves
  // choice made here > stored choice > live OS setting. Read through useSyncExternalStore
  // rather than a setState in an effect (React Compiler lint, react-hooks 7).
  const [choice, setChoice] = useState<Theme | null>(null);
  const stored = useClientValue(readStoredOnce, null);
  const system = useSyncExternalStore(subscribeSystemTheme, systemTheme, serverTheme);
  const theme: Theme = choice ?? stored ?? system;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggle = useCallback(() => {
    const next: Theme = theme === 'wafine-dark' ? 'wafine-light' : 'wafine-dark';
    writeStoredTheme(next);
    setChoice(next);
  }, [theme]);

  const value = useMemo(() => ({ theme, toggle }), [theme, toggle]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside <ThemeProvider>');
  return context;
}
