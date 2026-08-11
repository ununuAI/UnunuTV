import { auditCinematicSegmentSeam } from "@ununu/unutv-contracts";

const SEGMENT_DECISIONS = new Set([
  "new_shot",
  "continuation_segment",
  "one_take_segment"
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

function unitOf(entry) {
  return entry?.generationUnit ?? entry ?? {};
}

function shotIds(unit) {
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

function trimPoint(source, handoff) {
  const explicit = firstText(
    source?.trimPoint,
    source?.trimRule,
    handoff?.trimPoint,
    handoff?.trimPlan
  );
  if (explicit) return explicit;
  const start = Number(handoff?.trimStartSeconds);
  const end = Number(handoff?.trimEndSeconds);
  return Number.isFinite(start) && Number.isFinite(end)
    ? `${start.toFixed(3)}s–${end.toFixed(3)}s`
    : "";
}

function acceptanceStatus(source) {
  return firstText(
    source?.acceptanceStatus,
    source?.boundaryAcceptance?.status,
    source?.reviewState,
    "awaiting_acceptance"
  );
}

function boundaryFacts(source, {
  boundaryId,
  evaluations,
  fromLabel,
  fromShotId,
  fromUnitId = "",
  referenceBindings = [],
  sourceType,
  toLabel,
  toShotId,
  toUnit = null
}) {
  const unit = unitOf(toUnit);
  const decision = explicitDecision(source, unit, unit.boundaryDecision)
    || (fromShotId && toShotId && fromShotId !== toShotId ? "new_shot" : "undeclared");
  const seam = record(unit.segmentSeam) ? unit.segmentSeam : {};
  const handoff = record(source?.handoffEvidence)
    ? source.handoffEvidence
    : record(source?.continuationHandoff)
      ? source.continuationHandoff
      : record(unit.continuationHandoff)
        ? unit.continuationHandoff
        : {};
  const seamAudit = SEGMENT_DECISIONS.has(unit.segmentDecision)
    ? auditCinematicSegmentSeam({ evaluations, generationUnit: unit, referenceBindings })
    : null;
  const explicitCut = firstText(seam.explicitCut);
  const hiddenCutValue = source?.hiddenCut ?? source?.cut?.hidden;
  const selectedTail = firstText(
    source?.stableTailFrameId,
    source?.stableTailFrame?.mediaId,
    seamAudit?.tailAudit?.selectedWindow?.selectedFrameMediaId,
    seam?.tailAnalysis?.selectedWindow?.selectedFrameMediaId,
    handoff?.h1MediaId
  );
  const bridge = record(seam.bridgeSegment) ? seam.bridgeSegment : {};
  const overlapSeconds = Number(source?.overlapSeconds ?? handoff?.overlapSeconds);
  const blockers = (seamAudit?.errors ?? []).map((entry) => entry.message);
  if (decision === "undeclared") blockers.push("segmentDecision 未声明");
  if (decision === "continuation_segment" && !selectedTail) {
    blockers.push("continuation_segment 缺少 stable tail / H1");
  }
  if (handoff.mode === "DUPLICATE_HANDOFF"
    && (!text(handoff.h0MediaId) || !text(handoff.h1MediaId))) {
    blockers.push("DUPLICATE_HANDOFF 缺少不同 H0/H1");
  }
  if (acceptanceStatus(source) === "awaiting_acceptance") blockers.push("边界尚未验收");
  const automaticCutPoint = decision !== "one_take_segment";
  const cutType = decision === "one_take_segment" && !explicitCut
    ? "模型分段（非剪辑点）"
    : firstText(explicitCut, seamAudit?.seamAction, source?.cutType, source?.transitionType, "未声明");
  return {
    version: "cinematic_boundary_projection_v1",
    acceptanceStatus: acceptanceStatus(source),
    automaticCutPoint,
    blockers: [...new Set(blockers)],
    boundaryId,
    bridgeSegmentId: firstText(
      source?.bridgeSegmentId,
      source?.bridgeSegment?.segmentId,
      bridge.generationUnitId,
      bridge.mediaId
    ),
    cutType,
    fromLabel,
    fromShotId,
    fromUnitId,
    h0MediaId: text(handoff.h0MediaId),
    h1MediaId: text(handoff.h1MediaId),
    handoffMode: firstText(handoff.mode, "未声明"),
    hiddenCut: decision === "one_take_segment" && !explicitCut
      ? false
      : explicitCut === "hidden_cut" || hiddenCutValue === true,
    overlapSeconds: Number.isFinite(overlapSeconds) && overlapSeconds > 0 ? overlapSeconds : 0,
    rollbackFrameId: firstText(
      source?.rollbackFrameId,
      source?.rollbackFrame?.mediaId,
      seam.rollbackFrameId,
      seam.tailAnalysis?.rollbackFrameId
    ),
    segmentDecision: decision,
    sourceType,
    stableTailFrameId: selectedTail,
    toLabel,
    toShotId,
    toUnitId: text(unit.generationUnitId),
    trimPoint: decision === "one_take_segment" && !explicitCut
      ? "不产生自动 trim/cut"
      : trimPoint(source, handoff) || "未声明"
  };
}

function visibleText(facts) {
  const cutMeaning = facts.automaticCutPoint
    ? `${facts.cutType}${facts.hiddenCut ? " · hidden cut" : " · visible/undeclared cut"}`
    : "模型分段边界，不是自动剪辑点";
  return [
    `${facts.fromLabel} → ${facts.toLabel}`,
    `Segment decision: ${facts.segmentDecision}`,
    `剪辑语义: ${cutMeaning}`,
    `Stable tail: ${facts.stableTailFrameId || "未绑定"}`,
    `Rollback frame: ${facts.rollbackFrameId || "未绑定"}`,
    `Bridge segment: ${facts.bridgeSegmentId || "无/未声明"}`,
    `H0 / H1: ${facts.h0MediaId || "未绑定"} / ${facts.h1MediaId || "未绑定"}`,
    `Handoff / overlap: ${facts.handoffMode} / ${facts.overlapSeconds.toFixed(3)}s`,
    `Trim point: ${facts.trimPoint}`,
    `验收状态: ${facts.acceptanceStatus}`,
    ...(facts.blockers.length ? [`阻塞: ${facts.blockers.join("；")}`] : [])
  ].join("\n");
}

function entry(facts) {
  return {
    boundaryId: facts.boundaryId,
    facts,
    plainText: visibleText(facts),
    title: `接缝 · ${facts.fromLabel} → ${facts.toLabel}`
  };
}

export function buildCinematicBoundaryCanvasEntries({
  evaluations = [],
  generationUnitRecords = [],
  sequencePrevis = null
} = {}) {
  const records = (Array.isArray(generationUnitRecords) ? generationUnitRecords : [])
    .map((record) => ({ record, unit: unitOf(record) }));
  const entries = [];
  const byShotPair = new Map();
  for (const cut of sequencePrevis?.cutDecisions ?? []) {
    const fromShotId = text(cut.fromShotId);
    const toShotId = text(cut.toShotId);
    const target = records.find(({ unit }) => shotIds(unit).includes(toShotId));
    const facts = boundaryFacts(cut, {
      boundaryId: firstText(cut.boundaryId, cut.cutDecisionId, `boundary-${fromShotId}-${toShotId}`),
      evaluations,
      fromLabel: fromShotId,
      fromShotId,
      sourceType: target ? "sequence_cut+generation_segment" : "sequence_cut",
      toLabel: toShotId,
      toShotId,
      toUnit: target?.record,
      referenceBindings: target?.record?.referenceBindings ?? []
    });
    const projected = entry(facts);
    entries.push(projected);
    byShotPair.set(`${fromShotId}\u0000${toShotId}`, projected);
  }
  const ordered = records
    .filter(({ unit }) => Number.isInteger(unit?.sequenceState?.sequenceIndex))
    .sort((left, right) => left.unit.sequenceState.sequenceIndex - right.unit.sequenceState.sequenceIndex);
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    if (current.unit.sequenceState?.parentGenerationUnitId !== previous.unit.generationUnitId) continue;
    const fromShotId = shotIds(previous.unit).at(-1) || "";
    const toShotId = shotIds(current.unit)[0] || "";
    const duplicate = byShotPair.get(`${fromShotId}\u0000${toShotId}`);
    if (duplicate) {
      duplicate.facts.fromUnitId = previous.unit.generationUnitId;
      duplicate.facts.toUnitId = current.unit.generationUnitId;
      duplicate.plainText = visibleText(duplicate.facts);
      continue;
    }
    entries.push(entry(boundaryFacts(current.unit.boundaryDecision ?? current.unit, {
      boundaryId: `boundary-${previous.unit.generationUnitId}-${current.unit.generationUnitId}`,
      evaluations,
      fromLabel: previous.unit.generationUnitId,
      fromShotId,
      fromUnitId: previous.unit.generationUnitId,
      referenceBindings: current.record.referenceBindings ?? [],
      sourceType: "generation_segment",
      toLabel: current.unit.generationUnitId,
      toShotId,
      toUnit: current.record
    })));
  }
  return entries;
}
