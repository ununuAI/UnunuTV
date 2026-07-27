export const CINEMATIC_CONTINUITY_BOUNDARY_TYPES = Object.freeze(["initial", "continuous", "hard_cut"]);
export const CINEMATIC_SCREEN_DIRECTIONS = Object.freeze([
  "screen_left",
  "screen_right",
  "toward_camera",
  "away_from_camera",
  "screen_up",
  "screen_down",
  "stationary"
]);
export const CINEMATIC_MOTION_MODES = Object.freeze(["stationary", "forward", "backpedal", "sidestep"]);
export const CINEMATIC_AXIS_INTENTS = Object.freeze(["stationary", "with_axis", "against_axis", "cross_axis"]);
export const CINEMATIC_ENTITY_PRESENCE = Object.freeze(["present", "occluded", "destroyed", "exited"]);

const DIRECTION_INVERSE = Object.freeze({
  away_from_camera: "toward_camera",
  screen_down: "screen_up",
  screen_left: "screen_right",
  screen_right: "screen_left",
  screen_up: "screen_down",
  toward_camera: "away_from_camera"
});

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function evaluationOrder(value) {
  const createdAt = Date.parse(value?.createdAt || "");
  return {
    createdAt: Number.isFinite(createdAt) ? createdAt : 0,
    revision: Number.isInteger(value?.revision) ? value.revision : 0,
    evaluationId: text(value?.evaluationId)
  };
}

function isLaterEvaluation(candidate, current) {
  if (!current) return true;
  const next = evaluationOrder(candidate);
  const previous = evaluationOrder(current);
  if (next.createdAt !== previous.createdAt) return next.createdAt > previous.createdAt;
  if (next.revision !== previous.revision) return next.revision > previous.revision;
  return next.evaluationId.localeCompare(previous.evaluationId) > 0;
}

/** Review history is append-only, so the newest verdict revokes older verdicts. */
export function latestCinematicEvaluationForUnit(evaluations, generationUnitId) {
  const targetId = text(generationUnitId);
  return list(evaluations).reduce((latest, evaluation) => {
    if (!targetId || text(evaluation?.generationUnitId) !== targetId) return latest;
    return isLaterEvaluation(evaluation, latest) ? evaluation : latest;
  }, null);
}

export function latestCinematicEvaluationsByUnit(evaluations) {
  const latest = new Map();
  for (const evaluation of list(evaluations)) {
    const generationUnitId = text(evaluation?.generationUnitId);
    if (!generationUnitId) continue;
    const current = latest.get(generationUnitId);
    if (isLaterEvaluation(evaluation, current)) latest.set(generationUnitId, evaluation);
  }
  return latest;
}

function keyed(value) {
  return new Map(list(value).filter((entry) => text(entry?.entityId)).map((entry) => [entry.entityId, entry]));
}

function sortedText(value) {
  return list(value).map(text).filter(Boolean).sort().join("\u0000");
}

function pushError(errors, code, message, details = {}) {
  errors.push({ code, message, ...details });
}

function compareText(errors, code, label, previous, current, details = {}) {
  if (text(previous) !== text(current)) {
    pushError(errors, code, `${label}不连续：${text(previous) || "未记录"} → ${text(current) || "未记录"}。`, details);
  }
}

function compareTextList(errors, code, label, previous, current, details = {}) {
  if (sortedText(previous) !== sortedText(current)) {
    pushError(errors, code, `${label}不连续。`, details);
  }
}

function compareEntityCollection(errors, kind, previous, current) {
  const before = keyed(previous);
  const after = keyed(current);
  for (const [entityId, source] of before) {
    const target = after.get(entityId);
    if (!target) {
      pushError(errors, `continuity_${kind}_missing`, `${entityId} 在相邻镜头入口无因消失。`, { entityId });
      continue;
    }
    compareText(errors, `continuity_${kind}_zone_mismatch`, `${entityId} 的空间分区`, source.zoneId, target.zoneId, { entityId });
    compareText(errors, `continuity_${kind}_presence_mismatch`, `${entityId} 的存在状态`, source.presence, target.presence, { entityId });
    compareTextList(errors, `continuity_${kind}_state_mismatch`, `${entityId} 的状态`, source.stateTags, target.stateTags, { entityId });
    if (Number(source.count ?? 1) !== Number(target.count ?? 1)) {
      pushError(errors, `continuity_${kind}_count_mismatch`, `${entityId} 的数量不连续：${source.count ?? 1} → ${target.count ?? 1}。`, { entityId });
    }
    if (kind === "prop") compareText(errors, "continuity_prop_owner_mismatch", `${entityId} 的持有者`, source.ownerEntityId, target.ownerEntityId, { entityId });
  }
  for (const entityId of after.keys()) {
    if (!before.has(entityId)) pushError(errors, `continuity_${kind}_unexpected`, `${entityId} 在相邻镜头入口无因出现。`, { entityId });
  }
}

function compareSubjects(errors, previous, current) {
  const before = keyed(previous);
  const after = keyed(current);
  for (const [entityId, source] of before) {
    const target = after.get(entityId);
    if (!target) {
      pushError(errors, "continuity_subject_missing", `${entityId} 在相邻镜头入口无因消失。`, { entityId });
      continue;
    }
    compareText(errors, "continuity_subject_zone_mismatch", `${entityId} 的站位分区`, source.zoneId, target.zoneId, { entityId });
    compareText(errors, "continuity_subject_facing_mismatch", `${entityId} 的身体朝向`, source.bodyOrientation, target.bodyOrientation, { entityId });
    compareText(errors, "continuity_subject_gaze_mismatch", `${entityId} 的视线目标`, source.gazeTargetId, target.gazeTargetId, { entityId });
    compareTextList(errors, "continuity_subject_state_mismatch", `${entityId} 的主体状态`, source.stateTags, target.stateTags, { entityId });
    compareTextList(errors, "continuity_subject_prop_mismatch", `${entityId} 的随身道具`, source.propIds, target.propIds, { entityId });
    const irreversible = new Set(list(target.irreversibleStateTags).map(text).filter(Boolean));
    for (const state of list(source.irreversibleStateTags).map(text).filter(Boolean)) {
      if (!irreversible.has(state)) {
        pushError(errors, "irreversible_state_reverted", `${entityId} 的不可逆状态“${state}”无可见逆转因果却恢复。`, { entityId, state });
      }
    }
  }
  for (const entityId of after.keys()) {
    if (!before.has(entityId)) pushError(errors, "continuity_subject_unexpected", `${entityId} 在相邻镜头入口无因出现。`, { entityId });
  }
}

function compareSnapshots(previous, current, boundaryType) {
  const errors = [];
  compareText(errors, "continuity_scene_authority_mismatch", "场景权威", previous?.sceneAuthorityId, current?.sceneAuthorityId);
  compareText(errors, "continuity_topology_revision_mismatch", "空间拓扑版本", previous?.topologyRevision, current?.topologyRevision);
  compareText(errors, "continuity_axis_mismatch", "世界运动轴", previous?.axis?.axisId, current?.axis?.axisId);
  compareText(errors, "continuity_entrance_zone_mismatch", "入口分区", previous?.axis?.entranceZoneId, current?.axis?.entranceZoneId);
  compareText(errors, "continuity_target_zone_mismatch", "目标分区", previous?.axis?.targetZoneId, current?.axis?.targetZoneId);
  if (boundaryType === "continuous") {
    compareText(errors, "continuity_screen_direction_mismatch", "连续段屏幕方向", previous?.axis?.positiveScreenDirection, current?.axis?.positiveScreenDirection);
  }
  compareSubjects(errors, previous?.subjects, current?.subjects);
  compareEntityCollection(errors, "environment", previous?.environment, current?.environment);
  compareEntityCollection(errors, "prop", previous?.props, current?.props);
  return errors;
}

function validateScreenDirection(shot, errors) {
  const state = shot?.continuityPlan?.entry;
  const positive = state?.axis?.positiveScreenDirection;
  for (const subject of list(state?.subjects)) {
    const entityId = text(subject?.entityId) || "未命名主体";
    const motion = subject?.motionDirection;
    if (subject?.axisIntent === "with_axis" && motion !== positive) {
      pushError(errors, "screen_direction_axis_conflict", `${entityId} 声明沿轴前进，但运动方向 ${motion} 与正向 ${positive} 不一致。`, { entityId, shotId: shot.shotId });
    }
    if (subject?.axisIntent === "against_axis" && motion !== DIRECTION_INVERSE[positive]) {
      pushError(errors, "screen_direction_axis_conflict", `${entityId} 声明逆轴运动，但运动方向 ${motion} 不是 ${positive} 的反向。`, { entityId, shotId: shot.shotId });
    }
    if (subject?.motionMode === "forward" && motion !== "stationary" && subject?.bodyOrientation !== motion) {
      pushError(errors, "body_motion_direction_conflict", `${entityId} 正向运动时身体朝向 ${subject?.bodyOrientation} 与运动方向 ${motion} 相反。`, { entityId, shotId: shot.shotId });
    }
    if (subject?.motionMode === "backpedal" && motion !== "stationary" && subject?.bodyOrientation !== DIRECTION_INVERSE[motion]) {
      pushError(errors, "body_motion_direction_conflict", `${entityId} 后退运动的身体朝向与运动方向关系不成立。`, { entityId, shotId: shot.shotId });
    }
  }
}

function validateActionOrigins(shot, errors) {
  const plan = shot?.continuityPlan;
  const state = plan?.entry;
  const known = new Set([
    ...list(state?.subjects),
    ...list(state?.environment),
    ...list(state?.props)
  ].map((entry) => text(entry?.entityId)).filter(Boolean));
  const positive = state?.axis?.positiveScreenDirection;
  for (const action of list(plan?.actionOrigins)) {
    const actionId = text(action?.actionId) || "未命名动作";
    if (!known.has(action?.initiatorId)) pushError(errors, "action_origin_unknown_initiator", `${actionId} 的发起者 ${action?.initiatorId || "未记录"} 不在本镜入口状态。`, { actionId, shotId: shot.shotId });
    if (!known.has(action?.targetId)) pushError(errors, "action_origin_unknown_target", `${actionId} 的目标 ${action?.targetId || "未记录"} 不在本镜入口状态。`, { actionId, shotId: shot.shotId });
    if (!text(action?.originContact) || !text(action?.carrierId)) pushError(errors, "action_origin_chain_incomplete", `${actionId} 缺少手/武器接触点或道具/投射物载体。`, { actionId, shotId: shot.shotId });
    if (action?.axisRelation === "with_axis" && action?.trajectoryDirection !== positive) {
      pushError(errors, "action_trajectory_axis_conflict", `${actionId} 声明沿轴发出，但轨迹 ${action?.trajectoryDirection} 与正向 ${positive} 不一致。`, { actionId, shotId: shot.shotId });
    }
    if (action?.axisRelation === "against_axis" && action?.trajectoryDirection !== DIRECTION_INVERSE[positive]) {
      pushError(errors, "action_trajectory_axis_conflict", `${actionId} 声明逆轴发出，但轨迹方向不成立。`, { actionId, shotId: shot.shotId });
    }
    if (!Number.isInteger(action?.count) || action.count < 1) pushError(errors, "action_exact_count_required", `${actionId} 必须声明大于零的精确数量。`, { actionId, shotId: shot.shotId });
  }
}

export function auditCinematicContinuity({ generationUnit, shots = [], sourceEvaluation = null }) {
  const errors = [];
  const warnings = [];
  const boundaryType = generationUnit?.continuitySource?.boundaryType || "initial";
  const orderedShots = list(shots);
  for (const shot of orderedShots) {
    if (!shot?.continuityPlan?.entry || !shot?.continuityPlan?.exit) {
      pushError(errors, "continuity_plan_required", `${shot?.shotId || "未命名镜头"} 缺少结构化入口/出口连续性状态。`, { shotId: shot?.shotId });
      continue;
    }
    validateScreenDirection(shot, errors);
    validateActionOrigins(shot, errors);
  }
  if (boundaryType !== "initial") {
    if (!sourceEvaluation || sourceEvaluation.evaluationId !== generationUnit?.continuitySource?.sourceEvaluationId) {
      pushError(errors, "continuity_source_evaluation_required", "相邻镜头缺少指定的已持久化审片记录。");
    } else if (sourceEvaluation.decision !== "ACCEPT") {
      pushError(errors, "continuity_source_not_accepted", `连续性来源 ${sourceEvaluation.evaluationId} 不是 ACCEPT。`);
    } else if (!sourceEvaluation.actualContinuityState) {
      pushError(errors, "continuity_source_state_missing", `连续性来源 ${sourceEvaluation.evaluationId} 没有结构化实际出口状态。`);
    } else if (orderedShots[0]?.continuityPlan?.entry) {
      errors.push(...compareSnapshots(sourceEvaluation.actualContinuityState, orderedShots[0].continuityPlan.entry, boundaryType));
      if (boundaryType === "hard_cut"
        && sourceEvaluation.actualContinuityState?.axis?.positiveScreenDirection !== orderedShots[0].continuityPlan.entry?.axis?.positiveScreenDirection
        && !text(generationUnit?.continuitySource?.screenDirectionChangeReason)) {
        pushError(errors, "screen_direction_change_reason_required", "硬切改变屏幕方向时必须记录新机位和切镜动机，禁止无理由镜像空间。");
      }
    }
  }
  for (let index = 1; index < orderedShots.length; index += 1) {
    const previous = orderedShots[index - 1];
    const current = orderedShots[index];
    if (previous?.continuityPlan?.exit && current?.continuityPlan?.entry) {
      errors.push(...compareSnapshots(previous.continuityPlan.exit, current.continuityPlan.entry, "hard_cut"));
      if (previous.continuityPlan.exit?.axis?.positiveScreenDirection !== current.continuityPlan.entry?.axis?.positiveScreenDirection && !text(current.cutReason)) {
        pushError(errors, "screen_direction_change_reason_required", `${current.shotId} 改变屏幕方向但没有切镜依据。`, { shotId: current.shotId });
      }
    }
  }
  return {
    boundaryType,
    checks: {
      actionOriginChains: orderedShots.reduce((count, shot) => count + list(shot?.continuityPlan?.actionOrigins).length, 0),
      internalBoundaries: Math.max(0, orderedShots.length - 1),
      sourceEvaluationId: sourceEvaluation?.evaluationId ?? null,
      sourceMediaId: sourceEvaluation?.mediaId ?? null,
      sourceChecksum: sourceEvaluation?.checksum ?? null,
      structuredShots: orderedShots.filter((shot) => shot?.continuityPlan?.entry && shot?.continuityPlan?.exit).length
    },
    errors,
    ok: errors.length === 0,
    warnings
  };
}
