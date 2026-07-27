import { CANVAS_WORK_WINDOW_INSET, defaultCanvasWorkWindowFrame } from "./canvas-work-window-anchor-policy.js";

export const AUTOMATION_FLOW_WINDOW_INSET = CANVAS_WORK_WINDOW_INSET;

const MIN_WIDTH = 760;
const MIN_HEIGHT = 520;

const numberOr = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), Math.max(minimum, maximum));

export function constrainAutomationFlowFrame(frame, viewport) {
  const viewportWidth = Math.max(1, numberOr(viewport?.width, 1440));
  const viewportHeight = Math.max(1, numberOr(viewport?.height, 900));
  const maximumWidth = Math.max(320, viewportWidth - AUTOMATION_FLOW_WINDOW_INSET.left - AUTOMATION_FLOW_WINDOW_INSET.right);
  const maximumHeight = Math.max(320, viewportHeight - AUTOMATION_FLOW_WINDOW_INSET.top - AUTOMATION_FLOW_WINDOW_INSET.bottom);
  const minimumWidth = Math.min(MIN_WIDTH, maximumWidth);
  const minimumHeight = Math.min(MIN_HEIGHT, maximumHeight);
  const width = clamp(numberOr(frame?.width, maximumWidth), minimumWidth, maximumWidth);
  const height = clamp(numberOr(frame?.height, maximumHeight), minimumHeight, maximumHeight);
  const x = clamp(numberOr(frame?.x, AUTOMATION_FLOW_WINDOW_INSET.left), AUTOMATION_FLOW_WINDOW_INSET.left, viewportWidth - AUTOMATION_FLOW_WINDOW_INSET.right - width);
  const y = clamp(numberOr(frame?.y, AUTOMATION_FLOW_WINDOW_INSET.top), AUTOMATION_FLOW_WINDOW_INSET.top, viewportHeight - AUTOMATION_FLOW_WINDOW_INSET.bottom - height);
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
}

export function defaultAutomationFlowFrame(viewport) {
  return constrainAutomationFlowFrame(defaultCanvasWorkWindowFrame(viewport), viewport);
}

export function moveAutomationFlowFrame({ delta, frame, viewport }) {
  return constrainAutomationFlowFrame({
    ...frame,
    x: numberOr(frame?.x, 0) + numberOr(delta?.x, 0),
    y: numberOr(frame?.y, 0) + numberOr(delta?.y, 0)
  }, viewport);
}

export function resizeAutomationFlowFrame({ delta, frame, viewport }) {
  return constrainAutomationFlowFrame({
    ...frame,
    width: numberOr(frame?.width, 0) + numberOr(delta?.x, 0),
    height: numberOr(frame?.height, 0) + numberOr(delta?.y, 0)
  }, viewport);
}
