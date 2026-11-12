"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { toggleWishlistClaim } from "@/lib/actions/wishlists";

function ClaimButton({ claimed }: { claimed: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={claimed ? "secondary" : "outline"} disabled={pending} aria-pressed={claimed}>
      {pending ? "Saving…" : claimed ? "Unmark as claimed" : "I’ve got this"}
    </Button>
  );
}

export function ClaimToggleForm({ exchangeId, itemId, claimed }: { exchangeId: string; itemId: string; claimed: boolean }) {
  return (
    <form action={toggleWishlistClaim} className="shrink-0 self-end sm:self-auto">
      <input type="hidden" name="exchangeId" value={exchangeId} />
      <input type="hidden" name="itemId" value={itemId} />
      <ClaimButton claimed={claimed} />
    </form>
  );
}
