import { describe, expect, it, vi } from "vitest";
import { beginClaimActivity, isClaimsUiBusy, subscribeToClaimActivity } from "./claim-activity";

describe("claim activity store", () => {
  it("stays busy until every pending claim ends, ignoring repeated end calls", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToClaimActivity(listener);
    const endFirst = beginClaimActivity();
    const endSecond = beginClaimActivity();
    expect(isClaimsUiBusy()).toBe(true);

    endFirst();
    endFirst();
    expect(isClaimsUiBusy()).toBe(true);

    endSecond();
    expect(isClaimsUiBusy()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(4);
    unsubscribe();
  });
});
