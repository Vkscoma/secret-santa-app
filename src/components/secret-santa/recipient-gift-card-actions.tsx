"use client";

import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import {
  ClaimedStatus,
  ClaimStatus,
  ClaimToggleForm,
} from "@/components/secret-santa/claim-toggle-form";
import { Button } from "@/components/ui/button";
import type { ClaimState } from "@/lib/wishlist-browse";

type Props = {
  exchangeId: string;
  itemId: string;
  title: string;
  productUrl: string | null;
  claimState: ClaimState;
  claimable?: boolean;
  previewMode?: boolean;
};

function ViewItem({ title, productUrl }: { title: string; productUrl: string }) {
  return (
    <Button asChild variant="neutral" size="sm" className="min-h-11 flex-none px-2.5">
      <a
        href={productUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`View ${title} (opens in a new tab)`}
      >
        View item <ArrowUpRight className="size-4" aria-hidden="true" />
      </a>
    </Button>
  );
}

export function RecipientGiftCardActions({
  exchangeId,
  itemId,
  title,
  productUrl,
  claimState,
  claimable = true,
  previewMode = false,
}: Props) {
  const [previewState, setPreviewState] = useState(claimState);
  const currentState = previewMode ? previewState : claimState;

  if (!claimable && !previewMode) {
    return (
      <div>
        {currentState === "mine" ? (
          <ClaimStatus />
        ) : currentState === "taken" ? (
          <ClaimedStatus />
        ) : (
          <p className="text-muted-foreground text-sm">Gift picks aren’t available right now.</p>
        )}
      </div>
    );
  }

  if (currentState === "taken") {
    return (
      <div className="flex items-center justify-end gap-2">
        {productUrl && <ViewItem title={title} productUrl={productUrl} />}
        <ClaimedStatus />
      </div>
    );
  }

  if (currentState === "mine") {
    return (
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <ClaimStatus />
        <div className="flex items-center gap-2">
          {productUrl && <ViewItem title={title} productUrl={productUrl} />}
          <ClaimToggleForm
            exchangeId={exchangeId}
            itemId={itemId}
            claimState="mine"
            showClaimStatus={false}
            previewMode={previewMode}
            onPreviewClaimChange={setPreviewState}
            className="flex-1 sm:flex-none"
          />
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${productUrl ? "justify-end" : "w-full"}`}>
      {productUrl && <ViewItem title={title} productUrl={productUrl} />}
      <ClaimToggleForm
        exchangeId={exchangeId}
        itemId={itemId}
        claimState="available"
        previewMode={previewMode}
        onPreviewClaimChange={setPreviewState}
        className={productUrl ? "flex-1 sm:flex-none" : "w-full"}
      />
    </div>
  );
}
