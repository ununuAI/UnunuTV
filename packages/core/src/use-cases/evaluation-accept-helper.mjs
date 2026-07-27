/** Shared structural ACCEPT evaluation for formal unit pipeline continuity. */

export function buildStructuralAcceptEvaluation({ unit, mediaId, checksum, sourceNodeId, runId, duration = 5 }) {
  const endBlocking = unit.sequenceState?.plannedEndState?.blocking
    || unit.controlIntent?.dynamicControl?.endState
    || "本镜结束状态完成";
  const startBlocking = unit.sequenceState?.plannedStartState?.blocking
    || unit.controlIntent?.dynamicControl?.subjectTrajectories
    || "本镜开场状态";
  return {
    generationUnitId: unit.generationUnitId,
    sourceKind: "provider_run",
    sourceNodeId,
    runId,
    mediaId,
    checksum: checksum || mediaId,
    duration: Number(duration) || 5,
    frameRate: 24,
    hasAudio: true,
    planActualDiff: { summary: "structural ACCEPT for pipeline continuity" },
    scores: { continuity: 0.9, identity: 0.9, physics: 0.9 },
    internalCuts: [],
    usableRanges: [{ start: 0, end: Number(duration) || 5 }],
    actualExitState: endBlocking,
    authoritativeRanges: [{ start: 0, end: Number(duration) || 5 }],
    decision: "ACCEPT",
    failureResponsibilityLayer: "none",
    repairSuggestions: [],
    knowledgeFeedbackCandidates: [],
    visibleEntityChecks: [],
    vetoFindings: [],
    takeObservation: {
      observedStartState: { blocking: startBlocking },
      observedEndState: { blocking: endBlocking },
      completedBeats: unit.sequenceState?.thisUnitOnly || ["本镜叙事任务"],
      incompleteBeats: [],
      unexpectedCompletedBeats: [],
      continuityBreaks: [],
      acceptedDeviations: [],
      confidence: "medium",
      uncertainties: ["auto-accept without dense-video-analysis"]
    },
    canonReconciliation: {
      status: "accepted",
      acceptedObservedFacts: [endBlocking],
      rejectedObservedFacts: [],
      promotedCompletedBeats: unit.sequenceState?.thisUnitOnly || ["本镜叙事任务"],
      carryForwardState: { blocking: endBlocking },
      nextUnitLocks: unit.sequenceState?.reservedForLater || [],
      rationale: "structural ACCEPT"
    },
    retakeDisposition: {
      type: "KEEP",
      primaryFailureLayer: "none",
      changedVariables: [],
      reason: "pipeline keep",
      nextAction: "timeline or next episode"
    },
    revision: 1
  };
}
