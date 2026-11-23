"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, LoaderCircle } from "lucide-react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { beginClaimActivity } from "@/components/secret-santa/claim-activity";
import { Button } from "@/components/ui/button";
import { updateWishlistClaim } from "@/lib/actions/wishlists";
import type { ClaimState } from "@/lib/wishlist-browse";

export function ClaimStatus() {
  return (
    <span className="bg-success/10 text-success inline-flex min-h-7 items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium">
      <Check className="size-4" aria-hidden="true" /> You’re getting this
    </span>
  );
}

export function ClaimedStatus() {
  return (
    <span className="bg-muted text-muted-foreground inline-flex min-h-7 items-center rounded-md px-2 py-0.5 text-[11px] font-medium">
      Taken
    </span>
  );
}

function ClaimButton({
  claimState,
  showClaimStatus,
}: {
  claimState: ClaimState;
  showClaimStatus: boolean;
}) {
  const { pending } = useFormStatus();
  if (claimState === "mine")
    return (
      <div
        className={`flex min-h-11 w-full items-center gap-x-1 ${showClaimStatus ? "justify-end" : ""}`}
        aria-busy={pending}
        aria-live="polite"
      >
        {showClaimStatus && <ClaimStatus />}
        <Button
          type="submit"
          variant="neutral"
          size="sm"
          disabled={pending}
          className={`min-h-11 text-xs ${showClaimStatus ? "px-1.5" : "w-full"}`}
        >
          {pending ? (
            <>
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> Updating…
            </>
          ) : (
            "Undo"
          )}
        </Button>
      </div>
    );
  return (
    <Button
      type="submit"
      variant="affirmative"
      disabled={pending}
      aria-busy={pending}
      className="min-h-11 w-full"
    >
      {pending ? (
        <>
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> Saving…
        </>
      ) : (
        "I’ll get this"
      )}
    </Button>
  );
}

export function ClaimToggleForm({
  exchangeId,
  itemId,
  claimState,
  className = "",
  showClaimStatus = true,
  previewMode = false,
  onPreviewClaimChange,
}: {
  exchangeId: string;
  itemId: string;
  claimState: ClaimState;
  className?: string;
  showClaimStatus?: boolean;
  previewMode?: boolean;
  onPreviewClaimChange?: (state: ClaimState) => void;
}) {
  const router = useRouter();
  const [previewState, setPreviewState] = useState(claimState);
  const currentState = previewMode ? previewState : claimState;
  const intent = currentState === "mine" ? "release" : "claim";
  const successMessage =
    intent === "claim"
      ? "Got it! Only you can see that you picked this."
      : "Okay, it's available again.";

  async function updateClaim(formData: FormData) {
    if (previewMode) {
      const nextState = intent === "claim" ? "mine" : "available";
      setPreviewState(nextState);
      onPreviewClaimChange?.(nextState);
      toast.success(successMessage);
      return;
    }
    // Background claim refreshers wait until this submit settles.
    const endClaimActivity = beginClaimActivity();
    try {
      const result = await updateWishlistClaim(formData);
      if (result.ok) toast.success(successMessage);
      else if (result.code === "taken") toast.error("Someone else just picked this gift.");
      else if (result.code === "gone") toast.error("This gift is no longer available.");
      else if (result.code === "own") toast.error("You can’t pick a gift from your own list.");
      else toast.error("Gift picks aren’t available for this list right now.");
      router.refresh();
    } catch {
      toast.error("Could not update your pick. Please try again.");
    } finally {
      endClaimActivity();
    }
  }

  return (
    <form action={updateClaim} className={className}>
      <input type="hidden" name="exchangeId" value={exchangeId} />
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="intent" value={intent} />
      <ClaimButton claimState={currentState} showClaimStatus={showClaimStatus} />
    </form>
  );
}
