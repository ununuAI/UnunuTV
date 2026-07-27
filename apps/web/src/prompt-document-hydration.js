const LEGACY_REFERENCE_PATTERN = /[（(]参考(?:图|媒体)(\d+)[）)]/gu;

export function hydrateLegacyPromptReferences(document, candidates = []) {
  if (!document || document.type !== "doc" || document.version !== 1 || !Array.isArray(document.content)) return document;
  const orderedCandidates = uniqueBoundCandidates(candidates);
  if (orderedCandidates.length === 0) return document;

  let changed = false;
  const content = [];
  for (const token of document.content) {
    if (token?.type !== "text") {
      content.push(token);
      continue;
    }
    const text = String(token.text || "");
    let cursor = 0;
    for (const match of text.matchAll(LEGACY_REFERENCE_PATTERN)) {
      const providerIndex = Number(match[1]);
      const candidate = orderedCandidates[providerIndex - 1];
      if (!candidate) continue;
      const offset = match.index ?? 0;
      if (offset > cursor) pushText(content, text.slice(cursor, offset));
      content.push(referenceToken(candidate, providerIndex));
      cursor = offset + match[0].length;
      changed = true;
    }
    if (cursor < text.length) pushText(content, text.slice(cursor));
    else if (text.length === 0) pushText(content, "");
  }
  return changed ? { type: "doc", version: 1, content } : document;
}

function uniqueBoundCandidates(candidates) {
  const seen = new Set();
  return candidates.filter((candidate) => {
    const binding = candidate?.mediaId || candidate?.assetId || candidate?.sourceNodeId;
    if (!binding || seen.has(binding)) return false;
    seen.add(binding);
    return true;
  });
}

function referenceToken(candidate, providerIndex) {
  return {
    type: "reference",
    id: `reference-${candidate.key || candidate.mediaId || providerIndex}-${providerIndex}`,
    label: candidate.label || `参考媒体 ${providerIndex}`,
    referenceKind: candidate.referenceKind || "image",
    assetId: candidate.assetId || null,
    assetVersionId: candidate.assetVersionId || null,
    mediaId: candidate.mediaId || null,
    sourceNodeId: candidate.sourceNodeId || null,
    providerIndex,
    role: candidate.referenceKind === "image" ? "visual_reference" : `${candidate.referenceKind || "media"}_reference`,
    controls: [],
    doesNotControl: [],
    authorityRevision: null,
    versionPolicy: "pinned"
  };
}

function pushText(content, text) {
  const last = content.at(-1);
  if (last?.type === "text") last.text += text;
  else content.push({ type: "text", text });
}
