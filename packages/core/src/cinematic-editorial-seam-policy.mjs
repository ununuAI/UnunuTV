import {
  auditCinematicSegmentSeam,
  latestCinematicEvaluationsByUnit,
  normalizeCinematicSegmentDecision
} from "@ununu/unutv-contracts";

function list(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function issue(code, message, details = {}) {
  return { code, message, ...details };
}

function acceptedRanges(evaluation) {
  return list(evaluation?.authoritativeRanges).length
    ? evaluation.authoritativeRanges
    : list(evaluation?.usableRanges);
}

function tailWindowIsAccepted(tailAudit, evaluation) {
  const window = tailAudit?.selectedWindow;
  if (!window) return false;
  return acceptedRanges(evaluation).some((range) => (
    Number(window.startSeconds) >= Number(range.start) - 0.001
    && Number(window.endSeconds) <= Number(range.end) + 0.001
  ));
}

function boundaryShot(unit, edge) {
  const links = [...list(unit?.shotLinks)].sort((left, right) => Number(left.order) - Number(right.order));
  return edge === "from" ? links.at(-1)?.shotId ?? null : links[0]?.shotId ?? null;
}

function cutForBoundary(sequencePrevis, fromShotId, toShotId) {
  return list(sequencePrevis?.cutDecisions).find((cut) => (
    text(cut?.fromShotId) === text(fromShotId)
    && text(cut?.toShotId) === text(toShotId)
  )) ?? null;
}

export function buildCinematicEditorialSeamPlan({
  evaluations = [],
  sequencePrevis = null,
  unitEntries = []
} = {}) {
  const errors = [];
  const seams = [];
  const latestEvaluations = latestCinematicEvaluationsByUnit(evaluations);
  for (let index = 1; index < unitEntries.length; index += 1) {
    const previousEntry = unitEntries[index - 1];
    const currentEntry = unitEntries[index];
    const previousUnit = previousEntry.generationUnit;
    const currentUnit = currentEntry.generationUnit;
    const segmentDecision = normalizeCinematicSegmentDecision(currentUnit.segmentDecision, currentUnit.strategy);
    const seamAudit = auditCinematicSegmentSeam({
      evaluations,
      generationUnit: { ...currentUnit, segmentDecision },
      referenceBindings: currentEntry.referenceBindings
    });
    const previousEvaluation = latestEvaluations.get(previousUnit.generationUnitId) ?? null;
    const fromShotId = boundaryShot(previousUnit, "from");
    const toShotId = boundaryShot(currentUnit, "to");
    const cutDecision = cutForBoundary(sequencePrevis, fromShotId, toShotId);
    const boundaryId = `segment-boundary:${previousUnit.generationUnitId}:${currentUnit.generationUnitId}`;
    if (!seamAudit.ok) {
      errors.push(...seamAudit.errors.map((entry) => ({
        ...entry,
        boundaryId,
        fromGenerationUnitId: previousUnit.generationUnitId,
        toGenerationUnitId: currentUnit.generationUnitId
      })));
    }
    if (segmentDecision !== "new_shot") {
      if (!previousEvaluation || seamAudit.tailAudit?.sourceEvaluationId !== previousEvaluation.evaluationId) {
        errors.push(issue(
          "segment_tail_latest_evaluation_required",
          "连续生成段必须绑定前段最新 ACCEPT evaluation，旧 verdict 不得进入粗剪。",
          { boundaryId, expectedEvaluationId: previousEvaluation?.evaluationId ?? null }
        ));
      } else if (!tailWindowIsAccepted(seamAudit.tailAudit, previousEvaluation)) {
        errors.push(issue(
          "segment_tail_outside_accepted_range",
          "stable tail/usable tail 必须落在前段最新 ACCEPT 的 authoritative/usable range 内。",
          { boundaryId, evaluationId: previousEvaluation.evaluationId }
        ));
      }
    }
    if (segmentDecision === "new_shot" && sequencePrevis && !cutDecision) {
      errors.push(issue(
        "segment_sequence_cut_decision_required",
        "new_shot 边界必须消费当前 SequencePrevis 的精确 CutDecision。",
        { boundaryId, fromShotId, toShotId }
      ));
    }
    if (
      segmentDecision === "one_take_segment"
      && seamAudit.createsEditPoint !== true
      && cutDecision
      && cutDecision.transitionType !== "continuous_no_cut"
    ) {
      errors.push(issue(
        "one_take_provider_boundary_cannot_be_cut",
        "one_take 的 provider 分段边界不得被 SequencePrevis 自动变成剪辑点。",
        { boundaryId, cutDecisionId: cutDecision.cutDecisionId, transitionType: cutDecision.transitionType }
      ));
    }
    const audioBridge = text(currentUnit.continuationHandoff?.audioBridge?.ambience)
      || text(cutDecision?.audioBridge)
      || null;
    seams.push({
      audioBridge,
      boundaryId,
      createsEditPoint: seamAudit.createsEditPoint === true,
      cutDecision: cutDecision ? {
        atSeconds: cutDecision.atSeconds,
        audioBridge: cutDecision.audioBridge,
        cutDecisionId: cutDecision.cutDecisionId,
        transitionType: cutDecision.transitionType
      } : null,
      editBoundaryPolicy: seamAudit.editBoundaryPolicy,
      fromGenerationUnitId: previousUnit.generationUnitId,
      fromShotId,
      providerInput: seamAudit.providerInput,
      seamAction: seamAudit.seamAction,
      segmentDecision,
      sourceEvaluationId: seamAudit.tailAudit?.sourceEvaluationId ?? previousEvaluation?.evaluationId ?? null,
      tailAudit: seamAudit.tailAudit,
      toGenerationUnitId: currentUnit.generationUnitId,
      toShotId,
      version: seamAudit.version
    });
  }
  return { errors, ok: errors.length === 0, seams };
}

