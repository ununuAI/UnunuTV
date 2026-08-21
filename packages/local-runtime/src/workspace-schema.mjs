export const WORKSPACE_SETTINGS_SCHEMA = `
CREATE TABLE IF NOT EXISTS workspace_settings (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  root_path TEXT NOT NULL,
  initialized_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

export const PROJECT_LOCATIONS_SCHEMA = `
CREATE TABLE IF NOT EXISTS project_locations (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  media_root TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;
