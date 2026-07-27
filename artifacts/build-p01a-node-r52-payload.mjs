import fs from "node:fs";

const canvasPath = process.argv[2] ?? "/tmp/p01a-canvas-current.json";
const compilationPath = process.argv[3] ?? "/tmp/p01a-compilation-r52.json";
const preflightPath = process.argv[4] ?? "/tmp/p01a-preflight-r52.json";
const canvas = JSON.parse(fs.readFileSync(canvasPath, "utf8"));
const compilation = JSON.parse(fs.readFileSync(compilationPath, "utf8"));
const preflight = JSON.parse(fs.readFileSync(preflightPath, "utf8"));
const node = canvas.nodes.find((entry) => entry.id === "node-48903af1-9ff1-4a98-8912-88a7078cd6a1");
if (!node) throw new Error("P01A node not found");
const payload = structuredClone(node.payload);
const blockers = preflight.lint.errors.map((entry) => entry.message);

Object.assign(payload, {
  generationStatus: "blocked",
  generationPhase: "preflight_blocked_by_current_visual_carrier_owner_and_professional_signoff",
  generationMessage: "P01A Shot r49 与 Unit r52 已按真实Director中点修正：2.4–4秒摄影机和三主角硬停，终点使用与中点同几何/同站位的冻结capture，yaw/pitch按真实target校准。产品现已把storyboard_composition视作逐镜图生视频状态载体，并正确阻断只覆盖Shot r46的旧验收证明。仍需Owner验收Shot r49与同一关键帧对r49的适用性、当前revision专业PASS和Owner批准TeamManifest；未调用视频Provider。",
  cinematicPromptCompilationId: compilation.compilationId,
  cinematicPromptCompilationStatus: "compiled_preflight_blocked",
  preflightStatus: "blocked",
  preflightMessage: "合同技术preflight已通过cameraTrajectory/modeControl/temporalMotion/promptCoverage；六张Provider语义参考保持，editor_only Director控制图继续排除。发布门禁明确阻断旧Shot r46关键帧验收证明、Shot r49未获Owner ACCEPT、current-revision专业会签与Owner批准TeamManifest。",
  unitRevision: 52,
  generationUnitRevision: 52,
  shotRevision: 49,
  promptCompilationId: compilation.compilationId,
  directorStageRevision: 180,
  controlGeometryId: "p01a-entry-occipital-reveal-wipe-r10-v1",
  directorCaptureIds: [
    "director-capture-15e3ea91-a237-4401-aef8-571e9f709e27",
    "director-capture-e1f3b432-6b8f-4ebd-9de0-ea48c85649f7",
    "director-capture-p01a-r10-hold-end-v1"
  ],
  directorControlMediaIds: [
    "media-996eda82-e579-46c0-9e91-5aa08b3ec5ee",
    "media-0dbc640d-7817-437a-8353-3fda67b2ba5c"
  ],
  providerExcludedDirectorControlMediaIds: [
    "media-996eda82-e579-46c0-9e91-5aa08b3ec5ee",
    "media-0dbc640d-7817-437a-8353-3fda67b2ba5c"
  ],
  semanticCarrierProofShotRevision: 46,
  semanticCarrierCurrentShotRevision: 49,
  semanticCarrierCurrentRevisionAccepted: false,
  preflightReady: false,
  preflightStale: preflight.stale,
  preflightBlockers: blockers,
  rebuildState: "Story r7仍已接受；Shot r49/Unit r52已消除任务目标、背视可见性、2.4秒后人物与机位漂移、不可见眼线、末段冲刺和错误终点capture。六张图只作语义/身份/空间参考，具体动态由分秒提示词驱动；Director粗代理仍为editor_only。当前故意停在可核验门禁，等待r49 Owner与专业审查。",
  providerCalled: false,
  paidApprovalRequired: true,
  ownerShotReviewId: null,
  ownerShotAcceptedRevision: null,
  preflight: {
    checkedAt: new Date().toISOString(),
    stale: preflight.stale,
    cameraTrajectoryOk: preflight.preflight.cameraTrajectory?.ok === true,
    temporalMotionOk: preflight.preflight.temporalMotion?.ok === true,
    modeControlOk: preflight.preflight.modeControl?.ok === true,
    promptCoverageOk: preflight.preflight.promptCoverage?.ok === true,
    blockedBy: blockers,
    ownerShotAccepted: false,
    ownerShotReviewId: null,
    providerReferenceCount: compilation.envelope.referenceBindings.length,
    editorOnlyDirectorControlsExcluded: compilation.envelope.referenceBindings.every((entry) => entry.role !== "director_stage_blocking"),
    firstFrameMediaId: compilation.envelope.generationParameters.firstFrameMediaId,
    lastFrameMediaId: compilation.envelope.generationParameters.lastFrameMediaId,
    semanticCarrierProofShotRevision: 46,
    semanticCarrierCurrentShotRevision: 49
  }
});

process.stdout.write(JSON.stringify(payload));
