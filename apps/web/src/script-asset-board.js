function cleanName(value) {
  return typeof value === "string" ? value.trim() : "";
}

function splitProps(value) {
  return String(value || "").split(/[、，,;；]/u).map((item) => item.trim()).filter(Boolean);
}

function slotId(role, name) {
  return `${role}:${name}`;
}

export function extractScriptAssetSlots(rows = []) {
  const characters = new Map();
  const scenes = new Map();
  const props = new Map();
  for (const row of rows) {
    for (const [name, description] of [[row.character1, row.characterDescription1], [row.character2, row.characterDescription2]]) {
      const key = cleanName(name);
      if (!key || key === "-") continue;
      const current = characters.get(key) || { name: key, description: "", shotNumbers: [] };
      if (!current.description && cleanName(description)) current.description = description.trim();
      current.shotNumbers.push(row.shotNumber);
      characters.set(key, current);
    }
    const scene = cleanName(row.sceneKey);
    if (scene) {
      const current = scenes.get(scene) || { name: scene, description: "", shotNumbers: [] };
      if (!current.description && cleanName(row.timeState)) current.description = row.timeState.trim();
      current.shotNumbers.push(row.shotNumber);
      scenes.set(scene, current);
    }
    for (const name of splitProps(row.props)) {
      const current = props.get(name) || { name, description: "", shotNumbers: [] };
      current.shotNumbers.push(row.shotNumber);
      props.set(name, current);
    }
  }
  return [
    ...[...characters.values()].map((item) => ({ id: slotId("character", item.name), role: "character", ...item })),
    ...[...scenes.values()].map((item) => ({ id: slotId("scene", item.name), role: "scene", ...item })),
    ...[...props.values()].map((item) => ({ id: slotId("prop", item.name), role: "prop", ...item }))
  ];
}

export function mergeScriptAssetSlots(rows = [], saved = []) {
  const extracted = extractScriptAssetSlots(rows);
  const byId = new Map((Array.isArray(saved) ? saved : []).map((item) => [item.id, item]));
  return extracted.map((slot) => {
    const previous = byId.get(slot.id) || {};
    return {
      ...slot,
      description: previous.description || slot.description,
      nodeId: previous.nodeId || null,
      mediaId: previous.mediaId || null,
      assetId: previous.assetId || null,
      source: previous.source || null
    };
  });
}

function scoreMatch(slot, node) {
  const title = `${node.title || ""} ${node.payload?.assetId || ""}`.toLowerCase();
  const name = slot.name.toLowerCase();
  if (!title || !name) return 0;
  if (slot.role === "character" && (title.includes("char-xm") || title.includes("小明")) && (name.includes("小明") || name.includes("xm"))) return 8;
  if (slot.role === "character" && (title.includes("voice-xm") || title.includes("voice-rm"))) return 0;
  if (slot.role === "scene" && (title.includes("scene-entry") || title.includes("玄关")) && (name.includes("玄关") || name.includes("合租"))) return 8;
  if (title.includes(name) || name.includes(title)) return 6;
  return 0;
}

export function suggestCanvasBinding(slot, nodes = []) {
  const candidates = nodes
    .filter((node) => node.payload?.currentMediaId && ["image", "subject", "upload", "material", "historyPick", "audio"].includes(node.kind))
    .map((node) => ({ node, score: scoreMatch(slot, node) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score);
  return candidates[0]?.node || null;
}

export function applySuggestedBindings(slots, nodes = []) {
  return slots.map((slot) => {
    if (slot.nodeId && slot.mediaId) return slot;
    const node = suggestCanvasBinding(slot, nodes);
    if (!node) return slot;
    return {
      ...slot,
      nodeId: node.id,
      mediaId: node.payload.currentMediaId,
      source: "canvas"
    };
  });
}

export const SCRIPT_ASSET_ROLE_LABEL = Object.freeze({
  character: "角色",
  scene: "场景",
  prop: "道具",
  audio: "音色"
});

export function scriptAssetGeneratePrompt(slot) {
  if (slot.role === "character") {
    return [
      slot.description || `${slot.name}，真人短剧角色。`,
      "高质量专业角色四视图，横向构图，纯白色干净背景，中性摄影棚灯光，平光布光。",
      "布局：正面面部特写（占水平 1/3）+ 全身正面、左侧面、背面（占剩余 2/3，并列）。",
      "四个视图中面部特征、发型、体型和服装保持一致。空手，无道具，无环境，无文字水印。"
    ].join("");
  }
  if (slot.role === "scene") {
    return slot.description || `${slot.name}，空镜场景，无人物，固定陈设清晰，中性写实。`;
  }
  return slot.description || `${slot.name}，白色背景单件道具，完整可见，无手持。`;
}
