/**
 * Tiny browser-side store shared by claim forms and background refreshers.
 *
 * Background refreshes remount gift cards (they move between page sections), so
 * they must wait while a claim is being saved or an overlay is open. A module
 * store avoids wrapping every page in a provider; it is only mutated from event
 * handlers, so server rendering never touches it.
 */

/** Open Radix overlays that a background refresh could close or reset. */
const OPEN_OVERLAY_SELECTOR = [
  '[role="dialog"][data-state="open"]',
  '[role="alertdialog"][data-state="open"]',
  '[role="menu"][data-state="open"]',
].join(", ");

let pendingClaimCount = 0;
const listeners = new Set<() => void>();

function notifyListeners() {
  for (const listener of listeners) listener();
}

/** Marks a claim submit as in flight. Call the returned function exactly once when it settles. */
export function beginClaimActivity(): () => void {
  pendingClaimCount += 1;
  notifyListeners();
  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    pendingClaimCount = Math.max(0, pendingClaimCount - 1);
    notifyListeners();
  };
}

export function subscribeToClaimActivity(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** True while a refresh would interrupt the viewer: a claim is saving or an overlay is open. */
export function isClaimsUiBusy(): boolean {
  if (pendingClaimCount > 0) return true;
  if (typeof document === "undefined") return false;
  return document.querySelector(OPEN_OVERLAY_SELECTOR) !== null;
}

/**
 * Calls `onIdle` once the claims UI stops being busy. Watches the claim store and
 * DOM overlay state changes. Returns a function that cancels the watch.
 */
export function whenClaimsUiIdle(onIdle: () => void): () => void {
  let cancelled = false;
  const observer =
    typeof MutationObserver === "undefined" ? null : new MutationObserver(() => evaluate());
  const unsubscribe = subscribeToClaimActivity(() => evaluate());

  function cancel() {
    if (cancelled) return;
    cancelled = true;
    observer?.disconnect();
    unsubscribe();
  }

  function evaluate() {
    if (cancelled || isClaimsUiBusy()) return;
    cancel();
    onIdle();
  }

  observer?.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["data-state"],
  });
  evaluate();
  return cancel;
}
