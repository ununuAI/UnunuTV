function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function textList(value) {
  return (Array.isArray(value) ? value : []).map(text).filter(Boolean);
}

export function buildStoryboardRetakeDirective({
  directive = null,
  note = "",
  rejectedMediaId,
  review,
} = {}) {
  const corrections = textList(directive?.corrections);
  const prohibitions = textList(directive?.prohibitions);
  const fallback = text(note);
  return {
    version: "storyboard_retake_directive_v1",
    sourceReviewId: text(review?.id),
    rejectedMediaId: text(rejectedMediaId),
    createdAt: text(review?.createdAt),
    corrections: corrections.length ? corrections : (fallback ? [fallback] : []),
    prohibitions,
  };
}

export function storyboardRetakePromptFields(configuration = {}, shot = {}) {
  const directive = shot?.retakeDirective;
  const corrections = textList(directive?.corrections);
  const prohibitions = [
    ...textList(configuration?.prohibitions),
    ...textList(directive?.prohibitions),
  ];
  const continuityParts = [
    text(configuration?.continuityFocus),
    ...corrections.map((entry) => `返工修正：${entry}`),
  ].filter(Boolean);
  return {
    continuityFocus: continuityParts.join("；"),
    prohibitions,
  };
}
