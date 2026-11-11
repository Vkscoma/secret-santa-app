import { z } from "zod";

const httpUrlSchema = z.string().trim().url().max(2000).refine((value) => {
  try { return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; }
});

export const iosWishlistPayloadSchema = z.object({
  url: httpUrlSchema,
  title: z.string().trim().max(200).optional(),
  image: httpUrlSchema.optional(),
  price: z.union([z.string().trim().max(40), z.number().finite().nonnegative().max(1_000_000)]).optional(),
  currency: z.string().trim().max(8).optional(),
  brand: z.string().trim().max(100).optional(),
}).strict();

export type IosWishlistPayload = z.infer<typeof iosWishlistPayloadSchema>;

export function firstHttpUrl(...values: (string | null | undefined)[]): string | null {
  for (const value of values) {
    if (!value) continue;
    const match = value.match(/https?:\/\/[^\s<>"']+/i)?.[0]?.replace(/[),.;!?]+$/, "");
    if (match && httpUrlSchema.safeParse(match).success) return match;
  }
  return null;
}

export function parseIosPayload(encoded: string | null | undefined): IosWishlistPayload | null {
  if (!encoded || encoded.length > 5500) return null;
  try {
    const decoded = Buffer.from(encoded, "base64url").toString("utf8");
    if (Buffer.byteLength(decoded, "utf8") > 4096) return null;
    const parsed: unknown = JSON.parse(decoded);
    const result = iosWishlistPayloadSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function safeSharedTitle(value: string | null | undefined): string | undefined {
  const title = value?.trim().slice(0, 200);
  return title || undefined;
}
