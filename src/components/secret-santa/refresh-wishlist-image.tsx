"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
type RefreshWishlistImageState = { message: string; error: boolean };

const initialState: RefreshWishlistImageState = { message: "", error: false };

type Props = { exchangeId: string; itemId: string };

export function RefreshWishlistImage({ exchangeId, itemId }: Props) {
  const router = useRouter();
  const [state, action, pending] = useActionState(async (): Promise<RefreshWishlistImageState> => {
    try {
      const response = await fetch("/api/wishlist-items/enrich", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exchangeId, itemId, mode: "refresh-image" }),
      });
      const result = await response.json() as { message?: string; error?: boolean | string };
      if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "Could not refresh this product image.");
      router.refresh();
      return { message: result.message ?? "Could not refresh this product image.", error: result.error !== false };
    } catch (error) {
      return { message: error instanceof Error ? error.message : "Could not refresh this product image.", error: true };
    }
  }, initialState);
  return (
    <form action={action} className="mb-3 flex flex-wrap items-center gap-2">
      <input type="hidden" name="exchangeId" value={exchangeId} />
      <input type="hidden" name="itemId" value={itemId} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? "Refreshing…" : "Refresh from link"}
      </Button>
      {state.message && <span role="status" className={`text-sm ${state.error ? "text-destructive" : "text-muted-foreground"}`}>{state.message}</span>}
    </form>
  );
}
