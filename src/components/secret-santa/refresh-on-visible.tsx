"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isClaimsUiBusy } from "@/components/secret-santa/claim-activity";

/** At most one return-to-tab refresh per window, counted from the last render or refresh. */
const MIN_REFRESH_INTERVAL_MS = 30_000;

/**
 * Re-renders the page when the viewer comes back to the tab, so claim and
 * wishlist changes made elsewhere show up without polling an endpoint.
 */
export function RefreshOnVisible() {
  const router = useRouter();

  useEffect(() => {
    let lastRefreshAt = Date.now();

    function onVisibilityChange() {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastRefreshAt < MIN_REFRESH_INTERVAL_MS) return;
      // Never reset a claim in progress or an open dialog; the next return will refresh.
      if (isClaimsUiBusy()) return;
      lastRefreshAt = Date.now();
      router.refresh();
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [router]);

  return <span hidden data-refresh-on-visible="" />;
}
