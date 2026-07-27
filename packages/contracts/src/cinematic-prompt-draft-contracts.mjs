export const CINEMATIC_PROMPT_DRAFT_FORMAT = "CinematicPromptDraftV1";
export const CINEMATIC_PROMPT_DRAFT_VERSION = "1.0.0";
export const CINEMATIC_PROMPT_DRAFT_STATES = Object.freeze(["draft", "preflight_ready", "preflight_blocked", "superseded"]);

function issue(path, message, code = "invalid_field") {
  return { code, message, path };
}

function record(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value, path, issues) {
  if (typeof value !== "string" || value.trim() === "") issues.push(issue(path, `${path} is required`, "required"));
}

export function validateCinematicPromptDraft(value) {
  const issues = [];
  if (!record(value)) return { ok: false, issues: [issue("promptDraft", "promptDraft must be an object", "invalid_type")] };
  if (value.format !== CINEMATIC_PROMPT_DRAFT_FORMAT) issues.push(issue("format", `format must be ${CINEMATIC_PROMPT_DRAFT_FORMAT}`, "invalid_format"));
  if (value.version !== CINEMATIC_PROMPT_DRAFT_VERSION) issues.push(issue("version", `version must be ${CINEMATIC_PROMPT_DRAFT_VERSION}`, "invalid_version"));
  for (const field of ["draftId", "productionId", "generationUnitId", "compiledContentPrompt", "createdAt"]) text(value[field], field, issues);
  if (!record(value.sourceVersions)) issues.push(issue("sourceVersions", "sourceVersions must be an object", "invalid_type"));
  if (!Array.isArray(value.orderedSections) || value.orderedSections.length < 1) issues.push(issue("orderedSections", "orderedSections must contain at least one section", "required"));
  if (!Array.isArray(value.referenceBindings)) issues.push(issue("referenceBindings", "referenceBindings must be an array", "invalid_type"));
  if (!record(value.generationParameters)) issues.push(issue("generationParameters", "generationParameters must be an object", "invalid_type"));
  if (!Array.isArray(value.negativeConstraints)) issues.push(issue("negativeConstraints", "negativeConstraints must be an array", "invalid_type"));
  if (!CINEMATIC_PROMPT_DRAFT_STATES.includes(value.status)) issues.push(issue("status", `status must be one of: ${CINEMATIC_PROMPT_DRAFT_STATES.join(", ")}`, "invalid_enum"));
  return { ok: issues.length === 0, issues };
}

export function assertCinematicPromptDraft(value) {
  const validation = validateCinematicPromptDraft(value);
  if (!validation.ok) {
    const error = new Error(`CinematicPromptDraft validation failed: ${validation.issues.map((entry) => `${entry.path}: ${entry.message}`).join("; ")}`);
    error.code = "invalid_cinematic_prompt_draft";
    error.status = 400;
    error.details = validation.issues;
    throw error;
  }
  return value;
}

export function buildCinematicPromptDraft({ generationUnit, orderedShots, storyPacket, visualBible, sections, compiledContentPrompt, referenceBindings, negativeConstraints, status }) {
  const draft = {
    format: CINEMATIC_PROMPT_DRAFT_FORMAT,
    version: CINEMATIC_PROMPT_DRAFT_VERSION,
    draftId: `prompt-draft-${generationUnit.generationUnitId}-r${generationUnit.revision}`,
    productionId: generationUnit.productionId,
    generationUnitId: generationUnit.generationUnitId,
    sourceVersions: {
      generationUnitRevision: generationUnit.revision,
      shotRevisions: orderedShots.map((shot) => ({ revision: shot.revision, shotId: shot.shotId })),
      storyPacketId: storyPacket.storyPacketId,
      storyPacketRevision: storyPacket.revision,
      visualBibleId: visualBible.visualBibleId,
      visualBibleRevision: visualBible.revision
    },
    orderedSections: sections.map((entry) => ({ title: entry.title, required: entry.required === true, priority: entry.priority, lines: [...entry.lines] })),
    compiledContentPrompt,
    referenceBindings,
    generationParameters: generationUnit.generationParameters,
    negativeConstraints,
    status,
    createdAt: new Date().toISOString()
  };
  return assertCinematicPromptDraft(draft);
}
