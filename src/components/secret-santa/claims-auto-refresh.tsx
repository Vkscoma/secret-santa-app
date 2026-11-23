"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { whenClaimsUiIdle, isClaimsUiBusy } from "@/components/secret-santa/claim-activity";

const POLL_INTERVAL_MS = 10_000;
const POLL_JITTER_MS = 2_000;
const MAX_BACKOFF_MS = 60_000;
/** Lets the viewer's own post-claim refresh land before re-checking after a deferral. */
const IDLE_SETTLE_DELAY_MS = 1_000;
/** Access will not come back without a navigation, so polling stops for good. */
const TERMINAL_STATUSES = new Set([401, 403, 404]);

type Props = { exchangeId: string; ownerId: string; initialVersion: string };

function pollDelay() {
  return POLL_INTERVAL_MS + Math.round(Math.random() * POLL_JITTER_MS);
}

function backoffDelay(failures: number) {
  return Math.min(POLL_INTERVAL_MS * 2 ** failures, MAX_BACKOFF_MS);
}

/**
 * Silently refreshes a wishlist page when someone else claims or releases a gift.
 * Polls a fingerprint of the list's claims while the tab is visible and refreshes
 * only when it differs from the server-rendered one, waiting for in-flight claims
 * and open overlays so nothing the viewer is doing gets reset.
 */
export function ClaimsAutoRefresh({ exchangeId, ownerId, initialVersion }: Props) {
  const router = useRouter();
  // The baseline always tracks the latest render, so the viewer's own claim
  // (which refreshes the page) never triggers a second refresh.
  const baselineRef = useRef(initialVersion);
  const requestedVersionRef = useRef<string | null>(null);

  useEffect(() => {
    baselineRef.current = initialVersion;
    requestedVersionRef.current = null;
  }, [initialVersion]);

  useEffect(() => {
    const url = `/api/exchanges/${encodeURIComponent(exchangeId)}/wishlists/${encodeURIComponent(ownerId)}/claims-version`;
    let stopped = false;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | null = null;
    let cancelIdleWatch: (() => void) | null = null;

    function clearTimer() {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    }

    function schedule(delay: number) {
      clearTimer();
      if (stopped || document.visibilityState !== "visible") return;
      timer = setTimeout(() => void check(), delay);
    }

    function refreshIfChanged(version: string) {
      if (version === baselineRef.current || version === requestedVersionRef.current) return;
      if (isClaimsUiBusy()) {
        // Re-check rather than refresh blindly once idle: the viewer's own claim
        // may already have refreshed the page to this version.
        cancelIdleWatch ??= whenClaimsUiIdle(() => {
          cancelIdleWatch = null;
          schedule(IDLE_SETTLE_DELAY_MS);
        });
        return;
      }
      requestedVersionRef.current = version;
      router.refresh();
    }

    async function check() {
      clearTimer();
      if (stopped || controller || document.visibilityState !== "visible") return;
      controller = new AbortController();
      try {
        const response = await fetch(url, {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        });
        if (TERMINAL_STATUSES.has(response.status)) {
          stopped = true;
          return;
        }
        if (!response.ok) throw new Error(`Unexpected status ${response.status}`);
        const body: unknown = await response.json();
        const version =
          body && typeof body === "object" && "version" in body ? body.version : undefined;
        if (typeof version !== "string") throw new Error("Malformed claims version");
        failures = 0;
        refreshIfChanged(version);
        schedule(pollDelay());
      } catch {
        if (stopped) return;
        failures += 1;
        schedule(backoffDelay(failures));
      } finally {
        controller = null;
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") void check();
      else clearTimer();
    }

    function onFocus() {
      void check();
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onFocus);
    schedule(pollDelay());

    return () => {
      stopped = true;
      clearTimer();
      controller?.abort();
      cancelIdleWatch?.();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onFocus);
    };
  }, [exchangeId, ownerId, router]);

  return <span hidden data-claims-auto-refresh="" />;
}
