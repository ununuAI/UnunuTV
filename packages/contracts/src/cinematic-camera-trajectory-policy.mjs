export const CINEMATIC_ORBIT_DIRECTIONS = Object.freeze([
  "clockwise_from_overhead",
  "counterclockwise_from_overhead"
]);

export const CINEMATIC_CAMERA_COORDINATE_SPACES = Object.freeze(["subject_local", "world"]);
export const CINEMATIC_CAMERA_OVERLAY_POLICY = "editor_only";
export const CINEMATIC_CAMERA_OVERLAY_POLICIES = Object.freeze(["editor_only", "provider_reference_only"]);
export const CINEMATIC_CAMERA_ANNOTATION_KINDS = Object.freeze(["direction", "focus", "orientation", "path", "region", "timing"]);
export const CINEMATIC_CAMERA_MOVEMENT_TYPES = Object.freeze(["arc", "compound", "crane", "dolly", "handheld", "orbit", "pan_tilt", "pedestal", "truck", "zoom"]);
export const CINEMATIC_CAMERA_GUIDE_TYPES = Object.freeze(["compound_guides", "lens_curve", "motion_envelope", "orientation_arc", "path_curve"]);
export const CINEMATIC_FOCUS_INTERPOLATIONS = Object.freeze(["hold", "linear", "ease_in", "ease_out", "ease_in_out"]);

const ORBIT_INTENT_PATTERN = /(?:环绕|环拍|绕(?:主体|人物|轴心|场景|行|拍|摄)|\borbit(?:al|ing)?\b)/iu;
const NEGATED_ORBIT_PATTERN = /(?:不|不得|禁止|不要|无需|无须)(?:进行|发生|采用|使用)?(?:任何)?(?:环绕|环拍|绕(?:主体|人物|轴心|场景|行|拍|摄)|\borbit(?:al|ing)?\b)/giu;
const CAMERA_MOVEMENT_PATTERN = /(?:环绕|环拍|弧线运镜|推近|推进|前推|后拉|拉远|推轨|轨道运镜|横移|平移|侧移|跟随|跟拍|跟焦移动|跟符|升降|抬机|下降|下沉|上升|摇臂|摇镜|甩镜|急摇|下摇|上摇|俯仰|变焦|拉焦|手持|震动|\b(?:arc|crane|dolly|handheld|orbit(?:al|ing)?|pan|pedestal|tilt|truck|zoom)\b)/iu;
const NEGATED_CAMERA_MOVEMENT_PATTERN = /(?:不|不得|禁止|不要|无需|无须)(?:进行|发生|采用|使用|允许)?(?:任何)?(?:环绕|环拍|弧线运镜|推近|推进|前推|后拉|拉远|推轨|轨道运镜|横移|平移|侧移|跟随|跟拍|跟焦移动|跟符|升降|抬机|下降|下沉|上升|摇臂|摇镜|甩镜|急摇|下摇|上摇|俯仰|变焦|拉焦|手持|震动|\b(?:arc|crane|dolly|handheld|orbit(?:al|ing)?|pan|pedestal|tilt|truck|zoom)\b)/giu;
const FOCUS_CHANGE_PATTERN = /(?:拉焦|跟焦|焦点(?:回拉|前移|后移|转移|移动|切换|变化)|焦平面(?:前移|后移|移动|变化)|\b(?:rack[ -]?focus|focus[ -]?pull)\b)/iu;

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function issue(path, message, code = "invalid_field") {
  return { code, message, path };
}

function finiteInRange(value, minimum, maximum) {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function validatePose(value, path, issues) {
  if (!isRecord(value)) {
    issues.push(issue(path, `${path} must be an object`, "invalid_type"));
    return;
  }
  if (!finiteInRange(value.azimuthDegrees, -360, 360)) issues.push(issue(`${path}.azimuthDegrees`, "方位角必须是 -360 到 360 度的有限数值", "invalid_number"));
  if (!finiteInRange(value.elevationDegrees, -89, 89)) issues.push(issue(`${path}.elevationDegrees`, "俯仰角必须是 -89 到 89 度的有限数值", "invalid_number"));
  if (!finiteInRange(value.radiusMeters, 0.1, 1000)) issues.push(issue(`${path}.radiusMeters`, "环绕半径必须是 0.1 到 1000 米的有限数值", "invalid_number"));
  if (!finiteInRange(value.heightMeters, -1000, 1000)) issues.push(issue(`${path}.heightMeters`, "相机高度必须是有限数值", "invalid_number"));
}

function validateCartesianCameraState(value, path, issues) {
  if (!isRecord(value)) {
    issues.push(issue(path, `${path} must be an object`, "invalid_type"));
    return;
  }
  if (!isRecord(value.position)) issues.push(issue(`${path}.position`, "position must be an object", "invalid_type"));
  else for (const axis of ["x", "y", "z"]) if (!Number.isFinite(value.position[axis])) issues.push(issue(`${path}.position.${axis}`, `${axis} must be a finite number`, "invalid_number"));
  for (const [field, minimum, maximum] of [["yawDegrees", -360, 360], ["pitchDegrees", -89, 89], ["rollDegrees", -180, 180], ["fovDegrees", 1, 179], ["focusDistanceMeters", 0.01, 10000]]) {
    if (!finiteInRange(value[field], minimum, maximum)) issues.push(issue(`${path}.${field}`, `${field} must be between ${minimum} and ${maximum}`, "invalid_number"));
  }
}

function focusChangeRequested(value) {
  if (!isRecord(value)) return false;
  if (Number.isFinite(value.startState?.focusDistanceMeters) && Number.isFinite(value.endState?.focusDistanceMeters)
    && Math.abs(value.startState.focusDistanceMeters - value.endState.focusDistanceMeters) > 0.001) return true;
  return [value.pathDescription, value.lookAt, value.lensFocus].some((entry) => FOCUS_CHANGE_PATTERN.test(String(entry ?? "")));
}

function validateFocusDistancePlan(value, plan, issues) {
  const required = focusChangeRequested(plan);
  if (value === undefined && !required) return;
  if (!Array.isArray(value) || value.length < 2) {
    issues.push(issue("focusDistancePlan", "焦点发生变化时必须提供至少两个按时间排序的焦距面状态", "focus_distance_plan_required"));
    return;
  }
  let previousTime = -Infinity;
  value.forEach((entry, index) => {
    const path = `focusDistancePlan[${index}]`;
    if (!isRecord(entry)) {
      issues.push(issue(path, `${path} must be an object`, "invalid_type"));
      return;
    }
    if (!finiteInRange(entry.atSeconds, 0, plan.durationSeconds)) issues.push(issue(`${path}.atSeconds`, "focus state time must fall within the shot", "invalid_time_range"));
    else if (entry.atSeconds <= previousTime) issues.push(issue(`${path}.atSeconds`, "focus states must be strictly time ordered", "temporal_order_invalid"));
    previousTime = Number(entry.atSeconds);
    if (!finiteInRange(entry.focusDistanceMeters, 0.01, 10000)) issues.push(issue(`${path}.focusDistanceMeters`, "focusDistanceMeters must be between 0.01 and 10000", "invalid_number"));
    if (!hasText(entry.target)) issues.push(issue(`${path}.target`, "focus target is required", "required"));
    if (!CINEMATIC_FOCUS_INTERPOLATIONS.includes(entry.interpolation)) issues.push(issue(`${path}.interpolation`, "unsupported focus interpolation", "invalid_enum"));
  });
  const first = value[0];
  const last = value.at(-1);
  if (Math.abs(Number(first?.atSeconds)) > 0.001 || Math.abs(Number(last?.atSeconds) - Number(plan.durationSeconds)) > 0.001) {
    issues.push(issue("focusDistancePlan", "focus plan must cover t0 through the requested endpoint", "focus_plan_incomplete"));
  }
  if (Number.isFinite(first?.focusDistanceMeters) && Number.isFinite(plan.startState?.focusDistanceMeters)
    && Math.abs(first.focusDistanceMeters - plan.startState.focusDistanceMeters) > 0.01) issues.push(issue("focusDistancePlan[0].focusDistanceMeters", "first focus state must match startState", "focus_state_mismatch"));
  if (Number.isFinite(last?.focusDistanceMeters) && Number.isFinite(plan.endState?.focusDistanceMeters)
    && Math.abs(last.focusDistanceMeters - plan.endState.focusDistanceMeters) > 0.01) issues.push(issue(`focusDistancePlan[${value.length - 1}].focusDistanceMeters`, "last focus state must match endState", "focus_state_mismatch"));
}

function validateAnnotationReference(value, plan, geometryId, issues) {
  if (!isRecord(value)) {
    issues.push(issue("annotationReference", "provider_reference_only 必须绑定从干净母版派生的标注参考图", "required"));
    return;
  }
  for (const field of ["mediaId", "sourceMediaId", "sourceChecksum", "controlGeometryId"]) if (!hasText(value[field])) issues.push(issue(`annotationReference.${field}`, `${field} is required`, "required"));
  if (value.mediaId === value.sourceMediaId) issues.push(issue("annotationReference.mediaId", "标注参考必须是独立派生媒体，不能覆盖干净空间/人物母版", "annotation_source_conflict"));
  if (value.controlGeometryId !== geometryId) issues.push(issue("annotationReference.controlGeometryId", "标注图几何版本必须与结构化运镜合同完全一致", "annotation_prompt_conflict"));
  if (!Array.isArray(value.annotations) || value.annotations.length < 1) {
    issues.push(issue("annotationReference.annotations", "至少需要一个带时间和含义的圈选、路径、方向或焦点标注", "required"));
    return;
  }
  const ids = new Set();
  value.annotations.forEach((annotation, index) => {
    const path = `annotationReference.annotations[${index}]`;
    if (!isRecord(annotation)) {
      issues.push(issue(path, `${path} must be an object`, "invalid_type"));
      return;
    }
    for (const field of ["annotationId", "meaning", "instruction"]) if (!hasText(annotation[field])) issues.push(issue(`${path}.${field}`, `${field} is required`, "required"));
    if (ids.has(annotation.annotationId)) issues.push(issue(`${path}.annotationId`, "annotationId must be unique", "duplicate"));
    ids.add(annotation.annotationId);
    if (!CINEMATIC_CAMERA_ANNOTATION_KINDS.includes(annotation.kind)) issues.push(issue(`${path}.kind`, `kind must be one of: ${CINEMATIC_CAMERA_ANNOTATION_KINDS.join(", ")}`, "invalid_enum"));
    if (!finiteInRange(annotation.startSeconds, 0, plan.durationSeconds)) issues.push(issue(`${path}.startSeconds`, "startSeconds 必须位于镜头时长内", "invalid_number"));
    if (!finiteInRange(annotation.endSeconds, 0, plan.durationSeconds) || annotation.endSeconds < annotation.startSeconds) issues.push(issue(`${path}.endSeconds`, "endSeconds 必须不早于 startSeconds 且位于镜头时长内", "invalid_number"));
  });
}

function validateOverlayPolicy(value, plan, geometryId, issues) {
  if (!CINEMATIC_CAMERA_OVERLAY_POLICIES.includes(value.overlayPolicy)) {
    issues.push(issue("overlayPolicy", "overlayPolicy 必须是 editor_only 或 provider_reference_only", "unsafe_overlay"));
    return;
  }
  if (value.overlayPolicy === "provider_reference_only") validateAnnotationReference(value.annotationReference, plan, geometryId, issues);
  else if (value.annotationReference !== undefined) issues.push(issue("annotationReference", "editor_only 控制图层不得伪装成 Provider 标注参考", "annotation_policy_conflict"));
}

function cameraMovementRequested(value) {
  return CAMERA_MOVEMENT_PATTERN.test(String(value ?? "").replace(NEGATED_CAMERA_MOVEMENT_PATTERN, ""));
}

export function shotRequestsStructuredCameraTrajectory(shot) {
  const camera = isRecord(shot?.cinematography) ? shot.cinematography : {};
  return [camera.movementPath, camera.speedCurve, camera.startPoint, camera.stopPoint, camera.narrativePurpose].some(cameraMovementRequested);
}

export function validateCameraTrajectoryPlan(value) {
  const issues = [];
  if (!isRecord(value)) return { issues: [issue("cameraTrajectoryPlan", "cameraTrajectoryPlan must be an object", "invalid_type")], ok: false };
  if (!CINEMATIC_CAMERA_MOVEMENT_TYPES.includes(value.movementType)) issues.push(issue("movementType", `movementType must be one of: ${CINEMATIC_CAMERA_MOVEMENT_TYPES.join(", ")}`, "invalid_enum"));
  if (!CINEMATIC_CAMERA_GUIDE_TYPES.includes(value.guideType)) issues.push(issue("guideType", `guideType must be one of: ${CINEMATIC_CAMERA_GUIDE_TYPES.join(", ")}`, "invalid_enum"));
  if (!CINEMATIC_CAMERA_COORDINATE_SPACES.includes(value.coordinateSpace)) issues.push(issue("coordinateSpace", `coordinateSpace must be one of: ${CINEMATIC_CAMERA_COORDINATE_SPACES.join(", ")}`, "invalid_enum"));
  validateCartesianCameraState(value.startState, "startState", issues);
  validateCartesianCameraState(value.endState, "endState", issues);
  if (!finiteInRange(value.durationSeconds, 0.1, 120)) issues.push(issue("durationSeconds", "轨迹时长必须是 0.1 到 120 秒的有限数值", "invalid_number"));
  validateFocusDistancePlan(value.focusDistancePlan, value, issues);
  for (const field of ["pathDescription", "directionDefinition", "speedCurve", "lookAt", "lensFocus", "framingInvariant", "subjectMotionRelation", "occlusionPlan", "parallaxExpectation", "controlGeometryId"]) if (!hasText(value[field])) issues.push(issue(field, `${field} is required`, "required"));
  if (!isRecord(value.cleanCaptures)) issues.push(issue("cleanCaptures", "必须绑定不含控制标记的干净首/中/尾构图帧", "invalid_type"));
  else for (const field of ["startCaptureId", "midCaptureId", "endCaptureId"]) if (!hasText(value.cleanCaptures[field])) issues.push(issue(`cleanCaptures.${field}`, `${field} is required`, "required"));
  validateOverlayPolicy(value, value, value.controlGeometryId, issues);
  const expectedGuides = {
    arc: ["path_curve", "compound_guides"], crane: ["path_curve", "compound_guides"], dolly: ["path_curve", "compound_guides"], orbit: ["path_curve", "compound_guides"], pedestal: ["path_curve", "compound_guides"], truck: ["path_curve", "compound_guides"],
    pan_tilt: ["orientation_arc", "compound_guides"], zoom: ["lens_curve", "compound_guides"], handheld: ["motion_envelope", "compound_guides"], compound: ["compound_guides"]
  };
  if (expectedGuides[value.movementType] && !expectedGuides[value.movementType].includes(value.guideType)) issues.push(issue("guideType", `${value.movementType} 必须使用 ${expectedGuides[value.movementType].join(" 或 ")} 控制图形`, "guide_type_mismatch"));
  return { issues, ok: issues.length === 0 };
}

function normalizedTravel(start, end, direction, arcDegrees) {
  if (arcDegrees === 360) return 360;
  const delta = direction === "clockwise_from_overhead" ? start - end : end - start;
  return ((delta % 360) + 360) % 360;
}

export function shotRequestsOrbitTrajectory(shot) {
  const camera = isRecord(shot?.cinematography) ? shot.cinematography : {};
  return [camera.movementPath, camera.startPoint, camera.stopPoint, camera.narrativePurpose]
    .some((value) => ORBIT_INTENT_PATTERN.test(String(value ?? "").replace(NEGATED_ORBIT_PATTERN, "")));
}

export function validateOrbitCameraTrajectory(value) {
  const issues = [];
  if (!isRecord(value)) return { issues: [issue("orbitCameraTrajectory", "orbitCameraTrajectory must be an object", "invalid_type")], ok: false };
  if (value.movementType !== "orbit") issues.push(issue("movementType", "movementType must be orbit", "invalid_enum"));
  if (!CINEMATIC_CAMERA_COORDINATE_SPACES.includes(value.coordinateSpace)) issues.push(issue("coordinateSpace", `coordinateSpace must be one of: ${CINEMATIC_CAMERA_COORDINATE_SPACES.join(", ")}`, "invalid_enum"));
  if (!CINEMATIC_ORBIT_DIRECTIONS.includes(value.direction)) issues.push(issue("direction", `direction must be one of: ${CINEMATIC_ORBIT_DIRECTIONS.join(", ")}`, "invalid_enum"));
  if (!isRecord(value.pivot)) issues.push(issue("pivot", "pivot must be an object", "invalid_type"));
  else for (const field of ["targetId", "description"]) if (!hasText(value.pivot[field])) issues.push(issue(`pivot.${field}`, `pivot.${field} is required`, "required"));
  validatePose(value.startPose, "startPose", issues);
  validatePose(value.endPose, "endPose", issues);
  if (!finiteInRange(value.arcDegrees, 1, 360)) issues.push(issue("arcDegrees", "环绕弧度必须是 1 到 360 度的有限数值", "invalid_number"));
  if (!finiteInRange(value.durationSeconds, 0.1, 120)) issues.push(issue("durationSeconds", "轨迹时长必须是 0.1 到 120 秒的有限数值", "invalid_number"));
  if (!finiteInRange(value.rollDegrees, -180, 180)) issues.push(issue("rollDegrees", "滚转角必须是 -180 到 180 度的有限数值", "invalid_number"));
  for (const field of ["speedCurve", "lookAt", "lensFocus", "framingInvariant", "subjectMotionRelation", "occlusionPlan", "parallaxExpectation", "controlRouteId"]) {
    if (!hasText(value[field])) issues.push(issue(field, `${field} is required`, "required"));
  }
  if (!isRecord(value.cleanCaptures)) issues.push(issue("cleanCaptures", "必须绑定不含线条、箭头、标签的干净首/中/尾构图帧", "invalid_type"));
  else for (const field of ["startCaptureId", "midCaptureId", "endCaptureId"]) if (!hasText(value.cleanCaptures[field])) issues.push(issue(`cleanCaptures.${field}`, `${field} is required`, "required"));
  validateOverlayPolicy(value, value, value.controlRouteId, issues);
  if (isRecord(value.startPose) && isRecord(value.endPose) && finiteInRange(value.arcDegrees, 1, 360) && CINEMATIC_ORBIT_DIRECTIONS.includes(value.direction)) {
    const travel = normalizedTravel(value.startPose.azimuthDegrees, value.endPose.azimuthDegrees, value.direction, value.arcDegrees);
    if (Math.abs(travel - value.arcDegrees) > 1) issues.push(issue("endPose.azimuthDegrees", `起终方位角按指定方向形成 ${travel}°，与 arcDegrees=${value.arcDegrees}° 不一致`, "trajectory_geometry_mismatch"));
  }
  return { issues, ok: issues.length === 0 };
}

export function evaluateStructuredCameraTrajectories({ generationUnit, referenceBindings = [], shots = [] } = {}) {
  const errors = [];
  const plans = [];
  for (const shot of shots) {
    const required = shotRequestsStructuredCameraTrajectory(shot) || shotRequestsOrbitTrajectory(shot);
    const plan = shot?.cameraTrajectoryPlan ?? shot?.orbitCameraTrajectory;
    if (required && !plan) {
      errors.push({ code: "structured_camera_trajectory_required", message: `${shot.shotId} 要求摄影机运动，但缺少结构化起终状态、控制图形、速度、视轴/焦段、构图守恒和干净首中尾帧。` });
      continue;
    }
    if (!plan) continue;
    const generic = Boolean(shot?.cameraTrajectoryPlan);
    const validation = generic ? validateCameraTrajectoryPlan(plan) : validateOrbitCameraTrajectory(plan);
    plans.push({ controlGeometryId: plan.controlGeometryId ?? plan.controlRouteId, movementType: plan.movementType, ok: validation.ok, overlayPolicy: plan.overlayPolicy, shotId: shot.shotId });
    for (const entry of validation.issues) errors.push({ code: `camera_${entry.code}`, message: `${shot.shotId}.${entry.path}: ${entry.message}` });
    if (generic && shots.length === 1 && Array.isArray(plan.focusDistancePlan) && generationUnit?.controlIntent?.temporalMotionPlan) {
      const cameraTrack = generationUnit.controlIntent.temporalMotionPlan.tracks?.find((track) => track?.trackType === "camera");
      for (const focusState of plan.focusDistancePlan) {
        const temporalState = cameraTrack?.states?.find((state) => Math.abs(Number(state.atSeconds) - Number(focusState.atSeconds)) <= 0.001);
        if (!temporalState || !Number.isFinite(temporalState.focusDistanceMeters)
          || Math.abs(temporalState.focusDistanceMeters - focusState.focusDistanceMeters) > 0.01) {
          errors.push({ code: "camera_focus_temporal_mismatch", message: `${shot.shotId} 在 ${focusState.atSeconds} 秒的 Shot 焦距面必须与 Unit camera track 完全一致。` });
        }
      }
    }
    if (plan.overlayPolicy === "provider_reference_only") {
      const annotatedMediaId = plan.annotationReference?.mediaId;
      const mode = generationUnit?.generationParameters?.mode;
      const providerIds = new Set(generationUnit?.generationParameters?.referenceMediaIds ?? []);
      const binding = referenceBindings.find((entry) => entry.mediaId === annotatedMediaId);
      if (mode !== "image_reference") errors.push({ code: "camera_annotated_reference_mode_conflict", message: `${shot.shotId} 的带圈选/路径标注图只能进入 image_reference，不能进入首帧、首尾帧或文生模式。` });
      if (!providerIds.has(annotatedMediaId) || !binding) errors.push({ code: "camera_annotated_reference_binding_required", message: `${shot.shotId} 的标注图必须作为真实、有序的 Provider 参考绑定。` });
      else if (binding.role !== "camera_motion_guide") errors.push({ code: "camera_annotated_reference_role_conflict", message: `${shot.shotId} 的标注图必须声明 role=camera_motion_guide，不能冒充人物、场景或首帧权威。` });
    }
  }
  const unitCameraTexts = [generationUnit?.controlIntent?.dynamicControl?.cameraTrajectory, generationUnit?.promptCoverage?.cameraTrajectory];
  if (unitCameraTexts.some(cameraMovementRequested) && !shots.some((shot) => shot?.cameraTrajectoryPlan ?? shot?.orbitCameraTrajectory)) {
    errors.push({ code: "structured_camera_trajectory_required", message: "生成单元动态合同要求摄影机运动，但没有镜头绑定结构化相机轨迹计划。" });
  }
  return { errors, ok: errors.length === 0, plans, overlayPolicy: CINEMATIC_CAMERA_OVERLAY_POLICY };
}

function renderAnnotationInstructions(value) {
  if (value?.overlayPolicy !== "provider_reference_only") return "控制图形只保留在导演台 editor_only 图层，不进入 Provider 参考图或最终像素";
  const annotations = value.annotationReference?.annotations ?? [];
  return `带标注参考图只作运镜控制：${annotations.map((entry) => `${entry.annotationId}（${entry.meaning}，${entry.startSeconds}–${entry.endSeconds}秒）：${entry.instruction}`).join("；")}。所有圆圈、线条、箭头和标签都不是场景物体，不得出现在成片`;
}

export function renderCameraTrajectoryPlan(value) {
  if (!value) return "";
  const start = value.startState ?? {}, end = value.endState ?? {};
  const position = (state) => `(${state.position?.x}, ${state.position?.y}, ${state.position?.z})米，偏航${state.yawDegrees}°、俯仰${state.pitchDegrees}°、滚转${state.rollDegrees}°、视场角${state.fovDegrees}°、焦距面${state.focusDistanceMeters}米`;
  const focusPlan = Array.isArray(value.focusDistancePlan)
    ? value.focusDistancePlan.map((state) => `${state.atSeconds}秒=${state.focusDistanceMeters}米锁${state.target}（${state.interpolation}）`).join("→")
    : "";
  return [
    `运镜类型=${value.movementType}；使用${value.coordinateSpace === "subject_local" ? "主体局部" : "世界"}坐标系；控制方式=${value.guideType}`,
    `起点=${position(start)}；终点=${position(end)}`,
    `路径=${value.pathDescription}；方向=${value.directionDefinition}`,
    `全程${value.durationSeconds}秒；${value.speedCurve}`,
    `视线=${value.lookAt}；镜头与焦点=${value.lensFocus}`,
    ...(focusPlan ? [`焦距面时间曲线=${focusPlan}`] : []),
    `构图守恒=${value.framingInvariant}；主体相对运动=${value.subjectMotionRelation}`,
    `遮挡=${value.occlusionPlan}；视差=${value.parallaxExpectation}`,
    renderAnnotationInstructions(value)
  ].join("；");
}

export function renderOrbitCameraTrajectory(value) {
  if (!value) return "";
  const direction = value.direction === "clockwise_from_overhead" ? "从场景正上方俯视为顺时针" : "从场景正上方俯视为逆时针";
  const start = value.startPose ?? {}, end = value.endPose ?? {};
  return [
    `以${value.pivot?.description}为唯一轴心，使用${value.coordinateSpace === "subject_local" ? "主体局部" : "世界"}坐标系`,
    `${direction}沿连续圆弧运动 ${value.arcDegrees}°`,
    `起点方位 ${start.azimuthDegrees}°、俯仰 ${start.elevationDegrees}°、半径 ${start.radiusMeters} 米、高度 ${start.heightMeters} 米`,
    `终点方位 ${end.azimuthDegrees}°、俯仰 ${end.elevationDegrees}°、半径 ${end.radiusMeters} 米、高度 ${end.heightMeters} 米`,
    `全程 ${value.durationSeconds} 秒，${value.speedCurve}`,
    `视线与焦段：${value.lookAt}；${value.lensFocus}；滚转 ${Number(value.rollDegrees ?? 0)}°`,
    `构图守恒：${value.framingInvariant}`,
    `主体相对运动：${value.subjectMotionRelation}`,
    `遮挡计划：${value.occlusionPlan}`,
    `视差预期：${value.parallaxExpectation}`,
    renderAnnotationInstructions(value)
  ].join("；");
}
