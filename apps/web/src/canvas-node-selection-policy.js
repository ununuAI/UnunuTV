// Video surfaces own their selected-state Prompt inside MomoVideoNode. Rendering
// the generic floating Prompt as well creates a duplicate card below the node.
const NON_PROMPT_NODE_KINDS = new Set([
  "director", "cinematic", "storyboard", "shot", "generationUnit", "qa",
  "video", "videoShot", "compose", "video-clip"
]);

export const INVISIBLE_NODE_RESIZE_HANDLES = Object.freeze([
  Object.freeze({ position: "top-left", cursor: "nwse-resize" }),
  Object.freeze({ position: "top-right", cursor: "nesw-resize" }),
  Object.freeze({ position: "bottom-left", cursor: "nesw-resize" }),
  Object.freeze({ position: "bottom-right", cursor: "nwse-resize" }),
]);

export function shouldShowNodePrompt({ expanded = false, kind, selected = false, selectionCount = 0, worldProviderReady = false } = {}) {
  if (kind === "world" && !worldProviderReady) return false;
  return Boolean(selected && selectionCount === 1 && !expanded && !NON_PROMPT_NODE_KINDS.has(kind));
}

export function shouldEnableInvisibleNodeResize({ readOnly = false } = {}) {
  return !readOnly;
}
