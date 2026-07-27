export const IMAGE_EDIT_HISTORY_LIMIT = 10;
export const IMAGE_EDIT_DOCUMENT_VERSION = 1;
export const IMAGE_EDIT_TOOLS = Object.freeze([
  "select",
  "brush",
  "eraser",
  "mosaic",
  "gridMask",
  "rectangle",
  "arrow",
  "text",
  "number",
  "image"
]);
export const IMAGE_EDIT_RATIOS = Object.freeze(["free", "16:9", "9:16"]);

function finiteDimension(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : fallback;
}

function invalid(code, message, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function objectValue(value, field, fallback = {}) {
  if (value === undefined) return fallback;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid("image_edit_document_invalid", `${field} must be an object`);
  return value;
}

function normalizeOperation(operation, index) {
  const value = objectValue(operation, `operations[${index}]`);
  if (typeof value.type !== "string" || !IMAGE_EDIT_TOOLS.includes(value.type)) {
    throw invalid("image_edit_operation_invalid", `operations[${index}].type is not supported`);
  }
  return { ...value, type: value.type };
}

export function normalizeImageEditDocument(input = {}) {
  const value = objectValue(input, "document", {});
  const ratio = IMAGE_EDIT_RATIOS.includes(value.canvas?.ratio) ? value.canvas.ratio : "free";
  const operations = Array.isArray(value.operations) ? value.operations : [];
  if (operations.length > 1000) throw invalid("image_edit_operation_limit", "图片编辑操作不能超过 1000 条", 409);
  return {
    version: IMAGE_EDIT_DOCUMENT_VERSION,
    sourceMediaId: typeof value.sourceMediaId === "string" && value.sourceMediaId ? value.sourceMediaId : null,
    canvas: {
      width: finiteDimension(value.canvas?.width, 1280),
      height: finiteDimension(value.canvas?.height, 720),
      ratio,
      backgroundColor: typeof value.canvas?.backgroundColor === "string" && value.canvas.backgroundColor ? value.canvas.backgroundColor : "#ffffff"
    },
    operations: operations.map(normalizeOperation),
    updatedAt: typeof value.updatedAt === "string" && value.updatedAt ? value.updatedAt : new Date().toISOString()
  };
}

export function normalizeImageEditHistory(mediaIds = [], limit = IMAGE_EDIT_HISTORY_LIMIT) {
  const result = [];
  for (const mediaId of mediaIds) {
    if (typeof mediaId !== "string" || !mediaId || result.includes(mediaId)) continue;
    result.push(mediaId);
    if (result.length >= limit) break;
  }
  return result;
}
