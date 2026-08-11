import { UnuTvError } from "@ununu/unutv-contracts";
import {
  cinematicCandidateRenderIdempotencyKey,
  cinematicTimelineLineageHash
} from "../cinematic-render-lineage-policy.mjs";

export async function executeAutomationDeliveryQcStage({
  artifact,
  dependencies,
  ensureEdge,
  ensureNode,
  output,
  ports,
  productionId,
  projectId,
  resolved,
  task
}) {
  const automationTasks = await dependencies.automationTasks.listAutomationTasks({
    projectId,
    automationRunId: task.automationRunId
  });
  const renderTask = automationTasks.find((entry) => entry.stage === "candidate_render");
  if (renderTask?.status !== "succeeded" || !renderTask?.output?.renderJobId) {
    throw new UnuTvError(
      "cinematic_delivery_render_lineage_required",
      "交付 QC 必须绑定当前自动化运行中已成功的 candidate_render 任务及其明确 renderJobId。",
      409,
      {
        automationRunId: task.automationRunId,
        candidateRenderStatus: renderTask?.status ?? null,
        renderJobId: renderTask?.output?.renderJobId ?? null
      }
    );
  }
  const renderJobId = renderTask.output.renderJobId;
  const jobs = await dependencies.render.listRenderJobs({ projectId });
  const job = jobs.find((entry) => entry.id === renderJobId);
  const timelineTask = automationTasks.find((entry) => entry.stage === "timeline_edit");
  const configuredTimelineId = resolved.configuration.timelineId ?? null;
  const editedTimelineId = timelineTask?.output?.importReceipt?.timelineId ?? null;
  const expectedTimelineId = configuredTimelineId ?? editedTimelineId;
  let currentTimeline = null;
  if (expectedTimelineId) {
    try {
      currentTimeline = await dependencies.timeline.getTimeline({
        projectId,
        timelineId: expectedTimelineId
      });
    } catch {
      currentTimeline = null;
    }
  }
  const expectedTimelineLineageHash = currentTimeline
    ? cinematicTimelineLineageHash(currentTimeline)
    : null;
  const expectedIdempotencyKey = currentTimeline
    ? cinematicCandidateRenderIdempotencyKey({
        automationRunId: task.automationRunId,
        timeline: currentTimeline
      })
    : null;
  const project = await ports.projects.open(projectId);
  const canvas = project?.rootCanvasId
    ? await ports.projects.openCanvas(projectId, project.rootCanvasId)
    : null;
  const outputNode = (canvas?.nodes ?? []).find((node) => node.id === job?.outputNodeId);
  const lineageMismatch = (
    !job
    || job.status !== "succeeded"
    || job.idempotencyKey !== expectedIdempotencyKey
    || job.renderGraph?.timelineLineageHash !== expectedTimelineLineageHash
    || !expectedTimelineId
    || !currentTimeline
    || (configuredTimelineId && editedTimelineId && configuredTimelineId !== editedTimelineId)
    || job.timelineId !== expectedTimelineId
    || !job.outputNodeId
    || outputNode?.payload?.productionId !== productionId
    || outputNode?.payload?.stage !== "candidate_render"
    || outputNode?.payload?.timelineId !== expectedTimelineId
    || outputNode?.payload?.timelineLineageHash !== expectedTimelineLineageHash
  );
  if (lineageMismatch) {
    throw new UnuTvError(
      "cinematic_delivery_render_lineage_mismatch",
      "candidate_render 任务、渲染作业、时间线与画布输出节点不属于同一当前电影生产谱系。",
      409,
      {
        automationRunId: task.automationRunId,
        configuredTimelineId,
        editedTimelineId,
        expectedTimelineId,
        expectedTimelineLineageHash,
        expectedIdempotencyKey,
        productionId,
        renderJob: job
          ? {
              id: job.id,
              status: job.status,
              idempotencyKey: job.idempotencyKey ?? null,
              timelineId: job.timelineId ?? null,
              outputNodeId: job.outputNodeId ?? null
            }
          : null,
        outputNode: outputNode
          ? {
              id: outputNode.id,
              productionId: outputNode.payload?.productionId ?? null,
              stage: outputNode.payload?.stage ?? null,
              timelineId: outputNode.payload?.timelineId ?? null
            }
          : null
      }
    );
  }
  if (job.preset !== "h264_vertical") {
    throw new UnuTvError(
      "delivery_render_preset_required",
      "交付 QC 只接受 h264_vertical 终交母版；审看件不能冒充最终交付。",
      409,
      { actualPreset: job.preset, renderJobId: job.id, requiredPreset: "h264_vertical" }
    );
  }
  const manifest = await dependencies.render.createDeliveryPackage({
    projectId,
    renderJobId: job.id,
    acceptWarnings: resolved.configuration.acceptQcWarnings === true
  });
  if (manifest.kind !== "delivery" || manifest.status !== "delivery_ready") {
    throw new UnuTvError(
      "delivery_manifest_kind_invalid",
      "最终交付清单必须是 delivery/delivery_ready。",
      500,
      { deliveryPackageId: manifest.id, kind: manifest.kind, status: manifest.status }
    );
  }
  const deliveryNode = await ensureNode(projectId, {
    kind: "qa",
    title: "EP01 · 交付 QC 与清单",
    x: 2160,
    y: 11648,
    resourceType: "delivery_package",
    resourceId: manifest.id,
    payload: {
      productionId,
      stage: "delivery_qc",
      deliveryPackageId: manifest.id,
      renderJobId: job.id,
      mediaId: manifest.mediaId,
      checksum: manifest.checksum,
      qcStatus: manifest.qcStatus ?? manifest.technicalQc?.status ?? "passed",
      stageStatus: "succeeded"
    }
  });
  if (job.outputNodeId) {
    await ensureEdge(projectId, job.outputNodeId, deliveryNode.id, "cinematic_stage:delivery_qc");
  }
  return {
    output: output([
      artifact("delivery_package", manifest.id, "交付清单", {
        mediaId: manifest.mediaId,
        versionId: manifest.checksum,
        nodeId: deliveryNode.id
      })
    ], { deliveryNodeId: deliveryNode.id })
  };
}
