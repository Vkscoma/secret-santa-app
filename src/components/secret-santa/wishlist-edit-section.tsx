"use client";

import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

type WishlistEditContextValue = {
  saving: boolean;
  setSaving: (saving: boolean) => void;
  onSaved: () => void;
};

const WishlistEditContext = createContext<WishlistEditContextValue | null>(null);

export function useWishlistEditContext() {
  const context = useContext(WishlistEditContext);
  if (!context) throw new Error("Wishlist edit controls must be inside WishlistEditSection.");
  return context;
}

export function WishlistEditSection({ children }: { children: ReactNode }) {
  const [saving, setSaving] = useState(false);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const summaryRef = useRef<HTMLElement>(null);

  function onSaved() {
    if (detailsRef.current) detailsRef.current.open = false;
    summaryRef.current?.focus();
    toast.success("Gift saved.");
  }

  return (
    <WishlistEditContext.Provider value={{ saving, setSaving, onSaved }}>
      <details ref={detailsRef} className="border-t border-border pt-3">
        <summary ref={summaryRef} className="cursor-pointer text-sm font-semibold text-muted-foreground">
          Edit this gift
        </summary>
        <fieldset disabled={saving} className="m-0 min-w-0 border-0 p-0">
          {children}
        </fieldset>
      </details>
    </WishlistEditContext.Provider>
  );
}
