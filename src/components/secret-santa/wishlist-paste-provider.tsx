"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { ProductImage } from "@/components/secret-santa/product-image";
import { Card } from "@/components/ui/card";

type PendingWish = { itemId: string; url: string; error?: string };
const PasteContext = createContext<{ pending: PendingWish[]; setPending: (item: PendingWish) => void; removePending: (id: string) => void } | null>(null);

export function WishlistPasteProvider({ children }: { children: ReactNode }) {
  const [pending, setItems] = useState<PendingWish[]>([]);
  const removePending = useCallback((id: string) => setItems((items) => items.some((item) => item.itemId === id) ? items.filter((item) => item.itemId !== id) : items), []);
  return <PasteContext.Provider value={{ pending, setPending: (item) => setItems((items) => [...items.filter((value) => value.itemId !== item.itemId), item]), removePending }}>{children}</PasteContext.Provider>;
}

export function useWishlistPaste() { return useContext(PasteContext); }

export function PendingWishlistCards({ savedItemIds }: { savedItemIds: string[] }) {
  const context = useWishlistPaste();
  const removePending = context?.removePending;
  useEffect(() => { savedItemIds.forEach((id) => removePending?.(id)); }, [savedItemIds, removePending]);
  const pending = context?.pending.filter((item) => !savedItemIds.includes(item.itemId)) ?? [];
  if (!pending.length) return null;
  return <div className="space-y-3">{pending.map((item) => <Card key={item.itemId} className="flex gap-3 p-4 sm:p-5" aria-busy={!item.error}>
    <ProductImage src={null} alt="" className="size-20 sm:size-24" />
    <div className="min-w-0 flex-1"><h3 className="break-words font-bold">{new URL(item.url).hostname}</h3><p role="status" className="mt-1 text-sm text-muted-foreground">{item.error ?? "Saving your wish…"}</p><a href={item.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm font-semibold text-primary">Open product link</a></div>
  </Card>)}</div>;
}

/** Suppress the empty-list invitation while its first optimistic wish is visible. */
export function WishlistEmptyState({ children }: { children: ReactNode }) {
  const context = useWishlistPaste();
  return context?.pending.length ? null : children;
}
