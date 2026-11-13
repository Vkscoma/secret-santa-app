"use client";

import { type ReactNode, useCallback, useState, useSyncExternalStore } from "react";
import { Plus } from "lucide-react";
import { createPortal } from "react-dom";
import { WishlistComposer, type WishlistComposerProps } from "@/components/secret-santa/wishlist-composer";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { createMediaQueryStore } from "@/lib/media-query-store";

// Matches Tailwind's default `lg` breakpoint (64rem), the only layout switch for the composer.
const desktopQuery = createMediaQueryStore("(min-width: 1024px)");

type Props = Omit<WishlistComposerProps, "onSaved">;

function InlineLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-4">
      {children}
      <p className="px-1 text-xs leading-5 text-muted-foreground">Have a size, color, or model in mind? Add those little details so your Santa can choose with confidence.</p>
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
export function WishlistComposerSheet(props: Props) {
  const isDesktop = useSyncExternalStore(desktopQuery.subscribe, desktopQuery.getSnapshot, desktopQuery.getServerSnapshot);
  const [host] = useState(() => (typeof document === "undefined" ? null : document.createElement("div")));
  const hasPrefill = Boolean(props.initialUrl || props.initialTitle || props.initialImageUrl || props.initialPrice || props.initialStoreName);
  // `null` until the user opens/closes the sheet, so shared/prefilled wishes start open on phones.
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const open = userOpen ?? hasPrefill;
  const closeSheet = useCallback(() => { setUserOpen(false); }, []);

  const attachHost = useCallback((slot: HTMLDivElement | null) => {
    if (!slot || !host) return;
    slot.appendChild(host);
    return () => { host.remove(); };
  }, [host]);

  const composer = <WishlistComposer {...props} {...(isDesktop === false ? { onSaved: closeSheet } : {})} />;

  // Server render and hydration: the viewport is unknown, so render the desktop
  // layout only at `lg` and nothing on phones (the FAB appears once hydrated).
  if (isDesktop === null || !host) return <div className="hidden lg:block"><InlineLayout>{composer}</InlineLayout></div>;

  return (
    <>
      {createPortal(composer, host)}
      {isDesktop ? <InlineLayout><div ref={attachHost} /></InlineLayout> : (
        <Dialog open={open} onOpenChange={setUserOpen}>
          <DialogTrigger asChild>
            <Button aria-label="Add a wish" className="fixed bottom-[max(1.5rem,env(safe-area-inset-bottom))] right-5 z-20 size-14 rounded-full p-0 shadow-lg lg:hidden"><Plus className="size-6" aria-hidden="true" /></Button>
          </DialogTrigger>
          <DialogContent className="fixed inset-x-0 bottom-0 top-auto left-0 z-50 max-h-[88svh] w-full max-w-full translate-x-0 translate-y-0 gap-0 overflow-y-auto rounded-b-none rounded-t-2xl border-x-0 border-b-0 p-3 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl sm:max-w-full lg:hidden" showCloseButton>
            <DialogTitle className="sr-only">Add a wish</DialogTitle>
            <DialogDescription className="sr-only">Add an item to your Secret Santa wish list.</DialogDescription>
            <div ref={attachHost} />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
