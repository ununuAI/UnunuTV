import { mediaCandidatesForNode, mediaUrlForNode } from "./media-candidate-policy.js";

export function formatAudioTime(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

export function audioMediaSource(node) {
  const candidates = mediaCandidatesForNode(node);
  const mediaId = candidates.includes(node?.payload?.currentMediaId) ? node.payload.currentMediaId : candidates[0];
  return mediaId ? { mediaId, url: mediaUrlForNode(node, mediaId) } : null;
}

export function downsampleWaveform(samples, bucketCount = 96) {
  if (!samples?.length || bucketCount < 1) return [];
  const length = Math.min(bucketCount, samples.length);
  const stride = samples.length / length;
  return Array.from({ length }, (_, index) => {
    const start = Math.floor(index * stride);
    const end = Math.max(start + 1, Math.floor((index + 1) * stride));
    let peak = 0;
    for (let cursor = start; cursor < end && cursor < samples.length; cursor += 1) peak = Math.max(peak, Math.abs(samples[cursor]));
    return Math.max(.025, Math.min(1, peak));
  });
}
