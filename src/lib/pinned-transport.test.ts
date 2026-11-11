import { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { unfurlTransportInternals } from "./unfurl";
import { wishlistImageInternals } from "./wishlist-images";

// Exercise Node's actual socket lookup contract, not an injected request mock. The
// low-level transport receives loopback only here; public URL guards are tested separately.
const server = createServer((_req, response) => {
  response.setHeader("Content-Type", "text/html");
  response.end("<html><title>Native pinned lookup works</title></html>");
});
let url: URL;
beforeAll(async () => {
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing test server port");
  url = new URL(`http://does-not-resolve.invalid:${address.port}/`);
});
afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); });

describe("native pinned socket family contract", () => {
  const pinned = { address: "127.0.0.1", family: 4 as const };
  it("fetches HTML with the production pinned lookup under Node automatic family selection", async () => {
    const result = await unfurlTransportInternals.readHtml(url, pinned, 1000, 1000);
    expect(result.statusCode).toBe(200);
    expect(result.body).toContain("Native pinned lookup works");
  });
  it("probes images through the same native lookup path", async () => {
    const result = await unfurlTransportInternals.probeRequest(url, pinned, "HEAD", 1000);
    expect(result.statusCode).toBe(200);
  });
  it("downloads images without the all-address callback shape mismatch", async () => {
    // Non-image content is rejected after a real successful connection.
    const result = await wishlistImageInternals.getPinnedImage(url, pinned);
    expect(result.statusCode).toBe(200);
    expect(result.contentType).toBe("text/html");
    expect(result.body.byteLength).toBe(0);
  });
});
