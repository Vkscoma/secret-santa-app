import { Duplex, PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { guardTunnel, resolvePinnedTarget } from "./pinned-proxy";

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


describe("proxy tunnel disconnect cleanup", () => {
  it.each(["client", "upstream"])("handles EPIPE when the %s peer disconnects during a write", async (failingSide) => {
    const broken = new Duplex({ read() {}, write(_chunk, _encoding, done) { done(Object.assign(new Error("write EPIPE"), { code: "EPIPE" })); } });
    const healthy = new PassThrough();
    const client = failingSide === "client" ? broken : healthy;
    const upstream = failingSide === "upstream" ? broken : healthy;
    guardTunnel(client, upstream);
    const closed = Promise.all([new Promise<void>((resolve) => client.once("close", resolve)), new Promise<void>((resolve) => upstream.once("close", resolve))]);
    client.pipe(upstream); upstream.pipe(client);
    healthy.write(Buffer.from("TLS bytes after peer disconnect"));
    await closed;
    expect(client.destroyed).toBe(true);
    expect(upstream.destroyed).toBe(true);
  });
});
