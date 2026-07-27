import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createUnuTvServer } from "@ununu/unutv-api";
import { CINEMATIC_SHOT_REVISION_REVIEW_TYPE, CINEMATIC_STORY_REVISION_REVIEW_TYPE, cinematicRevisionReviewTargetId } from "@ununu/unutv-contracts";
import { cinematicPerformance } from "./fixtures/cinematic-performance.mjs";

const productionPromptCoverage = {
  subjectCountRoles: "一个角色和一个镜头后的来人，不新增人物", coordinateFrame: "校门到入口为纵深轴，角色留在轴线左侧",
  topologyAttachments: "人物身体、服装和随身物均保持正常连接", geometryScale: "人物、校门和雨伞比例稳定",
  spatialBlocking: "角色留在校门前原位，来人从入口方向接近", poseGazeHandsProps: "角色先背对入口，停顿后转身，双手自然",
  surfaceMaterialWardrobe: "深色湿外套与雨夜路面材质连续", visibilityOcclusionCompletion: "人物全程可见，不以雨幕遮挡动作",
  cameraFramingLensFocus: "中景构图与焦点变化可读", lightingColorExposure: "路灯侧逆光和雨夜冷蓝曝光稳定",
  initialState: "人物背对入口等待", continuityInvariants: "人物身份、校门轴线、雨向和湿润状态不变",
  subjectTrajectories: "人物原地转身，来人从入口方向接近", actionPhases: "等待、脚步、停顿、转身、确认",
  timingSpeed: "脚步先出现，停顿一次后匀速转身", cameraTrajectory: "摄影机固定，不发生位移或旋转",
  contactForcesPhysics: "雨水、衣物和脚底接触连续", performanceDialogueAudio: "警觉转为释然，雨声和对白清楚",
  endStateHandoff: "人物看向入口并确认来人", cutSeamStrategy: "单镜头内部不切镜，以目光确认结束",
  escapeRoutes: ["用雨幕隐藏转身时机", "新增无关人物"], counterexampleClosures: []
};

function apiSequenceState() {
  return {
    sceneId: "scene-rain-gate", sequenceIndex: 1, relation: "sequence_first", feltIntent: "雨夜重逢前的克制等待",
    intentCarriers: { camera: "摄影机沿校门轴线执行本镜运动", lighting: "路灯侧逆光保持冷蓝雨夜", performance: "人物按因果节拍确认来人", sound: "雨声连续且脚步先行" },
    alreadyHappened: [], thisUnitOnly: ["本生成单元完成当前分镜事件"], reservedForLater: [],
    plannedStartState: { blocking: "人物位于校门轴线" }, plannedEndState: { blocking: "人物完成当前分镜并停稳" },
    extensionDepth: 0, maxExtensionDepth: 3, reanchorPolicy: { scheduled: false, authorityIds: [], reason: "达到配置深度或出现漂移时从已接受角色与场景权威重锚" }
  };
}

test("HTTP API creates and reopens a canvas", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "ununu-unutv-api-"));
  const service = createUnuTvServer({ dataRoot });
  context.after(() => service.close());
  const address = await service.listen(0);
  const base = `http://127.0.0.1:${address.port}`;

  const health = await fetch(`${base}/api/health`).then((response) => response.json());
  assert.equal(health.product, "ununu-unutv");
  const publicStatus = await new Promise((resolve, reject) => {
    const request = http.get({ hostname: "127.0.0.1", port: address.port, path: "/api/health", headers: { host: "random.trycloudflare.com" } }, (response) => {
      response.resume();
      response.on("end", () => resolve(response.statusCode));
    });
    request.on("error", reject);
  });
  assert.equal(publicStatus, 403);
  const created = await fetch(`${base}/api/projects`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "API Project" })
  }).then((response) => response.json());
  const renamed = await fetch(`${base}/api/projects/${created.project.id}`, {
    method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "API Project Renamed" })
  }).then((response) => response.json());
  assert.equal(renamed.title, "API Project Renamed");
  assert.equal((await fetch(`${base}/api/projects/${created.project.id}`).then((response) => response.json())).title, "API Project Renamed");
  assert.equal((await fetch(`${base}/api/projects`).then((response) => response.json())).projects[0].title, "API Project Renamed");
  const secondCanvasResponse = await fetch(`${base}/api/projects/${created.project.id}/canvases`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "不应创建的第二画布" })
  });
  assert.equal(secondCanvasResponse.status, 409);
  assert.equal((await secondCanvasResponse.json()).error.code, "single_canvas_project");
  const node = await fetch(`${base}/api/projects/${created.project.id}/canvases/${created.canvas.id}/nodes`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "video", title: "镜头 A" })
  }).then((response) => response.json());
  assert.equal(node.kind, "video");
  assert.equal(node.width, 559);
  assert.equal(node.height, 372);
  const renamedNode = await fetch(`${base}/api/projects/${created.project.id}/nodes/${node.id}`, {
    method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "镜头 A · 已改名" })
  }).then((response) => response.json());
  assert.equal(renamedNode.title, "镜头 A · 已改名");
  assert.equal((await fetch(`${base}/api/projects/${created.project.id}/canvases/${created.canvas.id}`).then((response) => response.json())).nodes[0].title, "镜头 A · 已改名");
  const group = await fetch(`${base}/api/projects/${created.project.id}/groups`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ canvasId: created.canvas.id, title: "API 组" }) }).then((response) => response.json());
  await fetch(`${base}/api/projects/${created.project.id}/groups/${group.id}/members`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ nodeId: node.id }) });
  const deletedGroup = await fetch(`${base}/api/projects/${created.project.id}/groups/${group.id}`, { method: "DELETE" }).then((response) => response.json());
  assert.equal(deletedGroup.deleted, true);
  assert.equal((await fetch(`${base}/api/projects/${created.project.id}/canvases/${created.canvas.id}`).then((response) => response.json())).nodes.length, 1);
  const deleted = await fetch(`${base}/api/projects/${created.project.id}/nodes/${node.id}`, { method: "DELETE" }).then((response) => response.json());
  assert.equal(deleted.deleted, true);
  const restored = await fetch(`${base}/api/projects/${created.project.id}/canvases/${created.canvas.id}/nodes/restore`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...node, size: { width: node.width, height: node.height } })
  }).then((response) => response.json());
  assert.equal(restored.id, node.id);
  const canvas = await fetch(`${base}/api/projects/${created.project.id}/canvases/${created.canvas.id}`).then((response) => response.json());
  assert.equal(canvas.nodes[0].title, "镜头 A");
});

test("HTTP run endpoint returns a real provider result and persists generated media", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "ununu-unutv-run-api-"));
  let received;
  const service = createUnuTvServer({
    dataRoot,
    provider: {
      async run(input) {
        received = input;
        return { status: "succeeded", artifacts: [{ kind: "image", mimeType: "image/png", bytes: Buffer.from("api-generated-image"), title: "result.png" }] };
      },
      async poll() { throw new Error("not used"); }
    }
  });
  context.after(() => service.close());
  const address = await service.listen(0);
  const base = `http://127.0.0.1:${address.port}`;
  const created = await fetch(`${base}/api/projects`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "Run API" }) }).then((response) => response.json());
  const node = await fetch(`${base}/api/projects/${created.project.id}/canvases/${created.canvas.id}/nodes`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "image", title: "演员身份板", payload: { provider: "ununu", prompt: "", imageNodeType: "actor_identity_board" } }) }).then((response) => response.json());
  const run = await fetch(`${base}/api/projects/${created.project.id}/nodes/${node.id}/run`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: "ununu", request: { prompt: "测试 API", model: "openai/gpt-image-2" } }) }).then((response) => response.json());
  assert.equal(run.status, "succeeded");
  assert.equal(received.run.provider, "ununu");
  assert.equal(received.request.model, "openai/gpt-image-2");
  assert.match(received.request.prompt, /测试 API/);
  assert.match(received.request.prompt, /【固定生成预设：演员身份板（六视图＋整头特写）】/);
  assert.match(received.request.prompt, /左侧约占 60%/);
  const mediaResponse = await fetch(`${base}/api/projects/${created.project.id}/media/${run.result.artifacts[0].id}`);
  assert.equal(mediaResponse.status, 200);
  assert.equal(mediaResponse.headers.get("accept-ranges"), "bytes");
  assert.equal(Buffer.from(await mediaResponse.arrayBuffer()).toString(), "api-generated-image");
  const rangeResponse = await fetch(`${base}/api/projects/${created.project.id}/media/${run.result.artifacts[0].id}`, { headers: { range: "bytes=4-12" } });
  assert.equal(rangeResponse.status, 206);
  assert.equal(rangeResponse.headers.get("content-range"), "bytes 4-12/19");
  assert.equal(rangeResponse.headers.get("content-length"), "9");
  assert.equal(Buffer.from(await rangeResponse.arrayBuffer()).toString(), "generated");
  const invalidRangeResponse = await fetch(`${base}/api/projects/${created.project.id}/media/${run.result.artifacts[0].id}`, { headers: { range: "bytes=99-100" } });
  assert.equal(invalidRangeResponse.status, 416);
  assert.equal(invalidRangeResponse.headers.get("content-range"), "bytes */19");
});

test("cinematic production API completes contracts through compile and preflight while legacy route is a hard 404", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "ununu-unutv-cinematic-api-"));
  let receivedGeneration;
  const service = createUnuTvServer({
    dataRoot,
    provider: {
      async run(input) {
        receivedGeneration = input;
        return { status: "succeeded", artifacts: [{ kind: "video", mimeType: "video/mp4", bytes: Buffer.from("mock-cinematic-video"), title: "cinematic-result.mp4" }] };
      },
      async poll() { throw new Error("not used"); }
    }
  });
  context.after(() => service.close());
  const address = await service.listen(0);
  const base = `http://127.0.0.1:${address.port}`;
  const headers = { "content-type": "application/json" };
  const send = (url, method, value) => fetch(url, { method, headers, ...(value === undefined ? {} : { body: JSON.stringify(value) }) });
  const created = await send(`${base}/api/projects`, "POST", { title: "影视制作 API" }).then((response) => response.json());
  const projectRoot = `${base}/api/projects/${created.project.id}`;
  const production = await send(`${projectRoot}/cinematic-productions`, "POST", { title: "电影短片", projectType: "short_film" }).then((response) => response.json());
  const productionRoot = `${projectRoot}/cinematic-productions/${production.productionId}`;
  const executionNode = await send(`${projectRoot}/canvases/${created.canvas.id}/nodes`, "POST", { kind: "video", title: "正式生成单元" }).then((response) => response.json());
  await send(`${projectRoot}/budget-grant`, "PUT", {
    totalLimit: 5, perTaskLimit: 3, currency: "CNY",
    allowedProviders: ["ark"], allowedModels: ["doubao-seedance-2-0-mini-260615"], allowedTaskTypes: ["video"]
  });
  assert.equal((await fetch(`${projectRoot}/cinematic-productions`).then((response) => response.json())).productions.length, 1);
  const oldRoute = await fetch(`${projectRoot}/short-drama/nonexistent`);
  assert.equal(oldRoute.status, 404);
  assert.equal((await oldRoute.json()).error.code, "route_not_found");

  const storyPacket = await send(`${productionRoot}/story-packet`, "PUT", {
    sourceFacts: ["人物在雨夜等待"], lockedStoryFacts: ["来人出现前不得转身"], scenePurpose: "建立重逢",
    characters: [{ name: "角色甲", goal: "等到来人", resistance: "暴雨" }], causalEventChain: ["等待", "听见脚步", "来人出现"],
    dialogue: [{ speaker: "角色甲", text: "你终于来了。" }], emotionalArc: { start: "焦虑", change: "听见脚步", end: "释然" },
    entranceState: { description: "背对入口等待" }, exitState: { description: "与来人对视" }, mustNotAppearYet: ["脚步声之前转身"], userLockedText: []
  }).then((response) => response.json());
  await send(`${productionRoot}/visual-bible`, "PUT", {
    cinematography: { grammar: "克制观察" }, lighting: { source: "路灯", direction: "侧逆光" }, color: { primary: "雨夜冷蓝" },
    productionDesign: { location: "校门口" }, characterLook: { continuity: "锁定身份" }, performance: { baseline: "克制真实" },
    sound: { world: "持续雨声" }, vfx: { rain: "遵循重力" }, continuityLocks: ["雨向和湿润程度连续"]
  });
  const authority = await send(`${productionRoot}/asset-authorities`, "POST", {
    authorityType: "character", displayName: "角色甲", riskLevel: "high", status: "candidate", identityDescription: "雨夜等待的年轻人", identityLocks: ["面孔", "年龄感", "体型"],
    wardrobeMakeupHair: { wardrobe: "被雨打湿的深色外套" }, viewSpecs: [{ viewId: "front", label: "正面", framing: "半身", angle: "正面平视", description: "中性表情", background: "中性背景", controls: ["人物身份"], doesNotControl: ["最终雨夜场景"], required: true }],
    referenceAssetIds: [], acceptanceCriteria: ["跨视图身份一致"], prohibitedChanges: ["新增第二个人"]
  }).then((response) => response.json());
  const imageCompilation = await send(`${productionRoot}/asset-authorities/${authority.authorityId}/compile`, "POST", {
    generationParameters: { provider: "ununu", model: "openai/gpt-image-2", aspectRatio: "16:9", resolution: "2048x1152", count: 1, referenceMediaIds: [] }, referenceBindings: []
  }).then((response) => response.json());
  assert.equal(imageCompilation.envelope.protocolId, "ununu.character.v2");
  assert.equal(imageCompilation.envelope.lint.ok, true, JSON.stringify(imageCompilation.envelope.lint));
  assert.equal((await fetch(`${productionRoot}/asset-authorities`).then((response) => response.json())).assetAuthorities.length, 1);
  const shot = await send(`${productionRoot}/shots`, "POST", {
    order: 1, narrativeJob: "从等待推进到确认来人", storyBeat: "等待后重逢", openingState: "人物背对入口", trigger: "脚步声进入",
    actionChain: ["先听见脚步", "停顿一次", "再转身"], endingState: "人物看见来人", durationSeconds: 8, blocking: { gaze: "先看前方，再看入口" },
    cinematography: { shotSize: "中景", movementPath: "摄影机固定", focus: "从雨幕转到人物眼睛" }, lighting: { source: "路灯侧逆光" },
    color: { primary: "冷蓝", separation: "暖肤色与冷背景分离" }, performance: cinematicPerformance(8, { trigger: "脚步声先进入，人物停顿确认后才转身" }),
    sound: { ambience: "雨声", bridge: "脚步先于人物出现" }, physicsVfx: { rain: "真实落在衣物上" }, editContinuity: { axis: "不越轴" },
    dialogue: [{ speaker: "角色甲", text: "你终于来了。" }], requiredAssetIds: [], mustNotAppearYet: ["脚步声之前转身"], acceptanceCriteria: ["转身节拍准确"]
  }).then((response) => response.json());
  const movingShot = await send(`${productionRoot}/shots`, "POST", {
    order: 2, narrativeJob: "用推进和下摇展示来人手中的信物", storyBeat: "确认信物", openingState: "人物看向来人", trigger: "来人抬手",
    actionChain: ["摄影机推近", "视轴下摇到手中信物"], endingState: "信物清楚可见", durationSeconds: 8, blocking: { positions: "两人留在校门轴线两侧" },
    cinematography: { shotSize: "中景到近景", movementPath: "沿纵深轴缓慢推近后下摇到手中信物", focus: "从眼睛转到信物" }, lighting: { source: "路灯侧逆光" },
    color: { primary: "冷蓝" }, performance: cinematicPerformance(8, { trigger: "来人先抬手，人物确认后视线才落到信物" }), sound: { ambience: "雨声" }, physicsVfx: { rain: "遵循重力" }, editContinuity: { axis: "不越轴" },
    dialogue: [], requiredAssetIds: [], mustNotAppearYet: [], acceptanceCriteria: ["信物来源与镜头路径清楚"]
  }).then((response) => response.json());
  const movingUnit = await send(`${productionRoot}/generation-units`, "POST", {
    generationUnit: {
      strategy: "single_shot", shotLinks: [{ shotId: movingShot.shotId, order: 1 }], visualAnchorPolicy: "NONE", requiredCapabilities: [], executionNodeId: executionNode.id,
      sequenceState: apiSequenceState(),
      promptCoverage: { ...productionPromptCoverage, cameraTrajectory: "沿纵深轴推近后原地向下俯摇，禁止横移和越轴" },
      controlIntent: { primaryConsistency: "within_clip_temporal", cameraFreedom: "limited", motionComplexity: "medium", modeRationale: "文字声明推进与下摇，必须由结构化相机控制承载。", invariants: ["人物和轴线不变"], permittedChanges: ["机位前移和视轴下摇"], dynamicControl: { source: "text_motion_contract", subjectTrajectories: "人物原地。", actionPhases: "推近、下摇、确认信物。", timing: "连续完成。", cameraTrajectory: "沿纵深轴推近后向下俯摇。", physicsContinuity: "雨水连续。", endState: "信物清楚可见。" } },
      generationParameters: { provider: "ark", model: "doubao-seedance-2-0-mini-260615", mode: "text_to_video", duration: 8, aspectRatio: "16:9", resolution: "1080p", count: 1, generateAudio: true, referenceMediaIds: [], providerOptions: {} }
    }, referenceBindings: []
  }).then((response) => response.json());
  const movingCompilation = await send(`${productionRoot}/generation-units/${movingUnit.generationUnit.generationUnitId}/compile`, "POST", {}).then((response) => response.json());
  assert.equal(movingCompilation.envelope.cameraTrajectory.ok, false);
  assert.equal(movingCompilation.envelope.lint.errors.some((entry) => entry.code === "structured_camera_trajectory_required"), true);
  assert.equal(movingCompilation.envelope.lint.errors.some((entry) => entry.code === "story_owner_acceptance_required"), true);
  assert.equal(movingCompilation.envelope.lint.errors.some((entry) => entry.code === "shot_script_owner_acceptance_required"), true);
  await send(`${projectRoot}/reviews`, "POST", {
    targetType: CINEMATIC_STORY_REVISION_REVIEW_TYPE,
    targetId: cinematicRevisionReviewTargetId("story", storyPacket.storyPacketId, storyPacket.revision),
    state: "accepted", note: "Owner 接受当前剧情 revision"
  });
  const storyAcceptedCompilation = await send(`${productionRoot}/generation-units/${movingUnit.generationUnit.generationUnitId}/compile`, "POST", {}).then((response) => response.json());
  assert.equal(storyAcceptedCompilation.envelope.lint.errors.some((entry) => entry.code === "story_owner_acceptance_required"), false);
  assert.equal(storyAcceptedCompilation.envelope.lint.errors.some((entry) => entry.code === "shot_script_owner_acceptance_required"), true);
  for (const acceptedShot of [shot, movingShot]) await send(`${projectRoot}/reviews`, "POST", {
    targetType: CINEMATIC_SHOT_REVISION_REVIEW_TYPE,
    targetId: cinematicRevisionReviewTargetId("shot", acceptedShot.shotId, acceptedShot.revision),
    state: "accepted", note: "Owner 接受当前分镜脚本 revision"
  });
  const semanticCarrierReview = await send(`${projectRoot}/reviews`, "POST", {
    targetType: "media", targetId: "media-semantic-frame", state: "accepted", note: "Owner 逐像素接受语义构图参考"
  }).then((response) => response.json());
  const semanticCarrierUnit = await send(`${productionRoot}/generation-units`, "POST", {
    generationUnit: {
      strategy: "single_shot", shotLinks: [{ shotId: shot.shotId, order: 1 }], visualAnchorPolicy: "SHOT_FRAME_SET", requiredCapabilities: ["multi_reference"],
      executionNodeId: executionNode.id,
      sequenceState: apiSequenceState(),
      controlIntent: {
        primaryConsistency: "spatial_blocking", cameraFreedom: "limited", motionComplexity: "medium",
        modeRationale: "语义构图图只锁人物、场景和空间，动作与摄影机时序由文本动态合同推进。",
        invariants: ["人物身份、校门轴线与站位不变"], permittedChanges: ["人物按节拍停顿后转向入口"],
        dynamicControl: { source: "hybrid", subjectTrajectories: "角色原地完成停顿与转身。", actionPhases: "等待、脚步、停顿、转身、确认。", timing: "脚步先出现，停顿一次后转身。", cameraTrajectory: "摄影机固定。", physicsContinuity: "雨水和衣物受力连续。", endState: "角色看向入口。" }
      },
      promptCoverage: productionPromptCoverage,
      generationParameters: { provider: "ark", model: "doubao-seedance-2-0-mini-260615", mode: "image_reference", duration: 8,
        aspectRatio: "16:9", resolution: "1080p", count: 1, generateAudio: true, referenceMediaIds: ["media-semantic-frame"], providerOptions: {} }
    },
    referenceBindings: [{
      assetId: "storyboard-semantic", versionId: "storyboard-semantic-v1", mediaId: "media-semantic-frame", checksum: "checksum-semantic-frame",
      displayName: "逐镜语义构图参考", providerIndex: 1, role: "storyboard_composition", shotId: shot.shotId,
      controls: ["人物、场景与空间站位"], doesNotControl: ["视频首帧和后续动作结果"], required: true, authorityRevision: "storyboard-r1",
      acceptanceProof: {
        reviewId: semanticCarrierReview.id, mediaId: "media-semantic-frame", checksum: "checksum-semantic-frame", shotId: shot.shotId,
        shotRevision: shot.revision + 1, pixelReviewed: true,
        verifiedDomains: ["character_identity", "scene_topology", "spatial_blocking", "camera_composition", "continuity_state"]
      },
      semanticControl: { temporalRole: "static_state", preserve: ["人物、场景与空间站位"], replace: [], complete: [], ignore: ["图中静态姿势和时间点"], styleOnly: [] }
    }]
  }).then((response) => response.json());
  const semanticCarrierCompilation = await send(`${productionRoot}/generation-units/${semanticCarrierUnit.generationUnit.generationUnitId}/compile`, "POST", {}).then((response) => response.json());
  assert.equal(semanticCarrierCompilation.envelope.lint.errors.some((entry) => entry.code === "visual_state_carrier_shot_stale"), true);
  const gatedUnit = await send(`${productionRoot}/generation-units`, "POST", {
    generationUnit: {
      strategy: "single_shot", shotLinks: [{ shotId: shot.shotId, order: 1 }], visualAnchorPolicy: "NONE", requiredCapabilities: [],
      executionNodeId: executionNode.id,
      sequenceState: apiSequenceState(),
      executionGates: { requiredProfessionalRoles: ["director-story", "cinematography", "continuity-qa"] },
      generationParameters: { provider: "ark", model: "doubao-seedance-2-0-mini-260615", mode: "text_to_video", duration: 8,
        aspectRatio: "16:9", resolution: "1080p", count: 1, generateAudio: true, referenceMediaIds: [], providerOptions: {} }
    }, referenceBindings: []
  }).then((response) => response.json());
  const gatedCompilation = await send(`${productionRoot}/generation-units/${gatedUnit.generationUnit.generationUnitId}/compile`, "POST", {}).then((response) => response.json());
  const gatedCodes = new Set(gatedCompilation.envelope.lint.errors.map((entry) => entry.code));
  for (const code of ["professional_signoff_required", "professional_signoff_target_stale", "professional_signoff_knowledge_required", "professional_signoff_manifest_mismatch", "team_manifest_required"]) {
    assert.equal(gatedCodes.has(code), true, code);
  }
  await send(productionRoot, "PATCH", { teamManifestIds: ["manifest-veto-test"] });
  const vetoGatedUnit = await send(`${productionRoot}/generation-units`, "POST", {
    generationUnit: {
      strategy: "single_shot", shotLinks: [{ shotId: shot.shotId, order: 1 }], visualAnchorPolicy: "NONE", requiredCapabilities: [],
      executionNodeId: executionNode.id, executionGates: { requiredProfessionalRoles: ["cinematography"] },
      sequenceState: apiSequenceState(),
      generationParameters: { provider: "ark", model: "doubao-seedance-2-0-mini-260615", mode: "text_to_video", duration: 8,
        aspectRatio: "16:9", resolution: "1080p", count: 1, generateAudio: true, referenceMediaIds: [], providerOptions: {} }
    }, referenceBindings: []
  }).then((response) => response.json());
  await send(`${productionRoot}/contributions`, "POST", {
    roleId: "cinematography", expertPackId: "pack-camera", targetType: "GenerationUnit", targetId: vetoGatedUnit.generationUnit.generationUnitId,
    diagnosis: "摄影轨迹合同冲突。", selectedTradeoff: "先修轨迹再生成。",
    structuredFields: { targetRevision: vetoGatedUnit.generationUnit.revision, sourceGenerationUnitRevision: vetoGatedUnit.generationUnit.revision,
      sourceStoryPacketRevision: storyPacket.revision, sourceShotRevisions: { [shot.shotId]: shot.revision }, teamManifestId: "manifest-veto-test" },
    hardConstraints: ["不得越轴"], vetoFindings: ["当前轨迹互相冲突"],
    knowledgeRefs: ["cap-camera-emotion-first", "kn-5a04ffa7ad75a5fde8c3"], acceptanceCriteria: ["轨迹逐值一致"]
  });
  const vetoCompilation = await send(`${productionRoot}/generation-units/${vetoGatedUnit.generationUnit.generationUnitId}/compile`, "POST", {}).then((response) => response.json());
  assert.equal(vetoCompilation.envelope.lint.errors.some((entry) => entry.code === "professional_signoff_target_stale"), true);
  const missingHandoffPlan = await send(`${productionRoot}/generation-units`, "POST", {
    generationUnit: {
      strategy: "continuous_segment", shotLinks: [{ shotId: shot.shotId, order: 1 }], visualAnchorPolicy: "PREVIOUS_ACCEPTED_TAIL", requiredCapabilities: ["first_frame"],
      executionNodeId: executionNode.id,
      sequenceState: apiSequenceState(),
      generationParameters: { provider: "ark", model: "doubao-seedance-2-0-mini-260615", mode: "first_frame", duration: 8,
        aspectRatio: "16:9", resolution: "1080p", count: 1, generateAudio: true, firstFrameMediaId: "media-h1", referenceMediaIds: [], providerOptions: {} }
    }, referenceBindings: []
  });
  assert.equal(missingHandoffPlan.status, 400);
  assert.equal((await missingHandoffPlan.json()).error.code, "invalid_cinematic_contract");
  const handoffUnit = await send(`${productionRoot}/generation-units`, "POST", {
    generationUnit: {
      strategy: "continuous_segment", shotLinks: [{ shotId: shot.shotId, order: 1 }], visualAnchorPolicy: "PREVIOUS_ACCEPTED_TAIL", requiredCapabilities: ["first_frame"],
      executionNodeId: executionNode.id,
      sequenceState: apiSequenceState(),
      executionGates: { requireGenerationControlIntent: true, requireReferenceSemanticControl: true },
      controlIntent: {
        primaryConsistency: "cross_shot_continuity", cameraFreedom: "locked", motionComplexity: "medium",
        modeRationale: "上一段 H1 只负责继承 t0 的遮挡峰值，H1 后的新动作与摄影机由动态合同驱动。",
        invariants: ["人物身份与入口站位不变", "雨伞遮挡方向连续"], permittedChanges: ["H1 后人物继续转身并望向入口"],
        dynamicControl: { source: "text_motion_contract", subjectTrajectories: "人物从 H1 遮挡峰值后的原位继续完成转身。", actionPhases: "H1 遮挡、雨伞离幅、继续转身、望向入口。", timing: "不复演 H0 到 H1，离幅后直接推进新动作。", cameraTrajectory: "摄影机保持固定。", physicsContinuity: "雨伞方向、速度和雨水受力跨缝连续。", endState: "人物望向入口并确认来人。" }
      },
      continuationHandoff: {
        mode: "TAIL_CONTINUE", seamType: "occlusion", seamOpportunity: "雨伞掠过前景形成完全遮挡",
        entryActionPhase: "H1 雨伞遮挡峰值", exitActionPhase: "雨伞离开后继续转身", repeatedAction: "不重复 H0→H1",
        newContentAfterH1: "人物完成转身并望向入口", cutPointRule: "按遮挡峰值和动作相位对齐", trimPlan: "不删除重叠动作区",
        h1MediaId: "media-h1",
        camera: { movementDirection: "固定机位", exitSpeed: "静止", entrySpeed: "静止", lens: "35mm", focus: "人物眼睛", exposure: "雨夜路灯高光不变" },
        audioBridge: { ambience: "雨声连续", syncCue: "雨伞掠过声" },
        conservationChecks: ["blocking", "props", "lighting", "action_phase", "screen_direction"]
      },
      generationParameters: { provider: "ark", model: "doubao-seedance-2-0-mini-260615", mode: "first_frame", duration: 8,
        aspectRatio: "16:9", resolution: "1080p", count: 1, generateAudio: true, firstFrameMediaId: "media-h1", referenceMediaIds: [], providerOptions: {} }
    },
    referenceBindings: [{
      assetId: "tail-asset", versionId: "tail-v1", mediaId: "media-h1", displayName: "上一段 H1", providerIndex: 1, role: "continuity_tail",
      controls: ["交接状态"], doesNotControl: ["后续动作结果"], required: true, authorityRevision: "evaluation-r1",
      semanticControl: { temporalRole: "continuity_state", preserve: ["H1 遮挡峰值与人物入口站位"], replace: [], complete: [], ignore: [], styleOnly: [] }
    }]
  }).then((response) => response.json());
  const handoffCompilation = await send(`${productionRoot}/generation-units/${handoffUnit.generationUnit.generationUnitId}/compile`, "POST", {}).then((response) => response.json());
  assert.equal(handoffCompilation.envelope.compilerVersion, "3.5.0");
  assert.equal(handoffCompilation.envelope.generationControl.frameAnchorPolicy.firstFrameScope, "t0_boundary_only");
  assert.match(handoffCompilation.envelope.compiledContentPrompt, /以上一段 H1 为唯一入口直接续演新动作/u);
  assert.match(handoffCompilation.envelope.compiledContentPrompt, /首帧职责：只锁定 t0 的初始\/续接边界；t0\+1 起/u);
  assert.match(handoffCompilation.envelope.compiledContentPrompt, /不使用固定秒数/u);
  const unitPayload = await send(`${productionRoot}/generation-units`, "POST", {
    generationUnit: {
      strategy: "single_shot", shotLinks: [{ shotId: shot.shotId, order: 1 }], visualAnchorPolicy: "NONE", requiredCapabilities: ["native_audio"],
      executionNodeId: executionNode.id,
      sequenceState: apiSequenceState(),
      controlIntent: {
        primaryConsistency: "within_clip_temporal", cameraFreedom: "locked", motionComplexity: "medium",
        modeRationale: "本镜无跨镜像素入口，优先让模型联合生成雨夜转身的片内动态。",
        invariants: ["角色身份描述不变", "角色始终留在校门空间轴线上"], permittedChanges: ["雨幕形态随时间变化"],
        dynamicControl: { source: "text_motion_contract", subjectTrajectories: "角色原地停顿后转向入口。", actionPhases: "等待、听见脚步、停顿、转身、确认。", timing: "脚步先出现，停顿一次后转身。", cameraTrajectory: "摄影机固定。", physicsContinuity: "雨水和衣物受力连续。", endState: "角色看向入口并认出来人。" }
      },
      promptCoverage: productionPromptCoverage,
      generationParameters: { provider: "ark", model: "doubao-seedance-2-0-mini-260615", mode: "text_to_video", duration: 8,
        aspectRatio: "16:9", resolution: "1080p", count: 1, generateAudio: true, referenceMediaIds: [], providerOptions: { providerTraceId: "cinematic-mock" } }
    }, referenceBindings: []
  }).then((response) => response.json());
  const unitId = unitPayload.generationUnit.generationUnitId;
  const compilation = await send(`${productionRoot}/generation-units/${unitId}/compile`, "POST", {}).then((response) => response.json());
  assert.equal(compilation.envelope.protocolId, "ununu.video.single-shot.v2");
  assert.equal(compilation.envelope.generationControl.ok, true, JSON.stringify(compilation.envelope.generationControl));
  assert.equal(compilation.envelope.generationControl.intent.primaryConsistency, "within_clip_temporal");
  assert.equal(compilation.envelope.lint.ok, true, JSON.stringify(compilation.envelope.lint));
  assert.match(compilation.envelope.compiledContentPrompt, /镜头1：0-8秒/u);
  assert.match(compilation.envelope.compiledContentPrompt, /静态参考不提供运动/u);
  assert.doesNotMatch(compilation.envelope.compiledContentPrompt, /16\s*:\s*9|1080p|(?:总时长|视频时长|生成时长)\s*[：:]?\s*8\s*秒/u);
  const preflight = await send(`${productionRoot}/generation-units/${unitId}/preflight`, "POST", {}).then((response) => response.json());
  assert.equal(preflight.ready, true, JSON.stringify(preflight));
  const updatedShot = await send(`${productionRoot}/shots/${shot.shotId}`, "PATCH", { narrativeJob: "从等待推进到辨认来人" }).then((response) => response.json());
  const stalePreflight = await send(`${productionRoot}/generation-units/${unitId}/preflight`, "POST", {}).then((response) => response.json());
  assert.equal(stalePreflight.ready, false);
  assert.equal(stalePreflight.stale, true);
  assert.equal(stalePreflight.staleSources.some((source) => source.sourceType === "cinematic_shot"), true);
  const staleRunResponse = await send(`${productionRoot}/generation-units/${unitId}/runs`, "POST", { });
  assert.equal(staleRunResponse.status, 409);
  assert.equal((await staleRunResponse.json()).error.code, "stale_prompt_compilation");
  const ownerBlockedPreflight = await send(`${productionRoot}/generation-units/${unitId}/preflight`, "POST", { recompile: true }).then((response) => response.json());
  assert.equal(ownerBlockedPreflight.ready, false);
  assert.equal(ownerBlockedPreflight.lint.errors.some((entry) => entry.code === "shot_script_owner_acceptance_required"), true);
  await send(`${projectRoot}/reviews`, "POST", {
    targetType: CINEMATIC_SHOT_REVISION_REVIEW_TYPE,
    targetId: cinematicRevisionReviewTargetId("shot", updatedShot.shotId, updatedShot.revision),
    state: "accepted", note: "Owner 重新接受更新后的分镜脚本 revision"
  });
  const refreshedPreflight = await send(`${productionRoot}/generation-units/${unitId}/preflight`, "POST", { recompile: true }).then((response) => response.json());
  assert.equal(refreshedPreflight.ready, true, JSON.stringify(refreshedPreflight));
  const formalRun = await send(`${productionRoot}/generation-units/${unitId}/runs`, "POST", {
    billingMode: "legacy_budget",
    amount: 2,
    currency: "CNY",
    idempotencyKey: "cinematic-api-u01-v1",
    formalGenerationIntent: {
      version: "formal_generation_intent_v1",
      generationUnitId: unitId,
      generationUnitRevision: unitPayload.generationUnit.revision,
      compilationId: refreshedPreflight.compilationId,
      payloadHash: refreshedPreflight.envelope.payloadHash,
      executionNodeId: executionNode.id,
      maxNewSubmissions: 1,
      createdAt: new Date().toISOString()
    }
  }).then((response) => response.json());
  assert.equal(formalRun.run.status, "succeeded", JSON.stringify(formalRun));
  assert.equal(formalRun.reservation.status, "consumed");
  assert.equal(formalRun.canvasNode.payload.currentMediaId, formalRun.run.result.artifacts[0].id);
  assert.equal(receivedGeneration.request.providerTraceId, "cinematic-mock");
  assert.equal(receivedGeneration.request.billingMode, "legacy_budget");
  assert.equal(receivedGeneration.request.provider, "ark");
  assert.equal(receivedGeneration.request.prompt, receivedGeneration.run.request.prompt);
  assert.match(receivedGeneration.request.prompt, /辨认来人/u);
  const capabilities = await fetch(`${base}/api/model-capabilities?capability=video`).then((response) => response.json());
  assert.equal(capabilities.models.some((model) => model.model === "doubao-seedance-2-0-mini-260615"), true);
});
