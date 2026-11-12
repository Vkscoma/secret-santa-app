export function shouldShowRecipientNudge(itemCount: number, recipientAllowsNudges = true, exchangeStatus = "drawn") {
  return itemCount === 0 && recipientAllowsNudges && (exchangeStatus === "drawn" || exchangeStatus === "revealed");
}
