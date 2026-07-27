"use client";

import { ArrowLeftRight, Columns2, Images, Pause, Play, RotateCcw, Rows2, Volume2, VolumeX } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  compareDividerStyle,
  compareOverlayClipStyle,
  compareVideoDuration,
  formatCompareTime,
  normalizeCompareState,
  orderedCompareSources,
  resolveCompareSources
} from "./compare-node-policy.js";
import { mediaUrlForNode } from "./media-candidate-policy.js";

function CompareMedia({ mediaRef, muted = true, onLoadedMetadata, onTimeUpdate, source }) {
  if (source.kind === "video") {
    return <video loop muted={muted} onLoadedMetadata={onLoadedMetadata} onTimeUpdate={onTimeUpdate} playsInline preload="auto" ref={mediaRef} src={source.url} />;
  }
  return <img alt={source.title} src={source.url} />;
}

function stop(event) {
  event.stopPropagation();
}

export function MomoCompareNode({ actions, connectedNodes, node, readOnly, selected }) {
  const [state, setState] = useState(() => normalizeCompareState(node.payload));
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const rootRef = useRef(null);
  const firstVideoRef = useRef(null);
  const secondVideoRef = useRef(null);
  const dragRef = useRef(null);
  const resumeAfterSeekRef = useRef(false);
  const sources = useMemo(() => resolveCompareSources(connectedNodes, mediaUrlForNode), [connectedNodes]);
  const [first, second] = orderedCompareSources(sources, state.swapLayer);
  const hasVideo = first?.kind === "video" || second?.kind === "video";
  const sourceSignature = sources.map((source) => source.id).join("|");

  const videos = () => [firstVideoRef.current, secondVideoRef.current].filter(Boolean);
  const pauseVideos = () => {
    videos().forEach((video) => video.pause());
    setPlaying(false);
  };
  const playVideos = async () => {
    const activeVideos = videos();
    if (!activeVideos.length) return;
    const results = await Promise.allSettled(activeVideos.map((video) => video.play()));
    setPlaying(results.some((result) => result.status === "fulfilled"));
  };

  useEffect(() => setState(normalizeCompareState(node.payload)), [node.payload?.sliderPosition, node.payload?.splitDirection, node.payload?.swapLayer]);
  useEffect(() => {
    if (!selected) pauseVideos();
  }, [selected]);
  useEffect(() => {
    pauseVideos();
    setCurrentTime(0);
    setDuration(0);
  }, [sourceSignature]);
  useEffect(() => () => {
    window.removeEventListener("pointermove", dragRef.current?.move);
    window.removeEventListener("pointerup", dragRef.current?.end);
  }, []);

  const persist = (next) => {
    setState(next);
    if (!readOnly) void actions.updatePayload(node, next);
  };

  const togglePlayback = async () => {
    if (playing) pauseVideos();
    else await playVideos();
  };

  const synchronizeVideos = (event) => {
    const source = event.currentTarget;
    const peer = source === firstVideoRef.current ? secondVideoRef.current : firstVideoRef.current;
    setCurrentTime(source.currentTime || 0);
    if (peer && Math.abs(peer.currentTime - source.currentTime) > .8) peer.currentTime = source.currentTime;
  };

  const updateDuration = () => setDuration(compareVideoDuration(firstVideoRef.current?.duration, secondVideoRef.current?.duration));
  const seekVideos = (value) => {
    const next = Math.max(0, Math.min(duration || 0, Number(value) || 0));
    setCurrentTime(next);
    videos().forEach((video) => {
      if (Math.abs(video.currentTime - next) > .05) video.currentTime = next;
    });
  };

  const swapSources = () => {
    const resume = playing;
    const time = currentTime;
    pauseVideos();
    persist({ ...state, swapLayer: !state.swapLayer });
    requestAnimationFrame(() => {
      seekVideos(time);
      if (resume) void playVideos();
    });
  };

  const beginDividerDrag = (event) => {
    if (readOnly || !second) return;
    stop(event);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const move = (pointerEvent) => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      const raw = state.splitDirection === "horizontal"
        ? (pointerEvent.clientY - rect.top) / rect.height * 100
        : (pointerEvent.clientX - rect.left) / rect.width * 100;
      setState((current) => ({ ...current, sliderPosition: Math.max(0, Math.min(100, raw)) }));
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      dragRef.current = null;
      setState((current) => {
        if (!readOnly) void actions.updatePayload(node, current);
        return current;
      });
    };
    dragRef.current = { move, end };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end, { once: true });
  };

  return <div className={`momo-compare-node${second ? " has-pair" : " is-incomplete"}`} ref={rootRef}>
    {selected && second ? <div aria-label="对比工具" className="momo-compare-toolbar nodrag nopan" onPointerDown={stop}>
      <button aria-label="交换对比位置" disabled={readOnly} onClick={swapSources} title="交换对比位置" type="button"><ArrowLeftRight size={15} /></button>
      <button aria-label={state.splitDirection === "vertical" ? "切换为上下对比" : "切换为左右对比"} disabled={readOnly} onClick={() => persist({ ...state, splitDirection: state.splitDirection === "vertical" ? "horizontal" : "vertical" })} type="button">{state.splitDirection === "vertical" ? <Rows2 size={15} /> : <Columns2 size={15} />}</button>
      <button aria-label="重置对比线居中" disabled={readOnly} onClick={() => persist({ ...state, sliderPosition: 50 })} type="button"><RotateCcw size={15} /></button>
      {hasVideo ? <><i /><button aria-label={playing ? "暂停同步" : "播放同步"} onClick={() => void togglePlayback()} type="button">{playing ? <Pause size={15} /> : <Play size={15} />}</button><button aria-label={muted ? "取消静音" : "静音"} aria-pressed={!muted} onClick={() => setMuted((value) => !value)} type="button">{muted ? <VolumeX size={15} /> : <Volume2 size={15} />}</button></> : null}
    </div> : null}
    {second ? <>
      <div className="momo-compare-layer is-base"><CompareMedia mediaRef={firstVideoRef} muted={muted} onLoadedMetadata={updateDuration} onTimeUpdate={synchronizeVideos} source={first} /></div>
      <div className="momo-compare-layer is-overlay" style={compareOverlayClipStyle(state)}><CompareMedia mediaRef={secondVideoRef} onLoadedMetadata={updateDuration} source={second} /></div>
      <button aria-label="拖动对比线" className={`momo-compare-divider nodrag nopan is-${state.splitDirection}`} disabled={readOnly} onPointerDown={beginDividerDrag} style={compareDividerStyle(state)} type="button"><span /></button>
      {selected ? <div className="momo-compare-labels"><span>{state.splitDirection === "vertical" ? "左侧" : "上侧"}：{first.title}</span><span>{state.splitDirection === "vertical" ? "右侧" : "下侧"}：{second.title}</span></div> : null}
      {selected && hasVideo ? <div className="momo-compare-playback nodrag nopan nowheel" onPointerDown={stop}>
        <time>{formatCompareTime(currentTime)}</time>
        <input aria-label="同步播放位置" max={duration || 100} min="0" onChange={(event) => seekVideos(event.currentTarget.value)} onPointerDown={() => { resumeAfterSeekRef.current = playing; pauseVideos(); }} onPointerUp={() => { if (resumeAfterSeekRef.current) void playVideos(); resumeAfterSeekRef.current = false; }} step="0.01" type="range" value={Math.min(currentTime, duration || 100)} />
        <time>{formatCompareTime(duration)}</time>
      </div> : null}
    </> : <div className="momo-compare-empty-slot"><Images size={32} strokeWidth={1.25} /><strong>请连接 2 个节点进行对比</strong>{first ? <small>已连接 1 个节点：{first.title}</small> : null}</div>}
  </div>;
}
