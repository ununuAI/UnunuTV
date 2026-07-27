import { UnuTvError } from "@ununu/unutv-contracts";

export function compileRenderGraph(timeline, preset) {
  const tracks = Array.isArray(timeline.tracks) ? timeline.tracks : [];
  const videoTrack = tracks.find((track) => track.kind === "video" && track.visible !== false) ?? { order: 0 };
  const audioTracks = tracks.filter((track) => track.kind === "audio" && track.visible !== false && !track.muted);
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
  const target = preset === "h264_vertical" ? { width: 1080, height: 1920 } : preset === "h264_square" ? { width: 1080, height: 1080 } : { width: timeline.width, height: timeline.height };
  const subtitleTracks = tracks.filter((track) => ["subtitle", "text"].includes(track.kind));
  const subtitleStyle = subtitleTracks.find((track) => track.payload?.subtitleStyle)?.payload.subtitleStyle ?? { fontFamily: "PingFang SC", fontSize: 48, color: "#ffffff", outlineColor: "#000000", outlineWidth: 2, alignment: "bottom_center", marginBottom: 72 };
  const transitions = (timeline.transitions ?? []).filter((transition) => clips.some((clip) => clip.id === transition.fromClipId) && clips.some((clip) => clip.id === transition.toClipId));
  const effects = (timeline.effects ?? []).filter((effect) => effect.enabled !== false && clips.some((clip) => clip.id === effect.clipId));
  const keyframes = (timeline.keyframes ?? []).filter((keyframe) => clips.some((clip) => clip.id === keyframe.clipId));
  const audioDurationMs = Math.max(0, ...audioClips.map((clip) => clip.startMs + clip.durationMs));
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
      effects: effects.filter((effect) => effect.clipId === clip.id),
      keyframes: keyframes.filter((keyframe) => keyframe.clipId === clip.id)
    })),
    audioClips: audioClips.map((clip) => ({ clipId: clip.id, mediaId: clip.mediaId, track: clip.track, startMs: clip.startMs, durationMs: clip.durationMs, trimInMs: clip.trimInMs, volume: Number(clip.payload?.volume ?? 1) })),
    subtitleCues: subtitleClips.map((clip) => ({ clipId: clip.id, startMs: clip.startMs, endMs: clip.startMs + clip.durationMs, text: clip.payload.text.trim() })),
    subtitleStyle,
    transitions: transitions.map((transition) => ({ id: transition.id, fromClipId: transition.fromClipId, toClipId: transition.toClipId, kind: transition.kind, durationMs: transition.durationMs, payload: transition.payload ?? {} })),
    effects,
    keyframes,
    exchange: { frameRate: timeline.frameRate, timebase: `${timeline.frameRate}/1`, includeEdl: true, includeFcpxml: true },
    durationMs: audioOnly ? audioDurationMs : Math.max(1, renderDurationMs)
  };
}
