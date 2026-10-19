import { describe, expect, it } from 'bun:test';
import { readStoredTheme, STORAGE_KEY, writeStoredTheme, type StorageLike } from './theme-storage';

const LEGACY_KEY = 'waasel_theme';

function fakeStorage(initial: Record<string, string> = {}): StorageLike & { dump(): Record<string, string> } {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
    dump: () => Object.fromEntries(map),
  };
}

const brokenStorage: StorageLike = {
  getItem() {
    throw new Error('storage blocked');
  },
  setItem() {
    throw new Error('storage blocked');
  },
  removeItem() {
    throw new Error('storage blocked');
  },
};

describe('readStoredTheme', () => {
  it('returns null when nothing was ever stored', () => {
    expect(readStoredTheme(fakeStorage())).toBeNull();
  });

  it('reads the current key', () => {
    expect(readStoredTheme(fakeStorage({ [STORAGE_KEY]: 'wafine-dark' }))).toBe('wafine-dark');
    expect(readStoredTheme(fakeStorage({ [STORAGE_KEY]: 'wafine-light' }))).toBe('wafine-light');
  });

  it('remaps the pre-rename light theme name in place', () => {
    const storage = fakeStorage({ [STORAGE_KEY]: 'wafine' });
    expect(readStoredTheme(storage)).toBe('wafine-light');
    expect(storage.dump()).toEqual({ [STORAGE_KEY]: 'wafine-light' });
  });

  it('ignores an unrecognised value in the current key', () => {
    expect(readStoredTheme(fakeStorage({ [STORAGE_KEY]: 'solarized' }))).toBeNull();
  });

  it('migrates the legacy key once, then stops reading it', () => {
    const storage = fakeStorage({ [LEGACY_KEY]: 'openwa-dark' });

    expect(readStoredTheme(storage)).toBe('wafine-dark');
    expect(storage.dump()).toEqual({ [STORAGE_KEY]: 'wafine-dark' });

    expect(readStoredTheme(storage)).toBe('wafine-dark');
    expect(storage.dump()).toEqual({ [STORAGE_KEY]: 'wafine-dark' });
  });

  it('migrates the legacy light theme', () => {
    const storage = fakeStorage({ [LEGACY_KEY]: 'openwa' });
    expect(readStoredTheme(storage)).toBe('wafine-light');
    expect(storage.dump()).toEqual({ [STORAGE_KEY]: 'wafine-light' });
  });

  it('drops a legacy value it cannot map', () => {
    const storage = fakeStorage({ [LEGACY_KEY]: 'neon' });
    expect(readStoredTheme(storage)).toBeNull();
    expect(storage.dump()).toEqual({});
  });

  it('leaves the legacy key alone once the current key holds a choice', () => {
    const storage = fakeStorage({ [STORAGE_KEY]: 'wafine-dark', [LEGACY_KEY]: 'openwa' });
    expect(readStoredTheme(storage)).toBe('wafine-dark');
    expect(storage.dump()).toEqual({ [STORAGE_KEY]: 'wafine-dark', [LEGACY_KEY]: 'openwa' });
  });

  it('returns null instead of throwing when storage is blocked', () => {
    expect(readStoredTheme(brokenStorage)).toBeNull();
  });
});

describe('writeStoredTheme', () => {
  it('writes the current key only', () => {
    const storage = fakeStorage({ [LEGACY_KEY]: 'openwa-dark' });
    writeStoredTheme('wafine-dark', storage);
    expect(storage.dump()).toEqual({ [STORAGE_KEY]: 'wafine-dark', [LEGACY_KEY]: 'openwa-dark' });
  });

  it('does not throw when storage is blocked', () => {
    expect(() => writeStoredTheme('wafine-light', brokenStorage)).not.toThrow();
  });
});
