"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Pause, Play, ScanEye, ShieldCheck } from "lucide-react";
import { CinematicContractForm } from "./CinematicContractForm";
import type { CinematicAssetAuthority, CinematicShotSpec, StoryboardDocumentV2, StoryProductionPacket } from "./cinematic-production-types";
import type { SequencePrevisDocument, SequencePrevisPlaybackReceipt, VisualContextBundle } from "./cinematic-sequence-workspace-types";

interface Props {
  assetAuthorities: CinematicAssetAuthority[];
  projectId: string;
  readOnly?: boolean;
  sequencePrevis: SequencePrevisDocument[];
  shots: CinematicShotSpec[];
  storyboards: StoryboardDocumentV2[];
  storyPacket: StoryProductionPacket | null;
  visualContextBundles: VisualContextBundle[];
  actions: {
    saveSequencePrevis(value: SequencePrevisDocument, previsId?: string): Promise<void>;
    compileVisualContext(previsId: string, shotId: string): Promise<void>;
    recordSequencePrevisPlayback(previsId: string, playback: Record<string, unknown>): Promise<SequencePrevisPlaybackReceipt>;
    reviewSequencePrevis(previsId: string, revision: number, state: "accepted" | "rejected", playbackReceiptId?: string): Promise<void>;
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
  const [playbackReceipt, setPlaybackReceipt] = useState<SequencePrevisPlaybackReceipt | null>(null);
  const [playbackEvidence, setPlaybackEvidence] = useState<Record<string, unknown> | null>(null);
  const playbackSessionRef = useRef<{
    completed: boolean;
    intervals: Array<{ startSeconds: number; endSeconds: number }>;
    maxObservedStepMs: number;
    playbackSessionId: string;
    sampleCount: number;
    startedAt: string;
    timelineSeconds: number;
  } | null>(null);
  useEffect(() => {
    setPlaying(false);
    setTime(0);
    setPlaybackReceipt(null);
    setPlaybackEvidence(null);
    playbackSessionRef.current = null;
  }, [current?.sequencePrevisId, current?.revision]);
  useEffect(() => {
    if (!playing || !current) return;
    let frame = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      const session = playbackSessionRef.current;
      if (!session || session.completed) return;
      const stepMs = Math.max(0, now - previous);
      previous = now;
      const startSeconds = session.timelineSeconds;
      const endSeconds = Math.min(
        current.durationSeconds,
        startSeconds + stepMs / 1000,
      );
      session.sampleCount += 1;
      session.maxObservedStepMs = Math.max(
        session.maxObservedStepMs,
        stepMs,
      );
      session.timelineSeconds = endSeconds;
      const lastInterval = session.intervals.at(-1);
      if (lastInterval && Math.abs(lastInterval.endSeconds - startSeconds) <= 0.001) {
        lastInterval.endSeconds = endSeconds;
      } else {
        session.intervals.push({ startSeconds, endSeconds });
      }
      setTime(endSeconds);
      if (endSeconds >= current.durationSeconds) {
        session.completed = true;
        setPlaying(false);
        const evidence = {
          playbackSessionId: session.playbackSessionId,
          startedAt: session.startedAt,
          completedAt: new Date().toISOString(),
          sampleCount: session.sampleCount,
          maxObservedStepMs: session.maxObservedStepMs,
          manualSeekCount: 0,
          intervals: session.intervals,
        };
        if (props.readOnly) setPlaybackEvidence(evidence);
        else void props.actions.recordSequencePrevisPlayback(current.sequencePrevisId!, evidence).then(setPlaybackReceipt);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [current, playing, props.actions]);
  const activeShot = useMemo(() => current?.shots.find((shot) => time >= shot.startSeconds && time < shot.endSeconds) ?? current?.shots.at(-1) ?? null, [current, time]);
  useEffect(() => { if (activeShot) setSelectedShotId(activeShot.shotId); }, [activeShot]);
  const selectedBundle = props.visualContextBundles.find((entry) => entry.shotId === selectedShotId);
  const ownerReviewBlocked = current ? current.shots.some((shot) => !shot.frameMediaId || !props.visualContextBundles.some((entry) => entry.sequencePrevisId === current.sequencePrevisId && entry.sequencePrevisRevision === current.revision && entry.shotId === shot.shotId)) || current.cutDecisions.length !== Math.max(0, current.shots.length - 1) || playbackReceipt?.sequencePrevisRevision !== current.revision : true;
  const editable = current ?? starter(props);
  return <div className="cp-previs-stage">
    <section className="cp-previs-player"><header><div><strong>Sequence Previs · 连续视觉大脑</strong><small>{current ? `${current.title} · r${current.revision} · ${current.status}` : "尚未建立正式预演"}</small></div><span><ScanEye size={14} />先看完整连续画面，再决定切镜与生成</span></header>
      <div className="cp-previs-screen">{activeShot?.frameMediaId ? <img alt={activeShot.narrativeJob} src={`/api/projects/${props.projectId}/media/${activeShot.frameMediaId}`} /> : <div><ScanEye size={30} /><p>当前镜头缺少真实预演帧；不能用空白占位冒充连续画面。</p></div>}<output>{time.toFixed(2)}s / {current?.durationSeconds.toFixed(2) ?? "0.00"}s</output></div>
      <div className="cp-previs-controls"><button disabled={!current} onClick={() => {
        if (!current) return;
        if (playing) {
          setPlaying(false);
          return;
        }
        if (!playbackSessionRef.current || playbackSessionRef.current.completed || time >= current.durationSeconds) {
          setTime(0);
          setPlaybackReceipt(null);
          setPlaybackEvidence(null);
          playbackSessionRef.current = {
            completed: false,
            intervals: [],
            maxObservedStepMs: 0,
            playbackSessionId: crypto.randomUUID(),
            sampleCount: 0,
            startedAt: new Date().toISOString(),
            timelineSeconds: 0,
          };
        }
        setPlaying(true);
      }} type="button">{playing ? <Pause size={14} /> : <Play size={14} />}{playing ? "暂停" : playbackSessionRef.current && !playbackSessionRef.current.completed ? "继续连续播放" : "从 0 连续播放"}</button><input aria-label="预演时间" disabled={!current} max={current?.durationSeconds ?? 1} min="0" onChange={(event) => {
        setPlaying(false);
        setPlaybackReceipt(null);
        setPlaybackEvidence(null);
        playbackSessionRef.current = null;
        setTime(Number(event.target.value));
      }} step="0.01" type="range" value={time} />{playbackReceipt ? <span><ShieldCheck size={14} />0→{playbackReceipt.durationSeconds.toFixed(2)}s 无跳段回执</span> : playbackEvidence ? <output data-playback-evidence={JSON.stringify(playbackEvidence)}><ShieldCheck size={14} />0→{current?.durationSeconds.toFixed(2)}s 只读播放验证完成</output> : <span>手动跳转会清除播放资格</span>}{current ? <button disabled={props.readOnly || ownerReviewBlocked || playing} onClick={() => void props.actions.reviewSequencePrevis(current.sequencePrevisId!, Number(current.revision), "accepted", playbackReceipt?.playbackReceiptId)} title={props.readOnly ? "只读观察不写入审批；请用官方 CLI/API 落库" : ownerReviewBlocked ? "先补齐真实帧、当前视觉上下文、切镜边界并取得 0→duration 无跳段播放回执" : "经 Core 完整性与播放回执门禁写入当前 revision Owner ACCEPT"} type="button"><Check size={14} />{ownerReviewBlocked ? "预演尚未完整" : "Owner 接受当前预演"}</button> : null}</div>
      <div className="cp-previs-timeline">{current?.shots.map((shot) => <button className={shot.shotId === selectedShotId ? "is-active" : ""} key={shot.previsShotId} onClick={() => {
        setPlaying(false);
        setPlaybackReceipt(null);
        setPlaybackEvidence(null);
        playbackSessionRef.current = null;
        setTime(shot.startSeconds);
        setSelectedShotId(shot.shotId);
      }} style={{ flexGrow: shot.endSeconds - shot.startSeconds }} type="button"><b>#{shot.order}</b><span>{shot.startSeconds.toFixed(1)}–{shot.endSeconds.toFixed(1)}s</span><small>{shot.narrativeJob}</small></button>)}</div>
    </section>
    <section className="cp-previs-decisions"><header><strong>切镜与上下文证据</strong><small>每一个边界必须说明为什么切、如何接；不切也必须有理由。</small></header>{current?.cutDecisions.map((cut) => <article key={cut.cutDecisionId}><b>{cut.atSeconds.toFixed(2)}s · {cut.transitionType}</b><p>{cut.motivation}</p><small>{cut.outgoingPhase} → {cut.incomingPhase}</small><small>轴线：{cut.axisRule} · 运动：{cut.motionVector} · 声音：{cut.audioBridge}</small>{Number(cut.overlapSeconds) > 0 ? cut.handoffEvidence ? <small>H0 {cut.handoffEvidence.h0Seconds.toFixed(2)}s · H1 {cut.handoffEvidence.h1Seconds.toFixed(2)}s · trim {cut.handoffEvidence.trimStartSeconds.toFixed(2)}–{cut.handoffEvidence.trimEndSeconds.toFixed(2)}s · {cut.handoffEvidence.verificationId}</small> : <small>阻塞：重叠边界缺少不同 H0/H1、trim 与完整播放核验</small> : null}</article>)}
      {current && selectedShotId ? <button className="cp-previs-compile" disabled={props.readOnly} onClick={() => void props.actions.compileVisualContext(current.sequencePrevisId!, selectedShotId)} type="button"><ShieldCheck size={14} />编译当前镜头视觉上下文</button> : null}
      {selectedBundle ? <article className="is-context"><b><Check size={13} />视觉上下文已编译</b><small>{selectedBundle.visualContextBundleId}</small><p>保留 {selectedBundle.promptFacts.preserve.length} 项 · 改变 {selectedBundle.promptFacts.change.length} 项 · 动态 {selectedBundle.promptFacts.motion.length} 项 · 禁止 {selectedBundle.promptFacts.prohibitions.length} 项</p><small>上下文窗口 {selectedBundle.phaseStrip.length} 镜 · 参考职责 {selectedBundle.referenceRoles.length} 项</small></article> : null}
    </section>
    <fieldset disabled={props.readOnly}><CinematicContractForm label={current ? "编辑连续预演合同" : "从当前剧情、镜头和故事板建立连续预演"} note="保存后会冻结剧情/镜头版本、真实帧、切镜理由、轴线、视线、运动和声音交接" value={editable as Record<string, unknown>} onSave={(value) => props.actions.saveSequencePrevis(value as SequencePrevisDocument, current?.sequencePrevisId)} /></fieldset>
  </div>;
}
