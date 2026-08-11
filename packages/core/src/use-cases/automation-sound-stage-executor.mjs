import { UnuTvError } from "@ununu/unutv-contracts";
import {
  assessCinematicDialogueCanvasPlan,
  deriveCinematicDialogueContext
} from "../cinematic-dialogue-voice-policy.mjs";
import { assessCinematicSoundDesign } from "../cinematic-sound-design-policy.mjs";
import { generationStrategy } from "./automation-provider-strategy-policy.mjs";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

async function applySoundPlanToTimeline({ contribution, dependencies, projectId, task, timeline }) {
  const actions = [];
  const fields = contribution.structuredFields ?? {};
  const auditBySource = new Map(list(fields.sourceAudioAudit).map((entry) => [text(entry?.sourceMediaId), entry]));
  const audioTrack = list(timeline.tracks).find((track) => track?.kind === "audio");
  if (!audioTrack) throw new UnuTvError("sound_timeline_audio_track_required", "声音后期需要一条可见、可编辑的音频轨。", 409);
  let current = timeline;
  for (const videoClip of list(timeline.clips).filter((clip) => Number(clip.track) === 0 && text(clip.mediaId))) {
    const audit = auditBySource.get(text(videoClip.mediaId));
    if (!audit) continue;
    const expectedPayload = {
      ...videoClip.payload,
      ...(audit.status === "repaired" ? { includeEmbeddedAudio: false } : {}),
      soundDesignContributionId: contribution.contributionId,
      soundDesignContributionRevision: contribution.revision,
      soundDesignSourceTimelineRevision: fields.sourceTimelineRevision ?? fields.targetRevision,
      sourceAudioStatus: audit.status,
      ...(audit.status === "repaired" ? {
        sourceAudioRepair: {
          remixMediaId: audit.remixMediaId,
          sourceMediaId: audit.sourceMediaId,
          status: "repaired"
        }
      } : {})
    };
    const needsVideoPatch = JSON.stringify(videoClip.payload ?? {}) !== JSON.stringify(expectedPayload);
    if (needsVideoPatch) {
      const receipt = await dependencies.timeline.updateTimelineClip({
        projectId,
        timelineId: timeline.id,
        clipId: videoClip.id,
        payload: expectedPayload,
        operationContext: {
          actorType: "automation",
          actorId: "sound_design",
          automationRunId: task.automationRunId,
          idempotencyKey: `${task.idempotencyKey}:video:${videoClip.id}:sound-application:v1`
        }
      });
      actions.push({ action: "update_video_audio_policy", clipId: videoClip.id, commandId: receipt.commandId, sourceMediaId: videoClip.mediaId });
      current = await dependencies.timeline.getTimeline({ projectId, timelineId: timeline.id });
    }
    if (audit.status !== "repaired") continue;
    const existing = list(current.clips).find((clip) => (
      Number(clip.track) === Number(audioTrack.order)
      && text(clip.mediaId) === text(audit.remixMediaId)
      && text(clip.payload?.sourceVideoClipId) === text(videoClip.id)
      && text(clip.payload?.soundDesignContributionId) === text(contribution.contributionId)
    ));
    if (existing) continue;
    const added = await dependencies.timeline.addTimelineClip({
      projectId,
      timelineId: timeline.id,
      mediaId: audit.remixMediaId,
      nodeId: videoClip.nodeId ?? undefined,
      track: audioTrack.order,
      startMs: videoClip.startMs,
      durationMs: videoClip.durationMs,
      trimInMs: videoClip.trimInMs,
      payload: {
        layer: "repaired_source_remix",
        sourceMediaId: videoClip.mediaId,
        sourceVideoClipId: videoClip.id,
        soundDesignContributionId: contribution.contributionId,
        soundDesignContributionRevision: contribution.revision,
        soundDesignSourceTimelineRevision: fields.sourceTimelineRevision ?? fields.targetRevision
      },
      operationContext: {
        actorType: "automation",
        actorId: "sound_design",
        automationRunId: task.automationRunId,
        idempotencyKey: `${task.idempotencyKey}:audio:${videoClip.id}:${audit.remixMediaId}:v1`
      }
    });
    actions.push({ action: "add_repaired_remix", clipId: added.id, mediaId: audit.remixMediaId, sourceVideoClipId: videoClip.id });
    current = await dependencies.timeline.getTimeline({ projectId, timelineId: timeline.id });
  }
  for (const cue of list(fields.cueSheet).filter((entry) => text(entry?.segmentSeam?.boundaryId))) {
    const startMs = Math.round(Number(cue.startSeconds) * 1000);
    const durationMs = Math.round((Number(cue.endSeconds) - Number(cue.startSeconds)) * 1000);
    const trimInMs = Math.round(Number(cue.trimInSeconds ?? 0) * 1000);
    const existing = list(current.clips).find((clip) => (
      Number(clip.track) === Number(audioTrack.order)
      && text(clip.mediaId) === text(cue.mediaId)
      && text(clip.payload?.segmentSeam?.boundaryId) === text(cue.segmentSeam.boundaryId)
      && Number(clip.startMs) === startMs
      && Number(clip.durationMs) === durationMs
      && Number(clip.trimInMs) === trimInMs
    ));
    if (existing) continue;
    const added = await dependencies.timeline.addTimelineClip({
      projectId,
      timelineId: timeline.id,
      mediaId: cue.mediaId,
      track: audioTrack.order,
      startMs,
      durationMs,
      trimInMs,
      payload: {
        layer: "segment_seam_sound_bridge",
        segmentSeam: {
          audioEdit: cue.segmentSeam.audioEdit,
          boundaryId: cue.segmentSeam.boundaryId,
          seamAction: cue.segmentSeam.seamAction
        },
        soundDesignContributionId: contribution.contributionId,
        soundDesignContributionRevision: contribution.revision,
        soundDesignSourceTimelineRevision: fields.sourceTimelineRevision ?? fields.targetRevision
      },
      operationContext: {
        actorType: "automation",
        actorId: "sound_design",
        automationRunId: task.automationRunId,
        idempotencyKey: `${task.idempotencyKey}:segment-seam:${cue.segmentSeam.boundaryId}:${cue.mediaId}:v1`
      }
    });
    actions.push({
      action: "add_segment_seam_sound_bridge",
      boundaryId: cue.segmentSeam.boundaryId,
      clipId: added.id,
      mediaId: cue.mediaId
    });
    current = await dependencies.timeline.getTimeline({ projectId, timelineId: timeline.id });
  }
  return {
    actions,
    contributionId: contribution.contributionId,
    contributionRevision: contribution.revision,
    format: "CinematicSoundTimelinePatchReceiptV1",
    sourceTimelineRevision: timeline.revision,
    timelineId: timeline.id,
    timelineRevision: current.revision
  };
}

export async function executeAutomationSoundStage({
  artifact,
  dependencies,
  isBudgetlessWorkflow,
  liveCanvas,
  output,
  ports,
  productionId,
  projectId,
  resolved,
  task
}) {
  const budgetless = isBudgetlessWorkflow(resolved);
  let appliedSoundReceipt = null;
  if (resolved.configuration?.workflowManifest) {
    const automationTasks = await dependencies.automationTasks.listAutomationTasks({
      projectId,
      automationRunId: task.automationRunId
    });
    const timelineTask = automationTasks.find((entry) => entry.stage === "timeline_edit");
    const editedTimelineId = timelineTask?.output?.importReceipt?.timelineId ?? null;
    const configuredTimelineId = resolved.configuration.timelineId ?? null;
    if (
      timelineTask?.status !== "succeeded"
      || !editedTimelineId
      || (configuredTimelineId && configuredTimelineId !== editedTimelineId)
    ) {
      throw new UnuTvError(
        "sound_rough_timeline_lineage_required",
        "声音后期必须绑定当前自动化运行中已成功 timeline_edit 的确定性粗剪回执，不能选择任意最近更新时间线。",
        409,
        {
          automationRunId: task.automationRunId,
          configuredTimelineId,
          editedTimelineId,
          timelineEditStatus: timelineTask?.status ?? null
        }
      );
    }
    const roughTimeline = await dependencies.timeline.getTimeline({ projectId, timelineId: editedTimelineId });
    const [authorities, contributions, shots, story, reviews] = await Promise.all([
      dependencies.authorities.listAssetAuthorities({ projectId, productionId }),
      dependencies.cinematic.listProfessionalContributions({ projectId, productionId }),
      dependencies.cinematic.listShots({ projectId, productionId }),
      dependencies.cinematic.getStoryPacket({ projectId, productionId }),
      ports.projects.listReviews(projectId)
    ]);
    const derivedDialogue = deriveCinematicDialogueContext({
      authorities,
      episodeId: resolved.configuration?.episodeId ?? story?.episodeId,
      shots,
      story
    });
    const dialogueCanvas = await liveCanvas(projectId);
    const dialogueCanvasPlan = assessCinematicDialogueCanvasPlan({ canvas: dialogueCanvas, dialogueContext: derivedDialogue });
    if (derivedDialogue.hasDialogue && !dialogueCanvasPlan.ok) {
      throw new UnuTvError(
        "cinematic_dialogue_canvas_plan_required",
        "正式声音阶段必须先在画布建立与当前剧本逐行一一对应的独立对白音频节点；禁止单个通用音频节点代替多角色对白。",
        409,
        dialogueCanvasPlan
      );
    }
    const canvasMediaIds = dialogueCanvas.nodes.flatMap((node) => [
      node.payload?.currentMediaId,
      ...(node.payload?.mediaIds ?? [])
    ]).filter(Boolean);
    const soundGate = assessCinematicSoundDesign({
      authorities,
      canvasMediaIds,
      contributions,
      derivedDialogue,
      requireTimelineApplication: false,
      reviews,
      timeline: roughTimeline
    });
    if (!soundGate.ok) {
      throw new UnuTvError(
        "cinematic_sound_design_required",
        "声音后期必须在真实粗剪之后完成；视频原生音频只能作为对白/环境源，不能跳过 cue、拟音、音乐、静默、ducking 与版权审核。",
        409,
        soundGate
      );
    }
    const timelinePatchReceipt = await applySoundPlanToTimeline({
      contribution: soundGate.contribution,
      dependencies,
      projectId,
      task,
      timeline: roughTimeline
    });
    appliedSoundReceipt = timelinePatchReceipt;
    const appliedTimeline = await dependencies.timeline.getTimeline({ projectId, timelineId: roughTimeline.id });
    const appliedGate = assessCinematicSoundDesign({
      allowDerivedTimelineRevision: true,
      authorities,
      canvasMediaIds,
      contributions,
      derivedDialogue,
      requireTimelineApplication: true,
      reviews,
      timeline: appliedTimeline
    });
    if (!appliedGate.ok) {
      throw new UnuTvError(
        "cinematic_sound_timeline_application_failed",
        "声音计划未被完整、确定性地应用到当前时间线；禁止进入候选渲染。",
        409,
        { ...appliedGate, timelinePatchReceipt }
      );
    }
    const canvas = await liveCanvas(projectId);
    const soundNode = canvas.nodes.find((node) => (
      node.payload?.productionId === productionId
      && node.payload?.resourceType === "cinematic_sound_design_plan"
      && node.payload?.contributionId === soundGate.contribution.contributionId
    ));
    const timelineNode = canvas.nodes.find((node) => (
      node.payload?.productionId === productionId
      && node.payload?.resourceType === "timeline"
      && node.payload?.timelineId === appliedTimeline.id
    ));
    if (!soundNode || !timelineNode) {
      throw new UnuTvError("sound_timeline_canvas_projection_required", "声音时间线应用回执必须投影到可见声音总控节点和主时间线节点。", 409, {
        soundNodeId: soundNode?.id ?? null,
        timelineNodeId: timelineNode?.id ?? null
      });
    }
    await dependencies.updateNode({
      projectId,
      nodeId: soundNode.id,
      expectedRevision: soundNode.revision,
      payload: {
        ...soundNode.payload,
        derivedDialogue,
        reviewState: "applied",
        timelinePatchReceipt
      }
    });
    const liveTimelineNode = await ports.projects.getNode(projectId, timelineNode.id);
    await dependencies.updateNode({
      projectId,
      nodeId: liveTimelineNode.id,
      expectedRevision: liveTimelineNode.revision,
      payload: {
        ...liveTimelineNode.payload,
        soundDesignContributionId: soundGate.contribution.contributionId,
        soundTimelinePatchReceipt: timelinePatchReceipt,
        timelineRevision: appliedTimeline.revision
      }
    });
    const projectedCanvas = await liveCanvas(projectId);
    if (!projectedCanvas.edges.some((edge) => (
      edge.fromNodeId === soundNode.id
      && edge.toNodeId === timelineNode.id
      && edge.role === "cinematic_sound:applied_to_timeline"
    ))) {
      await dependencies.connectEdge({
        projectId,
        canvasId: projectedCanvas.id,
        fromNodeId: soundNode.id,
        toNodeId: timelineNode.id,
        role: "cinematic_sound:applied_to_timeline"
      });
    }
  }
  const timelines = appliedSoundReceipt
    ? [{ id: appliedSoundReceipt.timelineId }]
    : await dependencies.timeline.listTimelines({ projectId });
  const audioClips = [];
  for (const summary of timelines) {
    const timeline = await dependencies.timeline.getTimeline({ projectId, timelineId: summary.id });
    audioClips.push(...timeline.clips.filter((clip) => clip.track === 1 && clip.mediaId));
  }
  const audioNodes = resolved.canvas?.nodes.filter((node) => node.kind === "audio" && node.payload?.currentMediaId) ?? [];
  if (!audioClips.length && !audioNodes.length) {
    const formalDialogueNodes = resolved.canvas?.nodes.filter((node) => (
      node.kind === "audio"
      && node.payload?.resourceType === "cinematic_dialogue_line"
    )) ?? [];
    if (formalDialogueNodes.length) {
      throw new UnuTvError(
        "formal_dialogue_media_required",
        "正式对白必须逐行通过已锁定声音权威的画布节点生成或导入并完成审核；声音阶段不得退回单个通用音频生成。",
        409,
        { dialogueNodeIds: formalDialogueNodes.map((node) => node.id) }
      );
    }
    const budgetInput = generationStrategy(resolved, "sound_design");
    if (!budgetInput?.provider || !budgetInput?.model || !budgetInput?.executionNodeId) {
      throw new UnuTvError(
        "automation_sound_generation_strategy_required",
        "声音资产缺失；请在工作流策略中绑定声音 Provider、模型和音频执行节点，或导入现有音频",
        409,
        { stage: task.stage }
      );
    }
    if (!budgetless && !(Number(budgetInput.amount ?? budgetInput.perItemAmount) > 0)) {
      throw new UnuTvError("automation_generation_strategy_required", "legacy_budget 自动声音生成还需要预留金额", 409, { stage: task.stage });
    }
    const node = resolved.canvas?.nodes.find((entry) => entry.id === budgetInput.executionNodeId && entry.kind === "audio");
    if (!node) throw new UnuTvError("automation_audio_execution_node_invalid", "声音生成必须选择当前画布中的音频节点", 409);
    const idempotencyKey = `${task.idempotencyKey}:attempt:${task.attempt}:provider:v1`;
    let run = (await ports.projects.listRuns(projectId)).find((entry) => entry.nodeId === node.id && entry.request?.idempotencyKey === idempotencyKey) ?? null;
    if (run?.status === "queued") throw new UnuTvError("paid_submission_outcome_unknown", "检测到未确认结果的声音 Provider 提交；为避免重复提交，已停止自动重发", 409, { runId: run.id, idempotencyKey });
    if (!run) run = await dependencies.runNode({
      projectId,
      nodeId: node.id,
      provider: budgetInput.provider,
      request: {
        ...(budgetInput.configuration?.request ?? {}),
        billingMode: budgetless ? "provider_account" : "legacy_budget",
        idempotencyKey,
        model: budgetInput.model,
        text: budgetInput.configuration?.text ?? node.payload?.prompt ?? node.title
      }
    });
    else if (run.status === "running") run = await dependencies.pollRun({ projectId, runId: run.id });
    if (["queued", "running"].includes(run.status)) {
      return { waiting: true, output: output([artifact("provider_run", run.id, "声音 Provider 任务")], { providerRunId: run.id }) };
    }
    if (run.status !== "succeeded") throw new UnuTvError(run.result?.code ?? "automation_sound_provider_failed", run.result?.message ?? "声音 Provider 任务失败", 409, { runId: run.id });
    const generated = (run.result?.artifacts ?? []).filter((entry) => entry.kind === "audio");
    if (!generated.length) throw new UnuTvError("automation_sound_artifact_missing", "声音 Provider 未返回音频产物", 502, { runId: run.id });
    return { output: output(generated.map((entry) => artifact("audio_node", node.id, node.title, { mediaId: entry.id, providerRunId: run.id }))) };
  }
  return { reused: true, output: output([
    ...(appliedSoundReceipt ? [artifact("sound_timeline_patch", appliedSoundReceipt.timelineId, "声音时间线应用回执", { versionId: `r${appliedSoundReceipt.timelineRevision}` })] : []),
    ...audioClips.map((clip) => artifact("timeline_audio", clip.id, "时间线音频", { mediaId: clip.mediaId })),
    ...audioNodes.map((node) => artifact("audio_node", node.id, node.title, { mediaId: node.payload.currentMediaId }))
  ], appliedSoundReceipt ? { timelinePatchReceipt: appliedSoundReceipt } : {}) };
}
