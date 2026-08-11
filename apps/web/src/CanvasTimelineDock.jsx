"use client";

import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Clapperboard, Diamond, Download, Eye, EyeOff, GitMerge, LoaderCircle, Lock, Magnet, Pause, Play, Plus, Redo2, Scissors, Sparkles, Square, Trash2, Undo2, Unlock, Volume1, Volume2, VolumeX, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { TIMELINE_MEDIA_TRANSFER_TYPE, parseTimelineMediaTransfer, timelineDropStartMs } from "./timeline-drag-policy.js";
import { eventPrefix, useDebouncedRefresh, useProjectEvents } from "./use-project-events.js";

const MIN_HEIGHT = 190;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function trackCode(track, tracks) {
  const prefix = ({ video: "V", audio: "A", subtitle: "S", text: "T", effect: "FX" })[track.kind] || "T";
  return `${prefix}${tracks.filter((entry) => entry.kind === track.kind && entry.order <= track.order).length}`;
}

export function CanvasTimelineDock({ canvas, initialHeight = 280, notify, onClose, onHeightChange, onPlaybackChange, onPreviewMedia, onSeek, projectId, readOnly, refreshCanvas, selected }) {
  const [height, setHeight] = useState(initialHeight);
  const [timeline, setTimeline] = useState(null);
  const [scale, setScale] = useState(1);
  const [selectedClipId, setSelectedClipId] = useState(null);
  const [dragPreview, setDragPreview] = useState(null);
  const [dropTrack, setDropTrack] = useState(null);
  const [renderJobs, setRenderJobs] = useState([]);
  const [qcReport, setQcReport] = useState(null);
  const [deliveryPackages, setDeliveryPackages] = useState([]);
  const [preparations, setPreparations] = useState({});
  const [playheadMs, setPlayheadMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const dragRef = useRef(null);
  const timelineId = timeline?.id;

  const load = useCallback(async () => {
    const result = await api.timelines(projectId);
    const first = result.timelines[0];
    if (!first) { setTimeline(null); setRenderJobs([]); setQcReport(null); setDeliveryPackages([]); setPreparations({}); return; }
    const full = await api.timeline(projectId, first.id);
    setTimeline(full);
    const mediaIds = [...new Set((full.clips || []).map((clip) => clip.mediaId).filter(Boolean))];
    const preparationResults = await Promise.allSettled(mediaIds.map((mediaId) => api.mediaPreparation(projectId, mediaId)));
    setPreparations(Object.fromEntries(preparationResults.flatMap((result, index) => result.status === "fulfilled" ? [[mediaIds[index], result.value]] : [])));
    const jobs = (await api.renderJobs(projectId, first.id)).jobs || [];
    setRenderJobs(jobs);
    if (jobs[0]?.status === "succeeded") {
      try {
        setQcReport(await api.renderJobQc(projectId, jobs[0].id));
        setDeliveryPackages((await api.deliveryPackages(projectId, jobs[0].id)).packages || []);
      }
      catch { setQcReport(null); }
    } else { setQcReport(null); setDeliveryPackages([]); }
  }, [projectId]);

  useEffect(() => { load().catch(notify); }, [load, notify]);
  // 渲染进度与时间线变更走 SSE 推送,不再每 900ms 轮询。
  // render.job_changed 带 {status, progress},timeline.* 覆盖剪辑改动。
  const refreshTimeline = useDebouncedRefresh(() => load().catch(notify), 120);
  useProjectEvents(projectId, refreshTimeline, eventPrefix("render.", "timeline.", "media."));
  useEffect(() => { onHeightChange(height); }, [height, onHeightChange]);
  useEffect(() => {
    if (!playing) return undefined;
    let frame;
    let previous = performance.now();
    const tick = (time) => {
      const delta = time - previous;
      previous = time;
      setPlayheadMs((current) => {
        const next = current + delta;
        const limit = Math.max(1, Math.max(15000, ...(timeline?.clips || []).map((clip) => clip.startMs + clip.durationMs)));
        if (next >= limit) { setPlaying(false); onPlaybackChange?.(false); onSeek(limit); return limit; }
        onSeek(next);
        return next;
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [onPlaybackChange, onSeek, playing, timeline]);

  function seek(timeMs) {
    const next = Math.max(0, Number(timeMs) || 0);
    setPlayheadMs(next);
    onSeek(next);
  }

  async function create() {
    try { await api.createTimeline(projectId, "主时间线"); await load(); }
    catch (error) { notify(error); }
  }

  async function add() {
    const text = selected?.payload?.textDocument?.plainText || selected?.payload?.plainText || selected?.payload?.text || selected?.payload?.summary || "";
    const isSubtitle = ["text", "script", "story"].includes(selected?.kind) && Boolean(String(text).trim());
    if (!selected || !timelineId || (!selected.payload?.currentMediaId && !isSubtitle)) return;
    try {
      const kind = isSubtitle ? "subtitle" : selected.kind === "audio" ? "audio" : "video";
      const track = timeline.tracks.find((entry) => entry.kind === kind && !entry.locked)?.order;
      if (track === undefined) throw new Error(`没有可写入的${kind === "audio" ? "音频" : kind === "subtitle" ? "字幕" : "视频"}轨`);
      const end = Math.max(0, ...(timeline?.clips || []).filter((clip) => clip.track === track).map((clip) => clip.startMs + clip.durationMs));
      await api.addClip(projectId, timelineId, { nodeId: selected.id, mediaId: selected.payload.currentMediaId || null, track, startMs: end, durationMs: 3000, payload: isSubtitle ? { text: String(text).trim() } : {} });
      await load();
      notify("所选媒体已加入主轨", false);
    } catch (error) { notify(error); }
  }

  function readDrop(event) {
    return parseTimelineMediaTransfer(event.dataTransfer?.getData(TIMELINE_MEDIA_TRANSFER_TYPE)
      || event.dataTransfer?.getData("text/plain") || "");
  }

  function canDrop(event, track) {
    const transfer = readDrop(event);
    return Boolean(transfer && !track.locked && ((track.kind === "audio" && transfer.kind === "audio") || (track.kind === "video" && ["video", "image"].includes(transfer.kind))));
  }

  async function dropMedia(event, track) {
    event.preventDefault();
    event.stopPropagation();
    setDropTrack(null);
    if (readOnly) return;
    const transfer = readDrop(event);
    if (!transfer || track.locked || !((track.kind === "audio" && transfer.kind === "audio") || (track.kind === "video" && ["video", "image"].includes(transfer.kind)))) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    try {
      let targetTimelineId = timelineId;
      let targetTimeline = timeline;
      if (!targetTimelineId) {
        targetTimeline = await api.createTimeline(projectId, "主时间线");
        targetTimelineId = targetTimeline.id;
      }
      const targetDuration = Math.max(15000, ...(targetTimeline?.clips || []).map((clip) => clip.startMs + clip.durationMs));
      const startMs = timelineDropStartMs(event.clientX, bounds, targetDuration);
      await api.addClip(projectId, targetTimelineId, {
        nodeId: transfer.nodeId,
        mediaId: transfer.mediaId,
        track: track.order,
        startMs,
        durationMs: transfer.durationMs,
        payload: { source: "canvas_drag", title: transfer.title, mediaKind: transfer.kind, ...(track.kind === "audio" ? { volume: 1 } : {}) }
      });
      await load();
      notify(`${transfer.title} 已放入 ${track.name}`, false);
    } catch (error) { notify(error); }
  }

  function dropHandlers(track) {
    return {
      onDragEnter: (event) => { if (!readOnly && canDrop(event, track)) { event.preventDefault(); setDropTrack(track.order); } },
      onDragLeave: (event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDropTrack((current) => current === track.order ? null : current); },
      onDragOver: (event) => { if (!readOnly && canDrop(event, track)) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; setDropTrack(track.order); } },
      onDrop: (event) => void dropMedia(event, track)
    };
  }

  async function renderPreset(preset, label) {
    if (!timelineId) return;
    try {
      const allowedKinds = preset === "wav_mix" ? ["audio", "compose"] : ["compose", "video", "videoShot", "video-clip"];
      let outputNode = allowedKinds.includes(selected?.kind) ? selected : canvas?.nodes?.find((node) => allowedKinds.includes(node.kind) && node.payload?.auditOnly !== true);
      if (!outputNode) {
        outputNode = await api.createNode(projectId, canvas.id, {
          kind: preset === "wav_mix" ? "audio" : "compose",
          title: preset === "wav_mix" ? "混音母版" : "渲染母版",
          x: Math.max(120, ...(canvas.nodes || []).map((node) => node.x + node.width + 80)),
          y: 120,
          payload: { generationPhase: "candidate_render", generationStatus: "ready", timelineId }
        });
        await refreshCanvas?.();
      }
      await api.createRenderJob(projectId, timelineId, { outputNodeId: outputNode.id, preset, idempotencyKey: `${timelineId}:${preset}:${Date.now()}` });
      await load();
      notify(`${label}已进入画布节点后台渲染`, false);
    }
    catch (error) { notify(error); }
  }

  async function packageDelivery() {
    if (!latestRender) return;
    try {
      await api.createDeliveryPackage(projectId, latestRender.id, { acceptWarnings: qcReport?.status === "warning" });
      await load();
      notify("渲染版本、校验结果与字幕附件已锁定为交付清单", false);
    } catch (error) { notify(error); }
  }

  async function edit(action, message) {
    if (!timelineId) return;
    try { await action(); await load(); notify(message, false); }
    catch (error) { notify(error); }
  }

  async function addTrack(kind = "video") {
    await edit(() => api.addTimelineTrack(projectId, timelineId, { kind, name: kind === "audio" ? "新增音频轨" : kind === "subtitle" ? "新增字幕轨" : kind === "effect" ? "效果轨" : "新增视频轨" }), "轨道已创建并持久化");
  }

  async function patchTrack(track, patch, message) {
    await edit(() => api.updateTimelineTrack(projectId, timelineId, track.id, patch), message);
  }

  async function moveTrack(track, delta) {
    const ordered = [...timeline.tracks].sort((left, right) => left.order - right.order);
    const index = ordered.findIndex((entry) => entry.id === track.id);
    const target = clamp(index + delta, 0, ordered.length - 1);
    if (target === index) return;
    const [moved] = ordered.splice(index, 1);
    ordered.splice(target, 0, moved);
    await edit(() => api.reorderTimelineTracks(projectId, timelineId, ordered.map((entry) => entry.id)), "轨道与片段映射已原子重排");
  }

  async function addMarker() {
    await edit(() => api.addTimelineMarker(projectId, timelineId, { timeMs: Math.round(playheadMs), title: `标记 ${(playheadMs / 1000).toFixed(2)}s` }), "时间线标记已加入");
  }

  async function prepareSelectedMedia() {
    if (!selectedClip?.mediaId) return;
    await edit(() => api.prepareMedia(projectId, selectedClip.mediaId), "代理、缩略图、探针与波形已准备");
  }

  async function addEffect() {
    if (!selectedClip) return;
    await edit(() => api.addTimelineEffect(projectId, timelineId, selectedClip.id, { kind: "transform", parameters: { opacity: 1, scale: 1 } }), "片段效果已加入");
  }

  async function addKeyframe() {
    if (!selectedClip) return;
    const localTime = clamp(Math.round(playheadMs - selectedClip.startMs), 0, selectedClip.durationMs);
    await edit(() => api.addTimelineKeyframe(projectId, timelineId, selectedClip.id, { propertyPath: "transform.scale", timeMs: localTime, value: 1, easing: "ease_in_out" }), "关键帧已加入");
  }

  async function addTransition() {
    if (!selectedClip) return;
    const siblings = clips.filter((clip) => clip.track === selectedClip.track && clip.id !== selectedClip.id).sort((left, right) => left.startMs - right.startMs);
    const next = siblings.find((clip) => clip.startMs >= selectedClip.startMs) || siblings.at(-1);
    if (!next) { notify(new Error("同一轨道至少需要两个片段才能添加转场")); return; }
    const [fromClip, toClip] = selectedClip.startMs <= next.startMs ? [selectedClip, next] : [next, selectedClip];
    await edit(() => api.addTimelineTransition(projectId, timelineId, { fromClipId: fromClip.id, toClipId: toClip.id, kind: "crossfade", durationMs: Math.min(250, fromClip.durationMs, toClip.durationMs) }), "交叉叠化已加入");
  }

  function beginClipDrag(event, clip, totalDurationMs) {
    event.preventDefault();
    event.stopPropagation();
    setSelectedClipId(clip.id);
    seek(clip.startMs);
    if (readOnly) return;
    const lane = event.currentTarget.parentElement;
    const bounds = lane.getBoundingClientRect();
    const originX = event.clientX;
    let nextStartMs = clip.startMs;
    const move = (nextEvent) => {
      const deltaMs = (nextEvent.clientX - originX) / Math.max(1, bounds.width) * totalDurationMs;
      nextStartMs = Math.max(0, Math.round((clip.startMs + deltaMs) / 100) * 100);
      setDragPreview({ clipId: clip.id, startMs: nextStartMs });
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      setDragPreview(null);
      if (nextStartMs !== clip.startMs) void edit(() => api.moveTimelineClip(projectId, timelineId, clip.id, { startMs: nextStartMs, track: clip.track }), "片段位置已更新");
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end, { once: true });
  }

  function beginResize(event) {
    event.preventDefault();
    dragRef.current = { startY: event.clientY, startHeight: height };
    const move = (nextEvent) => setHeight(clamp(dragRef.current.startHeight + dragRef.current.startY - nextEvent.clientY, MIN_HEIGHT, window.innerHeight * .62));
    const end = () => { dragRef.current = null; window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", end); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end, { once: true });
  }

  const clips = timeline?.clips || [];
  const orderedTracks = [...(timeline?.tracks || [])].sort((left, right) => left.order - right.order);
  const videoTrackOrders = new Set(orderedTracks.filter((track) => track.kind === "video").map((track) => track.order));
  const audioTrackOrders = new Set(orderedTracks.filter((track) => track.kind === "audio").map((track) => track.order));
  const videoClips = clips.filter((clip) => videoTrackOrders.has(clip.track));
  const audioClips = clips.filter((clip) => audioTrackOrders.has(clip.track));
  const selectedText = selected?.payload?.textDocument?.plainText || selected?.payload?.plainText || selected?.payload?.text || selected?.payload?.summary || "";
  const canAddSelected = Boolean(selected?.payload?.currentMediaId) || (["text", "script", "story"].includes(selected?.kind) && Boolean(String(selectedText).trim()));
  const selectedClip = clips.find((clip) => clip.id === selectedClipId);
  const selectedTrack = orderedTracks.find((track) => track.order === selectedClip?.track);
  const latestRender = renderJobs[0];
  const durationMs = Math.max(15000, ...clips.map((clip) => clip.startMs + clip.durationMs));
  const trackWidth = Math.max(100, scale * 100);

  return <section className="canvas-timeline-dock" style={{ height }} aria-label="底部专业时间线">
    <button aria-label="调整时间线高度" className="timeline-resize-handle" onPointerDown={beginResize} type="button"><span /></button>
    <header className="timeline-command-bar">
      <div><Clapperboard size={15} /><strong>{timeline?.title || "主时间线"}</strong><small>{clips.length} 个片段</small></div>
      <div className="timeline-command-actions">
        <button onClick={() => { if (playheadMs >= durationMs) seek(0); const next = !playing; setPlaying(next); onPlaybackChange?.(next); }} title={playing ? "暂停统一时间线时钟" : "播放统一时间线时钟"} type="button">{playing ? <Pause size={14} /> : <Play size={14} />}</button>
        <button onClick={() => seek(playheadMs - 1000 / (timeline?.frameRate || 30))} title="后退一帧" type="button"><ChevronLeft size={13} /></button>
        <span>{(playheadMs / 1000).toFixed(2)}s</span>
        <button onClick={() => seek(playheadMs + 1000 / (timeline?.frameRate || 30))} title="前进一帧" type="button"><ChevronRight size={13} /></button>
        <button disabled={readOnly || !timeline || !canAddSelected} onClick={() => void add()} type="button"><Plus size={14} />{["text", "script", "story"].includes(selected?.kind) ? "加入所选字幕" : "加入所选媒体"}</button>
        <details className="timeline-add-track-menu"><summary title="添加持久化轨道"><Plus size={13} />轨</summary><div><button disabled={readOnly} onClick={() => void addTrack("video")} type="button">视频轨</button><button disabled={readOnly} onClick={() => void addTrack("audio")} type="button">音频轨</button><button disabled={readOnly} onClick={() => void addTrack("subtitle")} type="button">字幕轨</button><button disabled={readOnly} onClick={() => void addTrack("effect")} type="button">效果轨</button></div></details>
        <i />
        <button disabled={readOnly || !selectedClip} onClick={() => void edit(() => api.moveTimelineClip(projectId, timelineId, selectedClip.id, { startMs: Math.max(0, selectedClip.startMs - 100), track: selectedClip.track }), "片段向前移动 100ms")} title="向前移动 100ms" type="button"><ChevronLeft size={14} /></button>
        <button disabled={readOnly || !selectedClip} onClick={() => void edit(() => api.moveTimelineClip(projectId, timelineId, selectedClip.id, { startMs: selectedClip.startMs + 100, track: selectedClip.track }), "片段向后移动 100ms")} title="向后移动 100ms" type="button"><ChevronRight size={14} /></button>
        <button disabled={readOnly || !selectedClip || selectedClip.durationMs < 2} onClick={() => void edit(() => api.splitTimelineClip(projectId, timelineId, selectedClip.id, { splitAtMs: selectedClip.startMs + Math.round(selectedClip.durationMs / 2) }), "片段已从中点分割")} title="从片段中点分割" type="button"><Scissors size={14} /></button>
        <button disabled={readOnly || !selectedClip} onClick={() => void edit(() => api.rippleTimelineClip(projectId, timelineId, selectedClip.id, { startMs: selectedClip.startMs + 100 }), "波纹移动已应用")} title="波纹移动 100ms" type="button"><GitMerge size={13} /></button>
        <button disabled={readOnly || !selectedClip} onClick={() => void edit(() => api.slipTimelineClip(projectId, timelineId, selectedClip.id, { trimInMs: selectedClip.trimInMs + 100, sourceDurationMs: selectedClip.payload?.sourceDurationMs }), "素材滑移已应用")} title="素材内滑移 100ms" type="button"><Scissors size={13} /></button>
        <button disabled={readOnly || !selectedClip} onClick={() => void edit(() => api.snapTimelineClip(projectId, timelineId, selectedClip.id, { startMs: selectedClip.startMs, playheadMs, thresholdMs: 160 }), "片段已吸附到最近剪辑点")} title="吸附到标记、片段边缘或播放头" type="button"><Magnet size={13} /></button>
        <button disabled={readOnly || !selectedClip} onClick={() => void addTransition()} title="为相邻片段添加交叉叠化" type="button"><GitMerge size={13} />转场</button>
        <button disabled={readOnly || !selectedClip} onClick={() => void addEffect()} title="添加可持久化片段效果" type="button"><Sparkles size={13} />效果</button>
        <button disabled={readOnly || !selectedClip} onClick={() => void addKeyframe()} title="在播放头添加缩放关键帧" type="button"><Diamond size={13} /></button>
        <button disabled={readOnly || !selectedClip?.mediaId} onClick={() => void prepareSelectedMedia()} title="本地准备代理、缩略图、探针和真实波形" type="button"><Sparkles size={13} />代理</button>
        <button disabled={readOnly || !timeline} onClick={() => void addMarker()} title="在播放头添加标记" type="button"><Plus size={13} />标记</button>
        {selectedTrack?.kind === "audio" ? <><button disabled={readOnly} onClick={() => void edit(() => api.updateTimelineClip(projectId, timelineId, selectedClip.id, { payload: { volume: 0 } }), "音频片段已静音")} title="片段静音" type="button"><VolumeX size={13} /></button><button disabled={readOnly} onClick={() => void edit(() => api.updateTimelineClip(projectId, timelineId, selectedClip.id, { payload: { volume: Math.max(0, Number(selectedClip.payload?.volume ?? 1) - .1) } }), "音量已降低")} title="降低片段音量" type="button"><Volume1 size={13} /></button><span>{Math.round(Number(selectedClip.payload?.volume ?? 1) * 100)}%</span><button disabled={readOnly} onClick={() => void edit(() => api.updateTimelineClip(projectId, timelineId, selectedClip.id, { payload: { volume: Math.min(4, Number(selectedClip.payload?.volume ?? 1) + .1) } }), "音量已提高")} title="提高片段音量" type="button"><Volume2 size={13} /></button></> : null}
        <button disabled={readOnly || !clips.length} onClick={() => void edit(() => api.undoTimelineEdit(projectId, timelineId), "已撤销时间线编辑")} title="撤销" type="button"><Undo2 size={14} /></button>
        <button disabled={readOnly || !clips.length} onClick={() => void edit(() => api.redoTimelineEdit(projectId, timelineId), "已重做时间线编辑")} title="重做" type="button"><Redo2 size={14} /></button>
        <button disabled={readOnly || !timeline} onClick={() => void edit(() => api.undoTimelineResourceEdit(projectId, timelineId), "已撤销轨道/效果资源编辑")} title="撤销轨道、转场、效果、标记或关键帧" type="button"><Undo2 size={12} />资源</button>
        <button disabled={readOnly || !timeline} onClick={() => void edit(() => api.redoTimelineResourceEdit(projectId, timelineId), "已重做轨道/效果资源编辑")} title="重做轨道、转场、效果、标记或关键帧" type="button"><Redo2 size={12} />资源</button>
        <i />
        <button disabled={readOnly || !videoClips.length || ["queued", "running"].includes(latestRender?.status)} onClick={() => void renderPreset("h264_review", "H.264 审看版")} title="后台导出 H.264 审看版" type="button">{latestRender?.status === "running" ? <LoaderCircle className="is-spinning" size={14} /> : <Download size={14} />}审看版</button>
        <button disabled={readOnly || !videoClips.length || ["queued", "running"].includes(latestRender?.status)} onClick={() => void renderPreset("h265_delivery", "H.265 交付版")} title="后台导出 H.265 交付版" type="button"><Download size={14} />交付版</button>
        <button disabled={readOnly || !videoClips.length || ["queued", "running"].includes(latestRender?.status)} onClick={() => void renderPreset("prores_master", "ProRes 母版")} title="后台导出 ProRes 422 HQ 母版" type="button"><Download size={14} />ProRes</button>
        <button disabled={readOnly || !videoClips.length || ["queued", "running"].includes(latestRender?.status)} onClick={() => void renderPreset("h264_vertical", "9:16 竖版交付")} title="导出 480×854、24fps、H.264、AAC 立体声竖版，并附交换与音频文件" type="button"><Download size={14} />9:16</button>
        <button disabled={readOnly || !videoClips.length || ["queued", "running"].includes(latestRender?.status)} onClick={() => void renderPreset("h264_square", "1:1 方版交付")} title="导出 1080×1080 方版，并附交换与音频文件" type="button"><Download size={14} />1:1</button>
        <button disabled={readOnly || !audioClips.length || ["queued", "running"].includes(latestRender?.status)} onClick={() => void renderPreset("wav_mix", "48kHz/24-bit WAV 混音")} title="导出 48kHz/24-bit WAV 与逐轨 stems" type="button"><Download size={14} />WAV</button>
        {["queued", "running"].includes(latestRender?.status) ? <button disabled={readOnly} onClick={() => void edit(() => api.cancelRenderJob(projectId, latestRender.id), "已取消后台渲染")} title="取消渲染" type="button"><Square size={12} /></button> : null}
        {latestRender ? <span className={`timeline-render-state is-${latestRender.status}`}>{latestRender.status === "running" ? `${Math.round(latestRender.progress * 100)}%` : latestRender.status}</span> : null}
        {qcReport ? <details className={`timeline-qc-summary is-${qcReport.status}`}><summary>QC {qcReport.status === "pass" ? "通过" : qcReport.status === "warning" ? "警告" : "失败"}</summary><div>{qcReport.checks.map((check) => <span className={`is-${check.status}`} key={check.id}><strong>{check.label}</strong><small>{String(check.actual)}</small></span>)}</div></details> : null}
        {latestRender?.status === "succeeded" && qcReport?.status !== "fail" && !deliveryPackages.length ? <button disabled={readOnly} onClick={() => void packageDelivery()} title="创建含校验和、QC 与字幕附件的交付清单" type="button"><Clapperboard size={14} />锁定交付清单</button> : null}
        {deliveryPackages[0] ? <details className="timeline-delivery-files"><summary>{deliveryPackages[0].status} · {deliveryPackages[0].deliverables.length} 文件</summary><div>{deliveryPackages[0].deliverables.map((item) => <a href={`/api/projects/${projectId}/delivery-packages/${deliveryPackages[0].id}/files/${encodeURIComponent(item.role)}`} key={item.role}>{item.role}</a>)}</div></details> : null}
        {latestRender?.status === "succeeded" && latestRender.outputMediaId ? <button onClick={() => onPreviewMedia({ projectId, mediaId: latestRender.outputMediaId, title: `${timeline?.title || "主时间线"} · ${latestRender.preset}`, frameRate: timeline?.frameRate || 30 })} title="在共享播放器查看候选母版" type="button"><Eye size={14} />查看母版</button> : null}
        <i />
        <button onClick={() => setScale((value) => clamp(value - .2, .6, 3))} title="缩小时间线" type="button"><ZoomOut size={14} /></button>
        <span>{Math.round(scale * 100)}%</span>
        <button onClick={() => setScale((value) => clamp(value + .2, .6, 3))} title="放大时间线" type="button"><ZoomIn size={14} /></button>
        <button onClick={onClose} title="收起时间线" type="button"><ChevronDown size={15} /></button>
      </div>
    </header>
    {!timeline ? <div className="timeline-create-state"><p>{readOnly ? "当前没有可查看的时间线。" : "建立主时间线后，可从故事板或任意已生成媒体节点直接入轨。"}</p>{!readOnly ? <button onClick={() => void create()} type="button">创建主时间线</button> : null}</div> : <div className="timeline-scroll nowheel">
      <div className="timeline-ruler-row"><span>时间码</span><div style={{ width: `${trackWidth}%` }}>{[0, .25, .5, .75, 1].map((ratio) => <button key={ratio} onClick={() => seek(durationMs * ratio)} style={{ left: `${ratio * 100}%` }} type="button">{Math.round(durationMs * ratio / 1000)}s</button>)}{(timeline.markers || []).map((marker) => <button className="timeline-marker" key={marker.id} onClick={() => seek(marker.timeMs)} style={{ left: `${marker.timeMs / durationMs * 100}%` }} title={marker.title} type="button"><Diamond size={9} /></button>)}<span className="timeline-playhead" style={{ left: `${playheadMs / durationMs * 100}%` }} /></div></div>
      {orderedTracks.map((track) => { const trackClips = clips.filter((clip) => clip.track === track.order); const tone = track.kind === "audio" ? " is-audio" : ["subtitle", "text"].includes(track.kind) ? " is-subtitle" : track.kind === "effect" ? " is-effect" : ""; return <div className={`timeline-track-row${tone}`} key={track.id}><aside><div className="timeline-track-title"><strong>{trackCode(track, orderedTracks)}</strong><small>{track.name}</small></div><div className="timeline-track-controls"><button aria-pressed={track.locked} disabled={readOnly} onClick={() => void patchTrack(track, { locked: !track.locked }, track.locked ? "轨道已解锁" : "轨道已锁定")} title={track.locked ? "解锁轨道" : "锁定轨道"} type="button">{track.locked ? <Lock size={10} /> : <Unlock size={10} />}</button><button aria-pressed={!track.visible} disabled={readOnly} onClick={() => void patchTrack(track, { visible: !track.visible }, track.visible ? "轨道已隐藏" : "轨道已显示")} title="显示/隐藏" type="button">{track.visible ? <Eye size={10} /> : <EyeOff size={10} />}</button><button aria-pressed={track.muted} disabled={readOnly} onClick={() => void patchTrack(track, { muted: !track.muted }, track.muted ? "轨道已取消静音" : "轨道已静音")} title="静音" type="button"><VolumeX size={10} /></button><button aria-pressed={track.solo} disabled={readOnly} onClick={() => void patchTrack(track, { solo: !track.solo }, track.solo ? "轨道已取消独听" : "轨道已独听")} title="独听" type="button">S</button><button disabled={readOnly || track.order === 0} onClick={() => void moveTrack(track, -1)} title="轨道上移" type="button"><ChevronUp size={10} /></button><button disabled={readOnly || track.order === orderedTracks.length - 1} onClick={() => void moveTrack(track, 1)} title="轨道下移" type="button"><ChevronDown size={10} /></button><button disabled={readOnly || trackClips.length > 0} onClick={() => void edit(() => api.removeTimelineTrack(projectId, timelineId, track.id), "空轨道已删除")} title="删除空轨道" type="button"><Trash2 size={10} /></button></div></aside><div className={`timeline-track-lane${dropTrack === track.order ? " is-drop-target" : ""}`} {...dropHandlers(track)} style={{ width: `${trackWidth}%` }}><span className="timeline-playhead" style={{ left: `${playheadMs / durationMs * 100}%` }} />{trackClips.map((clip) => { const startMs = dragPreview?.clipId === clip.id ? dragPreview.startMs : clip.startMs; const clipEffects = (timeline.effects || []).filter((entry) => entry.clipId === clip.id).length; const clipKeyframes = (timeline.keyframes || []).filter((entry) => entry.clipId === clip.id).length; const preparation = preparations[clip.mediaId]; const waveform = preparation?.waveform?.length ? preparation.waveform : Array.from({ length: 24 }, (_, index) => (28 + (index * 37 % 66)) / 100); return <button aria-pressed={selectedClipId === clip.id} className={`timeline-dock-clip${tone}${selectedClipId === clip.id ? " is-selected" : ""}`} key={clip.id} onDoubleClick={() => clip.mediaId && onPreviewMedia({ projectId, mediaId: clip.mediaId, proxy: Boolean(preparation?.proxyRelativePath), title: clip.payload?.title || clip.nodeId || "时间线媒体", frameRate: timeline.frameRate })} onPointerDown={(event) => beginClipDrag(event, clip, durationMs)} style={{ left: `${startMs / durationMs * 100}%`, width: `${Math.max(4, clip.durationMs / durationMs * 100)}%` }} type="button">{preparation?.thumbnailRelativePath && track.kind === "video" ? <img alt="" className="timeline-clip-thumbnail" src={`/api/projects/${projectId}/media/${clip.mediaId}/thumbnail`} /> : null}{track.kind === "audio" ? <span className="timeline-waveform" aria-hidden="true">{waveform.slice(0, 96).map((peak, index) => <i key={index} style={{ height: `${Math.max(5, peak * 100)}%` }} />)}</span> : null}<strong>{clip.payload?.text || clip.payload?.storyboardShotId?.slice(0, 12) || clip.nodeId?.slice(0, 10) || "media"}</strong><small>{(clip.durationMs / 1000).toFixed(1)}s · {(startMs / 1000).toFixed(1)}s{preparation?.status === "succeeded" ? " · 代理✓" : ""}{clipEffects ? ` · FX${clipEffects}` : ""}{clipKeyframes ? ` · ◆${clipKeyframes}` : ""}</small></button>; })}</div></div>; })}
    </div>}
  </section>;
}
