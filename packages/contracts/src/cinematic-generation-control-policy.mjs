import { validateTemporalMotionPlan } from "./cinematic-temporal-motion-policy.mjs";

export const CINEMATIC_PRIMARY_CONSISTENCY = Object.freeze([
  "within_clip_temporal",
  "external_identity",
  "cross_shot_continuity",
  "spatial_blocking",
  "balanced"
]);

export const CINEMATIC_CAMERA_FREEDOMS = Object.freeze(["locked", "limited", "expansive"]);
export const CINEMATIC_MOTION_COMPLEXITIES = Object.freeze(["low", "medium", "high"]);
export const CINEMATIC_DYNAMIC_CONTROL_SOURCES = Object.freeze([
  "text_motion_contract",
  "action_phase_board",
  "video_motion_reference",
  "hybrid"
]);
export const CINEMATIC_REFERENCE_TEMPORAL_ROLES = Object.freeze([
  "identity_only",
  "static_state",
  "initial_state",
  "action_phase",
  "endpoint",
  "continuity_state",
  "style_only"
]);

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function issue(path, message, code = "invalid_field") {
  return { code, message, path };
}

function validateTextArray(value, path, issues, minimum = 0) {
  if (!Array.isArray(value)) {
    issues.push(issue(path, `${path} must be an array`, "invalid_type"));
    return;
  }
  if (value.length < minimum) issues.push(issue(path, `${path} must contain at least ${minimum} item(s)`, "required"));
  value.forEach((entry, index) => {
    if (!hasText(entry)) issues.push(issue(`${path}[${index}]`, `${path}[${index}] must be non-empty text`, "required"));
  });
}

function validateRewriteList(value, path, issues, sourceField, targetField) {
  if (!Array.isArray(value)) {
    issues.push(issue(path, `${path} must be an array`, "invalid_type"));
    return;
  }
  value.forEach((entry, index) => {
    if (!isRecord(entry)) {
      issues.push(issue(`${path}[${index}]`, `${path}[${index}] must be an object`, "invalid_type"));
      return;
    }
    if (!hasText(entry[sourceField])) issues.push(issue(`${path}[${index}].${sourceField}`, `${sourceField} is required`, "required"));
    if (!hasText(entry[targetField])) issues.push(issue(`${path}[${index}].${targetField}`, `${targetField} is required`, "required"));
  });
}

export function validateReferenceSemanticControl(value) {
  const issues = [];
  if (!isRecord(value)) return { issues: [issue("semanticControl", "semanticControl must be an object", "invalid_type")], ok: false };
  if (!CINEMATIC_REFERENCE_TEMPORAL_ROLES.includes(value.temporalRole)) {
    issues.push(issue("temporalRole", `temporalRole must be one of: ${CINEMATIC_REFERENCE_TEMPORAL_ROLES.join(", ")}`, "invalid_enum"));
  }
  validateTextArray(value.preserve, "preserve", issues);
  validateRewriteList(value.replace, "replace", issues, "observed", "target");
  validateRewriteList(value.complete, "complete", issues, "missing", "target");
  validateTextArray(value.ignore, "ignore", issues);
  validateTextArray(value.styleOnly, "styleOnly", issues);
  const count = [value.preserve, value.replace, value.complete, value.ignore, value.styleOnly]
    .reduce((total, entries) => total + (Array.isArray(entries) ? entries.length : 0), 0);
  if (count === 0) issues.push(issue("semanticControl", "semanticControl must declare at least one preserve, replace, complete, ignore, or styleOnly fact", "required"));
  return { issues, ok: issues.length === 0 };
}

export function validateGenerationControlIntent(value) {
  const issues = [];
  if (!isRecord(value)) return { issues: [issue("controlIntent", "controlIntent must be an object", "invalid_type")], ok: false };
  if (!CINEMATIC_PRIMARY_CONSISTENCY.includes(value.primaryConsistency)) {
    issues.push(issue("primaryConsistency", `primaryConsistency must be one of: ${CINEMATIC_PRIMARY_CONSISTENCY.join(", ")}`, "invalid_enum"));
  }
  if (!CINEMATIC_CAMERA_FREEDOMS.includes(value.cameraFreedom)) {
    issues.push(issue("cameraFreedom", `cameraFreedom must be one of: ${CINEMATIC_CAMERA_FREEDOMS.join(", ")}`, "invalid_enum"));
  }
  if (!CINEMATIC_MOTION_COMPLEXITIES.includes(value.motionComplexity)) {
    issues.push(issue("motionComplexity", `motionComplexity must be one of: ${CINEMATIC_MOTION_COMPLEXITIES.join(", ")}`, "invalid_enum"));
  }
  if (!hasText(value.modeRationale)) issues.push(issue("modeRationale", "modeRationale is required", "required"));
  validateTextArray(value.invariants, "invariants", issues, 1);
  validateTextArray(value.permittedChanges, "permittedChanges", issues);
  if (!isRecord(value.dynamicControl)) {
    issues.push(issue("dynamicControl", "dynamicControl must be an object", "invalid_type"));
  } else {
    if (!CINEMATIC_DYNAMIC_CONTROL_SOURCES.includes(value.dynamicControl.source)) {
      issues.push(issue("dynamicControl.source", `dynamicControl.source must be one of: ${CINEMATIC_DYNAMIC_CONTROL_SOURCES.join(", ")}`, "invalid_enum"));
    }
    for (const field of ["subjectTrajectories", "actionPhases", "timing", "cameraTrajectory", "physicsContinuity", "endState"]) {
      if (!hasText(value.dynamicControl[field])) issues.push(issue(`dynamicControl.${field}`, `dynamicControl.${field} is required`, "required"));
    }
  }
  if (value.constraintRelease !== undefined) {
    if (!isRecord(value.constraintRelease)) {
      issues.push(issue("constraintRelease", "constraintRelease must be an object", "invalid_type"));
    } else {
      if (!hasText(value.constraintRelease.mechanism)) issues.push(issue("constraintRelease.mechanism", "constraintRelease.mechanism is required", "required"));
      validateTextArray(value.constraintRelease.releases, "constraintRelease.releases", issues, 1);
      validateTextArray(value.constraintRelease.preserves, "constraintRelease.preserves", issues, 1);
    }
  }
  if (value.temporalMotionPlan !== undefined) {
    const temporal = validateTemporalMotionPlan(value.temporalMotionPlan);
    issues.push(...temporal.issues.map((entry) => ({ ...entry, path: `temporalMotionPlan.${entry.path}` })));
  }
  return { issues, ok: issues.length === 0 };
}

function semanticCounts(referenceBindings) {
  return referenceBindings.reduce((counts, binding) => {
    const control = binding?.semanticControl;
    if (!isRecord(control)) return counts;
    for (const key of ["preserve", "replace", "complete", "ignore", "styleOnly"]) {
      counts[key] += Array.isArray(control[key]) ? control[key].length : 0;
    }
    return counts;
  }, { preserve: 0, replace: 0, complete: 0, ignore: 0, styleOnly: 0 });
}

function frameAnchorPolicy(mode) {
  if (mode === "first_frame") return { firstFrameScope: "t0_boundary_only", lastFrameScope: null, postAnchorEvolution: "dynamic_contract" };
  if (mode === "first_last_frame") return { firstFrameScope: "t0_boundary_only", lastFrameScope: "target_endpoint_only", postAnchorEvolution: "dynamic_contract" };
  return { firstFrameScope: null, lastFrameScope: null, postAnchorEvolution: "dynamic_contract" };
}

export function evaluateCinematicGenerationControl({ generationUnit, referenceBindings = [] }) {
  const errors = [];
  const warnings = [];
  const intent = generationUnit?.controlIntent;
  const mode = generationUnit?.generationParameters?.mode;
  const anchorPolicy = frameAnchorPolicy(mode);
  const gates = isRecord(generationUnit?.executionGates) ? generationUnit.executionGates : {};
  if (!intent) {
    if (gates.requireGenerationControlIntent) {
      errors.push({ code: "generation_control_intent_required", message: "正式生成前必须声明一致性优先级、模式理由和独立动态合同。" });
    }
    return { errors, frameAnchorPolicy: anchorPolicy, intent: null, ok: errors.length === 0, referenceSemantics: semanticCounts(referenceBindings), selectedMode: mode, warnings };
  }

  const intentValidation = validateGenerationControlIntent(intent);
  errors.push(...intentValidation.issues.map((entry) => ({ code: entry.code, message: `${entry.path}: ${entry.message}` })));
  if (gates.requireReferenceSemanticControl && mode !== "text_to_video") {
    referenceBindings.forEach((binding, index) => {
      if (!binding?.semanticControl) {
        errors.push({ code: "reference_semantic_control_required", message: `参考图${index + 1}必须声明保留、替换、补全、忽略或仅风格职责。` });
      }
    });
  }

  const highMotion = intent.motionComplexity === "high";
  const expansive = intent.cameraFreedom === "expansive";
  if (["first_frame", "first_last_frame"].includes(mode) && highMotion && expansive && !intent.constraintRelease) {
    errors.push({
      code: "hard_frame_anchor_motion_conflict",
      message: "高复杂运动和大幅运镜被首帧/首尾帧硬锚定；必须声明约束释放机制、改用语义参考，或拆成可续接镜头。"
    });
  }
  if (mode === "text_to_video" && ["external_identity", "cross_shot_continuity"].includes(intent.primaryConsistency)) {
    errors.push({
      code: "text_mode_external_consistency_conflict",
      message: "当前首要目标要求外部身份或跨镜精确连续，但纯文生视频没有像素级入口载体；应改用语义参考/首帧/续接尾帧，或降低该目标。"
    });
  }
  if (mode === "text_to_video" && referenceBindings.length) {
    errors.push({ code: "text_mode_reference_conflict", message: "text_to_video 不应携带图片参考；若图像只提供部分事实，应选择 image_reference 并声明语义职责。" });
  }

  const firstFrameMediaId = generationUnit?.generationParameters?.firstFrameMediaId;
  const lastFrameMediaId = generationUnit?.generationParameters?.lastFrameMediaId;
  const firstFrameBinding = referenceBindings.find((entry) => entry.mediaId === firstFrameMediaId);
  const lastFrameBinding = referenceBindings.find((entry) => entry.mediaId === lastFrameMediaId);
  if (["first_frame", "first_last_frame"].includes(mode) && firstFrameMediaId && gates.requireReferenceSemanticControl) {
    if (!firstFrameBinding) {
      errors.push({ code: "first_frame_semantic_control_required", message: "实际首帧必须声明为仅负责 t0 的初始/续接边界；t0+1 起由独立动态合同驱动。" });
    } else if (firstFrameBinding.semanticControl) {
      const allowedRoles = generationUnit?.visualAnchorPolicy === "PREVIOUS_ACCEPTED_TAIL" ? ["continuity_state"] : ["initial_state", "continuity_state"];
      if (!allowedRoles.includes(firstFrameBinding.semanticControl.temporalRole)) {
        errors.push({ code: "first_frame_temporal_role_conflict", message: `实际首帧的时间职责必须是 ${allowedRoles.join(" 或 ")}，只锁定 t0 边界而不代替后续动态。` });
      }
    }
  }
  if (mode === "first_last_frame" && lastFrameMediaId && gates.requireReferenceSemanticControl && lastFrameBinding?.semanticControl?.temporalRole !== "endpoint") {
    errors.push({ code: "last_frame_temporal_role_conflict", message: "实际尾帧必须声明为 endpoint，只锁定目标出口状态；中间演化仍由独立动态合同驱动。" });
  }

  const frameMediaIds = new Set([
    firstFrameMediaId,
    lastFrameMediaId
  ].filter(Boolean));
  if (["first_frame", "first_last_frame"].includes(mode)) {
    for (const binding of referenceBindings.filter((entry) => frameMediaIds.has(entry.mediaId))) {
      const control = binding.semanticControl;
      if (!isRecord(control)) continue;
      if ((Array.isArray(control.replace) && control.replace.length) || (Array.isArray(control.ignore) && control.ignore.length)) {
        errors.push({
          code: "frame_pixel_override_conflict",
          message: `${binding.displayName}被声明为实际首/尾帧，同时又要求替换或忽略其可见像素；应先生成修正后的关键帧，或改用 image_reference。`
        });
      }
    }
  }
  if (mode === "image_reference" && referenceBindings.length && semanticCounts(referenceBindings).preserve === 0) {
    warnings.push({ code: "image_reference_without_preserve_fact", message: "语义参考没有声明任何必须保留事实，可能不需要提交这张图。" });
  }

  return {
    errors,
    frameAnchorPolicy: anchorPolicy,
    intent,
    ok: errors.length === 0,
    referenceSemantics: semanticCounts(referenceBindings),
    selectedMode: mode,
    warnings
  };
}
