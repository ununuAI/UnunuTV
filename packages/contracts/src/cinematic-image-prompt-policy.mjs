import {
  assertCinematicContract,
  validateCinematicImageGenerationParameters,
  validateReferenceBindings
} from "./cinematic-contracts.mjs";
import {
  CINEMATIC_PROMPT_COVERAGE_LABELS,
  CINEMATIC_STATIC_PROMPT_COVERAGE_FIELDS,
  evaluatePromptConstraintCoverage
} from "./cinematic-prompt-coverage-policy.mjs";
import { scopeAuthorityBoardConstraints } from "./authority-board-constraint-scope-policy.mjs";

export const CINEMATIC_IMAGE_PROMPT_COMPILER_VERSION = "2.7.0";
export const DEFAULT_CHARACTER_IDENTITY_BOARD_ID = "identity-master";
export const DEFAULT_SCENE_SPACE_BOARD_ID = "space-master";

const DEFAULT_CHARACTER_IDENTITY_BOARD = Object.freeze({
  boardId: DEFAULT_CHARACTER_IDENTITY_BOARD_ID,
  boardType: "identity",
  label: "特写＋六视图身份母版",
  purpose: "锁定单一角色的面孔、头骨、体型、服装妆发、比例、轮廓与中性状态，作为后续所有表演、动作、技能、伤势和道具交互板的身份来源",
  viewSpecIds: [],
  referencePolicy: "none",
  acceptanceCriteria: ["完整头肩特写与六个视图属于同一身份", "头、手、腿、鞋和服装轮廓完整可验收"],
  prohibitedChanges: ["新增第二个身份", "用动作姿态替代中性身份基准", "把武器、技能特效或伤势状态混入中性身份母版", "加入文字、编号、水印或界面"],
  required: true
});

const TECHNICAL_PATTERNS = [
  { code: "aspect_ratio_leak", pattern: /(?:画幅|宽高比|比例)?\s*(?:16\s*:\s*9|9\s*:\s*16|1\s*:\s*1)/iu },
  { code: "resolution_leak", pattern: /(?:480p|720p|1080p|2k|4k|8k)\b/iu },
  { code: "cli_argument_leak", pattern: /(?:^|\s)--(?:ar|v|style|q|seed)\b/iu },
  { code: "provider_parameter_leak", pattern: /(?:provider|model|模型)\s*[:：=]\s*[a-z0-9_./-]+/iu }
];
const UNBOUND_IMAGE_PATTERN = /(?:\[图片\]|【照片】|\bimage\s*\d+\b)/iu;
const STYLE_RISK_PATTERN = /(?:模仿|仿照|in the style of|风格完全一致于)\s*[\p{L}\p{N}·._-]{2,}/iu;
const ABSOLUTE_IDENTITY_PATTERN = /(?:百分之百|绝对|完全|永久)(?:保持|一致|还原)(?:人物|身份|面孔|五官)?/u;
const HYPE_PATTERN = /(?:电影级|大师级|顶级|超绝|极致|史诗级|震撼|高级感|8K)/gu;

function clean(value) {
  return typeof value === "string" ? value.replace(/\s+/gu, " ").trim() : "";
}

function list(value) {
  return Array.isArray(value) ? value.map((entry) => clean(typeof entry === "string" ? entry : entry?.description ?? entry?.label)).filter(Boolean) : [];
}

const TECHNICAL_RECORD_KEYS = new Set(["aspectRatio", "resolution", "provider", "model", "modelId", "count"]);

function record(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return clean(value);
  return Object.entries(value).flatMap(([key, entry]) => {
    if (TECHNICAL_RECORD_KEYS.has(key)) return [];
    const rendered = Array.isArray(entry) ? list(entry).join("；") : entry && typeof entry === "object" ? record(entry) : clean(String(entry ?? ""));
    return rendered ? [`${key}：${rendered}`] : [];
  }).join("；");
}

function utf8Bytes(value) {
  return new TextEncoder().encode(value).byteLength;
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function hash(value) {
  let current = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(stableStringify(value))) {
    current ^= byte;
    current = Math.imul(current, 0x01000193) >>> 0;
  }
  return `fnv1a32:${current.toString(16).padStart(8, "0")}`;
}

function section(title, values) {
  const lines = values.flatMap((value) => Array.isArray(value) ? value : [value]).map(clean).filter(Boolean);
  return lines.length ? `【${title}】\n${lines.join("\n")}` : "";
}

function renderReferences(bindings) {
  return [...bindings].sort((a, b) => a.providerIndex - b.providerIndex).map((binding) =>
    `${binding.displayName}（参考图${binding.providerIndex}）：只控制${list(binding.controls).join("、")}${list(binding.doesNotControl).length ? `；不控制${list(binding.doesNotControl).join("、")}` : ""}。`
  );
}

function renderKeyframeReferences(bindings) {
  return [...bindings].sort((a, b) => a.providerIndex - b.providerIndex).map((binding) => {
    const alias = clean(binding.promptAlias) || list(binding.controls).slice(0, 2).join("与") || binding.displayName;
    return `参考图${binding.providerIndex}「${binding.displayName}」 = ${alias}。`;
  });
}

function selectedRecord(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  return record(Object.fromEntries(keys.filter((key) => value[key] !== undefined).map((key) => [key, value[key]])));
}

function renderKeyframeVisualStyle(cinematography) {
  const camera = cinematography && typeof cinematography === "object" ? cinematography : {};
  return [
    [clean(camera.format), clean(camera.medium)].filter(Boolean).length ? `媒介：${[clean(camera.format), clean(camera.medium)].filter(Boolean).join("；")}` : "",
    clean(camera.rendering) ? `渲染：${clean(camera.rendering)}` : "",
    clean(camera.proportions) ? `人物比例与动作：${clean(camera.proportions)}` : "",
    clean(camera.exclusion) ? `排除：${clean(camera.exclusion)}` : ""
  ].filter(Boolean);
}

function renderSingleKeyframePanel(panel, shot, index) {
  const composition = panel.composition ?? shot.cinematography ?? {};
  const spatialState = clean(panel.spatialState) || selectedRecord(shot.blocking, ["positions", "gaze", "hands", "props", "contactSurface"]);
  const cameraState = clean(panel.cameraState) || selectedRecord(composition, ["shotSize", "cameraPosition", "angle", "perspective", "composition", "depthOfField", "focus"]);
  const subjectState = clean(panel.subjectState) || clean(shot.openingState);
  const performanceFocus = clean(panel.performanceFocus);
  const lightingFocus = clean(panel.lightingFocus) || record({ lighting: shot.lighting, color: shot.color });
  const continuityFocus = clean(panel.continuityFocus);
  const prohibitions = [...list(shot.mustNotAppearYet), ...list(panel.prohibitions)].map((item) => `不得${item.replace(/^(?:不得|禁止)/u, "")}`);
  return section(`关键帧${index + 1}「${clean(panel.label ?? shot.storyBeat)}」`, [
    `叙事目的：${clean(shot.narrativeJob)}`,
    `唯一冻结时刻：${clean(panel.keyframeMoment)}`,
    spatialState ? `空间关系：${spatialState}` : "",
    subjectState ? `主体状态：${subjectState}` : "",
    cameraState ? `摄影机与构图：${cameraState}` : "",
    performanceFocus ? `表演重点：${performanceFocus}` : "",
    lightingFocus ? `光线与色彩：${lightingFocus}` : "",
    continuityFocus ? `连续性：${continuityFocus}` : "",
    ...prohibitions.map((item) => `本帧禁止：${item}`)
  ]);
}

function renderViews(viewSpecs) {
  return viewSpecs.map((view, index) =>
    `视图${index + 1}「${clean(view.label)}」：${clean(view.framing)}，${clean(view.angle)}；${clean(view.description)}；背景${clean(view.background)}；只控制${list(view.controls).join("、")}${list(view.doesNotControl).length ? `；不控制${list(view.doesNotControl).join("、")}` : ""}。`
  );
}

function renderPromptCoverage(coverage) {
  if (!coverage || typeof coverage !== "object" || Array.isArray(coverage)) return [];
  const domains = CINEMATIC_STATIC_PROMPT_COVERAGE_FIELDS
    .filter((field) => clean(coverage[field]))
    .map((field) => `${CINEMATIC_PROMPT_COVERAGE_LABELS[field]}：${clean(coverage[field])}`);
  const escapeRoutes = list(coverage.escapeRoutes).map((entry) => `逃逸路径：${entry}`);
  const closures = (Array.isArray(coverage.counterexampleClosures) ? coverage.counterexampleClosures : []).map((entry) =>
    `反例闭环：失败=${clean(entry?.observedFailure)}；漏项=${clean(entry?.omittedDetail)}；正向约束=${clean(entry?.positiveConstraint)}；一票否决=${clean(entry?.vetoCriterion)}`
  );
  return [...domains, ...escapeRoutes, ...closures];
}

function renderAuthorityVisualStyle(visualBible, authority, authorityBoard = null) {
  if (!visualBible) return [];
  assertCinematicContract("VisualBible", visualBible);
  const camera = visualBible.cinematography ?? {};
  const medium = record({ format: camera.format, medium: camera.medium, rendering: camera.rendering, proportions: camera.proportions, exclusion: camera.exclusion });
  const styleProhibitions = list(visualBible.styleProhibitions);
  const common = [medium ? `媒介与渲染：${medium}` : "", `色彩：${record(visualBible.color)}`];
  if (authority.authorityType === "prop") {
    return [...common, ...styleProhibitions.filter((item) => /(?:艺术家|动画IP|真人|3D|Q版|游戏UI|字幕|水印|现代器物)/u.test(item)).map((item) => `不得${item.replace(/^(?:不得|禁止)/u, "")}`)].filter(Boolean);
  }
  if (authority.authorityType === "scene") {
    if (authorityBoard) {
      return [...common, ...styleProhibitions.map((item) => `不得${item.replace(/^(?:不得|禁止)/u, "")}`)].filter(Boolean);
    }
    return [...common, `场景美术：${record(visualBible.productionDesign)}`, `灯光：${record(visualBible.lighting)}`, list(visualBible.visualMotifs).length ? `视觉母题：${list(visualBible.visualMotifs).join("；")}` : "", ...styleProhibitions.map((item) => `不得${item.replace(/^(?:不得|禁止)/u, "")}`)].filter(Boolean);
  }
  const exactLook = visualBible.characterLook?.[authority.displayName];
  return [...common, exactLook ? `本角色造型：${clean(exactLook)}` : "", ...styleProhibitions.map((item) => `不得${item.replace(/^(?:不得|禁止)/u, "")}`)].filter(Boolean);
}

function renderAuthorityOutputDiscipline(authorityType, authorityBoard = null) {
  const annotatedControl = authorityBoard?.pixelMode === "annotated_control";
  const common = annotatedControl
    ? [
        "输出为仅供模型理解几何和方向的标注控制板，不是干净角色资产或成片像素。",
        "允许且必须出现本板结构化合同明确声明的字母标记、区域圈、外轮廓线、中心轴与方向箭头；不得加入图例之外的说明文字、标题、字幕、水印、徽标或界面元素。",
        "标注必须与人物像素和 Prompt 完全一致；每条标记只控制其声明的几何事实。后续干净候选必须去除全部标记，标注控制板不得直接成为角色 Authority、关键帧或视频参考。"
      ]
    : ["输出为纯视觉资产板，不得出现任何可读文字、数字、标题、注释、编号、标尺字符、字幕、水印、徽标或界面元素；板件语义由结构化合同保存，不写进像素。"];
  if (authorityType === "prop") return [...common, "道具权威只展示道具本体、状态碎片和必要的匿名手部或前臂；不得生成有身份的完整人物、面孔、发型、服装或角色表演。", "所有视图中的道具几何、材质、尺度和状态必须属于同一件资产；匿名手部只用于说明握法、左右手或接触点，不控制角色身份。"];
  if (authorityType === "scene") return [...common, "场景权威只控制空间、建筑、材质、固定锚点、灯光和破坏状态；不得生成承担角色身份的清晰人物特写。"];
  return [...common, annotatedControl ? "字母和线条只能辅助可见解剖结构，不能代替正确的正面、侧面、背面或头肩像素。" : "角色身份母版不得用文字标签代替可见的正面、侧面、背面、全身或头肩视图。"];
}

function renderControlAnnotations(authorityBoard) {
  if (authorityBoard?.pixelMode !== "annotated_control") return [];
  return list(authorityBoard.annotationInstructions).map((instruction) => `必须绘制：${instruction}`);
}

function boardScopedConstraints(authorityItems, boardItems, authorityBoard, subjectMode) {
  return scopeAuthorityBoardConstraints({ authorityItems, boardItems, authorityBoard, subjectMode });
}

export function lintCinematicImagePrompt({ compiledContentPrompt, generationParameters, referenceBindings = [] }) {
  const errors = [];
  const warnings = [];
  const prompt = clean(compiledContentPrompt);
  if (UNBOUND_IMAGE_PATTERN.test(prompt)) errors.push({ code: "unbound_image_reference", message: "Prompt contains an image placeholder that is not bound to the final payload order." });
  for (const entry of TECHNICAL_PATTERNS) if (entry.pattern.test(prompt)) errors.push({ code: entry.code, message: "Generation parameters and CLI arguments must remain outside the content Prompt." });
  for (const value of [generationParameters?.provider, generationParameters?.model].filter(Boolean)) {
    if (prompt.toLocaleLowerCase("en-US").includes(String(value).toLocaleLowerCase("en-US"))) errors.push({ code: "provider_model_leak", message: `Content Prompt contains provider/model identifier ${value}.` });
  }
  const referenceValidation = validateReferenceBindings(referenceBindings, generationParameters);
  errors.push(...referenceValidation.issues.map((entry) => ({ code: entry.code, message: entry.message, path: entry.path })));
  const validIndices = new Set(referenceBindings.map((binding) => binding.providerIndex));
  for (const match of compiledContentPrompt.matchAll(/参考图\s*(\d+)/gu)) if (!validIndices.has(Number(match[1]))) errors.push({ code: "phantom_reference", message: `Prompt refers to absent 参考图${match[1]}.` });
  for (const binding of referenceBindings) {
    const legacyMapping = `${binding.displayName}（参考图${binding.providerIndex}）`;
    const compactMapping = `参考图${binding.providerIndex}「${binding.displayName}」`;
    if (!compiledContentPrompt.includes(legacyMapping) && !compiledContentPrompt.includes(compactMapping)) {
      errors.push({ code: "missing_reference_identity", message: `Missing named reference mapping for ${binding.displayName}.` });
    }
  }
  const positiveStyleText = prompt.replace(/(?:不得|禁止|不要)(?:模仿|仿照)[^；。\n]*/gu, "");
  if (STYLE_RISK_PATTERN.test(positiveStyleText)) warnings.push({ code: "director_ip_style_risk", message: "Named living-artist/director or protected-IP imitation should be replaced with concrete visual attributes or reviewed by the Owner." });
  if (ABSOLUTE_IDENTITY_PATTERN.test(prompt)) warnings.push({ code: "absolute_identity_promise", message: "Identity consistency is a target and acceptance criterion, not an absolute model guarantee." });
  if ((prompt.match(HYPE_PATTERN) ?? []).length >= 3) warnings.push({ code: "hype_adjective_stack", message: "Stacked prestige adjectives do not replace concrete composition, light, material, performance, or continuity instructions." });
  return { bytes: utf8Bytes(compiledContentPrompt), errors, ok: errors.length === 0, warnings };
}

function envelope({ authority, protocolId, prompt, generationParameters, referenceBindings, negatives, manualOverride, authorityBoard = null, coverageAudit = null, visualBible = null }) {
  const lint = lintCinematicImagePrompt({ compiledContentPrompt: prompt, generationParameters, referenceBindings });
  const result = {
    protocolId,
    protocolVersion: "2.0.0",
    targetId: authority.authorityId ?? authority.storyboardId,
    sourceVersions: {
      targetRevision: authority.revision,
      ...(visualBible ? { visualBibleRevision: visualBible.revision } : {})
    },
    compiledContentPrompt: prompt,
    negativeConstraints: [...new Set(negatives.map(clean).filter(Boolean))],
    referenceBindings,
    generationParameters,
    compilerVersion: CINEMATIC_IMAGE_PROMPT_COMPILER_VERSION,
    payloadHash: "",
    lint,
    manualOverride,
    ...(coverageAudit ? { promptCoverage: coverageAudit } : {}),
    requiresPreflight: manualOverride || !lint.ok || coverageAudit?.ok === false
  };
  if (authorityBoard) result.authorityBoard = authorityBoard;
  result.payloadHash = hash({ protocolId, prompt, referenceBindings: referenceBindings.map(({ mediaId, providerIndex, role }) => ({ mediaId, providerIndex, role })), generationParameters, targetId: result.targetId, revision: authority.revision, visualBibleRevision: visualBible?.revision ?? null, authorityBoard });
  assertCinematicContract("CinematicImagePromptEnvelopeV2", result);
  return result;
}

export function characterAuthorityBoardSpecs(authority) {
  const explicit = Array.isArray(authority?.boardSpecs) ? authority.boardSpecs : [];
  const identity = explicit.find((entry) => entry?.boardId === DEFAULT_CHARACTER_IDENTITY_BOARD_ID);
  const fallbackIdentity = authority?.subjectMode === "ensemble" ? {
    ...DEFAULT_CHARACTER_IDENTITY_BOARD,
    label: "群像变体身份母版",
    purpose: "锁定群体共同物种规则、时代服装、材质与变体边界，同时保留可辨识的个体差异"
  } : DEFAULT_CHARACTER_IDENTITY_BOARD;
  return [identity ? { ...fallbackIdentity, ...identity, boardType: "identity", required: true } : fallbackIdentity, ...explicit.filter((entry) => entry?.boardId !== DEFAULT_CHARACTER_IDENTITY_BOARD_ID)];
}

function characterBoard(authority, boardId) {
  const resolved = characterAuthorityBoardSpecs(authority).find((entry) => entry.boardId === (boardId || DEFAULT_CHARACTER_IDENTITY_BOARD_ID));
  if (!resolved) throw Object.assign(new Error(`Unknown character authority board: ${boardId}`), { code: "character_authority_board_not_found" });
  return resolved;
}

export function sceneAuthorityBoardSpecs(authority) {
  return Array.isArray(authority?.boardSpecs) ? authority.boardSpecs : [];
}

function sceneBoard(authority, boardId) {
  if (!boardId) return null;
  const resolved = sceneAuthorityBoardSpecs(authority).find((entry) => entry.boardId === boardId);
  if (!resolved) throw Object.assign(new Error(`Unknown scene authority board: ${boardId}`), { code: "scene_authority_board_not_found" });
  return resolved;
}

function renderIdentityBoardLayout() {
  return [
    "横版画布固定分为左右两区：左侧约 60% 为 2×3 六个等尺寸面板，右侧约 40% 为一张大尺寸完整头肩特写。",
    "左侧上排依次为完整头部正面、标准侧面或清晰三分之四侧面、头部背面；下排依次为全身正面、标准侧面或清晰三分之四侧面、全身背面。",
    "右侧特写必须完整包含头顶、全部头发、发际线、双耳、完整脸型、下颌、颈部与双肩，不得裁切。",
    "六视图与特写保持同一面孔、头骨、五官比例、年龄、肤色、体型、发型和基础服装；中性站姿与中性表情，纯净摄影棚背景。",
    "身份母版只锁人物身份：双手自然放松且不持物，不展示武器、技能特效、伤势或剧情动作；这些内容必须进入引用已验收身份的独立道具、表演、技能或伤势板件。"
  ];
}

function compileAuthority({ authority, visualBible = null, generationParameters, referenceBindings = [], manualOverride = false, manualPrompt = "", boardId = DEFAULT_CHARACTER_IDENTITY_BOARD_ID }) {
  const contract = authority.authorityType === "character" ? "CharacterAuthoritySet" : authority.authorityType === "scene" ? "SceneAuthoritySet" : "PropAuthoritySpec";
  assertCinematicContract(contract, authority);
  const parameterValidation = validateCinematicImageGenerationParameters(generationParameters);
  if (!parameterValidation.ok) assertCinematicContract("CinematicImageGenerationParameters", generationParameters);
  const references = renderReferences(referenceBindings);
  let body;
  let protocolId = "ununu.image.v2";
  let authorityBoard = null;
  let coverageAudit = null;
  if (authority.authorityType === "character") {
    protocolId = "ununu.character.v2";
    authorityBoard = characterBoard(authority, boardId);
    coverageAudit = evaluatePromptConstraintCoverage({
      coverage: authorityBoard.promptCoverage,
      required: authorityBoard.requirePromptCoverage === true
    });
    if (authorityBoard.referencePolicy !== "none" && referenceBindings.length === 0) {
      throw Object.assign(new Error(`Character board ${authorityBoard.boardId} requires an accepted authority reference`), { code: "character_board_reference_required" });
    }
    const selectedViewIds = new Set(authorityBoard.viewSpecIds);
    const selectedViews = selectedViewIds.size ? authority.viewSpecs.filter((view) => selectedViewIds.has(view.viewId)) : authority.viewSpecs;
    const acceptance = boardScopedConstraints(authority.acceptanceCriteria, authorityBoard.acceptanceCriteria, authorityBoard, authority.subjectMode);
    const prohibited = boardScopedConstraints(authority.prohibitedChanges, authorityBoard.prohibitedChanges, authorityBoard, authority.subjectMode);
    body = [
      section("参考图映射", references),
      section("项目视觉媒介与风格权威", renderAuthorityVisualStyle(visualBible, authority, authorityBoard)),
      section("输出图形纪律", renderAuthorityOutputDiscipline(authority.authorityType, authorityBoard)),
      section("人物身份权威", [`${authority.displayName}：${authority.identityDescription}`, `主体模式：${authority.subjectMode === "ensemble" ? "群像变体" : "单一角色"}`, `身份锁：${list(authority.identityLocks).join("；")}`, `服装妆发：${record(authority.wardrobeMakeupHair)}`]),
      section("本次角色板件", [`${authorityBoard.label}（${authorityBoard.boardType}）`, `用途：${authorityBoard.purpose}`, `参考策略：${authorityBoard.referencePolicy}`]),
      section("控制标注图例", renderControlAnnotations(authorityBoard)),
      section("逐域 Prompt 覆盖", renderPromptCoverage(authorityBoard.promptCoverage)),
      authorityBoard.boardId === DEFAULT_CHARACTER_IDENTITY_BOARD_ID && authority.subjectMode !== "ensemble" ? section("身份母版固定版式", renderIdentityBoardLayout()) : "",
      section("权威视图", renderViews(selectedViews)),
      section("验收", acceptance),
      section("禁止改变", prohibited.map((item) => `不得${item.replace(/^不得/u, "")}`))
    ];
  } else if (authority.authorityType === "scene") {
    authorityBoard = sceneBoard(authority, boardId === DEFAULT_CHARACTER_IDENTITY_BOARD_ID ? null : boardId);
    if (authorityBoard?.referencePolicy !== "none" && referenceBindings.length === 0) {
      throw Object.assign(new Error(`Scene board ${authorityBoard.boardId} requires an accepted authority reference`), { code: "scene_board_reference_required" });
    }
    const selectedViewIds = new Set(authorityBoard?.viewSpecIds ?? []);
    const selectedViews = selectedViewIds.size ? authority.viewSpecs.filter((view) => selectedViewIds.has(view.viewId)) : authority.viewSpecs;
    const acceptance = boardScopedConstraints(authority.acceptanceCriteria, authorityBoard?.acceptanceCriteria, authorityBoard);
    const prohibited = boardScopedConstraints(authority.prohibitedChanges, authorityBoard?.prohibitedChanges, authorityBoard);
    body = [
      section("参考图映射", references),
      section("项目视觉媒介与风格权威", renderAuthorityVisualStyle(visualBible, authority, authorityBoard)),
      section("输出图形纪律", renderAuthorityOutputDiscipline(authority.authorityType, authorityBoard)),
      section("场景空间权威", authorityBoard
        ? [`${authority.displayName}：${authority.architecture}`, `固定尺寸与锚点：${record({ dimensionsMeters: authority.spatialLogic?.dimensionsMeters, anchors: authority.spatialLogic?.anchors })}`, `材质：${authority.materials}`, ...(authorityBoard.boardType === "lighting_continuity" || authorityBoard.boardId === DEFAULT_SCENE_SPACE_BOARD_ID ? [`基准光源：${clean(authority.lightingBaseline?.source)}`, `基础色卡：${list(authority.palette?.base).join("；")}`] : [])]
        : [`${authority.displayName}：${authority.architecture}`, `空间逻辑：${record(authority.spatialLogic)}`, `材质：${authority.materials}`, `基准灯光：${record(authority.lightingBaseline)}`, `综合色卡：${record(authority.palette)}`]),
      authorityBoard ? section("本次场景板件", [`${authorityBoard.label}（${authorityBoard.boardType}）`, `用途：${authorityBoard.purpose}`, `参考策略：${authorityBoard.referencePolicy}`]) : "",
      authorityBoard ? section("控制标注图例", renderControlAnnotations(authorityBoard)) : "",
      section("权威视图", renderViews(selectedViews)),
      section("验收", acceptance),
      section("禁止改变", prohibited.map((item) => `不得${item.replace(/^不得/u, "")}`))
    ];
  } else {
    body = [
      section("参考图映射", references),
      section("项目视觉媒介与风格权威", renderAuthorityVisualStyle(visualBible, authority, authorityBoard)),
      section("输出图形纪律", renderAuthorityOutputDiscipline(authority.authorityType, authorityBoard)),
      section("道具权威", [`${authority.displayName}；叙事功能：${authority.narrativeFunction}`, `几何：${authority.geometry}`, `材质：${authority.material}`, `尺度：${authority.scale}`, `磨损状态：${authority.wearState}`, `交互规则：${record(authority.interactionRules)}`]),
      section("权威视图", renderViews(authority.viewSpecs)),
      section("验收", list(authority.acceptanceCriteria)),
      section("禁止改变", list(authority.prohibitedChanges).map((item) => `不得${item.replace(/^不得/u, "")}`))
    ];
  }
  const prompt = manualOverride ? clean(manualPrompt) : body.filter(Boolean).join("\n\n");
  const negativeConstraints = [
    ...boardScopedConstraints(authority.prohibitedChanges, authorityBoard?.prohibitedChanges, authorityBoard, authority.subjectMode),
    ...list(visualBible?.styleProhibitions)
  ];
  return envelope({ authority, protocolId, prompt, generationParameters, referenceBindings, negatives: negativeConstraints, manualOverride, authorityBoard, coverageAudit, visualBible });
}

export function compileCharacterAuthorityPrompt(input) {
  return compileAuthority(input);
}

export function compileSceneAuthorityPrompt(input) {
  return compileAuthority(input);
}

export function compilePropAuthorityPrompt(input) {
  return compileAuthority(input);
}

export function compileStoryboardPrompt({ storyboard, shots, visualBible, generationParameters, referenceBindings = [], manualOverride = false, manualPrompt = "" }) {
  assertCinematicContract("StoryboardPromptSpec", storyboard);
  assertCinematicContract("VisualBible", visualBible);
  for (const shot of shots) assertCinematicContract("CinematicShotSpec", shot);
  const shotById = new Map(shots.map((shot) => [shot.shotId, shot]));
  const isSingleKeyframe = storyboard.panelSpecs.length === 1 && Boolean(clean(storyboard.panelSpecs[0]?.keyframeMoment));
  if (isSingleKeyframe && referenceBindings.length > 5) {
    throw Object.assign(new Error("Single-keyframe GPT Image production accepts at most five ordered references."), { code: "single_keyframe_reference_limit_exceeded" });
  }
  if (isSingleKeyframe) {
    const panel = storyboard.panelSpecs[0];
    const shot = shotById.get(panel.shotId);
    if (!shot) throw Object.assign(new Error(`Storyboard panel references missing shot ${panel.shotId}.`), { code: "missing_shot_spec" });
    const visualStyle = renderKeyframeVisualStyle(visualBible.cinematography);
    const body = [
      section("参考", renderKeyframeReferences(referenceBindings)),
      section("单帧任务", [
        "只生成一个明确时刻的一张满幅叙事关键帧，不生成整段动作过程。",
        "不得把动作前后多个时刻同时画进一张图；不得输出拼贴、连环画、多宫格、接触表、六视图、角色设定板、文字、箭头、编号、水印或界面。",
        "导演台参考只锁定空间站位、视线轴、摄影机方位与前后景层级；代理人物、网格和线框不得进入最终画面。"
      ]),
      section("视觉风格", visualStyle),
      renderSingleKeyframePanel(panel, shot, 0),
      section("风格隔离", list(storyboard.styleIsolation).map((item) => `不得${item.replace(/^不得/u, "")}`))
    ];
    const prompt = manualOverride ? clean(manualPrompt) : body.filter(Boolean).join("\n\n");
    return envelope({ authority: storyboard, protocolId: "ununu.storyboard.keyframe.v1", prompt, generationParameters, referenceBindings, negatives: [...storyboard.styleIsolation, ...list(shot.mustNotAppearYet)], manualOverride });
  }
  const panels = storyboard.panelSpecs.map((panel, index) => {
    const shot = shotById.get(panel.shotId);
    if (!shot) throw Object.assign(new Error(`Storyboard panel references missing shot ${panel.shotId}.`), { code: "missing_shot_spec" });
    return [
      `画格${index + 1}「${clean(panel.label ?? shot.storyBeat)}」`,
      `本格叙事功能：${clean(shot.narrativeJob)}`,
      Number(shot.durationSeconds) > 0 ? `本格设计时长：${Number(shot.durationSeconds)}秒` : "",
      `开场状态：${clean(shot.openingState)}`,
      `触发与动作：${list(panel.actionPhase ?? shot.actionChain).join(" → ")}`,
      `结束状态：${clean(shot.endingState)}`,
      `人物调度：${record(shot.blocking)}`,
      `摄影执行：${record(panel.composition ?? shot.cinematography)}`,
      `表演：${record(panel.performance ?? shot.performance)}`,
      `剪辑承接：${record(shot.editContinuity)}`
    ].filter(Boolean).join("；") + "。";
  });
  const body = [
    section("参考图映射", renderReferences(referenceBindings)),
    section("故事板任务", [
      `布局：${storyboard.layout}`,
      `只用于锁定镜头信息、空间方向和动作相位，不把网格、画格编号或代理人物画风带入最终成片。`,
      `每个画格必须是本镜头中一个明确时刻的单张完整叙事帧；单画格任务必须满幅输出，禁止拼贴、接触表、六视图、角色设定板、服装板或资产展示板替代镜头画面。`,
      `画面必须让主体站位、视线目标、动作接触点、前后景层级和摄影机方位可被直接验收，不用文字、箭头、编号或UI解释。`
    ]),
    section("项目视觉连续性", [`视觉母题：${list(visualBible.visualMotifs).join("；")}`, `色彩弧线：${record(visualBible.colorArc)}`, `空间戏剧：${record(visualBible.spatialDramaturgy)}`]),
    section("有序画格", panels),
    section("连续性锁", [...list(storyboard.continuityLocks), ...list(visualBible.continuityLocks)]),
    section("风格隔离", list(storyboard.styleIsolation).map((item) => `不得${item.replace(/^不得/u, "")}`))
  ];
  const prompt = manualOverride ? clean(manualPrompt) : body.filter(Boolean).join("\n\n");
  return envelope({ authority: storyboard, protocolId: "ununu.storyboard.v2", prompt, generationParameters, referenceBindings, negatives: storyboard.styleIsolation, manualOverride });
}

export function routeAssetAuthorityRisk({ storyPacket, shots = [] }) {
  const text = JSON.stringify({ storyPacket, shots });
  const requirements = [];
  if (/(?:人物|角色|演员|面孔|五官|服装|妆发|身份)/u.test(text)) requirements.push({ authorityType: "character", reason: "人物身份、造型或表演连续性需要可验收的资产权威", riskLevel: /(?:换装|年龄变化|多人|特写|跨集)/u.test(text) ? "high" : "medium" });
  if (/(?:空间|场景|建筑|房间|路线|轴线|地理|全景)/u.test(text)) requirements.push({ authorityType: "scene", reason: "空间关系或场景连续性影响镜头调度", riskLevel: /(?:追逐|打斗|复杂空间|跨场)/u.test(text) ? "high" : "medium" });
  if (/(?:道具|证据|武器|产品|信物|交互|拿起|放下)/u.test(text)) requirements.push({ authorityType: "prop", reason: "关键道具承担叙事、接触或产品证明功能", riskLevel: /(?:武器|复杂接触|产品特写)/u.test(text) ? "high" : "medium" });
  return requirements;
}
