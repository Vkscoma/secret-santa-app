import { describe, expect, it } from "vitest";
import { drawSecretSanta, DrawImpossibleError, type DrawPair } from "./draw";

function expectValidDraw(participants: string[], result: DrawPair[], exclusions: DrawPair[] = []) {
  expect(result).toHaveLength(participants.length);
  expect(new Set(result.map(({ giverId }) => giverId))).toEqual(new Set(participants));
  expect(new Set(result.map(({ receiverId }) => receiverId))).toEqual(new Set(participants));
  for (const { giverId, receiverId } of result) {
    expect(receiverId).not.toBe(giverId);
    expect(exclusions).not.toContainEqual({ giverId, receiverId });
  }
}

describe("secure Secret Santa draw", () => {
  it("returns a one-to-one assignment with no self-assignment", () => {
    const participants = ["a", "b", "c", "d", "e"];
    expectValidDraw(participants, drawSecretSanta({ participantIds: participants }));
  });

  it("honors exclusions", () => {
    const participants = ["a", "b", "c", "d"];
    const exclusions = [
      { giverId: "a", receiverId: "b" },
      { giverId: "c", receiverId: "d" },
      { giverId: "d", receiverId: "a" },
    ];
    expectValidDraw(participants, drawSecretSanta({ participantIds: participants, exclusions }), exclusions);
  });

  it("avoids previous-year pairings when another full draw exists", () => {
    const participants = ["a", "b", "c"];
    const previousPairs = [
      { giverId: "a", receiverId: "b" },
      { giverId: "b", receiverId: "c" },
      { giverId: "c", receiverId: "a" },
    ];
    const result = drawSecretSanta({ participantIds: participants, previousPairs });
    expectValidDraw(participants, result);
    for (const pair of previousPairs) expect(result).not.toContainEqual(pair);
  });

  it("falls back to a valid assignment when prior-pair avoidance is impossible", () => {
    const participants = ["a", "b"];
    const previousPairs = [
      { giverId: "a", receiverId: "b" },
      { giverId: "b", receiverId: "a" },
    ];
    expectValidDraw(participants, drawSecretSanta({ participantIds: participants, previousPairs }));
  });

  it("rejects impossible exclusions", () => {
    const participants = ["a", "b", "c"];
    const exclusions = participants.flatMap((giverId) =>
      participants.filter((receiverId) => receiverId !== giverId).map((receiverId) => ({ giverId, receiverId }))
    );
    expect(() => drawSecretSanta({ participantIds: participants, exclusions })).toThrow(DrawImpossibleError);
  });

  it("handles thousands of varied, feasible participant/exclusion sets from 2 through 30", () => {
    for (let run = 0; run < 2_000; run += 1) {
      const count = 2 + (run % 29);
      const participants = Array.from({ length: count }, (_, index) => `p${index}`);
      const knownReceiverIndex = (index: number) => (index + 1 + (run % (count - 1))) % count;
      const exclusions = participants.flatMap((giverId, giverIndex) =>
        participants.flatMap((receiverId, receiverIndex) => {
          const isKnownValidPair = receiverIndex === knownReceiverIndex(giverIndex);
          const exclude = !isKnownValidPair && ((giverIndex * 31 + receiverIndex * 17 + run * 13) % 7 === 0);
          return exclude ? [{ giverId, receiverId }] : [];
        })
      );
      const result = drawSecretSanta({ participantIds: participants, exclusions });
      expectValidDraw(participants, result, exclusions);
    }
  });

  it("uses randomized matchings across repeated draws", () => {
    const participants = ["a", "b", "c", "d", "e"];
    const outcomes = new Set(
      Array.from({ length: 40 }, () => drawSecretSanta({ participantIds: participants })
        .sort((left, right) => left.giverId.localeCompare(right.giverId))
        .map(({ receiverId }) => receiverId).join(","))
    );
    expect(outcomes.size).toBeGreaterThan(1);
  });
});
