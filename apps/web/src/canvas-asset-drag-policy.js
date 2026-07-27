export const CANVAS_ASSET_TRANSFER_TYPE = "application/x-material-asset";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function inferKind(asset, version) {
  const explicit = text(version?.payload?.kind);
  if (["image", "video", "audio", "world"].includes(explicit)) return explicit;
  if (asset?.role === "world") return "world";
  const mime = text(version?.payload?.mime).toLowerCase();
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "image";
}

export function canvasAssetTransfer(asset, version, projectId) {
  if (!asset?.id || !version?.id || !version?.mediaId) return null;
  return {
    version: 1,
    assetId: asset.id,
    assetVersionId: version.id,
    title: text(asset.title) || "素材",
    role: text(asset.role) || "other",
    kind: inferKind(asset, version),
    mediaId: version.mediaId,
    ownerProjectId: version.ownerProjectId || asset.ownerProjectId || projectId,
    mime: text(version.payload?.mime),
    prompt: text(version.payload?.prompt),
    projection: text(version.payload?.projection),
    worldFormat: text(version.payload?.worldFormat || version.payload?.format)
  };
}

export function serializeCanvasAssetTransfer(asset, version, projectId) {
  const transfer = canvasAssetTransfer(asset, version, projectId);
  return transfer ? JSON.stringify(transfer) : "";
}

export function parseCanvasAssetTransfer(raw) {
  try {
    const value = JSON.parse(String(raw || ""));
    if (value?.version !== 1 || !text(value.assetId) || !text(value.assetVersionId) || !text(value.mediaId)) return null;
    if (!["image", "video", "audio", "world"].includes(value.kind)) return null;
    return value;
  } catch {
    return null;
  }
}

export function canvasNodeInputFromAssetTransfer(transfer, position = {}) {
  if (!transfer) return null;
  const base = {
    kind: transfer.kind,
    title: text(transfer.title) || "素材",
    x: Number.isFinite(position.x) ? position.x : 120,
    y: Number.isFinite(position.y) ? position.y : 160
  };
  const authority = {
    assetId: transfer.assetId,
    assetVersionId: transfer.assetVersionId,
    mediaOwnerProjectId: transfer.ownerProjectId
  };
  if (transfer.kind === "world") {
    return {
      ...base,
      payload: {
        ...authority,
        worldMediaId: transfer.mediaId,
        worldMediaIds: [transfer.mediaId],
        worldFormat: text(transfer.worldFormat) || (transfer.projection === "gaussian_splat" ? "splat" : "world"),
        worldProjection: text(transfer.projection) || "gaussian_splat"
      }
    };
  }
  return {
    ...base,
    payload: {
      ...authority,
      currentMediaId: transfer.mediaId,
      mediaIds: [transfer.mediaId],
      prompt: text(transfer.prompt)
    }
  };
}
