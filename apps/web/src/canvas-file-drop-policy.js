export const MAX_CANVAS_MEDIA_FILE_BYTES = 28 * 1024 * 1024;
export const MAX_CANVAS_IMAGE_FILE_BYTES = MAX_CANVAS_MEDIA_FILE_BYTES;

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function isCanvasImageFile(file) {
  return Boolean(file && text(file.type).toLowerCase().startsWith("image/"));
}

export function isCanvasAudioFile(file) {
  return Boolean(file && text(file.type).toLowerCase().startsWith("audio/"));
}

export function isCanvasMediaFile(file) {
  return isCanvasImageFile(file) || isCanvasAudioFile(file);
}

export function canvasMediaFiles(dataTransfer) {
  return Array.from(dataTransfer?.files || []).filter(isCanvasMediaFile);
}

export function canvasImageFiles(dataTransfer) {
  return Array.from(dataTransfer?.files || []).filter(isCanvasImageFile);
}

export function canvasMediaNodeInputFromFile(file, position = {}, index = 0) {
  if (!isCanvasMediaFile(file)) return null;
  const fileName = text(file.name);
  const kind = isCanvasAudioFile(file) ? "audio" : "image";
  const title = fileName.replace(/\.[^.]+$/, "").trim() || (kind === "audio" ? "导入音频" : "导入图片");
  const offset = Math.max(0, Number(index) || 0) * 36;
  return {
    kind,
    title,
    x: (Number.isFinite(position.x) ? position.x : 120) + offset,
    y: (Number.isFinite(position.y) ? position.y : 160) + offset,
    payload: kind === "audio" ? { text: "", refs: [] } : { prompt: "", refs: [] }
  };
}

export function canvasImageNodeInputFromFile(file, position = {}, index = 0) {
  return isCanvasImageFile(file) ? canvasMediaNodeInputFromFile(file, position, index) : null;
}
