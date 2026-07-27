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
  prototype.getRenderJob = function getRenderJob(projectId, renderJobId) { return renderRow(this.database(projectId).prepare("SELECT * FROM render_jobs WHERE id=?").get(renderJobId)); };
  prototype.listRenderJobs = function listRenderJobs(projectId, timelineId = null) {
    const database = this.database(projectId);
    const rows = timelineId ? database.prepare("SELECT * FROM render_jobs WHERE timeline_id=? ORDER BY created_at DESC").all(timelineId) : database.prepare("SELECT * FROM render_jobs ORDER BY created_at DESC").all();
    return rows.map(renderRow);
  };
  prototype.saveExportMaster = function saveExportMaster(projectId, master) {
    const database = this.database(projectId);
    database.prepare("INSERT INTO export_masters (id, project_id, timeline_id, render_job_id, media_id, preset, checksum, lineage_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(master.id, projectId, master.timelineId, master.renderJobId, master.mediaId, master.preset, master.checksum, JSON.stringify(master.lineage ?? {}), master.createdAt);
    emitEvent(database, "export.master_created", master.id, { timelineId: master.timelineId, renderJobId: master.renderJobId, mediaId: master.mediaId });
    return master;
  };
  prototype.getExportMasterByRenderJob = function getExportMasterByRenderJob(projectId, renderJobId) {
    const row = this.database(projectId).prepare(`
      SELECT id, project_id AS projectId, timeline_id AS timelineId, render_job_id AS renderJobId,
        media_id AS mediaId, preset, checksum, lineage_json, created_at AS createdAt
      FROM export_masters WHERE render_job_id=? ORDER BY created_at DESC LIMIT 1
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
  prototype.getTechnicalQcReport = function getTechnicalQcReport(projectId, renderJobId) {
    const row = this.database(projectId).prepare("SELECT report_json FROM technical_qc_reports WHERE render_job_id=? ORDER BY created_at DESC LIMIT 1").get(renderJobId);
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
  prototype.getDeliveryPackage = function getDeliveryPackage(projectId, packageId) {
    const row = this.database(projectId).prepare("SELECT manifest_json FROM delivery_packages WHERE id=?").get(packageId);
    return row ? JSON.parse(row.manifest_json) : undefined;
  };
  prototype.listDeliveryPackages = function listDeliveryPackages(projectId, renderJobId = null) {
    const database = this.database(projectId);
    const rows = renderJobId
      ? database.prepare("SELECT manifest_json FROM delivery_packages WHERE render_job_id=? ORDER BY created_at DESC").all(renderJobId)
      : database.prepare("SELECT manifest_json FROM delivery_packages ORDER BY created_at DESC").all();
    return rows.map((row) => JSON.parse(row.manifest_json));
  };
}
