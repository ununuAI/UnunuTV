"use client";

import { ExternalLink, GripHorizontal, Music2, Pause, Play, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { audioMediaSource, formatAudioTime } from "./audio-node-policy.js";
import { useAudioWaveform } from "./use-audio-waveform.js";
import { TIMELINE_MEDIA_TRANSFER_TYPE, timelineMediaTransfer } from "./timeline-drag-policy.js";

export function MomoAudioNode({ actions, node, readOnly = false, selected = false }) {
  const source = audioMediaSource(node);
  const audioRef = useRef(null);
  const fileRef = useRef(null);
  const [duration, setDuration] = useState(Number(node.payload?.audioDuration || 0));
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const peaks = useAudioWaveform(source?.url);

  useEffect(() => { setCurrentTime(0); setPlaying(false); }, [source?.mediaId]);

  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) await audio.play(); else audio.pause();
  };

  return <div className="momo-audio-node">
    <input accept="audio/*" aria-label="选择音频文件" className="momo-audio-file-input" disabled={readOnly} onChange={(event) => { const file = event.target.files?.[0]; if (file) void actions.importNodeFile(node, file, "audio"); event.target.value = ""; }} ref={fileRef} type="file" />
    {selected ? <div aria-label="音频节点工具栏" className="momo-audio-toolbar nodrag nopan nowheel">
      <button disabled={readOnly} onClick={() => fileRef.current?.click()} type="button"><Upload size={14} /><span>上传音频</span></button>
      {source ? <button
        aria-label="拖入底部时间线"
        draggable={!readOnly}
        onDragStart={(event) => {
          const transfer = timelineMediaTransfer(node, source.mediaId, { kind: "audio", durationMs: duration * 1000 });
          if (!transfer || !event.dataTransfer) return;
          event.dataTransfer.setData(TIMELINE_MEDIA_TRANSFER_TYPE, JSON.stringify(transfer));
          event.dataTransfer.setData("text/plain", JSON.stringify(transfer));
          event.dataTransfer.effectAllowed = "copy";
        }}
        title="拖到下方 A1 音频轨"
        type="button"
      ><GripHorizontal size={14} /><span>拖入时间线</span></button> : null}
      {source ? <button aria-label="打开音频文件" onClick={() => actions.openMedia(source.url)} title="打开文件" type="button"><ExternalLink size={14} /></button> : null}
    </div> : null}
    <div className="momo-audio-content">
      {source ? <div className="momo-audio-player">
        <audio onDurationChange={(event) => setDuration(event.currentTarget.duration || 0)} onEnded={() => { setPlaying(false); setCurrentTime(0); }} onPause={() => setPlaying(false)} onPlay={() => setPlaying(true)} onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)} preload="metadata" ref={audioRef} src={source.url} />
        <div className="momo-audio-waveform" style={{ "--audio-progress": `${duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0}%` }}>
          {(peaks.length ? peaks : Array.from({ length: 48 }, () => .08)).map((peak, index) => <i aria-hidden="true" key={index} style={{ height: `${Math.max(5, peak * 52)}px` }} />)}
        </div>
        <div className="momo-audio-controls"><span>{formatAudioTime(currentTime)} / {formatAudioTime(duration)}</span><button aria-label={playing ? "暂停音频" : "播放音频"} onClick={() => void toggle()} type="button">{playing ? <Pause size={16} /> : <Play size={16} />}</button></div>
      </div> : <div aria-label="暂无音频，可拖动节点或使用上方按钮上传" className="momo-audio-empty"><Music2 size={30} strokeWidth={1.25} /><span>暂无音频</span></div>}
    </div>
  </div>;
}
