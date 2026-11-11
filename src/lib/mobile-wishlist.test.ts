import { describe, expect, it } from "vitest";
import { firstHttpUrl, iosWishlistPayloadSchema, parseIosPayload } from "./mobile-wishlist";

describe("mobile wishlist entry parsing", () => {
  it("selects the first URL from shared text", () => {
    expect(firstHttpUrl("A great gift https://shop.example/item and https://other.example")).toBe("https://shop.example/item");
    expect(firstHttpUrl("javascript:alert(1)")).toBeNull();
  });

  it("validates the iOS shortcut payload and size", () => {
    const encoded = Buffer.from(JSON.stringify({ url: "https://shop.example/item", title: "A gift", price: 12 })).toString("base64url");
    expect(parseIosPayload(encoded)?.title).toBe("A gift");
    expect(parseIosPayload(Buffer.from(JSON.stringify({ url: "https://shop.example", image: "javascript:alert(1)" })).toString("base64url"))).toBeNull();
    expect(parseIosPayload("a".repeat(6000))).toBeNull();
    expect(iosWishlistPayloadSchema.safeParse({ url: "https://shop.example", extra: true }).success).toBe(false);
  });
});
