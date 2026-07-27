function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function providerReferenceMediaIds({
  connectedReferenceMediaIds = [],
  explicitReferenceMediaIds = [],
  isVideo = false,
  mode,
  ownReferenceMediaIds = [],
  parameters = {}
} = {}) {
  if (!isVideo) return unique([...ownReferenceMediaIds, ...connectedReferenceMediaIds, ...explicitReferenceMediaIds]);
  if (mode === "text_to_video") return [];
  if (mode === "first_frame") return unique([parameters.firstFrameMediaId]);
  if (mode === "first_last_frame") return unique([parameters.firstFrameMediaId, parameters.lastFrameMediaId]);
  return unique([...connectedReferenceMediaIds, ...explicitReferenceMediaIds]);
}

function mappedReferenceLabel(text, index) {
  const escapedIndex = String(index).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(text || "").match(new RegExp(`(?:（)?参考图${escapedIndex}(?:）)?\\s*=\\s*([^。\\n]+)`));
  return match?.[1]?.trim();
}

export function providerFrameReferenceSources({ mode, parameters = {}, projectId, promptText = "" } = {}) {
  const frames = mode === "first_frame"
    ? [{ mediaId: parameters.firstFrameMediaId, role: "首帧" }]
    : mode === "first_last_frame"
      ? [{ mediaId: parameters.firstFrameMediaId, role: "首帧" }, { mediaId: parameters.lastFrameMediaId, role: "尾帧" }]
      : [];
  return frames.filter((frame) => frame.mediaId).map((frame, index) => ({
    canRun: false,
    cost: "Core 权威",
    id: `provider-frame:${frame.mediaId}`,
    kind: "image",
    lockedReference: true,
    previewUrl: `/api/projects/${projectId}/media/${frame.mediaId}`,
    prompt: "",
    referenceMediaIds: [frame.mediaId],
    referenceRoleLabel: frame.role,
    referenceSourceMark: "核",
    refs: [],
    status: "done",
    summary: "由 Core 编译并锁定的实际 Provider 帧输入。",
    title: mappedReferenceLabel(promptText, index + 1) || `Core 权威${frame.role}`
  }));
}
