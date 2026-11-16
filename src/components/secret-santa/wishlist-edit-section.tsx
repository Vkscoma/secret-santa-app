"use client";

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ChevronDown, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type WishlistEditContextValue = {
  saving: boolean;
  setSaving: (saving: boolean) => void;
  onSaved: () => void;
  onCancel: () => void;
};

const WishlistEditContext = createContext<WishlistEditContextValue | null>(null);

export function useWishlistEditContext() {
  const context = useContext(WishlistEditContext);
  if (!context) throw new Error("Wishlist edit controls must be inside WishlistEditSection.");
  return context;
}

export function WishlistEditSection({
  children,
  toolbar,
}: {
  children: ReactNode;
  toolbar?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const sectionId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (wasOpen.current && !open) toggleRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  function onCancel() {
    if (!saving) setOpen(false);
  }

  function onSaved() {
    setOpen(false);
    toast.success("Gift saved.");
  }

  return (
    <WishlistEditContext.Provider value={{ saving, setSaving, onSaved, onCancel }}>
      <section
        className="pt-3"
        onKeyDown={(event) => {
          if (event.key !== "Escape" || !open) return;
          event.preventDefault();
          if (!saving) setOpen(false);
        }}
      >
        <div className="flex items-center gap-2 sm:justify-between">
          <Button
            ref={toggleRef}
            type="button"
            variant="neutral"
            disabled={saving}
            aria-expanded={open}
            aria-controls={sectionId}
            className="h-11 min-w-0 flex-1 justify-between rounded-md px-3 sm:w-auto sm:flex-none"
            onClick={() => (open ? onCancel() : setOpen(true))}
          >
            <span className="inline-flex items-center gap-2">
              {open ? (
                <X className="size-4" aria-hidden="true" />
              ) : (
                <Pencil className="size-4" aria-hidden="true" />
              )}
              {open ? "Close" : "Edit this gift"}
            </span>
            <ChevronDown
              className={`size-4 transition-transform ${open ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
          </Button>
          {toolbar}
        </div>
        <div id={sectionId} hidden={!open} className={open ? "mt-3" : undefined}>
          {open ? children : null}
        </div>
      </section>
    </WishlistEditContext.Provider>
  );
}
