import {
  CANVAS_WORK_WINDOW_INSET,
  PRIMARY_WORK_WINDOW_MAX_SIZE,
  defaultCanvasWorkWindowFrame
} from "./canvas-work-window-anchor-policy.js";

export const CINEMATIC_CONTROL_WINDOW_INSET = CANVAS_WORK_WINDOW_INSET;
export const CINEMATIC_CONTROL_WINDOW_MIN_SIZE = Object.freeze({ width: 680, height: 460 });
export const CINEMATIC_CONTROL_WINDOW_MAX_SIZE = PRIMARY_WORK_WINDOW_MAX_SIZE;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function availableSize(viewport) {
  return {
    width: Math.max(320, Number(viewport?.width || 0) - CINEMATIC_CONTROL_WINDOW_INSET.left - CINEMATIC_CONTROL_WINDOW_INSET.right),
    height: Math.max(280, Number(viewport?.height || 0) - CINEMATIC_CONTROL_WINDOW_INSET.top - CINEMATIC_CONTROL_WINDOW_INSET.bottom)
  };
}

export function constrainCinematicControlFrame(frame, viewport) {
  const available = availableSize(viewport);
  const minimumWidth = Math.min(CINEMATIC_CONTROL_WINDOW_MIN_SIZE.width, available.width);
  const minimumHeight = Math.min(CINEMATIC_CONTROL_WINDOW_MIN_SIZE.height, available.height);
  const width = clamp(Number(frame?.width || minimumWidth), minimumWidth, available.width);
  const height = clamp(Number(frame?.height || minimumHeight), minimumHeight, available.height);
  return {
    x: clamp(Number(frame?.x || CINEMATIC_CONTROL_WINDOW_INSET.left), CINEMATIC_CONTROL_WINDOW_INSET.left, Math.max(CINEMATIC_CONTROL_WINDOW_INSET.left, Number(viewport?.width || 0) - CINEMATIC_CONTROL_WINDOW_INSET.right - width)),
    y: clamp(Number(frame?.y || CINEMATIC_CONTROL_WINDOW_INSET.top), CINEMATIC_CONTROL_WINDOW_INSET.top, Math.max(CINEMATIC_CONTROL_WINDOW_INSET.top, Number(viewport?.height || 0) - CINEMATIC_CONTROL_WINDOW_INSET.bottom - height)),
    width,
    height
  };
}

export function defaultCinematicControlFrame(viewport) {
  return constrainCinematicControlFrame(defaultCanvasWorkWindowFrame(viewport), viewport);
}

export function moveCinematicControlFrame({ frame, delta, viewport }) {
  return constrainCinematicControlFrame({ ...frame, x: frame.x + delta.x, y: frame.y + delta.y }, viewport);
}

export function resizeCinematicControlFrame({ frame, delta, viewport }) {
  return constrainCinematicControlFrame({ ...frame, width: frame.width + delta.x, height: frame.height + delta.y }, viewport);
}
