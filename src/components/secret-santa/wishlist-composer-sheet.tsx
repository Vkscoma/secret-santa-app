"use client";

import { type ReactNode, useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { MobileAddWishButton } from "@/components/secret-santa/mobile-add-wish-button";
import {
  WishlistComposer,
  type WishlistComposerProps,
} from "@/components/secret-santa/wishlist-composer";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createMediaQueryStore } from "@/lib/media-query-store";

// Matches Tailwind's default `lg` breakpoint (64rem), the only layout switch for the composer.
const desktopQuery = createMediaQueryStore("(min-width: 1024px)");

type Props = Omit<WishlistComposerProps, "onSaved" | "layout"> & { autoOpen?: boolean };

/**
 * Keeps the sheet inside the part of the screen that is actually visible. On iOS the
 * on-screen keyboard covers the page without resizing it, so `dvh` alone would leave the
 * pinned action hidden behind the keyboard. The visual viewport reports the real space.
 */
function useVisibleViewport(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const viewport = window.visualViewport;
    const root = document.documentElement;
    function update() {
      // Ignore pinch-zoom: it shrinks the visual viewport but is not a keyboard.
      if (viewport && viewport.scale > 1.01) return;
      const height = viewport?.height ?? window.innerHeight;
      const keyboardInset = Math.max(0, window.innerHeight - height - (viewport?.offsetTop ?? 0));
      root.style.setProperty("--sheet-visible-height", `${height}px`);
      root.style.setProperty("--sheet-keyboard-inset", `${keyboardInset}px`);
    }
    update();
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      root.style.removeProperty("--sheet-visible-height");
      root.style.removeProperty("--sheet-keyboard-inset");
    };
  }, [active]);
}

function InlineLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-4">
      {children}
      <p className="text-muted-foreground px-1 text-xs leading-5">
        Have a size, color, or model in mind? Add those little details so your Santa can choose with
        confidence.
      </p>
    </div>
  );
}

/**
 * Shows the wish composer inline on desktop and in a bottom sheet (opened by a
 * floating + button) below `lg`.
 *
 * Exactly one `WishlistComposer` is mounted at a time. After hydration it lives
 * in a detached host element via a stable portal; that host is attached to
 * either the inline slot or the open sheet. Closing the sheet or crossing the
 * breakpoint only moves the DOM node, so the draft, paste session and pending
 * save state survive without remounting the composer.
 */
export function WishlistComposerSheet({ autoOpen = false, ...props }: Props) {
  const isDesktop = useSyncExternalStore(
    desktopQuery.subscribe,
    desktopQuery.getSnapshot,
    desktopQuery.getServerSnapshot
  );
  const [host] = useState(() =>
    typeof document === "undefined" ? null : document.createElement("div")
  );
  const hasPrefill = Boolean(
    props.initialUrl ||
    props.initialTitle ||
    props.initialImageUrl ||
    props.initialPrice ||
    props.initialStoreName
  );
  // `null` until the user opens/closes the sheet, so shared/prefilled wishes start open on phones.
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const open = userOpen ?? (hasPrefill || autoOpen);
  const closeSheet = useCallback(() => {
    setUserOpen(false);
  }, []);
  useVisibleViewport(isDesktop === false && open);

  const attachHost = useCallback(
    (slot: HTMLDivElement | null) => {
      if (!slot || !host) return;
      slot.appendChild(host);
      return () => {
        host.remove();
      };
    },
    [host]
  );

  const composer = (
    <WishlistComposer
      {...props}
      {...(isDesktop === false ? { onSaved: closeSheet, layout: "sheet" as const } : {})}
    />
  );

  // Server render and hydration: the viewport is unknown, so render the desktop
  // layout only at `lg` and nothing on phones (the FAB appears once hydrated).
  if (isDesktop === null || !host)
    return (
      <div className="hidden lg:block">
        <InlineLayout>{composer}</InlineLayout>
      </div>
    );

  return (
    <>
      {createPortal(composer, host)}
      {isDesktop ? (
        <InlineLayout>
          <div ref={attachHost} />
        </InlineLayout>
      ) : (
        <Dialog open={open} onOpenChange={setUserOpen}>
          <DialogTrigger asChild>
            <MobileAddWishButton />
          </DialogTrigger>
          {/* Height-limited flex column: the composer scrolls its fields inside and pins its action. */}
          <DialogContent
            className="bg-card fixed inset-x-0 top-auto bottom-[var(--sheet-keyboard-inset,0px)] left-0 z-50 flex max-h-[calc(var(--sheet-visible-height,100dvh)-env(safe-area-inset-top)-0.75rem)] w-full max-w-full translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-t-2xl rounded-b-none border-x-0 border-b-0 p-0 shadow-2xl sm:max-w-full lg:hidden"
            showCloseButton
          >
            <DialogTitle className="sr-only">Add a wish</DialogTitle>
            <DialogDescription className="sr-only">
              Add an item to your Secret Santa wish list.
            </DialogDescription>
            <div
              ref={attachHost}
              className="flex min-h-0 flex-1 flex-col [&>div]:flex [&>div]:min-h-0 [&>div]:flex-1 [&>div]:flex-col"
            />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
