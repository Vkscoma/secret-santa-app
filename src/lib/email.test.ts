import { describe, expect, it, vi } from "vitest";
import { deliverIdempotently } from "./email";

describe("email idempotency", () => {
  it("does not send again when the idempotency key is already claimed", async () => {
    const send = vi.fn(async () => undefined);
    const result = await deliverIdempotently({
      claim: async () => null,
      send,
      markSent: async () => undefined,
      markFailed: async () => undefined,
    });
    expect(result).toBe("duplicate");
    expect(send).not.toHaveBeenCalled();
  });

  it("records a failure and permits a later retry under the same key", async () => {
    const send = vi.fn().mockRejectedValueOnce(new Error("temporary provider outage")).mockResolvedValueOnce(undefined);
    const markFailed = vi.fn(async () => undefined);
    const markSent = vi.fn(async () => undefined);
    const first = await deliverIdempotently({ claim: async () => ({ id: "log-1" }), send, markSent, markFailed });
    const second = await deliverIdempotently({ claim: async () => ({ id: "log-1" }), send, markSent, markFailed });
    expect(first).toBe("failed");
    expect(second).toBe("sent");
    expect(send).toHaveBeenCalledTimes(2);
    expect(markFailed).toHaveBeenCalledOnce();
    expect(markSent).toHaveBeenCalledOnce();
  });
});
