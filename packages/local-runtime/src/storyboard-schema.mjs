export const STORYBOARD_SCHEMA = `
CREATE TABLE IF NOT EXISTS storyboard_documents_v2 (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES cinematic_productions(id) ON DELETE CASCADE,
  node_id TEXT REFERENCES nodes(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  current_version INTEGER NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_storyboard_documents_v2_production ON storyboard_documents_v2(production_id, updated_at DESC);
CREATE TABLE IF NOT EXISTS storyboard_document_versions_v2 (
  storyboard_id TEXT NOT NULL REFERENCES storyboard_documents_v2(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  settings_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  PRIMARY KEY(storyboard_id, version)
);
CREATE TABLE IF NOT EXISTS storyboard_shots_v2 (
  id TEXT PRIMARY KEY,
  storyboard_id TEXT NOT NULL REFERENCES storyboard_documents_v2(id) ON DELETE CASCADE,
  shot_id TEXT NOT NULL REFERENCES cinematic_shots(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL,
  status TEXT NOT NULL,
  current_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(storyboard_id, shot_id)
);
CREATE INDEX IF NOT EXISTS idx_storyboard_shots_v2_order ON storyboard_shots_v2(storyboard_id, order_index);
CREATE TABLE IF NOT EXISTS storyboard_shot_versions_v2 (
  storyboard_shot_id TEXT NOT NULL REFERENCES storyboard_shots_v2(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(storyboard_shot_id, version)
);
CREATE TABLE IF NOT EXISTS storyboard_batch_jobs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  production_id TEXT NOT NULL REFERENCES cinematic_productions(id) ON DELETE CASCADE,
  storyboard_id TEXT NOT NULL REFERENCES storyboard_documents_v2(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  approved_paid INTEGER NOT NULL DEFAULT 0,
  provider TEXT,
  model TEXT,
  configuration_json TEXT NOT NULL DEFAULT '{}',
  source_lineage_json TEXT,
  current_source_lineage_json TEXT,
  revision INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  cancelled_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_storyboard_batch_jobs_board ON storyboard_batch_jobs(storyboard_id, created_at DESC);
CREATE TABLE IF NOT EXISTS storyboard_batch_items (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES storyboard_batch_jobs(id) ON DELETE CASCADE,
  storyboard_shot_id TEXT NOT NULL REFERENCES storyboard_shots_v2(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL,
  status TEXT NOT NULL,
  attempt INTEGER NOT NULL DEFAULT 0,
  idempotency_key TEXT NOT NULL,
  provider_run_id TEXT,
  budget_reservation_id TEXT,
  imported_media_id TEXT,
  output_media_id TEXT,
  output_version_id TEXT,
  output_checksum TEXT,
  source_lineage_json TEXT,
  error_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  UNIQUE(job_id, storyboard_shot_id),
  UNIQUE(job_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_storyboard_batch_items_job ON storyboard_batch_items(job_id, order_index);
`;
