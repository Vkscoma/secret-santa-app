import { isIP } from "node:net";

export class UnfurlSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnfurlSafetyError";
  }
}

function ipv4Number(address: string): number | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = (value * 256 + octet) >>> 0;
  }
  return value >>> 0;
}

function ipv4InSubnet(address: string, subnet: string, prefix: number): boolean {
  const value = ipv4Number(address);
  const base = ipv4Number(subnet);
  if (value === null || base === null) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (value & mask) === (base & mask);
}

function ipv6Words(input: string): number[] | null {
  let address = input.toLowerCase().split("%")[0] ?? "";
  if (address.startsWith("[") && address.endsWith("]")) address = address.slice(1, -1);
  if (address.includes(".")) {
    const lastColon = address.lastIndexOf(":");
    const v4 = address.slice(lastColon + 1);
    const value = ipv4Number(v4);
    if (value === null) return null;
    address = `${address.slice(0, lastColon)}:${(value >>> 16).toString(16)}:${(value & 0xffff).toString(16)}`;
  }
  const halves = address.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  if (halves.length === 1 && left.length !== 8) return null;
  const missing = 8 - left.length - right.length;
  if (halves.length === 2 && missing < 1) return null;
  const parts = halves.length === 2 ? [...left, ...Array(missing).fill("0"), ...right] : left;
  const words = parts.map((part) => /^[0-9a-f]{1,4}$/.test(part) ? Number.parseInt(part, 16) : -1);
  return words.length === 8 && words.every((word) => word >= 0) ? words : null;
}

function ipv6IsPublic(address: string): boolean {
  const words = ipv6Words(address);
  if (!words) return false;
  // Permit only global unicast (2000::/3), then exclude special-use/documentation blocks.
  if ((words[0]! & 0xe000) !== 0x2000) return false;
  if (words[0] === 0x2001 && words[1]! <= 0x01ff) return false; // IETF special-purpose 2001::/23
  if (words[0] === 0x2001 && words[1] === 0x0db8) return false; // documentation
  if (words[0] === 0x2001 && words[1] === 0x0002) return false; // benchmarking 2001:2::/48
  if (words[0] === 0x3fff) return false; // documentation 3fff::/20
  if (words[0] === 0x5f00) return false; // SRv6 5f00::/16
  if (words[0] === 0x2002) return false; // 6to4 embeds an IPv4 destination
  return true;
}

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const blocked: [string, number][] = [
      ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
      ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
      ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
      ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
    ];
    return !blocked.some(([subnet, prefix]) => ipv4InSubnet(address, subnet, prefix));
  }
  if (family === 6) return ipv6IsPublic(address);
  return false;
}

export function hostnameOf(url: URL) {
  return url.hostname.replace(/^\[|\]$/g, "").toLowerCase().replace(/\.$/, "");
}

export function normalizeUnfurlUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new UnfurlSafetyError("Enter a valid product URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnfurlSafetyError("Only HTTP and HTTPS links can be previewed.");
  }
  if (url.username || url.password) throw new UnfurlSafetyError("URLs with embedded credentials are not allowed.");
  const hostname = hostnameOf(url);
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    throw new UnfurlSafetyError("This host cannot be previewed.");
  }
  if (url.port && !((url.protocol === "http:" && url.port === "80") || (url.protocol === "https:" && url.port === "443"))) {
    throw new UnfurlSafetyError("Only standard web ports can be previewed.");
  }
  if (isIP(hostname) && !isPublicAddress(hostname)) throw new UnfurlSafetyError("Private or reserved network addresses are blocked.");
  url.hostname = hostname;
  return url;
}

