import { randomInt } from "node:crypto";

export type DrawPair = { giverId: string; receiverId: string };
export type DrawConstraints = {
  participantIds: string[];
  exclusions?: DrawPair[];
  previousPairs?: DrawPair[];
};

export class DrawImpossibleError extends Error {
  constructor(message = "No valid Secret Santa draw exists for these participants and exclusions.") {
    super(message);
    this.name = "DrawImpossibleError";
  }
}

function secureShuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = randomInt(index + 1);
    [result[index], result[other]] = [result[other]!, result[index]!];
  }
  return result;
}

function findRandomPerfectMatching(
  participants: string[],
  forbidden: Set<string>
): Map<string, string> | null {
  const receiversByGiver = new Map<string, string[]>();
  for (const giver of participants) {
    receiversByGiver.set(
      giver,
      secureShuffle(participants.filter((receiver) => receiver !== giver && !forbidden.has(`${giver}\0${receiver}`)))
    );
  }

  const giverByReceiver = new Map<string, string>();
  function place(giver: string, seenReceivers: Set<string>): boolean {
    for (const receiver of receiversByGiver.get(giver) ?? []) {
      if (seenReceivers.has(receiver)) continue;
      seenReceivers.add(receiver);
      const previousGiver = giverByReceiver.get(receiver);
      if (!previousGiver || place(previousGiver, seenReceivers)) {
        giverByReceiver.set(receiver, giver);
        return true;
      }
    }
    return false;
  }

  for (const giver of secureShuffle(participants)) {
    if (!place(giver, new Set())) return null;
  }

  const receiverByGiver = new Map<string, string>();
  for (const [receiver, giver] of giverByReceiver) receiverByGiver.set(giver, receiver);
  return receiverByGiver;
}

/**
 * Produce a cryptographically randomized one-to-one assignment. Pairings from
 * the two previous years are excluded when they still permit a full matching.
 * If they make a draw impossible, the algorithm retries without that preference.
 */
export function drawSecretSanta({ participantIds, exclusions = [], previousPairs = [] }: DrawConstraints): DrawPair[] {
  const participants = [...participantIds];
  if (participants.length < 2) {
    throw new DrawImpossibleError("At least two participants are required to draw names.");
  }
  if (new Set(participants).size !== participants.length || participants.some((id) => !id)) {
    throw new Error("Participant IDs must be non-empty and unique.");
  }
  const participantSet = new Set(participants);
  for (const pair of [...exclusions, ...previousPairs]) {
    if (!participantSet.has(pair.giverId) || !participantSet.has(pair.receiverId)) {
      throw new Error("Draw constraints must only refer to current participants.");
    }
  }

  const excludedPairs = new Set(exclusions.map(({ giverId, receiverId }) => `${giverId}\0${receiverId}`));
  const priorPairs = new Set(previousPairs.map(({ giverId, receiverId }) => `${giverId}\0${receiverId}`));
  const preferredForbidden = new Set([...excludedPairs, ...priorPairs]);
  const matching = findRandomPerfectMatching(participants, preferredForbidden)
    ?? findRandomPerfectMatching(participants, excludedPairs);

  if (!matching) throw new DrawImpossibleError();
  return participants.map((giverId) => ({ giverId, receiverId: matching.get(giverId)! }));
}
