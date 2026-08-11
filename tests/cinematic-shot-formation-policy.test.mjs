import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { assessCinematicShotFormation } from "@ununu/unutv-core";

function row(id, durationSeconds, patch = {}) {
  const payload = {
    sceneId: "scene-entry",
    beatId: `beat-${id}`,
    narrativeJob: "用可见行动推进当前节拍",
    shotBoundaryReason: "动作完成点改变注意主体",
    durationSeconds,
    openingState: "人物位于入口，动作尚未完成",
    endingState: "人物完成本段动作并形成下一反应",
    nextHandoff: "保持人物朝向、道具位置、光向和摄影机屏幕方向",
    blocking: {
      positions: "人物位于入口东侧，木箱位于门槛中央",
      actors: ["人物沿入口到客厅的路径移动"],
      props: ["单实例木箱"],
      axis: "摄影机保持在入口主轴东侧",
      contacts: "人物双手持续接触木箱底部",
      paths: "人物向南移动1.2米，木箱沿同一路径移动"
    },
    cinematography: {
      shotSize: "人物与木箱中广景",
      focalLength: "35mm",
      aperture: "f/4",
      cameraPlacement: "入口内侧距门轴1.5米、胸口高度",
      cameraPosition: "入口主轴东侧单一轨道",
      angle: "眼平",
      perspective: "自然中广角透视",
      composition: "木箱居下三分之一，人物分布在中央安全区",
      depthOfField: "中等景深，人物与木箱接触点同时可读",
      focusPlan: "0–2秒锁木箱裂缝，2–6秒拉焦到等待人群",
      focus: "木箱裂缝→等待人群",
      movementPath: "0–2秒固定；2–6秒沿单一轨道连续向右横移1.2米；结束前停稳",
      speedCurve: "固定—缓入—匀速—缓停",
      startPoint: "入口内侧东侧胸口高度",
      stopPoint: "同一轨道向右1.2米处",
      narrativePurpose: "让动作完成点和下一注意主体同时可见"
    },
    lighting: {
      source: "北侧门外散射光与室内顶灯",
      direction: "门外冷光从人物侧前方进入",
      contrast: "中等反差，手部和面部均可读",
      motivatedChange: "人物进入室内后由顶灯自然增加面部亮度"
    },
    performance: {
      temporalBeats: [{
        startSeconds: 0,
        endSeconds: durationSeconds,
        internalState: "人物从犹豫转为执行当前动作",
        visibleEvidence: "视线、呼吸、手部与重心变化可见"
      }],
      visibleEvidence: "视线、呼吸、手部与重心变化可见",
      turningPoint: "人物完成动作并把注意交给下一主体",
      endState: "人物在落幅保持可接续姿态",
      forbiddenActing: ["夸张表情", "无动机瞬移"]
    },
    constraints: {
      preserve: ["身份", "空间拓扑"],
      forbid: ["额外人物", "道具复制"],
      physics: ["木箱接触和重量连续"]
    },
    dialogue: [],
    sound: { voiceCues: [] },
    editContinuity: {
      entrance: "从前镜稳定落幅进入",
      exit: "动作完成后保留稳定尾帧",
      axis: "入口主轴东侧",
      screenDirection: "人物由北向南",
      cutIntent: "只在本row结束后按动作完成点切下一镜"
    }
  };
  return {
    id,
    orderIndex: Number(id.replace(/\D/gu, "")),
    payload: {
      ...payload,
      ...patch,
      blocking: { ...payload.blocking, ...patch.blocking },
      cinematography: { ...payload.cinematography, ...patch.cinematography },
      lighting: { ...payload.lighting, ...patch.lighting },
      performance: { ...payload.performance, ...patch.performance },
      constraints: { ...payload.constraints, ...patch.constraints },
      sound: { ...payload.sound, ...patch.sound },
      editContinuity: { ...payload.editContinuity, ...patch.editContinuity }
    }
  };
}

function assessOne(mutator) {
  const candidate = row("row-1", 8);
  mutator(candidate.payload);
  return assessCinematicShotFormation({ rows: [candidate], targetDurationSeconds: 8 });
}

function directorFieldIssue(result, fieldId, issue) {
  return result.errors[0]?.director04FieldIssues?.[fieldId]?.includes(issue) === true;
}

test("shot formation refuses prose rows and implicit camera defaults", () => {
  const result = assessCinematicShotFormation({
    rows: [{ id: "row-1", orderIndex: 1, payload: { sceneNumber: 1, action: "八个人搬箱子", durationSeconds: 12 } }],
    targetDurationSeconds: 12
  });
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].issues.includes("shot_boundary_reason_required"), true);
  assert.equal(result.errors[0].issues.includes("director04_11_field_contract_incomplete"), true);
  assert.deepEqual(result.errors[0].invalidDirector04FieldIds, [
    "focal_length",
    "aperture",
    "focus_and_depth",
    "camera_position",
    "composition",
    "camera_behavior",
    "visible_performance",
    "motivated_lighting",
    "bidirectional_constraints",
    "next_state_handoff"
  ]);
});

test("shot formation accepts varied, executable 4–15 second segments", () => {
  const result = assessCinematicShotFormation({
    rows: [row("row-1", 8), row("row-2", 5), row("row-3", 7)],
    targetDurationSeconds: 20
  });
  assert.deepEqual(result, { durationTotal: 20, errors: [], ok: true, rowCount: 3 });
});

test("Director04 eleven semantic fields reject incomplete structures rather than only empty top-level objects", async (t) => {
  const cases = [
    ["focal_length", "single_exact_focal_length_required", (payload) => { payload.cinematography.focalLength = "auto"; }],
    ["aperture", "exact_aperture_required", (payload) => { payload.cinematography.aperture = "default"; }],
    ["focus_and_depth", "focus_plan_focus_and_depth_of_field_required", (payload) => { payload.cinematography.depthOfField = ""; }],
    ["camera_position", "camera_placement_position_angle_start_stop_required", (payload) => { payload.cinematography.stopPoint = "TBD"; }],
    ["composition", "shot_size_perspective_and_composition_required", (payload) => { payload.cinematography.perspective = ""; }],
    ["camera_behavior", "movement_path_and_speed_curve_required", (payload) => { payload.cinematography.speedCurve = "自动"; }],
    ["visible_performance", "timed_visible_performance_semantics_required", (payload) => { payload.performance.temporalBeats = []; }],
    ["exact_dialogue_and_tone", "dialogue_voice_cue_identity_tone_and_timing_required", (payload) => {
      payload.dialogue = [{
        speakerId: "character-xu-lan",
        speakerType: "character",
        speaker: "许岚",
        text: "先走。",
        intent: "推进动作",
        tone: ""
      }];
    }],
    ["motivated_lighting", "source_direction_contrast_and_motivated_change_required", (payload) => { payload.lighting.motivatedChange = "默认"; }],
    ["bidirectional_constraints", "preserve_forbid_and_physics_constraints_required", (payload) => { payload.constraints.physics = []; }],
    ["next_state_handoff", "opening_ending_handoff_and_boundary_semantics_required", (payload) => { payload.editContinuity.cutIntent = "TBD"; }]
  ];
  for (const [fieldId, issue, mutate] of cases) {
    await t.test(fieldId, () => {
      const result = assessOne(mutate);
      assert.equal(result.ok, false);
      assert.equal(result.errors[0].issues.includes("director04_11_field_contract_incomplete"), true);
      assert.equal(directorFieldIssue(result, fieldId, issue), true);
    });
  }
});

test("focalLength accepts one exact lens and rejects ranges, transitions, spacing, and multiple values in Chinese and English", async (t) => {
  for (const valid of ["24mm", "35mm", "50mm", "85mm", "100.5mm"]) {
    await t.test(`accept ${valid}`, () => {
      const result = assessOne((payload) => { payload.cinematography.focalLength = valid; });
      assert.equal(result.ok, true);
    });
  }
  for (const invalid of [
    "35mm转50mm",
    "35mm至50mm",
    "35-50mm",
    "35–50mm",
    "35mm/50mm",
    "35mm、50mm",
    "35mm, 50mm",
    "35mm to 50mm",
    "35mm → 50mm",
    "35 mm",
    "zoom 35mm"
  ]) {
    await t.test(`reject ${invalid}`, () => {
      const result = assessOne((payload) => { payload.cinematography.focalLength = invalid; });
      assert.equal(result.ok, false);
      assert.equal(directorFieldIssue(result, "focal_length", "single_exact_focal_length_required"), true);
    });
  }
});

test("a row rejects internal cuts, reverses, POV/objective switches, assemblies, and multi-camera semantics in Chinese and English", async (t) => {
  const cases = [
    ["cameraPlacement", "夏梨手机主观后切至二人南侧1.2米、眼平"],
    ["cameraPosition", "两机位均位于主轴南侧"],
    ["shotSize", "中景组接到箱底近景"],
    ["movementPath", "先固定，动作停住时硬切大全景"],
    ["movementPath", "借纸箱遮挡完成匹配切，再停在许岚视线"],
    ["angle", "正反打覆盖两人对话"],
    ["movementPath", "POV to objective after the hand covers lens"],
    ["movementPath", "hard cut to reverse angle"],
    ["cameraPosition", "multi-camera setup on both sides of the axis"],
    ["cameraPosition", "A机位拍正面，B机位拍侧面"],
    ["cameraPosition", "camera A covers the face, camera B covers the doorway"],
    ["movementPath", "hidden cut behind the actor, then continue"],
    ["movementPath", "jump cut to the doorway"]
  ];
  for (const [field, value] of cases) {
    await t.test(`${field}: ${value}`, () => {
      const result = assessOne((payload) => { payload.cinematography[field] = value; });
      assert.equal(result.ok, false);
      assert.equal(directorFieldIssue(result, "camera_behavior", "single_continuous_camera_path_required"), true);
    });
  }
});

test("one continuous path permits fixed shots and continuous push, pull, pan, track, tilt, and arcs without treating negated cut language as a cut", async (t) => {
  for (const movementPath of [
    "全程固定，人物完成动作后保留稳定尾帧",
    "0–2秒固定；2–6秒连续推近0.8米并向右弧移；结束前停稳，全程不中断",
    "沿同一轨道拉远0.5米、向左摇镜并轻微升高，动作间不硬切、不分屏",
    "continuous dolly-in, pan right, arc to the endpoint, then hold without cuts"
  ]) {
    await t.test(movementPath, () => {
      const result = assessOne((payload) => { payload.cinematography.movementPath = movementPath; });
      assert.equal(result.ok, true);
    });
  }
});

test("camera behavior rejects a non-empty sentence that does not define a fixed or moving camera route", () => {
  const result = assessOne((payload) => {
    payload.cinematography.movementPath = "画面很有电影感，人物自然完成动作";
  });
  assert.equal(result.ok, false);
  assert.equal(directorFieldIssue(result, "camera_behavior", "executable_single_camera_route_required"), true);
});

test("the former internal-cut false positive now fails even though all old six camera fields are non-empty", () => {
  const result = assessOne((payload) => {
    payload.cinematography = {
      ...payload.cinematography,
      shotSize: "箱底特写到八人大全景",
      focalLength: "85mm切28mm",
      cameraPlacement: "箱底低位，随后切入口南侧胸口高度",
      cameraPosition: "两机位均在主轴南侧",
      movementPath: "特写固定；动作停住时硬切大全景并固定"
    };
  });
  assert.equal(result.ok, false);
  assert.equal(directorFieldIssue(result, "focal_length", "single_exact_focal_length_required"), true);
  assert.equal(directorFieldIssue(result, "camera_behavior", "single_continuous_camera_path_required"), true);
});

test("shot formation rejects mechanical equal durations and impossible dialogue density", () => {
  const denseText = "这一句台词被故意写得远远超过五秒所能自然完成的字数而且没有任何拆分";
  const denseDialogue = [{
    speakerId: "character-xu-lan",
    speakerType: "character",
    speaker: "许岚",
    text: denseText,
    intent: "测试对白密度",
    tone: "快速但仍需清楚"
  }];
  const denseVoiceCues = [{
    speakerId: "character-xu-lan",
    speakerType: "character",
    text: denseText,
    startSeconds: 0,
    endSeconds: 5,
    performance: "快速但仍需清楚",
    sync: "正面口型",
    voiceAuthorityRequired: true
  }];
  const result = assessCinematicShotFormation({
    rows: [
      row("row-1", 5),
      row("row-2", 5, { dialogue: denseDialogue, sound: { voiceCues: denseVoiceCues } }),
      row("row-3", 5)
    ],
    targetDurationSeconds: 15
  });
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((entry) => entry.code === "mechanical_equal_duration_pattern"), true);
  assert.equal(result.errors.some((entry) => entry.issues?.includes("dialogue_density_over_6_chars_per_second")), true);
});

const localEp01PackagePath = fileURLToPath(new URL(
  "../../../无名公寓测试版2/source/EP01-authoring-package-v2-draft.json",
  import.meta.url
));

test("the local EP01 sixteen-shot V2 formation satisfies the hard Director04 contract", {
  skip: !existsSync(localEp01PackagePath)
}, () => {
  const packageDraft = JSON.parse(readFileSync(localEp01PackagePath, "utf8"));
  const rows = packageDraft.scriptRows.map((entry, index) => ({
    id: `ep01-shot-${entry.shotNumber}`,
    orderIndex: index + 1,
    payload: entry.payload
  }));
  assert.deepEqual(assessCinematicShotFormation({
    rows,
    targetDurationSeconds: 120
  }), {
    durationTotal: 120,
    errors: [],
    ok: true,
    rowCount: 16
  });
});
