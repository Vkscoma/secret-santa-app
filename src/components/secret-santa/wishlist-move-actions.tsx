"use client";

import { ArrowDown, ArrowUp, LoaderCircle } from "lucide-react";
import { useFormStatus } from "react-dom";
import { useWishlistEditContext } from "@/components/secret-santa/wishlist-edit-section";
import { Button } from "@/components/ui/button";
import { moveWishlistItem } from "@/lib/actions/wishlists";

type Direction = "up" | "down";

function MoveSubmitButton({ direction, title, unavailable }: { direction: Direction; title: string; unavailable: boolean }) {
  const { pending } = useFormStatus();
  const { saving } = useWishlistEditContext();
  const Icon = direction === "up" ? ArrowUp : ArrowDown;
  const label = `Move ${title} ${direction}`;

  return (
    <Button
      type="submit"
      variant="neutral"
      size="icon"
      className="size-11 rounded-md disabled:cursor-not-allowed disabled:opacity-35"
      disabled={unavailable || pending || saving}
      aria-label={label}
      title={label}
    >
      {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Icon className="size-4" aria-hidden="true" />}
    </Button>
  );
}

export function WishlistMoveActions({ exchangeId, itemId, title, index, count }: {
  exchangeId: string;
  itemId: string;
  title: string;
  index: number;
  count: number;
}) {
  return (
    <div role="group" aria-label={`Reorder ${title}`} className="flex shrink-0 items-center gap-1">
      {(["up", "down"] as const).map((direction) => (
        <form key={direction} action={moveWishlistItem}>
          <input type="hidden" name="exchangeId" value={exchangeId} />
          <input type="hidden" name="itemId" value={itemId} />
          <input type="hidden" name="direction" value={direction} />
          <MoveSubmitButton
            direction={direction}
            title={title}
            unavailable={direction === "up" ? index === 0 : index === count - 1}
          />
        </form>
      ))}
    </div>
  );
}
