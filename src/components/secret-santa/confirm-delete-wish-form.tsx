"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteWishlistItem } from "@/lib/actions/wishlists";

export function ConfirmDeleteWishForm({
  exchangeId,
  itemId,
  title,
}: {
  exchangeId: string;
  itemId: string;
  title: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const removeButtonRef = useRef<HTMLButtonElement>(null);
  const keepButtonRef = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);

  useEffect(() => {
    if (confirming && !wasConfirming.current) keepButtonRef.current?.focus();
    if (!confirming && wasConfirming.current) removeButtonRef.current?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);

  return (
    <form action={deleteWishlistItem} className="mt-2">
      <input type="hidden" name="exchangeId" value={exchangeId} />
      <input type="hidden" name="itemId" value={itemId} />
      {confirming ? (
        <div role="group" aria-label={`Confirm removal of ${title}`} className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Remove “{title}” from your list? This can’t be undone.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              ref={keepButtonRef}
              type="button"
              variant="outline"
              className="h-11"
              onClick={() => setConfirming(false)}
            >
              Keep wish
            </Button>
            <Button type="submit" variant="destructive" className="h-11">
              <Trash2 className="size-4" aria-hidden="true" />
              Remove wish
            </Button>
          </div>
        </div>
      ) : (
        <Button
          ref={removeButtonRef}
          type="button"
          size="sm"
          variant="destructive"
          className="h-11"
          onClick={() => setConfirming(true)}
        >
          <Trash2 className="size-4" aria-hidden="true" />
          Remove
        </Button>
      )}
    </form>
  );
}
