// The light shared module keeps client code clear of the Sharp-backed image module.
import { isWishlistBlobUrl } from "@/lib/wishlist-image-url";

/**
 * Process a manually supplied image through the authenticated image API before saving details.
 * Skips the API (and its per-user rate limit) when the image is already hosted or unchanged.
 */
export async function prepareWishlistImage(form: FormData, options: { initialImageUrl?: string } = {}): Promise<void> {
  const raw = form.get("imageUrl");
  const imageUrl = typeof raw === "string" ? raw.trim() : "";
  if (!imageUrl || isWishlistBlobUrl(imageUrl)) return;
  if (options.initialImageUrl !== undefined && imageUrl === options.initialImageUrl.trim()) return;
  const imageForm = new FormData();
  imageForm.set("exchangeId", String(form.get("exchangeId") ?? ""));
  const itemId = form.get("itemId");
  if (typeof itemId === "string" && itemId) imageForm.set("itemId", itemId);
  imageForm.set("imageUrl", imageUrl);
  const response = await fetch("/api/wishlist-images/upload", { method: "POST", body: imageForm });
  const result = await response.json().catch(() => ({})) as { url?: string; error?: string };
  if (!response.ok || !result.url) throw new Error(result.error || "Could not save the product image.");
  form.set("imageUrl", result.url);
}
