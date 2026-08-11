import {
  UnuTvError,
  latestCinematicEvaluationsByUnit,
  normalizeCinematicSegmentDecision
} from "@ununu/unutv-contracts";
import { buildCinematicEditorialSeamPlan } from "../cinematic-editorial-seam-policy.mjs";

export async function executeAutomationContinuityQaStage({
  artifact,
  dependencies,
  output,
  productionId,
  projectId
}) {
  const evaluations = await dependencies.cinematic.listEvaluations({ projectId, productionId });
  const units = await dependencies.cinematic.listGenerationUnits({ projectId, productionId });
  const activeUnits = units.filter((entry) => entry.generationUnit.lifecycle !== "archived");
  const latestEvaluations = latestCinematicEvaluationsByUnit(evaluations);
  if (!activeUnits.length) throw new UnuTvError("generation_unit_required", "连续性审片需要至少一个有效 GenerationUnit。", 409);
  const accepted = [];
  for (const entry of activeUnits) {
    const generationUnitId = entry.generationUnit.generationUnitId;
    const evaluation = latestEvaluations.get(generationUnitId);
    if (!evaluation) {
      throw new UnuTvError("continuity_evaluation_required", `${generationUnitId} 缺少最新 CinematicEvaluationRecord，不能进入剪辑。`, 409, { generationUnitId });
    }
    if (evaluation.decision !== "ACCEPT") {
      throw new UnuTvError("latest_cinematic_evaluation_rejected", `${generationUnitId} 的最新审片结论不是 ACCEPT，不能进入剪辑。`, 409, {
        decision: evaluation.decision ?? null,
        evaluationId: evaluation.evaluationId ?? null,
        generationUnitId
      });
    }
    if (!evaluation.takeObservation || evaluation.canonReconciliation?.status !== "accepted") {
      throw new UnuTvError("structured_continuity_evaluation_required", `${generationUnitId} 缺少真实起止状态观察或正典对账，不能进入剪辑。`, 409, { generationUnitId });
    }
    if (entry.generationUnit.executionGates?.requireContinuityStateAudit === true && !evaluation.actualContinuityState) {
      throw new UnuTvError("structured_continuity_state_required", `${generationUnitId} 缺少结构化实际连续性状态，不能进入剪辑。`, 409, { generationUnitId });
    }
    const preflight = await dependencies.cinematic.preflightGenerationUnit({ projectId, productionId, generationUnitId, recompile: true });
    if (!preflight.ready) throw new UnuTvError("continuity_chain_preflight_failed", `${generationUnitId} 的相邻镜连续性链在审片后失效。`, 409, preflight);
    accepted.push(evaluation);
  }
  return { reused: true, output: output(accepted.map((entry) => artifact("cinematic_evaluation", entry.evaluationId, "连续性审片", { versionId: `r${entry.revision}`, mediaId: entry.mediaId }))) };
}

export async function executeAutomationTimelineEditStage({
  artifact,
  dependencies,
  ensureEdge,
  ensureNode,
  liveCanvas,
  output,
  ports,
  productionId,
  projectId,
  resolved,
  task
}) {
  const [boards, evaluations, shots, units] = await Promise.all([
    dependencies.storyboards.listStoryboards({ projectId, productionId }),
    dependencies.cinematic.listEvaluations({ projectId, productionId }),
    dependencies.cinematic.listShots({ projectId, productionId }),
    dependencies.cinematic.listGenerationUnits({ projectId, productionId })
  ]);
  const latestEvaluations = latestCinematicEvaluationsByUnit(evaluations);
  const shotOrder = new Map(shots.map((shot) => [shot.shotId, Number(shot.order)]));
  const activeUnits = units
    .filter((entry) => entry.generationUnit.lifecycle !== "archived")
    .sort((left, right) => (
      Math.min(...left.generationUnit.shotLinks.map((link) => shotOrder.get(link.shotId) ?? Number.MAX_SAFE_INTEGER))
      - Math.min(...right.generationUnit.shotLinks.map((link) => shotOrder.get(link.shotId) ?? Number.MAX_SAFE_INTEGER))
    ));
  if (!activeUnits.length) throw new UnuTvError("generation_unit_required", "粗剪必须从已接受的 GenerationUnit 构建。", 409);
  const sequenceBindings = activeUnits
    .map((entry) => entry.generationUnit.sequenceWorkspaceBinding)
    .filter(Boolean);
  const sequenceKeys = new Set(sequenceBindings.map((binding) => (
    `${binding.sequencePrevisId}:r${binding.sequencePrevisRevision}`
  )));
  if (sequenceKeys.size > 1) {
    throw new UnuTvError(
      "timeline_sequence_previs_lineage_mismatch",
      "粗剪单元绑定了不同的 SequencePrevis revision，不能形成同一条主时间线。",
      409,
      { sequenceBindings }
    );
  }
  const sequenceBinding = sequenceBindings[0] ?? null;
  const sequencePrevis = sequenceBinding && dependencies.sequenceWorkspace?.getSequencePrevis
    ? await dependencies.sequenceWorkspace.getSequencePrevis({
        projectId,
        productionId,
        sequencePrevisId: sequenceBinding.sequencePrevisId
      })
    : null;
  if (
    sequencePrevis
    && (
      sequencePrevis.sequencePrevisId !== sequenceBinding.sequencePrevisId
      || Number(sequencePrevis.revision) !== Number(sequenceBinding.sequencePrevisRevision)
    )
  ) {
    throw new UnuTvError(
      "timeline_sequence_previs_lineage_mismatch",
      "timeline_edit 只能消费 GenerationUnit 当前绑定的精确 SequencePrevis revision。",
      409,
      {
        actualSequencePrevisId: sequencePrevis.sequencePrevisId,
        actualSequencePrevisRevision: sequencePrevis.revision,
        expectedSequencePrevisId: sequenceBinding.sequencePrevisId,
        expectedSequencePrevisRevision: sequenceBinding.sequencePrevisRevision
      }
    );
  }
  const seamPlan = buildCinematicEditorialSeamPlan({
    evaluations,
    sequencePrevis,
    unitEntries: activeUnits
  });
  if (!seamPlan.ok) {
    throw new UnuTvError(
      "timeline_segment_seam_required",
      "两个生成段不得裸拼；必须消费 canonical segment seam、最新 ACCEPT stable tail/usable range 与当前预演切镜决策。",
      409,
      seamPlan
    );
  }
  const seamByIncomingUnit = new Map(seamPlan.seams.map((seam) => [seam.toGenerationUnitId, seam]));
  const acceptedSources = [];
  for (const entry of activeUnits) {
    const unit = entry.generationUnit;
    const evaluation = latestEvaluations.get(unit.generationUnitId);
    if (!evaluation || evaluation.decision !== "ACCEPT") {
      throw new UnuTvError("timeline_accepted_evaluation_required", `${unit.generationUnitId} 缺少最新 ACCEPT 审片，不能进入粗剪。`, 409, {
        generationUnitId: unit.generationUnitId
      });
    }
    const media = await ports.projects.getMedia(projectId, evaluation.mediaId);
    if (!media || media.kind !== "video" || media.sha256 !== evaluation.checksum) {
      throw new UnuTvError("timeline_accepted_media_lineage_invalid", `${unit.generationUnitId} 的 ACCEPT 媒体或 checksum 与项目真实视频不一致。`, 409, {
        actualChecksum: media?.sha256 ?? null,
        evaluationChecksum: evaluation.checksum,
        generationUnitId: unit.generationUnitId,
        mediaId: evaluation.mediaId
      });
    }
    const segmentDecision = normalizeCinematicSegmentDecision(unit.segmentDecision, unit.strategy);
    for (const link of segmentDecision === "new_shot" ? unit.shotLinks : []) {
      const boardShot = boards.flatMap((board) => board.shots).find((shot) => shot.shotId === link.shotId);
      if (!boardShot || boardShot.videoMediaId !== evaluation.mediaId || boardShot.videoChecksum !== evaluation.checksum) {
        throw new UnuTvError(
          "timeline_storyboard_media_stale",
          `${link.shotId} 的 storyboard 视频不是该 GenerationUnit 最新 ACCEPT 的精确媒体/checksum；禁止把旧候选导入粗剪。`,
          409,
          {
            acceptedChecksum: evaluation.checksum,
            acceptedMediaId: evaluation.mediaId,
            generationUnitId: unit.generationUnitId,
            shotId: link.shotId,
            storyboardChecksum: boardShot?.videoChecksum ?? null,
            storyboardMediaId: boardShot?.videoMediaId ?? null
          }
        );
      }
    }
    const ranges = (Array.isArray(evaluation.authoritativeRanges) && evaluation.authoritativeRanges.length
      ? evaluation.authoritativeRanges
      : evaluation.usableRanges) ?? [];
    if (!ranges.length) {
      throw new UnuTvError("timeline_accepted_usable_range_required", `${unit.generationUnitId} 的 ACCEPT 审片缺少可用区间。`, 409, {
        evaluationId: evaluation.evaluationId,
        generationUnitId: unit.generationUnitId
      });
    }
    for (const [rangeIndex, range] of ranges.entries()) {
      const seam = rangeIndex === 0 ? seamByIncomingUnit.get(unit.generationUnitId) ?? null : null;
      const originalStartSeconds = Number(range.start);
      const duplicateTrimEndSeconds = seam?.seamAction === "duplicate_handoff"
        ? Number(seam.providerInput?.trimEndSeconds)
        : null;
      const startSeconds = Number.isFinite(duplicateTrimEndSeconds)
        ? Math.max(originalStartSeconds, duplicateTrimEndSeconds)
        : originalStartSeconds;
      const endSeconds = Number(range.end);
      if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds) || startSeconds < 0 || endSeconds <= startSeconds || endSeconds > Number(evaluation.duration) + 0.05) {
        throw new UnuTvError("timeline_accepted_usable_range_invalid", `${unit.generationUnitId} 的接受区间无效。`, 409, {
          evaluationId: evaluation.evaluationId,
          range
        });
      }
      if (
        seam?.seamAction === "duplicate_handoff"
        && !(startSeconds > originalStartSeconds)
      ) {
        throw new UnuTvError(
          "timeline_duplicate_handoff_trim_required",
          "DUPLICATE_HANDOFF 必须在当前 ACCEPT 可用区间实际删除重复 H0→H1 handoff，不能只写计划不落 trim。",
          409,
          { range, seam }
        );
      }
      acceptedSources.push({
        boundaryBefore: seam,
        checksum: evaluation.checksum,
        evaluation,
        identity: `${evaluation.evaluationId}:${rangeIndex}:${startSeconds.toFixed(3)}-${endSeconds.toFixed(3)}`,
        mediaId: evaluation.mediaId,
        originalStartSeconds,
        rangeIndex,
        startSeconds,
        endSeconds,
        unit
      });
    }
  }
  for (const seam of seamPlan.seams.filter((entry) => entry.seamAction === "bridge_segment")) {
    const incomingUnit = activeUnits.find((entry) => (
      entry.generationUnit.generationUnitId === seam.toGenerationUnitId
    ))?.generationUnit;
    const bridge = incomingUnit?.segmentSeam?.bridgeSegment;
    const bridgeEvaluation = evaluations.find((entry) => entry.evaluationId === bridge?.evaluationId);
    const latestBridgeEvaluation = bridgeEvaluation
      ? latestEvaluations.get(bridgeEvaluation.generationUnitId)
      : null;
    const bridgeMedia = bridgeEvaluation
      ? await ports.projects.getMedia(projectId, bridgeEvaluation.mediaId)
      : null;
    if (
      !bridgeEvaluation
      || latestBridgeEvaluation?.evaluationId !== bridgeEvaluation.evaluationId
      || bridgeEvaluation.decision !== "ACCEPT"
      || bridgeEvaluation.mediaId !== bridge?.mediaId
      || bridgeEvaluation.checksum !== bridge?.checksum
      || bridgeMedia?.kind !== "video"
      || bridgeMedia.sha256 !== bridgeEvaluation.checksum
    ) {
      throw new UnuTvError(
        "timeline_bridge_segment_lineage_required",
        "bridge_segment 必须以其自身最新 ACCEPT evaluation、真实媒体和 checksum 进入时间线。",
        409,
        { bridge, bridgeEvaluationId: bridgeEvaluation?.evaluationId ?? null }
      );
    }
    const existingBridgeIndex = acceptedSources.findIndex((source) => (
      source.evaluation.evaluationId === bridgeEvaluation.evaluationId
    ));
    const incomingIndex = acceptedSources.findIndex((source) => (
      source.unit.generationUnitId === seam.toGenerationUnitId
    ));
    if (incomingIndex < 0) {
      throw new UnuTvError("timeline_bridge_segment_target_missing", "bridge_segment 找不到其 incoming GenerationUnit。", 409, { seam });
    }
    if (existingBridgeIndex >= 0) {
      acceptedSources[existingBridgeIndex].boundaryBefore = seam;
      acceptedSources[incomingIndex].boundaryBefore = null;
      continue;
    }
    const bridgeRanges = (Array.isArray(bridgeEvaluation.authoritativeRanges) && bridgeEvaluation.authoritativeRanges.length
      ? bridgeEvaluation.authoritativeRanges
      : bridgeEvaluation.usableRanges) ?? [];
    if (!bridgeRanges.length) {
      throw new UnuTvError("timeline_bridge_segment_range_required", "bridge_segment 缺少最新 ACCEPT 可用区间。", 409, { bridge });
    }
    const bridgeSources = bridgeRanges.map((range, rangeIndex) => {
      const startSeconds = Number(range.start);
      const endSeconds = Number(range.end);
      if (
        !Number.isFinite(startSeconds)
        || !Number.isFinite(endSeconds)
        || startSeconds < 0
        || endSeconds <= startSeconds
        || endSeconds > Number(bridgeEvaluation.duration) + 0.05
      ) {
        throw new UnuTvError("timeline_bridge_segment_range_invalid", "bridge_segment 的 ACCEPT 可用区间无效。", 409, { bridge, range });
      }
      return {
        boundaryBefore: rangeIndex === 0 ? seam : null,
        checksum: bridgeEvaluation.checksum,
        evaluation: bridgeEvaluation,
        identity: `${bridgeEvaluation.evaluationId}:${rangeIndex}:${startSeconds.toFixed(3)}-${endSeconds.toFixed(3)}`,
        isBridgeSegment: true,
        mediaId: bridgeEvaluation.mediaId,
        originalStartSeconds: startSeconds,
        rangeIndex,
        startSeconds,
        endSeconds,
        unit: { generationUnitId: bridgeEvaluation.generationUnitId }
      };
    });
    acceptedSources[incomingIndex].boundaryBefore = null;
    acceptedSources.splice(incomingIndex, 0, ...bridgeSources);
  }
  const aspectRatio = resolved.configuration.aspectRatio
    || resolved.configuration.workflowManifest?.aspectRatio
    || "16:9";
  const [width, height] = aspectRatio === "9:16" ? [480, 854] : aspectRatio === "1:1" ? [480, 480] : [854, 480];
  let timeline = resolved.configuration.timelineId
    ? await dependencies.timeline.getTimeline({ projectId, timelineId: resolved.configuration.timelineId })
    : null;
  if (!timeline) {
    timeline = await dependencies.timeline.createTimeline({
      projectId,
      title: `${resolved.configuration.episodeId ? "EP01 · " : ""}主时间线`,
      frameRate: 24,
      width,
      height,
      colorSpace: "Rec.709"
    });
  }
  const expectedIdentities = new Set(acceptedSources.map((source) => source.identity));
  const staleTimelineClips = timeline.clips.filter((clip) => (
    Number(clip.track) === 0
    && (!expectedIdentities.has(clip.payload?.acceptedTakeIdentity)
      || clip.mediaId !== acceptedSources.find((source) => source.identity === clip.payload?.acceptedTakeIdentity)?.mediaId)
  ));
  if (staleTimelineClips.length) {
    throw new UnuTvError("timeline_stale_video_clip_blocked", "主视频轨含有不属于当前最新 ACCEPT 审片范围的旧片段，必须先修复粗剪谱系。", 409, {
      clipIds: staleTimelineClips.map((clip) => clip.id)
    });
  }
  const items = [];
  const appliedSeams = [];
  let cursorMs = 0;
  for (const source of acceptedSources) {
    const durationMs = Math.round((source.endSeconds - source.startSeconds) * 1000);
    const trimInMs = Math.round(source.startSeconds * 1000);
    const existing = timeline.clips.find((clip) => clip.payload?.acceptedTakeIdentity === source.identity);
    if (existing) {
      const expectedBoundary = source.boundaryBefore
        ? { ...source.boundaryBefore, atMs: cursorMs }
        : null;
      if (
        existing.startMs !== cursorMs
        || existing.durationMs !== durationMs
        || existing.trimInMs !== trimInMs
        || existing.mediaId !== source.mediaId
        || existing.payload?.acceptedEvaluationId !== source.evaluation.evaluationId
        || existing.payload?.acceptedMediaChecksum !== source.checksum
        || JSON.stringify(existing.payload?.segmentBoundaryBefore ?? null) !== JSON.stringify(expectedBoundary)
      ) {
        throw new UnuTvError("timeline_accepted_clip_mismatch", "已存在的接受片段与当前审片区间或剪辑顺序不一致。", 409, {
          clipId: existing.id,
          identity: source.identity
        });
      }
      items.push({ clipId: existing.id, identity: source.identity, status: "reused" });
    } else {
      const clip = await dependencies.timeline.addTimelineClip({
        projectId,
        timelineId: timeline.id,
        nodeId: source.evaluation.sourceNodeId,
        mediaId: source.mediaId,
        track: 0,
        startMs: cursorMs,
        durationMs,
        trimInMs,
        payload: {
          acceptedEvaluationId: source.evaluation.evaluationId,
          acceptedMediaChecksum: source.checksum,
          acceptedRangeIndex: source.rangeIndex,
          acceptedTakeIdentity: source.identity,
          generationUnitId: source.unit.generationUnitId,
          includeEmbeddedAudio: true,
          ...(source.isBridgeSegment ? { bridgeSegment: true } : {}),
          ...(source.boundaryBefore ? {
            segmentBoundaryBefore: {
              ...source.boundaryBefore,
              atMs: cursorMs
            }
          } : {}),
          ...(source.startSeconds !== source.originalStartSeconds ? {
            duplicateHandoffTrim: {
              originalStartSeconds: source.originalStartSeconds,
              trimEndSeconds: source.startSeconds,
              trimmedSeconds: source.startSeconds - source.originalStartSeconds
            }
          } : {}),
          sourceDurationMs: Math.round(Number(source.evaluation.duration) * 1000)
        },
        operationContext: {
          actorType: "automation",
          actorId: "timeline_edit",
          automationRunId: task.automationRunId,
          idempotencyKey: `${task.idempotencyKey}:accepted-take:${source.identity}:v1`
        }
      });
      items.push({ clipId: clip.id, identity: source.identity, status: "added" });
      timeline = await dependencies.timeline.getTimeline({ projectId, timelineId: timeline.id });
    }
    if (source.boundaryBefore) {
      appliedSeams.push({
        ...source.boundaryBefore,
        atMs: cursorMs,
        incomingClipId: items.at(-1).clipId,
        incomingTrimInMs: trimInMs
      });
    }
    cursorMs += durationMs;
  }
  const receipt = {
    added: items.filter((item) => item.status === "added").length,
    durationMs: cursorMs,
    format: "AcceptedTakeTimelineAssemblyReceiptV1",
    items,
    reused: items.filter((item) => item.status === "reused").length,
    seams: appliedSeams,
    sequencePrevisId: sequencePrevis?.sequencePrevisId ?? null,
    sequencePrevisRevision: sequencePrevis?.revision ?? null,
    timelineId: timeline.id,
    timelineRevision: timeline.revision
  };
  const timelineNode = await ensureNode(projectId, {
    kind: "compose",
    title: "EP01 · 120秒主时间线",
    x: 1342,
    y: 11648,
    resourceType: "timeline",
    resourceId: timeline.id,
    payload: {
      productionId,
      timelineAssemblyReceipt: receipt,
      timelineId: timeline.id,
      timelineRevision: timeline.revision,
      frameRate: 24,
      width,
      height,
      aspectRatio,
      clipCount: items.length,
      durationSeconds: resolved.configuration.targetDurationSeconds
        || resolved.configuration.workflowManifest?.targetDurationSeconds
        || null,
      stage: "timeline_edit",
      stageStatus: "ready"
    }
  });
  const canvas = await liveCanvas(projectId);
  const evidenceNodes = canvas.nodes.filter((node) => (
    node.payload?.resourceType === "cinematic_evaluation_evidence"
    && node.payload?.evaluationDecision === "ACCEPT"
  ));
  for (const evidenceNode of evidenceNodes) {
    await ensureEdge(projectId, evidenceNode.id, timelineNode.id, "cinematic_stage:accepted_take");
  }
  return {
    output: output([artifact("timeline", timeline.id, "主时间线", { nodeId: timelineNode.id, versionId: `r${timeline.revision}` })], {
      importReceipt: receipt,
      timelineNodeId: timelineNode.id
    })
  };
}
