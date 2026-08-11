export const SCRIPT_BREAKDOWN_SCHEMA = `
CREATE TABLE IF NOT EXISTS cinematic_script_breakdowns (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES cinematic_productions(id) ON DELETE CASCADE,
  source_node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  source_document_revision INTEGER NOT NULL,
  current_version INTEGER NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(production_id, source_node_id)
);
CREATE TABLE IF NOT EXISTS cinematic_script_breakdown_versions (
  breakdown_id TEXT NOT NULL REFERENCES cinematic_script_breakdowns(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  breakdown_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(breakdown_id, version)
);
CREATE TABLE IF NOT EXISTS cinematic_screenplay_invalidations (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES cinematic_productions(id) ON DELETE CASCADE,
  source_node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  screenplay_document_revision INTEGER NOT NULL,
  screenplay_document_checksum TEXT NOT NULL,
  invalidation_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  UNIQUE(production_id, source_node_id, screenplay_document_revision)
);
CREATE INDEX IF NOT EXISTS idx_cinematic_screenplay_invalidations_source
  ON cinematic_screenplay_invalidations(production_id, source_node_id, screenplay_document_revision DESC);
`;
