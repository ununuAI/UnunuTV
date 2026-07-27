import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateCinematicGenerationControl,
  validateGenerationControlIntent,
  validateReferenceSemanticControl
} from "../packages/contracts/src/index.mjs";

function intent(overrides = {}) {
  return {
    primaryConsistency: "balanced",
    cameraFreedom: "limited",
    motionComplexity: "medium",
    modeRationale: "语义参考锁定人物与站位，文字动态合同负责动作和摄影机。",
    invariants: ["人物身份不变", "桌席空间拓扑不变"],
    permittedChanges: ["参考图中的现代桌替换为古代桌"],
    dynamicControl: {
      source: "text_motion_contract",
      subjectTrajectories: "尸傀身体留在桌前，后脑人脸转向入口。",
      actionPhases: "静止、察觉、转向、凝视。",
      timing: "先静止一拍，再依次转向，末段保持。",
      cameraTrajectory: "入口低机位缓慢推进，速度平滑，无突然环绕。",
      physicsContinuity: "脚底与座位接触稳定，转头不牵引身体漂移。",
      endState: "主角仍在入口前景，酒客身体仍朝桌案。"
    },
    ...overrides
  };
}

function unit(mode, overrides = {}) {
  return {
    generationParameters: {
      mode,
      firstFrameMediaId: mode.includes("first") ? "media-frame" : undefined,
      lastFrameMediaId: mode === "first_last_frame" ? "media-last" : undefined
    },
    executionGates: { requireGenerationControlIntent: true, requireReferenceSemanticControl: true },
    controlIntent: intent(),
    ...overrides
  };
}

function binding(overrides = {}) {
  return {
    mediaId: "media-reference",
    displayName: "入口构图参考",
    semanticControl: {
      temporalRole: "static_state",
      preserve: ["人物身份", "人物与桌席初始站位"],
      replace: [{ observed: "现代桌", target: "古代客栈木桌" }],
      complete: [{ missing: "被前景挡住的厅堂区域", target: "补出更多坐在桌前的尸傀" }],
      ignore: ["参考图中的现代器物"],
      styleOnly: [],
      ...overrides
    }
  };
}

test("a semantic image reference can preserve, replace, complete, and ignore different facts", () => {
  const validation = validateReferenceSemanticControl(binding().semanticControl);
  assert.equal(validation.ok, true, JSON.stringify(validation.issues));
  const audit = evaluateCinematicGenerationControl({ generationUnit: unit("image_reference"), referenceBindings: [binding()] });
  assert.equal(audit.ok, true, JSON.stringify(audit.errors));
  assert.deepEqual(audit.referenceSemantics, { preserve: 2, replace: 1, complete: 1, ignore: 1, styleOnly: 0 });
});

test("a static reference cannot replace its own visible pixels when it is the exact first frame", () => {
  const frame = binding({ temporalRole: "initial_state" });
  frame.mediaId = "media-frame";
  const audit = evaluateCinematicGenerationControl({ generationUnit: unit("first_frame"), referenceBindings: [frame] });
  assert.equal(audit.ok, false);
  assert.equal(audit.errors.some((entry) => entry.code === "frame_pixel_override_conflict"), true);
});

test("a continuation first frame anchors only t0 and the dynamic contract controls everything after it", () => {
  const frame = binding({ temporalRole: "continuity_state", replace: [], complete: [], ignore: [] });
  frame.mediaId = "media-frame";
  const generationUnit = unit("first_frame", { visualAnchorPolicy: "PREVIOUS_ACCEPTED_TAIL" });
  const audit = evaluateCinematicGenerationControl({ generationUnit, referenceBindings: [frame] });
  assert.equal(audit.ok, true, JSON.stringify(audit.errors));
  assert.deepEqual(audit.frameAnchorPolicy, { firstFrameScope: "t0_boundary_only", lastFrameScope: null, postAnchorEvolution: "dynamic_contract" });
  frame.semanticControl.temporalRole = "static_state";
  const blocked = evaluateCinematicGenerationControl({ generationUnit, referenceBindings: [frame] });
  assert.equal(blocked.errors.some((entry) => entry.code === "first_frame_temporal_role_conflict"), true);
});

test("high motion plus expansive camera requires a declared release from hard frame anchoring", () => {
  const frame = binding({ replace: [], ignore: [] });
  frame.mediaId = "media-frame";
  const generationUnit = unit("first_frame", { controlIntent: intent({ motionComplexity: "high", cameraFreedom: "expansive" }) });
  const blocked = evaluateCinematicGenerationControl({ generationUnit, referenceBindings: [frame] });
  assert.equal(blocked.errors.some((entry) => entry.code === "hard_frame_anchor_motion_conflict"), true);
  const released = evaluateCinematicGenerationControl({
    generationUnit: {
      ...generationUnit,
      controlIntent: intent({
        motionComplexity: "high",
        cameraFreedom: "expansive",
        constraintRelease: { mechanism: "前景遮挡划过后释放构图与景别", releases: ["构图", "景别"], preserves: ["人物身份", "空间轴线"] }
      })
    },
    referenceBindings: [frame]
  });
  assert.equal(released.errors.some((entry) => entry.code === "hard_frame_anchor_motion_conflict"), false);
});

test("pure text mode cannot promise exact external identity or cross-shot entry continuity", () => {
  const audit = evaluateCinematicGenerationControl({
    generationUnit: unit("text_to_video", { controlIntent: intent({ primaryConsistency: "cross_shot_continuity" }) }),
    referenceBindings: []
  });
  assert.equal(audit.errors.some((entry) => entry.code === "text_mode_external_consistency_conflict"), true);
});

test("the dynamic contract is required because a still image does not encode temporal evolution", () => {
  const invalid = intent({ dynamicControl: { source: "text_motion_contract", subjectTrajectories: "" } });
  const validation = validateGenerationControlIntent(invalid);
  assert.equal(validation.ok, false);
  assert.equal(validation.issues.some((entry) => entry.path === "dynamicControl.subjectTrajectories"), true);
  assert.equal(validation.issues.some((entry) => entry.path === "dynamicControl.cameraTrajectory"), true);
});

test("production gate blocks a unit that has no generation control intent", () => {
  const generationUnit = unit("text_to_video");
  delete generationUnit.controlIntent;
  const audit = evaluateCinematicGenerationControl({ generationUnit, referenceBindings: [] });
  assert.equal(audit.errors.some((entry) => entry.code === "generation_control_intent_required"), true);
});
