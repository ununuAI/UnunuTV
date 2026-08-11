import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  SCREENPLAY_DERIVED_INVALIDATION_V1_MIGRATION,
  applyScreenplayDerivedInvalidationMigration
} from "../packages/local-runtime/src/project-migrations.mjs";

test("an applied invalidation migration reconciles derived tables added later", () => {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE runtime_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL,
      payload_json TEXT NOT NULL
    );
    CREATE TABLE events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      entity_id TEXT,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE nodes (id TEXT PRIMARY KEY);
    CREATE TABLE cinematic_productions (id TEXT PRIMARY KEY);
    CREATE TABLE timelines (id TEXT PRIMARY KEY);
    CREATE TABLE render_jobs (id TEXT PRIMARY KEY);
    INSERT INTO runtime_migrations VALUES (
      '${SCREENPLAY_DERIVED_INVALIDATION_V1_MIGRATION}',
      '2026-07-28T00:00:00.000Z',
      '{}'
    );
  `);
  const first = applyScreenplayDerivedInvalidationMigration(database);
  assert.equal(first.applied, false);
  assert.deepEqual(first.columns.sort(), ["render_jobs.is_active", "timelines.is_active"]);
  for (const table of ["timelines", "render_jobs"]) {
    assert.equal(
      database.prepare(`PRAGMA table_info(${table})`).all().some((column) => column.name === "is_active"),
      true
    );
  }
  assert.equal(
    database.prepare(`
      SELECT COUNT(*) AS count
      FROM events
      WHERE type='runtime.screenplay_derived_invalidation_migration_reconciled'
    `).get().count,
    1
  );
  assert.deepEqual(applyScreenplayDerivedInvalidationMigration(database), {
    applied: false,
    columns: []
  });
  database.close();
});
