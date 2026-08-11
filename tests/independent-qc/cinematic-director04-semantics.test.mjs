import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { assessCinematicShotFormation } from "@ununu/unutv-core";

const packagePath = fileURLToPath(new URL(
  "../../../../无名公寓测试版2/source/EP01-authoring-package-v2-draft.json",
  import.meta.url
));
const packageDraft = JSON.parse(readFileSync(packagePath, "utf8"));
const fieldIds = [
  "focal_length",
  "aperture",
  "focus_and_depth",
  "camera_position",
  "composition",
  "camera_behavior",
  "visible_performance",
  "exact_dialogue_and_tone",
  "motivated_lighting",
  "bidirectional_constraints",
  "next_state_handoff"
];
const placeholders = /^(?:auto|automatic|default|n\/a|none|same|tbd|todo|自动|默认|待定|同上)$/iu;
const internalCut = /(?:硬切|软切|瞬切|跳切|切镜|切到|切至|切回|反打|正反打|组接|匹配切|遮挡切|隐藏切|隐形切|无缝切|多机位|双机位|两机位|三机位|\bhard\s*cut\b|\bjump\s*cut\b|\bcut(?:s|ting)?\s+to\b|\breverse\s+(?:angle|shot)\b|\bshot\s*[-/]?\s*reverse\s*[-/]?\s*shot\b|\b(?:multi|two|three)[-\s]*camera\b|\b(?:pov|subjective)\s*(?:to|->|→)\s*(?:objective|master)\b|\b(?:objective|master)\s*(?:to|->|→)\s*(?:pov|subjective)\b)/iu;
const negatedCut = /(?:不|不得|不要|没有|无|without|no)\s*(?:使用|采用|use|using)?\s*(?:任何)?\s*(?:硬切|软切|瞬切|跳切|切镜|匹配切|隐藏切|隐形切|cut(?:s|ting)?)/giu;

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function meaningful(value) {
  return Boolean(text(value)) && !placeholders.test(text(value));
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function clone(value) {
  return structuredClone(value);
}

function dialogueSemantics(payload) {
  const dialogue = list(payload.dialogue);
  const cues = list(payload.sound?.voiceCues);
  if (!dialogue.length) return cues.length === 0;
  if (dialogue.length !== cues.length) return false;
  return dialogue.every((line, index) => {
    const cue = cues[index] ?? {};
    const basic = [
      line.speakerId,
      line.speakerType,
      line.speaker,
      line.text,
      line.intent,
      line.tone,
      cue.performance,
      cue.sync
    ].every(meaningful)
      && cue.speakerId === line.speakerId
      && cue.speakerType === line.speakerType
      && cue.text === line.text
      && Number.isFinite(Number(cue.startSeconds))
      && Number.isFinite(Number(cue.endSeconds))
      && Number(cue.startSeconds) >= 0
      && Number(cue.endSeconds) > Number(cue.startSeconds)
      && Number(cue.endSeconds) <= Number(payload.durationSeconds)
      && typeof cue.voiceAuthorityRequired === "boolean";
    if (!basic) return false;
    if (line.speakerType === "character") {
      return cue.voiceAuthorityRequired === true;
    }
    if (line.speakerType === "offscreen_once") {
      return line.isResident === false
        && cue.isResident === false
        && cue.voiceAuthorityRequired === false
        && /(?:画外|offscreen|无口型|电话)/iu.test(cue.sync);
    }
    return true;
  });
}

function temporalPerformance(payload) {
  const performance = payload.performance ?? {};
  const beats = list(performance.temporalBeats);
  if (![
    performance.visibleEvidence,
    performance.turningPoint,
    performance.endState
  ].every(meaningful)) return false;
  if (!list(performance.forbiddenActing).length
    || !list(performance.forbiddenActing).every(meaningful)
    || !beats.length) return false;
  let cursor = 0;
  return beats.every((beat) => {
    const start = Number(beat.startSeconds);
    const end = Number(beat.endSeconds);
    const valid = Number.isFinite(start)
      && Number.isFinite(end)
      && start >= cursor
      && end > start
      && end <= Number(payload.durationSeconds)
      && meaningful(beat.internalState)
      && meaningful(beat.visibleEvidence);
    cursor = end;
    return valid;
  });
}

function independentDirector04Oracle(payload) {
  const camera = payload.cinematography ?? {};
  const blocking = payload.blocking ?? {};
  const lighting = payload.lighting ?? {};
  const constraints = payload.constraints ?? {};
  const edit = payload.editContinuity ?? {};
  const cameraText = [
    camera.shotSize,
    camera.focalLength,
    camera.cameraPlacement,
    camera.cameraPosition,
    camera.angle,
    camera.perspective,
    camera.composition,
    camera.focusPlan,
    camera.focus,
    camera.movementPath,
    camera.speedCurve,
    camera.startPoint,
    camera.stopPoint
  ].map(text).join("\n");
  return {
    focal_length: /^(?:[1-9]\d{0,2}(?:\.\d+)?)mm$/u.test(text(camera.focalLength)),
    aperture: /^f\/(?:0\.[1-9]\d*|[1-9]\d*(?:\.\d+)?)$/u.test(text(camera.aperture)),
    focus_and_depth: [
      camera.focusPlan,
      camera.focus,
      camera.depthOfField
    ].every(meaningful),
    camera_position: [
      camera.cameraPlacement,
      camera.cameraPosition,
      camera.angle,
      camera.startPoint,
      camera.stopPoint,
      blocking.positions,
      blocking.axis,
      blocking.contacts,
      blocking.paths
    ].every(meaningful)
      && list(blocking.actors).length > 0
      && list(blocking.props).length > 0,
    composition: [
      camera.shotSize,
      camera.perspective,
      camera.composition
    ].every(meaningful),
    camera_behavior: [camera.movementPath, camera.speedCurve].every(meaningful)
      && !internalCut.test(cameraText.replace(negatedCut, "")),
    visible_performance: temporalPerformance(payload),
    exact_dialogue_and_tone: dialogueSemantics(payload),
    motivated_lighting: [
      lighting.source,
      lighting.direction,
      lighting.contrast,
      lighting.motivatedChange
    ].every(meaningful),
    bidirectional_constraints: ["preserve", "forbid", "physics"].every(
      (key) => list(constraints[key]).length > 0 && list(constraints[key]).every(meaningful)
    ),
    next_state_handoff: [
      payload.openingState,
      payload.endingState,
      payload.nextHandoff,
      edit.entrance,
      edit.exit,
      edit.axis,
      edit.screenDirection,
      edit.cutIntent
    ].every(meaningful)
  };
}

function assess(payload) {
  return assessCinematicShotFormation({
    rows: [{ id: "independent-row", orderIndex: 1, payload }],
    targetDurationSeconds: payload.durationSeconds
  });
}

test("old non-empty six-field camera false positives are rejected", () => {
  const payload = clone(packageDraft.scriptRows[0].payload);
  payload.cinematography = {
    ...payload.cinematography,
    shotSize: "手机特写组接人物大全景",
    focalLength: "35mm / 85mm",
    cameraPlacement: "先在手机上方，随后切回入口另一侧",
    cameraPosition: "two-camera positions on both sides of the axis",
    movementPath: "dolly in, hard cut to reverse shot, then hold"
  };
  const oracle = independentDirector04Oracle(payload);
  assert.equal(oracle.focal_length, false);
  assert.equal(oracle.camera_behavior, false);
  const result = assess(payload);
  assert.equal(result.ok, false);
  assert.equal(
    result.errors[0].director04FieldIssues.focal_length.includes(
      "single_exact_focal_length_required"
    ),
    true
  );
  assert.equal(
    result.errors[0].director04FieldIssues.camera_behavior.includes(
      "single_continuous_camera_path_required"
    ),
    true
  );
});

test("fixed and continuously moving single-camera rows remain legal", () => {
  for (const movementPath of [
    "全程固定在唯一机位，动作完成后继续保持稳定落幅",
    "沿同一轨道连续推近0.6米并向右摇镜15度，随后同轨缓停，全程不中断",
    "single continuous dolly-in and pan right on one axis, then hold without cuts"
  ]) {
    const payload = clone(packageDraft.scriptRows[0].payload);
    payload.cinematography.movementPath = movementPath;
    const oracle = independentDirector04Oracle(payload);
    assert.equal(oracle.camera_behavior, true, movementPath);
    assert.equal(assess(payload).ok, true, movementPath);
  }
});

test("offscreen_once stays line-scoped and does not inherit resident character semantics", () => {
  const shot = packageDraft.scriptRows.find((entry) => (
    entry.payload.dialogue?.some((line) => line.speakerType === "offscreen_once")
  ));
  assert.equal(shot.shotNumber, 7);
  const offscreen = shot.payload.dialogue.find((line) => line.speakerType === "offscreen_once");
  const offscreenCue = shot.payload.sound.voiceCues.find(
    (cue) => cue.speakerId === offscreen.speakerId
  );
  const resident = shot.payload.dialogue.find((line) => line.speakerType === "character");
  const residentCue = shot.payload.sound.voiceCues.find(
    (cue) => cue.speakerId === resident.speakerId
  );
  assert.deepEqual(
    {
      cueIsResident: offscreenCue.isResident,
      cueVoiceAuthorityRequired: offscreenCue.voiceAuthorityRequired,
      isResident: offscreen.isResident,
      speakerType: offscreen.speakerType
    },
    {
      cueIsResident: false,
      cueVoiceAuthorityRequired: false,
      isResident: false,
      speakerType: "offscreen_once"
    }
  );
  assert.equal(residentCue.voiceAuthorityRequired, true);
  assert.equal(independentDirector04Oracle(shot.payload).exact_dialogue_and_tone, true);
  assert.equal(assess(shot.payload).ok, true);

  const misclassified = clone(shot.payload);
  misclassified.sound.voiceCues.find(
    (cue) => cue.speakerId === offscreen.speakerId
  ).voiceAuthorityRequired = true;
  assert.equal(
    independentDirector04Oracle(misclassified).exact_dialogue_and_tone,
    false,
    "the independent oracle must detect accidental resident-authority promotion"
  );

  const residentWithoutAuthority = clone(shot.payload);
  residentWithoutAuthority.sound.voiceCues.find(
    (cue) => cue.speakerId === resident.speakerId
  ).voiceAuthorityRequired = false;
  const rejected = assess(residentWithoutAuthority);
  assert.equal(rejected.ok, false);
  assert.equal(
    rejected.errors[0].director04FieldIssues.exact_dialogue_and_tone.includes(
      "dialogue_voice_cue_identity_tone_and_timing_required"
    ),
    true
  );
});

test("local EP01 keeps sixteen rows, eleven semantics per row, and the exact 120-second plan", () => {
  const expectedDurations = [5, 5, 6, 10, 4, 10, 9, 8, 13, 7, 8, 8, 9, 6, 4, 8];
  const expectedFocals = [
    "24mm",
    "40mm",
    "35mm",
    "50mm",
    "35mm",
    "32mm",
    "50mm",
    "32mm",
    "28mm",
    "40mm",
    "50mm",
    "40mm",
    "28mm",
    "50mm",
    "45mm",
    "40mm"
  ];
  assert.equal(packageDraft.scriptRows.length, 16);
  assert.deepEqual(
    packageDraft.scriptRows.map((entry) => entry.payload.durationSeconds),
    expectedDurations
  );
  assert.deepEqual(
    packageDraft.scriptRows.map((entry) => entry.payload.cinematography.focalLength),
    expectedFocals
  );
  assert.equal(expectedDurations.reduce((total, duration) => total + duration, 0), 120);
  for (const entry of packageDraft.scriptRows) {
    const semantics = independentDirector04Oracle(entry.payload);
    assert.deepEqual(
      Object.keys(semantics),
      fieldIds,
      `shot ${entry.shotNumber} must expose the complete Director04 semantic set`
    );
    assert.equal(
      Object.values(semantics).every(Boolean),
      true,
      `shot ${entry.shotNumber} independent semantic failure: ${JSON.stringify(semantics)}`
    );
  }
  const rows = packageDraft.scriptRows.map((entry, index) => ({
    id: `ep01-shot-${entry.shotNumber}`,
    orderIndex: index + 1,
    payload: entry.payload
  }));
  assert.deepEqual(
    assessCinematicShotFormation({ rows, targetDurationSeconds: 120 }),
    {
      durationTotal: 120,
      errors: [],
      ok: true,
      rowCount: 16
    }
  );
});
