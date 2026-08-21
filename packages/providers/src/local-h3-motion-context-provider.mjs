import { UnuTvError } from "@ununu/unutv-contracts";

export const H3_MOTION_CONTEXT_NODE_TYPES = Object.freeze([
  "MiniMaxH3MotionContext",
  "MiniMaxH3MotionContextSaveLatent",
  "MiniMaxH3MotionContextLoadLatent",
  "MiniMaxH3MotionContextTrim"
]);

export const H3_MOTION_CONTEXT_SUPPORT_NODE_TYPES = Object.freeze([
  "UNETLoader",
  "LoraLoaderModelOnly",
  "CLIPLoader",
  "VAELoader",
  "MiniMaxH3ReferenceToVideo",
  "MiniMaxH3ImageToVideo",
  "MiniMaxH3SigmaShift",
  "BasicScheduler",
  "KSamplerSelect",
  "BasicGuider",
  "RandomNoise",
  "SamplerCustomAdvanced",
  "VAEDecode",
  "VAEDecodeAudio",
  "CreateVideo",
  "SaveVideo",
  "LoadImage"
]);

const SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const CONTEXT_LENGTHS = new Set([5, 22, 39, 56]);

function motionContextSessionId(value) {
  const sessionId = String(value || "").trim();
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    throw new UnuTvError("h3_motion_context_session_invalid", "Motion Context sessionId must use 1-64 letters, digits, underscores, or hyphens", 400);
  }
  return sessionId;
}

function motionContextClipIndex(value, phase) {
  const clipIndex = Number(value);
  if (!Number.isSafeInteger(clipIndex) || clipIndex < 1 || clipIndex > 9999) {
    throw new UnuTvError("h3_motion_context_clip_index_invalid", "Motion Context clipIndex must be an integer from 1 to 9999", 400);
  }
  if (phase === "initial" && clipIndex !== 1) {
    throw new UnuTvError("h3_motion_context_initial_index_invalid", "The initial Motion Context clip must use clipIndex 1", 400);
  }
  if (phase === "continue" && clipIndex < 2) {
    throw new UnuTvError("h3_motion_context_continue_index_invalid", "A continuation Motion Context clip must use clipIndex 2 or later", 400);
  }
  return clipIndex;
}

function requireWorkflowNode(graph, nodeId, classType) {
  const node = graph?.[nodeId];
  if (!node || node.class_type !== classType) {
    throw new UnuTvError("h3_motion_context_base_workflow_incompatible", `Expected ${classType} at base workflow node ${nodeId}`, 409);
  }
  return node;
}

export function buildLocalH3MotionContextWorkflow({
  baseWorkflow,
  phase,
  sessionId,
  clipIndex,
  contextFrames = 22,
  audioContextFrames = 24
}) {
  if (!["initial", "continue"].includes(phase)) {
    throw new UnuTvError("h3_motion_context_phase_invalid", "Motion Context phase must be initial or continue", 400);
  }
  const safeSessionId = motionContextSessionId(sessionId);
  const safeClipIndex = motionContextClipIndex(clipIndex, phase);
  const videoContextFrames = Number(contextFrames);
  if (!CONTEXT_LENGTHS.has(videoContextFrames)) {
    throw new UnuTvError("h3_motion_context_length_invalid", "Motion Context contextFrames must be 5, 22, 39, or 56", 400);
  }
  const soundContextFrames = Number(audioContextFrames);
  if (!Number.isSafeInteger(soundContextFrames) || soundContextFrames < 0 || soundContextFrames > 240) {
    throw new UnuTvError("h3_motion_context_audio_length_invalid", "Motion Context audioContextFrames must be an integer from 0 to 240", 400);
  }
  const graph = structuredClone(baseWorkflow);
  if (!["MiniMaxH3ReferenceToVideo", "MiniMaxH3ImageToVideo"].includes(graph["104"]?.class_type)) {
    throw new UnuTvError("h3_motion_context_base_workflow_incompatible", "Expected a MiniMax H3 conditioning node at base workflow node 104", 409);
  }
  requireWorkflowNode(graph, "14", "SamplerCustomAdvanced");
  requireWorkflowNode(graph, "10", "VAEDecode");
  requireWorkflowNode(graph, "23", "VAEDecodeAudio");
  requireWorkflowNode(graph, "91", "CreateVideo");
  requireWorkflowNode(graph, "92", "SaveVideo");
  const latentPrefix = `h3_context/unutv-mc/${safeSessionId}/clip`;
  const latentDirectory = `h3_context/unutv-mc/${safeSessionId}`;
  const outputPrefix = `video/unutv_h3_mc_${safeSessionId}_clip_${String(safeClipIndex).padStart(4, "0")}`;
  graph["92"].inputs.filename_prefix = outputPrefix;
  graph["400"] = {
    class_type: "MiniMaxH3MotionContextSaveLatent",
    inputs: { latent: ["14", 0], filename_prefix: latentPrefix, clip_index: safeClipIndex }
  };
  if (phase === "initial") return graph;
  requireWorkflowNode(graph, "16", "BasicGuider");
  graph["401"] = {
    class_type: "MiniMaxH3MotionContextLoadLatent",
    inputs: { latent_path: latentDirectory, clip_index: safeClipIndex - 1 }
  };
  graph["402"] = {
    class_type: "MiniMaxH3MotionContext",
    inputs: {
      conditioning: ["104", 0],
      vae: ["11", 0],
      latent: ["104", 1],
      context_length: String(videoContextFrames),
      audio_context_length: soundContextFrames,
      context_latent: ["401", 0]
    }
  };
  graph["16"].inputs.conditioning = ["402", 0];
  graph["403"] = {
    class_type: "MiniMaxH3MotionContextTrim",
    inputs: {
      images: ["10", 0],
      audio: ["23", 0],
      trim_frames: ["402", 1],
      fps: 24,
      match_tail: true
    }
  };
  graph["91"].inputs.images = ["403", 0];
  graph["91"].inputs.audio = ["403", 1];
  return graph;
}

function sanitizeInputGroup(group) {
  if (!group || typeof group !== "object") return {};
  return Object.fromEntries(Object.entries(group).map(([name, value]) => {
    const [type, options] = Array.isArray(value) ? value : [value, undefined];
    return [name, {
      type,
      ...(options && typeof options === "object" ? {
        options: Object.fromEntries(Object.entries(options).filter(([key]) => [
          "default", "min", "max", "step", "multiline", "forceInput", "tooltip"
        ].includes(key)))
      } : {})
    }];
  }));
}

function sanitizeNodeSchema(nodeType, schema) {
  if (!schema || typeof schema !== "object" || !schema.input) return null;
  return {
    nodeType,
    required: sanitizeInputGroup(schema.input.required),
    optional: sanitizeInputGroup(schema.input.optional),
    outputs: Array.isArray(schema.output) ? schema.output : [],
    outputNames: Array.isArray(schema.output_name) ? schema.output_name : []
  };
}

export async function inspectH3MotionContextCapabilities(remote, fetchImpl = fetch) {
  const ready = await remote.ensureReady();
  if (!ready.ok) {
    throw new UnuTvError("h3_remote_unavailable", ready.message || "Local H3 remote is unavailable", 503, ready);
  }
  const schemas = {};
  const inspectedNodeTypes = [...H3_MOTION_CONTEXT_NODE_TYPES, ...H3_MOTION_CONTEXT_SUPPORT_NODE_TYPES];
  for (const nodeType of inspectedNodeTypes) {
    const response = await fetchImpl(`${remote.baseUrl()}/object_info/${encodeURIComponent(nodeType)}`, {
      headers: { accept: "application/json" }
    });
    if (!response.ok) continue;
    const payload = await response.json();
    const schema = sanitizeNodeSchema(nodeType, payload?.[nodeType]);
    if (schema) schemas[nodeType] = schema;
  }
  const available = H3_MOTION_CONTEXT_NODE_TYPES.filter((nodeType) => Boolean(schemas[nodeType]));
  const missing = H3_MOTION_CONTEXT_NODE_TYPES.filter((nodeType) => !schemas[nodeType]);
  const missingSupport = H3_MOTION_CONTEXT_SUPPORT_NODE_TYPES.filter((nodeType) => !schemas[nodeType]);
  return {
    configured: true,
    ready: missing.length === 0 && missingSupport.length === 0,
    profile: "480p_accelerated",
    sampler: { steps: 8, acceleration: "video_audio_sigma_shift", videoShift: 12, audioShift: 3 },
    available,
    missing,
    missingSupport,
    schemas
  };
}
