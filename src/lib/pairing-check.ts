export type PairingRow = { giverId: string; receiverId: string };
export type ExclusionPair = { giverId: string; receiverId: string };

export type PairingRuleResult = {
  key: "gives_once" | "receives_once" | "no_self_assignment" | "exclusions" | "current_participants";
  label: string;
  passed: boolean;
  affectedCount: number;
};

export type PairingCheckResult = {
  participantCount: number;
  pairingCount: number;
  allPassed: boolean;
  failedRuleCount: number;
  affectedParticipantCount: number;
  rules: PairingRuleResult[];
};

export type PairingCheckState = {
  error?: string;
  result?: PairingCheckResult;
};

/** Returns aggregate counts only; IDs and pairings never leave this function. */
export function evaluatePairings(
  participantIds: string[],
  pairings: PairingRow[],
  exclusions: ExclusionPair[]
): PairingCheckResult {
  const participantSet = new Set(participantIds);
  const giverCounts = new Map<string, number>();
  const receiverCounts = new Map<string, number>();

  for (const pairing of pairings) {
    giverCounts.set(pairing.giverId, (giverCounts.get(pairing.giverId) ?? 0) + 1);
    receiverCounts.set(pairing.receiverId, (receiverCounts.get(pairing.receiverId) ?? 0) + 1);
  }

  const giverAffected = new Set(participantIds.filter((id) => giverCounts.get(id) !== 1));
  const receiverAffected = new Set(participantIds.filter((id) => receiverCounts.get(id) !== 1));
  const selfAffected = new Set<string>();
  const excludedAffected = new Set<string>();
  const nonParticipantAffected = new Set<string>();
  const exclusionKeys = new Set(exclusions.map(({ giverId, receiverId }) => `${giverId}\0${receiverId}`));

  for (const { giverId, receiverId } of pairings) {
    if (giverId === receiverId) selfAffected.add(giverId);
    if (exclusionKeys.has(`${giverId}\0${receiverId}`)) {
      excludedAffected.add(giverId);
      excludedAffected.add(receiverId);
    }
    if (!participantSet.has(giverId)) nonParticipantAffected.add(giverId);
    if (!participantSet.has(receiverId)) nonParticipantAffected.add(receiverId);
  }

  const rules: PairingRuleResult[] = [
    { key: "gives_once", label: "Every participant gives exactly one gift", passed: giverAffected.size === 0, affectedCount: giverAffected.size },
    { key: "receives_once", label: "Every participant receives exactly one gift", passed: receiverAffected.size === 0, affectedCount: receiverAffected.size },
    { key: "no_self_assignment", label: "No one is assigned to themselves", passed: selfAffected.size === 0, affectedCount: selfAffected.size },
    { key: "exclusions", label: "All exclusion rules are respected", passed: excludedAffected.size === 0, affectedCount: excludedAffected.size },
    { key: "current_participants", label: "Every assigned person is a current participant", passed: nonParticipantAffected.size === 0, affectedCount: nonParticipantAffected.size },
  ];
  const failed = rules.filter(({ passed }) => !passed);
  const affected = new Set<string>([
    ...giverAffected,
    ...receiverAffected,
    ...selfAffected,
    ...excludedAffected,
    ...nonParticipantAffected,
  ]);

  return {
    participantCount: participantSet.size,
    pairingCount: pairings.length,
    allPassed: failed.length === 0,
    failedRuleCount: failed.length,
    affectedParticipantCount: affected.size,
    rules,
  };
}
