const TEMPLATES = [
  ["freeform", "自由生成", "", []],
  ["actor_identity_board", "演员身份板（六视图＋整头特写）",
    "严格保持上游已确认演员的面孔、头骨比例、双耳、发际线、肤色、发长、年龄和体型，派生一张横版演员身份板：左侧 2×3 六视图，右侧大尺寸完整头肩特写；不得换人。",
    [
      "以上游已确认的演员图片为唯一身份参考，不得重新设计、替换、美化或年轻化面孔。",
      "横版画布固定分为左右两部分：左侧约占 60%，为 2 行×3 列六个等尺寸面板；上排依次是完整头部正面、侧面或清晰三分之四侧面、头部背面，下排依次是全身正面、侧面或清晰三分之四侧面、全身背面。",
      "右侧约占 40%，生成同一演员的大尺寸正面完整头肩特写；头顶、全部头发、发际线、双耳、完整脸型、下颌、颈部和双肩不得裁切。",
      "所有视图的脸、头骨比例、双耳、发际线、发长、体型、年龄、肤色和基础服必须完全一致；纯白摄影棚背景，不得添加道具、场景、其他人物、文字、编号、水印或 UI。"
    ]],
  ["costume_design_sheet", "服装款式资源板",
    "严格保持上游服装的款式、材质、颜色、配件、比例和穿法，生成同一套服装的横版款式资源板；不得重新设计。",
    ["固定展示同一套服装的正面、侧面、背面和关键细节，所有视图完全一致。", "只定义服装，不定义或替换人物面孔、发型、妆容和身份；不得出现文字、水印或其他方案。"]],
  ["hair_makeup_design_sheet", "妆造资源板",
    "严格保持上游妆造的发型长度、分缝、发尾、碎发和妆容色彩强度，生成无可辨认真人脸的横版妆造资源板；不得携带或替换演员身份。",
    ["展示同一妆造的正面、侧面、背面及发际线、发缝、鬓角、发尾和妆容材质细节。", "只能使用无身份特征的人台承载妆造，不得出现完整或可辨认的真人面孔，不得添加文字、水印或其他方案。"]],
  ["multi_camera_nine_grid", "多机位九宫格",
    "以上游画面为唯一内容参考，严格生成 3×3 共九个等尺寸面板的多机位构图板。",
    ["九个面板保持人物、服装、道具、场景和光线完全一致，只改变机位、景别或视角。", "面板边界清楚，不合并，不添加标题、编号、水印或说明文字。"]],
  ["multi_character_nine_grid", "多角色九宫格设定表",
    "严格生成 3×3 共九个等尺寸面板的多角色设定表，角色身份与顺序以用户文案和参考图为准。",
    ["每个面板只出现一名指定角色，使用一致背景、画幅和全身构图；不得重复、串脸或新增角色。", "主体完整，不裁切头、手、腿或鞋，不添加文字、水印或 UI。"]],
  ["story_progression_four_grid", "剧情推演四宫格",
    "严格生成 2×2 共四个等尺寸面板的连续剧情推演板。",
    ["按左上、右上、左下、右下呈现同一段动作的四个连续状态，角色、服装、场景和光线必须一致。", "不添加标题、编号、水印或说明文字。"]],
  ["character_face_three_view", "角色脸部三视图",
    "生成同一角色的脸部三视图：正面、标准侧面、背面，严格保持身份和妆造一致。",
    ["严格 1×3 三个等尺寸面板；保持脸型、头骨、双耳、发际线、发型、年龄、肤色和光线完全一致。", "中性摄影棚背景，头部完整，不添加文字、水印或 UI。"]],
  ["character_fullbody_three_view", "角色全身三视图",
    "生成同一角色的全身三视图：正面、标准侧面、背面，严格保持人物与服装一致。",
    ["严格 1×3 三个等尺寸面板；中性站姿，双臂自然下垂。", "主体从头到鞋完整入镜，不裁切，不添加文字、水印或 UI。"]],
  ["character_six_view", "角色六视图",
    "生成同一角色的 2×3 六视图：上排头肩正面、侧面、背面；下排全身正面、侧面、背面。",
    ["六个面板的身份、脸型、发型、服装、身材、年龄和配色必须完全一致。", "主体完整、边界清楚，不裁切，不添加文字、水印或 UI。"]],
  ["character_design_sheet", "角色设定图",
    "以上游人物为唯一身份参考，生成同一角色的完整角色设定图，严格保持面孔、体型、发型、服装和配色一致。",
    ["包含主视图、必要的全身或局部结构与连续性细节，不得生成不同身份或不同方案。", "使用中性背景，不添加无关剧情、文字、水印或 UI。"]],
  ["scene_design_sheet", "场景设定图",
    "以上游场景为唯一空间与外观参考，生成同一场景的完整设定图。",
    ["保持建筑结构、门窗、固定陈设、材质、色彩和空间关系一致，只补充可执行的场景细节。", "不得改变空间拓扑，不得加入人物、文字、水印或 UI。"]],
  ["scene_authority_multiview", "场景权威多视角",
    "生成同一场景的权威多视角资料，所有视图必须共享完全一致的空间结构、固定陈设、材质和光线。",
    ["不同视图只改变观察机位，不改变门窗位置、房间比例、物体数量或空间拓扑。", "不得加入人物、文字、水印或 UI。"]],
  ["scene_cubemap_six_faces", "场景立方体六面图",
    "生成同一观察点的立方体六面图：前、后、左、右、上、下，六面必须无缝对应。",
    ["六个正方形面板使用一致的曝光、材质与空间几何，边缘内容连续，可用于 cubemap。", "不得使用普通多视角拼图代替，不得加入人物、文字、水印或 UI。"]],
  ["product_design_sheet", "产品 / 道具设定图",
    "以上游产品或道具为唯一身份参考，生成同一物件的完整设定图。",
    ["展示正面、侧面、背面、结构与关键材质细节，形状、比例、颜色、标识和磨损必须一致。", "不得生成其他款式、场景、人物、文字说明、水印或 UI。"]],
  ["storyboard_25_grid", "25 宫格连续分镜",
    "严格生成 5×5 共二十五个等尺寸面板的连续分镜板。",
    ["按从左到右、从上到下的顺序呈现连续镜头；人物身份、服装、场景和动作因果必须连续。", "面板边界清楚，不缺格、不合并，不添加标题、编号、水印或 UI。"]],
  ["cinematic_lighting_correction", "电影级光影校正",
    "严格保持原图人物身份、构图、场景结构和物体位置不变，只进行电影级光影、曝光、色彩和材质响应校正。",
    ["不得改脸、改发型、改服装、增删人物或物体，不得改变机位、透视和画幅。", "保留真实材质与肤色层次，避免过度锐化、磨皮、HDR 和生成式重绘痕迹。"]],
  ["scene_panorama_equirectangular", "720°完整环境全景",
    "以上游场景为唯一空间与外观参考，生成 2:1 等距柱状投影的 720°完整环境全景图。",
    ["左右边缘必须水平无缝衔接，覆盖完整 360° 水平和 180° 垂直视野；顶部与底部连续，不得生成普通广角照片。", "保持场景结构、门窗、固定陈设和材质一致，不得加入文字、水印或 UI。"]]
];

const TEMPLATE_RECORDS = Object.freeze(TEMPLATES.map(([id, label, starterPrompt, instructions]) => Object.freeze({
  id,
  instructions: Object.freeze(instructions),
  label,
  starterPrompt
})));
const TEMPLATE_BY_ID = new Map(TEMPLATE_RECORDS.map((template) => [template.id, template]));

export const IMAGE_GENERATION_TEMPLATES = TEMPLATE_RECORDS;

export function getImageGenerationTemplate(templateId = "freeform") {
  return TEMPLATE_BY_ID.get(templateId === "panorama_equirectangular" ? "scene_panorama_equirectangular" : templateId) || TEMPLATE_BY_ID.get("freeform");
}

export function imageGenerationStarterPrompt(templateId) {
  return getImageGenerationTemplate(templateId).starterPrompt;
}

export function resolveImageGenerationTemplateIdForNode(node) {
  const type = node?.payload?.imageNodeType ?? node?.data?.imageNodeType;
  if (type === "panorama_equirectangular") return "scene_panorama_equirectangular";
  return TEMPLATE_BY_ID.has(type) ? type : "freeform";
}

export function compileImageGenerationPrompt(userPrompt, templateId = "freeform") {
  const template = getImageGenerationTemplate(templateId);
  const prompt = typeof userPrompt === "string" ? userPrompt.trim() : "";
  if (!template.instructions.length) return prompt;
  const marker = `【固定生成预设：${template.label}】`;
  if (prompt.includes(marker)) return prompt;
  const content = prompt || template.starterPrompt;
  return [content, "", marker, ...template.instructions.map((line) => `- ${line}`), "- 上述预设是必须执行的硬性版式约束，不能被普通用户文案削弱或覆盖。"].join("\n").trim();
}
