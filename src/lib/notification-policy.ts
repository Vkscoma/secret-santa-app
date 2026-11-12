export type ReminderMilestone = 14 | 7 | 1;

/**
 * A milestone becomes eligible when its threshold is crossed. Daily checks
 * normally send it at the next run. The grace period also lets a
 * failed delivery retry at the next check; stable delivery keys suppress any
 * reminder that was already sent. The one day reminder can arrive on exchange
 * day or up to five days after it.
 */
export function dueReminderMilestones(daysUntilExchange: number): ReminderMilestone[] {
  const windows: Array<{ milestone: ReminderMilestone; minDays: number; maxDays: number }> = [
    { milestone: 14, minDays: 8, maxDays: 14 },
    { milestone: 7, minDays: 1, maxDays: 7 },
    { milestone: 1, minDays: -5, maxDays: 1 },
  ];
  return windows
    .filter(({ minDays, maxDays }) => daysUntilExchange >= minDays && daysUntilExchange <= maxDays)
    .map(({ milestone }) => milestone);
}

export function reminderIdempotencyKey(exchangeId: string, userId: string, milestone: ReminderMilestone) {
  return `reminder:${exchangeId}:${userId}:${milestone}`;
}

export function wishlistDigestIdempotencyKey(exchangeId: string, giverId: string, localDate: string) {
  return `wishlist-digest:${exchangeId}:${giverId}:${localDate}`;
}

export type WishlistDigestCandidate = { giverId: string; email: string; key: string };

/** Retry old keys first; send at most one digest per giver in a scheduler run. */
export function selectWishlistDigestCandidates(
  fresh: WishlistDigestCandidate[],
  retries: WishlistDigestCandidate[],
) {
  const retryKeys = new Set(retries.map(({ key }) => key));
  const byKey = new Map<string, WishlistDigestCandidate>();
  for (const candidate of retries) byKey.set(candidate.key, candidate);
  for (const candidate of fresh) byKey.set(candidate.key, candidate);
  const candidates = [...byKey.values()].sort((left, right) => {
    const leftIsRetry = retryKeys.has(left.key);
    const rightIsRetry = retryKeys.has(right.key);
    if (leftIsRetry !== rightIsRetry) return leftIsRetry ? -1 : 1;
    return left.key.localeCompare(right.key);
  });
  const perGiver = new Map<string, WishlistDigestCandidate>();
  for (const candidate of candidates) {
    if (!perGiver.has(candidate.giverId)) perGiver.set(candidate.giverId, candidate);
  }
  return [...perGiver.values()];
}
