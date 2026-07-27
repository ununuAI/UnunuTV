export const CINEMATIC_SEQUENCE_WORKSPACE_SCHEMA = `
CREATE TABLE IF NOT EXISTS cinematic_sequence_previs (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES cinematic_productions(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  current_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cinematic_sequence_previs_production ON cinematic_sequence_previs(production_id, updated_at DESC);
CREATE TABLE IF NOT EXISTS cinematic_sequence_previs_versions (
  sequence_previs_id TEXT NOT NULL REFERENCES cinematic_sequence_previs(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(sequence_previs_id, version)
);
CREATE TABLE IF NOT EXISTS cinematic_visual_context_bundles (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES cinematic_productions(id) ON DELETE CASCADE,
  sequence_previs_id TEXT NOT NULL REFERENCES cinematic_sequence_previs(id) ON DELETE CASCADE,
  shot_id TEXT NOT NULL REFERENCES cinematic_shots(id) ON DELETE CASCADE,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cinematic_visual_context_bundles_shot ON cinematic_visual_context_bundles(production_id, shot_id, created_at DESC);
CREATE TABLE IF NOT EXISTS cinematic_visual_take_memories (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES cinematic_productions(id) ON DELETE CASCADE,
  generation_unit_id TEXT NOT NULL REFERENCES generation_units(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  media_id TEXT NOT NULL REFERENCES media(id),
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cinematic_visual_take_memories_unit ON cinematic_visual_take_memories(production_id, generation_unit_id, created_at DESC);
CREATE TABLE IF NOT EXISTS cinematic_creative_decision_traces (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES cinematic_productions(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  action TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cinematic_creative_decision_traces_target ON cinematic_creative_decision_traces(production_id, target_type, target_id, created_at DESC);
`;
