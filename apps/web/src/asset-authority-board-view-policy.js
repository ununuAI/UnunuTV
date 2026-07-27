const BOARD_LABELS = Object.freeze({
  "identity-master": "身份母版",
  "performance-range": "表演范围",
  "fire-talisman-skill": "火符 / 五雷",
  "fire-talisman-crowd": "火符破阵",
  "five-thunder-finisher": "五雷终结",
  "injury-continuity": "伤势连续性",
  "sword-sheath-combat": "刀鞘近战",
  "sword-sheath-crowd-combat": "刀鞘破阵",
  "boss-backstab": "鬼将背刺",
  "spear-combat": "长枪 / 断枪",
  "spear-crowd-combat": "长枪协作",
  "broken-spear-boss-combat": "断枪 / 右腕",
  "combat-power": "压制动作",
  "damage-continuity": "损伤连续性",
  "backface-structure": "脑后结构",
  "crowd-combat": "群体战斗",
  "space-master": "空间母版",
  "layout-plan": "布景平面",
  "lighting-states": "灯光连续性",
  "destruction-states": "破坏连续性"
});

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function assetAuthorityBoardLabel(boardId, fallback = "") {
  return BOARD_LABELS[clean(boardId)] || clean(fallback) || clean(boardId) || "历史板件";
}

export function assetAuthorityBoardHistory(node, mediaIds = []) {
  const payload = node?.payload || {};
  const records = Array.isArray(payload.authorityMediaVersions) ? payload.authorityMediaVersions : [];
  const byMediaId = new Map(records.filter((entry) => clean(entry?.mediaId)).map((entry) => [entry.mediaId, entry]));
  const identityFallbackAllowed = ["character", "creature"].includes(payload.assetType);
  return mediaIds.map((mediaId, index) => {
    const record = byMediaId.get(mediaId) || null;
    const isCurrent = mediaId === payload.currentMediaId;
    const boardId = clean(record?.boardId) || (isCurrent ? clean(payload.authorityBoardId || payload.activeAuthorityBoardId) : "") || (identityFallbackAllowed && index === 0 ? "identity-master" : "");
    const label = assetAuthorityBoardLabel(boardId, record?.label || (isCurrent ? payload.generationMessage?.replace(/候选图已生成$/u, "") : ""));
    return {
      assetVersionId: clean(record?.assetVersionId) || null,
      authorityRevision: Number(record?.authorityRevision) || null,
      boardId: boardId || null,
      isCurrent,
      label: label === "历史板件" ? `历史板件 ${index + 1}` : label,
      mediaId,
      reviewState: clean(record?.reviewState) || null
    };
  });
}
