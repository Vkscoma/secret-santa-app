import { describe, expect, it, vi } from "vitest";
import { resolvePinnedTarget } from "./pinned-proxy";

describe("pinned Chromium proxy target resolution", () => {
  it("returns the exact public DNS answer that the proxy connects to", async () => {
    const lookup = vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]);
    await expect(resolvePinnedTarget("example.com:443", lookup)).resolves.toEqual({
      hostname: "example.com", port: 443, address: "93.184.216.34", family: 4,
    });
    expect(lookup).toHaveBeenCalledWith("example.com");
  });

  it("allows a standard HTTP port 80 target", async () => {
    await expect(resolvePinnedTarget("example.com:80", async () => [{ address: "93.184.216.34", family: 4 }])).resolves.toMatchObject({ port: 80 });
  });

  it("rejects a host when any DNS answer is private", async () => {
    await expect(resolvePinnedTarget("example.com", async () => [
      { address: "93.184.216.34", family: 4 }, { address: "127.0.0.1", family: 4 },
    ])).rejects.toThrow(/public IP/);
  });

  it.each(["example.com:22", "127.0.0.1:443", "localhost:443"]) (
    "rejects unsafe proxy authority %s", async (authority) => {
      await expect(resolvePinnedTarget(authority, async () => [{ address: "93.184.216.34", family: 4 }])).rejects.toThrow();
    },
  );
});
