import { describe, expect, it } from "vitest";
import { createMediaQueryStore } from "./media-query-store";

function fakeHost(initial: boolean) {
  const listeners = new Set<() => void>();
  const mediaQueryList = {
    matches: initial,
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  };
  return {
    host: { matchMedia: () => mediaQueryList as unknown as MediaQueryList },
    set(matches: boolean) { mediaQueryList.matches = matches; listeners.forEach((listener) => listener()); },
    listeners,
  };
}

describe("createMediaQueryStore", () => {
  it("reports unknown on the server so hydration matches", () => {
    const store = createMediaQueryStore("(min-width: 1024px)", () => undefined);
    expect(store.getServerSnapshot()).toBeNull();
    expect(store.getSnapshot()).toBeNull();
    expect(() => store.subscribe(() => {})()).not.toThrow();
  });

  it("tracks the media query and unsubscribes cleanly", () => {
    const fake = fakeHost(false);
    const store = createMediaQueryStore("(min-width: 1024px)", () => fake.host);
    let changes = 0;
    const unsubscribe = store.subscribe(() => { changes += 1; });
    expect(store.getSnapshot()).toBe(false);
    fake.set(true);
    expect(changes).toBe(1);
    expect(store.getSnapshot()).toBe(true);
    unsubscribe();
    expect(fake.listeners.size).toBe(0);
  });
});
