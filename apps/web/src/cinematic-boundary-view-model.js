const SEGMENT_DECISIONS = new Set([
  "new_shot",
  "continuation_segment",
  "one_take_segment",
]);

function record(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function firstText(...values) {
  return values.map(text).find(Boolean) || "";
}

function unitValue(record) {
  return record?.generationUnit ?? record ?? {};
}

function unitShotIds(unit) {
  return (Array.isArray(unit?.shotLinks) ? unit.shotLinks : [])
    .map((link) => text(link?.shotId))
    .filter(Boolean);
}

function explicitDecision(...sources) {
  for (const source of sources) {
    const value = record(source?.segmentDecision)
      ? source.segmentDecision.type ?? source.segmentDecision.decision
      : source?.segmentDecision;
    if (SEGMENT_DECISIONS.has(value)) return value;
  }
  return "";
}

function boundaryStatus(source, evaluation) {
  return firstText(
    source?.acceptanceStatus,
    source?.boundaryAcceptance?.status,
    source?.reviewState,
    evaluation?.decision,
    "awaiting_acceptance",
  );
}

function handoffFields(source, unit) {
  const handoff = record(source?.handoffEvidence)
    ? source.handoffEvidence
    : record(source?.continuationHandoff)
      ? source.continuationHandoff
      : record(unit?.continuationHandoff)
      ? unit.continuationHandoff
        : {};
  const overlapSeconds = Number(source?.overlapSeconds ?? handoff?.overlapSeconds);
  const trimStartSeconds = Number(handoff?.trimStartSeconds);
  const trimEndSeconds = Number(handoff?.trimEndSeconds);
  return {
    handoffMode: firstText(handoff.mode),
    h0MediaId: firstText(handoff.h0MediaId),
    h1MediaId: firstText(handoff.h1MediaId),
    overlap: overlapSeconds > 0
      ? `${overlapSeconds.toFixed(3)}s`
      : firstText(handoff.overlap, handoff.overlapHandle),
    trimPoint: firstText(
      source?.trimPoint,
      source?.trimRule,
      handoff.trimPoint,
      handoff.trimPlan,
      handoff.cutPointRule,
    ) || (Number.isFinite(trimStartSeconds) && Number.isFinite(trimEndSeconds)
      ? `${trimStartSeconds.toFixed(3)}s–${trimEndSeconds.toFixed(3)}s`
      : ""),
  };
}

function projectBoundary(source, context) {
  const unit = context.unit ?? {};
  const segmentSeam = record(unit.segmentSeam) ? unit.segmentSeam : {};
  const decision = explicitDecision(source, unit, unit.boundaryDecision)
    || (context.fromShotId && context.toShotId && context.fromShotId !== context.toShotId
      ? "new_shot"
      : "undeclared");
  const handoff = handoffFields(source, unit);
  const hiddenCutValue = source?.hiddenCut ?? source?.cut?.hidden;
  const blockers = [];
  if (decision === "undeclared") blockers.push("segmentDecision 未声明");
  if (decision === "continuation_segment" && !handoff.h1MediaId) {
    blockers.push("continuation_segment 缺少 stable H1/tail");
  }
  if (handoff.handoffMode === "DUPLICATE_HANDOFF" && (!handoff.h0MediaId || !handoff.h1MediaId)) {
    blockers.push("DUPLICATE_HANDOFF 缺少不同 H0/H1");
  }
  if (decision === "one_take_segment" && hiddenCutValue === true) {
    blockers.push("one_take_segment 不得声明自动 hidden cut");
  }
  const acceptanceStatus = boundaryStatus(source, context.evaluation);
  if (!["ACCEPT", "accepted", "approved", "pass"].includes(acceptanceStatus)) {
    blockers.push("边界尚未验收");
  }
  return {
    acceptanceStatus,
    blockers,
    boundaryId: firstText(
      source?.boundaryId,
      source?.cutDecisionId,
      context.boundaryId,
    ),
    bridgeSegmentId: firstText(
      source?.bridgeSegmentId,
      source?.bridgeSegment?.segmentId,
      unit?.bridgeSegmentId,
      segmentSeam.bridgeSegment?.generationUnitId,
      segmentSeam.bridgeSegment?.mediaId,
    ),
    cutType: decision === "one_take_segment"
      ? "模型分段（非剪辑点）"
      : firstText(
          segmentSeam.explicitCut,
          source?.cutType,
          source?.transitionType,
          source?.cut?.type,
          "未声明",
        ),
    fromLabel: context.fromLabel,
    handoffMode: handoff.handoffMode || "未声明",
    h0MediaId: handoff.h0MediaId,
    h1MediaId: handoff.h1MediaId,
    hiddenCut: decision === "one_take_segment"
      ? false
      : typeof hiddenCutValue === "boolean"
        ? hiddenCutValue
        : null,
    isAutomaticCutPoint: decision !== "one_take_segment",
    overlap: handoff.overlap || "无",
    rollbackFrameId: firstText(
      source?.rollbackFrameId,
      source?.rollbackFrame?.mediaId,
      unit?.rollbackFrameId,
      segmentSeam.rollbackFrameId,
      segmentSeam.tailAnalysis?.rollbackFrameId,
    ),
    segmentDecision: decision,
    stableTailFrameId: firstText(
      source?.stableTailFrameId,
      source?.stableTailFrame?.mediaId,
      unit?.stableTailFrameId,
      segmentSeam.tailAnalysis?.selectedWindow?.selectedFrameMediaId,
      handoff.h1MediaId,
    ),
    toLabel: context.toLabel,
    trimPoint: decision === "one_take_segment"
      ? "不产生自动 trim/cut"
      : handoff.trimPoint || "未声明",
  };
}

export function buildCinematicBoundaryFacts({
  evaluations = [],
  sequencePrevis,
  units = [],
} = {}) {
  const records = (Array.isArray(units) ? units : []).map((entry) => ({
    record: entry,
    unit: unitValue(entry),
  }));
  const evaluationByUnit = new Map(
    (Array.isArray(evaluations) ? evaluations : [])
      .filter((entry) => text(entry?.generationUnitId))
      .map((entry) => [entry.generationUnitId, entry]),
  );
  const facts = [];
  const cutKeys = new Set();
  for (const cut of sequencePrevis?.cutDecisions ?? []) {
    const target = records.find(({ unit }) => unitShotIds(unit).includes(cut.toShotId));
    const boundaryId = firstText(cut.boundaryId, cut.cutDecisionId);
    cutKeys.add(`${cut.fromShotId}\u0000${cut.toShotId}`);
    facts.push(projectBoundary(cut, {
      boundaryId,
      evaluation: target ? evaluationByUnit.get(target.unit.generationUnitId) : null,
      fromLabel: cut.fromShotId,
      fromShotId: cut.fromShotId,
      toLabel: cut.toShotId,
      toShotId: cut.toShotId,
      unit: target?.unit,
    }));
  }
  const ordered = records
    .filter(({ unit }) => Number.isInteger(unit?.sequenceState?.sequenceIndex))
    .sort((left, right) => left.unit.sequenceState.sequenceIndex - right.unit.sequenceState.sequenceIndex);
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1].unit;
    const current = ordered[index].unit;
    if (current.sequenceState?.parentGenerationUnitId !== previous.generationUnitId) continue;
    const fromShotId = unitShotIds(previous).at(-1) || "";
    const toShotId = unitShotIds(current)[0] || "";
    if (cutKeys.has(`${fromShotId}\u0000${toShotId}`)) continue;
    facts.push(projectBoundary(current.boundaryDecision ?? current, {
      boundaryId: `boundary-${previous.generationUnitId}-${current.generationUnitId}`,
      evaluation: evaluationByUnit.get(previous.generationUnitId),
      fromLabel: previous.generationUnitId,
      fromShotId,
      toLabel: current.generationUnitId,
      toShotId,
      unit: current,
    }));
  }
  return facts;
}
