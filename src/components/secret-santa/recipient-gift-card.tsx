import { Star } from "lucide-react";
import { ProductImage } from "@/components/secret-santa/product-image";
import { RecipientGiftCardActions } from "@/components/secret-santa/recipient-gift-card-actions";
import { WishlistPrice } from "@/components/secret-santa/wishlist-price";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { normalizeUnfurlUrl } from "@/lib/url-safety";

export type RecipientGiftItem = {
  id: string;
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

const priorities: Record<string, string> = {
  most_wanted: "Most wanted",
  would_like: "Would like",
  nice_to_have: "Nice to have",
};

export function safeRecipientProductUrl(value: string | null) {
  if (!value) return null;
  try {
    normalizeUnfurlUrl(value);
    return value;
  } catch {
    return null;
  }
}

export function safeRecipientProductImageUrl(value: string | null) {
  const safeUrl = safeRecipientProductUrl(value);
  return safeUrl ? new URL(safeUrl).toString() : null;
}

export function formatRecipientStore(value: string | null, productUrl: string | null) {
  const candidate = value
    ?.trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/$/, "");
  const host = productUrl ? new URL(productUrl).hostname.replace(/^www\./i, "") : "";
  const label =
    candidate && candidate.includes(".")
      ? (candidate.split("/")[0] ?? "").replace(/\.(com|net|org|co|shop|store)$/i, "")
      : candidate;
  const rawLabel = label || host.replace(/\.(com|net|org|co|shop|store)$/i, "");
  if (!rawLabel) return "Gift idea";
  const aliases: Record<string, string> = {
    katespadeoutlet: "Kate Spade Outlet",
    katespade: "Kate Spade",
    quince: "Quince",
  };
  const normalized = rawLabel.toLowerCase().replace(/[^a-z0-9]/g, "");
  return (
    aliases[normalized] ||
    rawLabel
      .split(/[._-]+/)
      .filter(Boolean)
      .map((word) => word[0]?.toUpperCase() + word.slice(1))
      .join(" ")
  );
}

export function formatRecipientGiftTitle(
  title: string,
  titlePending: boolean | undefined,
  store: string,
  productUrl: string | null
) {
  const candidate = title.trim();
  const host = productUrl ? new URL(productUrl).hostname.replace(/^www\./i, "").toLowerCase() : "";
  const candidateHost =
    candidate
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .split("/")[0]
      ?.toLowerCase() ?? "";
  const fallback =
    !candidate ||
    titlePending ||
    (host && candidateHost === host) ||
    /^https?:\/\//i.test(candidate) ||
    /^www\./i.test(candidate);
  return {
    title: fallback ? (store === "Gift idea" ? "Gift idea" : `Item from ${store}`) : candidate,
    isFallback: fallback,
  };
}

export function formatRecipientFirstName(displayName: string | null, fullName: string | null) {
  const full = fullName?.trim() ?? "";
  const display = displayName?.trim() ?? "";
  if (display) return display.split(/\s+/)[0] || null;
  if (full.includes(" ")) return full.split(/\s+/)[0] || display || null;
  return null;
}

export function RecipientGiftCard({
  item,
  exchangeId,
  claimed,
  budgetMax = null,
  claimable = true,
  compact = false,
  previewMode = false,
}: {
  item: RecipientGiftItem;
  exchangeId: string;
  claimed: boolean;
  budgetMax?: number | null;
  claimable?: boolean;
  compact?: boolean;
  previewMode?: boolean;
}) {
  const productUrl = safeRecipientProductUrl(item.url);
  const productImageUrl = safeRecipientProductImageUrl(item.imageUrl);
  const store = formatRecipientStore(item.storeName, productUrl);
  const titleResult = formatRecipientGiftTitle(
    item.title,
    item.previewTitlePending,
    store,
    productUrl
  );
  const hasStore = !titleResult.isFallback && store !== "Gift idea";
  const hasPrice =
    item.priceMin !== null ||
    item.priceMax !== null ||
    Boolean(item.previewPrice && item.previewCurrency && item.priceFetchedAt);
  const overBudget = budgetMax !== null && item.priceMin !== null && item.priceMin > budgetMax;

  return (
    <Card className={`flex flex-col gap-3 ${compact ? "p-3" : "p-3.5 sm:p-4"}`}>
      <div className="flex min-w-0 items-start gap-3">
        {productUrl ? (
          <a
            href={productUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`View ${titleResult.title} (opens in a new tab)`}
            className="focus-visible:ring-ring shrink-0 rounded-xl focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            <ProductImage
              src={productImageUrl}
              alt=""
              className="size-16 sm:size-[72px]"
              iconClassName="size-6"
              placeholderTone="muted"
            />
          </a>
        ) : (
          <ProductImage
            src={productImageUrl}
            alt=""
            className="size-16 sm:size-[72px]"
            iconClassName="size-6"
            placeholderTone="muted"
          />
        )}
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-base leading-snug font-bold">
            {productUrl ? (
              <a
                href={productUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="focus-visible:ring-ring rounded-sm hover:underline focus-visible:ring-2 focus-visible:outline-none"
                aria-label={`View ${titleResult.title} (opens in a new tab)`}
              >
                {titleResult.title}
              </a>
            ) : (
              titleResult.title
            )}
          </h3>
          <div className="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
            {hasStore && (
              <>
                <span>{store}</span>
                {hasPrice && <span aria-hidden="true">·</span>}
              </>
            )}
            <WishlistPrice
              minimum={item.priceMin}
              maximum={item.priceMax}
              previewPrice={item.previewPrice}
              previewCurrency={item.previewCurrency}
              fetchedAt={item.priceFetchedAt}
            />
            {hasPrice && <span aria-hidden="true">·</span>}
            <Badge variant="outline" className="px-2 py-0.5">
              {item.priority === "most_wanted" && (
                <Star className="fill-gold text-gold size-3" aria-hidden="true" />
              )}
              {priorities[item.priority] ?? "Would like"}
            </Badge>
            {overBudget && (
              <Badge variant="outline" className="bg-muted text-muted-foreground px-2 py-0.5">
                Over budget
              </Badge>
            )}
          </div>
          {!compact && item.notes && (
            <p className="text-muted-foreground mt-2 text-sm leading-5 whitespace-pre-wrap">
              {item.notes}
            </p>
          )}
        </div>
      </div>
      <RecipientGiftCardActions
        exchangeId={exchangeId}
        itemId={item.id}
        title={titleResult.title}
        productUrl={productUrl}
        claimed={claimed}
        claimable={claimable}
        previewMode={previewMode}
      />
    </Card>
  );
}
