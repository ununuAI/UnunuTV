import assert from "node:assert/strict";
import test from "node:test";
import { INDEXTTS2_MODEL_ID, generationRunPayload } from "../apps/web/src/generation-run-payload.js";

const video = { id: "video-1", kind: "video", payload: {} };
const first = { id: "image-1", kind: "image", payload: { currentMediaId: "media-first" } };
const last = { id: "image-2", kind: "image", payload: { currentMediaId: "media-last" } };

function edge(fromNodeId) {
  return { fromNodeId, toNodeId: video.id };
}

function input(mode, parameters = {}) {
  return {
    modelId: "x-ai/grok-imagine-video",
    parameters: { mode, ...parameters },
    provider: "openrouter",
    referenceMediaIds: [],
    referenceNodeIds: [],
    text: "镜头缓慢推进"
  };
}

function seedanceInput(mode, parameters = {}) {
  return {
    ...input(mode, parameters),
    modelId: "doubao-seedance-2-0-mini-260615",
    provider: "ark"
  };
}

function h3Input(mode, parameters = {}) {
  return {
    ...input(mode, parameters),
    modelId: "MiniMax-H3",
    provider: "minimax"
  };
}

function autodlH3Input(mode, parameters = {}) {
  return {
    ...h3Input(mode, parameters),
    provider: "autodl"
  };
}

test("connected audio stays on the canvas and is not sent as a video image reference", () => {
  const voice = { id: "audio-1", kind: "audio", payload: { currentMediaId: "media-voice" } };
  const payload = generationRunPayload(
    video,
    input("image_reference"),
    [edge(first.id), edge(voice.id)],
    [video, first, voice]
  );
  assert.deepEqual(payload.request.referenceMediaIds, ["media-first"]);
});

test("local FLUX carries the selected male tuning preset into the Provider request", () => {
  const image = { id: "image-output", kind: "image", payload: {} };
  const payload = generationRunPayload(image, {
    modelId: "fluxed-up-v9-fp8",
    provider: "flux",
    parameters: { size: "768x1024", quality: "balanced", referenceDenoise: 0.45, malePreset: "delicate", maleRegion: "east-asian" },
    referenceMediaIds: [], referenceNodeIds: [], text: "清秀的男生"
  }, [], [image]);
  assert.equal(payload.request.malePreset, "delicate");
  assert.equal(payload.request.maleRegion, "east-asian");
  assert.equal(payload.request.referenceDenoise, 0.45);
  assert.equal(payload.request.size, "768x1024");
});

test("IndexTTS2 sends ordered audio references and emotion controls", () => {
  const output = { id: "audio-output", kind: "audio", payload: {} };
  const voice = { id: "audio-voice", kind: "audio", payload: { currentMediaId: "media-voice" } };
  const emotion = { id: "audio-emotion", kind: "audio", payload: { currentMediaId: "media-emotion" } };
  const payload = generationRunPayload(output, {
    modelId: INDEXTTS2_MODEL_ID,
    provider: "autodl",
    parameters: { emo_calm: 0.3, emo_happy: 0.5, emo_random: false, emo_control_method: "与音色参考音频相同" },
    referenceMediaIds: [],
    referenceNodeIds: [voice.id, emotion.id],
    text: "你好，这是一段测试文本"
  }, [
    { fromNodeId: voice.id, toNodeId: output.id },
    { fromNodeId: emotion.id, toNodeId: output.id }
  ], [output, voice, emotion]);
  assert.equal(payload.provider, "autodl");
  assert.deepEqual(payload.request.audioReferenceMediaIds, ["media-voice", "media-emotion"]);
  assert.equal(payload.request.emo_calm, 0.3);
  assert.equal(payload.request.emo_happy, 0.5);
  assert.equal(payload.request.emo_control_method, "与音色参考音频相同");
});

test("H3 sends connected audio as ordered standalone audio references", () => {
  const voiceOne = { id: "audio-1", kind: "audio", payload: { currentMediaId: "media-voice-1" } };
  const voiceTwo = { id: "audio-2", kind: "audio", payload: { currentMediaId: "media-voice-2" } };
  const payload = generationRunPayload(
    video,
    h3Input("image_reference"),
    [edge(first.id), edge(voiceOne.id), edge(voiceTwo.id)],
    [video, first, voiceOne, voiceTwo]
  );
  assert.deepEqual(payload.request.referenceMediaIds, ["media-first"]);
  assert.deepEqual(payload.request.audioReferenceMediaIds, ["media-voice-1", "media-voice-2"]);
});

test("H3 refuses connected audio outside all-purpose reference mode", () => {
  const voice = { id: "audio-1", kind: "audio", payload: { currentMediaId: "media-voice" } };
  assert.throws(
    () => generationRunPayload(video, h3Input("text_to_video"), [edge(voice.id)], [video, voice]),
    /声音参考只能在全能参考模式中使用/
  );
});

test("connected images remain all-purpose references by default and never become a first frame implicitly", () => {
  const payload = generationRunPayload(video, input("image_reference"), [edge(first.id)], [video, first]);
  assert.deepEqual(payload.request.referenceMediaIds, ["media-first"]);
  assert.equal(Object.hasOwn(payload.request, "firstFrameMediaId"), false);
  assert.equal(Object.hasOwn(payload.request, "lastFrameMediaId"), false);
});

test("first-frame mode accepts exactly one explicitly assigned image", () => {
  const payload = generationRunPayload(video, input("first_frame", { firstFrameMediaId: "media-first" }), [edge(first.id)], [video, first]);
  assert.equal(payload.request.firstFrameMediaId, "media-first");
  assert.equal(Object.hasOwn(payload.request, "referenceMediaIds"), false);
});

test("first-and-last-frame mode assigns the first two displayed images in order", () => {
  const payload = generationRunPayload(video, seedanceInput("first_last_frame", {
    firstFrameMediaId: "media-first",
    lastFrameMediaId: "media-last"
  }), [edge(first.id), edge(last.id)], [video, first, last]);
  assert.equal(payload.request.firstFrameMediaId, "media-first");
  assert.equal(payload.request.lastFrameMediaId, "media-last");
  assert.equal(Object.hasOwn(payload.request, "referenceMediaIds"), false);
});

test("frame modes ignore ordinary workflow edges and use only the explicit frame contract", () => {
  const firstOnly = generationRunPayload(video, input("first_frame", { firstFrameMediaId: "media-first" }), [edge(first.id), edge(last.id)], [video, first, last]);
  assert.equal(firstOnly.request.firstFrameMediaId, "media-first");
  assert.equal(Object.hasOwn(firstOnly.request, "referenceMediaIds"), false);
  assert.throws(
    () => generationRunPayload(video, seedanceInput("first_last_frame", { firstFrameMediaId: "media-first" }), [edge(first.id)], [video, first]),
    /只能使用 2 张图片/
  );
});

test("text-to-video keeps workflow edges auditable without sending them as provider images", () => {
  const payload = generationRunPayload(video, input("text_to_video"), [edge(first.id)], [video, first]);
  assert.equal(Object.hasOwn(payload.request, "referenceMediaIds"), false);
});

test("Grok audio state is persisted into the provider request", () => {
  const payload = generationRunPayload(video, input("text_to_video", { duration: 15, generateAudio: false }), [], [video]);
  assert.equal(payload.request.duration, 15);
  assert.equal(payload.request.generateAudio, false);
});

test("Seedance virtual-person IDs survive the UI request compiler", () => {
  const payload = generationRunPayload(video, seedanceInput("text_to_video", {
    duration: 5,
    generateAudio: true,
    virtualPersonAssetIds: ["asset-20260310030618-88hlb"]
  }), [], [video]);
  assert.deepEqual(payload.request.virtualPersonAssetIds, ["asset-20260310030618-88hlb"]);
});

test("Grok rejects audio or all-purpose-reference requests above ten seconds before payment", () => {
  assert.throws(
    () => generationRunPayload(video, input("text_to_video", { duration: 15, generateAudio: true }), [], [video]),
    /原声音频时最长 10 秒/
  );
  assert.throws(
    () => generationRunPayload(video, input("image_reference", { duration: 15, generateAudio: false }), [edge(first.id)], [video, first]),
    /全能参考模式最长 10 秒/
  );
});

test("Grok rejects UTF-8 prompts above 4096 bytes before payment", () => {
  assert.throws(
    () => generationRunPayload(video, { ...input("text_to_video", { duration: 10, generateAudio: false }), text: "人".repeat(1400) }, [], [video]),
    /提示词过长：当前 4200 bytes/
  );
});

test("MiniMax H3 submits the ordinary node prompt directly", () => {
  const sourcePrompt = "原始导演意图";
  const payload = generationRunPayload(video, {
    modelId: "MiniMax-H3",
    parameters: {
      mode: "text_to_video",
      duration: 4,
      resolution: "480p",
      h3Profile: "480p_accelerated",
      ratio: "16:9",
      h3CompiledPrompt: "应被忽略的历史提交稿",
      h3SourcePrompt: sourcePrompt,
      h3Compiler: "director-skill"
    },
    provider: "minimax",
    referenceMediaIds: [],
    referenceNodeIds: [],
    text: sourcePrompt
  }, [], [video]);
  assert.equal(payload.request.prompt, sourcePrompt);
  assert.equal(payload.provider, "minimax");
  assert.equal(payload.request.h3Profile, "480p_accelerated");
});

test("AutoDL H3 keeps its channel and never leaks a local ComfyUI profile", () => {
  const payload = generationRunPayload(video, autodlH3Input("text_to_video", {
    duration: 12,
    resolution: "768p",
    ratio: "9:16",
    h3Profile: "480p_accelerated"
  }), [], [video]);
  assert.equal(payload.provider, "autodl");
  assert.equal(payload.request.resolution, "768p");
  assert.equal(Object.hasOwn(payload.request, "h3Profile"), false);
});
