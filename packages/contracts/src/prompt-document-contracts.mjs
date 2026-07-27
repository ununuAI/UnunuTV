export const PROMPT_DOCUMENT_VERSION = 1;
export const PROMPT_TOKEN_TYPES = Object.freeze(["text", "reference", "skill", "constraint"]);
export const PROMPT_REFERENCE_VERSION_POLICIES = Object.freeze(["pinned", "latest-approved"]);

const cleanText = (value) => typeof value === "string" ? value : "";

export function createPlainPromptDocumentV1(text = "") {
  return { type: "doc", version: PROMPT_DOCUMENT_VERSION, content: [{ type: "text", text: cleanText(text) }] };
}

export function createBoundPromptDocumentV1(text = "", referenceBindings = []) {
  const source = cleanText(text);
  const byProviderIndex = new Map((Array.isArray(referenceBindings) ? referenceBindings : [])
    .filter((binding) => Number.isInteger(binding?.providerIndex) && binding.providerIndex > 0)
    .map((binding) => [binding.providerIndex, binding]));
  const content = [];
  let cursor = 0;
  for (const match of source.matchAll(/(?:参考(?:图|媒体)(\d+)「[^」]+」|[（(]参考(?:图|媒体)(\d+)[）)])/gu)) {
    const providerIndex = Number(match[1] || match[2]);
    const binding = byProviderIndex.get(providerIndex);
    if (!binding || ![binding.assetId, binding.mediaId, binding.sourceNodeId].some((value) => typeof value === "string" && value.trim())) continue;
    const offset = match.index ?? 0;
    pushText(content, source.slice(cursor, offset));
    content.push({
      type: "reference",
      id: `reference-${binding.mediaId || binding.assetId || binding.sourceNodeId}-${providerIndex}`,
      label: cleanText(binding.displayName || binding.label) || `参考媒体 ${providerIndex}`,
      referenceKind: cleanText(binding.referenceKind) || "image",
      assetId: binding.assetId || null,
      assetVersionId: binding.assetVersionId || binding.versionId || null,
      mediaId: binding.mediaId || null,
      sourceNodeId: binding.sourceNodeId || null,
      providerIndex,
      role: cleanText(binding.role) || "reference",
      controls: Array.isArray(binding.controls) ? binding.controls : [],
      doesNotControl: Array.isArray(binding.doesNotControl) ? binding.doesNotControl : [],
      authorityRevision: binding.authorityRevision || null,
      versionPolicy: binding.versionPolicy || "pinned"
    });
    cursor = offset + match[0].length;
  }
  pushText(content, source.slice(cursor));
  return assertPromptDocumentV1({ type: "doc", version: PROMPT_DOCUMENT_VERSION, content: content.length ? content : [{ type: "text", text: source }] });
}

export function normalizePromptDocumentV1(value, fallbackText = "") {
  if (!value) return createPlainPromptDocumentV1(fallbackText);
  return assertPromptDocumentV1(value);
}

export function assertPromptDocumentV1(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid("PromptDocumentV1 must be an object");
  if (value.type !== "doc" || value.version !== PROMPT_DOCUMENT_VERSION || !Array.isArray(value.content)) throw invalid("PromptDocumentV1 requires type=doc, version=1 and content[]");
  const content = value.content.map((token, index) => assertToken(token, index));
  return { type: "doc", version: PROMPT_DOCUMENT_VERSION, content };
}

export function promptDocumentPlainText(document) {
  const normalized = assertPromptDocumentV1(document);
  let referenceIndex = 0;
  return normalized.content.map((token) => {
    if (token.type === "text") return token.text;
    if (token.type === "reference") {
      referenceIndex += 1;
      return `（参考媒体${token.providerIndex || referenceIndex}）`;
    }
    if (token.type === "skill") return `（启用能力：${token.label}）`;
    return `（约束：${token.label}）`;
  }).join("");
}

export function promptDocumentReferenceBindings(document) {
  return assertPromptDocumentV1(document).content.filter((token) => token.type === "reference").map((token, index) => ({
    assetId: token.assetId || null,
    assetVersionId: token.assetVersionId || null,
    authorityRevision: token.authorityRevision || null,
    controls: token.controls || [],
    doesNotControl: token.doesNotControl || [],
    mediaId: token.mediaId || null,
    providerIndex: token.providerIndex || index + 1,
    role: token.role || "reference",
    sourceNodeId: token.sourceNodeId || null,
    versionPolicy: token.versionPolicy || "pinned"
  }));
}

function assertToken(token, index) {
  if (!token || typeof token !== "object" || Array.isArray(token) || !PROMPT_TOKEN_TYPES.includes(token.type)) throw invalid(`content[${index}] has an unsupported token type`);
  if (token.type === "text") return { type: "text", text: cleanText(token.text) };
  const id = required(token.id, `content[${index}].id`);
  const label = required(token.label, `content[${index}].label`);
  if (token.type === "skill") return { type: "skill", id, label, skillId: required(token.skillId, `content[${index}].skillId`) };
  if (token.type === "constraint") return { type: "constraint", id, label, constraintId: required(token.constraintId, `content[${index}].constraintId`), severity: token.severity === "soft" ? "soft" : "hard" };
  if (![token.assetId, token.mediaId, token.sourceNodeId].some((value) => typeof value === "string" && value.trim())) throw invalid(`content[${index}] reference must bind assetId, mediaId or sourceNodeId`);
  const versionPolicy = token.versionPolicy || "pinned";
  if (!PROMPT_REFERENCE_VERSION_POLICIES.includes(versionPolicy)) throw invalid(`content[${index}].versionPolicy is invalid`);
  return {
    type: "reference",
    id,
    label,
    referenceKind: cleanText(token.referenceKind) || "asset",
    assetId: optional(token.assetId),
    assetVersionId: optional(token.assetVersionId),
    mediaId: optional(token.mediaId),
    sourceNodeId: optional(token.sourceNodeId),
    providerIndex: positiveInteger(token.providerIndex),
    role: cleanText(token.role) || "reference",
    controls: stringArray(token.controls),
    doesNotControl: stringArray(token.doesNotControl),
    authorityRevision: optional(token.authorityRevision),
    versionPolicy
  };
}

const invalid = (message) => Object.assign(new Error(message), { code: "invalid_prompt_document", status: 400 });
const pushText = (content, text) => {
  if (!text) return;
  const last = content.at(-1);
  if (last?.type === "text") last.text += text;
  else content.push({ type: "text", text });
};
const required = (value, field) => { if (typeof value !== "string" || !value.trim()) throw invalid(`${field} is required`); return value.trim(); };
const optional = (value) => typeof value === "string" && value.trim() ? value.trim() : null;
const stringArray = (value) => Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim()) : [];
const positiveInteger = (value) => Number.isInteger(value) && value > 0 ? value : null;
