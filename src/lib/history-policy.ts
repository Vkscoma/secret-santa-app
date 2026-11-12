import type { exchanges } from "@/lib/schema";

type ExchangeHistoryStatus = typeof exchanges.$inferSelect.status;

export function isPastHistoryExchange(exchangeYear: number, currentYear: number, status: ExchangeHistoryStatus) {
  return exchangeYear < currentYear && status !== "open";
}

/** Auto reveal takes effect at the scheduled instant without exposing mappings early. */
export function mayShowSantaIdentity(
  status: ExchangeHistoryStatus,
  autoReveal: boolean,
  exchangeAt: Date,
  now = new Date(),
) {
  return status === "revealed" || status === "closed" || (autoReveal && exchangeAt.getTime() <= now.getTime());
}
