import { RENDER_PRESETS, UnuTvError, assertDeliveryPackageManifestV1, assertExportMaster, assertRenderJob, createId, nowIso, requireEnum, requireText } from "@ununu/unutv-contracts";
import { requireVisibleCanvasExecutionNode } from "../canvas-execution-node-policy.mjs";
import { cinematicTimelineLineageHash } from "../cinematic-render-lineage-policy.mjs";
import { compileRenderGraph } from "../render-graph-policy.mjs";
import { buildTechnicalQcReport } from "../technical-qc-policy.mjs";

function bind(ports, method) {
  if (typeof ports.projects?.[method] !== "function") throw new TypeError(`Missing render port: projects.${method}`);
  return ports.projects[method].bind(ports.projects);
}

export function createRenderUseCases(ports) {
  if (typeof ports.media?.stageRenderFile !== "function") {
    throw new TypeError("Missing render port: media.stageRenderFile");
  }
  const stageRenderFile = ports.media.stageRenderFile.bind(ports.media);
  const createRecord = bind(ports, "createRenderJob");
  const updateRecord = bind(ports, "updateRenderJob");
  const getRecord = bind(ports, "getRenderJob");
  const listRecords = bind(ports, "listRenderJobs");
  const getQcReport = bind(ports, "getTechnicalQcReport");
  const getMaster = bind(ports, "getExportMasterByRenderJob");
  const savePackage = bind(ports, "saveDeliveryPackage");
  const getPackage = bind(ports, "getDeliveryPackage");
  const listPackages = bind(ports, "listDeliveryPackages");
  const commitCompletion = bind(ports, "commitRenderCompletion");

  async function currentRenderLineage(projectId, job) {
    const live = await getRecord(projectId, job.id);
    if (!live || live.status !== "running") return { current: false, live: null, timeline: null };
    let timeline;
    try {
      timeline = await ports.projects.getTimeline(projectId, job.timelineId);
    } catch {
      return { current: false, live, timeline: null };
    }
    return {
      current: cinematicTimelineLineageHash(timeline) === job.renderGraph.timelineLineageHash,
      live,
      timeline
    };
  }

  function launch(projectId, job) {
    queueMicrotask(async () => {
      let current = await getRecord(projectId, job.id);
      if (!current || current.status !== "queued") return;
      let latestProgress = 0;
      const startedAt = nowIso();
      current = await updateRecord(projectId, { ...current, status: "running", progress: 0, startedAt, updatedAt: startedAt, error: null });
      try {
        const result = await ports.render.start({
          projectId, job: current, graph: current.renderGraph,
          onProgress: async (progress) => {
            latestProgress = progress;
            const live = await getRecord(projectId, current.id);
            if (live?.status === "running") await updateRecord(projectId, { ...live, progress, updatedAt: nowIso() });
          }
        });
        const providerCompletion = await currentRenderLineage(projectId, current);
        if (!providerCompletion.live) return;
        if (!providerCompletion.current) {
          const staleAt = nowIso();
          await updateRecord(projectId, {
            ...providerCompletion.live,
            status: "failed",
            progress: latestProgress,
            outputPath: result.outputPath,
            outputMediaId: null,
            error: {
              code: "render_timeline_lineage_stale",
              message: "渲染完成时主时间线 revision/hash 已变化；结果只保留为历史，不得更新当前母版或 QC。",
              details: {
                expectedTimelineLineageHash: current.renderGraph.timelineLineageHash,
                actualTimelineLineageHash: providerCompletion.timeline
                  ? cinematicTimelineLineageHash(providerCompletion.timeline)
                  : null
              }
            },
            updatedAt: staleAt,
            completedAt: staleAt
          });
          return;
        }
        await requireVisibleCanvasExecutionNode({
          allowedKinds: current.preset === "wav_mix" ? ["audio", "compose"] : ["compose", "video", "videoShot", "video-clip"],
          nodeId: current.outputNodeId,
          operation: "时间线渲染",
          projectId,
          projects: ports.projects
        });
        const activeBeforeImport = await currentRenderLineage(projectId, current);
        if (!activeBeforeImport.current) return;
        // Stage the media in project history without projecting it as the
        // output node's current media. Current projection, QC, master and the
        // succeeded state are committed together by the active-lineage CAS.
        const media = await stageRenderFile({ projectId, kind: result.kind ?? "video", title: `${current.preset} · ${current.timelineId}`, filePath: result.outputPath });
        const activeAfterImport = await currentRenderLineage(projectId, current);
        if (!activeAfterImport.current) return;
        const probe = await ports.render.probe(result.outputPath);
        const activeAfterProbe = await currentRenderLineage(projectId, current);
        if (!activeAfterProbe.current) return;
        const qcReport = buildTechnicalQcReport({ graph: current.renderGraph, mediaId: media.id, probe, projectId, renderJobId: current.id });
        const completedAt = nowIso();
        const master = assertExportMaster({ id: createId("export-master"), projectId, timelineId: current.timelineId, renderJobId: current.id, mediaId: media.id, preset: current.preset, checksum: media.sha256, qcReportId: qcReport.id, sidecars: result.sidecars ?? {}, lineage: { renderGraph: current.renderGraph, qcStatus: qcReport.status, sidecars: result.sidecars ?? {} }, createdAt: completedAt });
        const completedJob = {
          ...activeAfterProbe.live,
          status: "succeeded",
          progress: 1,
          outputPath: result.outputPath,
          outputMediaId: media.id,
          updatedAt: completedAt,
          completedAt,
          error: null
        };
        await commitCompletion(projectId, {
          expectedTimelineLineageHash: current.renderGraph.timelineLineageHash,
          expectedTimelineUpdatedAt: current.renderGraph.timelineUpdatedAt,
          job: completedJob,
          master,
          media,
          qcReport
        });
      } catch (error) {
        const failedAt = nowIso();
        const status = error?.code === "render_cancelled" ? "cancelled" : "failed";
        const live = await getRecord(projectId, current.id);
        if (!live) return;
        await updateRecord(projectId, { ...live, status, progress: latestProgress, error: status === "cancelled" ? null : { code: error?.code ?? "render_failed", message: error?.message ?? String(error), details: error?.details ?? null }, updatedAt: failedAt, completedAt: failedAt });
      }
    });
  }

  async function createRenderJob(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const timelineId = requireText(input.timelineId, "timelineId");
    const preset = requireEnum(input.preset ?? "h264_review", RENDER_PRESETS, "preset");
    const outputNode = await requireVisibleCanvasExecutionNode({
      allowedKinds: preset === "wav_mix" ? ["audio", "compose"] : ["compose", "video", "videoShot", "video-clip"],
      nodeId: input.outputNodeId,
      operation: "时间线渲染",
      projectId,
      projects: ports.projects
    });
    const timeline = await ports.projects.getTimeline(projectId, timelineId);
    const timelineLineageHash = cinematicTimelineLineageHash(timeline);
    if (
      input.timelineLineageHash
      && input.timelineLineageHash !== timelineLineageHash
    ) {
      throw new UnuTvError(
        "render_timeline_lineage_mismatch",
        "提交渲染时的时间线 lineage hash 已过期。",
        409,
        {
          actualTimelineLineageHash: timelineLineageHash,
          expectedTimelineLineageHash: input.timelineLineageHash,
          timelineId
        }
      );
    }
    const timestamp = nowIso();
    const job = assertRenderJob({
      id: createId("render-job"), projectId, timelineId, outputNodeId: outputNode.id, preset, status: "queued", progress: 0,
      renderGraph: {
        ...compileRenderGraph(timeline, preset),
        canvasOutputNodeId: outputNode.id,
        timelineLineageHash,
        timelineRevision: timeline.revision ?? null,
        timelineUpdatedAt: timeline.updatedAt ?? null
      },
      outputPath: null, outputMediaId: null, error: null, idempotencyKey: input.idempotencyKey ?? input.operationContext?.idempotencyKey ?? null,
      createdAt: timestamp, updatedAt: timestamp, startedAt: null, completedAt: null
    });
    const saved = await createRecord(projectId, job);
    if (saved.id === job.id && saved.status === "queued") launch(projectId, saved);
    return saved;
  }

  async function getRenderJob(input = {}) {
    const job = await getRecord(
      requireText(input.projectId, "projectId"),
      requireText(input.renderJobId, "renderJobId"),
      input.includeStale === true
    );
    if (!job) throw new UnuTvError("render_job_not_found", "Render job not found", 404);
    return job;
  }
  async function listRenderJobs(input = {}) {
    return listRecords(
      requireText(input.projectId, "projectId"),
      input.timelineId ?? null,
      input.includeStale === true
    );
  }
  async function getTechnicalQcReport(input = {}) {
    const report = await getQcReport(
      requireText(input.projectId, "projectId"),
      requireText(input.renderJobId, "renderJobId"),
      input.includeStale === true
    );
    if (!report) throw new UnuTvError("technical_qc_not_found", "Technical QC report not found", 404);
    return report;
  }
  async function cancelRenderJob(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const job = await getRenderJob(input);
    if (!["queued", "running"].includes(job.status)) return job;
    ports.render.cancel(job.id);
    const timestamp = nowIso();
    return updateRecord(projectId, { ...job, status: "cancelled", updatedAt: timestamp, completedAt: timestamp, error: null });
  }
  async function resumeRenderJob(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const job = await getRenderJob(input);
    if (!["failed", "cancelled"].includes(job.status)) throw new UnuTvError("render_not_resumable", "Only failed or cancelled render jobs can resume", 409);
    const queued = await updateRecord(projectId, { ...job, status: "queued", progress: 0, error: null, outputPath: null, outputMediaId: null, updatedAt: nowIso(), startedAt: null, completedAt: null });
    launch(projectId, queued);
    return queued;
  }

  async function recoverRenderJobs(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const pending = (await listRecords(projectId, null)).filter((job) => ["queued", "running"].includes(job.status));
    for (const job of pending) {
      const queued = job.status === "queued" ? job : await updateRecord(projectId, { ...job, status: "queued", progress: 0, error: null, updatedAt: nowIso(), startedAt: null, completedAt: null });
      launch(projectId, queued);
    }
    return { recovered: pending.length, renderJobIds: pending.map((job) => job.id) };
  }

  async function createDeliveryPackage(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const renderJobId = requireText(input.renderJobId, "renderJobId");
    const job = await getRenderJob({ projectId, renderJobId });
    if (job.status !== "succeeded") throw new UnuTvError("render_not_complete", "A successful render is required before packaging delivery", 409);
    if (job.preset !== "h264_vertical") {
      throw new UnuTvError(
        "delivery_render_preset_required",
        "Final delivery requires the locked h264_vertical preset; review, square, H.265, ProRes and WAV renders remain non-delivery artifacts.",
        409,
        { actualPreset: job.preset, requiredPreset: "h264_vertical" }
      );
    }
    const [qc, master] = await Promise.all([getQcReport(projectId, renderJobId), getMaster(projectId, renderJobId)]);
    if (!qc || !master) throw new UnuTvError("render_delivery_lineage_missing", "Export master or technical QC lineage is missing", 409);
    if (qc.status === "fail") throw new UnuTvError("delivery_qc_failed", "Technical QC failed; delivery packaging is blocked", 409, { reportId: qc.id });
    if (qc.status === "warning" && input.acceptWarnings !== true) throw new UnuTvError("delivery_qc_warning_approval_required", "Technical QC warnings require explicit owner acceptance", 409, { reportId: qc.id });
    const kind = "delivery";
    const status = "delivery_ready";
    const sidecars = Object.entries(master.lineage?.sidecars ?? {}).map(([role, value]) => ({
      role,
      pathOrMediaId: typeof value === "object" && value ? String(value.path) : String(value),
      checksum: typeof value === "object" && value ? value.checksum ?? null : null
    }));
    const manifest = assertDeliveryPackageManifestV1({
      version: "delivery_package_manifest_v1",
      id: createId("delivery-package"),
      projectId,
      timelineId: job.timelineId,
      renderJobId,
      exportMasterId: master.id,
      mediaId: master.mediaId,
      checksum: master.checksum,
      preset: job.preset,
      kind,
      status,
      deliverables: [{ role: "primary_master", pathOrMediaId: master.mediaId, checksum: master.checksum }, ...sidecars],
      qualityControl: { reportId: qc.id, status: qc.status, warningsAccepted: qc.status === "warning" && input.acceptWarnings === true },
      lineage: { renderGraph: master.lineage?.renderGraph ?? job.renderGraph, exportMaster: master, technicalQcReportId: qc.id },
      createdAt: nowIso()
    });
    return savePackage(projectId, manifest);
  }

  async function getDeliveryPackage(input = {}) {
    const manifest = await getPackage(
      requireText(input.projectId, "projectId"),
      requireText(input.packageId, "packageId"),
      input.includeStale === true
    );
    if (!manifest) throw new UnuTvError("delivery_package_not_found", "Delivery package not found", 404);
    return manifest;
  }

  async function listDeliveryPackages(input = {}) {
    return listPackages(
      requireText(input.projectId, "projectId"),
      input.renderJobId ?? null,
      input.includeStale === true
    );
  }

  return { cancelRenderJob, createDeliveryPackage, createRenderJob, getDeliveryPackage, getRenderJob, getTechnicalQcReport, listDeliveryPackages, listRenderJobs, recoverRenderJobs, resumeRenderJob };
}
