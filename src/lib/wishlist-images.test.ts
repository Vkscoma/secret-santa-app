import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { MAX_WISHLIST_UPLOAD_BYTES, wishlistImageInternals } from "@/lib/wishlist-images";

describe("wishlist image processing", () => {
  it("normalizes uploads to WebP within the 800px limit", async () => {
    const source = await sharp({ create: { width: 1200, height: 900, channels: 3, background: "#c3475c" } }).png().toBuffer();
    const result = await wishlistImageInternals.convertToWebp(source);
    const metadata = await sharp(result).metadata();
    expect(metadata.format).toBe("webp");
    expect(metadata.width).toBeLessThanOrEqual(800);
    expect(metadata.height).toBeLessThanOrEqual(800);
  });

  it("sets a server-side upload cap of five megabytes", () => {
    expect(MAX_WISHLIST_UPLOAD_BYTES).toBe(5 * 1024 * 1024);
  });
});
