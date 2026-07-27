export const DIRECTOR_STAGE_SCHEMA = `
CREATE TABLE IF NOT EXISTS director_stages (
  node_id TEXT PRIMARY KEY REFERENCES nodes(id) ON DELETE CASCADE,
  canvas_id TEXT NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
  current_version INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS director_stage_versions (
  node_id TEXT NOT NULL REFERENCES director_stages(node_id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  stage_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(node_id, version)
);
CREATE TABLE IF NOT EXISTS director_stage_command_receipts (
  command_id TEXT PRIMARY KEY,
  node_id TEXT NOT NULL REFERENCES director_stages(node_id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  command_type TEXT NOT NULL,
  base_revision INTEGER NOT NULL,
  result_revision INTEGER NOT NULL,
  command_json TEXT NOT NULL,
  receipt_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(node_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_director_receipts_node_revision
  ON director_stage_command_receipts(node_id, result_revision);
`;
