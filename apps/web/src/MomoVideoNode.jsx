"use client";

import { useEffect, useRef, useState } from "react";
import { Video } from "lucide-react";
import { NodePromptCard } from "./NodePromptCard.jsx";
import { keepVideoPausedOutsideControls, primeVideoPreviewFrame, resetVideoAfterPlayback } from "./canvas-node-policies.js";
import { mediaReviewStateForNode } from "./media-candidate-policy.js";
import { mediaEmptyState } from "./media-empty-state-policy.js";

const playbackSourceCache = new Map();
const PLAYBACK_FETCH_TIMEOUT_MS = 8000;

function playbackFetchUrl(mediaUrl, attempt) {
  const separator = mediaUrl.includes("?") ? "&" : "?";
  return `${mediaUrl}${separator}playback_blob=1&attempt=${attempt}`;
}

async function fetchPlaybackBlob(mediaUrl) {
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), PLAYBACK_FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(playbackFetchUrl(mediaUrl, attempt), {
        cache: "no-store",
        signal: controller.signal
      });
      if (response.status !== 200) throw new Error(`视频加载失败（HTTP ${response.status}）`);
      const blob = await response.blob();
      if (!blob.size) throw new Error("视频加载失败（文件为空）");
      return blob;
    } catch (error) {
      lastError = error;
    } finally {
      window.clearTimeout(timer);
    }
  }
  throw lastError || new Error("视频加载失败");
}

function cachedPlaybackSource(mediaUrl) {
  if (!mediaUrl) return Promise.resolve("");
  const cached = playbackSourceCache.get(mediaUrl);
  if (cached) return cached;
  const pending = fetchPlaybackBlob(mediaUrl).then((blob) => URL.createObjectURL(blob)).catch((error) => {
    playbackSourceCache.delete(mediaUrl);
    throw error;
  });
  playbackSourceCache.set(mediaUrl, pending);
  return pending;
}

export function MomoVideoNode({ actions, connectedNodes, displayedMediaId, mediaUrl, node, onPlaybackPositionChange, readOnly, selected }) {
  const videoRef = useRef(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [loadError, setLoadError] = useState("");
  const [retryTick, setRetryTick] = useState(0);
  const reviewState = mediaReviewStateForNode(node, displayedMediaId);
  const emptyState = mediaEmptyState(node, "video");
  useEffect(() => {
    let active = true;
    setSourceUrl("");
    setLoadError("");
    cachedPlaybackSource(mediaUrl).then((url) => {
      if (active) setSourceUrl(url);
    }).catch((error) => {
      if (active) setLoadError(error instanceof Error ? error.message : "视频加载失败");
    });
    return () => { active = false; };
  }, [mediaUrl, retryTick]);
  const reportPlayback = (video) => onPlaybackPositionChange?.({
    duration: Number.isFinite(video.duration) ? video.duration : null,
    seconds: Number.isFinite(video.currentTime) ? video.currentTime : 0
  });
  return <div className={`momo-video-node${selected ? " is-selected" : ""}`}>
    <div className="momo-video-stage">
      {sourceUrl ? <video controls key={displayedMediaId} onClick={keepVideoPausedOutsideControls} onDoubleClick={keepVideoPausedOutsideControls} onEnded={(event) => { resetVideoAfterPlayback(event); reportPlayback(event.currentTarget); }} onSeeked={(event) => reportPlayback(event.currentTarget)} onTimeUpdate={(event) => reportPlayback(event.currentTarget)} onLoadedMetadata={(event) => {
        primeVideoPreviewFrame(event);
        const video = event.currentTarget;
        reportPlayback(video);
        void actions.fitMediaNode(node, video.videoWidth, video.videoHeight);
      }} playsInline preload="auto" ref={videoRef} src={sourceUrl} /> : mediaUrl ? <div className="momo-video-empty"><Video size={38} strokeWidth={1.2} /><strong>{loadError || "正在载入视频"}</strong><small>{loadError ? "已停止无限等待，可立即重试。" : "从本地媒体库读取当前版本…"}</small>{loadError ? <button className="nodrag nopan" onClick={() => setRetryTick((value) => value + 1)} type="button">重新载入</button> : null}</div> : <div className="momo-video-empty"><Video size={38} strokeWidth={1.2} /><strong>{emptyState.label}</strong><small>{emptyState.detail}</small></div>}
      {reviewState ? <div className={`momo-video-review-state ${reviewState.state}`} title={reviewState.detail}><strong>{reviewState.label}</strong><small>{reviewState.detail}</small></div> : null}
    </div>
    {selected ? <div className="momo-video-prompt nodrag nopan"><NodePromptCard actions={actions} connectedNodes={connectedNodes} node={node} readOnly={readOnly} /></div> : null}
  </div>;
}
