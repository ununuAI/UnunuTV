import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  CINEMATIC_PRODUCTION_V2_MIGRATION,
  applyCinematicProductionMigration
} from "../packages/local-runtime/src/project-migrations.mjs";
import { PROJECT_SCHEMA } from "../packages/local-runtime/src/schema.mjs";

function seedLegacyDatabase(database, { malformed = false } = {}) {
  const timestamp = "2026-07-19T00:00:00.000Z";
  database.exec(PROJECT_SCHEMA);
  database.exec(`
    CREATE TABLE short_drama_productions (
      node_id TEXT PRIMARY KEY REFERENCES nodes(id) ON DELETE CASCADE,
      canvas_id TEXT NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
      current_version INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE short_drama_production_versions (
      node_id TEXT NOT NULL REFERENCES short_drama_productions(node_id) ON DELETE CASCADE,
      version INTEGER NOT NULL,
      document_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY(node_id, version)
    );
  `);
  database.prepare("INSERT INTO project_meta (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)").run("project-legacy", "旧项目", timestamp, timestamp);
  database.prepare("INSERT INTO canvases (id, project_id, title, revision, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run("canvas-legacy", "project-legacy", "画布", 1, timestamp, timestamp);
  database.prepare("INSERT INTO nodes (id, canvas_id, kind, title, x, y, width, height, revision, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run("script-legacy", "canvas-legacy", "script", "旧剧本", 0, 0, 468, 396, 1, "{}", timestamp, timestamp);
  database.prepare("INSERT INTO script_documents (node_id, current_revision, updated_at) VALUES (?, ?, ?)").run("script-legacy", 1, timestamp);
  database.prepare("INSERT INTO script_rows (id, node_id, order_index, shot_number, current_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run("row-legacy", "script-legacy", 0, 1, 1, timestamp, timestamp);
  database.prepare("INSERT INTO script_row_versions (row_id, version, payload_json, created_at) VALUES (?, ?, ?, ?)")
    .run("row-legacy", 1, JSON.stringify({
      id: "row-legacy",
      sceneDescription: "雨夜校门口",
      character1: "角色甲",
      dialogueSpeaker: "角色甲",
      dialogue: "你终于来了。",
      camera: "缓慢推近",
      videoPrompt: "旧的手写视频提示词",
      forbiddenContent: ["提前转身"]
    }), timestamp);
  database.prepare("INSERT INTO short_drama_productions (node_id, canvas_id, current_version, updated_at) VALUES (?, ?, ?, ?)")
    .run("script-legacy", "canvas-legacy", 2, timestamp);
  const first = {
    version: "short_drama_production_v1",
    title: "旧项目第一版",
    beats: [{ id: "beat-1", label: "等待" }],
    directorUnits: [{ id: "director-1", storyFunction: "建立等待" }],
    shots: [{ id: "legacy-shot", sourceRowId: "row-legacy", directorUnitId: "director-1", order: 1, openingState: "独自等待", action: "抬眼", endingState: "看见来人", durationSec: 5 }],
    audioCues: [], createdAt: timestamp, updatedAt: timestamp
  };
  const second = {
    ...first,
    title: "旧项目第二版",
    shots: [{ ...first.shots[0], action: "先抬眼，再向前一步", generationSegments: [
      { id: "segment-a", order: 1, durationSec: 4 },
      { id: "segment-b", order: 2, durationSec: 4, continuationMode: "real_tail" }
    ] }]
  };
  database.prepare("INSERT INTO short_drama_production_versions (node_id, version, document_json, created_at) VALUES (?, ?, ?, ?)")
    .run("script-legacy", 1, malformed ? "{" : JSON.stringify(first), timestamp);
  database.prepare("INSERT INTO short_drama_production_versions (node_id, version, document_json, created_at) VALUES (?, ?, ?, ?)")
    .run("script-legacy", 2, JSON.stringify(second), timestamp);
}

test("hard-cut migration is backed up, version-preserving, idempotent, and never promotes legacy Prompt text", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "unutv-cinematic-migration-"));
  const database = new DatabaseSync(path.join(root, "project.sqlite"));
  seedLegacyDatabase(database);
  const result = applyCinematicProductionMigration(database, { backupDirectory: path.join(root, "backups"), projectId: "project-legacy" });
  assert.equal(result.applied, true);
  assert.equal(result.legacyProductionVersions, 2);
  assert.equal(result.migratedProductions, 1);
  assert.ok(existsSync(result.backup.path));
  assert.match(result.backup.sha256, /^[0-9a-f]{64}$/u);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM cinematic_production_versions").get().count, 2);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM cinematic_shot_versions").get().count, 2);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM generation_unit_versions").get().count, 3);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM generation_units WHERE is_active=1").get().count, 2);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name LIKE 'short_drama_%'").get().count, 0);
  const shot = JSON.parse(database.prepare("SELECT spec_json FROM cinematic_shot_versions WHERE version=2").get().spec_json);
  assert.equal(shot.legacyPromptText, "旧的手写视频提示词");
  assert.equal(shot.needsRecompile, true);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM prompt_compilations").get().count, 0);
  const productionVersion = JSON.parse(database.prepare("SELECT legacy_extensions_json FROM cinematic_production_versions WHERE version=2").get().legacy_extensions_json);
  assert.equal(productionVersion.originalDocument.title, "旧项目第二版");
  const second = applyCinematicProductionMigration(database, { backupDirectory: path.join(root, "backups"), projectId: "project-legacy" });
  assert.equal(second.applied, false);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM cinematic_production_versions").get().count, 2);
  assert.equal(database.prepare("SELECT id FROM runtime_migrations WHERE id=?").get(CINEMATIC_PRODUCTION_V2_MIGRATION).id, CINEMATIC_PRODUCTION_V2_MIGRATION);
  database.close();
});

test("any malformed legacy version rolls the entire hard cut back and leaves old tables active", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "unutv-cinematic-migration-fail-"));
  const database = new DatabaseSync(path.join(root, "project.sqlite"));
  seedLegacyDatabase(database, { malformed: true });
  assert.throws(() => applyCinematicProductionMigration(database, { backupDirectory: path.join(root, "backups"), projectId: "project-legacy" }), /JSON/u);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM short_drama_production_versions").get().count, 2);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM cinematic_production_versions").get().count, 0);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM runtime_migrations WHERE id=?").get(CINEMATIC_PRODUCTION_V2_MIGRATION).count, 0);
  database.close();
});
