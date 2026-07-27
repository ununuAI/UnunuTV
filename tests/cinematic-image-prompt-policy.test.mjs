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

const imageParameters = { provider: "ununu", model: "openai/gpt-image-2", aspectRatio: "16:9", resolution: "2048x1152", count: 1, referenceMediaIds: [] };
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
  assert.doesNotMatch(result.compiledContentPrompt, /16\s*:\s*9|2048x1152|openai\/gpt-image-2/u);
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
