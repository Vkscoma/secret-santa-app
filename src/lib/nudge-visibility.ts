export function shouldShowRecipientNudge(itemCount: number, recipientAllowsNudges = true) {
  return itemCount === 0 && recipientAllowsNudges;
}
