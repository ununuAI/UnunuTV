export const TIMELINE_SCHEMA = `
CREATE TABLE IF NOT EXISTS timelines (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS timeline_settings (
  timeline_id TEXT PRIMARY KEY REFERENCES timelines(id) ON DELETE CASCADE,
  frame_rate INTEGER NOT NULL DEFAULT 30,
  width INTEGER NOT NULL DEFAULT 1920,
  height INTEGER NOT NULL DEFAULT 1080,
  color_space TEXT NOT NULL DEFAULT 'Rec.709',
  payload_json TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS timeline_tracks (
  id TEXT PRIMARY KEY,
  timeline_id TEXT NOT NULL REFERENCES timelines(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  order_index INTEGER NOT NULL,
  locked INTEGER NOT NULL DEFAULT 0,
  visible INTEGER NOT NULL DEFAULT 1,
  muted INTEGER NOT NULL DEFAULT 0,
  solo INTEGER NOT NULL DEFAULT 0,
  color TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_timeline_tracks ON timeline_tracks(timeline_id, order_index);
CREATE TABLE IF NOT EXISTS timeline_clips (
  id TEXT PRIMARY KEY,
  timeline_id TEXT NOT NULL REFERENCES timelines(id) ON DELETE CASCADE,
  node_id TEXT,
  media_id TEXT,
  track INTEGER NOT NULL,
  start_ms INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  trim_in_ms INTEGER NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_timeline_clips ON timeline_clips(timeline_id, track, start_ms);
CREATE TABLE IF NOT EXISTS timeline_transitions (
  id TEXT PRIMARY KEY,
  timeline_id TEXT NOT NULL REFERENCES timelines(id) ON DELETE CASCADE,
  track_id TEXT REFERENCES timeline_tracks(id) ON DELETE CASCADE,
  from_clip_id TEXT REFERENCES timeline_clips(id) ON DELETE CASCADE,
  to_clip_id TEXT REFERENCES timeline_clips(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS timeline_markers (
  id TEXT PRIMARY KEY,
  timeline_id TEXT NOT NULL REFERENCES timelines(id) ON DELETE CASCADE,
  time_ms INTEGER NOT NULL,
  title TEXT NOT NULL,
  color TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS timeline_keyframes (
  id TEXT PRIMARY KEY,
  timeline_id TEXT NOT NULL REFERENCES timelines(id) ON DELETE CASCADE,
  clip_id TEXT NOT NULL REFERENCES timeline_clips(id) ON DELETE CASCADE,
  property_path TEXT NOT NULL,
  time_ms INTEGER NOT NULL,
  value_json TEXT NOT NULL,
  easing TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS timeline_effects (
  id TEXT PRIMARY KEY,
  timeline_id TEXT NOT NULL REFERENCES timelines(id) ON DELETE CASCADE,
  clip_id TEXT NOT NULL REFERENCES timeline_clips(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  order_index INTEGER NOT NULL,
  parameters_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_timeline_effects_clip ON timeline_effects(clip_id, order_index);
CREATE TABLE IF NOT EXISTS timeline_commands (
  id TEXT PRIMARY KEY,
  timeline_id TEXT NOT NULL REFERENCES timelines(id) ON DELETE CASCADE,
  command_type TEXT NOT NULL,
  before_json TEXT NOT NULL,
  after_json TEXT NOT NULL,
  status TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  automation_run_id TEXT,
  idempotency_key TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_timeline_commands ON timeline_commands(timeline_id, created_at DESC);
CREATE TABLE IF NOT EXISTS timeline_resource_commands (
  id TEXT PRIMARY KEY,
  timeline_id TEXT NOT NULL REFERENCES timelines(id) ON DELETE CASCADE,
  command_type TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  before_json TEXT NOT NULL,
  after_json TEXT NOT NULL,
  status TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  automation_run_id TEXT,
  idempotency_key TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_timeline_resource_commands ON timeline_resource_commands(timeline_id, updated_at DESC);
`;
