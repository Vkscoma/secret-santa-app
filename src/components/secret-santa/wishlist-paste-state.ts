export type PasteAction = { itemId: string; url: string };

/** Keep one identity across duplicate browser events and retries of a paste. */
export function createPasteSession(makeId: () => string) {
  let action: PasteAction | null = null;
  let running: Promise<void> | null = null;
  let saved = false;
  return {
    reset() { if (!running) { action = null; saved = false; } },
    run(url: string, save: (action: PasteAction) => Promise<void>): Promise<void> {
      if (running) return running;
      if (!action || action.url !== url) { action = { itemId: makeId(), url }; saved = false; }
      if (saved) return Promise.resolve();
      const current = action;
      running = Promise.resolve().then(() => save(current)).then(() => { saved = true; }).finally(() => { running = null; });
      return running;
    },
  };
}

export function singlePastedUrl(value: string): string | null {
  const candidate = value.trim();
  if (/\s/.test(candidate)) return null;
  try {
    const url = new URL(candidate);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? candidate : null;
  } catch { return null; }
}
