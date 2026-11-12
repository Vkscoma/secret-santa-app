export type ThreadMessage = { id: string; senderRole: string; body: string; sentAt: Date; readAt: Date | null };

/** Constructs the deliberately minimal public thread shape. Identity data is never accepted as input. */
export function messageThreadPayload(viewerRole: "giver" | "recipient", title: string, rows: ThreadMessage[]) {
  return {
    viewerRole,
    title,
    messages: rows.map(({ id, senderRole, body, sentAt, readAt }) => ({ id, senderRole, body, sentAt, readAt })),
  };
}
