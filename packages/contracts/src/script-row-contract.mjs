// 分镜脚本行是平台契约。表头、模型 JSON、解析器共用这一份，不进用户 Prompt。
export const SCRIPT_ROW_FIELDS = Object.freeze([
  Object.freeze({ key: "sceneId", label: "场次" }),
  Object.freeze({ key: "sceneShotNumber", label: "场内镜号" }),
  Object.freeze({ key: "dramaticBeat", label: "戏剧节拍" }),
  Object.freeze({ key: "groupNumber", label: "生成组" }),
  Object.freeze({ key: "shotNumber", label: "镜号" }),
  Object.freeze({ key: "duration", label: "时长" }),
  Object.freeze({ key: "takeType", label: "镜头类型" }),
  Object.freeze({ key: "sceneKey", label: "场景资产" }),
  Object.freeze({ key: "timeState", label: "时间状态" }),
  Object.freeze({ key: "paletteRef", label: "Palette 引用" }),
  Object.freeze({ key: "sceneDescription", label: "画面描述" }),
  Object.freeze({ key: "character1", label: "角色1" }),
  Object.freeze({ key: "characterDescription1", label: "角色描述1" }),
  Object.freeze({ key: "characterPsychology1", label: "角色心理1" }),
  Object.freeze({ key: "microExpression1", label: "微表情1" }),
  Object.freeze({ key: "humanImperfection1", label: "真人细节1" }),
  Object.freeze({ key: "characterState1", label: "表演状态1" }),
  Object.freeze({ key: "character2", label: "角色2" }),
  Object.freeze({ key: "characterDescription2", label: "角色描述2" }),
  Object.freeze({ key: "characterPsychology2", label: "角色心理2" }),
  Object.freeze({ key: "microExpression2", label: "微表情2" }),
  Object.freeze({ key: "humanImperfection2", label: "真人细节2" }),
  Object.freeze({ key: "characterState2", label: "表演状态2" }),
  Object.freeze({ key: "shotSize", label: "景别" }),
  Object.freeze({ key: "atmosphere", label: "氛围" }),
  Object.freeze({ key: "lighting", label: "灯光" }),
  Object.freeze({ key: "sound", label: "声音设计" }),
  Object.freeze({ key: "dialogueSpeaker", label: "说话人" }),
  Object.freeze({ key: "dialogue", label: "台词" }),
  Object.freeze({ key: "dialogueDelivery", label: "台词语气" }),
  Object.freeze({ key: "dialogueSubtext", label: "潜台词" }),
  Object.freeze({ key: "dialoguePause", label: "台词停顿" }),
  Object.freeze({ key: "voiceoverTrackId", label: "旁白轨" }),
  Object.freeze({ key: "voiceoverFlow", label: "旁白衔接" }),
  Object.freeze({ key: "voiceover", label: "旁白" }),
  Object.freeze({ key: "voiceoverPause", label: "旁白停顿" }),
  Object.freeze({ key: "props", label: "道具" }),
  Object.freeze({ key: "imagePrompt", label: "分镜提示词" }),
  Object.freeze({ key: "videoPrompt", label: "运镜计划" })
]);

export const SCRIPT_REVIEW_FIELDS = Object.freeze([
  Object.freeze({ key: "sceneId", label: "场次" }),
  Object.freeze({ key: "shotNumber", label: "镜号" }),
  Object.freeze({ key: "duration", label: "时长" }),
  Object.freeze({ key: "sceneDescription", label: "画面描述" }),
  Object.freeze({ key: "shotSize", label: "景别" }),
  Object.freeze({ key: "lighting", label: "光影氛围" }),
  Object.freeze({ key: "dialogue", label: "对白/旁白" }),
  Object.freeze({ key: "sound", label: "音效" }),
  Object.freeze({ key: "videoPrompt", label: "运镜" })
]);

export function scriptRowFieldValue(row, key) {
  if (!row || typeof row !== "object") return "";
  if (key === "sceneId") return typeof row.sceneId === "string" && row.sceneId.trim() ? row.sceneId.trim() : "SC01";
  if (key === "sceneShotNumber") {
    const value = Number(row.sceneShotNumber ?? row.shotNumber);
    return Number.isFinite(value) && value > 0 ? String(value) : "";
  }
  if (key === "dramaticBeat") return typeof row.dramaticBeat === "string" && row.dramaticBeat.trim() ? row.dramaticBeat.trim() : "推进";
  if (key === "sceneDescription") {
    const text = [row.plotDescription, row.sceneDescription, row.label].find((value) => typeof value === "string" && value.trim());
    return text ? text.trim() : "";
  }
  if (key === "lighting") {
    const text = [row.lighting, row.atmosphere].filter((value) => typeof value === "string" && value.trim()).join("；");
    return text;
  }
  if (key === "dialogue") {
    const text = [row.dialogue, row.voiceover].filter((value) => typeof value === "string" && value.trim()).join(" / ");
    return text;
  }
  if (key === "duration") return typeof row.duration === "string" && row.duration.trim() ? row.duration.trim() : "";
  const value = row[key];
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

export function scriptRowMissingFields(row, fields = SCRIPT_ROW_FIELDS) {
  return fields.filter((field) => !scriptRowFieldValue(row, field.key));
}

const SCRIPT_ROW_KEYS = SCRIPT_ROW_FIELDS.map((field) => field.key);

export function scriptRowSystemPrompt() {
  return [
    "你是 Ununu AI 短剧脚本结构化助手。",
    "用户只负责输入故事和可选创作意图，不需要知道 JSON 字段、结构格式或制作规则；这些都是平台内置契约。",
    "用户提示词可以为空。为空时必须只根据输入剧本生成完整、准确、可拍的分镜脚本。",
    "用户填写的内容只是额外约束，不能替代剧本，也不能省略表头字段。",
    "只返回合法 JSON，不要 Markdown，不要解释。",
    "返回对象必须包含 title 和 rows。",
    `rows 每项必须包含：${SCRIPT_ROW_KEYS.join("、")}。`,
    "所有用户可见内容必须使用简体中文；禁止把图像提示词或运镜计划自动改写为英文。",
    "characterDescription 是年龄、脸型、发型、体型、固定服装和稳定真人纹理，同名角色在所有镜头必须逐字一致。",
    "characterPsychology 写当前目标、欲望、恐惧、认知冲突和心理转折。",
    "microExpression 必须写眼神焦点、眉眼张力、嘴唇/下颌、呼吸/吞咽、头部/重心及起承收，不得只写抽象情绪。",
    "humanImperfection 只写当前镜头可见的汗、泪痕、碎发、皮肤细微不均、衣物皱褶、眨眼延迟或动作迟疑，不得随机改变身份。",
    "characterState 写摄影机可见的动作和姿势。",
    "dialogueSpeaker 写说话人；dialogue 只写台词；dialogueDelivery 固定包含音色、语速、语调、克制程度和情绪；dialogueSubtext 写角色真正想得到或隐瞒什么；dialoguePause 写明确停顿与换气。",
    "旁白使用独立声音轨：同一段跨镜头旁白的 voiceoverTrackId 必须相同；voiceoverFlow 只能是开始、延续、暂停、结束或空字符串；voiceover 只写当前镜头时段实际朗读片段；voiceoverPause 写明确停顿时长。",
    "一行必须对应一个决策镜，一镜一主可见变化。禁止把整集、整场或几十秒压成一行。",
    "sceneId 使用 SC01、SC02；地点、时间、内外景或主要连续行动明显改变时建立新场次，时长本身不决定换场。",
    "sceneShotNumber 在每个场次内从 1 连续编号；dramaticBeat 写本镜在场内承担的建立、推进、反应、转折、高潮或余韵。",
    "groupNumber 是生成组兼容字段，从 1 起编。生成组约 15 秒、约 3 到 4 个决策镜；不得跨 sceneId，也不得当成场次。",
    "takeType 只能是 standard_shot 或 continuous_take。continuous_take 只表示这一行与同一生成组相邻行属于同一条不切的连续机位，仍必须拆成多行，每行只写本段可见变化和本段台词。",
    "每行只描述一个决策镜；切换机位、改变景别、换一句对白或明确切镜时必须拆成新行。",
    "用户未指定总时长或镜头数量时，根据故事篇幅、动作复杂度和短剧节奏自动规划。",
    "保持人物、服装、道具、场景和事件一致。"
  ].join("");
}
