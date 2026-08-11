import { runDatabaseTransaction } from "./project-transaction.mjs";

const parse = (value, fallback) => value ? JSON.parse(value) : fallback;

function renderRow(row) {
  if (!row) return undefined;
  const renderGraph = parse(row.render_graph_json, {});
  return {
    id: row.id, projectId: row.project_id, timelineId: row.timeline_id, preset: row.preset, status: row.status, progress: row.progress,
    outputNodeId: renderGraph.canvasOutputNodeId ?? null,
    renderGraph, outputPath: row.output_path, outputMediaId: row.output_media_id, error: parse(row.error_json, null),
    idempotencyKey: row.idempotency_key, createdAt: row.created_at, updatedAt: row.updated_at, startedAt: row.started_at, completedAt: row.completed_at
  };
}

export function attachProjectRenderMethods(prototype, emitEvent) {
  prototype.createRenderJob = function createRenderJob(projectId, job) {
    const database = this.database(projectId);
    if (job.idempotencyKey) {
      const existing = renderRow(database.prepare("SELECT * FROM render_jobs WHERE project_id=? AND idempotency_key=?").get(projectId, job.idempotencyKey));
      if (existing) return existing;
    }
    database.prepare(`
      INSERT INTO render_jobs (id, project_id, timeline_id, preset, status, progress, render_graph_json, output_path, output_media_id, error_json, idempotency_key, created_at, updated_at, started_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(job.id, projectId, job.timelineId, job.preset, job.status, job.progress, JSON.stringify(job.renderGraph), job.outputPath, job.outputMediaId, null, job.idempotencyKey, job.createdAt, job.updatedAt, job.startedAt, job.completedAt);
    emitEvent(database, "render.job_created", job.id, { timelineId: job.timelineId, outputNodeId: job.outputNodeId, preset: job.preset });
    return job;
  };
  prototype.updateRenderJob = function updateRenderJob(projectId, job) {
    const database = this.database(projectId);
    database.prepare("UPDATE render_jobs SET status=?, progress=?, output_path=?, output_media_id=?, error_json=?, updated_at=?, started_at=?, completed_at=? WHERE id=?")
      .run(job.status, job.progress, job.outputPath, job.outputMediaId, job.error === null ? null : JSON.stringify(job.error), job.updatedAt, job.startedAt, job.completedAt, job.id);
    emitEvent(database, "render.job_changed", job.id, { status: job.status, progress: job.progress });
    return renderRow(database.prepare("SELECT * FROM render_jobs WHERE id=?").get(job.id));
  };
  prototype.commitRenderCompletion = function commitRenderCompletion(projectId, {
    expectedTimelineLineageHash,
    expectedTimelineUpdatedAt,
    job,
    master,
    media,
    qcReport
  }) {
    const database = this.database(projectId);
    return runDatabaseTransaction(database, () => {
      const liveRow = database.prepare(`
        SELECT * FROM render_jobs
        WHERE id=? AND project_id=? AND is_active=1 AND status='running'
      `).get(job.id, projectId);
      const live = renderRow(liveRow);
      const timeline = database.prepare(`
        SELECT id, updated_at AS updatedAt
        FROM timelines
        WHERE id=? AND is_active=1
      `).get(job.timelineId);
      if (
        !live
        || !timeline
        || live.timelineId !== job.timelineId
        || live.renderGraph?.timelineLineageHash !== expectedTimelineLineageHash
        || timeline.updatedAt !== expectedTimelineUpdatedAt
      ) {
        return {
          committed: false,
          reason: !live
            ? "render_job_inactive"
            : (!timeline ? "render_timeline_inactive" : "render_timeline_lineage_changed")
        };
      }
      const nodeRow = database.prepare(`
        SELECT id, canvas_id AS canvasId, payload_json AS payloadJson
        FROM nodes
        WHERE id=?
      `).get(live.outputNodeId);
      const payload = parse(nodeRow?.payloadJson, {});
      if (!nodeRow || payload.invalidated === true || payload.stale === true) {
        return { committed: false, reason: "render_output_node_inactive" };
      }
      const timestamp = job.completedAt;
      const mediaIds = [...new Set([...(Array.isArray(payload.mediaIds) ? payload.mediaIds : []), media.id])];
      database.prepare("UPDATE media SET node_id=? WHERE id=?").run(live.outputNodeId, media.id);
      database.prepare(`
        UPDATE nodes
        SET payload_json=?, revision=revision+1, updated_at=?
        WHERE id=?
      `).run(JSON.stringify({ ...payload, mediaIds, currentMediaId: media.id }), timestamp, live.outputNodeId);
      database.prepare(`
        INSERT INTO technical_qc_reports
          (id, project_id, render_job_id, media_id, status, report_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(qcReport.id, projectId, qcReport.renderJobId, qcReport.mediaId, qcReport.status, JSON.stringify(qcReport), qcReport.createdAt);
      database.prepare(`
        INSERT INTO export_masters
          (id, project_id, timeline_id, render_job_id, media_id, preset, checksum, lineage_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        master.id,
        projectId,
        master.timelineId,
        master.renderJobId,
        master.mediaId,
        master.preset,
        master.checksum,
        JSON.stringify(master.lineage ?? {}),
        master.createdAt
      );
      const changed = database.prepare(`
        UPDATE render_jobs
        SET status=?, progress=?, output_path=?, output_media_id=?, error_json=?,
          updated_at=?, started_at=?, completed_at=?
        WHERE id=? AND project_id=? AND is_active=1 AND status='running'
      `).run(
        job.status,
        job.progress,
        job.outputPath,
        job.outputMediaId,
        null,
        job.updatedAt,
        job.startedAt,
        job.completedAt,
        job.id,
        projectId
      );
      if (Number(changed.changes) !== 1) {
        throw new Error("render completion lost its active-job compare-and-swap");
      }
      database.prepare("UPDATE canvases SET revision=revision+1, updated_at=? WHERE id=?")
        .run(timestamp, nodeRow.canvasId);
      emitEvent(database, "media.imported", media.id, { nodeId: live.outputNodeId, kind: media.kind });
      emitEvent(database, "render.qc_completed", qcReport.id, { renderJobId: qcReport.renderJobId, status: qcReport.status });
      emitEvent(database, "export.master_created", master.id, { timelineId: master.timelineId, renderJobId: master.renderJobId, mediaId: master.mediaId });
      emitEvent(database, "render.job_changed", job.id, { status: job.status, progress: job.progress });
      return {
        committed: true,
        job: renderRow(database.prepare("SELECT * FROM render_jobs WHERE id=?").get(job.id))
      };
    });
  };
  prototype.getRenderJob = function getRenderJob(projectId, renderJobId, includeInactive = false) {
    return renderRow(this.database(projectId).prepare(`
      SELECT * FROM render_jobs WHERE id=? ${includeInactive ? "" : "AND is_active=1"}
    `).get(renderJobId));
  };
  prototype.listRenderJobs = function listRenderJobs(projectId, timelineId = null, includeInactive = false) {
    const database = this.database(projectId);
    const rows = timelineId
      ? database.prepare(`SELECT * FROM render_jobs WHERE timeline_id=? ${includeInactive ? "" : "AND is_active=1"} ORDER BY created_at DESC`).all(timelineId)
      : database.prepare(`SELECT * FROM render_jobs ${includeInactive ? "" : "WHERE is_active=1"} ORDER BY created_at DESC`).all();
    return rows.map(renderRow);
  };
  prototype.saveExportMaster = function saveExportMaster(projectId, master) {
    const database = this.database(projectId);
    database.prepare("INSERT INTO export_masters (id, project_id, timeline_id, render_job_id, media_id, preset, checksum, lineage_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(master.id, projectId, master.timelineId, master.renderJobId, master.mediaId, master.preset, master.checksum, JSON.stringify(master.lineage ?? {}), master.createdAt);
    emitEvent(database, "export.master_created", master.id, { timelineId: master.timelineId, renderJobId: master.renderJobId, mediaId: master.mediaId });
    return master;
  };
  prototype.getExportMasterByRenderJob = function getExportMasterByRenderJob(projectId, renderJobId, includeInactive = false) {
    const row = this.database(projectId).prepare(`
      SELECT id, project_id AS projectId, timeline_id AS timelineId, render_job_id AS renderJobId,
        media_id AS mediaId, preset, checksum, lineage_json, created_at AS createdAt
      FROM export_masters WHERE render_job_id=?
        ${includeInactive ? "" : "AND is_active=1"}
      ORDER BY created_at DESC LIMIT 1
    `).get(renderJobId);
    return row ? { ...row, lineage: parse(row.lineage_json, {}) } : undefined;
  };
  prototype.saveTechnicalQcReport = function saveTechnicalQcReport(projectId, report) {
    const database = this.database(projectId);
    database.prepare("INSERT INTO technical_qc_reports (id, project_id, render_job_id, media_id, status, report_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(report.id, projectId, report.renderJobId, report.mediaId, report.status, JSON.stringify(report), report.createdAt);
    emitEvent(database, "render.qc_completed", report.id, { renderJobId: report.renderJobId, status: report.status });
    return report;
  };
  prototype.getTechnicalQcReport = function getTechnicalQcReport(projectId, renderJobId, includeInactive = false) {
    const row = this.database(projectId).prepare(`
      SELECT report_json FROM technical_qc_reports WHERE render_job_id=?
        ${includeInactive ? "" : "AND is_active=1"}
      ORDER BY created_at DESC LIMIT 1
    `).get(renderJobId);
    return row ? JSON.parse(row.report_json) : undefined;
  };
  prototype.saveDeliveryPackage = function saveDeliveryPackage(projectId, manifest) {
    const database = this.database(projectId);
    const existing = database.prepare("SELECT manifest_json FROM delivery_packages WHERE project_id=? AND render_job_id=? AND kind=?")
      .get(projectId, manifest.renderJobId, manifest.kind);
    if (existing) return JSON.parse(existing.manifest_json);
    database.prepare(`
      INSERT INTO delivery_packages (id, project_id, timeline_id, render_job_id, kind, status, manifest_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(manifest.id, projectId, manifest.timelineId, manifest.renderJobId, manifest.kind, manifest.status, JSON.stringify(manifest), manifest.createdAt);
    emitEvent(database, "delivery.package_created", manifest.id, { renderJobId: manifest.renderJobId, kind: manifest.kind, status: manifest.status });
    return manifest;
  };
  prototype.getDeliveryPackage = function getDeliveryPackage(projectId, packageId, includeInactive = false) {
    const row = this.database(projectId).prepare(`
      SELECT manifest_json FROM delivery_packages
      WHERE id=? ${includeInactive ? "" : "AND is_active=1"}
    `).get(packageId);
    return row ? JSON.parse(row.manifest_json) : undefined;
  };
  prototype.listDeliveryPackages = function listDeliveryPackages(projectId, renderJobId = null, includeInactive = false) {
    const database = this.database(projectId);
    const rows = renderJobId
      ? database.prepare(`SELECT manifest_json FROM delivery_packages WHERE render_job_id=? ${includeInactive ? "" : "AND is_active=1"} ORDER BY created_at DESC`).all(renderJobId)
      : database.prepare(`SELECT manifest_json FROM delivery_packages ${includeInactive ? "" : "WHERE is_active=1"} ORDER BY created_at DESC`).all();
    return rows.map((row) => JSON.parse(row.manifest_json));
  };
}
