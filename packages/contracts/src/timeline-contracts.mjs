export const TIMELINE_TRACK_KINDS = Object.freeze(["video", "audio", "text", "subtitle", "effect"]);
export const TIMELINE_COMMAND_TYPES = Object.freeze([
  "move_clip", "trim_clip", "split_clip", "update_clip", "ripple_clip", "slip_clip", "snap_clip",
  "add_track", "update_track", "remove_track", "reorder_tracks",
  "add_transition", "update_transition", "remove_transition",
  "add_effect", "update_effect", "remove_effect",
  "add_marker", "update_marker", "remove_marker",
  "add_keyframe", "update_keyframe", "remove_keyframe"
]);
export const TIMELINE_COMMAND_STATES = Object.freeze(["applied", "undone", "redone"]);

function requireObject(value, label, issues) {
  if (!value || typeof value !== "object" || Array.isArray(value)) issues.push(`${label} must be an object`);
}

export function assertTimelineDocumentV2(value) {
  const issues = [];
  requireObject(value, "timeline", issues);
  for (const field of ["id", "title", "createdAt", "updatedAt"]) if (typeof value?.[field] !== "string" || !value[field].trim()) issues.push(`${field} is required`);
  if (!Number.isInteger(value?.frameRate) || value.frameRate < 1) issues.push("frameRate must be a positive integer");
  if (!Number.isInteger(value?.width) || value.width < 1 || !Number.isInteger(value?.height) || value.height < 1) issues.push("width and height must be positive integers");
  if (!Array.isArray(value?.tracks)) issues.push("tracks must be an array");
  else for (const [index, track] of value.tracks.entries()) {
    if (typeof track?.id !== "string" || !track.id) issues.push(`tracks[${index}].id is required`);
    if (!TIMELINE_TRACK_KINDS.includes(track?.kind)) issues.push(`tracks[${index}].kind is invalid`);
    if (!Number.isInteger(track?.order) || track.order < 0) issues.push(`tracks[${index}].order is invalid`);
  }
  if (!Array.isArray(value?.clips)) issues.push("clips must be an array");
  if (!Array.isArray(value?.transitions) || !Array.isArray(value?.effects) || !Array.isArray(value?.markers) || !Array.isArray(value?.keyframes)) issues.push("transitions, effects, markers and keyframes must be arrays");
  if (issues.length) throw Object.assign(new Error(`TimelineDocumentV2 validation failed: ${issues.join("; ")}`), { code: "invalid_timeline_document_v2", status: 500 });
  return value;
}

export function assertCommandReceipt(value) {
  const issues = [];
  requireObject(value, "receipt", issues);
  for (const field of ["commandId", "timelineId", "commandType", "status", "createdAt"]) if (typeof value?.[field] !== "string" || !value[field].trim()) issues.push(`${field} is required`);
  if (![...TIMELINE_COMMAND_TYPES, "undo", "redo"].includes(value?.commandType)) issues.push("commandType is invalid");
  if (!TIMELINE_COMMAND_STATES.includes(value?.status)) issues.push("status is invalid");
  if (!Array.isArray(value?.affectedClipIds) && !Array.isArray(value?.affectedResourceIds)) issues.push("affectedClipIds or affectedResourceIds must be an array");
  if (issues.length) throw Object.assign(new Error(`CommandReceipt validation failed: ${issues.join("; ")}`), { code: "invalid_command_receipt", status: 500 });
  return value;
}

export function assertStoryboardTimelineImportReceipt(value) {
  const issues = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) issues.push("receipt must be an object");
  for (const field of ["importId", "projectId", "storyboardId", "timelineId", "status"]) if (typeof value?.[field] !== "string" || !value[field].trim()) issues.push(`${field} is required`);
  for (const field of ["total", "processed", "added", "skipped", "failed"]) if (!Number.isInteger(value?.[field]) || value[field] < 0) issues.push(`${field} must be a non-negative integer`);
  if (!Array.isArray(value?.items)) issues.push("items must be an array");
  if (value && value.processed !== value.added + value.skipped + value.failed) issues.push("processed must equal added + skipped + failed");
  if (issues.length) throw Object.assign(new Error(`StoryboardTimelineImportReceipt validation failed: ${issues.join("; ")}`), { code: "invalid_storyboard_timeline_import_receipt", status: 500 });
  return value;
}
