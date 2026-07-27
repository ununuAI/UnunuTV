import { UnuTvError } from "@ununu/unutv-contracts";

function finite(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new UnuTvError("invalid_timeline_edit", `${field} must be finite`, 400);
  return Math.round(number);
}

export function planMoveClip(clip, input = {}) {
  const startMs = Math.max(0, finite(input.startMs ?? clip.startMs, "startMs"));
  const track = Math.max(0, finite(input.track ?? clip.track, "track"));
  return { before: [clip], after: [{ ...clip, startMs, track }] };
}

export function planTrimClip(clip, input = {}) {
  const startMs = Math.max(0, finite(input.startMs ?? clip.startMs, "startMs"));
  const durationMs = Math.max(1, finite(input.durationMs ?? clip.durationMs, "durationMs"));
  const trimInMs = Math.max(0, finite(input.trimInMs ?? clip.trimInMs, "trimInMs"));
  return { before: [clip], after: [{ ...clip, startMs, durationMs, trimInMs }] };
}

export function planSplitClip(clip, splitAtMs, rightClipId, createdAt) {
  const split = finite(splitAtMs, "splitAtMs");
  const offset = split - clip.startMs;
  if (offset <= 0 || offset >= clip.durationMs) throw new UnuTvError("invalid_timeline_split", "splitAtMs must be inside the selected clip", 409);
  return {
    before: [clip],
    after: [
      { ...clip, durationMs: offset },
      { ...clip, id: rightClipId, startMs: split, durationMs: clip.durationMs - offset, trimInMs: clip.trimInMs + offset, createdAt }
    ]
  };
}

export function planUpdateClip(clip, input = {}) {
  const payload = { ...(clip.payload ?? {}), ...(input.payload ?? {}) };
  if (payload.volume !== undefined) {
    const volume = Number(payload.volume);
    if (!Number.isFinite(volume) || volume < 0 || volume > 4) throw new UnuTvError("invalid_timeline_volume", "volume must be between 0 and 4", 400);
    payload.volume = Math.round(volume * 100) / 100;
  }
  return { before: [clip], after: [{ ...clip, payload }] };
}

export function planSlipClip(clip, input = {}) {
  const trimInMs = Math.max(0, finite(input.trimInMs, "trimInMs"));
  const sourceDurationMs = Number(input.sourceDurationMs ?? clip.payload?.sourceDurationMs ?? Number.POSITIVE_INFINITY);
  if (Number.isFinite(sourceDurationMs) && trimInMs + clip.durationMs > sourceDurationMs) {
    throw new UnuTvError("timeline_slip_out_of_source", "Slip would exceed the available source media", 409);
  }
  return { before: [clip], after: [{ ...clip, trimInMs }] };
}

export function planRippleClip(clips, clip, input = {}) {
  const targetStartMs = Math.max(0, finite(input.startMs ?? clip.startMs, "startMs"));
  const targetTrack = Math.max(0, finite(input.track ?? clip.track, "track"));
  const before = [clip];
  const after = [{ ...clip, startMs: targetStartMs, track: targetTrack }];
  const oldEnd = clip.startMs + clip.durationMs;
  if (targetTrack === clip.track) {
    const delta = targetStartMs - clip.startMs;
    for (const sibling of clips.filter((item) => item.id !== clip.id && item.track === clip.track && item.startMs >= oldEnd)) {
      before.push(sibling);
      after.push({ ...sibling, startMs: Math.max(0, sibling.startMs + delta) });
    }
  } else {
    for (const sibling of clips.filter((item) => item.id !== clip.id && item.track === clip.track && item.startMs >= oldEnd)) {
      before.push(sibling);
      after.push({ ...sibling, startMs: Math.max(0, sibling.startMs - clip.durationMs) });
    }
    for (const sibling of clips.filter((item) => item.id !== clip.id && item.track === targetTrack && item.startMs >= targetStartMs)) {
      before.push(sibling);
      after.push({ ...sibling, startMs: sibling.startMs + clip.durationMs });
    }
  }
  return { before, after };
}

export function timelineSnapCandidates(timeline, clipId, playheadMs) {
  return [...new Set([
    0,
    ...(timeline.markers ?? []).map((marker) => marker.timeMs),
    ...(timeline.clips ?? []).filter((clip) => clip.id !== clipId).flatMap((clip) => [clip.startMs, clip.startMs + clip.durationMs]),
    ...(Number.isFinite(Number(playheadMs)) ? [Math.max(0, Math.round(Number(playheadMs)))] : [])
  ])].sort((left, right) => left - right);
}

export function planSnapClip(timeline, clip, input = {}) {
  const requested = Math.max(0, finite(input.startMs ?? clip.startMs, "startMs"));
  const thresholdMs = Math.max(0, finite(input.thresholdMs ?? 120, "thresholdMs"));
  const candidates = timelineSnapCandidates(timeline, clip.id, input.playheadMs);
  const nearest = candidates.length ? candidates.reduce((best, candidate) => Math.abs(candidate - requested) < Math.abs(best - requested) ? candidate : best, candidates[0]) : requested;
  const snapped = Math.abs(nearest - requested) <= thresholdMs ? nearest : requested;
  return { before: [clip], after: [{ ...clip, startMs: snapped }], snap: { requestedStartMs: requested, snappedStartMs: snapped, thresholdMs, candidates } };
}
