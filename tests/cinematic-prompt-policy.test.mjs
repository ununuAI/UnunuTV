import assert from "node:assert/strict";
import test from "node:test";
import {
  compileCinematicPrompt,
  evaluateStructuredCameraTrajectories,
  lintCinematicPrompt,
  validateCameraTrajectoryPlan,
  validateOrbitCameraTrajectory
} from "../packages/contracts/src/index.mjs";

function story(overrides = {}) {
  return {
    storyPacketId: "story-1",
    sourceFacts: ["人物在普通住宅卧室内与熟悉的男性朋友私下说话"],
    lockedStoryFacts: ["反转以前不得提前笑场", "最后一句说完以前不得倒下"],
    scenePurpose: "用一本正经的提醒制造最后一句的反转笑点",
    characters: [{ name: "角色甲", goal: "提醒朋友停止摸脚", resistance: "自己快忍不住笑" }],
    causalEventChain: ["严肃说明昨夜没有睡着", "克制提出边界", "以健康理由完成反转", "彻底破功大笑"],
    dialogue: [
      { speaker: "角色甲", text: "昨晚你钻我被子摸我脚，我其实没睡着。" },
      { speaker: "角色甲", text: "我尊重你的癖好，但以后别摸了。" },
      { speaker: "角色甲", text: "主要我没洗脚，对你身体不好。" }
    ],
    emotionalArc: { start: "认真克制", turn: "嘴角轻微失控", end: "彻底破功" },
    entranceState: { pose: "盘腿坐直", gaze: "看着镜头后的朋友" },
    exitState: { pose: "倒在床上继续自然大笑" },
    mustNotAppearYet: ["最后一句之前笑场", "最后一句之前倒下"],
    userLockedText: [],
    revision: 1,
    ...overrides
  };
}

function bible() {
  return {
    visualBibleId: "bible-1",
    cinematography: { grammar: "写实手机 Vlog；观察熟人间的私密交流", lensPreference: "手机广角的近距离空间感" },
    lighting: { source: "卧室现有暖中性室内柔光", direction: "床头侧前方", contrast: "低反差并保护肤色高光", negativeFill: "画面右侧轻微负补光" },
    color: { primary: "米灰与白", accent: "自然肤色", saturation: "克制", separation: "肤色与米灰背景保持轻微暖冷分离" },
    productionDesign: { architecture: "真实普通住宅卧室", materials: "米灰软包床头、白色床品" },
    characterLook: { identity: "以已接受人物资产为准", wardrobe: "当前场景锁定服装版本" },
    performance: { baseline: "像私下和熟悉的人说话，不面向直播观众" },
    sound: { world: "轻微卧室底噪与床品受压声", musicPrinciple: "无背景音乐" },
    vfx: { physicalRule: "保持真实床品受力和身体接触" },
    continuityLocks: ["人物身份、发型、年龄与体型跨镜一致"],
    visualMotifs: ["白色床品承接从克制到失控的身体变化"],
    colorArc: { start: "暖中性克制", end: "保持综合色彩，仅表演释放" },
    spatialDramaturgy: { rule: "人物始终被床铺中央框定，倒下才打破垂直稳定" },
    propSemantics: {},
    costumeNarrative: { rule: "居家状态强化熟人私下交流" },
    materialAging: { rule: "普通住宅材质不过度精致" },
    culturalResearchRefs: [],
    styleProhibitions: ["空泛大师感替代具体设计"],
    revision: 1
  };
}

function shot(id = "shot-1", order = 1, overrides = {}) {
  return {
    shotId: id,
    order,
    narrativeJob: "建立严肃提醒，并在最后一句后释放笑意",
    storyBeat: "提醒、边界、反转、破功",
    cutReason: "",
    openingState: "人物盘腿坐直，双手自然放在腿间，认真直视镜头后的朋友",
    trigger: "人物开始说出第一句昨夜事实",
    actionChain: ["保持严肃说出第一句", "身体轻微前倾说出第二句", "嘴角仅在第三句开始轻微失控", "第三句说完后抬右手轻挥并倒向画面右侧"],
    reactionTurn: "第三句完整结束后才彻底破功大笑",
    endingState: "人物闭眼倒在白色床上继续自然大笑，床品形成真实褶皱",
    blocking: { position: "白色床铺中央", pose: "盘腿", gaze: "始终看着镜头后的熟悉朋友", hands: "倒下前右手仅轻挥一次", contactSurface: "身体与床品真实接触" },
    cinematography: { shotSize: "中近景到倒下后的中景", cameraPosition: "床尾正前方略高于视线", perspective: "手机广角", movementPath: "摄影机全程固定", focus: "持续锁定人物眼睛和面部", narrativePurpose: "让逗弄像私下被朋友记录" },
    lighting: { source: "室内实际柔光", direction: "侧前方", softness: "柔和", colorTemperature: "暖中性", contrast: "低反差", exposureProtection: "皮肤高光不过曝" },
    color: { primary: "白色床品", secondary: "米灰墙面", accent: "自然肤色", saturation: "自然克制", continuity: "全镜保持一致" },
    performance: { objective: "认真提醒朋友", subtext: "其实在逗对方", breathing: "前两句平稳，第三句末尾才松动", eyeLine: "落在镜头后的朋友眼睛", mouthCorner: "第三句开始才轻微失控", jaw: "此前保持克制", shoulders: "倒下前保持稳定", microExpressionOrder: "严肃 → 轻微嘴角失控 → 破功" },
    sound: { dialogueDelivery: "年轻男性自然普通话，口型准确", ambience: "轻微卧室底噪", foley: "床品摩擦、受压和倒下闷响", silence: "对白停顿保持自然", music: "无" },
    physicsVfx: { body: "倒下时重心和膝盖自然进入前景", cloth: "床品按压力形成真实褶皱", collision: "落床有轻微闷响" },
    editContinuity: { entrance: "从坐直状态开始", exit: "保留倒床笑声作为出口", axis: "不越轴", screenDirection: "向画面右侧倒下" },
    dialogue: story().dialogue,
    requiredAssetIds: ["character-accepted-1", "bedroom-accepted-1"],
    mustNotAppearYet: ["第三句结束前挥手", "第三句结束前倒下"],
    acceptanceCriteria: ["三句对白原文和顺序完整", "第三句前无笑场", "全程固定机位"],
    negativeConstraints: ["新增第二个人", "字幕或水印", "脸部漂移", "口型错误", "手指畸形"],
    revision: 1,
    ...overrides
  };
}

function parameters(overrides = {}) {
  return {
    provider: "ark",
    model: "doubao-seedance-2-0-mini-260615",
    mode: "image_reference",
    duration: 15,
    aspectRatio: "16:9",
    resolution: "480p",
    count: 1,
    generateAudio: true,
    referenceMediaIds: ["media-character"],
    providerOptions: {},
    ...overrides
  };
}

function binding(overrides = {}) {
  return {
    assetId: "asset-character",
    versionId: "asset-character-v1",
    mediaId: "media-character",
    displayName: "角色甲",
    providerIndex: 1,
    role: "character_identity",
    controls: ["人物面孔", "五官", "年龄感", "肤色", "体型", "发型"],
    doesNotControl: ["场景", "摄影机", "动作", "灯光"],
    required: true,
    authorityRevision: "accepted-1",
    ...overrides
  };
}

function handoffPlan(overrides = {}) {
  return {
    mode: "TAIL_CONTINUE",
    seamType: "occlusion",
    seamOpportunity: "前景人物衣袖完全遮挡画面时交接",
    entryActionPhase: "H1 衣袖遮挡达到峰值",
    exitActionPhase: "衣袖离开后动作继续",
    repeatedAction: "无重复动作，H1 后直接前进",
    newContentAfterH1: "人物穿过遮挡继续向门口移动",
    cutPointRule: "在遮挡峰值与动作相位一致处对齐",
    trimPlan: "TAIL_CONTINUE 不删除 H0→H1 重复区",
    h1MediaId: "media-tail",
    camera: { movementDirection: "向画面右侧跟移", exitSpeed: "中速", entrySpeed: "中速", lens: "35mm", focus: "锁定人物眼睛", exposure: "保留窗外高光" },
    audioBridge: { ambience: "客栈室内底噪连续", syncCue: "衣袖掠过的布料声" },
    conservationChecks: ["blocking", "props", "lighting", "action_phase", "screen_direction"],
    ...overrides
  };
}

function unit(overrides = {}) {
  return {
    generationUnitId: "unit-1",
    strategy: "single_shot",
    narrativeTask: "一次连续镜头完成严肃提醒到笑场倒床的反转",
    shotLinks: [{ shotId: "shot-1", order: 1 }],
    visualAnchorPolicy: "NONE",
    requiredCapabilities: ["native_audio"],
    generationParameters: parameters(),
    continuityBoundary: { entry: "独立硬切入口，不继承前镜尾帧", exit: "倒床自然大笑" },
    highRiskNegatives: ["切镜", "移动机位", "突然变焦"],
    revision: 1,
    ...overrides
  };
}

function orbitTrajectory(overrides = {}) {
  return {
    movementType: "orbit",
    coordinateSpace: "subject_local",
    pivot: { targetId: "character-1", description: "角色甲胸骨中心的竖直轴" },
    startPose: { azimuthDegrees: 90, elevationDegrees: 5, radiusMeters: 2.5, heightMeters: 1.55 },
    endPose: { azimuthDegrees: 0, elevationDegrees: 5, radiusMeters: 2.5, heightMeters: 1.55 },
    direction: "clockwise_from_overhead",
    arcDegrees: 90,
    durationSeconds: 6,
    speedCurve: "前一秒平滑加速，中段匀速，最后一秒平滑减速",
    lookAt: "镜头光轴始终锁定角色甲双眼中点，不发生甩头式重构图",
    lensFocus: "35mm 等效焦段不变，焦点持续锁定双眼",
    rollDegrees: 0,
    framingInvariant: "角色甲头顶余量和胸口在画面中的尺寸基本不变",
    subjectMotionRelation: "角色甲原地不随摄影机转身，只有摄影机绕轴运动",
    occlusionPlan: "不允许前景物遮住脸；轨迹全程保持双眼可见",
    parallaxExpectation: "床头与侧墙产生连续视差，不发生背景瞬移或几何翻面",
    controlRouteId: "director-route-orbit-1",
    cleanCaptures: { startCaptureId: "capture-clean-start", midCaptureId: "capture-clean-mid", endCaptureId: "capture-clean-end" },
    overlayPolicy: "editor_only",
    ...overrides
  };
}

function cameraTrajectoryPlan(overrides = {}) {
  return {
    movementType: "compound",
    guideType: "compound_guides",
    coordinateSpace: "world",
    startState: { position: { x: 0, y: 1.6, z: 0 }, yawDegrees: 0, pitchDegrees: -3, rollDegrees: 0, fovDegrees: 58, focusDistanceMeters: 4 },
    endState: { position: { x: 0, y: 1.1, z: 2 }, yawDegrees: 0, pitchDegrees: -18, rollDegrees: 0, fovDegrees: 58, focusDistanceMeters: 2.5 },
    focusDistancePlan: [
      { atSeconds: 0, focusDistanceMeters: 4, target: "角色双眼", interpolation: "ease_in_out" },
      { atSeconds: 2, focusDistanceMeters: 3.2, target: "角色上半身", interpolation: "ease_in_out" },
      { atSeconds: 4, focusDistanceMeters: 2.5, target: "右手道具", interpolation: "hold" }
    ],
    durationSeconds: 4,
    pathDescription: "先沿世界纵深轴直线推近两米，再在原地向下俯摇十五度",
    directionDefinition: "空间移动只朝世界Z轴正方向，俯摇只改变pitch，不横移、不越轴",
    speedCurve: "前0.5秒缓入，中段匀速，最后0.5秒缓出",
    lookAt: "先锁角色双眼，再平滑转到右手道具",
    lensFocus: "视场角保持58度，焦点由4米平滑转到2.5米",
    framingInvariant: "人物保持画面中央，头顶余量不跳变",
    subjectMotionRelation: "人物原地不跟随摄影机转身",
    occlusionPlan: "全程无遮挡，不允许借前景遮挡偷切",
    parallaxExpectation: "近景床沿位移快于远景墙面，视差方向连续",
    controlGeometryId: "director-compound-guide-1",
    cleanCaptures: { startCaptureId: "clean-start", midCaptureId: "clean-mid", endCaptureId: "clean-end" },
    overlayPolicy: "editor_only",
    ...overrides
  };
}

test("manual Prompt input remains a non-runnable preview draft", () => {
  const envelope = compileCinematicPrompt({
    generationUnit: unit(),
    referenceBindings: [binding()],
    shots: [shot()],
    storyPacket: story(),
    visualBible: bible(),
    manualOverride: true,
    manualPrompt: "这是一段绕过结构化字段的人工自由文本。"
  });
  assert.equal(envelope.compiledContentPrompt, "这是一段绕过结构化字段的人工自由文本。");
  assert.equal(envelope.promptSource, "manual_preview");
  assert.equal(envelope.manualPromptProvided, true);
  assert.equal(envelope.preflight.ok, false);
  assert.equal(envelope.preflight.errors.some((entry) => entry.code === "manual_prompt_not_formal_runnable"), true);
  assert.equal(envelope.promptDraft.status, "preflight_blocked");
  assert.equal(envelope.requiresPreflight, true);
});

test("production preflight reports sequence_previs_required when the binding is absent", () => {
  const envelope = compileCinematicPrompt({
    generationUnit: unit({
      executionGates: { requireSequencePrevis: true }
    }),
    referenceBindings: [binding()],
    shots: [shot()],
    storyPacket: story(),
    visualBible: bible()
  });
  assert.equal(envelope.lint.errors.some((entry) => entry.code === "sequence_previs_required"), true);
  assert.equal(envelope.preflight.errors.some((entry) => entry.code === "sequence_previs_required"), true);
  assert.equal(envelope.preflight.ok, false);
  assert.equal(envelope.promptDraft.status, "preflight_blocked");
});

function annotatedCameraReference(overrides = {}) {
  return {
    mediaId: "media-camera-guide",
    sourceMediaId: "media-clean-space-master",
    sourceChecksum: "clean-space-master-sha256",
    controlGeometryId: "director-compound-guide-1",
    annotations: [
      { annotationId: "PATH_A", kind: "path", meaning: "摄影机推进路径", instruction: "0至2秒沿箭头平滑推近，不横移", startSeconds: 0, endSeconds: 2 },
      { annotationId: "R1", kind: "region", meaning: "角色右手道具所在局部", instruction: "2至4秒下摇并把R1放大到中近景", startSeconds: 2, endSeconds: 4 }
    ],
    ...overrides
  };
}

function continuityState(overrides = {}) {
  return {
    stateId: "bedroom-entry",
    sceneAuthorityId: "bedroom-accepted-1",
    topologyRevision: "bedroom-topology-r1",
    axis: {
      axisId: "bed-to-camera",
      axisLabel: "床铺至摄影机轴",
      entranceZoneId: "bed-center",
      entranceZoneLabel: "床铺中央",
      targetZoneId: "camera-side",
      targetZoneLabel: "镜头后的朋友",
      positiveScreenDirection: "toward_camera"
    },
    subjects: [{
      entityId: "character-1",
      displayName: "角色甲",
      zoneId: "bed-center",
      zoneLabel: "床铺中央",
      bodyOrientation: "toward_camera",
      gazeTargetId: "friend-camera",
      motionDirection: "stationary",
      motionMode: "stationary",
      axisIntent: "stationary",
      stateTags: ["盘腿坐直", "严肃克制"],
      irreversibleStateTags: [],
      propIds: []
    }],
    environment: [{ entityId: "bed", displayName: "白色床铺", zoneId: "bed-center", zoneLabel: "画面中央", presence: "present", stateTags: ["完整"], count: 1 }],
    props: [],
    ...overrides
  };
}

function continuityPlan() {
  return {
    entry: continuityState(),
    exit: continuityState({ stateId: "bedroom-exit", subjects: [{ ...continuityState().subjects[0], stateTags: ["倒在床上自然大笑"] }] }),
    stateTransitions: [{ entityId: "character-1", fromState: "严肃克制", toState: "倒床大笑", cause: "第三句对白完成", visibleOnScreen: true }],
    actionOrigins: []
  };
}

test("single-person image reference uses the character name and keeps provider parameters outside the content Prompt", () => {
  const envelope = compileCinematicPrompt({
    generationUnit: unit(),
    referenceBindings: [binding()],
    shots: [shot()],
    storyPacket: story(),
    visualBible: bible()
  });
  assert.match(envelope.compiledContentPrompt, /（参考图1）=角色甲/u);
  assert.match(envelope.compiledContentPrompt, /【参考】/u);
  assert.doesNotMatch(envelope.compiledContentPrompt, /只控制|不控制/u);
  assert.match(envelope.compiledContentPrompt, /【画面时间线】/u);
  assert.doesNotMatch(envelope.compiledContentPrompt, /主体1/u);
  assert.doesNotMatch(envelope.compiledContentPrompt, /(?:总时长|视频时长|生成时长)\s*15\s*秒|16\s*:\s*9|1080p|doubao-seedance|provider/iu);
  for (const line of story().dialogue) assert.match(envelope.compiledContentPrompt, new RegExp(line.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "u"));
  assert.equal(envelope.protocolId, "ununu.video.single-shot.v2");
  assert.equal(envelope.generationParameters.duration, 15);
  assert.match(envelope.payloadHash, /^fnv1a32:[0-9a-f]{8}$/u);
  assert.equal(envelope.lint.ok, true, JSON.stringify(envelope.lint.errors));
  assert.equal(envelope.preflight.ok, true, JSON.stringify(envelope.preflight));
  assert.equal(envelope.visualInputDecision.mode, "image_reference");
  assert.equal(envelope.preflight.visualInputDecision.ok, true);
});

test("compile-time canonical input decision blocks virtual-person character references in first-frame mode", () => {
  const frameBinding = binding({ role: "first_frame" });
  const envelope = compileCinematicPrompt({
    generationUnit: unit({
      visualAnchorPolicy: "FIRST_FRAME",
      requiredCapabilities: ["first_frame", "virtual_person_asset"],
      generationParameters: parameters({
        mode: "first_frame",
        firstFrameMediaId: frameBinding.mediaId,
        referenceMediaIds: [],
        virtualPersonAssetIds: ["asset-20260310030618-88hlb"]
      })
    }),
    referenceBindings: [frameBinding],
    shots: [shot()],
    storyPacket: story(),
    visualBible: bible()
  });
  assert.equal(envelope.preflight.ok, false);
  assert.equal(envelope.visualInputDecision.errors.some((entry) => entry.code === "character_temporal_frame_forbidden"), true);
});

test("reference mappings keep rich asset titles separate from concise Prompt aliases", () => {
  const actionBinding = { ...binding(), displayName: "白璃 · 三符贴地火浪动作板", promptAlias: "三符火符", role: "action_phase" };
  const envelope = compileCinematicPrompt({
    generationUnit: unit(),
    referenceBindings: [actionBinding],
    shots: [shot()],
    storyPacket: story(),
    visualBible: bible()
  });
  assert.match(envelope.compiledContentPrompt, /（参考图1）=三符火符/u);
  assert.match(envelope.compiledContentPrompt, /【参考】\n（参考图1）=三符火符。/u);
  assert.doesNotMatch(envelope.compiledContentPrompt, /（参考图1）=白璃 · 三符贴地火浪动作板/u);
  assert.equal(envelope.lint.ok, true, JSON.stringify(envelope.lint.errors));
});

test("editor-only bindings remain in lineage but are excluded from Provider Prompt numbering and capacity", () => {
  const providerBinding = binding();
  const editorOnly = {
    ...binding(),
    assetId: "asset-editor-only",
    versionId: "asset-editor-only-v1",
    mediaId: "media-editor-only",
    displayName: "导演台标注控制图",
    promptAlias: "导演台标注图",
    providerIndex: 2,
    providerEligible: false
  };
  const envelope = compileCinematicPrompt({
    generationUnit: unit({
      generationParameters: parameters({ referenceMediaIds: [providerBinding.mediaId] })
    }),
    referenceBindings: [providerBinding, editorOnly],
    shots: [shot()],
    storyPacket: story(),
    visualBible: bible()
  });
  assert.equal(envelope.referenceBindings.length, 2);
  assert.match(envelope.compiledContentPrompt, /（参考图1）=/u);
  assert.doesNotMatch(envelope.compiledContentPrompt, /参考图2/u);
  assert.doesNotMatch(envelope.compiledContentPrompt, /导演台标注图/u);
  assert.equal(envelope.directorPromptPolicy.providerAdapter.referenceCount, 1);
});

test("structured continuity state renders concise subject, topology, and exit anchors", () => {
  const envelope = compileCinematicPrompt({
    generationUnit: unit({
      continuitySource: { boundaryType: "initial" },
      executionGates: { requireContinuityStateAudit: true },
      executionGateEvidence: { continuityAudit: { ok: true, errors: [], checks: { structuredShots: 1 } } }
    }),
    referenceBindings: [binding()],
    shots: [shot("shot-1", 1, { continuityPlan: continuityPlan() })],
    storyPacket: story(),
    visualBible: bible()
  });
  assert.match(envelope.compiledContentPrompt, /角色甲位于床铺中央/u);
  assert.match(envelope.compiledContentPrompt, /床铺至摄影机轴：床铺中央 → 镜头后的朋友/u);
  assert.match(envelope.compiledContentPrompt, /空间锚：白色床铺@画面中央/u);
  assert.match(envelope.compiledContentPrompt, /最终画面状态：角色甲@床铺中央·倒在床上自然大笑/u);
  assert.equal(envelope.lint.ok, true, JSON.stringify(envelope.lint.errors));
});

test("strict continuity gate projects Core audit failures into blocking Prompt lint", () => {
  const envelope = compileCinematicPrompt({
    generationUnit: unit({
      continuitySource: { boundaryType: "initial" },
      executionGates: { requireContinuityStateAudit: true },
      executionGateEvidence: { continuityAudit: { ok: false, errors: [{ code: "continuity_environment_missing", message: "酒桌凳群无因消失。" }] } }
    }),
    referenceBindings: [binding()],
    shots: [shot("shot-1", 1, { continuityPlan: continuityPlan() })],
    storyPacket: story(),
    visualBible: bible()
  });
  assert.equal(envelope.lint.errors.some((entry) => entry.code === "continuity_environment_missing"), true);
  assert.equal(envelope.requiresPreflight, true);
});

test("segmented units include only dialogue owned by their linked shots", () => {
  const firstLine = { speaker: "角色甲", text: "第一段锁定对白。" };
  const laterLine = { speaker: "角色甲", text: "终局锁定对白。" };
  const currentStory = story({ dialogue: [firstLine, laterLine], userLockedText: [firstLine.text, laterLine.text, "非对白全局锁定事实"] });
  const currentShot = shot("shot-1", 1, { dialogue: [firstLine] });
  const envelope = compileCinematicPrompt({
    generationUnit: unit(),
    referenceBindings: [binding()],
    shots: [currentShot],
    storyPacket: currentStory,
    visualBible: bible()
  });
  assert.match(envelope.compiledContentPrompt, /第一段锁定对白/u);
  assert.doesNotMatch(envelope.compiledContentPrompt, /终局锁定对白/u);
  assert.match(envelope.compiledContentPrompt, /非对白全局锁定事实/u);
  assert.equal(envelope.lint.ok, true, JSON.stringify(envelope.lint.errors));
});

test("generation-unit Prompt excludes whole-story facts, later causal beats, and future continuity state", () => {
  const currentStory = story({
    sourceFacts: ["开场事实", "终局鬼将碎裂"],
    lockedStoryFacts: ["未来才发生的断枪"],
    causalEventChain: ["开场发令", "中段受伤", "终局反杀"]
  });
  const currentBible = bible();
  currentBible.continuityLocks = ["镜头9才断枪", "终局五雷后地板蠕动"];
  const envelope = compileCinematicPrompt({
    generationUnit: unit({ narrativeTask: "只完成开场发令" }),
    referenceBindings: [binding()],
    shots: [shot("shot-1", 1, { actionChain: ["人物开口发令"] })],
    storyPacket: currentStory,
    visualBible: currentBible
  });
  assert.doesNotMatch(envelope.compiledContentPrompt, /【本生成单元目标】|只完成开场发令/u);
  assert.match(envelope.compiledContentPrompt, /【画面时间线】/u);
  assert.match(envelope.compiledContentPrompt, /人物开口发令/u);
  assert.doesNotMatch(envelope.compiledContentPrompt, /终局鬼将碎裂|未来才发生的断枪|中段受伤|终局反杀|镜头9才断枪|地板蠕动/u);
  assert.equal(envelope.lint.ok, true, JSON.stringify(envelope.lint.errors));
});

test("single-shot lint allows numbered continuity facts and negated style prohibitions", () => {
  const currentBible = bible();
  currentBible.continuityLocks = ["长枪只在镜头9折断；镜头10起始终是半截断枪"];
  currentBible.styleProhibitions = ["禁止模仿具体在世艺术家或具体动画IP"];
  const envelope = compileCinematicPrompt({
    generationUnit: unit(),
    referenceBindings: [binding()],
    shots: [shot()],
    storyPacket: story(),
    visualBible: currentBible
  });
  assert.equal(envelope.lint.errors.some((entry) => entry.code === "hidden_cut_in_single_shot"), false);
  assert.equal(envelope.lint.warnings.some((entry) => entry.code === "director_ip_style_risk"), false);
});

test("one generation request can contain three ordered artistic shots with explicit cut reasons", () => {
  const shots = [
    shot("shot-1", 1, { narrativeJob: "建立空间和人物目标", actionChain: ["人物进入房间并停下"] }),
    shot("shot-2", 2, { narrativeJob: "揭示桌上的证据", cutReason: "从人物视线切到其发现的证据", actionChain: ["视线落到桌面证据"] }),
    shot("shot-3", 3, { narrativeJob: "切回人物的克制反应", cutReason: "证据意义成立后切回表情承接", actionChain: ["人物吸气并压住反应"] })
  ];
  const multi = unit({
    strategy: "designed_multi_shot",
    shotLinks: [
      { shotId: "shot-1", order: 1 },
      { shotId: "shot-2", order: 2, cutReason: "从人物视线切到其发现的证据" },
      { shotId: "shot-3", order: 3, cutReason: "证据意义成立后切回表情承接" }
    ],
    visualAnchorPolicy: "NONE",
    generationParameters: parameters({ mode: "text_to_video", referenceMediaIds: [] })
  });
  const envelope = compileCinematicPrompt({ generationUnit: multi, referenceBindings: [], shots, storyPacket: story(), visualBible: bible() });
  assert.equal(envelope.protocolId, "ununu.video.multi-shot.v2");
  assert.match(envelope.compiledContentPrompt, /镜头1：0-/u);
  assert.match(envelope.compiledContentPrompt, /镜头2：/u);
  assert.match(envelope.compiledContentPrompt, /镜头3：/u);
  assert.match(envelope.compiledContentPrompt, /切镜依据：从人物视线切到其发现的证据/u);
  assert.match(envelope.compiledContentPrompt, /切镜依据：证据意义成立后切回表情承接/u);
  assert.deepEqual(envelope.directorPromptPolicy.promptMode, { code: "B", reason: "derived_high_complexity" });
  assert.deepEqual(envelope.directorPromptPolicy.providerAdapter.sourceTemplateCharacterRange, { min: 1900, max: 2000 });
  assert.equal(envelope.directorPromptPolicy.providerAdapter.textLengthPolicy, "provider_capability_bound_no_padding");
  assert.equal(envelope.directorPromptPolicy.providerAdapter.referenceLimit, 9);
  assert.equal(envelope.preflight.ok, true, JSON.stringify(envelope.preflight));
});

test("an explicit review compilation uses Director mode A without changing structured field coverage", () => {
  const envelope = compileCinematicPrompt({
    generationUnit: unit({ promptCompilationIntent: "review" }),
    referenceBindings: [binding()],
    shots: [shot()],
    storyPacket: story(),
    visualBible: bible()
  });
  assert.deepEqual(envelope.directorPromptPolicy.promptMode, { code: "A", reason: "explicit_review" });
  assert.deepEqual(Object.keys(envelope.directorPromptPolicy.fields), [
    "special_attention",
    "material_anchors",
    "continuity_declaration",
    "scene_anchor",
    "camera_track",
    "performance_track",
    "lighting_color_track",
    "sound_track",
    "hard_locks",
    "dialogue_timing",
    "end_state_handoff"
  ]);
});

test("hard cuts cannot use previous accepted tail, but continuous segments can", () => {
  assert.throws(() => compileCinematicPrompt({
    generationUnit: unit({ visualAnchorPolicy: "PREVIOUS_ACCEPTED_TAIL" }),
    referenceBindings: [binding()],
    shots: [shot()],
    storyPacket: story(),
    visualBible: bible()
  }), /PREVIOUS_ACCEPTED_TAIL/u);

  const continuousUnit = unit({
    strategy: "continuous_segment",
    visualAnchorPolicy: "PREVIOUS_ACCEPTED_TAIL",
    continuationHandoff: handoffPlan({ h1MediaId: "media-character" }),
    requiredCapabilities: ["first_frame", "native_audio"],
    generationParameters: parameters({
      mode: "first_frame",
      firstFrameMediaId: "media-character",
      referenceMediaIds: []
    })
  });
  const envelope = compileCinematicPrompt({ generationUnit: continuousUnit, referenceBindings: [binding()], shots: [shot()], storyPacket: story(), visualBible: bible() });
  assert.equal(envelope.protocolId, "ununu.video.continuous-segment.v2");
});

test("lint blocks synthetic subject labels and technical parameters in a manual Prompt", () => {
  const result = lintCinematicPrompt({
    compiledContentPrompt: "主体1看向镜头。总时长15秒，16:9，1080p。",
    generationParameters: parameters({ referenceMediaIds: [] }),
    generationUnit: unit({ visualAnchorPolicy: "NONE", generationParameters: parameters({ mode: "text_to_video", referenceMediaIds: [] }) }),
    referenceBindings: [],
    shots: [shot()],
    storyPacket: story({ lockedStoryFacts: [], dialogue: [], userLockedText: [] })
  });
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((entry) => entry.code === "synthetic_subject_label"), true);
  assert.equal(result.errors.some((entry) => entry.code === "global_duration_leak"), true);
  assert.equal(result.errors.some((entry) => entry.code === "aspect_ratio_leak"), true);
  assert.equal(result.errors.some((entry) => entry.code === "resolution_leak"), true);
});

test("structured Owner locks keep story facts while technical controls stay in parameters", () => {
  const envelope = compileCinematicPrompt({
    generationUnit: unit(),
    referenceBindings: [binding()],
    shots: [shot()],
    storyPacket: story({
      userLockedText: ["目标时长 120 秒，画幅 9:16；八个男女第一天入住无名公寓；角色身份使用锁定虚拟人物 ID。"]
    }),
    visualBible: bible()
  });
  assert.match(envelope.compiledContentPrompt, /八个男女第一天入住无名公寓/u);
  assert.match(envelope.compiledContentPrompt, /角色身份使用锁定虚拟人物 ID/u);
  assert.doesNotMatch(envelope.compiledContentPrompt, /9\s*:\s*16/u);
  assert.equal(envelope.lint.errors.some((entry) => entry.code === "aspect_ratio_leak"), false);
  assert.equal(envelope.lint.errors.some((entry) => entry.code === "locked_story_loss"), false);
});

test("camera distance to a named subject is not mistaken for a synthetic subject label", () => {
  const result = lintCinematicPrompt({
    compiledContentPrompt: "顾沉位于入口侧，摄影机距主体2.5米，随后贴肩跟进。",
    generationParameters: parameters({ referenceMediaIds: [] }),
    generationUnit: unit({ visualAnchorPolicy: "NONE", generationParameters: parameters({ mode: "text_to_video", referenceMediaIds: [] }) }),
    referenceBindings: [],
    shots: [shot()],
    storyPacket: story({ lockedStoryFacts: [], dialogue: [], userLockedText: [] })
  });
  assert.equal(result.errors.some((entry) => entry.code === "synthetic_subject_label"), false);
});

test("manual lint blocks unbound images, CLI args, hidden cuts, and camera contradictions", () => {
  const result = lintCinematicPrompt({
    compiledContentPrompt: "[图片]中的角色保持不动 --style raw。摄影机全程固定，随后摄影机缓慢推进并切到第二镜。",
    generationParameters: parameters({ referenceMediaIds: [] }),
    generationUnit: unit({ visualAnchorPolicy: "NONE", generationParameters: parameters({ mode: "text_to_video", referenceMediaIds: [] }) }),
    referenceBindings: [], shots: [shot()], storyPacket: story({ lockedStoryFacts: [], dialogue: [], userLockedText: [] })
  });
  for (const code of ["unbound_image_reference", "cli_argument_leak", "camera_motion_conflict", "hidden_cut_in_single_shot"]) {
    assert.equal(result.errors.some((entry) => entry.code === code), true, code);
  }
});

test("internal absolute time slots are blocked unless the exact model profile supports them", () => {
  const result = lintCinematicPrompt({
    compiledContentPrompt: "0秒-2秒：人物停顿。2秒-4秒：人物转身。",
    generationParameters: parameters({ provider: "openrouter", model: "x-ai/grok-imagine-video", mode: "text_to_video", resolution: "720p", referenceMediaIds: [] }),
    generationUnit: unit({ generationParameters: parameters({ provider: "openrouter", model: "x-ai/grok-imagine-video", mode: "text_to_video", resolution: "720p", referenceMediaIds: [] }) }),
    referenceBindings: [], shots: [shot()], storyPacket: story({ lockedStoryFacts: [], dialogue: [], userLockedText: [] })
  });
  assert.equal(result.errors.some((entry) => entry.code === "unsupported_prompt_time_slots"), true);
});

test("compiler emits internal time slots only for a supporting model and uses the controlled cinematic lexicon", () => {
  const timedShot = shot("shot-1", 1, { internalTimeSlots: [{ startSeconds: 0, endSeconds: 2, action: "保持严肃" }] });
  const supported = compileCinematicPrompt({ generationUnit: unit(), referenceBindings: [binding()], shots: [timedShot], storyPacket: story(), visualBible: bible() });
  assert.match(supported.compiledContentPrompt, /0秒-2秒：保持严肃/u);
  assert.match(supported.compiledContentPrompt, /景别：/u);
  assert.equal(supported.languageAdaptation.promptTimeSlotsEmitted, true);
  const unsupported = compileCinematicPrompt({
    generationUnit: unit({ requiredCapabilities: [], generationParameters: parameters({ provider: "openrouter", model: "x-ai/grok-imagine-video", mode: "text_to_video", duration: 10, resolution: "720p", generateAudio: false, referenceMediaIds: [] }) }),
    referenceBindings: [], shots: [timedShot], storyPacket: story(), visualBible: bible()
  });
  assert.doesNotMatch(unsupported.compiledContentPrompt, /0秒-2秒/u);
  assert.equal(unsupported.languageAdaptation.promptTimeSlotsEmitted, false);
});

test("semantic byte compression drops low-priority local negatives but preserves locked story", () => {
  const verboseBible = { ...bible(), productionDesign: Object.fromEntries(Array.from({ length: 100 }, (_, index) => [`装饰${index}`, `很长的非关键风格说明${index}`.repeat(8)])) };
  const envelope = compileCinematicPrompt({
    generationUnit: unit({ highRiskNegatives: Array.from({ length: 100 }, (_, index) => `非关键风险说明${index}`.repeat(10)), requiredCapabilities: [], generationParameters: parameters({ provider: "openrouter", model: "x-ai/grok-imagine-video", mode: "text_to_video", duration: 10, resolution: "720p", generateAudio: false, referenceMediaIds: [] }) }),
    referenceBindings: [], shots: [shot()], storyPacket: story(), visualBible: verboseBible
  });
  assert.ok(envelope.droppedFragments.length > 0);
  assert.ok(envelope.lint.bytes <= 4096);
  for (const line of story().dialogue) assert.match(envelope.compiledContentPrompt, new RegExp(line.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "u"));
});

test("hype stacks, absolute identity promises, and named style imitation are review warnings", () => {
  const result = lintCinematicPrompt({
    compiledContentPrompt: "绝对保持人物面孔一致，电影级、大师级、顶级高级感，模仿某著名导演。",
    generationParameters: parameters({ referenceMediaIds: [] }), generationUnit: unit({ generationParameters: parameters({ mode: "text_to_video", referenceMediaIds: [] }) }),
    referenceBindings: [], shots: [shot()], storyPacket: story({ lockedStoryFacts: [], dialogue: [], userLockedText: [] })
  });
  for (const code of ["absolute_identity_promise", "hype_adjective_stack", "director_ip_style_risk"]) assert.equal(result.warnings.some((entry) => entry.code === code), true, code);
});

test("abstract cinematic labels compile into deterministic concrete video clauses and source pointers", () => {
  const concreteShot = shot("shot-1", 1, {
    abstractIntentLabels: ["电影感", "高级"],
    cinematography: {
      ...shot().cinematography,
      focalLength: "35mm 等效焦段",
      aperture: "T2.8",
      composition: "人物位于右侧三分线，门框形成前中后景层次",
      speedCurve: "固定机位，速度为零",
      startPoint: "床尾正前方",
      stopPoint: "床尾正前方"
    }
  });
  const result = compileCinematicPrompt({
    generationUnit: unit(),
    referenceBindings: [binding()],
    shots: [concreteShot],
    storyPacket: story(),
    visualBible: bible()
  });
  assert.equal(result.directorPromptPolicy.abstractIntent.ok, true, JSON.stringify(result.directorPromptPolicy.abstractIntent));
  assert.deepEqual(result.directorPromptPolicy.abstractIntent.labels, ["电影感", "高级"]);
  assert.equal(result.directorPromptPolicy.promptMode.code, "C");
  assert.match(result.compiledContentPrompt, /【抽象意图具体化】/u);
  assert.match(result.compiledContentPrompt, /焦段、光圈与焦点：[^。]*T2\.8/u);
  assert.match(result.compiledContentPrompt, /光向、明暗比、色温与曝光/u);
  assert.doesNotMatch(result.compiledContentPrompt, /电影感|高级感/u);
  assert.equal(
    result.directorPromptPolicy.abstractIntent.clauses.some((entry) =>
      entry.facet === "aperture" && entry.sourcePath === "shots[0].cinematography.aperture"),
    true
  );
  assert.equal(Object.keys(result.directorPromptPolicy.fields).length, 11);
});

test("abstract cinematic labels without complete structured support block lint and preflight", () => {
  const result = compileCinematicPrompt({
    generationUnit: unit(),
    referenceBindings: [binding()],
    shots: [shot("shot-1", 1, {
      abstractIntentLabels: ["悬疑"],
      cinematography: { shotSize: "中景", movementPath: "缓慢推近" },
      lighting: {},
      sound: {}
    })],
    storyPacket: story(),
    visualBible: { ...bible(), productionDesign: {}, lighting: {}, sound: {}, styleProhibitions: [] }
  });
  assert.equal(result.lint.errors.some((entry) => entry.code === "abstract_cinematic_intent_unresolved"), true);
  assert.equal(result.preflight.errors.some((entry) => entry.code === "abstract_cinematic_intent_unresolved"), true);
  assert.equal(result.promptDraft.status, "preflight_blocked");
});

test("unverified model capabilities produce an explicit blocking degradation", () => {
  const envelope = compileCinematicPrompt({
    generationUnit: unit({
      visualAnchorPolicy: "NONE",
      requiredCapabilities: [],
      generationParameters: parameters({
        provider: "openrouter",
        model: "alibaba/happyhorse-1.1",
        mode: "text_to_video",
        duration: 10,
        resolution: "1080p",
        generateAudio: true,
        referenceMediaIds: []
      })
    }),
    referenceBindings: [],
    shots: [shot()],
    storyPacket: story(),
    visualBible: bible()
  });
  assert.equal(envelope.preflight.ok, false);
  assert.equal(envelope.capabilityDegradation.some((entry) => entry.code === "unverified_native_audio"), true);
  assert.equal(envelope.requiresPreflight, true);
});

test("industrial execution gates veto missing signoff, blocking, camera, time, director capture, and keyframe", () => {
  const envelope = compileCinematicPrompt({
    generationUnit: unit({
      executionGates: {
        requireExplicitCinematography: true,
        requireExplicitBlocking: true,
        requireTimePlan: true,
        requireTemporalMotionPlan: true,
        requireDirectorStageBinding: true,
        requireKeyframeReference: true,
        rejectGlobalNarrativeJobReuse: true,
        requiredProfessionalRoles: ["director-story", "cinematography", "continuity-qa"]
      },
      executionGateEvidence: { professionalRoles: ["director-story"] }
    }),
    referenceBindings: [binding()],
    shots: [shot("shot-1", 1, { narrativeJob: story().scenePurpose })],
    storyPacket: story(),
    visualBible: bible()
  });
  const codes = new Set(envelope.lint.errors.map((entry) => entry.code));
  for (const code of [
    "cinematography_execution_contract_incomplete",
    "blocking_execution_contract_incomplete",
    "shot_time_plan_required",
    "temporal_motion_plan_required",
    "director_stage_binding_required",
    "accepted_keyframe_required",
    "professional_signoff_required",
    "global_narrative_job_reused"
  ]) assert.equal(codes.has(code), true, code);
  assert.equal(envelope.lint.ok, false);
});

test("industrial execution gates reject stale, doc-only, manifest-free professional advice", () => {
  const envelope = compileCinematicPrompt({
    generationUnit: unit({
      executionGates: {
        requiredProfessionalRoles: ["director-story", "cinematography", "continuity-qa"],
        requireCurrentArtifactSignoff: true,
        requireKnowledgeGroundedSignoff: true,
        requireManifestBoundSignoff: true,
        requireTeamManifest: true
      },
      executionGateEvidence: {
        professionalRoles: ["director-story", "cinematography", "continuity-qa"],
        currentProfessionalRoles: ["director-story"],
        knowledgeGroundedProfessionalRoles: [],
        manifestBoundProfessionalRoles: []
      }
    }),
    referenceBindings: [binding()],
    shots: [shot()],
    storyPacket: story(),
    visualBible: bible(),
    teamManifestIds: []
  });
  const codes = new Set(envelope.lint.errors.map((entry) => entry.code));
  for (const code of [
    "professional_signoff_target_stale",
    "professional_signoff_knowledge_required",
    "professional_signoff_manifest_mismatch",
    "team_manifest_required"
  ]) assert.equal(codes.has(code), true, code);
});

test("multi-shot execution gate requires one accepted keyframe binding per artistic shot", () => {
  const first = shot("shot-1", 1);
  const second = shot("shot-2", 2, { cutReason: "动作落点后切到反应" });
  const multi = unit({
    strategy: "designed_multi_shot",
    shotLinks: [{ shotId: first.shotId, order: 1 }, { shotId: second.shotId, order: 2, cutReason: second.cutReason }],
    executionGates: { requireKeyframeReference: true }
  });
  const result = compileCinematicPrompt({
    generationUnit: multi,
    referenceBindings: [{ ...binding(), role: "shot_keyframe", shotId: first.shotId }],
    shots: [first, second],
    storyPacket: story(),
    visualBible: bible()
  });
  assert.equal(result.lint.errors.some((entry) => entry.code === "accepted_shot_keyframe_required" && entry.message.includes(second.shotId)), true);
});

test("a directly continuous segment cannot be paid before an accepted tail frame and spatial handoff are verified", () => {
  const result = compileCinematicPrompt({
    generationUnit: unit({
      strategy: "continuous_segment",
      visualAnchorPolicy: "PREVIOUS_ACCEPTED_TAIL",
      continuationHandoff: handoffPlan(),
      generationParameters: parameters({
        mode: "first_frame",
        firstFrameMediaId: "media-tail",
        referenceMediaIds: []
      }),
      executionGates: { requireAuthoritativeTailHandoff: true },
      executionGateEvidence: {
        authoritativeTailHandoff: {
          sourceEvaluationId: "evaluation-p01a",
          sourceDecision: "ACCEPT",
          mediaId: "media-tail",
          sourceMediaVerified: true,
          spatialContinuityVerified: false,
          subjectStateVerified: true,
          screenDirectionVerified: true
        }
      }
    }),
    referenceBindings: [binding({
      mediaId: "media-tail",
      role: "continuity_tail"
    })],
    shots: [shot()],
    storyPacket: story(),
    visualBible: bible()
  });
  assert.equal(result.lint.errors.some((entry) => entry.code === "authoritative_tail_continuity_unverified"), true);
  assert.equal(result.lint.ok, false);
});

test("production seam gate blocks a naked continuation in both lint and Provider preflight", () => {
  const result = compileCinematicPrompt({
    generationUnit: unit({
      segmentDecision: "continuation_segment",
      executionGates: { requireSegmentSeamDecision: true },
      executionGateEvidence: {
        segmentSeamAudit: {
          ok: false,
          errors: [{
            code: "segment_stable_tail_audit_required",
            message: "continuation segment lacks a latest stable ACCEPT H1"
          }]
        }
      }
    }),
    referenceBindings: [binding()],
    shots: [shot()],
    storyPacket: story(),
    visualBible: bible()
  });
  assert.equal(result.lint.errors.some((entry) => entry.code === "segment_stable_tail_audit_required"), true);
  assert.equal(result.preflight.errors.some((entry) => entry.code === "segment_stable_tail_audit_required"), true);
  assert.equal(result.promptDraft.status, "preflight_blocked");
});

test("an accepted tail frame with verified subject position, axis, and screen direction passes the continuity handoff gate", () => {
  const result = compileCinematicPrompt({
    generationUnit: unit({
      strategy: "continuous_segment",
      visualAnchorPolicy: "PREVIOUS_ACCEPTED_TAIL",
      continuationHandoff: handoffPlan(),
      generationParameters: parameters({
        mode: "first_frame",
        firstFrameMediaId: "media-tail",
        referenceMediaIds: []
      }),
      executionGates: { requireAuthoritativeTailHandoff: true },
      executionGateEvidence: {
        authoritativeTailHandoff: {
          sourceEvaluationId: "evaluation-p01a",
          sourceDecision: "ACCEPT",
          mediaId: "media-tail",
          sourceMediaVerified: true,
          spatialContinuityVerified: true,
          subjectStateVerified: true,
          screenDirectionVerified: true
        }
      }
    }),
    referenceBindings: [binding({
      mediaId: "media-tail",
      role: "continuity_tail"
    })],
    shots: [shot()],
    storyPacket: story(),
    visualBible: bible()
  });
  assert.equal(result.lint.errors.some((entry) => entry.code.startsWith("authoritative_tail_")), false);
  assert.equal(result.lint.ok, true, JSON.stringify(result.lint.errors));
});

test("overlap handoff renders the tested H0→H1 repeat-and-trim method without leaking internal media IDs", () => {
  const duplicatePlan = handoffPlan({
    mode: "DUPLICATE_HANDOFF",
    h0MediaId: "media-h0",
    h1MediaId: "media-h1",
    h0ToH1Action: "从拔刀起势到刀锋穿过前景",
    repeatedAction: "先复现 H0→H1 的拔刀动作",
    newContentAfterH1: "刀锋离开前景后角色继续向右突进",
    trimPlan: "删除下一段开头复现的 H0→H1 重叠区"
  });
  const result = compileCinematicPrompt({
    generationUnit: unit({
      strategy: "continuous_segment",
      visualAnchorPolicy: "DUPLICATE_HANDOFF",
      continuationHandoff: duplicatePlan,
      generationParameters: parameters({ mode: "image_reference", referenceMediaIds: ["media-h0", "media-h1"] }),
      executionGates: { requireAuthoritativeTailHandoff: true, requireMotionHandoffPlan: true },
      executionGateEvidence: { authoritativeTailHandoff: {
        sourceEvaluationId: "evaluation-accepted",
        sourceDecision: "ACCEPT",
        mediaId: "media-h1",
        sourceMediaVerified: true,
        duplicateFramesVerified: true,
        spatialContinuityVerified: true,
        subjectStateVerified: true,
        screenDirectionVerified: true,
        cameraStateVerified: true,
        lensFocusExposureVerified: true,
        motionPhaseVerified: true,
        overlapHandleVerified: true,
        ambientAudioContinuityVerified: true
      } }
    }),
    referenceBindings: [
      binding({ assetId: "asset-h0", versionId: "version-h0", mediaId: "media-h0", providerIndex: 1, role: "handoff_h0" }),
      binding({ assetId: "asset-h1", versionId: "version-h1", mediaId: "media-h1", providerIndex: 2, role: "handoff_h1" })
    ],
    shots: [shot()],
    storyPacket: story(),
    visualBible: bible()
  });
  assert.equal(result.lint.errors.some((entry) => entry.code.includes("handoff")), false, JSON.stringify(result.lint.errors));
  assert.match(result.compiledContentPrompt, /先复现同一上一段的 H0→H1 动作/u);
  assert.match(result.compiledContentPrompt, /不使用固定秒数/u);
  assert.match(result.compiledContentPrompt, /人物站位、道具、光线、动作相位、银幕方向/u);
  assert.doesNotMatch(result.compiledContentPrompt, /media-h[01]/u);
});

test("hybrid image plus text compilation separates static facts, corrections, hidden completion, and motion", () => {
  const semanticBinding = binding({
    semanticControl: {
      temporalRole: "static_state",
      preserve: ["人物身份", "人物与桌席初始站位"],
      replace: [{ observed: "现代桌", target: "古代客栈木桌" }],
      complete: [{ missing: "被前景遮挡的厅堂", target: "补出坐在桌前的更多尸傀" }],
      ignore: ["现代器物"],
      styleOnly: []
    }
  });
  const result = compileCinematicPrompt({
    generationUnit: unit({
      executionGates: { requireGenerationControlIntent: true, requireReferenceSemanticControl: true },
      controlIntent: {
        primaryConsistency: "balanced",
        cameraFreedom: "limited",
        motionComplexity: "medium",
        modeRationale: "图片仅提供身份与初始空间，文字负责修正场景并定义动态。",
        invariants: ["人物身份不变", "空间轴线不变"],
        permittedChanges: ["现代桌替换为古代桌"],
        dynamicControl: {
          source: "text_motion_contract",
          subjectTrajectories: "人物保持原站位，仅沿画面右侧倒下。",
          actionPhases: "克制、嘴角失控、倒下。",
          timing: "第三句后才进入倒下动作。",
          cameraTrajectory: "摄影机固定。",
          physicsContinuity: "身体与床品持续接触，重心自然转移。",
          endState: "人物倒在床上继续笑。"
        }
      }
    }),
    referenceBindings: [semanticBinding],
    shots: [shot()],
    storyPacket: story(),
    visualBible: bible()
  });
  assert.equal(result.preflight.modeControl.ok, true, JSON.stringify(result.preflight.modeControl.errors));
  assert.match(result.compiledContentPrompt, /参考图1必须保留：人物身份；人物与桌席初始站位/u);
  assert.match(result.compiledContentPrompt, /现代桌 → 古代客栈木桌/u);
  assert.match(result.compiledContentPrompt, /被前景遮挡的厅堂 → 补出坐在桌前的更多尸傀/u);
  assert.match(result.compiledContentPrompt, /静态参考不提供运动/u);
  assert.match(result.compiledContentPrompt, /主体轨迹：人物保持原站位/u);
});

test("orbit intent is blocked until the shot binds an explicit camera path", () => {
  const result = compileCinematicPrompt({
    generationUnit: unit(),
    referenceBindings: [binding()],
    shots: [shot("shot-1", 1, { cinematography: { ...shot().cinematography, movementPath: "摄影机顺时针环绕角色九十度" } })],
    storyPacket: story(),
    visualBible: bible()
  });
  assert.equal(result.lint.ok, false);
  assert.equal(result.preflight.ok, false);
  assert.equal(result.requiresPreflight, true);
  assert.equal(result.lint.errors.some((entry) => entry.code === "structured_camera_trajectory_required"), true);
});

test("a prohibition against orbiting does not demand an orbit path", () => {
  const result = compileCinematicPrompt({
    generationUnit: unit(),
    referenceBindings: [binding()],
    shots: [shot("shot-1", 1, { cinematography: { ...shot().cinematography, movementPath: "摄影机固定，不环绕、不越轴" } })],
    storyPacket: story(),
    visualBible: bible()
  });
  assert.equal(result.lint.errors.some((entry) => entry.code === "structured_camera_trajectory_required"), false);
  assert.equal(result.cameraTrajectory.ok, true);
});

test("structured orbit compiles geometry while editor route IDs and arrows stay out of generated pixels", () => {
  const result = compileCinematicPrompt({
    generationUnit: unit(),
    referenceBindings: [binding()],
    shots: [shot("shot-1", 1, {
      cinematography: { ...shot().cinematography, movementPath: "摄影机顺时针环绕角色九十度" },
      orbitCameraTrajectory: orbitTrajectory()
    })],
    storyPacket: story(),
    visualBible: bible()
  });
  assert.equal(result.cameraTrajectory.ok, true, JSON.stringify(result.cameraTrajectory.errors));
  assert.equal(result.preflight.ok, true, JSON.stringify(result.preflight.errors));
  assert.match(result.compiledContentPrompt, /以角色甲胸骨中心的竖直轴为唯一轴心/u);
  assert.match(result.compiledContentPrompt, /从场景正上方俯视为顺时针沿连续圆弧运动 90°/u);
  assert.match(result.compiledContentPrompt, /控制图形只保留在导演台 editor_only 图层/u);
  assert.doesNotMatch(result.compiledContentPrompt, /director-route-orbit-1|capture-clean-(?:start|mid|end)/u);
});

test("uncontracted camera overlays cannot be used as generation-reference pixels", () => {
  const validation = validateOrbitCameraTrajectory(orbitTrajectory({ overlayPolicy: "burned_into_reference" }));
  assert.equal(validation.ok, false);
  assert.equal(validation.issues.some((entry) => entry.code === "unsafe_overlay"), true);
});

test("an annotated image reference and its prompt are compiled from one geometry-and-time contract", () => {
  const plan = cameraTrajectoryPlan({ overlayPolicy: "provider_reference_only", annotationReference: annotatedCameraReference() });
  const guide = binding({
    assetId: "asset-camera-guide", versionId: "camera-guide-v1", mediaId: "media-camera-guide", providerIndex: 2,
    displayName: "完整场景运镜标注图", role: "camera_motion_guide",
    controls: ["PATH_A推进路径", "R1局部定位", "0至4秒时间窗"], doesNotControl: ["人物身份", "场景最终像素"]
  });
  const result = compileCinematicPrompt({
    generationUnit: unit({ generationParameters: parameters({ referenceMediaIds: ["media-character", "media-camera-guide"] }) }),
    referenceBindings: [binding(), guide], storyPacket: story(), visualBible: bible(),
    shots: [shot("shot-1", 1, { cinematography: { ...shot().cinematography, movementPath: "先推近，再下摇放大右手局部" }, cameraTrajectoryPlan: plan })]
  });
  assert.equal(result.cameraTrajectory.ok, true, JSON.stringify(result.cameraTrajectory.errors));
  assert.equal(result.preflight.ok, true, JSON.stringify(result.preflight.errors));
  assert.match(result.compiledContentPrompt, /PATH_A（摄影机推进路径，0–2秒）/u);
  assert.match(result.compiledContentPrompt, /R1（角色右手道具所在局部，2–4秒）/u);
  assert.match(result.compiledContentPrompt, /圆圈、线条、箭头和标签都不是场景物体/u);
  assert.doesNotMatch(result.compiledContentPrompt, /media-camera-guide|director-compound-guide-1/u);
});

test("annotated-reference geometry, timing, mode and binding conflicts block before provider dispatch", () => {
  const geometryConflict = validateCameraTrajectoryPlan(cameraTrajectoryPlan({
    overlayPolicy: "provider_reference_only",
    annotationReference: annotatedCameraReference({ controlGeometryId: "different-geometry" })
  }));
  assert.equal(geometryConflict.issues.some((entry) => entry.code === "annotation_prompt_conflict"), true);
  const timingConflict = validateCameraTrajectoryPlan(cameraTrajectoryPlan({
    overlayPolicy: "provider_reference_only",
    annotationReference: annotatedCameraReference({ annotations: [{ annotationId: "R1", kind: "region", meaning: "局部", instruction: "镜头结束后才放大", startSeconds: 4, endSeconds: 6 }] })
  }));
  assert.equal(timingConflict.issues.some((entry) => entry.path.endsWith("endSeconds")), true);
  const plan = cameraTrajectoryPlan({ overlayPolicy: "provider_reference_only", annotationReference: annotatedCameraReference() });
  const audit = evaluateStructuredCameraTrajectories({
    generationUnit: unit({ generationParameters: parameters({ mode: "first_frame", firstFrameMediaId: "media-character", referenceMediaIds: [] }) }),
    referenceBindings: [binding()],
    shots: [shot("shot-1", 1, { cameraTrajectoryPlan: plan })]
  });
  assert.equal(audit.errors.some((entry) => entry.code === "camera_annotated_reference_mode_conflict"), true);
  assert.equal(audit.errors.some((entry) => entry.code === "camera_annotated_reference_binding_required"), true);
});

test("push, tilt and follow movements also require control geometry, not only orbit shots", () => {
  const blocked = compileCinematicPrompt({
    generationUnit: unit(), referenceBindings: [binding()], storyPacket: story(), visualBible: bible(),
    shots: [shot("shot-1", 1, { cinematography: { ...shot().cinematography, movementPath: "先推近人物，再下摇跟随右手道具" } })]
  });
  assert.equal(blocked.cameraTrajectory.ok, false);
  assert.equal(blocked.preflight.errors.some((entry) => entry.code === "structured_camera_trajectory_required"), true);

  const ready = compileCinematicPrompt({
    generationUnit: unit(), referenceBindings: [binding()], storyPacket: story(), visualBible: bible(),
    shots: [shot("shot-1", 1, { cinematography: { ...shot().cinematography, movementPath: "先推近人物，再下摇跟随右手道具" }, cameraTrajectoryPlan: cameraTrajectoryPlan() })]
  });
  assert.equal(ready.cameraTrajectory.ok, true, JSON.stringify(ready.cameraTrajectory.errors));
  assert.match(ready.compiledContentPrompt, /结构化摄影机轨迹/u);
  assert.match(ready.compiledContentPrompt, /路径=先沿世界纵深轴直线推近两米/u);
  assert.doesNotMatch(ready.compiledContentPrompt, /director-compound-guide-1|clean-(?:start|mid|end)/u);
});

test("guide type must match the kind of camera control", () => {
  const validation = validateCameraTrajectoryPlan(cameraTrajectoryPlan({ movementType: "zoom", guideType: "path_curve" }));
  assert.equal(validation.ok, false);
  assert.equal(validation.issues.some((entry) => entry.code === "guide_type_mismatch"), true);
});

test("a focus pull is blocked without an endpoint-complete focus-distance time curve", () => {
  const missing = validateCameraTrajectoryPlan(cameraTrajectoryPlan({ focusDistancePlan: undefined }));
  assert.equal(missing.issues.some((entry) => entry.code === "focus_distance_plan_required"), true);
  const mismatched = validateCameraTrajectoryPlan(cameraTrajectoryPlan({
    focusDistancePlan: [
      { atSeconds: 0, focusDistanceMeters: 4, target: "角色双眼", interpolation: "linear" },
      { atSeconds: 4, focusDistanceMeters: 1, target: "右手道具", interpolation: "hold" }
    ]
  }));
  assert.equal(mismatched.issues.some((entry) => entry.code === "focus_state_mismatch"), true);
});
