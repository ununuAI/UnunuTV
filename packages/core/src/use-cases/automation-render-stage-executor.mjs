import { UnuTvError, latestCinematicEvaluationsByUnit } from "@ununu/unutv-contracts";
import { cinematicCandidateRenderIdempotencyKey, cinematicTimelineLineageHash } from "../cinematic-render-lineage-policy.mjs";
import { auditCinematicSoundTimelineApplication } from "../cinematic-sound-design-policy.mjs";

export async function executeAutomationCandidateRenderStage({
  artifact,
  dependencies,
  output,
  ports,
  productionId,
  projectId,
  resolved,
  task
}) {
  const timelines = await dependencies.timeline.listTimelines({ projectId });
  const automationTasks = await dependencies.automationTasks.listAutomationTasks({
    projectId,
    automationRunId: task.automationRunId
  });
  const timelineTask = automationTasks.find((entry) => entry.stage === "timeline_edit");
  const timelineId = resolved.configuration.timelineId
    ?? timelineTask?.output?.importReceipt?.timelineId
    ?? timelines[0]?.id;
  if (!timelineId) throw new UnuTvError("timeline_required", "候选渲染需要主时间线", 409);
  const timeline = await dependencies.timeline.getTimeline({ projectId, timelineId });
  const timelineLineageHash = cinematicTimelineLineageHash(timeline);
  const renderIdempotencyKey = cinematicCandidateRenderIdempotencyKey({
    automationRunId: task.automationRunId,
    timeline
  });
  if (resolved.configuration?.workflowManifest) {
    const contributionIds = [...new Set(timeline.clips
      .filter((clip) => Number(clip.track) === 0)
      .map((clip) => clip.payload?.soundDesignContributionId)
      .filter(Boolean))];
    if (contributionIds.length !== 1) {
      throw new UnuTvError(
        "render_sound_timeline_receipt_required",
        "候选渲染前，每个主视频片段必须绑定同一当前声音设计 contribution 的时间线应用回执。",
        409,
        { contributionIds }
      );
    }
    const contributions = await dependencies.cinematic.listProfessionalContributions({ projectId, productionId });
    const contribution = contributions.find((entry) => entry.contributionId === contributionIds[0]);
    const soundTimelineAudit = auditCinematicSoundTimelineApplication({ contribution, timeline });
    if (!soundTimelineAudit.ok) {
      throw new UnuTvError(
        "render_sound_timeline_preflight_failed",
        "声音设计的禁源、替换轨或时间对齐事实已失效，禁止候选渲染。",
        409,
        soundTimelineAudit
      );
    }
  }
  const expectedAspectRatio = resolved.configuration.aspectRatio
    || resolved.configuration.workflowManifest?.aspectRatio
    || null;
  const actualAspectRatio = Number(timeline.width) / Number(timeline.height);
  const expectedRatio = expectedAspectRatio === "9:16"
    ? 9 / 16
    : expectedAspectRatio === "1:1"
      ? 1
      : expectedAspectRatio === "16:9"
        ? 16 / 9
        : null;
  if (expectedRatio && Math.abs(actualAspectRatio - expectedRatio) > 0.01) {
    throw new UnuTvError(
      "timeline_aspect_ratio_mismatch",
      `主时间线 ${timeline.width}×${timeline.height} 与交付画幅 ${expectedAspectRatio} 不一致。`,
      409,
      { timelineId, width: timeline.width, height: timeline.height, expectedAspectRatio }
    );
  }
  if (timeline.width !== 480 || timeline.height !== 854 || timeline.frameRate !== 24) {
    throw new UnuTvError(
      "cinematic_delivery_timeline_profile_mismatch",
      "最终候选母版的主时间线必须严格为 480×854、24fps；不得以高分辨率中间件或其他帧率替代。",
      409,
      {
        timelineId,
        actual: { width: timeline.width, height: timeline.height, frameRate: timeline.frameRate },
        required: { width: 480, height: 854, frameRate: 24 }
      }
    );
  }
  const evaluations = await dependencies.cinematic.listEvaluations({ projectId, productionId });
  const postRepairs = [...latestCinematicEvaluationsByUnit(evaluations).values()]
    .filter((entry) => entry.decision === "ACCEPT" && entry.retakeDisposition?.type === "FIX_IN_POST");
  const completedRepairs = new Set((timeline.markers ?? [])
    .filter((marker) => marker.payload?.repairStatus === "completed")
    .map((marker) => marker.payload?.evaluationId));
  const missingRepairs = postRepairs.filter((entry) => !completedRepairs.has(entry.evaluationId));
  if (missingRepairs.length) {
    throw new UnuTvError(
      "timeline_post_repairs_required",
      "存在已接受但要求后期修复的镜头，必须先在时间线完成并记录修复再渲染。",
      409,
      {
        timelineId,
        repairs: missingRepairs.map((entry) => ({
          evaluationId: entry.evaluationId,
          generationUnitId: entry.generationUnitId,
          mediaId: entry.mediaId,
          repairSuggestions: entry.repairSuggestions
        }))
      }
    );
  }
  const project = await ports.projects.open(projectId);
  const canvas = project?.rootCanvasId ? await ports.projects.openCanvas(projectId, project.rootCanvasId) : null;
  let outputNode = (canvas?.nodes ?? []).find((node) => (
    node.kind === "compose"
    && node.payload?.auditOnly !== true
    && node.payload?.productionId === productionId
    && node.payload?.stage === "candidate_render"
    && node.payload?.timelineId === timelineId
  ));
  if (!outputNode) {
    if (typeof dependencies.createNode !== "function" || !project?.rootCanvasId) {
      throw new UnuTvError("render_canvas_node_required", "候选渲染需要画布上的合成输出节点", 409);
    }
    outputNode = await dependencies.createNode({
      projectId,
      canvasId: project.rootCanvasId,
      kind: "compose",
      title: "候选母版",
      x: 2160,
      y: 120,
      payload: {
        productionId,
        stage: "candidate_render",
        resourceType: "candidate_master",
        resourceId: `${timelineId}:candidate_master`,
        generationPhase: "candidate_render",
        generationStatus: "ready",
        timelineId,
        timelineLineageHash
      }
    });
  } else if (outputNode.payload?.timelineLineageHash !== timelineLineageHash) {
    if (typeof dependencies.updateNode !== "function") {
      throw new UnuTvError(
        "render_canvas_lineage_update_required",
        "当前候选母版节点缺少最新时间线谱系，禁止复用旧节点进入渲染。",
        409,
        { outputNodeId: outputNode.id, timelineId, timelineLineageHash }
      );
    }
    outputNode = await dependencies.updateNode({
      projectId,
      nodeId: outputNode.id,
      expectedRevision: outputNode.revision,
      payload: { ...outputNode.payload, timelineId, timelineLineageHash }
    });
  }
  const jobs = await dependencies.render.listRenderJobs({ projectId, timelineId });
  const renderPreset = resolved.configuration.renderPreset ?? "h264_vertical";
  if (renderPreset !== "h264_vertical") {
    throw new UnuTvError(
      "cinematic_delivery_render_preset_invalid",
      "电影工业候选母版必须使用 h264_vertical 终交 preset；审看 preset 只能生成审看件，不能进入 delivery_qc。",
      409,
      { actualPreset: renderPreset, requiredPreset: "h264_vertical" }
    );
  }
  let job = jobs.find((entry) => entry.idempotencyKey === renderIdempotencyKey);
  if (!job) {
    job = await dependencies.render.createRenderJob({
      projectId,
      timelineId,
      outputNodeId: outputNode.id,
      preset: renderPreset,
      idempotencyKey: renderIdempotencyKey,
      timelineLineageHash
    });
  }
  if (
    job.preset !== renderPreset
    || job.timelineId !== timelineId
    || job.idempotencyKey !== renderIdempotencyKey
    || job.renderGraph?.timelineLineageHash !== timelineLineageHash
  ) {
    throw new UnuTvError(
      "cinematic_delivery_render_job_preset_stale",
      "候选渲染作业未绑定当前时间线版本、谱系 hash 或终交 preset，不能沿用为交付母版。",
      409,
      {
        actualPreset: job.preset,
        actualTimelineId: job.timelineId,
        actualTimelineLineageHash: job.renderGraph?.timelineLineageHash ?? null,
        renderJobId: job.id,
        requiredPreset: renderPreset,
        requiredTimelineId: timelineId,
        requiredTimelineLineageHash: timelineLineageHash
      }
    );
  }
  if (["queued", "running"].includes(job.status)) {
    return {
      waiting: true,
      output: output([artifact("render_job", job.id, "候选母版渲染")], { renderJobId: job.id })
    };
  }
  if (job.status !== "succeeded") {
    throw new UnuTvError("candidate_render_failed", job.error?.message ?? "候选母版渲染失败", 409, job.error);
  }
  return {
    output: output([artifact("render_job", job.id, "候选母版", { mediaId: job.outputMediaId })], {
      renderJobId: job.id
    })
  };
}

