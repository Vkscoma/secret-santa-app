import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prepareWishlistImage } from "./prepare-wishlist-image";

const fetchMock = vi.fn();
const exchangeId = "11111111-1111-4111-8111-111111111111";
const itemId = "22222222-2222-4222-8222-222222222222";
function formWith(imageUrl: string) {
  const form = new FormData(); form.set("exchangeId", exchangeId); form.set("itemId", itemId); form.set("imageUrl", imageUrl);
  return form;
}
beforeEach(() => { vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("prepareWishlistImage", () => {
  it("skips an empty image URL", async () => {
    await prepareWishlistImage(formWith("  "));
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("skips an already hosted blob URL", async () => {
    const hosted = "https://abc123.public.blob.vercel-storage.com/wishlist/product.webp";
    const form = formWith(hosted);
    await prepareWishlistImage(form);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(form.get("imageUrl")).toBe(hosted);
  });
  it("does not treat a lookalike or insecure host as hosted", async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ url: "https://abc.public.blob.vercel-storage.com/x.webp" }), { status: 200 }));
    await prepareWishlistImage(formWith("http://abc.public.blob.vercel-storage.com/x.png"));
    await prepareWishlistImage(formWith("https://public.blob.vercel-storage.com.evil.example/x.png"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("skips an image URL unchanged from the saved item", async () => {
    await prepareWishlistImage(formWith("https://store.example/a.png"), { initialImageUrl: "https://store.example/a.png" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("uploads a new image URL and rewrites the form value", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ url: "https://abc.public.blob.vercel-storage.com/new.webp" }), { status: 200 }));
    const form = formWith("https://store.example/b.png");
    await prepareWishlistImage(form, { initialImageUrl: "https://store.example/a.png" });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/wishlist-images/upload");
    expect(init.method).toBe("POST");
    const body = init.body as FormData;
    expect(body.get("exchangeId")).toBe(exchangeId);
    expect(body.get("itemId")).toBe(itemId);
    expect(body.get("imageUrl")).toBe("https://store.example/b.png");
    expect(form.get("imageUrl")).toBe("https://abc.public.blob.vercel-storage.com/new.webp");
  });
  it("throws the API error message on failure", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: "Too many uploads. Try again in a minute." }), { status: 429 }));
    const form = formWith("https://store.example/c.png");
    await expect(prepareWishlistImage(form)).rejects.toThrow("Too many uploads. Try again in a minute.");
    expect(form.get("imageUrl")).toBe("https://store.example/c.png");
  });
});
