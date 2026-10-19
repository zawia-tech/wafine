import { useSyncExternalStore } from 'react';

const noopSubscribe = () => () => {};

/**
 * Read a browser-only value (sessionStorage, localStorage, `location.search`) in a client
 * component without a setState-in-effect.
 *
 * The server render and the hydration pass see `serverValue`, so the markup still matches;
 * React then re-renders once with `read()`. That is what the old `useEffect(() =>
 * setX(read()), [])` did, minus the cascading render the React Compiler lint (react-hooks 7,
 * shipped with eslint-config-next 16) rejects.
 *
 * `read` runs on every render, so it must be cheap and return a stable value (a primitive, or
 * the same cached object) while the underlying data is unchanged.
 */
export function useClientValue<T>(read: () => T, serverValue: T): T {
  return useSyncExternalStore(noopSubscribe, read, () => serverValue);
}

/** False on the server and during hydration, true once the client has taken over. */
export function useHydrated(): boolean {
  return useClientValue(() => true, false);
}
