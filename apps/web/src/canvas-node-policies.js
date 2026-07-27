import { IMAGE_GENERATION_TEMPLATES } from "@ununu/unutv-contracts";
export { imageGenerationStarterPrompt } from "@ununu/unutv-contracts";

export const IMAGE_DERIVATION_TYPES = IMAGE_GENERATION_TEMPLATES
  .filter((template) => !["freeform", "scene_panorama_equirectangular"].includes(template.id))
  .map((template) => [template.id, template.label]);

export function keepVideoPausedOutsideControls(event) {
  const video = event.currentTarget;
  const bounds = video.getBoundingClientRect();
  if (event.clientY >= bounds.bottom - Math.min(54, Math.max(36, bounds.height * .18))) return;
  event.preventDefault();
  video.pause();
}

export function primeVideoPreviewFrame(event) {
  const video = event.currentTarget;
  if (!Number.isFinite(video.duration) || video.duration <= 0 || video.currentTime > 0) return;
  video.currentTime = Math.min(0.1, video.duration / 2);
}

export function groupAsCanvasNode(group, projectId) {
  return { ...group, projectId, kind: "material", payload: { groupRole: "selection-group", memberNodeIds: group.nodeIds || [] } };
}
