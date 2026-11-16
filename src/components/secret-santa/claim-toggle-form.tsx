"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, LoaderCircle } from "lucide-react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { toggleWishlistClaim } from "@/lib/actions/wishlists";

export function ClaimStatus() {
  return (
    <span className="bg-success/10 text-success inline-flex min-h-7 items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium">
      <Check className="size-4" aria-hidden="true" /> You’re getting this
    </span>
  );
}

function ClaimButton({ claimed, showClaimStatus }: { claimed: boolean; showClaimStatus: boolean }) {
  const { pending } = useFormStatus();
  if (claimed) {
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
  }

  return (
    <Button type="submit" variant="affirmative" disabled={pending} aria-busy={pending} className="min-h-11 w-full">
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
  claimed,
  className = "",
  showClaimStatus = true,
  previewMode = false,
  onPreviewClaimChange,
}: {
  exchangeId: string;
  itemId: string;
  claimed: boolean;
  className?: string;
  showClaimStatus?: boolean;
  previewMode?: boolean;
  onPreviewClaimChange?: (claimed: boolean) => void;
}) {
  const router = useRouter();
  const [previewClaimed, setPreviewClaimed] = useState(claimed);
  const currentClaimed = previewMode ? previewClaimed : claimed;

  async function updateClaim(formData: FormData) {
    if (previewMode) {
      const nextClaimed = !currentClaimed;
      setPreviewClaimed(nextClaimed);
      onPreviewClaimChange?.(nextClaimed);
      toast.success(nextClaimed ? "You’re getting this." : "You’re no longer getting this.");
      return;
    }

    try {
      await toggleWishlistClaim(formData);
      toast.success(currentClaimed ? "You’re no longer getting this." : "You’re getting this.");
      router.refresh();
    } catch {
      toast.error("Could not update your claim. Please try again.");
    }
  }

  return (
    <>
      <form action={updateClaim} className={className}>
        <input type="hidden" name="exchangeId" value={exchangeId} />
        <input type="hidden" name="itemId" value={itemId} />
        <ClaimButton claimed={currentClaimed} showClaimStatus={showClaimStatus} />
      </form>
    </>
  );
}
