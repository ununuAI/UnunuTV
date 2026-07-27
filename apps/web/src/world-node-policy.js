import { mediaCandidatesForNode, mediaUrlForNode } from "./media-candidate-policy.js";

const WORLD_INPUT_KINDS = new Set(["image", "subject", "upload", "material", "historyPick", "imageEdit", "asset"]);

function candidate(node, mediaId, origin) {
  if (!node || !mediaId) return null;
  return {
    mediaId,
    node,
    origin,
    title: node.title || "世界全景",
    url: mediaUrlForNode(node, mediaId)
  };
}

export function worldMediaCandidates(node, connectedNodes = []) {
  const splatMediaIds = new Set([node?.payload?.worldMediaId, ...(node?.payload?.worldMediaIds || [])].filter(Boolean));
  const ownMedia = mediaCandidatesForNode(node).filter((mediaId) => !splatMediaIds.has(mediaId)).map((mediaId) => candidate(node, mediaId, "world"));
  const connectedMedia = connectedNodes
    .filter((input) => WORLD_INPUT_KINDS.has(input?.kind))
    .map((input) => candidate(input, input.payload?.currentMediaId, "connected"));
  const ordered = [
    candidate(node, node?.payload?.currentMediaId, "world"),
    ...ownMedia,
    ...connectedMedia
  ].filter(Boolean);
  const seen = new Set();
  return ordered.filter((item) => {
    if (!item.url || seen.has(item.mediaId)) return false;
    seen.add(item.mediaId);
    return true;
  });
}

export function worldNodeState(node, connectedNodes = []) {
  const candidates = worldMediaCandidates(node, connectedNodes);
  const currentMediaId = node?.payload?.currentMediaId;
  const current = candidates.find((item) => item.mediaId === currentMediaId) || candidates[0] || null;
  return {
    current,
    history: candidates.filter((item) => item.mediaId !== current?.mediaId).slice(0, 4),
    worldMediaId: node?.payload?.worldMediaId || null,
    worldFormat: node?.payload?.worldFormat || null,
    error: typeof node?.payload?.error === "string" ? node.payload.error.trim() : "",
    loading: node?.payload?.generationStatus === "running" || node?.payload?.loading === true
  };
}

export function worldQualityOptions(payload = {}) {
  const values = Array.isArray(payload.worldQualities)
    ? payload.worldQualities
    : Array.isArray(payload.worldInfo?.availableQualities)
      ? payload.worldInfo.availableQualities
      : [];
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim().toLowerCase()))];
}

export function worldPreviewSize(payload = {}) {
  const width = Number(payload.worldInfo?.cover_image?.width || payload.mediaWidth || 0);
  const height = Number(payload.worldInfo?.cover_image?.height || payload.mediaHeight || 0);
  if (!(width > 0) || !(height > 0)) return { width: 333, height: 250 };
  return width >= height
    ? { width: Math.round(250 * (width / height)), height: 250 }
    : { width: 250, height: Math.round(250 * (height / width)) };
}

const WORLD_HISTORY_EXPANDED_POSITIONS = Object.freeze([
  Object.freeze({ left: 516, top: 0 }),
  Object.freeze({ left: 0, top: -266 }),
  Object.freeze({ left: 516, top: -266 })
]);

export function worldHistoryExpandedPosition(index) {
  const normalized = Number.isInteger(index) && index >= 0 ? index : 0;
  return WORLD_HISTORY_EXPANDED_POSITIONS[normalized] || WORLD_HISTORY_EXPANDED_POSITIONS[0];
}

export function worldExportNodeInput(source, media) {
  return {
    kind: "image",
    title: `${source?.title || "世界"} · 全景图`,
    x: Number(source?.x || 0) + Number(source?.width || 333) + 120,
    y: Number(source?.y || 0),
    payload: {
      currentMediaId: media.mediaId,
      mediaIds: [media.mediaId],
      mediaOwnerProjectId: media.node?.payload?.mediaOwnerProjectId || media.node?.projectId,
      sourceNodeId: source?.id,
      imageNodeType: "scene_panorama_equirectangular",
      prompt: "批准世界全景图；保持当前空间、几何与环境权威。"
    }
  };
}
