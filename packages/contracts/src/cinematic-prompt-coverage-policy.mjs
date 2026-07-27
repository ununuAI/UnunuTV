export const CINEMATIC_STATIC_PROMPT_COVERAGE_FIELDS = Object.freeze([
  "subjectCountRoles",
  "coordinateFrame",
  "topologyAttachments",
  "geometryScale",
  "spatialBlocking",
  "poseGazeHandsProps",
  "surfaceMaterialWardrobe",
  "visibilityOcclusionCompletion",
  "cameraFramingLensFocus",
  "lightingColorExposure",
  "initialState",
  "continuityInvariants"
]);

export const CINEMATIC_DYNAMIC_PROMPT_COVERAGE_FIELDS = Object.freeze([
  "subjectTrajectories",
  "actionPhases",
  "timingSpeed",
  "cameraTrajectory",
  "contactForcesPhysics",
  "performanceDialogueAudio",
  "endStateHandoff",
  "cutSeamStrategy"
]);

export const CINEMATIC_PROMPT_COVERAGE_LABELS = Object.freeze({
  subjectCountRoles: "主体数量与角色",
  coordinateFrame: "坐标系与朝向",
  topologyAttachments: "拓扑、连接与归属",
  geometryScale: "几何、比例与尺度",
  spatialBlocking: "空间站位与前后层级",
  poseGazeHandsProps: "姿态、视线、手与道具",
  surfaceMaterialWardrobe: "表面、材质与服装",
  visibilityOcclusionCompletion: "可见性、遮挡与补全",
  cameraFramingLensFocus: "机位、构图、焦段与焦点",
  lightingColorExposure: "灯光、色彩与曝光",
  initialState: "初始状态",
  continuityInvariants: "全程连续性守恒",
  subjectTrajectories: "主体轨迹",
  actionPhases: "动作相位",
  timingSpeed: "时间与速度",
  cameraTrajectory: "摄影机轨迹",
  contactForcesPhysics: "接触、受力与物理",
  performanceDialogueAudio: "表演、对白与声音",
  endStateHandoff: "结束状态与交接",
  cutSeamStrategy: "切镜与无缝接缝"
});

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function issue(path, message, code = "invalid_field") {
  return { code, message, path };
}

function requiredFields(includeDynamics) {
  return includeDynamics
    ? [...CINEMATIC_STATIC_PROMPT_COVERAGE_FIELDS, ...CINEMATIC_DYNAMIC_PROMPT_COVERAGE_FIELDS]
    : [...CINEMATIC_STATIC_PROMPT_COVERAGE_FIELDS];
}

export function validatePromptConstraintCoverage(value, { includeDynamics = false } = {}) {
  const issues = [];
  if (!isRecord(value)) return { issues: [issue("promptCoverage", "promptCoverage must be an object", "invalid_type")], ok: false };
  for (const field of requiredFields(includeDynamics)) {
    if (!hasText(value[field])) issues.push(issue(field, `${CINEMATIC_PROMPT_COVERAGE_LABELS[field]}必须写成可观察、可验收的事实`, "required"));
  }
  if (!Array.isArray(value.escapeRoutes) || value.escapeRoutes.length === 0) {
    issues.push(issue("escapeRoutes", "必须至少声明一条模型可能利用的歧义或逃逸路径", "required"));
  } else {
    value.escapeRoutes.forEach((entry, index) => {
      if (!hasText(entry)) issues.push(issue(`escapeRoutes[${index}]`, "逃逸路径必须是非空文本", "required"));
    });
  }
  if (!Array.isArray(value.counterexampleClosures)) {
    issues.push(issue("counterexampleClosures", "counterexampleClosures must be an array", "invalid_type"));
  } else {
    value.counterexampleClosures.forEach((entry, index) => {
      if (!isRecord(entry)) {
        issues.push(issue(`counterexampleClosures[${index}]`, "反例闭环必须是对象", "invalid_type"));
        return;
      }
      for (const field of ["observedFailure", "omittedDetail", "positiveConstraint", "vetoCriterion"]) {
        if (!hasText(entry[field])) issues.push(issue(`counterexampleClosures[${index}].${field}`, `${field} is required`, "required"));
      }
    });
  }
  return { issues, ok: issues.length === 0 };
}

export function evaluatePromptConstraintCoverage({ coverage, includeDynamics = false, required = false } = {}) {
  if (!coverage) {
    const errors = required ? [{ code: "prompt_constraint_coverage_required", message: "正式生成前必须完成逐域 Prompt 覆盖审计。" }] : [];
    return { coveredFields: [], errors, includeDynamics, ok: errors.length === 0, warnings: [] };
  }
  const validation = validatePromptConstraintCoverage(coverage, { includeDynamics });
  const errors = validation.issues.map((entry) => ({
    code: entry.code === "required" ? "prompt_constraint_domain_missing" : entry.code,
    message: `${entry.path}: ${entry.message}`
  }));
  const coveredFields = requiredFields(includeDynamics).filter((field) => hasText(coverage[field]));
  const warnings = [];
  if (Array.isArray(coverage.counterexampleClosures) && coverage.counterexampleClosures.length === 0) {
    warnings.push({ code: "prompt_counterexample_closure_empty", message: "当前没有反例闭环；真实失败后必须补写，不能只改自由文本 Prompt。" });
  }
  return { coveredFields, errors, includeDynamics, ok: errors.length === 0, warnings };
}
