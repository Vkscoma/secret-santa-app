import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRenderByteBudget, renderUnfurlPage } from "./playwright-unfurl";

const mocks = vi.hoisted(() => ({ executablePath: vi.fn(), createProxy: vi.fn(), launch: vi.fn() }));
vi.mock("node:fs", () => ({ existsSync: () => false }));
vi.mock("@sparticuz/chromium", () => ({ default: { args: [], executablePath: mocks.executablePath } }));
vi.mock("playwright-core", () => ({ chromium: { executablePath: () => "/missing/chromium", launch: mocks.launch } }));
vi.mock("@/lib/pinned-proxy", () => ({ createPinnedProxy: mocks.createProxy }));

beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); vi.spyOn(console, "warn").mockImplementation(() => undefined); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("render byte budget", () => {
  const limits = { documentBytes: 100, totalBytes: 1_000, hardStopBytes: 1_500 };
  it("does not count subresource bytes against the document cap", () => {
    const budget = createRenderByteBudget(limits);
    budget.trackRequest("doc", true);
    budget.trackRequest("bundle", false);
    expect(budget.addBytes("doc", 90)).toBeNull();
    expect(budget.addBytes("bundle", 500)).toBeNull();
    expect(budget.totals()).toEqual({ documentBytes: 90, totalBytes: 590 });
    expect(budget.softCap()).toBeNull();
  });
  it("reports the document cap once and marks an unfinished document incomplete", () => {
    const budget = createRenderByteBudget(limits);
    budget.trackRequest("doc", true);
    expect(budget.addBytes("doc", 60)).toBeNull();
    expect(budget.addBytes("doc", 41)).toBe("document_byte_cap");
    expect(budget.addBytes("doc", 10)).toBeNull();
    expect(budget.softCap()).toBe("document_byte_cap");
    expect(budget.documentIncomplete()).toBe(true);
  });
  it("treats a total-cap stop after the document finished as complete markup", () => {
    const budget = createRenderByteBudget(limits);
    budget.trackRequest("doc", true);
    budget.addBytes("doc", 50);
    budget.trackFinished("doc");
    expect(budget.addBytes("a", 600)).toBeNull();
    expect(budget.addBytes("b", 401)).toBe("total_byte_cap");
    expect(budget.softCap()).toBe("total_byte_cap");
    expect(budget.documentIncomplete()).toBe(false);
  });
  it("hard-stops bytes that keep streaming after a soft stop", () => {
    const budget = createRenderByteBudget(limits);
    expect(budget.addBytes("a", 1_001)).toBe("total_byte_cap");
    expect(budget.addBytes("a", 400)).toBeNull();
    expect(budget.addBytes("a", 100)).toBe("hard_byte_cap");
    expect(budget.addBytes("a", 100)).toBeNull();
  });
  it("counts bytes for untracked requests against the total only", () => {
    const budget = createRenderByteBudget(limits);
    expect(budget.addBytes("unknown", 500)).toBeNull();
    expect(budget.totals()).toEqual({ documentBytes: 0, totalBytes: 500 });
    expect(budget.documentIncomplete()).toBe(false);
  });
  it("never stops a main document by declared length, only oversized subresources", () => {
    const budget = createRenderByteBudget(limits);
    expect(budget.checkContentLength(5_000, true)).toBeNull();
    expect(budget.checkContentLength(1_000, false)).toBeNull();
    budget.addBytes("a", 400);
    expect(budget.checkContentLength(601, false)).toBe("total_byte_cap");
    expect(budget.checkContentLength(2_000, false)).toBeNull();
  });
});

describe("renderer resource lifecycle", () => {
  it("clears the hard deadline after immediate launch preparation failure", async () => {
    mocks.executablePath.mockRejectedValueOnce(new Error("Binary unavailable"));
    await expect(renderUnfurlPage(new URL("https://example.com/item?token=secret"))).resolves.toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    expect(console.warn).toHaveBeenCalledWith("[unfurl] Rendered preview unavailable for example.com: launch_failed");
  });
  it("cannot create a proxy when binary resolution completes after the deadline", async () => {
    let resolvePath!: (value: string) => void;
    mocks.executablePath.mockReturnValueOnce(new Promise<string>((resolve) => { resolvePath = resolve; }));
    const result = renderUnfurlPage(new URL("https://example.com"));
    await vi.advanceTimersByTimeAsync(20_000);
    await expect(result).resolves.toBeNull();
    expect(console.warn).toHaveBeenCalledWith("[unfurl] Rendered preview unavailable for example.com: timeout");
    resolvePath("/late/chromium");
    await Promise.resolve(); await Promise.resolve();
    expect(mocks.createProxy).not.toHaveBeenCalled();
    expect(mocks.launch).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("closes a proxy whose creation completes after the deadline", async () => {
    mocks.executablePath.mockResolvedValueOnce("/chromium");
    let resolveProxy!: (value: { url: string; close: ReturnType<typeof vi.fn> }) => void;
    mocks.createProxy.mockReturnValueOnce(new Promise((resolve) => { resolveProxy = resolve; }));
    const result = renderUnfurlPage(new URL("https://example.com"));
    await vi.advanceTimersByTimeAsync(20_000);
    await expect(result).resolves.toBeNull();
    const close = vi.fn(async () => undefined);
    resolveProxy({ url: "http://127.0.0.1:1", close });
    await Promise.resolve(); await Promise.resolve();
    expect(close).toHaveBeenCalledOnce();
    expect(mocks.launch).not.toHaveBeenCalled();
  });
});
