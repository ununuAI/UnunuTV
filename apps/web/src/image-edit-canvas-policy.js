export const IMAGE_EDIT_TOOL_ITEMS = Object.freeze([
  Object.freeze({ value: "select", label: "选择", shortcut: "V" }),
  Object.freeze({ value: "brush", label: "画笔", shortcut: "B" }),
  Object.freeze({ value: "eraser", label: "橡皮", shortcut: "E" }),
  Object.freeze({ value: "mosaic", label: "马赛克", shortcut: "M" }),
  Object.freeze({ value: "gridMask", label: "网格", shortcut: "G" }),
  Object.freeze({ value: "rectangle", label: "矩形", shortcut: "R" }),
  Object.freeze({ value: "arrow", label: "箭头", shortcut: "A" }),
  Object.freeze({ value: "text", label: "文字", shortcut: "T" }),
  Object.freeze({ value: "number", label: "编号", shortcut: "N" }),
  Object.freeze({ value: "image", label: "图片", shortcut: "I" })
]);

export function imageEditDisplaySize(naturalWidth, naturalHeight, shortSide = 250) {
  const width = Number(naturalWidth);
  const height = Number(naturalHeight);
  if (!(width > 0) || !(height > 0)) return { width: shortSide, height: shortSide };
  if (width >= height) return { width: Math.round(shortSide * width / height), height: shortSide };
  return { width: shortSide, height: Math.round(shortSide * height / width) };
}

export function imageEditCanvasSize(ratio, fallback = { width: 1280, height: 720 }) {
  if (ratio === "16:9") return { width: 1280, height: 720 };
  if (ratio === "9:16") return { width: 720, height: 1280 };
  return { width: fallback.width || 1280, height: fallback.height || 720 };
}

export function imageEditPoint(event, canvas) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: Math.round((event.clientX - rect.left) * canvas.width / rect.width),
    y: Math.round((event.clientY - rect.top) * canvas.height / rect.height)
  };
}

export function createImageEditOperation(tool, start, options = {}) {
  const base = { type: tool, color: options.color || "#ff5b4d", size: Number(options.size) || 12 };
  if (["brush", "eraser", "mosaic", "gridMask"].includes(tool)) return { ...base, points: [start] };
  if (["rectangle", "arrow"].includes(tool)) return { ...base, start, end: start };
  if (tool === "text") return { ...base, point: start, text: options.text || "文字" };
  if (tool === "number") return { ...base, point: start, number: Number(options.number) || 1 };
  return null;
}

export function updateImageEditOperation(operation, point) {
  if (!operation) return operation;
  if (Array.isArray(operation.points)) return { ...operation, points: [...operation.points, point] };
  if (operation.end) return { ...operation, end: point };
  return operation;
}
