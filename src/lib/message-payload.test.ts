import { describe, expect, it } from "vitest";
import { messageThreadPayload } from "./message-payload";

describe("message thread privacy payload", () => {
  it("does not include giver identity in the recipient view before reveal", () => {
    const response = messageThreadPayload("recipient", "your Secret Santa", [{ id: "m1", senderRole: "giver", body: "Hello", sentAt: new Date(0), readAt: null }]);
    expect(response.title).toBe("your Secret Santa");
    expect(JSON.stringify(response)).not.toMatch(/giverId|recipientId|displayName|email|avatar|Secret Santa Name/);
    expect(response.messages[0]).toEqual({ id: "m1", senderRole: "giver", body: "Hello", sentAt: new Date(0), readAt: null });
  });
  it("returns only the explicit thread fields", () => {
    expect(Object.keys(messageThreadPayload("giver", "A recipient", [])).sort()).toEqual(["messages", "title", "viewerRole"]);
  });
});
