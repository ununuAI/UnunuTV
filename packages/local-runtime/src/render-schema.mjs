export const RENDER_SCHEMA = `
CREATE TABLE IF NOT EXISTS render_jobs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  timeline_id TEXT NOT NULL REFERENCES timelines(id) ON DELETE CASCADE,
  preset TEXT NOT NULL,
  status TEXT NOT NULL,
  progress REAL NOT NULL DEFAULT 0,
  render_graph_json TEXT NOT NULL,
  output_path TEXT,
  output_media_id TEXT,
  error_json TEXT,
  idempotency_key TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  UNIQUE(project_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_render_jobs_timeline ON render_jobs(timeline_id, created_at DESC);
CREATE TABLE IF NOT EXISTS export_masters (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  timeline_id TEXT NOT NULL REFERENCES timelines(id) ON DELETE CASCADE,
  render_job_id TEXT NOT NULL REFERENCES render_jobs(id) ON DELETE CASCADE,
  media_id TEXT NOT NULL,
  preset TEXT NOT NULL,
  checksum TEXT NOT NULL,
  lineage_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS technical_qc_reports (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  render_job_id TEXT NOT NULL REFERENCES render_jobs(id) ON DELETE CASCADE,
  media_id TEXT NOT NULL,
  status TEXT NOT NULL,
  report_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_technical_qc_render ON technical_qc_reports(render_job_id, created_at DESC);
CREATE TABLE IF NOT EXISTS delivery_packages (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  timeline_id TEXT NOT NULL REFERENCES timelines(id) ON DELETE CASCADE,
  render_job_id TEXT NOT NULL REFERENCES render_jobs(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  manifest_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(project_id, render_job_id, kind)
);
CREATE INDEX IF NOT EXISTS idx_delivery_packages_timeline ON delivery_packages(timeline_id, created_at DESC);
`;
