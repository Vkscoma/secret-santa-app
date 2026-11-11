import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderUnfurlPage } from "./playwright-unfurl";

const mocks = vi.hoisted(() => ({ executablePath: vi.fn(), createProxy: vi.fn(), launch: vi.fn() }));
vi.mock("node:fs", () => ({ existsSync: () => false }));
vi.mock("@sparticuz/chromium", () => ({ default: { args: [], executablePath: mocks.executablePath } }));
vi.mock("playwright-core", () => ({ chromium: { executablePath: () => "/missing/chromium", launch: mocks.launch } }));
vi.mock("@/lib/pinned-proxy", () => ({ createPinnedProxy: mocks.createProxy }));

beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); });
afterEach(() => { vi.useRealTimers(); });

describe("renderer resource lifecycle", () => {
  it("clears the hard deadline after immediate launch preparation failure", async () => {
    mocks.executablePath.mockRejectedValueOnce(new Error("Binary unavailable"));
    await expect(renderUnfurlPage(new URL("https://example.com"))).resolves.toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("cannot create a proxy when binary resolution completes after the deadline", async () => {
    let resolvePath!: (value: string) => void;
    mocks.executablePath.mockReturnValueOnce(new Promise<string>((resolve) => { resolvePath = resolve; }));
    const result = renderUnfurlPage(new URL("https://example.com"));
    await vi.advanceTimersByTimeAsync(20_000);
    await expect(result).resolves.toBeNull();
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
