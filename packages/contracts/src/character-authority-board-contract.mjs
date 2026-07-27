import { validateCharacterVoiceProfile } from "./character-voice-profile-contract.mjs";
import { validatePromptConstraintCoverage } from "./cinematic-prompt-coverage-policy.mjs";

const REFERENCE_POLICIES = new Set(["none", "accepted_identity", "accepted_identity_and_props", "accepted_authority_versions"]);
const PIXEL_MODES = new Set(["clean_authority", "annotated_control"]);

function issue(path, message, code = "invalid_field") {
  return { code, message, path };
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function validateAssetAuthorityBoardSpec(value) {
  const issues = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, issues: [issue("assetAuthorityBoard", "assetAuthorityBoard must be an object", "invalid_type")] };
  for (const field of ["boardId", "boardType", "label", "purpose"]) if (!hasText(value[field])) issues.push(issue(field, `${field} is required`, "required"));
  for (const field of ["viewSpecIds", "acceptanceCriteria", "prohibitedChanges"]) if (!Array.isArray(value[field])) issues.push(issue(field, `${field} must be an array`, "invalid_type"));
  if (!REFERENCE_POLICIES.has(value.referencePolicy)) issues.push(issue("referencePolicy", "referencePolicy is invalid", "invalid_enum"));
  if (value.pixelMode !== undefined && !PIXEL_MODES.has(value.pixelMode)) issues.push(issue("pixelMode", "pixelMode is invalid", "invalid_enum"));
  if (value.annotationInstructions !== undefined && !Array.isArray(value.annotationInstructions)) issues.push(issue("annotationInstructions", "annotationInstructions must be an array", "invalid_type"));
  if (value.pixelMode === "annotated_control") {
    if (!String(value.boardType || "").includes("control")) issues.push(issue("boardType", "annotated_control is only valid for a control board", "invalid_control_board"));
    if (!Array.isArray(value.annotationInstructions) || value.annotationInstructions.length === 0) issues.push(issue("annotationInstructions", "annotated_control requires annotationInstructions", "required"));
  }
  if (typeof value.required !== "boolean") issues.push(issue("required", "required must be boolean", "invalid_type"));
  if (value.requirePromptCoverage !== undefined && typeof value.requirePromptCoverage !== "boolean") issues.push(issue("requirePromptCoverage", "requirePromptCoverage must be boolean", "invalid_type"));
  if (value.promptCoverage !== undefined) {
    const validation = validatePromptConstraintCoverage(value.promptCoverage);
    issues.push(...validation.issues.map((entry) => ({ ...entry, path: `promptCoverage.${entry.path}` })));
  }
  return { ok: issues.length === 0, issues };
}

export const validateCharacterAuthorityBoardSpec = validateAssetAuthorityBoardSpec;

function validateAuthorityBoardFields(value, baseIssues = []) {
  const issues = [...baseIssues];
  if (value?.boardSpecs === undefined) return { ok: issues.length === 0, issues };
  if (!Array.isArray(value.boardSpecs)) return { ok: false, issues: [...issues, issue("boardSpecs", "boardSpecs must be an array", "invalid_type")] };
  const viewSpecIds = new Set(Array.isArray(value.viewSpecs) ? value.viewSpecs.map((entry) => entry?.viewId) : []);
  const boardIds = new Set();
  for (const [index, board] of value.boardSpecs.entries()) {
    const validation = validateAssetAuthorityBoardSpec(board);
    issues.push(...validation.issues.map((entry) => ({ ...entry, path: `boardSpecs[${index}].${entry.path}` })));
    if (boardIds.has(board?.boardId)) issues.push(issue(`boardSpecs[${index}].boardId`, "boardId must be unique", "duplicate_value"));
    boardIds.add(board?.boardId);
    for (const [viewIndex, viewSpecId] of (Array.isArray(board?.viewSpecIds) ? board.viewSpecIds : []).entries()) {
      if (!viewSpecIds.has(viewSpecId)) issues.push(issue(`boardSpecs[${index}].viewSpecIds[${viewIndex}]`, `Unknown viewSpecId: ${viewSpecId}`, "missing_reference"));
    }
  }
  return { ok: issues.length === 0, issues };
}

export function validateCharacterAuthorityFields(value, baseIssues = []) {
  const issues = [...baseIssues];
  if (!Array.isArray(value?.identityLocks)) issues.push(issue("identityLocks", "identityLocks must be an array", "invalid_type"));
  if (value?.subjectMode !== undefined && !["single", "ensemble"].includes(value.subjectMode)) issues.push(issue("subjectMode", "subjectMode must be single or ensemble", "invalid_enum"));
  if (value?.voiceProfile !== undefined) {
    const validation = validateCharacterVoiceProfile(value.voiceProfile);
    issues.push(...validation.issues.map((entry) => ({ ...entry, path: `voiceProfile.${entry.path}` })));
  }
  return validateAuthorityBoardFields(value, issues);
}

export function validateSceneAuthorityFields(value, baseIssues = []) {
  return validateAuthorityBoardFields(value, baseIssues);
}
