import { ArrowUpRight, Star } from "lucide-react";
import { ProductImage } from "@/components/secret-santa/product-image";
import {
  formatRecipientGiftTitle,
  formatRecipientStore,
  safeRecipientProductImageUrl,
  safeRecipientProductUrl,
} from "@/components/secret-santa/recipient-gift-card";
import { WishlistPrice } from "@/components/secret-santa/wishlist-price";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type WishlistOwnerGiftItem = {
  title: string;
  previewTitlePending?: boolean;
  url: string | null;
  storeName: string | null;
  imageUrl: string | null;
  notes: string | null;
  priority: string;
  priceMin: number | null;
  priceMax: number | null;
  previewPrice: string | null;
  previewCurrency: string | null;
  priceFetchedAt: Date | null;
};

const priorityLabels: Record<string, string> = {
  most_wanted: "Most wanted",
  would_like: "Would like",
  nice_to_have: "Nice to have",
};

export function WishlistOwnerGiftCard({
  item,
  compact = false,
}: {
  item: WishlistOwnerGiftItem;
  compact?: boolean;
}) {
  const productUrl = safeRecipientProductUrl(item.url);
  const store = formatRecipientStore(item.storeName, productUrl);
  const title = formatRecipientGiftTitle(item.title, item.previewTitlePending, store, productUrl);

  return (
    <div className="flex min-w-0 items-start gap-3">
      <ProductImage
        src={safeRecipientProductImageUrl(item.imageUrl)}
        alt=""
        className="size-16 shrink-0 sm:size-[72px]"
        iconClassName="size-6"
        placeholderTone="muted"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
          <h3 className="min-w-0 flex-1 leading-snug font-bold break-words">{title.title}</h3>
          <Badge variant="outline" className="shrink-0 px-2 py-0.5">
            {item.priority === "most_wanted" && (
              <Star className="fill-gold text-gold size-3" aria-hidden="true" />
            )}
            {priorityLabels[item.priority] ?? "Would like"}
          </Badge>
        </div>
        <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
          {!title.isFallback && store !== "Gift idea" && (
            <>
              <span>{store}</span>
              {item.priceMin !== null || item.priceMax !== null ? (
                <span aria-hidden="true">·</span>
              ) : null}
            </>
          )}
          <WishlistPrice
            minimum={item.priceMin}
            maximum={item.priceMax}
            previewPrice={item.previewPrice}
            previewCurrency={item.previewCurrency}
            fetchedAt={item.priceFetchedAt}
          />
        </div>
        {!compact && item.notes && (
          <p className="text-muted-foreground mt-2 text-sm leading-5 whitespace-pre-wrap">
            {item.notes}
          </p>
        )}
        {!compact && productUrl && (
          <Button asChild variant="neutral" size="sm" className="mt-2 min-h-11">
            <a href={productUrl} target="_blank" rel="noopener noreferrer">
              Open product link <ArrowUpRight className="size-4" aria-hidden="true" />
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}
