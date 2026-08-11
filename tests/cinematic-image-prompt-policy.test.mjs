import assert from "node:assert/strict";
import test from "node:test";
import {
  CINEMATIC_STATIC_PROMPT_COVERAGE_FIELDS,
  compileCharacterAuthorityPrompt,
  compilePropAuthorityPrompt,
  compileSceneAuthorityPrompt,
  compileStoryboardPrompt,
  lintCinematicImagePrompt,
  routeAssetAuthorityRisk
} from "../packages/contracts/src/index.mjs";

const promptCoverage = {
  ...Object.fromEntries(CINEMATIC_STATIC_PROMPT_COVERAGE_FIELDS.map((field) => [field, `${field} 的可观察事实`])),
  escapeRoutes: ["未约束比例可能被模型放大"],
  counterexampleClosures: []
};

const imageParameters = { provider: "ununu", model: "openai/gpt-image-2", aspectRatio: "3:2", resolution: "1536x1024", background: "opaque", count: 1, referenceMediaIds: [] };
const view = { viewId: "front", label: "正面", framing: "半身", angle: "正面平视", description: "自然站姿", background: "中性灰", controls: ["人物身份"], doesNotControl: ["最终场景"], required: true };
const authority = {
  authorityId: "character-1", authorityType: "character", displayName: "角色甲", riskLevel: "high", status: "candidate",
  identityDescription: "年轻男性，黑色短发，清晰自然五官", identityLocks: ["面孔", "年龄感", "体型"], wardrobeMakeupHair: { hair: "黑色短发", wardrobe: "当前版本服装" },
  viewSpecs: [view], referenceAssetIds: [], acceptanceCriteria: ["不同视图身份一致"], prohibitedChanges: ["虚构第二个人"], revision: 1
};
const bible = {
  visualBibleId: "bible-1", cinematography: { format: "日本二维动画电影", rendering: "手绘线稿、赛璐璐分层明暗" }, lighting: {}, color: { palette: "暖红与旧木褐" }, productionDesign: {}, characterLook: {}, performance: {}, sound: {}, vfx: {},
  continuityLocks: ["轴线连续"], visualMotifs: ["门框形成心理边界"], colorArc: {}, spatialDramaturgy: {}, propSemantics: {}, costumeNarrative: {}, materialAging: {}, culturalResearchRefs: [], styleProhibitions: ["禁止真人摄影质感", "禁止3D塑料人偶质感"], revision: 1
};
const shot = {
  shotId: "shot-1", order: 1, narrativeJob: "建立等待", storyBeat: "等待", openingState: "人物背对入口", trigger: "听见脚步", actionChain: ["停顿", "转身"], endingState: "看向入口",
  blocking: {}, cinematography: {}, lighting: {}, color: {}, performance: {}, sound: {}, physicsVfx: {}, editContinuity: {}, dialogue: [], requiredAssetIds: [], mustNotAppearYet: [], acceptanceCriteria: ["转身时机准确"], revision: 1
};

test("character authority compiles a named, parameter-separated image Prompt", () => {
  const result = compileCharacterAuthorityPrompt({ authority, visualBible: bible, generationParameters: imageParameters, referenceBindings: [] });
  assert.equal(result.protocolId, "ununu.character.v2");
  assert.match(result.compiledContentPrompt, /角色甲/u);
  assert.doesNotMatch(result.compiledContentPrompt, /3\s*:\s*2|1536x1024|openai\/gpt-image-2/u);
  assert.equal(result.lint.ok, true, JSON.stringify(result.lint));
  assert.equal(result.authorityBoard.boardId, "identity-master");
  assert.match(result.compiledContentPrompt, /完整头肩特写/u);
  assert.match(result.compiledContentPrompt, /2×3 六个等尺寸面板/u);
  assert.match(result.compiledContentPrompt, /日本二维动画电影/u);
  assert.match(result.compiledContentPrompt, /不得真人摄影质感/u);
  assert.match(result.compiledContentPrompt, /双手自然放松且不持物/u);
  assert.match(result.compiledContentPrompt, /独立道具、表演、技能或伤势板件/u);
  assert.equal(result.sourceVersions.visualBibleRevision, 1);
});

test("image compiler projects abstract intent only through static concrete clauses", () => {
  const abstractAuthority = { ...authority, abstractIntentLabels: ["精美", "悬疑"] };
  const concreteBible = {
    ...bible,
    cinematography: {
      ...bible.cinematography,
      lensPreference: "50mm 等效焦段",
      aperture: "T4",
      focus: "焦点锁定双眼，背景轻微虚化",
      cameraPlacement: "与人物双眼等高的正面机位",
      composition: "头肩像位于中央，背景保持两层景深"
    },
    productionDesign: { architecture: "旧公寓狭窄玄关", materials: "磨砂墙漆、氧化黄铜门牌、旧木门" },
    lighting: {
      direction: "门外右后方侧逆光",
      contrast: "4:1 明暗比",
      colorTemperature: "室外4300K、室内3200K",
      exposureProtection: "皮肤高光低于剪切阈值"
    }
  };
  const result = compileCharacterAuthorityPrompt({
    authority: abstractAuthority,
    visualBible: concreteBible,
    generationParameters: imageParameters,
    referenceBindings: []
  });
  assert.equal(result.abstractIntentResolution.target, "image");
  assert.equal(result.abstractIntentResolution.ok, true, JSON.stringify(result.abstractIntentResolution));
  assert.match(result.compiledContentPrompt, /【抽象意图具体化】/u);
  assert.match(result.compiledContentPrompt, /材质与生产设计：[^。]*氧化黄铜门牌/u);
  assert.match(result.compiledContentPrompt, /焦段、光圈与焦点：[^。]*T4/u);
  assert.equal(result.abstractIntentResolution.requiredFacets.includes("performance"), false);
  assert.equal(result.abstractIntentResolution.requiredFacets.includes("sound"), false);
  assert.doesNotMatch(result.compiledContentPrompt, /精美|悬疑感/u);
});

test("image compiler blocks an abstract label that has no measurable static support", () => {
  const result = compileCharacterAuthorityPrompt({
    authority: { ...authority, abstractIntentLabels: ["高级感"] },
    visualBible: bible,
    generationParameters: imageParameters,
    referenceBindings: []
  });
  assert.equal(result.lint.ok, false);
  assert.equal(result.lint.errors.some((entry) => entry.code === "abstract_cinematic_intent_unresolved"), true);
  assert.equal(result.requiresPreflight, true);
});

test("an authority board that requires Prompt coverage cannot reach paid preflight with a missing domain", () => {
  const covered = {
    ...authority,
    boardSpecs: [{
      boardId: "identity-master", boardType: "identity", label: "身份母版", purpose: "锁定身份",
      viewSpecIds: ["front"], referencePolicy: "none", acceptanceCriteria: ["身份清楚"], prohibitedChanges: ["第二身份"], required: true,
      requirePromptCoverage: true, promptCoverage: { ...promptCoverage, topologyAttachments: "" }
    }]
  };
  assert.throws(
    () => compileCharacterAuthorityPrompt({ authority: covered, visualBible: bible, generationParameters: imageParameters, referenceBindings: [] }),
    (error) => error.code === "invalid_cinematic_contract"
  );
});

test("annotated control boards allow only contract-bound marks and remain non-authoritative", () => {
  const annotated = {
    ...authority,
    acceptanceCriteria: [...authority.acceptanceCriteria, "无文字、标签或箭头"],
    prohibitedChanges: [...authority.prohibitedChanges, "任何文字、标签或箭头"],
    boardSpecs: [{
      boardId: "profile-control", boardType: "anatomy_control", label: "侧面标注控制板", purpose: "用标记锁定方向与单头拓扑",
      viewSpecIds: ["front"], referencePolicy: "none", pixelMode: "annotated_control",
      annotationInstructions: ["A 标记单一头颅外轮廓", "B 画出头颅底面中央颈部轴线", "C 圈住无脸前部", "D 圈住枕骨浅浮雕脸"],
      acceptanceCriteria: ["标记与结构一致"], prohibitedChanges: ["把标记带入干净资产"], required: true
    }]
  };
  const result = compileCharacterAuthorityPrompt({ authority: annotated, boardId: "profile-control", visualBible: bible, generationParameters: imageParameters, referenceBindings: [] });
  assert.equal(result.lint.ok, true, JSON.stringify(result.lint));
  assert.equal(result.authorityBoard.pixelMode, "annotated_control");
  assert.match(result.compiledContentPrompt, /标注控制板，不是干净角色资产/u);
  assert.match(result.compiledContentPrompt, /必须绘制：A 标记单一头颅外轮廓/u);
  assert.match(result.compiledContentPrompt, /后续干净候选必须去除全部标记/u);
  assert.doesNotMatch(result.compiledContentPrompt, /不得出现任何可读文字、数字、标题/u);
  assert.doesNotMatch(result.compiledContentPrompt, /无文字、标签或箭头|不得任何文字、标签或箭头/u);
  assert.equal(result.negativeConstraints.includes("任何文字、标签或箭头"), false);
});

test("annotated pixel mode is rejected without a control board and bound instructions", () => {
  const invalid = {
    ...authority,
    boardSpecs: [{
      boardId: "identity-master", boardType: "identity", label: "身份母版", purpose: "错误地允许标注",
      viewSpecIds: ["front"], referencePolicy: "none", pixelMode: "annotated_control",
      acceptanceCriteria: [], prohibitedChanges: [], required: true
    }]
  };
  assert.throws(
    () => compileCharacterAuthorityPrompt({ authority: invalid, visualBible: bible, generationParameters: imageParameters, referenceBindings: [] }),
    (error) => error.code === "invalid_cinematic_contract"
  );
});

test("ensemble expansion boards do not inherit a contradictory global no-crowd restriction", () => {
  const ensemble = {
    ...authority,
    subjectMode: "ensemble",
    prohibitedChanges: [
      "改变唯一后脑人脸规则",
      "生成三分之四角度、转头、低头、仰头、其他人物、群像、武器或场景"
    ],
    boardSpecs: [{
      boardId: "crowd-identity", boardType: "identity_variants", label: "尸傀群像结构扩展板",
      purpose: "扩展四种群像身份变体", viewSpecIds: ["front"], referencePolicy: "accepted_identity",
      acceptanceCriteria: ["四种变体可区分"], prohibitedChanges: ["所有变体复制同一身份"], required: true
    }]
  };
  const result = compileCharacterAuthorityPrompt({
    authority: ensemble,
    boardId: "crowd-identity",
    generationParameters: { ...imageParameters, referenceMediaIds: ["media-identity"] },
    referenceBindings: [{
      mediaId: "media-identity", providerIndex: 1, displayName: "已接受单体身份", role: "character_identity",
      controls: ["单体身份"], doesNotControl: ["群像差异"]
    }]
  });
  assert.match(result.compiledContentPrompt, /四种群像身份变体/u);
  assert.match(result.compiledContentPrompt, /不得改变唯一后脑人脸规则/u);
  assert.match(result.compiledContentPrompt, /不得所有变体复制同一身份/u);
  assert.doesNotMatch(result.compiledContentPrompt, /其他人物、群像/u);
  assert.equal(result.negativeConstraints.includes("生成三分之四角度、转头、低头、仰头、其他人物、群像、武器或场景"), false);
});

test("prop authority keeps character identity and readable labels out of the asset pixels", () => {
  const prop = {
    authorityId: "prop-1", authorityType: "prop", displayName: "长枪", riskLevel: "high", status: "candidate",
    narrativeFunction: "近战武器", geometry: "单端窄叶枪尖和钝形尾鐏", material: "黑木与暗钢", scale: "2.6米", wearState: "中段断裂",
    interactionRules: { owner: "角色甲", handRules: ["左手持断枪"] },
    viewSpecs: [{ ...view, viewId: "prop-front", description: "正交完整长枪与断裂状态", controls: ["道具几何"], doesNotControl: ["人物身份"] }],
    referenceAssetIds: [], acceptanceCriteria: ["枪尖只有一端"], prohibitedChanges: ["变成双头枪"], revision: 1
  };
  const result = compilePropAuthorityPrompt({ authority: prop, visualBible: bible, generationParameters: imageParameters, referenceBindings: [] });
  assert.match(result.compiledContentPrompt, /不得生成有身份的完整人物、面孔/u);
  assert.match(result.compiledContentPrompt, /不得出现任何可读文字、数字、标题/u);
  assert.match(result.compiledContentPrompt, /匿名手部只用于说明握法/u);
  assert.doesNotMatch(result.compiledContentPrompt, /空间建立镜头|cameraRules/u);
});

test("character authority boards extend independently and require the accepted identity reference", () => {
  const extended = {
    ...authority,
    boardSpecs: [{
      boardId: "skill-fire",
      boardType: "skill_action",
      label: "火符技能动作板",
      purpose: "锁定起手、释放和收势",
      viewSpecIds: ["front"],
      referencePolicy: "accepted_identity",
      acceptanceCriteria: ["动作相位清楚"],
      prohibitedChanges: ["改变面孔"],
      required: true
    }]
  };
  assert.throws(
    () => compileCharacterAuthorityPrompt({ authority: extended, boardId: "skill-fire", generationParameters: imageParameters, referenceBindings: [] }),
    (error) => error.code === "character_board_reference_required"
  );
  const generationParameters = { ...imageParameters, referenceMediaIds: ["media-identity"] };
  const result = compileCharacterAuthorityPrompt({
    authority: extended,
    boardId: "skill-fire",
    generationParameters,
    referenceBindings: [{ mediaId: "media-identity", providerIndex: 1, displayName: "角色甲身份母版", role: "character_identity", controls: ["人物身份"], doesNotControl: ["动作相位"] }]
  });
  assert.equal(result.authorityBoard.boardId, "skill-fire");
  assert.match(result.compiledContentPrompt, /火符技能动作板/u);
  assert.doesNotMatch(result.compiledContentPrompt, /身份母版固定版式/u);
});

test("scene authority boards compile and persist one independently reviewable scene state", () => {
  const scene = {
    authorityId: "scene-1", authorityType: "scene", displayName: "古客栈", riskLevel: "high", status: "candidate",
    architecture: "两层中式古客栈大堂", materials: "旧木梁柱与地板", spatialLogic: { entrance: "前方", stairs: "右后" },
    lightingBaseline: { source: "血月暖红" }, palette: { base: ["暖红", "旧木褐"] },
    viewSpecs: [
      { ...view, viewId: "establishing", label: "空间母版", description: "二维手绘背景美术，入口侧大全景", controls: ["空间锚点"] },
      { ...view, viewId: "lighting", label: "灯光状态", description: "符火与五雷状态", controls: ["灯光连续性"] }
    ],
    boardSpecs: [
      { boardId: "space-master", boardType: "space_identity", label: "空间母版", purpose: "锁定基础空间", viewSpecIds: ["establishing"], referencePolicy: "none", acceptanceCriteria: ["锚点清楚"], prohibitedChanges: ["混入破坏状态"], required: true },
      { boardId: "lighting-states", boardType: "lighting_continuity", label: "灯光状态", purpose: "锁定动机光", viewSpecIds: ["lighting"], referencePolicy: "accepted_authority_versions", acceptanceCriteria: ["继承空间"], prohibitedChanges: ["镜像空间"], required: true }
    ],
    referenceAssetIds: [], acceptanceCriteria: ["空间连续"], prohibitedChanges: ["现代器物"], revision: 1
  };
  const result = compileSceneAuthorityPrompt({ authority: scene, visualBible: bible, boardId: "space-master", generationParameters: imageParameters, referenceBindings: [] });
  assert.equal(result.authorityBoard.boardId, "space-master");
  assert.match(result.compiledContentPrompt, /空间母版（space_identity）/u);
  assert.match(result.compiledContentPrompt, /入口侧大全景/u);
  assert.doesNotMatch(result.compiledContentPrompt, /符火与五雷状态/u);
  assert.throws(
    () => compileSceneAuthorityPrompt({ authority: scene, visualBible: bible, boardId: "lighting-states", generationParameters: imageParameters, referenceBindings: [] }),
    (error) => error.code === "scene_board_reference_required"
  );
});

test("a scene authority without boardSpecs compiles its required views directly", () => {
  const scene = {
    authorityId: "scene-no-boards", authorityType: "scene", displayName: "无名公寓", riskLevel: "high", status: "candidate",
    architecture: "窄入口、门槛、狭长前厅与公共客厅", materials: "湿墙、旧木门与磨损地面",
    spatialLogic: { entrance: "前方", livingRoom: "后方" }, lightingBaseline: { source: "室内旧灯" }, palette: { base: ["旧木褐"] },
    viewSpecs: [{ ...view, viewId: "space-master", label: "空间母版", description: "入口到客厅的完整空间关系", controls: ["空间拓扑"] }],
    referenceAssetIds: [], acceptanceCriteria: ["空间连续"], prohibitedChanges: ["镜像空间"], revision: 1
  };
  const result = compileSceneAuthorityPrompt({ authority: scene, visualBible: bible, generationParameters: imageParameters, referenceBindings: [] });
  assert.equal(result.authorityBoard, undefined);
  assert.equal(result.lint.ok, true, JSON.stringify(result.lint));
  assert.match(result.compiledContentPrompt, /无名公寓/u);
  assert.match(result.compiledContentPrompt, /入口到客厅的完整空间关系/u);
  assert.match(result.compiledContentPrompt, /干净的纯环境参考/u);
  assert.match(result.compiledContentPrompt, /不得出现人物、演员、面孔、身体、手脚、人物剪影、人物倒影、群像或角色表演/u);
  assert.match(result.compiledContentPrompt, /人物数量、动作和对白只解释空间用途，不得画进场景权威像素/u);
});

test("portrait scene parameters compile observable vertical depth without leaking technical size text", () => {
  const scene = {
    authorityId: "scene-portrait", authorityType: "scene", displayName: "竖屏旧公寓", riskLevel: "high", status: "candidate",
    architecture: "窄入口通向客厅与楼梯", materials: "湿墙与旧木门",
    spatialLogic: { entrance: "前景", livingRoom: "后景" }, lightingBaseline: { source: "入口冷天光" }, palette: { base: ["灰蓝"] },
    viewSpecs: [{ ...view, viewId: "space", label: "空间母版", description: "入口至客厅的连续空间" }],
    referenceAssetIds: [], acceptanceCriteria: ["路径清楚"], prohibitedChanges: ["镜像空间"], revision: 1
  };
  const result = compileSceneAuthorityPrompt({
    authority: scene,
    visualBible: bible,
    generationParameters: { ...imageParameters, aspectRatio: "2:3", resolution: "1024x1536" },
    referenceBindings: []
  });
  assert.match(result.compiledContentPrompt, /竖向空间纵深构图/u);
  assert.match(result.compiledContentPrompt, /入口与门槛位于前景/u);
  assert.doesNotMatch(result.compiledContentPrompt, /1024x1536|2\s*:\s*3/u);
});

test("storyboard compiler preserves shot meaning while isolating grids and proxy style", () => {
  const result = compileStoryboardPrompt({
    storyboard: { storyboardId: "storyboard-1", layout: "storyboard_sheet", shotIds: [shot.shotId], panelSpecs: [{ shotId: shot.shotId, label: "等待转身" }], continuityLocks: [], styleIsolation: ["把网格带入成片"], revision: 1 },
    shots: [{ ...shot, cinematography: { directorStageCamera: { id: "camera-1", aspectRatio: "16:9", fov: 50 }, shotSize: "中景" } }], visualBible: bible, generationParameters: imageParameters, referenceBindings: []
  });
  assert.equal(result.protocolId, "ununu.storyboard.v2");
  assert.match(result.compiledContentPrompt, /不把网格、画格编号或代理人物画风带入最终成片/u);
  assert.match(result.compiledContentPrompt, /单张完整叙事帧/u);
  assert.match(result.compiledContentPrompt, /禁止拼贴、接触表、六视图、角色设定板/u);
  assert.match(result.compiledContentPrompt, /摄影执行/u);
  assert.match(result.compiledContentPrompt, /人物背对入口/u);
  assert.doesNotMatch(result.compiledContentPrompt, /16\s*:\s*9|aspectRatio/u);
  assert.equal(result.lint.ok, true, JSON.stringify(result.lint));
});

test("single-keyframe compiler describes one frozen instant and strips temporal and Director-internal records", () => {
  const referenceBindings = [{
    assetId: "asset-stage", versionId: "asset-stage-v1", mediaId: "media-stage", displayName: "入口空间调度底图", role: "director_blocking",
    authorityRevision: "director-stage:r1", providerIndex: 1, controls: ["人物站位", "摄影机方位"], doesNotControl: ["代理人物造型", "最终镜头时长"], required: true
  }];
  const result = compileStoryboardPrompt({
    storyboard: {
      storyboardId: "storyboard-keyframe", layout: "shot_frame_set", shotIds: [shot.shotId],
      panelSpecs: [{
        shotId: shot.shotId, label: "转头揭示", keyframeMoment: "最近酒客刚完成转头，脑后鬼脸正对前景主角，三位主角仍为前景背影。",
        spatialState: "三位主角位于入口前景，酒客位于中后景，不得出现在主角身后。",
        subjectState: "酒客手持酒杯停顿；主角手刚接近武器但尚未出招。",
        cameraState: "入口内侧平视中远景，深景深，入口—中央—后出口轴线清楚。",
        performanceFocus: "主角警觉克制，酒客转头后完全静止。",
        lightingFocus: "暗褐客栈与血月暖红动机光。",
        continuityFocus: "酒杯、桌凳和后出口保持原位。"
      }],
      continuityLocks: ["保持入口方向"], styleIsolation: ["把代理人物画风带入最终画面"], revision: 1
    },
    shots: [{
      ...shot,
      actionChain: ["跨过门槛", "所有酒客依次停杯", "酒客转头", "尸傀封堵后出口"],
      blocking: { positions: "前景与中后景", directorStageBinding: { mediaId: "media-internal", cameraSnapshot: { id: "cam-internal", fov: 60 } } },
      cinematography: { shotSize: "中远景", cameraPosition: "入口内侧", directorStageCamera: { id: "cam-internal", aspectRatio: "16:9" }, movementPath: "完整四秒推轨" }
    }],
    visualBible: bible,
    generationParameters: { ...imageParameters, referenceMediaIds: ["media-stage"] },
    referenceBindings
  });
  assert.equal(result.protocolId, "ununu.storyboard.keyframe.v1");
  assert.match(result.compiledContentPrompt, /唯一冻结时刻：最近酒客刚完成转头/u);
  assert.match(result.compiledContentPrompt, /参考图1「入口空间调度底图」 = 人物站位与摄影机方位。/u);
  assert.match(result.compiledContentPrompt, /只生成一个明确时刻/u);
  assert.match(result.compiledContentPrompt, /纵向竖屏画布/u);
  assert.match(result.compiledContentPrompt, /参考图是横幅，也不得继承其画布比例/u);
  assert.match(result.compiledContentPrompt, /一个景别、一个机位和一个焦平面/u);
  assert.doesNotMatch(result.compiledContentPrompt, /跨过门槛|尸傀封堵后出口|完整四秒推轨/u);
  assert.doesNotMatch(result.compiledContentPrompt, /directorStageBinding|cameraSnapshot|directorStageCamera|media-internal|cam-internal/u);
  assert.doesNotMatch(result.compiledContentPrompt, /最终镜头时长|16\s*:\s*9/u);
  assert.equal(result.lint.ok, true, JSON.stringify(result.lint));

  const tooManyReferences = Array.from({ length: 6 }, (_, index) => ({
    ...referenceBindings[0], assetId: `asset-${index}`, versionId: `version-${index}`, mediaId: `media-${index}`,
    displayName: `参考${index + 1}`, providerIndex: index + 1
  }));
  assert.throws(() => compileStoryboardPrompt({
    storyboard: { storyboardId: "storyboard-keyframe-limit", layout: "shot_frame_set", shotIds: [shot.shotId], panelSpecs: [{ shotId: shot.shotId, keyframeMoment: "单一时刻" }], continuityLocks: [], styleIsolation: [], revision: 1 },
    shots: [shot], visualBible: bible,
    generationParameters: { ...imageParameters, referenceMediaIds: tooManyReferences.map((entry) => entry.mediaId) },
    referenceBindings: tooManyReferences
  }), (error) => error.code === "single_keyframe_reference_limit_exceeded");
});

test("image lint blocks unbound placeholders and CLI arguments", () => {
  const lint = lintCinematicImagePrompt({ compiledContentPrompt: "[图片]中的人物 --ar 16:9 --style raw", generationParameters: imageParameters, referenceBindings: [] });
  assert.equal(lint.ok, false);
  assert.equal(lint.errors.some((entry) => entry.code === "unbound_image_reference"), true);
  assert.equal(lint.errors.some((entry) => entry.code === "cli_argument_leak"), true);
});

test("asset authority routing is optional and driven by actual identity, space, and prop risks", () => {
  const requirements = routeAssetAuthorityRisk({ storyPacket: { characters: [{ name: "角色甲" }] }, shots: [{ blocking: { prop: "拿起关键证据" }, editContinuity: { axis: "保持空间轴线" } }] });
  assert.deepEqual(requirements.map((entry) => entry.authorityType), ["character", "scene", "prop"]);
  assert.deepEqual(routeAssetAuthorityRisk({ storyPacket: { scenePurpose: "抽象光影实验" }, shots: [] }), []);
});
