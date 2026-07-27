"use client";

import { ChevronLeft, ChevronRight, GripHorizontal, Maximize2, PanelRight, Pause, PictureInPicture2, Play, Search, X } from "lucide-react";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { mediaUrlForNode } from "./media-candidate-policy.js";
import { defaultDetachedPlayerPosition, moveDetachedPlayer, PLAYER_DEFAULT_SIZE, resizeDetachedPlayer } from "./player-workspace-policy.js";
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

export const CanvasPlayerWorkspace = forwardRef(function CanvasPlayerWorkspace({ onClose, preview, selected }, ref) {
  const videoRef = useRef(null);
  const workspaceRef = useRef(null);
  const dragRef = useRef(null);
  const [detached, setDetached] = useState(false);
  const [position, setPosition] = useState(() => defaultDetachedPlayerPosition(typeof window === "undefined" ? 550 : window.innerWidth));
  const [size, setSize] = useState(PLAYER_DEFAULT_SIZE);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [resolution, setResolution] = useState("—");
  const [inspectorTab, setInspectorTab] = useState("properties");
  const isVideo = selected && ["video", "videoShot", "compose", "video-clip"].includes(selected.kind);
  const selectedMediaUrl = isVideo ? mediaUrlForNode(selected, selected.payload?.currentMediaId) : null;
  const mediaUrl = preview?.mediaId ? `/api/projects/${preview.projectId}/media/${preview.mediaId}${preview.proxy ? "/proxy" : ""}` : selectedMediaUrl;
  const mediaTitle = preview?.title || selected?.title || "未选择媒体";
  const mediaId = preview?.mediaId || selected?.payload?.currentMediaId || null;
  const frameRate = preview?.frameRate || selected?.payload?.fps || 30;

  useImperativeHandle(ref, () => ({
    pause() { videoRef.current?.pause(); },
    play() { return videoRef.current?.play(); },
    seek(seconds) { if (videoRef.current) videoRef.current.currentTime = clamp(Number(seconds) || 0, 0, videoRef.current.duration || 0); },
    stepFrames(delta) { if (videoRef.current) videoRef.current.currentTime = clamp(videoRef.current.currentTime + Number(delta || 0) / frameRate, 0, videoRef.current.duration || 0); }
  }), []);

  useEffect(() => { setCurrentTime(0); setDuration(0); setPlaying(false); }, [mediaUrl]);

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

  async function togglePlayback() {
    if (!videoRef.current) return;
    if (videoRef.current.paused) await videoRef.current.play();
    else videoRef.current.pause();
  }

  const inspector = <section className="canvas-player-inspector" aria-label="播放器属性检查器">
    <nav>{INSPECTOR_TABS.map(([id, label]) => <button aria-pressed={inspectorTab === id} className={inspectorTab === id ? "active" : ""} key={id} onClick={() => setInspectorTab(id)} type="button">{label}</button>)}</nav>
    <div className="player-inspector-body">
      {inspectorTab === "properties" ? <dl><div><dt>素材名称</dt><dd>{mediaTitle}</dd></div><div><dt>帧率</dt><dd>{frameRate} fps</dd></div><div><dt>分辨率</dt><dd>{resolution}</dd></div><div><dt>时长</dt><dd>{duration ? `${duration.toFixed(2)}s` : "0s"}</dd></div><div><dt>媒体版本</dt><dd>{mediaId ? String(mediaId).slice(0, 12) : "—"}</dd></div></dl> : null}
      {inspectorTab === "animation" ? <div className="player-inspector-empty"><strong>动画与关键帧</strong><small>选择时间线片段后，在这里查看位置、缩放、旋转和透明度关键帧。</small></div> : null}
      {inspectorTab === "effects" ? <div className="player-inspector-empty"><strong>片段特效</strong><small>已连接的效果链会与 TimelineDocument 片段版本同步显示。</small></div> : null}
      {inspectorTab === "transitions" ? <div className="player-inspector-empty"><strong>转场</strong><small>选择两个相邻片段的连接点后配置转场。</small></div> : null}
      {inspectorTab === "configuration" ? <dl><div><dt>播放器实例</dt><dd>单实例共享</dd></div><div><dt>挂载位置</dt><dd>{detached ? "画布顶层" : "右侧嵌入"}</dd></div><div><dt>播放时钟</dt><dd>与时间线同步</dd></div><div><dt>代理媒体</dt><dd>{preview?.proxy || selected?.payload?.proxyMediaId ? "已启用" : "原始媒体"}</dd></div></dl> : null}
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
    <div className="canvas-player-stage">{mediaUrl ? <video key={mediaUrl} onDurationChange={(event) => setDuration(event.currentTarget.duration || 0)} onLoadedMetadata={(event) => setResolution(`${event.currentTarget.videoWidth}×${event.currentTarget.videoHeight}`)} onPause={() => setPlaying(false)} onPlay={() => setPlaying(true)} onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)} playsInline preload="metadata" ref={videoRef} src={mediaUrl} /> : <div><Search size={28} /><strong>选择一个视频节点</strong><small>已生成视频会在这里与底部时间线同步查看。</small></div>}</div>
    <footer>
      <span>{timecode(currentTime, frameRate)} <em>/ {timecode(duration, frameRate)}</em></span>
      <button disabled={!mediaUrl} onClick={() => { videoRef.current?.pause(); if (videoRef.current) videoRef.current.currentTime = clamp(videoRef.current.currentTime - 1 / frameRate, 0, videoRef.current.duration || 0); }} title="后退一帧" type="button"><ChevronLeft size={16} /></button>
      <button disabled={!mediaUrl} onClick={() => void togglePlayback()} title={playing ? "暂停" : "播放"} type="button">{playing ? <Pause size={18} /> : <Play size={18} />}</button>
      <button disabled={!mediaUrl} onClick={() => { videoRef.current?.pause(); if (videoRef.current) videoRef.current.currentTime = clamp(videoRef.current.currentTime + 1 / frameRate, 0, videoRef.current.duration || 0); }} title="前进一帧" type="button"><ChevronRight size={16} /></button>
      <div><Search size={16} /><span>{resolution}</span><button disabled={!mediaUrl} onClick={() => videoRef.current?.requestFullscreen()} title="全屏播放" type="button"><Maximize2 size={16} /></button></div>
    </footer>
    {!detached ? inspector : null}
    {detached ? <button aria-label="调整播放器大小" className="player-resize-handle" onPointerDown={(event) => beginPointer(event, "resize")} type="button" /> : null}
  </section>{detached ? <aside className="canvas-player-inspector-dock">{inspector}</aside> : null}</>;
});
