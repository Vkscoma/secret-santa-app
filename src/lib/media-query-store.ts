/**
 * A `useSyncExternalStore`-compatible store for a CSS media query.
 *
 * The server snapshot is `null` ("unknown") so the first client render matches
 * the server HTML; React then re-renders with the real value after hydration.
 */
export type MediaQueryStore = {
  subscribe: (onChange: () => void) => () => void;
  getSnapshot: () => boolean | null;
  getServerSnapshot: () => boolean | null;
};

type MatchMediaHost = { matchMedia?: (query: string) => MediaQueryList };

export function createMediaQueryStore(query: string, getHost: () => MatchMediaHost | undefined = () => (typeof window === "undefined" ? undefined : window)): MediaQueryStore {
  function list() {
    return getHost()?.matchMedia?.(query) ?? null;
  }

  return {
    subscribe(onChange) {
      const mediaQueryList = list();
      if (!mediaQueryList) return () => {};
      mediaQueryList.addEventListener("change", onChange);
      return () => mediaQueryList.removeEventListener("change", onChange);
    },
    getSnapshot: () => list()?.matches ?? null,
    getServerSnapshot: () => null,
  };
}
