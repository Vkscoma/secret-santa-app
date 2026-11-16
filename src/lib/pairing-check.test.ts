import { describe, expect, it } from "vitest";
import { evaluatePairings } from "./pairing-check";

describe("evaluatePairings", () => {
  it("passes a complete draw with no self-pairings or excluded pairs", () => {
    const result = evaluatePairings(
      ["A", "B"],
      [{ giverId: "A", receiverId: "B" }, { giverId: "B", receiverId: "A" }],
      [],
    );

    expect(result).toMatchObject({
      participantCount: 2,
      pairingCount: 2,
      allPassed: true,
      failedRuleCount: 0,
      affectedParticipantCount: 0,
    });
    expect(result.rules.every(({ passed }) => passed)).toBe(true);
  });

  it("counts people affected by every failed rule without returning names or IDs", () => {
    const result = evaluatePairings(
      ["A", "B", "C"],
      [
        { giverId: "A", receiverId: "A" },
        { giverId: "A", receiverId: "B" },
        { giverId: "outside", receiverId: "C" },
      ],
      [{ giverId: "A", receiverId: "B" }],
    );

    expect(result.allPassed).toBe(false);
    expect(result.failedRuleCount).toBe(4);
    expect(result.rules).toMatchObject([
      { key: "gives_once", passed: false, affectedCount: 3 },
      { key: "receives_once", passed: true, affectedCount: 0 },
      { key: "no_self_assignment", passed: false, affectedCount: 1 },
      { key: "exclusions", passed: false, affectedCount: 2 },
      { key: "current_participants", passed: false, affectedCount: 1 },
    ]);
    expect(result.affectedParticipantCount).toBe(4);
    expect(JSON.stringify(result)).not.toMatch(/outside|giverId|receiverId|"A"|"B"|"C"/);
  });
});
