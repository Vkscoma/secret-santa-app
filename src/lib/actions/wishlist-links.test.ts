import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPastedWishlistItem, enrichWishlistItem, refreshWishlistItemImage, updateWishlistItem } from "./wishlists";

const mocks = vi.hoisted(() => ({ rows: [] as unknown[][], inserted: [] as unknown[], updated: [] as unknown[], conditions: [] as unknown[], preview: vi.fn(), previewUrl: vi.fn(), storeImage: vi.fn(), rate: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/authz", () => ({ requireExchangeMember: vi.fn(async () => ({ user: { id: "owner" } })) }));
vi.mock("@/lib/auth-rate-limit", () => ({ consumeAuthRateLimit: mocks.rate }));
vi.mock("@/lib/unfurl", async (original) => ({ ...await original<typeof import("@/lib/unfurl")>(), unfurlUrl: mocks.previewUrl }));
vi.mock("@/lib/unfurl-preview", () => ({ getCachedLinkPreview: mocks.preview }));
vi.mock("@/lib/wishlist-images", () => ({ storeProductImage: mocks.storeImage }));
vi.mock("@/lib/db", () => ({ db: {
  select: () => {
    const result = { from: () => result, innerJoin: () => result, where: () => result, orderBy: () => result, limit: async () => mocks.rows.shift() ?? [] };
    return result;
  },
  insert: () => ({ values: (value: unknown) => { mocks.inserted.push(value); return { onConflictDoNothing: async () => undefined }; } }),
  update: () => ({ set: (value: unknown) => { mocks.updated.push(value); return { where: async (condition: unknown) => { mocks.conditions.push(condition); return []; } }; } }),
} }));
const exchangeId = "11111111-1111-4111-8111-111111111111";
const itemId = "22222222-2222-4222-8222-222222222222";
const url = "https://store.example/item?variant=red&utm_source=test#size-large";
const wishlistId = "33333333-3333-4333-8333-333333333333";
function accessRows() { return [[{ status: "open" }], [{ id: "member" }]]; }
beforeEach(() => { mocks.rows.length = 0; mocks.inserted.length = 0; mocks.updated.length = 0; mocks.conditions.length = 0; mocks.rate.mockResolvedValue(true); mocks.storeImage.mockResolvedValue("https://images.example/product.webp"); mocks.preview.mockResolvedValue({ title: "Actual product", imageUrl: null, price: "19.95", currency: "EUR", fetchedAt: "2026-11-11T12:00:00.000Z", reason: null, fieldSources: { title: "meta" }, debug: { finalUrl: "https://store.example/final" } }); });

describe("pasted wish persistence", () => {
  it("saves the exact link and retries the same intent without a second item insert", async () => {
    mocks.rows.push(...accessRows(), [{ id: wishlistId }], [], [{ sortOrder: 2 }], [{ wishlistId, url }]);
    expect(await createPastedWishlistItem({ exchangeId, itemId, url })).toEqual({ ok: true, itemId });
    expect(mocks.inserted.at(-1)).toMatchObject({ id: itemId, url, title: "store.example", wishlistId });
    mocks.rows.push(...accessRows(), [{ id: wishlistId }], [{ id: itemId, wishlistId, url }]);
    expect(await createPastedWishlistItem({ exchangeId, itemId, url })).toEqual({ ok: true, itemId });
    expect(mocks.inserted.filter((value) => (value as { id?: string }).id === itemId)).toHaveLength(1);
  });
  it("cannot reuse an item id belonging to another wishlist", async () => {
    mocks.rows.push(...accessRows(), [{ id: wishlistId }], [{ id: itemId, wishlistId: "someone-else", url }]);
    expect((await createPastedWishlistItem({ exchangeId, itemId, url })).ok).toBe(false);
    expect(mocks.inserted).toHaveLength(1); // ensureWishlist only
    expect(mocks.updated).toHaveLength(0);
  });
  it("keeps edited title and notes and preserves decimal price/currency with provenance", async () => {
    mocks.rows.push(...accessRows(), [{ item: { url, title: "My chosen title", notes: "My note", imageUrl: null, priceMin: null, priceMax: null, previewPrice: null }, revision: "12345" }]);
    expect((await enrichWishlistItem({ exchangeId, itemId })).ok).toBe(true);
    const values = mocks.updated[0] as Record<string, Parameters<PgDialect["sqlToQuery"]>[0]>;
    const dialect = new PgDialect();
    expect(dialect.sqlToQuery(values.previewPrice!).params).toContain("19.95");
    expect(dialect.sqlToQuery(values.previewCurrency!).params).toContain("EUR");
    expect(dialect.sqlToQuery(values.priceFetchedAt!).params).toContain("2026-11-11T12:00:00.000Z");
    expect(mocks.updated[0]).not.toHaveProperty("title");
    expect(mocks.updated[0]).not.toHaveProperty("notes");
  });
  it("guards title by exact row revision while allowing a missing image to fill after unrelated edits", async () => {
    mocks.rows.push(...accessRows(), [{ item: { url, title: "store.example", notes: null, previewTitlePending: true, imageUrl: null, priceMin: 5, priceMax: 10 }, revision: "12345" }]);
    mocks.preview.mockResolvedValueOnce({ title: "Actual product", imageUrl: "https://images.example/a.png", price: null, currency: null, fetchedAt: "2026-11-11T12:00:00.000Z", reason: null, fieldSources: { title: "meta" }, debug: { finalUrl: url } });
    await enrichWishlistItem({ exchangeId, itemId });
    const values = mocks.updated[0] as Record<string, Parameters<PgDialect["sqlToQuery"]>[0]>;
    const dialect = new PgDialect();
    const titleQuery = dialect.sqlToQuery(values.title!);
    expect(titleQuery.sql).toContain('"wishlist_item".xmin::text');
    expect(titleQuery.params).toContain("12345");
    const imageQuery = dialect.sqlToQuery(values.imageUrl!);
    expect(imageQuery.sql).toContain('case when "wishlist_item"."image_url" is null');
    expect(imageQuery.sql).not.toContain("xmin");
    expect(values).not.toHaveProperty("notes");
    expect(values).not.toHaveProperty("previewPrice");
    const condition = dialect.sqlToQuery(mocks.conditions[0] as Parameters<PgDialect["sqlToQuery"]>[0]);
    expect(condition.params).toContain(url);
  });
  it("does not replace an explicit hostname title edited before enrichment starts", async () => {
    mocks.rows.push(...accessRows(), [{ item: { url, title: "store.example", previewTitlePending: false, notes: "Edit", imageUrl: null }, revision: "999" }]);
    await enrichWishlistItem({ exchangeId, itemId });
    expect(mocks.updated[0]).not.toHaveProperty("title");
  });
  it("keeps source price provenance on a title/note-only manual update", async () => {
    mocks.rows.push(...accessRows(), [{ id: itemId, url }]);
    const form = new FormData();
    for (const [key, value] of Object.entries({ exchangeId, itemId, title: "My title", url, notes: "My note", imageUrl: "", storeName: "store.example", priority: "would_like", priceMin: "", priceMax: "" })) form.set(key, value);
    await updateWishlistItem(form);
    expect(mocks.updated[0]).toMatchObject({ title: "My title", notes: "My note", previewTitlePending: false });
    expect(mocks.updated[0]).not.toHaveProperty("previewPrice");
    expect(mocks.updated[0]).not.toHaveProperty("priceFetchedAt");
    expect(mocks.updated[0]).not.toHaveProperty("previewFinalUrl");
  });
  it.each([true, false])("refresh fills a pending hostname title only when eligible=%s", async (pending) => {
    mocks.rows.push(...accessRows(), [{ id: itemId, url, imageUrl: null, previewTitlePending: pending, revision: "123" }]);
    mocks.previewUrl.mockResolvedValueOnce({ title: "Correct product title", imageUrl: "https://images.example/product.jpg", reason: null, fieldSources: { title: "html-title" } });
    const form = new FormData(); form.set("exchangeId", exchangeId); form.set("itemId", itemId);
    expect((await refreshWishlistItemImage({ message: "", error: false }, form)).error).toBe(false);
    const patch = mocks.updated[0] as Record<string, Parameters<PgDialect["sqlToQuery"]>[0]>;
    if (pending) {
      const query = new PgDialect().sqlToQuery(patch.title!);
      expect(query.sql).toContain('"wishlist_item".xmin::text');
      expect(query.sql).toContain('"wishlist_item"."preview_title_pending"');
      expect(query.params).toContain("Correct product title");
      expect(query.params).toContain("123");
    } else expect(patch).not.toHaveProperty("title");
    expect(patch).toHaveProperty("imageUrl");
    const condition = new PgDialect().sqlToQuery(mocks.conditions[0] as Parameters<PgDialect["sqlToQuery"]>[0]);
    expect(condition.params).toContain(url);
    expect(condition.sql).toContain('"wishlist_item"."image_url" is null');
  });
  it.each([["blocked", "blocked the preview request"], ["timeout", "too long to respond"], ["not_html", "did not return a web page"], ["no_metadata", "No usable product image"]])("reports the real %s refresh outcome", async (reason, expected) => {
    mocks.rows.push(...accessRows(), [{ id: itemId, url, imageUrl: null }]);
    mocks.previewUrl.mockResolvedValueOnce({ imageUrl: null, reason });
    const form = new FormData(); form.set("exchangeId", exchangeId); form.set("itemId", itemId);
    const result = await refreshWishlistItemImage({ message: "", error: false }, form);
    expect(result.error).toBe(true); expect(result.message).toContain(expected);
    expect(mocks.updated).toHaveLength(0);
  });
  it("leaves a manually named usable wish when fetching fails", async () => {
    mocks.rows.push(...accessRows(), [{ item: { url, title: "store.example", imageUrl: null }, revision: "12" }]);
    mocks.preview.mockRejectedValueOnce(new Error("Timeout"));
    const result = await enrichWishlistItem({ exchangeId, itemId });
    expect(result).toMatchObject({ ok: false, itemId });
    expect(mocks.updated).toHaveLength(0);
  });
});
