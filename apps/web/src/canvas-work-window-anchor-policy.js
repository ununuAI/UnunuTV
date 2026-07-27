export const CANVAS_WORK_WINDOW_INSET = Object.freeze({ left: 104, top: 66, right: 18, bottom: 18 });
export const PRIMARY_WORK_WINDOW_MAX_SIZE = Object.freeze({ width: 1180, height: 800 });

const numberOr = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function defaultCanvasWorkWindowAnchor(viewport) {
  const viewportWidth = Math.max(1, numberOr(viewport?.width, 1440));
  const viewportHeight = Math.max(1, numberOr(viewport?.height, 900));
  const availableWidth = Math.max(320, viewportWidth - CANVAS_WORK_WINDOW_INSET.left - CANVAS_WORK_WINDOW_INSET.right);
  const availableHeight = Math.max(280, viewportHeight - CANVAS_WORK_WINDOW_INSET.top - CANVAS_WORK_WINDOW_INSET.bottom);
  const referenceWidth = Math.min(PRIMARY_WORK_WINDOW_MAX_SIZE.width, availableWidth);
  const referenceHeight = Math.min(PRIMARY_WORK_WINDOW_MAX_SIZE.height, availableHeight);
  return {
    x: CANVAS_WORK_WINDOW_INSET.left + Math.max(0, (availableWidth - referenceWidth) / 2),
    y: CANVAS_WORK_WINDOW_INSET.top + Math.max(0, (availableHeight - referenceHeight) / 2)
  };
}

export function defaultCanvasWorkWindowFrame(viewport) {
  const viewportWidth = Math.max(1, numberOr(viewport?.width, 1440));
  const viewportHeight = Math.max(1, numberOr(viewport?.height, 900));
  const availableWidth = Math.max(320, viewportWidth - CANVAS_WORK_WINDOW_INSET.left - CANVAS_WORK_WINDOW_INSET.right);
  const availableHeight = Math.max(280, viewportHeight - CANVAS_WORK_WINDOW_INSET.top - CANVAS_WORK_WINDOW_INSET.bottom);
  const anchor = defaultCanvasWorkWindowAnchor(viewport);
  return {
    x: anchor.x,
    y: anchor.y,
    width: Math.min(PRIMARY_WORK_WINDOW_MAX_SIZE.width, availableWidth),
    height: Math.min(PRIMARY_WORK_WINDOW_MAX_SIZE.height, availableHeight)
  };
}
