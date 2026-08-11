import { resolveNodePromptCapability } from "@ununu/unutv-contracts";

export const INVISIBLE_NODE_RESIZE_HANDLES = Object.freeze([
  Object.freeze({ position: "top-left", cursor: "nwse-resize" }),
  Object.freeze({ position: "top-right", cursor: "nesw-resize" }),
  Object.freeze({ position: "bottom-left", cursor: "nesw-resize" }),
  Object.freeze({ position: "bottom-right", cursor: "nwse-resize" }),
]);

export function shouldShowNodePrompt({ expanded = false, kind, node = null, selected = false, selectionCount = 0 } = {}) {
  const capability = resolveNodePromptCapability(node ?? { kind, payload: {} });
  return Boolean(
    selected
    && selectionCount === 1
    && !expanded
    && capability.promptCapable
    && capability.surface === "generic"
  );
}

export function shouldEnableInvisibleNodeResize({ readOnly = false } = {}) {
  return !readOnly;
}
