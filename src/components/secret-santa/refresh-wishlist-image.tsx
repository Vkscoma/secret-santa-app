"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { refreshWishlistItemImage, type RefreshWishlistImageState } from "@/lib/actions/wishlists";

const initialState: RefreshWishlistImageState = { message: "", error: false };

type Props = { exchangeId: string; itemId: string };

export function RefreshWishlistImage({ exchangeId, itemId }: Props) {
  const [state, action, pending] = useActionState(refreshWishlistItemImage, initialState);
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
