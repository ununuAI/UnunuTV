export const BUDGET_SCHEMA = `
CREATE TABLE IF NOT EXISTS budget_grants (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL UNIQUE,
  total_limit REAL NOT NULL,
  per_task_limit REAL NOT NULL,
  currency TEXT NOT NULL,
  allowed_providers_json TEXT NOT NULL DEFAULT '[]',
  allowed_models_json TEXT NOT NULL DEFAULT '[]',
  allowed_task_types_json TEXT NOT NULL DEFAULT '[]',
  valid_until TEXT,
  reserved_amount REAL NOT NULL DEFAULT 0,
  consumed_amount REAL NOT NULL DEFAULT 0,
  revision INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS budget_reservations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  grant_id TEXT NOT NULL REFERENCES budget_grants(id) ON DELETE CASCADE,
  automation_run_id TEXT,
  task_id TEXT,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  task_type TEXT NOT NULL,
  amount REAL NOT NULL,
  actual_amount REAL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  consumed_at TEXT,
  released_at TEXT,
  UNIQUE(grant_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_budget_reservations_run ON budget_reservations(automation_run_id, created_at DESC);
`;
