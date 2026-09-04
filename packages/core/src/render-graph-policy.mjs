import { UnuTvError } from "@ununu/unutv-contracts";

export function compileRenderGraph(timeline, preset) {
  const tracks = Array.isArray(timeline.tracks) ? timeline.tracks : [];
  const videoTrack = tracks.find((track) => track.kind === "video" && track.visible !== false) ?? { order: 0 };
  const audioTracks = tracks.filter((track) => track.kind === "audio" && track.visible !== false && !track.muted);
  const audioTrackByOrder = new Map(audioTracks.map((track) => [track.order, track]));
  const subtitleOrders = new Set(tracks.filter((track) => ["subtitle", "text"].includes(track.kind) && track.visible !== false).map((track) => track.order));
  const soloAudioTracks = audioTracks.filter((track) => track.solo);
  const enabledAudioOrders = new Set((soloAudioTracks.length ? soloAudioTracks : audioTracks).map((track) => track.order));
  const clips = timeline.clips.filter((clip) => clip.track === videoTrack.order).sort((left, right) => left.startMs - right.startMs);
  const audioClips = timeline.clips.filter((clip) => enabledAudioOrders.has(clip.track)).sort((left, right) => left.startMs - right.startMs);
  const subtitleClips = timeline.clips.filter((clip) => subtitleOrders.has(clip.track) && typeof clip.payload?.text === "string" && clip.payload.text.trim()).sort((left, right) => left.startMs - right.startMs);
  const audioOnly = preset === "wav_mix";
  if (!audioOnly && !clips.length) throw new UnuTvError("render_timeline_empty", "主视频轨没有可渲染片段", 409);
  if (audioOnly && !audioClips.length) throw new UnuTvError("render_audio_empty", "没有可导出的音频片段", 409);
  if (!audioOnly && clips.some((clip) => !clip.mediaId)) throw new UnuTvError("render_media_missing", "主视频轨存在没有媒体版本的片段", 409);
  if (audioClips.some((clip) => !clip.mediaId)) throw new UnuTvError("render_audio_missing", "音频轨存在没有媒体版本的片段", 409);
  for (const clip of clips.filter((entry) => entry.payload?.sourceAudioRepair?.status === "repaired")) {
    if (clip.payload?.includeEmbeddedAudio !== false) {
      throw new UnuTvError(
        "render_repaired_source_audio_not_disabled",
        "已修复视频片段仍启用原嵌入音轨，禁止渲染。",
        409,
        { clipId: clip.id, sourceMediaId: clip.mediaId }
      );
    }
    const remix = audioClips.find((entry) => (
      entry.mediaId === clip.payload.sourceAudioRepair.remixMediaId
      && entry.payload?.sourceVideoClipId === clip.id
      && entry.startMs === clip.startMs
      && entry.durationMs === clip.durationMs
      && entry.trimInMs === clip.trimInMs
    ));
    if (!remix) {
      throw new UnuTvError(
        "render_repaired_source_remix_missing",
        "已修复视频片段缺少时间对齐的回混音频轨，禁止渲染。",
        409,
        { clipId: clip.id, remixMediaId: clip.payload.sourceAudioRepair.remixMediaId }
      );
    }
  }
  for (const clip of clips.filter((entry) => entry.payload?.segmentBoundaryBefore)) {
    const seam = clip.payload.segmentBoundaryBefore;
    const atMs = Number(seam.atMs ?? clip.startMs);
    const audioBridge = audioClips.find((entry) => (
      entry.payload?.segmentSeam?.boundaryId === seam.boundaryId
      && entry.payload?.segmentSeam?.seamAction === seam.seamAction
      && ["continuous_ambience", "j_cut", "l_cut", "j_l_cut"].includes(entry.payload?.segmentSeam?.audioEdit)
      && entry.startMs <= atMs
      && entry.startMs + entry.durationMs >= atMs
    ));
    if (!audioBridge) {
      throw new UnuTvError(
        "render_segment_seam_audio_bridge_missing",
        "canonical segment seam 缺少跨越实际边界的持续环境底/J-L cut 音频轨，禁止渲染。",
        409,
        { boundaryId: seam.boundaryId, clipId: clip.id, seamAction: seam.seamAction }
      );
    }
    if (
      seam.createsEditPoint !== true
      && !["continuous_ambience", "j_l_cut"].includes(audioBridge.payload?.segmentSeam?.audioEdit)
    ) {
      throw new UnuTvError(
        "render_segment_seam_continuity_audio_required",
        "非剪辑点的 one-take/continuation 接缝必须用持续环境底或 J-L 双向声桥保护。",
        409,
        { boundaryId: seam.boundaryId, clipId: clip.id }
      );
    }
  }
  const transitionByPair = new Map((timeline.transitions ?? []).map((transition) => [`${transition.fromClipId}:${transition.toClipId}`, transition]));
  let cursorMs = 0;
  let renderDurationMs = 0;
  for (const [index, clip] of clips.entries()) {
    const previous = clips[index - 1];
    const transition = previous ? transitionByPair.get(`${previous.id}:${clip.id}`) : null;
    if (clip.startMs < cursorMs && !transition) throw new UnuTvError("render_track_overlap", "主视频轨存在未由转场解释的重叠片段", 409, { clipId: clip.id });
    const gapMs = Math.max(0, clip.startMs - cursorMs);
    renderDurationMs += gapMs + clip.durationMs - Math.min(transition?.durationMs ?? 0, clip.durationMs, previous?.durationMs ?? clip.durationMs);
    cursorMs = clip.startMs + clip.durationMs;
  }
  const target = preset === "h264_vertical" ? { width: 480, height: 854 } : preset === "h264_square" ? { width: 480, height: 480 } : { width: timeline.width, height: timeline.height };
  const subtitleTracks = tracks.filter((track) => ["subtitle", "text"].includes(track.kind));
  const subtitleStyle = subtitleTracks.find((track) => track.payload?.subtitleStyle)?.payload.subtitleStyle ?? { fontFamily: "PingFang SC", fontSize: 48, color: "#ffffff", outlineColor: "#000000", outlineWidth: 2, alignment: "bottom_center", marginBottom: 72 };
  const transitions = (timeline.transitions ?? []).filter((transition) => clips.some((clip) => clip.id === transition.fromClipId) && clips.some((clip) => clip.id === transition.toClipId));
  const effects = (timeline.effects ?? []).filter((effect) => effect.enabled !== false && clips.some((clip) => clip.id === effect.clipId));
  const keyframes = (timeline.keyframes ?? []).filter((keyframe) => clips.some((clip) => clip.id === keyframe.clipId));
  const audioDurationMs = Math.max(0, ...audioClips.map((clip) => clip.startMs + clip.durationMs));
  const configuredSoundMix = audioTracks.map((track) => track.payload?.soundMix).find((value) => value && typeof value === "object") ?? {};
  return {
    timelineId: timeline.id, preset, audioOnly, frameRate: timeline.frameRate, width: target.width, height: target.height, sourceWidth: timeline.width, sourceHeight: timeline.height, colorSpace: timeline.colorSpace,
    clips: clips.map((clip) => ({
      clipId: clip.id,
      mediaId: clip.mediaId,
      startMs: clip.startMs,
      durationMs: clip.durationMs,
      trimInMs: clip.trimInMs,
      includeEmbeddedAudio: clip.payload?.includeEmbeddedAudio !== false && clip.payload?.muted !== true,
      embeddedAudioVolume: Number(clip.payload?.embeddedAudioVolume ?? clip.payload?.volume ?? 1),
      segmentBoundaryBefore: clip.payload?.segmentBoundaryBefore ?? null,
      effects: effects.filter((effect) => effect.clipId === clip.id),
      keyframes: keyframes.filter((keyframe) => keyframe.clipId === clip.id)
    })),
    audioClips: audioClips.map((clip) => {
      const trackPayload = audioTrackByOrder.get(clip.track)?.payload ?? {};
      return {
        clipId: clip.id,
        mediaId: clip.mediaId,
        track: clip.track,
        startMs: clip.startMs,
        durationMs: clip.durationMs,
        trimInMs: clip.trimInMs,
        volume: Number(clip.payload?.volume ?? trackPayload.volume ?? 1),
        role: String(clip.payload?.role ?? trackPayload.role ?? "audio"),
        fadeInMs: Number(clip.payload?.fadeInMs ?? trackPayload.fadeInMs ?? 0),
        fadeOutMs: Number(clip.payload?.fadeOutMs ?? trackPayload.fadeOutMs ?? 0),
        ducking: clip.payload?.ducking ?? trackPayload.ducking ?? null,
        segmentSeam: clip.payload?.segmentSeam ?? null
      };
    }),
    soundMix: {
      normalize: configuredSoundMix.normalize === true,
      targetLufs: Number(configuredSoundMix.targetLufs ?? -16),
      truePeakDbtp: Number(configuredSoundMix.truePeakDbtp ?? -1.5)
    },
    subtitleCues: subtitleClips.map((clip) => ({ clipId: clip.id, startMs: clip.startMs, endMs: clip.startMs + clip.durationMs, text: clip.payload.text.trim() })),
    subtitleStyle,
    transitions: transitions.map((transition) => ({ id: transition.id, fromClipId: transition.fromClipId, toClipId: transition.toClipId, kind: transition.kind, durationMs: transition.durationMs, payload: transition.payload ?? {} })),
    effects,
    keyframes,
    exchange: { frameRate: timeline.frameRate, timebase: `${timeline.frameRate}/1`, includeEdl: true, includeFcpxml: true },
    durationMs: audioOnly ? audioDurationMs : Math.max(1, renderDurationMs)
  };
}
