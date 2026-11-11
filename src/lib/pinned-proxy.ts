import { lookup as dnsLookup } from "node:dns/promises";
import { createServer, request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { connect as netConnect, isIP } from "node:net";
import { isPublicAddress, normalizeUnfurlUrl } from "@/lib/unfurl";

type Address = { address: string; family: number };
export type PinnedTarget = { hostname: string; port: number; address: string; family: number };

export async function resolvePinnedTarget(authority: string, lookup = (hostname: string) => dnsLookup(hostname, { all: true, verbatim: true })): Promise<PinnedTarget> {
  const initial = new URL(`https://${authority}/`);
  const requestedPort = Number(initial.port || 443);
  if (requestedPort !== 80 && requestedPort !== 443) throw new Error("Only ports 80 and 443 are allowed.");
  const url = normalizeUnfurlUrl(`${requestedPort === 80 ? "http" : "https"}://${authority}/`);
  const hostname = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  const port = requestedPort;
  if (port !== 80 && port !== 443) throw new Error("Only ports 80 and 443 are allowed.");
  let addresses: Address[];
  if (isIP(hostname)) addresses = [{ address: hostname, family: isIP(hostname) }];
  else addresses = await lookup(hostname);
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) throw new Error("Target must resolve only to public IP addresses.");
  const selected = addresses[0]!;
  return { hostname, port, address: selected.address, family: selected.family };
}

/** A loopback proxy that opens outbound sockets directly to validated DNS answers. */
export async function createPinnedProxy(lookup?: (hostname: string) => Promise<Address[]>) {
  const resolve = (authority: string) => resolvePinnedTarget(authority, lookup);
  const server = createServer((clientReq, clientRes) => {
    void (async () => {
      let target: PinnedTarget;
      try {
        const parsed = new URL(clientReq.url ?? "");
        if (clientReq.method !== "GET" && clientReq.method !== "HEAD") throw new Error("Only GET and HEAD are allowed.");
        target = await resolve(`${parsed.hostname}:${parsed.port || (parsed.protocol === "http:" ? "80" : "443")}`);
        const transport = parsed.protocol === "https:" ? httpsRequest : httpRequest;
        const headers = { ...clientReq.headers };
        delete headers["proxy-authorization"];
        delete headers["proxy-connection"];
        const upstream = transport(parsed, { method: clientReq.method, agent: false, headers, lookup: (_host, _opts, cb) => cb(null, target.address, target.family) }, (response) => {
          clientRes.writeHead(response.statusCode ?? 502, response.headers);
          response.pipe(clientRes);
        });
        upstream.on("error", () => { if (!clientRes.headersSent) clientRes.writeHead(502); clientRes.end(); });
        clientReq.pipe(upstream);
      } catch { clientRes.writeHead(403); clientRes.end(); }
    })();
  });
  const tunnels = new Set<ReturnType<typeof netConnect>>();
  server.on("connect", (req, client, head) => {
    void (async () => {
      let upstream: ReturnType<typeof netConnect> | undefined;
      try {
        const target = await resolve(req.url ?? "");
        upstream = netConnect({ host: target.address, port: target.port, family: target.family });
        tunnels.add(upstream);
        upstream.once("connect", () => {
          client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
          if (head.length) upstream!.write(head);
          client.pipe(upstream!);
          upstream!.pipe(client);
        });
        upstream.on("close", () => tunnels.delete(upstream!));
        upstream.on("error", () => client.destroy());
      } catch { client.end("HTTP/1.1 403 Forbidden\r\n\r\n"); upstream?.destroy(); }
    })();
  });
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => { server.removeListener("error", reject); resolveListen(); });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not start the pinned proxy.");
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolveClose) => {
      for (const tunnel of tunnels) tunnel.destroy();
      server.close(() => resolveClose());
    }),
  };
}
