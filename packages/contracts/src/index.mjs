export const NODE_KINDS = Object.freeze([
  "story",
  "text",
  "image",
  "audio",
  "video",
  "videoShot",
  "script",
  "subject",
  "batch",
  "review",
  "upload",
  "compose",
  "material",
  "historyPick",
  "storyboard",
  "video-clip",
  "director",
  "cinematic",
  "grid",
  "asset",
  "imageEdit",
  "compare",
  "world",
  "shot",
  "generationUnit",
  "qa"
]);

export const MEDIA_KINDS = Object.freeze(["image", "video", "audio", "world"]);
export const WORKFLOW_LAYERS = Object.freeze(["L01", "L02", "L03", "L04", "L05", "L06", "L07", "L08"]);
export const REVIEW_STATES = Object.freeze(["draft", "candidate", "accepted", "rejected", "blocked"]);
export const RUN_STATES = Object.freeze(["queued", "running", "succeeded", "failed", "blocked", "canceled"]);

export {
  IMAGE_GENERATION_TEMPLATES,
  compileImageGenerationPrompt,
  getImageGenerationTemplate,
  imageGenerationStarterPrompt,
  resolveImageGenerationTemplateIdForNode
} from "./image-generation-template-policy.mjs";

export * from "./cinematic-contracts.mjs";
export * from "./formal-generation-intent-contracts.mjs";
export * from "./cinematic-continuity-policy.mjs";
export * from "./cinematic-cross-modal-control-policy.mjs";
export * from "./cinematic-visual-input-decision-policy.mjs";
export * from "./cinematic-generation-control-policy.mjs";
export * from "./cinematic-camera-trajectory-policy.mjs";
export * from "./cinematic-temporal-motion-policy.mjs";
export * from "./cinematic-prompt-coverage-policy.mjs";
export * from "./cinematic-review-gate-policy.mjs";
export * from "./cinematic-sequence-state-policy.mjs";
export * from "./cinematic-segment-seam-policy.mjs";
export * from "./cinematic-abstract-intent-policy.mjs";
export * from "./cinematic-director-prompt-policy.mjs";
export * from "./cinematic-sequence-workspace-contracts.mjs";
export * from "./cinematic-owner-review-contract.mjs";
export * from "./owner-pixel-review-evidence-contract.mjs";
export * from "./owner-character-appearance-review-evidence-contract.mjs";
export * from "./owner-asset-pixel-review-evidence-contract.mjs";
export * from "./owner-character-look-playback-review-evidence-contract.mjs";
export * from "./owner-full-playback-review-evidence-contract.mjs";
export * from "./cinematic-performance-timeline-policy.mjs";
export * from "./cinematic-prompt-policy.mjs";
export * from "./cinematic-image-prompt-policy.mjs";
export * from "./authority-board-constraint-scope-policy.mjs";
export * from "./character-voice-profile-contract.mjs";
export * from "./line-voice-authority-contract.mjs";
export * from "./cinematic-final-sound-acceptance-contract.mjs";
export * from "./video-model-capability-policy.mjs";
export * from "./generation-parameter-contracts.mjs";
export * from "./workbench-contracts.mjs";
export * from "./storyboard-contracts.mjs";
export * from "./node-presentation-contracts.mjs";
export * from "./node-prompt-capability-policy.mjs";
export * from "./gateway-model-catalog-policy.mjs";
export * from "./prompt-document-contracts.mjs";
export * from "./timeline-contracts.mjs";
export * from "./budget-contracts.mjs";
export * from "./agent-contracts.mjs";
export * from "./automation-task-plan.mjs";
export * from "./render-contracts.mjs";
export * from "./media-preparation-contracts.mjs";
export * from "./grid-contracts.mjs";
export * from "./image-edit-contracts.mjs";
export * from "./director-stage-contracts.mjs";
export * from "./director-composition-contracts.mjs";
export * from "./director-stage-capture-policy.mjs";
export * from "./script-breakdown-contracts.mjs";
export * from "./screenplay-authority-contract.mjs";
export * from "./cinematic-generation-unit-lifecycle-policy.mjs";
export * from "./cinematic-workflow-contracts.mjs";
export * from "./cinematic-format-profile-contracts.mjs";
export * from "./cinematic-agent-context-contracts.mjs";
export * from "./cinematic-prompt-draft-contracts.mjs";
export * from "./cinematic-prompt-hash-policy.mjs";
export * from "./platform-os-contracts.mjs";
export * from "./project-id-policy.mjs";

export class UnuTvError extends Error {
  constructor(code, message, status = 400, details) {
    super(message);
    this.name = "UnuTvError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function nowIso() {
  return new Date().toISOString();
}

export function createId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function requireText(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new UnuTvError("invalid_payload", `${field} is required`);
  }
  return value.trim();
}

export function optionalText(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function requireEnum(value, allowed, field) {
  if (!allowed.includes(value)) {
    throw new UnuTvError("invalid_payload", `${field} must be one of: ${allowed.join(", ")}`);
  }
  return value;
}

export function requireObject(value, field, fallback = {}) {
  if (value === undefined) return fallback;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new UnuTvError("invalid_payload", `${field} must be an object`);
  }
  return value;
}

export function requireNumber(value, field, fallback) {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new UnuTvError("invalid_payload", `${field} must be a finite number`);
  }
  return value;
}

export function parseJson(value, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    throw new UnuTvError("invalid_json", "Value must be valid JSON");
  }
}

export function defaultNodeSize(kind) {
  if (kind === "text" || kind === "story") return { width: 624, height: 420 };
  if (kind === "script") return { width: 468, height: 396 };
  if (kind === "imageEdit") return { width: 250, height: 250 };
  if (kind === "audio") return { width: 444, height: 250 };
  if (kind === "world") return { width: 333, height: 250 };
  if (["image", "subject", "upload", "material", "historyPick", "video", "videoShot", "compose", "video-clip", "asset", "compare"].includes(kind)) return { width: 559, height: 372 };
  if (kind === "grid") return { width: 250, height: 250 };
  if (kind === "storyboard") return { width: 624, height: 360 };
  if (kind === "cinematic") return { width: 572, height: 360 };
  if (["shot", "generationUnit", "qa"].includes(kind)) return { width: 572, height: 408 };
  return { width: 572, height: 408 };
}
