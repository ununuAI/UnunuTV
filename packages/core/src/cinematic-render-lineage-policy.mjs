import { UnuTvError } from "@ununu/unutv-contracts";

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])])
  );
}

function fnv1a64(value) {
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

export function cinematicTimelineLineageHash(timeline) {
  if (!timeline?.id) {
    throw new UnuTvError(
      "cinematic_render_timeline_lineage_required",
      "候选渲染必须绑定可识别的当前时间线。",
      409
    );
  }
  const snapshot = {
    id: timeline.id,
    revision: timeline.revision ?? null,
    updatedAt: timeline.updatedAt ?? null,
    frameRate: timeline.frameRate,
    width: timeline.width,
    height: timeline.height,
    colorSpace: timeline.colorSpace ?? null,
    settings: timeline.settings ?? {},
    tracks: timeline.tracks ?? [],
    clips: timeline.clips ?? [],
    transitions: timeline.transitions ?? [],
    markers: timeline.markers ?? [],
    keyframes: timeline.keyframes ?? [],
    effects: timeline.effects ?? []
  };
  return fnv1a64(JSON.stringify(canonicalize(snapshot)));
}

export function cinematicCandidateRenderIdempotencyKey({ automationRunId, timeline }) {
  if (typeof automationRunId !== "string" || !automationRunId.trim()) {
    throw new UnuTvError(
      "cinematic_render_automation_lineage_required",
      "候选渲染必须绑定当前 automation run。",
      409
    );
  }
  return `${automationRunId}:candidate_render:${timeline.id}:${cinematicTimelineLineageHash(timeline)}:v2`;
}
