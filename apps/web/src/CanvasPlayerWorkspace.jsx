"use client";

import { ChevronLeft, ChevronRight, Diamond, GitMerge, GripHorizontal, Maximize2, PanelRight, Pause, PictureInPicture2, Play, Search, Sparkles, X } from "lucide-react";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { api } from "./api.js";
import {
  clipAtTimelineMs,
  defaultDetachedPlayerPosition,
  isSequencePlaybackComplete,
  isTimelineSequencePreview,
  localSecondsForTimelineMs,
  moveDetachedPlayer,
  nextSequenceClip,
  PLAYER_DEFAULT_SIZE,
  resizeDetachedPlayer,
  shouldAdvanceSequenceClip,
  shouldApplyTimelineSeek,
  shouldKeepPlayingAcrossClipBoundary,
  shouldReplaceMediaSource,
  shouldReportPlayerClock,
  shouldSeekMediaElement,
  shouldSwapSequenceClip,
  subtitleAtTimelineMs,
  shouldTreatMediaPauseAsStop,
  timelineMediaUrl,
  timelineSecondsForLocalTime,
  timelineSequenceDurationMs
} from "./player-workspace-policy.js";

const INSPECTOR_TABS = Object.freeze([
  ["properties", "属性"],
  ["animation", "动画"],
  ["effects", "特效"],
  ["transitions", "转场"],
  ["configuration", "配置"]
]);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function timecode(seconds, frameRate = 30) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const minutes = Math.floor(total / 60).toString().padStart(2, "0");
  const remainder = (total % 60).toString().padStart(2, "0");
  const frames = Math.floor(((Number(seconds) || 0) - total) * frameRate).toString().padStart(2, "0");
  return `00:${minutes}:${remainder}:${frames}`;
}

export const CanvasPlayerWorkspace = forwardRef(function CanvasPlayerWorkspace({ notify, onClose, onClock, onTransport, preview }, ref) {
  const videoRef = useRef(null);
  const slot0Ref = useRef(null);
  const slot1Ref = useRef(null);
  const workspaceRef = useRef(null);
  const dragRef = useRef(null);
  const playingRef = useRef(false);
  const switchingClipRef = useRef(false);
  const userPausedRef = useRef(false);
  const pendingSwapRef = useRef(null);
  const scrubbingRef = useRef(false);
  const onClockRef = useRef(onClock);
  const onTransportRef = useRef(onTransport);
  const activeClipRef = useRef(null);
  const timelineDetailRef = useRef(null);
  const timelineMsRef = useRef(0);
  const activeSlotRef = useRef(0);
  const previewRef = useRef(preview);
  const [detached, setDetached] = useState(false);
  const [position, setPosition] = useState(() => defaultDetachedPlayerPosition(typeof window === "undefined" ? 550 : window.innerWidth));
  const [size, setSize] = useState(PLAYER_DEFAULT_SIZE);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [resolution, setResolution] = useState("—");
  const [inspectorTab, setInspectorTab] = useState("properties");
  const [timelineDetail, setTimelineDetail] = useState(null);
  const [timelineBusy, setTimelineBusy] = useState(false);
  const [timelineMs, setTimelineMs] = useState(0);
  const sequenceMode = isTimelineSequencePreview(preview);
  const frameRate = preview?.frameRate || timelineDetail?.frameRate || 30;
  const activeClip = sequenceMode
    ? clipAtTimelineMs(timelineDetail, timelineMs)
    : timelineDetail?.clips?.find((clip) => clip.id === preview?.clipId) || null;
  const mediaId = sequenceMode ? activeClip?.mediaId || null : preview?.mediaId || null;
  const mediaUrl = timelineMediaUrl(preview?.projectId, mediaId, preview?.proxy);
  const subtitleClip = sequenceMode ? subtitleAtTimelineMs(timelineDetail, currentTime * 1000) : null;
  const subtitleText = String(subtitleClip?.payload?.text || "").trim();
  const sequenceDuration = sequenceMode ? timelineSequenceDurationMs(timelineDetail) / 1000 : duration;
  const mediaTitle = sequenceMode
    ? (activeClip?.payload?.title || preview?.title || "主时间线")
    : (preview?.title || "未选择时间线媒体");
  const timelineClip = activeClip || timelineDetail?.clips?.find((clip) => clip.id === preview?.clipId) || null;
  const clipEffects = (timelineDetail?.effects || []).filter((effect) => effect.clipId === timelineClip?.id);
  const clipKeyframes = (timelineDetail?.keyframes || []).filter((keyframe) => keyframe.clipId === timelineClip?.id);
  const clipTransitions = (timelineDetail?.transitions || []).filter((transition) => transition.fromClipId === timelineClip?.id || transition.toClipId === timelineClip?.id);

  playingRef.current = playing;
  onClockRef.current = onClock;
  onTransportRef.current = onTransport;
  previewRef.current = preview;
  timelineDetailRef.current = timelineDetail;
  timelineMsRef.current = timelineMs;
  videoRef.current = (activeSlotRef.current === 1 ? slot1Ref : slot0Ref).current;

  function activeVideo() {
    return (activeSlotRef.current === 1 ? slot1Ref : slot0Ref).current;
  }

  function standbyVideo() {
    return (activeSlotRef.current === 1 ? slot0Ref : slot1Ref).current;
  }

  function reportClock(ms) {
    if (!shouldReportPlayerClock({ playing: playingRef.current, scrubbing: scrubbingRef.current })) return;
    onClockRef.current?.(Math.max(0, Number(ms) || 0));
  }

  function reportTransport(next) {
    onTransportRef.current?.(Boolean(next));
  }

  function markSlot(element, active) {
    if (!element) return;
    element.classList.toggle("is-active", active);
    element.classList.toggle("is-standby", !active);
    element.muted = !active;
  }

  function clipUrl(clip) {
    return timelineMediaUrl(previewRef.current?.projectId, clip?.mediaId, previewRef.current?.proxy);
  }

  function bindSource(video, url) {
    if (!video) return false;
    const nextUrl = url || "";
    const currentUrl = video.dataset.mediaUrl || video.getAttribute("src") || video.currentSrc || "";
    if (!shouldReplaceMediaSource({ currentUrl, nextUrl })) return false;
    video.dataset.mediaUrl = nextUrl;
    if (!nextUrl) return false;
    video.preload = "auto";
    video.src = nextUrl;
    return true;
  }

  function armStandby(clip) {
    const next = nextSequenceClip(timelineDetailRef.current, clip || activeClipRef.current);
    const standby = standbyVideo();
    if (!standby || !next) return;
    bindSource(standby, clipUrl(next));
    standby.muted = true;
    const startAt = localSecondsForTimelineMs(next, next.startMs);
    const park = () => {
      if (standby === activeVideo()) return;
      if (Math.abs((standby.currentTime || 0) - startAt) > 0.08) standby.currentTime = startAt;
    };
    if (standby.readyState >= 1) park();
    else standby.addEventListener("loadeddata", park, { once: true });
  }

  function syncBuffers() {
    const clip = activeClipRef.current;
    bindSource(activeVideo(), clipUrl(clip));
    markSlot(activeVideo(), true);
    markSlot(standbyVideo(), false);
    armStandby(clip);
  }

  function applyLocalTime(clip, timeMs, force = false, video = activeVideo()) {
    if (!video || !clip) return;
    if (!shouldSeekMediaElement({ playing: playingRef.current, force })) return;
    const local = localSecondsForTimelineMs(clip, timeMs);
    if (shouldApplyTimelineSeek({ force, currentSeconds: video.currentTime || 0, targetSeconds: local })) video.currentTime = local;
  }

  function sequenceSecondsFromVideo() {
    const clip = activeClipRef.current;
    const video = activeVideo();
    if (!clip || !video) return timelineMsRef.current / 1000;
    return timelineSecondsForLocalTime(clip, video.currentTime);
  }

  function commitSwap(next, incoming, outgoing) {
    activeSlotRef.current = 1 - activeSlotRef.current;
    activeClipRef.current = next;
    timelineMsRef.current = next.startMs;
    videoRef.current = incoming || null;
    markSlot(incoming, true);
    markSlot(outgoing, false);
    if (outgoing && outgoing !== incoming) {
      outgoing.muted = true;
      outgoing.pause();
    }
    if (incoming) incoming.muted = false;
    playingRef.current = true;
    setPlaying(true);
    reportTransport(true);
    setTimelineMs(next.startMs);
    setCurrentTime(next.startMs / 1000);
    reportClock(next.startMs);
    switchingClipRef.current = false;
    pendingSwapRef.current = null;
    syncBuffers();
  }

  function sequenceIsComplete() {
    const video = activeVideo();
    const next = nextSequenceClip(timelineDetailRef.current, activeClipRef.current);
    return isSequencePlaybackComplete({
      timelineMs: timelineMsRef.current,
      durationMs: timelineSequenceDurationMs(timelineDetailRef.current),
      ended: Boolean(video?.ended),
      hasNextClip: Boolean(next)
    });
  }

  function restartSequence() {
    const first = clipAtTimelineMs(timelineDetailRef.current, 0);
    if (!first) return Promise.resolve();
    userPausedRef.current = false;
    scrubbingRef.current = false;
    switchingClipRef.current = false;
    pendingSwapRef.current = null;
    playingRef.current = true;
    activeSlotRef.current = 0;
    activeClipRef.current = first;
    timelineMsRef.current = 0;
    markSlot(slot0Ref.current, true);
    markSlot(slot1Ref.current, false);
    bindSource(slot0Ref.current, clipUrl(first));
    setPlaying(true);
    reportTransport(true);
    setTimelineMs(0);
    setCurrentTime(0);
    onClockRef.current?.(0);
    syncBuffers();
    const video = slot0Ref.current;
    const startAt = localSecondsForTimelineMs(first, 0);
    const start = () => {
      if (!video) return Promise.resolve();
      video.muted = false;
      if (Math.abs((video.currentTime || 0) - startAt) > 0.08 || video.ended) video.currentTime = startAt;
      return video.play().catch(() => {});
    };
    if (video?.readyState >= 2) return start();
    return new Promise((resolve) => {
      if (!video) { resolve(); return; }
      video.addEventListener("canplay", () => { resolve(start()); }, { once: true });
    });
  }

  function advanceToNextClip() {
    if (userPausedRef.current) return false;
    const next = nextSequenceClip(timelineDetailRef.current, activeClipRef.current);
    if (!shouldKeepPlayingAcrossClipBoundary({ userPaused: userPausedRef.current, hasNextClip: Boolean(next) })) return false;
    if (switchingClipRef.current) return true;
    switchingClipRef.current = true;
    const incoming = standbyVideo();
    const outgoing = activeVideo();
    const startAt = localSecondsForTimelineMs(next, next.startMs);
    if (!incoming) {
      switchingClipRef.current = false;
      return false;
    }
    bindSource(incoming, clipUrl(next));
    incoming.muted = true;
    const reveal = () => {
      if (userPausedRef.current) {
        switchingClipRef.current = false;
        incoming.pause();
        return;
      }
      commitSwap(next, incoming, outgoing);
    };
    const startIncoming = () => {
      if (userPausedRef.current) {
        switchingClipRef.current = false;
        return;
      }
      if (incoming.readyState >= 1 && Math.abs((incoming.currentTime || 0) - startAt) > 0.08) incoming.currentTime = startAt;
      const started = incoming.play();
      if (incoming.readyState >= 2) reveal();
      else incoming.addEventListener("playing", reveal, { once: true });
      if (started?.catch) started.catch(() => reveal());
    };
    if (incoming.readyState >= 2) startIncoming();
    else incoming.addEventListener("canplay", startIncoming, { once: true });
    return true;
  }

  useImperativeHandle(ref, () => ({
    pause() {
      userPausedRef.current = true;
      scrubbingRef.current = false;
      switchingClipRef.current = false;
      pendingSwapRef.current = null;
      playingRef.current = false;
      setPlaying(false);
      activeVideo()?.pause();
      const standby = standbyVideo();
      if (standby) { standby.muted = true; standby.pause(); }
    },
    play() {
      userPausedRef.current = false;
      scrubbingRef.current = false;
      if (sequenceMode && sequenceIsComplete()) return restartSequence();
      playingRef.current = true;
      syncBuffers();
      const video = activeVideo();
      if (video?.ended) video.currentTime = 0;
      return video?.play();
    },
    seek(seconds, options = {}) {
      const ms = Math.max(0, (Number(seconds) || 0) * 1000);
      const force = options.force === true;
      scrubbingRef.current = options.scrubbing === true;
      if (sequenceMode) {
        if (!shouldSeekMediaElement({ playing: playingRef.current, force })) return;
        const clip = clipAtTimelineMs(timelineDetailRef.current, ms);
        activeClipRef.current = clip;
        setTimelineMs(ms);
        setCurrentTime(ms / 1000);
        syncBuffers();
        applyLocalTime(clip, ms, force);
        return;
      }
      const video = activeVideo();
      if (force && video) video.currentTime = clamp(Number(seconds) || 0, 0, video.duration || 0);
    },
    stepFrames(delta) {
      const next = (sequenceMode ? timelineMs / 1000 : (activeVideo()?.currentTime || 0)) + Number(delta || 0) / frameRate;
      this.seek(next, { force: true });
    }
  }), [frameRate, sequenceMode, timelineDetail, timelineMs]);

  useEffect(() => {
    if (!playing) return undefined;
    let frame;
    let lastUi = 0;
    const tick = (now) => {
      const video = activeVideo();
      if (video && sequenceMode && activeClipRef.current) {
        const clip = activeClipRef.current;
        const next = nextSequenceClip(timelineDetailRef.current, clip);
        const hasNext = Boolean(next);
        const standby = standbyVideo();
        if (hasNext && video.currentTime > 0.15) armStandby(clip);
        const leadSeconds = standby && standby.readyState >= 3 ? 3 / Math.max(12, frameRate) : 0;
        if (shouldSwapSequenceClip({
          localSeconds: video.currentTime,
          clipDurationMs: clip.durationMs,
          mediaDurationSeconds: video.duration || 0,
          ended: video.ended,
          hasNextClip: hasNext,
          leadSeconds
        }) || shouldAdvanceSequenceClip({
          localSeconds: video.currentTime,
          clipDurationMs: clip.durationMs,
          ended: video.ended,
          hasNextClip: hasNext
        })) {
          advanceToNextClip();
        } else {
          const seconds = timelineSecondsForLocalTime(clip, video.currentTime);
          reportClock(seconds * 1000);
          if (now - lastUi > 80) {
            lastUi = now;
            setCurrentTime(seconds);
          }
        }
      } else if (video) {
        reportClock((video.currentTime || 0) * 1000);
        if (now - lastUi > 80) {
          lastUi = now;
          setCurrentTime(video.currentTime || 0);
        }
      }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [playing, sequenceMode, frameRate]);

  useEffect(() => {
    if (!sequenceMode || !timelineDetail) return undefined;
    if (!activeClipRef.current) activeClipRef.current = clipAtTimelineMs(timelineDetail, timelineMsRef.current);
    syncBuffers();
    return undefined;
  }, [sequenceMode, timelineDetail]);

  useEffect(() => {
    if (sequenceMode) return undefined;
    setCurrentTime(0);
    setDuration(0);
    setPlaying(false);
    return undefined;
  }, [mediaUrl, sequenceMode]);

  useEffect(() => {
    activeSlotRef.current = 0;
    switchingClipRef.current = false;
    pendingSwapRef.current = null;
    markSlot(slot0Ref.current, true);
    markSlot(slot1Ref.current, false);
  }, [preview?.timelineId, preview?.revision]);

  useEffect(() => () => {
    userPausedRef.current = true;
    playingRef.current = false;
    scrubbingRef.current = false;
    pendingSwapRef.current = null;
    slot0Ref.current?.pause();
    slot1Ref.current?.pause();
    onTransportRef.current?.(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!preview?.projectId || !preview?.timelineId) {
      setTimelineDetail(null);
      return undefined;
    }
    api.timeline(preview.projectId, preview.timelineId)
      .then((result) => {
        if (cancelled) return;
        setTimelineDetail(result);
        if (isTimelineSequencePreview(preview)) {
          setDuration(timelineSequenceDurationMs(result) / 1000);
        }
      })
      .catch((error) => notify?.(error));
    return () => { cancelled = true; };
  }, [notify, preview?.mode, preview?.projectId, preview?.revision, preview?.timelineId]);

  async function persistTimeline(action, message) {
    if (!preview?.projectId || !preview?.timelineId || !timelineClip || timelineBusy) return;
    setTimelineBusy(true);
    try {
      await action();
      setTimelineDetail(await api.timeline(preview.projectId, preview.timelineId));
      notify?.(message, false);
    } catch (error) {
      notify?.(error);
    } finally {
      setTimelineBusy(false);
    }
  }

  function addEffect(kind, parameters) {
    return persistTimeline(
      () => api.addTimelineEffect(preview.projectId, preview.timelineId, timelineClip.id, { kind, parameters }),
      kind === "color_grade" ? "调色效果已加入当前片段" : "变换效果已加入当前片段"
    );
  }

  function addKeyframe() {
    const localTime = clamp(Math.round(currentTime * 1000), 0, timelineClip?.durationMs || 0);
    return persistTimeline(
      () => api.addTimelineKeyframe(preview.projectId, preview.timelineId, timelineClip.id, { propertyPath: "transform.scale", timeMs: localTime, value: 1, easing: "ease_in_out" }),
      `已在 ${(localTime / 1000).toFixed(2)}s 加入缩放关键帧`
    );
  }

  function addTransition() {
    const siblings = (timelineDetail?.clips || []).filter((clip) => clip.track === timelineClip?.track).sort((left, right) => left.startMs - right.startMs);
    const index = siblings.findIndex((clip) => clip.id === timelineClip?.id);
    const next = siblings[index + 1];
    if (!next) { notify?.(new Error("当前片段后面没有相邻视频，无法添加转场")); return; }
    return persistTimeline(
      () => api.addTimelineTransition(preview.projectId, preview.timelineId, {
        fromClipId: timelineClip.id,
        toClipId: next.id,
        kind: "crossfade",
        durationMs: Math.min(250, timelineClip.durationMs, next.durationMs)
      }),
      "交叉叠化已加入两个相邻片段"
    );
  }

  function beginPointer(event, mode) {
    if (!detached) return;
    event.preventDefault();
    dragRef.current = { mode, startX: event.clientX, startY: event.clientY, position, size, nextPosition: position, nextSize: size, frame: 0 };
    const move = (nextEvent) => {
      const gesture = dragRef.current;
      if (!gesture) return;
      const dx = nextEvent.clientX - gesture.startX;
      const dy = nextEvent.clientY - gesture.startY;
      if (mode === "move") gesture.nextPosition = moveDetachedPlayer({ origin: gesture.position, delta: { x: dx, y: dy }, size: gesture.size, viewport: { width: window.innerWidth, height: window.innerHeight } });
      else gesture.nextSize = resizeDetachedPlayer({ origin: gesture.size, delta: { x: dx, y: dy }, viewport: { width: window.innerWidth - gesture.position.x, height: window.innerHeight - gesture.position.y } });
      if (gesture.frame) return;
      gesture.frame = window.requestAnimationFrame(() => {
        gesture.frame = 0;
        const element = workspaceRef.current;
        if (!element) return;
        element.style.left = `${gesture.nextPosition.x}px`;
        element.style.top = `${gesture.nextPosition.y}px`;
        element.style.width = `${gesture.nextSize.width}px`;
        element.style.height = `${gesture.nextSize.height}px`;
      });
    };
    const end = () => {
      const gesture = dragRef.current;
      if (gesture?.frame) window.cancelAnimationFrame(gesture.frame);
      if (gesture) { setPosition(gesture.nextPosition); setSize(gesture.nextSize); }
      dragRef.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end, { once: true });
  }

  function isActiveMediaElement(element) {
    return Boolean(element) && element === activeVideo();
  }

  function handlePlay(event) {
    if (!isActiveMediaElement(event.currentTarget)) return;
    userPausedRef.current = false;
    playingRef.current = true;
    setPlaying(true);
    reportTransport(true);
    syncBuffers();
  }

  function handlePause(event) {
    if (!isActiveMediaElement(event.currentTarget)) return;
    const video = event.currentTarget;
    const next = nextSequenceClip(timelineDetailRef.current, activeClipRef.current);
    if (!shouldTreatMediaPauseAsStop({
      switchingClip: switchingClipRef.current,
      userPaused: userPausedRef.current,
      ended: Boolean(video?.ended),
      hasNextClip: Boolean(next)
    })) return;
    if (sequenceMode && video && activeClipRef.current) {
      const ms = sequenceSecondsFromVideo() * 1000;
      setTimelineMs(ms);
      setCurrentTime(ms / 1000);
      reportClock(ms);
    }
    setPlaying(false);
    reportTransport(false);
  }

  function handleEnded(event) {
    if (!isActiveMediaElement(event.currentTarget)) return;
    if (!sequenceMode) {
      playingRef.current = false;
      setPlaying(false);
      reportTransport(false);
      return;
    }
    if (advanceToNextClip()) return;
    const endMs = timelineSequenceDurationMs(timelineDetailRef.current);
    playingRef.current = false;
    timelineMsRef.current = endMs;
    setPlaying(false);
    reportTransport(false);
    setTimelineMs(endMs);
    setCurrentTime(endMs / 1000);
    onClockRef.current?.(endMs);
  }

  function handleLoadedMetadata(event) {
    const element = event.currentTarget;
    if (isActiveMediaElement(element)) {
      setResolution(`${element.videoWidth}×${element.videoHeight}`);
      if (sequenceMode && activeClipRef.current && !playingRef.current) {
        applyLocalTime(activeClipRef.current, timelineMsRef.current, true, element);
      }
      return;
    }
    const next = nextSequenceClip(timelineDetailRef.current, activeClipRef.current);
    if (!next) return;
    element.muted = true;
    const startAt = localSecondsForTimelineMs(next, next.startMs);
    if (Math.abs((element.currentTime || 0) - startAt) > 0.08) element.currentTime = startAt;
  }

  async function togglePlayback() {
    const video = activeVideo();
    if (!video) return;
    if (sequenceMode && sequenceIsComplete()) {
      await restartSequence();
      return;
    }
    if (playingRef.current || !video.paused) {
      userPausedRef.current = true;
      switchingClipRef.current = false;
      pendingSwapRef.current = null;
      video.pause();
      const standby = standbyVideo();
      if (standby) { standby.muted = true; standby.pause(); }
      return;
    }
    userPausedRef.current = false;
    playingRef.current = true;
    syncBuffers();
    await video.play().catch(() => {});
  }

  const editorEmpty = <div className="player-inspector-empty"><strong>先在时间线选择一个视频片段</strong><small>播放器只编辑时间线中的片段，不直接修改画布视频节点。</small></div>;
  const inspector = <section className="canvas-player-inspector" aria-label="播放器属性检查器">
    <nav>{INSPECTOR_TABS.map(([id, label]) => <button aria-pressed={inspectorTab === id} className={inspectorTab === id ? "active" : ""} key={id} onClick={() => setInspectorTab(id)} type="button">{label}</button>)}</nav>
    <div className="player-inspector-body">
      {inspectorTab === "properties" ? <dl><div><dt>素材名称</dt><dd>{mediaTitle}</dd></div><div><dt>帧率</dt><dd>{frameRate} fps</dd></div><div><dt>分辨率</dt><dd>{resolution}</dd></div><div><dt>时长</dt><dd>{sequenceMode ? `${(sequenceDuration || 0).toFixed(2)}s` : duration ? `${duration.toFixed(2)}s` : "0s"}</dd></div><div><dt>时间线位置</dt><dd>{timelineClip ? `${(timelineClip.startMs / 1000).toFixed(2)}s` : sequenceMode ? `${currentTime.toFixed(2)}s` : "—"}</dd></div><div><dt>媒体版本</dt><dd>{mediaId ? String(mediaId).slice(0, 12) : "—"}</dd></div></dl> : null}
      {inspectorTab === "animation" ? timelineClip ? <div className="player-inspector-editor"><header><div><strong>动画与关键帧</strong><small>{clipKeyframes.length} 个关键帧</small></div><button disabled={timelineBusy} onClick={() => void addKeyframe()} type="button"><Diamond size={12} />在当前帧添加</button></header><div className="player-inspector-list">{clipKeyframes.length ? clipKeyframes.map((item) => <span key={item.id}><strong>{item.propertyPath}</strong><small>{(item.timeMs / 1000).toFixed(2)}s · {item.easing || "linear"}</small></span>) : <p>当前片段还没有关键帧。</p>}</div></div> : editorEmpty : null}
      {inspectorTab === "effects" ? timelineClip ? <div className="player-inspector-editor"><header><div><strong>片段特效</strong><small>{clipEffects.length} 个效果</small></div><div><button disabled={timelineBusy} onClick={() => void addEffect("transform", { opacity: 1, scale: 1 })} type="button"><Sparkles size={12} />变换</button><button disabled={timelineBusy} onClick={() => void addEffect("color_grade", { exposure: 0, contrast: 1, saturation: 1 })} type="button"><Sparkles size={12} />调色</button></div></header><div className="player-inspector-list">{clipEffects.length ? clipEffects.map((item) => <span key={item.id}><strong>{item.kind === "color_grade" ? "调色" : item.kind === "transform" ? "变换" : item.kind}</strong><small>{item.enabled ? "已启用" : "已停用"}</small></span>) : <p>当前片段还没有特效。</p>}</div></div> : editorEmpty : null}
      {inspectorTab === "transitions" ? timelineClip ? <div className="player-inspector-editor"><header><div><strong>片段转场</strong><small>{clipTransitions.length} 个转场</small></div><button disabled={timelineBusy} onClick={() => void addTransition()} type="button"><GitMerge size={12} />与下一片段叠化</button></header><div className="player-inspector-list">{clipTransitions.length ? clipTransitions.map((item) => <span key={item.id}><strong>{item.kind}</strong><small>{item.durationMs}ms</small></span>) : <p>当前连接点还没有转场。</p>}</div></div> : editorEmpty : null}
      {inspectorTab === "configuration" ? <dl><div><dt>播放器实例</dt><dd>单实例共享</dd></div><div><dt>挂载位置</dt><dd>{detached ? "画布顶层" : "右侧嵌入"}</dd></div><div><dt>播放时钟</dt><dd>双缓冲连续播放</dd></div><div><dt>编辑目标</dt><dd>{timelineClip ? "时间线片段" : "未选择片段"}</dd></div><div><dt>代理媒体</dt><dd>{preview?.proxy ? "已启用" : "原始媒体"}</dd></div></dl> : null}
    </div>
  </section>;
  const detachedStyle = detached ? { height: size.height, left: position.x, top: position.y, width: size.width } : undefined;

  return <><section className={`canvas-player-workspace${detached ? " is-detached" : " is-docked"}`} ref={workspaceRef} style={detachedStyle} aria-label="共享播放器">
    <header onPointerDown={(event) => beginPointer(event, "move")}>
      <div><span>播放器</span><small>{mediaTitle}</small></div>
      <GripHorizontal className="player-drag-mark" size={18} />
      <div className="player-window-actions">
        <button onClick={() => setDetached((value) => !value)} title={detached ? "重新嵌回右侧" : "脱离到画布顶层"} type="button">{detached ? <PanelRight size={15} /> : <PictureInPicture2 size={15} />}</button>
        <button onClick={onClose} title="关闭播放器" type="button"><X size={15} /></button>
      </div>
    </header>
    <div className={`canvas-player-stage${sequenceMode ? " is-sequence" : ""}`}>{mediaUrl || sequenceMode ? <>
      <video className="sequence-slot is-active" onDurationChange={(event) => { if (!sequenceMode) setDuration(event.currentTarget.duration || 0); }} onEnded={handleEnded} onLoadedMetadata={handleLoadedMetadata} onPause={handlePause} onPlay={handlePlay} playsInline preload="auto" ref={slot0Ref} {...(sequenceMode ? {} : { src: mediaUrl || undefined })} />
      {sequenceMode ? <video className="sequence-slot is-standby" onEnded={handleEnded} onLoadedMetadata={handleLoadedMetadata} onPause={handlePause} onPlay={handlePlay} playsInline preload="auto" ref={slot1Ref} /> : null}
      {subtitleText ? <p className="player-subtitle">{subtitleText}</p> : null}
    </> : <div className="player-stage-empty"><Search size={28} /><strong>{sequenceMode ? "时间线还没有可播视频" : "选择时间线视频片段"}</strong><small>{sequenceMode ? "把视频加入主时间线后，播放器会按片段顺序连续播放。" : "点击时间线中的视频片段，或打开已渲染的时间线母版。"}</small></div>}</div>
    <footer>
      <span>{timecode(currentTime, frameRate)} <em>/ {timecode(sequenceMode ? sequenceDuration : duration, frameRate)}</em></span>
      <button disabled={!mediaUrl} onClick={() => {
        activeVideo()?.pause();
        if (sequenceMode) {
          const nextMs = Math.max(0, timelineMs - 1000 / frameRate);
          setTimelineMs(nextMs);
          setCurrentTime(nextMs / 1000);
          applyLocalTime(clipAtTimelineMs(timelineDetail, nextMs), nextMs, true);
          return;
        }
        const video = activeVideo();
        if (video) video.currentTime = clamp(video.currentTime - 1 / frameRate, 0, video.duration || 0);
      }} title="后退一帧" type="button"><ChevronLeft size={16} /></button>
      <button disabled={!mediaUrl} onClick={() => void togglePlayback()} title={playing ? "暂停" : "播放"} type="button">{playing ? <Pause size={18} /> : <Play size={18} />}</button>
      <button disabled={!mediaUrl} onClick={() => {
        activeVideo()?.pause();
        if (sequenceMode) {
          const nextMs = Math.min(timelineSequenceDurationMs(timelineDetail), timelineMs + 1000 / frameRate);
          setTimelineMs(nextMs);
          setCurrentTime(nextMs / 1000);
          applyLocalTime(clipAtTimelineMs(timelineDetail, nextMs), nextMs, true);
          return;
        }
        const video = activeVideo();
        if (video) video.currentTime = clamp(video.currentTime + 1 / frameRate, 0, video.duration || 0);
      }} title="前进一帧" type="button"><ChevronRight size={16} /></button>
      <div><Search size={16} /><span>{resolution}</span><button disabled={!mediaUrl} onClick={() => activeVideo()?.requestFullscreen()} title="全屏播放" type="button"><Maximize2 size={16} /></button></div>
    </footer>
    {!detached ? inspector : null}
    {detached ? <button aria-label="调整播放器大小" className="player-resize-handle" onPointerDown={(event) => beginPointer(event, "resize")} type="button" /> : null}
  </section>{detached ? <aside className="canvas-player-inspector-dock">{inspector}</aside> : null}</>;
});
