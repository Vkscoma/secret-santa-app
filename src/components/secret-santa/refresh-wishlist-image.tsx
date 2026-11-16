"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { useWishlistEditContext } from "@/components/secret-santa/wishlist-edit-section";
import { Button } from "@/components/ui/button";

type RefreshWishlistImageState = { message: string; error: boolean };

type Props = { exchangeId: string; itemId: string };

export function RefreshWishlistImage({ exchangeId, itemId }: Props) {
  const router = useRouter();
  const [state, setState] = useState<RefreshWishlistImageState>({ message: "", error: false });
  const [pending, startTransition] = useTransition();
  const { saving } = useWishlistEditContext();

  function refresh() {
    if (pending || saving) return;
    setState({ message: "", error: false });
    startTransition(async () => {
      try {
        const response = await fetch("/api/wishlist-items/enrich", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ exchangeId, itemId, mode: "refresh-image" }),
        });
        const result = await response.json() as { message?: string; error?: boolean | string };
        if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "Could not refresh this product image.");
        router.refresh();
        setState({
          message: result.message ?? "Could not refresh this product image.",
          error: result.error !== false,
        });
      } catch (error) {
        setState({
          message: error instanceof Error ? error.message : "Could not refresh this product image.",
          error: true,
        });
      }
    });
  }

  return (
    <div className="mt-1 flex flex-wrap items-center gap-2">
      <Button type="button" variant="neutral" size="sm" disabled={pending || saving} className="h-11 rounded-md px-3" onClick={refresh}>
        <RefreshCw className={`size-4 ${pending ? "animate-spin" : ""}`} aria-hidden="true" />
        {pending ? "Refreshing…" : "Refresh from link"}
      </Button>
      {state.message && <span role="status" aria-live="polite" className={`text-sm ${state.error ? "text-destructive" : "text-muted-foreground"}`}>{state.message}</span>}
    </div>
  );
}
