import {
  CINEMATIC_DYNAMIC_PROMPT_COVERAGE_FIELDS,
  CINEMATIC_PROMPT_COVERAGE_LABELS,
  CINEMATIC_STATIC_PROMPT_COVERAGE_FIELDS
} from "./cinematic-prompt-coverage-policy.mjs";
import { renderCameraTrajectoryPlan, renderOrbitCameraTrajectory } from "./cinematic-camera-trajectory-policy.mjs";
import { renderTemporalMotionPlan } from "./cinematic-temporal-motion-policy.mjs";

export const CINEMATIC_CONTROLLED_LEXICON = Object.freeze({
  shotSize: "景别", cameraPosition: "机位", angle: "角度", perspective: "透视与焦段意图", composition: "构图", depthOfField: "景深",
  focus: "焦点", focusChange: "焦点变化", movementPath: "摄影机路线", speedCurve: "速度曲线", startPoint: "摄影机起点", stopPoint: "摄影机终点", narrativePurpose: "运动叙事目的",
  source: "动机光源", direction: "光向", softness: "软硬", colorTemperature: "色温", contrast: "反差", negativeFill: "负补光", exposureProtection: "曝光保护",
  primary: "主色", secondary: "辅助色", accent: "点缀色", saturation: "饱和度", separation: "人物背景分离", continuity: "色彩连续性",
  objective: "人物目标", subtext: "潜台词", breathing: "呼吸", pause: "停顿", eyeLine: "视线落点", brows: "眉眼", mouthCorner: "嘴角", jaw: "下颌", shoulders: "肩膀", hands: "手部", centerOfGravity: "重心", microExpressionOrder: "微表情顺序",
  ambience: "环境底", foley: "拟音", distance: "空间距离", reverb: "混响", silence: "静默", bridge: "声音桥", music: "音乐",
  positions: "站位", paths: "人物路径", gaze: "视线", props: "道具", contactSurface: "接触面", force: "受力", body: "身体物理", cloth: "布料", hair: "头发", contact: "接触物理", environment: "环境物理",
  entrance: "剪辑入口", exit: "剪辑出口", axis: "轴线", screenDirection: "屏幕方向",
  baseline: "表演基线", microExpression: "微表情", combatActing: "动作表演",
  initialState: "表演初态", trigger: "表演触发", turningPoint: "表演阈值", endState: "表演终态", forbiddenActing: "表演禁止捷径",
  palette: "色板", rules: "规则", violence: "暴力表达",
  world: "环境声", dialoguePlan: "对白方案",
  cutIntent: "切镜意图", injuryContinuity: "伤势连续性"
});

const CINEMATIC_INTERNAL_PROMPT_FIELDS = new Set(["sourceRowId"]);
const CINEMATIC_DIRECTION_LABELS = Object.freeze({
  away_from_camera: "远离摄影机",
  screen_down: "画面向下",
  screen_left: "画面向左",
  screen_right: "画面向右",
  screen_up: "画面向上",
  stationary: "静止",
  toward_camera: "朝向摄影机"
});

export function cleanCinematicText(value) {
  return typeof value === "string" ? value.replace(/\s+/gu, " ").trim() : "";
}

export function terminateCinematicSentence(value) {
  const text = cleanCinematicText(value).replace(/。；/gu, "；").replace(/；。/gu, "。");
  if (!text || /[。！？!?；][”’"']?$/u.test(text)) return text;
  return `${text}。`;
}

function labeledCinematicLine(label, value) {
  const text = cleanCinematicText(value);
  return text ? `${label}：${terminateCinematicSentence(text)}` : "";
}

export function cleanCinematicList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    if (typeof entry === "string") return cleanCinematicText(entry);
    if (!entry || typeof entry !== "object") return "";
    const speaker = cleanCinematicText(entry.speaker ?? entry.character ?? entry.name);
    const text = cleanCinematicText(entry.text ?? entry.line ?? entry.dialogue);
    return speaker && text ? `${speaker}：“${text}”` : text || cleanCinematicText(entry.description);
  }).filter(Boolean);
}

export function describeCinematicRecord(value, labels = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return cleanCinematicText(value);
  return Object.entries(value).flatMap(([key, entry]) => {
    if (CINEMATIC_INTERNAL_PROMPT_FIELDS.has(key)) return [];
    const label = labels[key] ?? CINEMATIC_CONTROLLED_LEXICON[key] ?? key;
    if (Array.isArray(entry)) {
      const values = cleanCinematicList(entry);
      return values.length ? [`${label}：${values.join("；")}`] : [];
    }
    if (entry && typeof entry === "object") {
      const nested = describeCinematicRecord(entry, labels);
      return nested ? [`${label}：${nested}`] : [];
    }
    const text = cleanCinematicText(String(entry ?? ""));
    return text ? [`${label}：${text}`] : [];
  }).join("；");
}

export function dedupeHighRiskNegatives({ shots, unit }) {
  const values = [
    ...shots.flatMap((shot) => [...cleanCinematicList(shot.mustNotAppearYet), ...cleanCinematicList(shot.negativeConstraints)]),
    ...cleanCinematicList(unit.highRiskNegatives)
  ];
  const unique = [];
  const seen = new Set();
  for (const value of values) {
    const key = value.toLocaleLowerCase("zh-CN").replace(/[，。；、,.!！?？\s]/gu, "");
    if (key && !seen.has(key)) {
      seen.add(key);
      unique.push(value);
    }
  }
  return unique;
}

function renderContinuationHandoff(unit) {
  const handoff = unit.continuationHandoff;
  if (!handoff || typeof handoff !== "object") return [];
  const duplicate = handoff.mode === "DUPLICATE_HANDOFF";
  const seamLabels = {
    action_match: "动作匹配",
    dark_frame: "暗帧",
    flash: "闪白",
    foreground_wipe: "前景遮挡划过",
    motion_blur: "运动模糊",
    occlusion: "遮挡",
    whip_pan: "甩镜"
  };
  const conservationLabels = {
    action_phase: "动作相位",
    blocking: "人物站位",
    lighting: "光线",
    props: "道具",
    screen_direction: "银幕方向"
  };
  const modeRule = duplicate
    ? "先复现同一上一段的 H0→H1 动作，再从 H1 之后产生明确新内容；重叠区只供剪辑对齐，不得停在重复动作。"
    : "以上一段 H1 为唯一入口直接续演新动作，不复演 H0→H1，不制造重复区。";
  return [
    labeledCinematicLine("续接方式", modeRule),
    labeledCinematicLine("动作相位", `${handoff.entryActionPhase} → ${handoff.exitActionPhase}；${handoff.repeatedAction}；H1 后新增：${handoff.newContentAfterH1}`),
    duplicate ? labeledCinematicLine("重叠动作", handoff.h0ToH1Action) : "",
    labeledCinematicLine("隐形接缝", `${seamLabels[handoff.seamType] ?? handoff.seamType}；${handoff.seamOpportunity}`),
    labeledCinematicLine("摄影机状态", `方向：${handoff.camera?.movementDirection}；出口速度：${handoff.camera?.exitSpeed}；入口速度：${handoff.camera?.entrySpeed}；焦段：${handoff.camera?.lens}；焦点：${handoff.camera?.focus}；曝光：${handoff.camera?.exposure}`),
    labeledCinematicLine("连续性守恒", cleanCinematicList(handoff.conservationChecks).map((entry) => conservationLabels[entry] ?? entry).join("、")),
    labeledCinematicLine("剪辑规则", `${handoff.cutPointRule}；${handoff.trimPlan}；切点按动作相位与实际重复区边界确定，不使用固定秒数。`),
    labeledCinematicLine("声音桥", `环境底：${handoff.audioBridge?.ambience}；同步点：${handoff.audioBridge?.syncCue}`)
  ];
}

export function compileCinematicPromptSections({ profile, referenceBindings, shots, storyPacket, unit, visualBible }) {
  return [
    section("参考", renderReferences(referenceBindings), 100, referenceBindings.length > 0),
    section("参考图语义职责", renderReferenceSemanticControls(referenceBindings), 100, referenceBindings.some((binding) => binding.semanticControl)),
    section("风格", renderStyle(visualBible, shots), 80, true),
    section("场景布局", renderSceneLayout(visualBible, shots), 90, true),
    section("初始主体状态", renderInitialSubjectState(shots), 100, true),
    section("初始空间位置", renderInitialSpatialPosition(shots), 100, true),
    section("本段剧情与实际状态边界", renderSequenceState(unit), 100, Boolean(unit.sequenceState)),
    section("续镜交接", renderContinuationHandoff(unit), 100, Boolean(unit.continuationHandoff)),
    section("逐域 Prompt 覆盖", renderPromptCoverage(unit.promptCoverage), 100, Boolean(unit.promptCoverage)),
    section("独立动态合同", renderDynamicControl(unit), 100, Boolean(unit.controlIntent?.dynamicControl)),
    section("逐帧时空运动", renderTemporalMotionPlan(unit.controlIntent?.temporalMotionPlan), 100, Boolean(unit.controlIntent?.temporalMotionPlan)),
    section("画面时间线", renderTimeline({ profile, shots, storyPacket, unit }), 100, true),
    section("结束状态与交接", renderEndHandoff(shots, unit), 100, true),
    section("本段连续性与禁止项", [
      labeledCinematicLine("连续性入口", unit.continuityBoundary?.entry),
      terminateCinematicSentence(dedupeHighRiskNegatives({ shots, unit }).map((entry) => `不得${entry.replace(/^不得/u, "")}`).join("；"))
    ], 80, true)
  ].filter(Boolean);
}

function renderSequenceState(unit) {
  const state = unit.sequenceState;
  if (!state || typeof state !== "object" || Array.isArray(state)) return [];
  const audit = unit.executionGateEvidence?.sequenceStateAudit;
  const actualStart = audit?.canonicalCarryForwardState ?? state.plannedStartState;
  return [
    labeledCinematicLine("实际入口状态", describeCinematicRecord(actualStart)),
    labeledCinematicLine("已经发生不得重演", cleanCinematicList(state.alreadyHappened).join("；")),
    labeledCinematicLine("本段唯一要完成", cleanCinematicList(state.thisUnitOnly).join("；")),
    labeledCinematicLine("保留后续不得提前", cleanCinematicList(state.reservedForLater).join("；")),
    labeledCinematicLine("摄影机承担", state.intentCarriers?.camera),
    labeledCinematicLine("灯光承担", state.intentCarriers?.lighting),
    labeledCinematicLine("表演承担", state.intentCarriers?.performance),
    labeledCinematicLine("声音承担", state.intentCarriers?.sound),
    labeledCinematicLine("目标出口状态", describeCinematicRecord(state.plannedEndState))
  ];
}

function renderPromptCoverage(coverage) {
  if (!coverage || typeof coverage !== "object" || Array.isArray(coverage)) return [];
  const fields = [...CINEMATIC_STATIC_PROMPT_COVERAGE_FIELDS, ...CINEMATIC_DYNAMIC_PROMPT_COVERAGE_FIELDS];
  const domains = fields.flatMap((field) => cleanCinematicText(coverage[field])
    ? [labeledCinematicLine(CINEMATIC_PROMPT_COVERAGE_LABELS[field], coverage[field])]
    : []);
  const escapeRoutes = cleanCinematicList(coverage.escapeRoutes).map((entry) => labeledCinematicLine("逃逸路径", entry));
  const closures = (Array.isArray(coverage.counterexampleClosures) ? coverage.counterexampleClosures : []).map((entry) => labeledCinematicLine(
    "反例闭环",
    `失败=${cleanCinematicText(entry?.observedFailure)}；漏项=${cleanCinematicText(entry?.omittedDetail)}；正向约束=${cleanCinematicText(entry?.positiveConstraint)}；一票否决=${cleanCinematicText(entry?.vetoCriterion)}`
  ));
  return [...domains, ...escapeRoutes, ...closures];
}

export function formatCinematicSeconds(value) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

export function renderCinematicPerformanceTimeline(performance, offsetSeconds = 0) {
  if (!performance || typeof performance !== "object" || Array.isArray(performance)) return "";
  const { temporalBeats = [], ...summary } = performance;
  const overview = describeCinematicRecord(summary);
  const beats = (Array.isArray(temporalBeats) ? temporalBeats : []).map((beat) => {
    const start = offsetSeconds + Number(beat?.startSeconds || 0);
    const end = offsetSeconds + Number(beat?.endSeconds || 0);
    const internal = cleanCinematicText(beat?.internalState);
    const visible = cleanCinematicText(beat?.visibleEvidence);
    return `${formatCinematicSeconds(start)}-${formatCinematicSeconds(end)}秒：人物内在=${internal}；可见证据=${visible}`;
  });
  return [overview, beats.length ? `秒级表演因果：${beats.join("；")}` : ""].filter(Boolean).join("；");
}

function section(title, lines, priority, required = false) {
  const sourceLines = Array.isArray(lines) ? lines : [lines];
  const cleanLines = sourceLines.flatMap((line) => Array.isArray(line) ? line : [line]).map(cleanCinematicText).filter(Boolean);
  return cleanLines.length ? { lines: cleanLines, required, priority, title } : null;
}

function renderReferences(bindings) {
  return terminateCinematicSentence([...bindings].sort((a, b) => a.providerIndex - b.providerIndex)
    .map((binding) => `（参考图${binding.providerIndex}）=${cinematicReferenceAlias(binding)}`).join("，"));
}

function renderReferenceSemanticControls(bindings) {
  return [...bindings].sort((a, b) => a.providerIndex - b.providerIndex).flatMap((binding) => {
    const control = binding.semanticControl;
    if (!control || typeof control !== "object") return [];
    const prefix = `参考图${binding.providerIndex}`;
    const lines = [];
    if (control.preserve?.length) lines.push(labeledCinematicLine(`${prefix}必须保留`, control.preserve.join("；")));
    if (control.replace?.length) lines.push(labeledCinematicLine(`${prefix}必须替换`, control.replace.map((entry) => `${entry.observed} → ${entry.target}`).join("；")));
    if (control.complete?.length) lines.push(labeledCinematicLine(`${prefix}必须补全`, control.complete.map((entry) => `${entry.missing} → ${entry.target}`).join("；")));
    if (control.ignore?.length) lines.push(labeledCinematicLine(`${prefix}不得继承`, control.ignore.join("；")));
    if (control.styleOnly?.length) lines.push(labeledCinematicLine(`${prefix}仅作风格参考`, control.styleOnly.join("；")));
    lines.push(labeledCinematicLine(`${prefix}时间职责`, control.temporalRole));
    return lines;
  });
}

function renderDynamicControl(unit) {
  const intent = unit.controlIntent;
  const dynamic = intent?.dynamicControl;
  if (!dynamic || typeof dynamic !== "object") return [];
  const lines = [
    labeledCinematicLine("一致性首要目标", intent.primaryConsistency),
    labeledCinematicLine("模式选择理由", intent.modeRationale),
    labeledCinematicLine("静态参考不提供运动", "图片只约束明确声明的静态事实；运动由以下时间合同独立定义，不得从静态姿态擅自猜测"),
    ["first_frame", "first_last_frame"].includes(unit.generationParameters?.mode) ? labeledCinematicLine("首帧职责", "只锁定 t0 的初始/续接边界；t0+1 起的人物、动作、摄影机、节奏、物理与结束状态全部由独立动态合同驱动，不得把首帧当作整段冻结模板") : "",
    labeledCinematicLine("主体轨迹", dynamic.subjectTrajectories),
    labeledCinematicLine("动作相位", dynamic.actionPhases),
    labeledCinematicLine("时序与速度", dynamic.timing),
    labeledCinematicLine("摄影机轨迹", dynamic.cameraTrajectory),
    labeledCinematicLine("物理连续", dynamic.physicsContinuity),
    labeledCinematicLine("结束状态", dynamic.endState),
    labeledCinematicLine("全程守恒", intent.invariants?.join("；")),
    labeledCinematicLine("允许变化", intent.permittedChanges?.join("；"))
  ];
  if (intent.constraintRelease) {
    lines.push(labeledCinematicLine("约束释放", `${intent.constraintRelease.mechanism}；释放：${intent.constraintRelease.releases.join("、")}；继续守恒：${intent.constraintRelease.preserves.join("、")}`));
  }
  return lines;
}

export function cinematicReferenceAlias(binding) {
  const explicit = cleanCinematicText(binding?.promptAlias);
  if (explicit) return explicit;
  const displayName = cleanCinematicText(binding?.displayName) || `参考图${binding?.providerIndex || ""}`;
  const [subject = displayName, detail = ""] = displayName.split(/\s*[·｜|]\s*/u).map(cleanCinematicText);
  if (String(binding?.role || "").includes("action")) {
    const action = detail.replace(/(?:动作|相位)?板$/u, "").trim();
    return action || `${subject}动作`;
  }
  return subject || displayName;
}

function dialogueTextSet(value) {
  return new Set((Array.isArray(value) ? value : []).map((entry) => cleanCinematicText(typeof entry === "string" ? entry : entry?.text ?? entry?.line ?? entry?.dialogue)).filter(Boolean));
}

function unitLockedText(storyPacket, shots) {
  const globalDialogue = dialogueTextSet(storyPacket.dialogue);
  const shotDialogue = shots.flatMap((shot) => cleanCinematicList(shot.dialogue));
  const nonDialogueLocks = cleanCinematicList(storyPacket.userLockedText).filter((entry) => !globalDialogue.has(entry));
  return { nonDialogueLocks, shotDialogue };
}

function renderStyle(visualBible, shots) {
  const firstShot = shots[0] ?? {};
  const contentFormat = cleanCinematicText(firstShot.cinematography?.format)
    .replace(/(?:16\s*:\s*9|9\s*:\s*16|1\s*:\s*1)/giu, "")
    .replace(/\s{2,}/gu, " ")
    .trim();
  return terminateCinematicSentence([contentFormat, visualBible.cinematography?.grammar, visualBible.cinematography?.lensPreference, visualBible.performance?.baseline]
    .map(cleanCinematicText).filter(Boolean).join("，"));
}

function renderSceneLayout(visualBible, shots) {
  const firstShot = shots[0] ?? {};
  return terminateCinematicSentence([visualBible.productionDesign?.architecture, visualBible.productionDesign?.materials, visualBible.spatialDramaturgy?.rule, firstShot.blocking?.props]
    .map(cleanCinematicText).filter(Boolean).join("；"));
}

function shotIndex(unit, shot) {
  return unit.shotLinks.find((entry) => entry.shotId === shot.shotId)?.order ?? shot.order;
}

function renderInitialSubjectState(shots) {
  const firstShot = shots[0] ?? {};
  const continuity = firstShot.continuityPlan?.entry;
  if (continuity?.subjects?.length) {
    const names = new Map([
      ...continuity.subjects,
      ...(Array.isArray(continuity.environment) ? continuity.environment : []),
      ...(Array.isArray(continuity.props) ? continuity.props : [])
    ].map((entry) => [entry.entityId, entry.displayName]));
    return continuity.subjects.map((subject) => terminateCinematicSentence([
      `${subject.displayName}位于${subject.zoneLabel}`,
      `身体朝向${CINEMATIC_DIRECTION_LABELS[subject.bodyOrientation] ?? subject.bodyOrientation}`,
      `视线落在${names.get(subject.gazeTargetId) ?? subject.gazeTargetId}`,
      cleanCinematicList(subject.stateTags).join("、"),
      cleanCinematicList(subject.irreversibleStateTags).length ? `不可逆状态：${cleanCinematicList(subject.irreversibleStateTags).join("、")}` : ""
    ].filter(Boolean).join("；")));
  }
  return terminateCinematicSentence([firstShot.openingState, firstShot.performance?.objective ? `人物目标：${firstShot.performance.objective}` : "", firstShot.performance?.subtext ? `潜台词：${firstShot.performance.subtext}` : ""]
    .map(cleanCinematicText).filter(Boolean).join("；"));
}

function renderInitialSpatialPosition(shots) {
  const continuity = shots[0]?.continuityPlan?.entry;
  if (continuity?.axis) {
    const anchors = [
      ...(Array.isArray(continuity.environment) ? continuity.environment : []),
      ...(Array.isArray(continuity.props) ? continuity.props : [])
    ].map((entry) => `${entry.displayName}@${entry.zoneLabel}·${entry.presence}${entry.count > 1 ? `×${entry.count}` : ""}`);
    return [
      terminateCinematicSentence(`${continuity.axis.axisLabel}：${continuity.axis.entranceZoneLabel} → ${continuity.axis.targetZoneLabel}，正向${CINEMATIC_DIRECTION_LABELS[continuity.axis.positiveScreenDirection] ?? continuity.axis.positiveScreenDirection}`),
      anchors.length ? terminateCinematicSentence(`空间锚：${anchors.join("；")}`) : ""
    ].filter(Boolean);
  }
  const blocking = shots[0]?.blocking ?? {};
  return terminateCinematicSentence([blocking.positions ?? blocking.position, blocking.paths ? `路径：${blocking.paths}` : "", blocking.gaze ? `视线：${blocking.gaze}` : ""]
    .map(cleanCinematicText).filter(Boolean).join("；"));
}

function shotPlannedDuration(shot) {
  const ends = Array.isArray(shot.internalTimeSlots) ? shot.internalTimeSlots.map((slot) => Number(slot?.endSeconds)).filter(Number.isFinite) : [];
  return ends.length ? Math.max(...ends) : 0;
}

function shotTimelineRanges(unit, shots) {
  const requestedDuration = Number(unit.generationParameters?.duration);
  const plannedDurations = shots.map(shotPlannedDuration);
  const plannedTotal = plannedDurations.reduce((sum, duration) => sum + duration, 0);
  const fallback = Number.isFinite(requestedDuration) && requestedDuration > 0 ? requestedDuration / Math.max(1, shots.length) : 1;
  const usePlanned = plannedTotal > 0 && (!Number.isFinite(requestedDuration) || Math.abs(plannedTotal - requestedDuration) <= 0.01);
  let cursor = 0;
  return plannedDurations.map((planned) => {
    const startSeconds = cursor;
    cursor += usePlanned ? planned : fallback;
    return { startSeconds, endSeconds: cursor };
  });
}

function renderTimeline({ profile, shots, storyPacket, unit }) {
  const ranges = shotTimelineRanges(unit, shots);
  const lines = [];
  const { nonDialogueLocks } = unitLockedText(storyPacket, shots);
  if (nonDialogueLocks.length) lines.push(labeledCinematicLine("本段锁定原文", nonDialogueLocks.join("；")));
  for (const [position, shot] of shots.entries()) {
    const index = shotIndex(unit, shot);
    const range = ranges[position];
    const link = unit.shotLinks.find((entry) => entry.shotId === shot.shotId) ?? {};
    lines.push(`镜头${index}：${formatCinematicSeconds(range.startSeconds)}-${formatCinematicSeconds(range.endSeconds)}秒`);
    const clause = (value) => cleanCinematicText(value).replace(/[。；]+$/u, "");
    lines.push(labeledCinematicLine("叙事与动作", `${clause(shot.narrativeJob)}；${clause(shot.openingState)} → ${cleanCinematicList(shot.actionChain).map(clause).join(" → ")} → ${cleanCinematicText(shot.endingState)}`));
    const camera = shot.cinematography ?? {};
    const cameraFields = [["景别", camera.shotSize], ["机位", camera.cameraPosition], ["角度", camera.angle], ["焦段", camera.perspective], ["构图", camera.composition], ["景深", camera.depthOfField], ["焦点", camera.focus]]
      .flatMap(([label, value]) => cleanCinematicText(value) ? [`${label}：${cleanCinematicText(value)}`] : []);
    if (cameraFields.length) lines.push(labeledCinematicLine("摄影机", cameraFields.join("；")));
    if (shot.cameraTrajectoryPlan) lines.push(labeledCinematicLine("结构化摄影机轨迹", renderCameraTrajectoryPlan(shot.cameraTrajectoryPlan)));
    else if (shot.orbitCameraTrajectory) lines.push(labeledCinematicLine("结构化环绕轨迹", renderOrbitCameraTrajectory(shot.orbitCameraTrajectory)));
    lines.push(labeledCinematicLine("镜头运动顺序", `${[camera.movementPath, camera.speedCurve, camera.startPoint && camera.stopPoint ? `${camera.startPoint} → ${camera.stopPoint}` : ""].map(cleanCinematicText).filter(Boolean).join(" → ")}（收束）`));
    const blocking = shot.blocking ?? {};
    lines.push(labeledCinematicLine("空间调度", [blocking.positions ?? blocking.position, blocking.paths, blocking.gaze, blocking.hands, blocking.contactSurface].map(cleanCinematicText).filter(Boolean).join("；")));
    const continuity = shot.continuityPlan?.entry;
    if (continuity && Array.isArray(shot.continuityPlan?.actionOrigins) && shot.continuityPlan.actionOrigins.length) {
      const names = new Map([
        ...(Array.isArray(continuity.subjects) ? continuity.subjects : []),
        ...(Array.isArray(continuity.environment) ? continuity.environment : []),
        ...(Array.isArray(continuity.props) ? continuity.props : [])
      ].map((entry) => [entry.entityId, entry.displayName]));
      const actions = shot.continuityPlan.actionOrigins.map((action) => `${names.get(action.initiatorId) ?? action.initiatorId}.${action.originContact} → ${action.carrierLabel}×${action.count} → ${CINEMATIC_DIRECTION_LABELS[action.trajectoryDirection] ?? action.trajectoryDirection} → ${names.get(action.targetId) ?? action.targetId}`);
      lines.push(labeledCinematicLine("动作发起链", actions.join("；")));
    }
    const performance = renderCinematicPerformanceTimeline(shot.performance, range.startSeconds);
    if (performance || shot.reactionTurn) lines.push(labeledCinematicLine("表演", [performance, shot.reactionTurn ? `转折：${cleanCinematicText(shot.reactionTurn)}` : ""].filter(Boolean).join("；")));
    if (cleanCinematicList(shot.dialogue).length) lines.push(labeledCinematicLine("对白", cleanCinematicList(shot.dialogue).join("；")));
    if (position > 0) lines.push(labeledCinematicLine("切镜依据", link.cutReason || shot.cutReason));
    if (profile?.supportsPromptTimeSlots && Array.isArray(shot.internalTimeSlots) && shot.internalTimeSlots.length) {
      const offset = range.startSeconds;
      lines.push(labeledCinematicLine("动作时间", shot.internalTimeSlots.map((slot) => `${formatCinematicSeconds(offset + Number(slot.startSeconds || 0))}秒-${formatCinematicSeconds(offset + Number(slot.endSeconds || 0))}秒：${cleanCinematicText(slot.action)}`).join("；")));
    }
    const lighting = describeCinematicRecord(shot.lighting), color = describeCinematicRecord(shot.color), physicsVfx = describeCinematicRecord(shot.physicsVfx), sound = describeCinematicRecord(shot.sound), edit = describeCinematicRecord(shot.editContinuity);
    if (lighting || color) lines.push(labeledCinematicLine("灯光与色彩", [lighting, color].filter(Boolean).join("；")));
    if (physicsVfx) lines.push(labeledCinematicLine("物理与VFX", physicsVfx));
    if (sound) lines.push(labeledCinematicLine("声音", sound));
    if (edit) lines.push(labeledCinematicLine("剪辑连续性", edit));
  }
  return lines;
}

function renderEndHandoff(shots, unit) {
  const lastShot = shots.at(-1) ?? {};
  const boundary = unit.continuityBoundary && typeof unit.continuityBoundary === "object" ? unit.continuityBoundary : {};
  const exit = lastShot.continuityPlan?.exit;
  const structuredExit = exit?.subjects?.length
    ? exit.subjects.map((subject) => `${subject.displayName}@${subject.zoneLabel}·${cleanCinematicList(subject.stateTags).join("、") || "状态保持"}`).join("；")
    : "";
  return [labeledCinematicLine("最终画面状态", structuredExit || lastShot.endingState), labeledCinematicLine("剪辑出口", lastShot.editContinuity?.exit), labeledCinematicLine("下段交接", boundary.exit)];
}
