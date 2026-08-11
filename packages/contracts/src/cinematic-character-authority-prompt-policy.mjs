export const DEFAULT_CHARACTER_IDENTITY_BOARD_ID = "identity-master";
export const CHARACTER_AUTHORITY_IMAGE_OUTPUT_SPEC = Object.freeze({
  aspectRatio: "3:2",
  background: "opaque",
  count: 1,
  finalBackgroundColor: "#D2D2CE",
  height: 1024,
  resolution: "1536x1024",
  width: 1536
});

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

const DEFAULT_EXTERNAL_IDENTITY_APPEARANCE_BOARD = Object.freeze({
  boardId: DEFAULT_CHARACTER_IDENTITY_BOARD_ID,
  boardType: "appearance_external_identity",
  label: "虚拟人物配套造型母版",
  purpose: "只锁定服装、妆发、体态比例、轮廓与材质；面孔身份完全由已绑定的 Ark virtual_person_asset 负责，本图不得冒充或替代脸部身份来源",
  viewSpecIds: [],
  referencePolicy: "none",
  acceptanceCriteria: [
    "正背面造型、服装层次、发型轮廓、妆容强度、体态比例与鞋履完整可验收",
    "画面不声明、不复制、不推断虚拟人物的具体面孔五官",
    "用于视频时只承担 appearance reference，脸部身份由虚拟人物 ID 独占"
  ],
  prohibitedChanges: [
    "把普通生图声明成虚拟人物同源身份图",
    "用随机生成的面孔覆盖或竞争虚拟人物身份",
    "加入剧情动作、武器、伤势、文字、编号、水印或界面"
  ],
  required: true
});

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function characterAuthorityUsesExternalVirtualIdentity(authority) {
  return authority?.externalProviderIdentity?.provider === "ark"
    && authority?.externalProviderIdentity?.capability === "virtual_person_asset"
    && Boolean(text(authority?.externalProviderIdentity?.assetId));
}

export function characterAuthorityBoardSpecs(authority) {
  const explicit = Array.isArray(authority?.boardSpecs) ? authority.boardSpecs : [];
  const identity = explicit.find((entry) => entry?.boardId === DEFAULT_CHARACTER_IDENTITY_BOARD_ID);
  const usesExternalVirtualIdentity = characterAuthorityUsesExternalVirtualIdentity(authority);
  const baseBoard = usesExternalVirtualIdentity
    ? DEFAULT_EXTERNAL_IDENTITY_APPEARANCE_BOARD
    : DEFAULT_CHARACTER_IDENTITY_BOARD;
  const fallbackIdentity = authority?.subjectMode === "ensemble"
    ? {
        ...baseBoard,
        label: "群像变体身份母版",
        purpose: "锁定群体共同物种规则、时代服装、材质与变体边界，同时保留可辨识的个体差异"
      }
    : baseBoard;
  return [
    identity
      ? {
          ...fallbackIdentity,
          ...identity,
          boardType: usesExternalVirtualIdentity ? "appearance_external_identity" : "identity",
          required: true
        }
      : fallbackIdentity,
    ...explicit.filter((entry) => entry?.boardId !== DEFAULT_CHARACTER_IDENTITY_BOARD_ID)
  ];
}

export function renderCharacterAuthorityBoardLayout({ externalIdentityAppearance = false } = {}) {
  if (externalIdentityAppearance) {
    return [
      "输出一张单一服化造型母版：左侧为颈部以下的完整全身正面造型，右侧为完整全身背面造型；不做多宫格、接触表或重复时间布局。",
      "正面人物必须完全正对摄影机：双脚、骨盆、肩线与头部均保持正面，不得使用侧面或三分之四角度；背面人物必须完全背对摄影机。",
      "两个人物等比例、等高度、脚底位于同一水平线，头顶和脚底留白一致；人物占画面高度约百分之八十六，左右安全边距对称，不得裁切头、手、腿或鞋。",
      "头部只显示发型整体轮廓和背面结构；正面五官必须保持无身份的中性模特占位，不复制、不猜测、不强化任何具体人脸特征。",
      "服装分层、衣料、鞋履、发型轮廓、妆容强度、身高体态与身体比例在两视图中完全一致。",
      "人物轮廓之外必须使用单一、无渐变、无纹理的中性浅灰背景 #D2D2CE；不得输出摄影棚墙角、地平线、布景、道具或环境反射。系统会从画面边缘确定性识别背景并统一为该颜色。",
      "固定使用柔和均匀的正面漫射摄影棚光，白平衡 5600K，曝光和反差一致；只允许脚底下方极浅的接触阴影，不得形成戏剧性明暗或彩色环境光。",
      "本图只承担服装、妆发、轮廓、体态和材质职责；视频中的脸部身份只由已绑定的 Ark 虚拟人物资源负责。"
    ];
  }
  return [
    "横版画布固定分为左右两区：左侧约 60% 为 2×3 六个等尺寸面板，右侧约 40% 为一张大尺寸完整头肩特写。",
    "左侧上排依次为完整头部正面、标准侧面或清晰三分之四侧面、头部背面；下排依次为全身正面、标准侧面或清晰三分之四侧面、全身背面。",
    "右侧特写必须完整包含头顶、全部头发、发际线、双耳、完整脸型、下颌、颈部与双肩，不得裁切。",
    "六视图与特写保持同一面孔、头骨、五官比例、年龄、肤色、体型、发型和基础服装；中性站姿与中性表情，纯净摄影棚背景。",
    "身份母版只锁人物身份：双手自然放松且不持物，不展示武器、技能特效、伤势或剧情动作；这些内容必须进入引用已验收身份的独立道具、表演、技能或伤势板件。"
  ];
}

export function assertCharacterAuthorityImageOutputParameters(generationParameters, boardId) {
  if (boardId !== DEFAULT_CHARACTER_IDENTITY_BOARD_ID) return generationParameters;
  const spec = CHARACTER_AUTHORITY_IMAGE_OUTPUT_SPEC;
  const mismatches = [];
  for (const field of ["aspectRatio", "resolution", "background", "count"]) {
    if (generationParameters?.[field] !== spec[field]) {
      mismatches.push({ actual: generationParameters?.[field] ?? null, expected: spec[field], field });
    }
  }
  if (mismatches.length) {
    throw Object.assign(
      new Error("Character Authority identity/appearance boards must use the canonical opaque 1K landscape output parameters."),
      {
        code: "character_authority_image_output_parameters_invalid",
        details: { mismatches, required: spec },
        status: 409
      }
    );
  }
  return generationParameters;
}
