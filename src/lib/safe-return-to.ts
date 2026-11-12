/** Return only a same-origin path suitable for an authentication callback. */
export function safeReturnTo(value: unknown, fallback = "/wishlists"): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\u0000-\u001f]/.test(value)) {
    return fallback;
  }
  try {
    const parsed = new URL(value, "https://secret-santa.invalid");
    if (parsed.origin !== "https://secret-santa.invalid") return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
