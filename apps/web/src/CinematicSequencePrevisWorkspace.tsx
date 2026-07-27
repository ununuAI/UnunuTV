"use client";
import { useEffect, useMemo, useState } from "react";
import { Check, Pause, Play, ScanEye, ShieldCheck } from "lucide-react";
import { CinematicContractForm } from "./CinematicContractForm";
import type { CinematicAssetAuthority, CinematicShotSpec, StoryboardDocumentV2, StoryProductionPacket } from "./cinematic-production-types";
import type { SequencePrevisDocument, VisualContextBundle } from "./cinematic-sequence-workspace-types";

interface Props {
  assetAuthorities: CinematicAssetAuthority[];
  projectId: string;
  sequencePrevis: SequencePrevisDocument[];
  shots: CinematicShotSpec[];
  storyboards: StoryboardDocumentV2[];
  storyPacket: StoryProductionPacket | null;
  visualContextBundles: VisualContextBundle[];
  actions: {
    saveSequencePrevis(value: SequencePrevisDocument, previsId?: string): Promise<void>;
    compileVisualContext(previsId: string, shotId: string): Promise<void>;
    reviewSequencePrevis(previsId: string, revision: number, state: "accepted" | "rejected"): Promise<void>;
  };
}

function frameForShot(shotId: string, storyboards: StoryboardDocumentV2[]) {
  return storyboards.flatMap((board) => board.shots).find((entry) => entry.shotId === shotId && entry.imageMediaId && entry.videoReference?.selected === true && entry.videoReference?.acceptanceProof?.pixelReviewed === true)?.imageMediaId ?? "";
}

function starter(props: Props): SequencePrevisDocument {
  let cursor = 0;
  const ordered = [...props.shots].sort((left, right) => left.order - right.order);
  const shots = ordered.map((shot) => {
    const startSeconds = cursor, endSeconds = cursor + (Number(shot.durationSeconds) || 4); cursor = endSeconds;
    return {
      previsShotId: `previs-shot-${shot.shotId}`, shotId: shot.shotId, shotRevision: shot.revision, order: shot.order,
      startSeconds, endSeconds, narrativeJob: shot.narrativeJob || shot.storyBeat || "承接叙事",
      entryPhase: shot.openingState || "承接上一镜出口状态", exitPhase: shot.endingState || "形成下一镜入口状态",
      frameMediaId: frameForShot(shot.shotId, props.storyboards) || String(shot.directorStageBinding?.mediaId ?? ""), frameSourceRole: "semantic_scene_identity_reference",
      cameraState: { movement: shot.cinematography?.movementPath || "固定机位", framing: shot.cinematography?.shotSize || "按镜头合同" },
      performanceState: { description: shot.performance?.microExpressionOrder || shot.performance?.objective || "按表演时序合同推进" },
      spatialState: { description: shot.blocking?.positions || shot.openingState || "按空间调度合同锁定" },
      audioCue: { description: shot.sound?.bridge || shot.sound?.ambience || "保持环境声连续" }
    };
  });
  return {
    title: "连续视觉预演", status: "candidate", storyPacketId: String(props.storyPacket?.storyPacketId ?? ""), storyPacketRevision: Number(props.storyPacket?.revision ?? 1),
    durationSeconds: cursor, frameRate: 24, shots,
    cutDecisions: shots.slice(0, -1).map((shot, index) => ({
      cutDecisionId: `cut-${shot.shotId}-${shots[index + 1].shotId}`, fromShotId: shot.shotId, toShotId: shots[index + 1].shotId,
      atSeconds: shot.endSeconds, transitionType: "cut", motivation: "叙事信息或动作相位发生转折才切镜",
      outgoingPhase: shot.exitPhase, incomingPhase: shots[index + 1].entryPhase, axisRule: "保持既定轴线与屏幕方向",
      gazeRelation: "承接上一镜视线目标", motionVector: "动作方向和速度连续", audioBridge: "环境声跨切点连续", overlapSeconds: 0
    })),
    acceptedAuthorityIds: props.assetAuthorities.filter((entry) => entry.status === "accepted").map((entry) => entry.authorityId),
    storyboardIds: props.storyboards.map((entry) => entry.storyboardId), directorCaptureIds: ordered.map((shot) => String(shot.directorStageBinding?.captureId ?? "")).filter(Boolean), rejectedExampleEvaluationIds: []
  };
}

export function CinematicSequencePrevisWorkspace(props: Props) {
  const current = props.sequencePrevis[0] ?? null;
  const [time, setTime] = useState(0), [playing, setPlaying] = useState(false), [selectedShotId, setSelectedShotId] = useState(current?.shots[0]?.shotId ?? "");
  useEffect(() => { if (!playing || !current) return; let frame = 0, previous = performance.now(); const tick = (now: number) => { const delta = (now - previous) / 1000; previous = now; setTime((value) => value + delta >= current.durationSeconds ? 0 : value + delta); frame = requestAnimationFrame(tick); }; frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame); }, [current, playing]);
  const activeShot = useMemo(() => current?.shots.find((shot) => time >= shot.startSeconds && time < shot.endSeconds) ?? current?.shots.at(-1) ?? null, [current, time]);
  useEffect(() => { if (activeShot) setSelectedShotId(activeShot.shotId); }, [activeShot]);
  const selectedBundle = props.visualContextBundles.find((entry) => entry.shotId === selectedShotId);
  const ownerReviewBlocked = current ? current.shots.some((shot) => !shot.frameMediaId || !props.visualContextBundles.some((entry) => entry.sequencePrevisId === current.sequencePrevisId && entry.sequencePrevisRevision === current.revision && entry.shotId === shot.shotId)) || current.cutDecisions.length !== Math.max(0, current.shots.length - 1) : true;
  const editable = current ?? starter(props);
  return <div className="cp-previs-stage">
    <section className="cp-previs-player"><header><div><strong>Sequence Previs · 连续视觉大脑</strong><small>{current ? `${current.title} · r${current.revision} · ${current.status}` : "尚未建立正式预演"}</small></div><span><ScanEye size={14} />先看完整连续画面，再决定切镜与生成</span></header>
      <div className="cp-previs-screen">{activeShot?.frameMediaId ? <img alt={activeShot.narrativeJob} src={`/api/projects/${props.projectId}/media/${activeShot.frameMediaId}`} /> : <div><ScanEye size={30} /><p>当前镜头缺少真实预演帧；不能用空白占位冒充连续画面。</p></div>}<output>{time.toFixed(2)}s / {current?.durationSeconds.toFixed(2) ?? "0.00"}s</output></div>
      <div className="cp-previs-controls"><button disabled={!current} onClick={() => setPlaying((value) => !value)} type="button">{playing ? <Pause size={14} /> : <Play size={14} />}{playing ? "暂停" : "连续播放"}</button><input aria-label="预演时间" disabled={!current} max={current?.durationSeconds ?? 1} min="0" onChange={(event) => setTime(Number(event.target.value))} step="0.01" type="range" value={time} />{current ? <button disabled={ownerReviewBlocked} onClick={() => void props.actions.reviewSequencePrevis(current.sequencePrevisId!, Number(current.revision), "accepted")} title={ownerReviewBlocked ? "先补齐每镜真实帧、当前视觉上下文和全部切镜边界" : "经 Core 完整性门禁写入当前 revision Owner ACCEPT"} type="button"><Check size={14} />{ownerReviewBlocked ? "预演尚未完整" : "Owner 接受当前预演"}</button> : null}</div>
      <div className="cp-previs-timeline">{current?.shots.map((shot) => <button className={shot.shotId === selectedShotId ? "is-active" : ""} key={shot.previsShotId} onClick={() => { setTime(shot.startSeconds); setSelectedShotId(shot.shotId); }} style={{ flexGrow: shot.endSeconds - shot.startSeconds }} type="button"><b>#{shot.order}</b><span>{shot.startSeconds.toFixed(1)}–{shot.endSeconds.toFixed(1)}s</span><small>{shot.narrativeJob}</small></button>)}</div>
    </section>
    <section className="cp-previs-decisions"><header><strong>切镜与上下文证据</strong><small>每一个边界必须说明为什么切、如何接；不切也必须有理由。</small></header>{current?.cutDecisions.map((cut) => <article key={cut.cutDecisionId}><b>{cut.atSeconds.toFixed(2)}s · {cut.transitionType}</b><p>{cut.motivation}</p><small>{cut.outgoingPhase} → {cut.incomingPhase}</small><small>轴线：{cut.axisRule} · 运动：{cut.motionVector} · 声音：{cut.audioBridge}</small></article>)}
      {current && selectedShotId ? <button className="cp-previs-compile" onClick={() => void props.actions.compileVisualContext(current.sequencePrevisId!, selectedShotId)} type="button"><ShieldCheck size={14} />编译当前镜头视觉上下文</button> : null}
      {selectedBundle ? <article className="is-context"><b><Check size={13} />视觉上下文已编译</b><small>{selectedBundle.visualContextBundleId}</small><p>保留 {selectedBundle.promptFacts.preserve.length} 项 · 改变 {selectedBundle.promptFacts.change.length} 项 · 动态 {selectedBundle.promptFacts.motion.length} 项 · 禁止 {selectedBundle.promptFacts.prohibitions.length} 项</p><small>上下文窗口 {selectedBundle.phaseStrip.length} 镜 · 参考职责 {selectedBundle.referenceRoles.length} 项</small></article> : null}
    </section>
    <CinematicContractForm label={current ? "编辑连续预演合同" : "从当前剧情、镜头和故事板建立连续预演"} note="保存后会冻结剧情/镜头版本、真实帧、切镜理由、轴线、视线、运动和声音交接" value={editable as Record<string, unknown>} onSave={(value) => props.actions.saveSequencePrevis(value as SequencePrevisDocument, current?.sequencePrevisId)} />
  </div>;
}
