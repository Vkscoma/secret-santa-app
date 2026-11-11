import { describe, expect, it, vi } from "vitest";
import { createPasteSession, singlePastedUrl } from "./wishlist-paste-state";

describe("paste-to-add action identity", () => {
  it("shares one save between duplicate events and subsequent submit", async () => {
    const makeId = vi.fn(() => "same-item");
    const session = createPasteSession(makeId);
    const save = vi.fn(async () => {});
    await Promise.all([session.run("https://shop.example/item?size=M#blue", save), session.run("https://shop.example/item?size=M#blue", save)]);
    await session.run("https://shop.example/item?size=M#blue", save);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ itemId: "same-item", url: "https://shop.example/item?size=M#blue" });
  });
  it("retries a failed save with its original item identity", async () => {
    const session = createPasteSession(vi.fn().mockReturnValueOnce("first").mockReturnValueOnce("second"));
    const save = vi.fn().mockRejectedValueOnce(new Error("network error")).mockResolvedValueOnce(undefined);
    await expect(session.run("https://shop.example/item", save)).rejects.toThrow();
    await session.run("https://shop.example/item", save);
    expect(save.mock.calls.map(([action]) => action.itemId)).toEqual(["first", "first"]);
  });
  it("allows a separate wish after the user starts another action", async () => {
    const session = createPasteSession(vi.fn().mockReturnValueOnce("first").mockReturnValueOnce("second"));
    const save = vi.fn(async () => {});
    await session.run("https://shop.example/item", save); session.reset();
    await session.run("https://shop.example/item", save);
    expect(save).toHaveBeenCalledTimes(2);
  });
  it("only automatically adds a single web URL, preserving variants exactly", () => {
    expect(singlePastedUrl("https://shop.example/item?variant=Blue%20M#selection")).toBe("https://shop.example/item?variant=Blue%20M#selection");
    expect(singlePastedUrl("a cozy sweater")).toBeNull();
    expect(singlePastedUrl("https://one.example https://two.example")).toBeNull();
    expect(singlePastedUrl("javascript:alert(1)")).toBeNull();
    expect(singlePastedUrl("https://user:secret@shop.example/item")).toBeNull();
  });
});
