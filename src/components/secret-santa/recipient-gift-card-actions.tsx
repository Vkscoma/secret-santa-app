"use client";

import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { ClaimStatus, ClaimToggleForm } from "@/components/secret-santa/claim-toggle-form";
import { Button } from "@/components/ui/button";

type Props = {
  exchangeId: string;
  itemId: string;
  title: string;
  productUrl: string | null;
  claimed: boolean;
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
  claimed,
  claimable = true,
  previewMode = false,
}: Props) {
  const [previewClaimed, setPreviewClaimed] = useState(claimed);
  const currentClaimed = previewMode ? previewClaimed : claimed;

  if (!claimable && !previewMode) {
    return (
      <div className="pt-3">
        {currentClaimed ? (
          <ClaimStatus />
        ) : (
          <p className="text-muted-foreground text-sm">Claiming is unavailable</p>
        )}
      </div>
    );
  }

  if (currentClaimed) {
    return (
      <div className="flex flex-col gap-2 pt-3 sm:flex-row sm:items-center sm:justify-between">
        <ClaimStatus />
        <div className="flex items-center gap-2">
          {productUrl && <ViewItem title={title} productUrl={productUrl} />}
          <ClaimToggleForm
            exchangeId={exchangeId}
            itemId={itemId}
            claimed
            showClaimStatus={false}
            previewMode={previewMode}
            onPreviewClaimChange={setPreviewClaimed}
            className="flex-1 sm:flex-none"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-end gap-2 pt-3">
      {productUrl && <ViewItem title={title} productUrl={productUrl} />}
      <ClaimToggleForm
        exchangeId={exchangeId}
        itemId={itemId}
        claimed={false}
        previewMode={previewMode}
        onPreviewClaimChange={setPreviewClaimed}
        className="flex-1 sm:flex-none"
      />
    </div>
  );
}
