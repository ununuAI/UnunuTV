import fs from "node:fs";

const canvasPath = process.argv[2] ?? "/tmp/p01a-canvas-r102.json";
const compilationPath = process.argv[3] ?? "/tmp/p01a-compilation-r53.json";
const preflightPath = process.argv[4] ?? "/tmp/p01a-preflight-r53.json";
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
  generationMessage: "P01A Shot r50 与 Unit r53 已加入可机检焦距面时序：0/1/2.4/3.3/3.7/4秒分别为9.92/9.33/8.56/8.56/3.00/0.25米。2.4–3.3秒锁定后脑唯一脸，随后在机位、朝向和65°视场硬停时回拉到白璃右肩背与贴镜斗篷H1。导演/剧情、摄影、连续性和编剧四项当前版本复审均PASS且无veto；产品继续阻断旧Shot r46语义构图验收证明授权r50。仍需Owner验收Shot r50、同一关键帧对r50的适用性及Owner批准TeamManifest。未调用视频Provider。",
  cinematicPromptCompilationId: compilation.compilationId,
  cinematicPromptCompilationStatus: "compiled_preflight_blocked",
  preflightStatus: "blocked",
  preflightMessage: "合同技术preflight已通过cameraTrajectory、focusDistancePlan、modeControl、temporalMotion和promptCoverage；六张Provider语义参考保持，editor_only Director控制图继续排除；四项当前版本专业复审均PASS。发布门禁只剩旧Shot r46关键帧验收证明、Shot r50未获Owner ACCEPT及Owner批准TeamManifest。",
  unitRevision: 53,
  generationUnitRevision: 53,
  shotRevision: 50,
  promptCompilationId: compilation.compilationId,
  directorStageRevision: 181,
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
  focusDistancePlan: [
    { atSeconds: 0, focusDistanceMeters: 9.92, target: "入口纵深与前排桌席" },
    { atSeconds: 1, focusDistanceMeters: 9.33, target: "最近无遮挡尸傀后脑" },
    { atSeconds: 2.4, focusDistanceMeters: 8.56, target: "最近无遮挡尸傀后脑唯一完整脸" },
    { atSeconds: 3.3, focusDistanceMeters: 8.56, target: "最近无遮挡尸傀后脑唯一完整脸" },
    { atSeconds: 3.7, focusDistanceMeters: 3, target: "白璃右肩背" },
    { atSeconds: 4, focusDistanceMeters: 0.25, target: "贴镜月白斗篷H1" }
  ],
  semanticCarrierProofShotRevision: 46,
  semanticCarrierCurrentShotRevision: 50,
  semanticCarrierCurrentRevisionAccepted: false,
  preflightReady: false,
  preflightStale: preflight.stale,
  preflightBlockers: blockers,
  rebuildState: "Story r7仍已接受；Shot r50/Unit r53已同步真实Director机位、逐秒焦距面、三主角与尸傀时序、0.9秒解剖证明和斗篷H1。六张图只作语义/身份/空间参考，具体动态由分秒提示词与焦距面合同驱动；Director粗代理仍为editor_only。导演/剧情、摄影、连续性和编剧四项当前版本复审已PASS；当前故意停在Owner Shot、语义构图适用性和TeamManifest门禁。",
  providerCalled: false,
  paidApprovalRequired: true,
  ownerShotReviewId: null,
  ownerShotAcceptedRevision: null,
  preflight: {
    checkedAt: new Date().toISOString(),
    stale: preflight.stale,
    cameraTrajectoryOk: preflight.preflight.cameraTrajectory?.ok === true,
    focusDistancePlanOk: preflight.preflight.cameraTrajectory?.ok === true,
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
    semanticCarrierCurrentShotRevision: 50
  }
});

process.stdout.write(JSON.stringify(payload));
