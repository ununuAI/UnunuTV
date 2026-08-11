import { STORYBOARD_SCHEMA } from "./storyboard-schema.mjs";
import { TIMELINE_SCHEMA } from "./timeline-schema.mjs";
import { BUDGET_SCHEMA } from "./budget-schema.mjs";
import { AGENT_AUTOMATION_SCHEMA } from "./agent-automation-schema.mjs";
import { RENDER_SCHEMA } from "./render-schema.mjs";
import { DIRECTOR_STAGE_SCHEMA } from "./director-stage-schema.mjs";
import { SCRIPT_BREAKDOWN_SCHEMA } from "./script-breakdown-schema.mjs";
import { CINEMATIC_SEQUENCE_WORKSPACE_SCHEMA } from "./cinematic-sequence-workspace-schema.mjs";

export const CATALOG_SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  directory TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_catalog_projects_updated ON projects(updated_at DESC);
CREATE TABLE IF NOT EXISTS global_assets (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  title TEXT NOT NULL,
  owner_project_id TEXT NOT NULL,
  current_version_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS global_asset_versions (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES global_assets(id) ON DELETE CASCADE,
  owner_project_id TEXT NOT NULL,
  media_id TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_global_assets_updated ON global_assets(updated_at DESC);
`;

export const PROJECT_SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS project_meta (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS runtime_migrations (
  id TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS canvases (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS nodes (
  id TEXT PRIMARY KEY,
  canvas_id TEXT NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  x REAL NOT NULL,
  y REAL NOT NULL,
  width REAL NOT NULL,
  height REAL NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_nodes_canvas ON nodes(canvas_id);
CREATE TABLE IF NOT EXISTS node_prompts (
  node_id TEXT PRIMARY KEY REFERENCES nodes(id) ON DELETE CASCADE,
  current_version INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS node_prompt_versions (
  node_id TEXT NOT NULL REFERENCES node_prompts(node_id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  text TEXT NOT NULL,
  provider TEXT,
  model_id TEXT,
  mode TEXT,
  parameters_json TEXT NOT NULL DEFAULT '{}',
  reference_node_ids_json TEXT NOT NULL DEFAULT '[]',
  reference_media_ids_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  PRIMARY KEY(node_id, version)
);
CREATE TABLE IF NOT EXISTS node_prompt_documents (
  node_id TEXT NOT NULL REFERENCES node_prompts(node_id) ON DELETE CASCADE,
  prompt_version INTEGER NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  document_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(node_id, prompt_version)
);
CREATE TABLE IF NOT EXISTS script_documents (
  node_id TEXT PRIMARY KEY REFERENCES nodes(id) ON DELETE CASCADE,
  current_revision INTEGER NOT NULL DEFAULT 0,
  current_screenplay_revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS screenplay_document_versions (
  node_id TEXT NOT NULL REFERENCES script_documents(node_id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  content_text TEXT NOT NULL,
  content_sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(node_id, revision)
);
CREATE TABLE IF NOT EXISTS script_rows (
  id TEXT PRIMARY KEY,
  node_id TEXT NOT NULL REFERENCES script_documents(node_id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL,
  shot_number INTEGER NOT NULL,
  current_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_script_rows_node ON script_rows(node_id, order_index);
CREATE TABLE IF NOT EXISTS script_row_versions (
  row_id TEXT NOT NULL REFERENCES script_rows(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  PRIMARY KEY(row_id, version)
);
CREATE TABLE IF NOT EXISTS edges (
  id TEXT PRIMARY KEY,
  canvas_id TEXT NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
  from_node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  to_node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(canvas_id, from_node_id, to_node_id, role)
);
CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  canvas_id TEXT NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  x REAL NOT NULL,
  y REAL NOT NULL,
  width REAL NOT NULL,
  height REAL NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS group_members (
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  PRIMARY KEY(group_id, node_id)
);
CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY,
  node_id TEXT,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_media_node ON media(node_id);
CREATE TABLE IF NOT EXISTS media_preparations (
  id TEXT PRIMARY KEY,
  media_id TEXT NOT NULL UNIQUE REFERENCES media(id) ON DELETE CASCADE,
  source_checksum TEXT NOT NULL,
  status TEXT NOT NULL,
  probe_json TEXT,
  waveform_json TEXT,
  thumbnail_relative_path TEXT,
  proxy_relative_path TEXT,
  error_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_media_preparations_status ON media_preparations(status, updated_at DESC);
CREATE TABLE IF NOT EXISTS media_publications (
  id TEXT PRIMARY KEY,
  media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  remote_url TEXT NOT NULL,
  status TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_media_publications_media ON media_publications(media_id, created_at DESC);
CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  title TEXT NOT NULL,
  current_version_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS asset_versions (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  media_id TEXT NOT NULL REFERENCES media(id),
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  provider TEXT NOT NULL,
  request_json TEXT NOT NULL,
  result_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  current_version_id TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS artifact_versions (
  id TEXT PRIMARY KEY,
  artifact_id TEXT NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  media_id TEXT REFERENCES media(id),
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS workflow_layers (
  layer TEXT PRIMARY KEY,
  review_state TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  payload_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  state TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  evidence_json TEXT,
  target_revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
${DIRECTOR_STAGE_SCHEMA}
CREATE TABLE IF NOT EXISTS cinematic_productions (
  id TEXT PRIMARY KEY,
  project_type TEXT NOT NULL,
  production_mode TEXT NOT NULL,
  title TEXT NOT NULL,
  source_node_id TEXT REFERENCES nodes(id) ON DELETE SET NULL,
  review_state TEXT NOT NULL,
  current_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cinematic_production_versions (
  production_id TEXT NOT NULL REFERENCES cinematic_productions(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  team_manifest_ids_json TEXT NOT NULL DEFAULT '[]',
  legacy_extensions_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  PRIMARY KEY(production_id, version)
);
CREATE TABLE IF NOT EXISTS story_packets (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES cinematic_productions(id) ON DELETE CASCADE,
  current_version INTEGER NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_story_packets_production ON story_packets(production_id, is_primary DESC, created_at);
CREATE TABLE IF NOT EXISTS story_packet_versions (
  story_packet_id TEXT NOT NULL REFERENCES story_packets(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  packet_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(story_packet_id, version)
);
CREATE TABLE IF NOT EXISTS visual_bibles (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES cinematic_productions(id) ON DELETE CASCADE,
  current_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_visual_bibles_production ON visual_bibles(production_id, updated_at DESC);
CREATE TABLE IF NOT EXISTS visual_bible_versions (
  visual_bible_id TEXT NOT NULL REFERENCES visual_bibles(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  bible_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(visual_bible_id, version)
);
CREATE TABLE IF NOT EXISTS cinematic_asset_authorities (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES cinematic_productions(id) ON DELETE CASCADE,
  authority_type TEXT NOT NULL,
  status TEXT NOT NULL,
  risk_level TEXT NOT NULL,
  current_version INTEGER NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cinematic_asset_authorities_production ON cinematic_asset_authorities(production_id, authority_type, updated_at DESC);
CREATE TABLE IF NOT EXISTS cinematic_asset_authority_versions (
  authority_id TEXT NOT NULL REFERENCES cinematic_asset_authorities(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  authority_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(authority_id, version)
);
CREATE TABLE IF NOT EXISTS cinematic_image_prompt_compilations (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES cinematic_productions(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  compiler_version TEXT NOT NULL,
  manual_override INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  envelope_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cinematic_image_prompt_compilations_target ON cinematic_image_prompt_compilations(production_id, target_type, target_id, created_at DESC);
CREATE TABLE IF NOT EXISTS cinematic_shots (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES cinematic_productions(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL,
  current_version INTEGER NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cinematic_shots_production ON cinematic_shots(production_id, order_index);
CREATE TABLE IF NOT EXISTS cinematic_shot_versions (
  shot_id TEXT NOT NULL REFERENCES cinematic_shots(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  spec_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(shot_id, version)
);
${SCRIPT_BREAKDOWN_SCHEMA}
${STORYBOARD_SCHEMA}
CREATE TABLE IF NOT EXISTS generation_units (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES cinematic_productions(id) ON DELETE CASCADE,
  strategy TEXT NOT NULL,
  visual_anchor_policy TEXT NOT NULL,
  current_version INTEGER NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_generation_units_production ON generation_units(production_id, created_at);
CREATE TABLE IF NOT EXISTS generation_unit_versions (
  generation_unit_id TEXT NOT NULL REFERENCES generation_units(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  spec_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(generation_unit_id, version)
);
CREATE TABLE IF NOT EXISTS generation_unit_shots (
  generation_unit_id TEXT NOT NULL REFERENCES generation_units(id) ON DELETE CASCADE,
  shot_id TEXT NOT NULL REFERENCES cinematic_shots(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL,
  role TEXT NOT NULL DEFAULT 'artistic_shot',
  transition_json TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY(generation_unit_id, shot_id)
);
CREATE INDEX IF NOT EXISTS idx_generation_unit_shots_order ON generation_unit_shots(generation_unit_id, order_index);
CREATE TABLE IF NOT EXISTS reference_bindings (
  id TEXT PRIMARY KEY,
  generation_unit_id TEXT NOT NULL REFERENCES generation_units(id) ON DELETE CASCADE,
  provider_index INTEGER NOT NULL,
  current_version INTEGER NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(generation_unit_id, provider_index)
);
CREATE TABLE IF NOT EXISTS reference_binding_versions (
  reference_binding_id TEXT NOT NULL REFERENCES reference_bindings(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  binding_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(reference_binding_id, version)
);
CREATE TABLE IF NOT EXISTS professional_contributions (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES cinematic_productions(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  contribution_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_professional_contributions_target ON professional_contributions(production_id, target_type, target_id, created_at);
CREATE TABLE IF NOT EXISTS prompt_compilations (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES cinematic_productions(id) ON DELETE CASCADE,
  generation_unit_id TEXT NOT NULL REFERENCES generation_units(id) ON DELETE CASCADE,
  payload_hash TEXT NOT NULL,
  compiler_version TEXT NOT NULL,
  manual_override INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  envelope_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_prompt_compilations_unit ON prompt_compilations(generation_unit_id, created_at DESC);
CREATE TABLE IF NOT EXISTS cinematic_evaluations (
  id TEXT PRIMARY KEY,
  production_id TEXT NOT NULL REFERENCES cinematic_productions(id) ON DELETE CASCADE,
  generation_unit_id TEXT,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  media_id TEXT NOT NULL REFERENCES media(id),
  decision TEXT NOT NULL,
  revision INTEGER NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  evaluation_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cinematic_evaluations_production ON cinematic_evaluations(production_id, created_at DESC);
${CINEMATIC_SEQUENCE_WORKSPACE_SCHEMA}
CREATE TABLE IF NOT EXISTS generation_unit_runs (
  generation_unit_id TEXT NOT NULL REFERENCES generation_units(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  compilation_id TEXT NOT NULL REFERENCES prompt_compilations(id),
  created_at TEXT NOT NULL,
  PRIMARY KEY(generation_unit_id, run_id)
);
CREATE TABLE IF NOT EXISTS panoramas (
  node_id TEXT PRIMARY KEY REFERENCES nodes(id) ON DELETE CASCADE,
  media_id TEXT NOT NULL REFERENCES media(id),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL
);
${TIMELINE_SCHEMA}
${BUDGET_SCHEMA}
CREATE TABLE IF NOT EXISTS automation_runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  status TEXT NOT NULL,
  configuration_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE TABLE IF NOT EXISTS automation_checkpoints (
  id TEXT PRIMARY KEY,
  automation_run_id TEXT NOT NULL REFERENCES automation_runs(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_automation_checkpoints_run ON automation_checkpoints(automation_run_id, created_at DESC);
CREATE TABLE IF NOT EXISTS project_control_sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  state TEXT NOT NULL,
  automation_run_id TEXT NOT NULL REFERENCES automation_runs(id),
  lease_id TEXT,
  heartbeat_at TEXT,
  lease_expires_at TEXT,
  recovery_count INTEGER NOT NULL DEFAULT 0,
  checkpoint_id TEXT REFERENCES automation_checkpoints(id),
  revision INTEGER NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  ended_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_project_control_sessions_current ON project_control_sessions(created_at DESC);
${AGENT_AUTOMATION_SCHEMA}
${RENDER_SCHEMA}
CREATE TABLE IF NOT EXISTS events (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  entity_id TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
`;
