export const AGENT_AUTOMATION_SCHEMA = `
CREATE TABLE IF NOT EXISTS agent_profiles (
  profile_id TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  display_name TEXT NOT NULL,
  profile_json TEXT NOT NULL,
  workflow_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS automation_tasks (
  id TEXT PRIMARY KEY,
  automation_run_id TEXT NOT NULL REFERENCES automation_runs(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,
  task_key TEXT NOT NULL,
  agent_profile_id TEXT NOT NULL,
  stage TEXT NOT NULL,
  dependencies_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL,
  paid INTEGER NOT NULL DEFAULT 0,
  paid_task_type TEXT,
  budget_reservation_id TEXT REFERENCES budget_reservations(id),
  worker_lease_id TEXT,
  heartbeat_at TEXT,
  lease_expires_at TEXT,
  input_json TEXT NOT NULL DEFAULT '{}',
  output_json TEXT,
  error_json TEXT,
  attempt INTEGER NOT NULL DEFAULT 0,
  order_index INTEGER NOT NULL,
  idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  UNIQUE(automation_run_id, task_key),
  UNIQUE(automation_run_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_automation_tasks_run ON automation_tasks(automation_run_id, order_index);
CREATE TABLE IF NOT EXISTS automation_task_activities (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  automation_run_id TEXT NOT NULL REFERENCES automation_runs(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL REFERENCES automation_tasks(id) ON DELETE CASCADE,
  agent_profile_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  progress REAL,
  current_unit INTEGER,
  total_units INTEGER,
  artifact_refs_json TEXT NOT NULL DEFAULT '[]',
  details_json TEXT NOT NULL DEFAULT '{}',
  idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(task_id, sequence),
  UNIQUE(task_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_automation_task_activities_run ON automation_task_activities(automation_run_id, created_at, sequence);
`;
