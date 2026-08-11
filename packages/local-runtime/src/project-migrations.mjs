import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { imageGenerationStarterPrompt, nowIso } from "@ununu/unutv-contracts";
import { mapLegacyShortDramaProductionVersion } from "@ununu/unutv-core";
import { readNodePrompt, writeNodePrompt } from "./node-prompt-store.mjs";
import { applyStoryboardBatchLineageMigration } from "./storyboard-batch-lineage-migration.mjs";
export const NODE_SIZE_V2_MIGRATION = "20260718-node-size-v2";
export const IMAGE_TEMPLATE_PROMPT_V1_MIGRATION = "20260719-image-template-prompt-v1";
export const CINEMATIC_PRODUCTION_V2_MIGRATION = "20260719-cinematic-production-v2-hard-cut";
export const AUTOMATION_LEASE_V1_MIGRATION = "20260720-automation-lease-v1";
export const STORYBOARD_PROVIDER_V1_MIGRATION = "20260720-storyboard-provider-v1";
export const SCREENPLAY_DOCUMENT_V1_MIGRATION = "20260728-screenplay-document-v1";
export const SCREENPLAY_DERIVED_INVALIDATION_V1_MIGRATION = "20260728-screenplay-derived-invalidation-v1";
export const OWNER_REVIEW_EVIDENCE_V1_MIGRATION = "20260728-owner-review-evidence-v2";
export function applyProjectMigrations(database, options = {}) {
  const applied = database.prepare("SELECT id FROM runtime_migrations WHERE id=?").get(NODE_SIZE_V2_MIGRATION);
  const sizeResult = applied ? { applied: false, nodeCount: 0 } : applyNodeSizeMigration(database);
  applyAutomationLeaseMigration(database);
  applyStoryboardProviderMigration(database);
  applyStoryboardBatchLineageMigration(database);
  applyScreenplayDocumentMigration(database);
  applyScreenplayDerivedInvalidationMigration(database);
  applyOwnerReviewEvidenceMigration(database);
  applyImageTemplatePromptMigration(database);
  applyCinematicProductionMigration(database, options);
  return sizeResult;
}

export function applyOwnerReviewEvidenceMigration(database) {
  const applied = database.prepare("SELECT id FROM runtime_migrations WHERE id=?")
    .get(OWNER_REVIEW_EVIDENCE_V1_MIGRATION);
  if (applied) return { applied: false };
  const appliedAt = nowIso();
  database.exec("BEGIN IMMEDIATE");
  try {
    if (!columnExists(database, "reviews", "evidence_json")) {
      database.exec("ALTER TABLE reviews ADD COLUMN evidence_json TEXT");
    }
    if (!columnExists(database, "reviews", "target_revision")) {
      database.exec("ALTER TABLE reviews ADD COLUMN target_revision INTEGER NOT NULL DEFAULT 0");
      database.exec(`
        WITH ranked AS (
          SELECT id, ROW_NUMBER() OVER (PARTITION BY target_type, target_id ORDER BY rowid) AS revision
          FROM reviews
        )
        UPDATE reviews
        SET target_revision=(SELECT revision FROM ranked WHERE ranked.id=reviews.id)
      `);
    }
    database.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_target_revision
      ON reviews(target_type, target_id, target_revision)
    `);
    database.prepare("INSERT INTO runtime_migrations (id, applied_at, payload_json) VALUES (?, ?, ?)")
      .run(OWNER_REVIEW_EVIDENCE_V1_MIGRATION, appliedAt, JSON.stringify({
        columns: ["reviews.evidence_json", "reviews.target_revision"],
        legacyRowsRemainUnverified: true
      }));
    database.prepare("INSERT INTO events (type, entity_id, payload_json, created_at) VALUES (?, NULL, ?, ?)")
      .run("runtime.owner_review_evidence_migration_applied", JSON.stringify({
        id: OWNER_REVIEW_EVIDENCE_V1_MIGRATION,
        legacyRowsRemainUnverified: true
      }), appliedAt);
    database.exec("COMMIT");
    return { applied: true };
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function applyScreenplayDerivedInvalidationMigration(database) {
  const applied = database.prepare("SELECT id FROM runtime_migrations WHERE id=?").get(SCREENPLAY_DERIVED_INVALIDATION_V1_MIGRATION);
  const appliedAt = nowIso();
  const columns = [];
  database.exec("BEGIN IMMEDIATE");
  try {
    for (const [table, column, definition] of [
      ["cinematic_script_breakdowns", "is_active", "INTEGER NOT NULL DEFAULT 1"],
      ["storyboard_documents_v2", "is_active", "INTEGER NOT NULL DEFAULT 1"],
      ["cinematic_sequence_previs", "is_active", "INTEGER NOT NULL DEFAULT 1"],
      ["cinematic_visual_context_bundles", "is_active", "INTEGER NOT NULL DEFAULT 1"],
      ["cinematic_visual_take_memories", "is_active", "INTEGER NOT NULL DEFAULT 1"],
      ["timelines", "is_active", "INTEGER NOT NULL DEFAULT 1"],
      ["timeline_clips", "is_active", "INTEGER NOT NULL DEFAULT 1"],
      ["cinematic_image_prompt_compilations", "is_active", "INTEGER NOT NULL DEFAULT 1"],
      ["professional_contributions", "is_active", "INTEGER NOT NULL DEFAULT 1"],
      ["prompt_compilations", "is_active", "INTEGER NOT NULL DEFAULT 1"],
      ["cinematic_evaluations", "is_active", "INTEGER NOT NULL DEFAULT 1"],
      ["render_jobs", "is_active", "INTEGER NOT NULL DEFAULT 1"],
      ["export_masters", "is_active", "INTEGER NOT NULL DEFAULT 1"],
      ["technical_qc_reports", "is_active", "INTEGER NOT NULL DEFAULT 1"],
      ["delivery_packages", "is_active", "INTEGER NOT NULL DEFAULT 1"]
    ]) {
      if (!tableExists(database, table) || columnExists(database, table, column)) continue;
      database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
      columns.push(`${table}.${column}`);
    }
    database.exec(`
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
        ON cinematic_screenplay_invalidations(
          production_id, source_node_id, screenplay_document_revision DESC
        );
    `);
    if (!applied) {
      database.prepare("INSERT INTO runtime_migrations (id, applied_at, payload_json) VALUES (?, ?, ?)")
        .run(SCREENPLAY_DERIVED_INVALIDATION_V1_MIGRATION, appliedAt, JSON.stringify({
          columns,
          historyTable: "cinematic_screenplay_invalidations"
        }));
      database.prepare("INSERT INTO events (type, entity_id, payload_json, created_at) VALUES (?, NULL, ?, ?)")
        .run(
          "runtime.screenplay_derived_invalidation_migration_applied",
          JSON.stringify({ id: SCREENPLAY_DERIVED_INVALIDATION_V1_MIGRATION, columns }),
          appliedAt
        );
    } else if (columns.length) {
      database.prepare("INSERT INTO events (type, entity_id, payload_json, created_at) VALUES (?, NULL, ?, ?)")
        .run(
          "runtime.screenplay_derived_invalidation_migration_reconciled",
          JSON.stringify({ id: SCREENPLAY_DERIVED_INVALIDATION_V1_MIGRATION, columns }),
          appliedAt
        );
    }
    database.exec("COMMIT");
    return { applied: !applied, columns };
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function applyScreenplayDocumentMigration(database) {
  const applied = database.prepare("SELECT id FROM runtime_migrations WHERE id=?").get(SCREENPLAY_DOCUMENT_V1_MIGRATION);
  if (applied) return { applied: false };
  const appliedAt = nowIso();
  database.exec("BEGIN IMMEDIATE");
  try {
    if (!columnExists(database, "script_documents", "current_screenplay_revision")) {
      database.exec("ALTER TABLE script_documents ADD COLUMN current_screenplay_revision INTEGER NOT NULL DEFAULT 0");
    }
    database.exec(`
      CREATE TABLE IF NOT EXISTS screenplay_document_versions (
        node_id TEXT NOT NULL REFERENCES script_documents(node_id) ON DELETE CASCADE,
        revision INTEGER NOT NULL,
        content_text TEXT NOT NULL,
        content_sha256 TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY(node_id, revision)
      )
    `);
    const legacyDocuments = database.prepare(`
      SELECT d.node_id AS nodeId, n.payload_json AS payloadJson,
        COALESCE(n.updated_at, d.updated_at, ?) AS createdAt
      FROM script_documents d
      JOIN nodes n ON n.id=d.node_id
      WHERE d.current_screenplay_revision=0
    `).all(appliedAt);
    let migratedDocuments = 0;
    for (const row of legacyDocuments) {
      let payload = {};
      try {
        payload = JSON.parse(row.payloadJson || "{}");
      } catch {
        payload = {};
      }
      const content = typeof payload.screenplayDocument?.content === "string"
        ? payload.screenplayDocument.content
        : typeof payload.content === "string"
          ? payload.content
          : "";
      if (!content.trim()) continue;
      const checksum = sha256Text(content);
      database.prepare(`
        INSERT INTO screenplay_document_versions
          (node_id, revision, content_text, content_sha256, created_at)
        VALUES (?, 1, ?, ?, ?)
      `).run(row.nodeId, content, checksum, row.createdAt || appliedAt);
      database.prepare(`
        UPDATE script_documents
        SET current_screenplay_revision=1
        WHERE node_id=?
      `).run(row.nodeId);
      migratedDocuments += 1;
    }
    database.prepare("INSERT INTO runtime_migrations (id, applied_at, payload_json) VALUES (?, ?, ?)")
      .run(SCREENPLAY_DOCUMENT_V1_MIGRATION, appliedAt, JSON.stringify({
        migratedDocuments,
        table: "screenplay_document_versions"
      }));
    database.exec("COMMIT");
    return { applied: true, migratedDocuments };
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function applyStoryboardProviderMigration(database) {
  const applied = database.prepare("SELECT id FROM runtime_migrations WHERE id=?").get(STORYBOARD_PROVIDER_V1_MIGRATION);
  if (applied) return { applied: false };
  const appliedAt = nowIso();
  const columns = [];
  database.exec("BEGIN IMMEDIATE");
  try {
    for (const [column, definition] of [["provider_run_id", "TEXT"], ["budget_reservation_id", "TEXT"]]) {
      if (columnExists(database, "storyboard_batch_items", column)) continue;
      database.exec(`ALTER TABLE storyboard_batch_items ADD COLUMN ${column} ${definition}`);
      columns.push(column);
    }
    database.prepare("INSERT INTO runtime_migrations (id, applied_at, payload_json) VALUES (?, ?, ?)").run(STORYBOARD_PROVIDER_V1_MIGRATION, appliedAt, JSON.stringify({ columns }));
    database.exec("COMMIT");
    return { applied: true, columns };
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function columnExists(database, table, column) {
  return database.prepare(`PRAGMA table_info(${table})`).all().some((entry) => entry.name === column);
}

export function applyAutomationLeaseMigration(database) {
  const applied = database.prepare("SELECT id FROM runtime_migrations WHERE id=?").get(AUTOMATION_LEASE_V1_MIGRATION);
  if (applied) return { applied: false };
  const appliedAt = nowIso();
  const columns = [];
  database.exec("BEGIN IMMEDIATE");
  try {
    for (const [table, column, definition] of [
      ["project_control_sessions", "heartbeat_at", "TEXT"],
      ["project_control_sessions", "lease_expires_at", "TEXT"],
      ["project_control_sessions", "recovery_count", "INTEGER NOT NULL DEFAULT 0"],
      ["automation_tasks", "worker_lease_id", "TEXT"],
      ["automation_tasks", "heartbeat_at", "TEXT"],
      ["automation_tasks", "lease_expires_at", "TEXT"]
    ]) {
      if (columnExists(database, table, column)) continue;
      database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
      columns.push(`${table}.${column}`);
    }
    database.prepare("INSERT INTO runtime_migrations (id, applied_at, payload_json) VALUES (?, ?, ?)")
      .run(AUTOMATION_LEASE_V1_MIGRATION, appliedAt, JSON.stringify({ columns }));
    database.prepare("INSERT INTO events (type, entity_id, payload_json, created_at) VALUES (?, NULL, ?, ?)")
      .run("runtime.automation_lease_migration_applied", JSON.stringify({ id: AUTOMATION_LEASE_V1_MIGRATION, columns }), appliedAt);
    database.exec("COMMIT");
    return { applied: true, columns };
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function tableExists(database, table) {
  return Boolean(database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table));
}

function sha256Text(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sha256File(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function ensureCinematicBackup(database, options, sourceHash, sourceRows) {
  if (!sourceRows || !options.backupDirectory) return null;
  mkdirSync(options.backupDirectory, { recursive: true });
  const projectToken = String(options.projectId ?? "project").replace(/[^a-zA-Z0-9_-]/g, "-");
  const backupPath = path.join(options.backupDirectory, `cinematic-hard-cut-${projectToken}-${sourceHash.slice(0, 12)}.sqlite`);
  if (!existsSync(backupPath)) database.exec(`VACUUM INTO ${sqlString(backupPath)}`);
  chmodSync(backupPath, 0o600);
  return { path: backupPath, sha256: sha256File(backupPath), sourceHash };
}

function currentScriptRows(database, nodeId) {
  if (!tableExists(database, "script_rows") || !tableExists(database, "script_row_versions")) return [];
  return database.prepare(`
    SELECT r.id, v.payload_json
    FROM script_rows r
    JOIN script_row_versions v ON v.row_id=r.id AND v.version=r.current_version
    WHERE r.deleted_at IS NULL AND r.node_id=?
    ORDER BY r.order_index
  `).all(nodeId).map((row) => ({ ...JSON.parse(row.payload_json || "{}"), id: row.id }));
}

function insertMigratedVersion(database, mapped, version, createdAt) {
  const production = mapped.production;
  database.prepare(`
    INSERT INTO cinematic_productions
      (id, project_type, production_mode, title, source_node_id, review_state, current_version, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET project_type=excluded.project_type, production_mode=excluded.production_mode,
      title=excluded.title, source_node_id=excluded.source_node_id, review_state=excluded.review_state,
      current_version=excluded.current_version, updated_at=excluded.updated_at
  `).run(production.productionId, production.projectType, production.productionMode, production.title, production.sourceNodeId,
    production.reviewState, version, production.createdAt || createdAt, production.updatedAt || createdAt);
  database.prepare(`
    INSERT INTO cinematic_production_versions
      (production_id, version, team_manifest_ids_json, legacy_extensions_json, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(production.productionId, version, JSON.stringify(production.teamManifestIds ?? []), JSON.stringify(production.legacyExtensions ?? {}), createdAt);

  const packet = { ...mapped.storyPacket, revision: version };
  database.prepare(`
    INSERT INTO story_packets (id, production_id, current_version, is_primary, created_at, updated_at)
    VALUES (?, ?, ?, 1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET current_version=excluded.current_version, is_primary=1, updated_at=excluded.updated_at
  `).run(packet.storyPacketId, production.productionId, version, production.createdAt || createdAt, createdAt);
  database.prepare("INSERT INTO story_packet_versions (story_packet_id, version, packet_json, created_at) VALUES (?, ?, ?, ?)")
    .run(packet.storyPacketId, version, JSON.stringify(packet), createdAt);

  const bible = { ...mapped.visualBible, revision: version };
  database.prepare(`
    INSERT INTO visual_bibles (id, production_id, current_version, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET current_version=excluded.current_version, updated_at=excluded.updated_at
  `).run(bible.visualBibleId, production.productionId, version, production.createdAt || createdAt, createdAt);
  database.prepare("INSERT INTO visual_bible_versions (visual_bible_id, version, bible_json, created_at) VALUES (?, ?, ?, ?)")
    .run(bible.visualBibleId, version, JSON.stringify(bible), createdAt);

  database.prepare("UPDATE cinematic_shots SET is_active=0 WHERE production_id=?").run(production.productionId);
  for (const shot of mapped.shots) {
    const saved = { ...shot, revision: version };
    database.prepare(`
      INSERT INTO cinematic_shots (id, production_id, order_index, current_version, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET order_index=excluded.order_index, current_version=excluded.current_version,
        is_active=1, updated_at=excluded.updated_at
    `).run(shot.shotId, production.productionId, shot.order, version, production.createdAt || createdAt, createdAt);
    database.prepare("INSERT INTO cinematic_shot_versions (shot_id, version, spec_json, created_at) VALUES (?, ?, ?, ?)")
      .run(shot.shotId, version, JSON.stringify(saved), createdAt);
  }

  database.prepare("UPDATE generation_units SET is_active=0 WHERE production_id=?").run(production.productionId);
  for (const unit of mapped.generationUnits) {
    const saved = { ...unit, revision: version };
    database.prepare(`
      INSERT INTO generation_units (id, production_id, strategy, visual_anchor_policy, current_version, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET strategy=excluded.strategy, visual_anchor_policy=excluded.visual_anchor_policy,
        current_version=excluded.current_version, is_active=1, updated_at=excluded.updated_at
    `).run(unit.generationUnitId, production.productionId, unit.strategy, unit.visualAnchorPolicy, version, production.createdAt || createdAt, createdAt);
    database.prepare("INSERT INTO generation_unit_versions (generation_unit_id, version, spec_json, created_at) VALUES (?, ?, ?, ?)")
      .run(unit.generationUnitId, version, JSON.stringify(saved), createdAt);
    database.prepare("DELETE FROM generation_unit_shots WHERE generation_unit_id=?").run(unit.generationUnitId);
    for (const link of unit.shotLinks) {
      database.prepare(`
        INSERT INTO generation_unit_shots (generation_unit_id, shot_id, order_index, role, transition_json)
        VALUES (?, ?, ?, ?, ?)
      `).run(unit.generationUnitId, link.shotId, link.order, link.role ?? "artistic_shot", JSON.stringify({ cutReason: link.cutReason ?? "", transition: link.transition ?? null }));
    }
  }
}

export function applyCinematicProductionMigration(database, options = {}) {
  const applied = database.prepare("SELECT payload_json FROM runtime_migrations WHERE id=?").get(CINEMATIC_PRODUCTION_V2_MIGRATION);
  if (applied) return { applied: false, ...JSON.parse(applied.payload_json || "{}") };
  const hasLegacyTables = tableExists(database, "short_drama_productions") && tableExists(database, "short_drama_production_versions");
  const legacyVersions = hasLegacyTables ? database.prepare(`
    SELECT p.node_id, p.canvas_id, v.version, v.document_json, v.created_at
    FROM short_drama_productions p
    JOIN short_drama_production_versions v ON v.node_id=p.node_id
    ORDER BY p.node_id, v.version
  `).all() : [];
  const sourceHash = sha256Text(legacyVersions.map((row) => `${row.node_id}\u0000${row.version}\u0000${row.document_json}`).join("\u0001"));
  const backup = ensureCinematicBackup(database, options, sourceHash, legacyVersions.length);
  const scriptRowsByNode = new Map();
  const appliedAt = nowIso();
  const productionIds = new Set();
  let shotVersions = 0;
  let generationUnitVersions = 0;
  database.exec("BEGIN IMMEDIATE");
  try {
    for (const row of legacyVersions) {
      const document = JSON.parse(row.document_json);
      const mapped = mapLegacyShortDramaProductionVersion({
        canvasId: row.canvas_id,
        document,
        nodeId: row.node_id,
        scriptRows: scriptRowsByNode.get(row.node_id) ?? (() => {
          const rows = currentScriptRows(database, row.node_id);
          scriptRowsByNode.set(row.node_id, rows);
          return rows;
        })(),
        version: row.version
      });
      insertMigratedVersion(database, mapped, row.version, row.created_at || appliedAt);
      productionIds.add(mapped.production.productionId);
      shotVersions += mapped.shots.length;
      generationUnitVersions += mapped.generationUnits.length;
    }
    const migratedProductionVersions = Number(database.prepare(`
      SELECT COUNT(*) AS count FROM cinematic_production_versions
      WHERE production_id LIKE 'production-legacy-%'
    `).get().count);
    if (migratedProductionVersions !== legacyVersions.length) {
      throw new Error(`Cinematic migration version count mismatch: expected ${legacyVersions.length}, found ${migratedProductionVersions}`);
    }
    if (hasLegacyTables) {
      database.exec("DROP TABLE short_drama_production_versions; DROP TABLE short_drama_productions;");
    }
    const audit = {
      backup,
      generationUnitVersions,
      legacyProductionVersions: legacyVersions.length,
      migratedProductions: productionIds.size,
      shotVersions,
      sourceHash
    };
    database.prepare("INSERT INTO runtime_migrations (id, applied_at, payload_json) VALUES (?, ?, ?)")
      .run(CINEMATIC_PRODUCTION_V2_MIGRATION, appliedAt, JSON.stringify(audit));
    database.prepare("INSERT INTO events (type, entity_id, payload_json, created_at) VALUES (?, NULL, ?, ?)")
      .run("runtime.cinematic_hard_cut_applied", JSON.stringify({ id: CINEMATIC_PRODUCTION_V2_MIGRATION, ...audit }), appliedAt);
    database.exec("COMMIT");
    return { applied: true, ...audit };
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function applyNodeSizeMigration(database) {
  const nodeCount = Number(database.prepare("SELECT COUNT(*) AS count FROM nodes").get().count);
  const appliedAt = nowIso();
  database.exec("BEGIN IMMEDIATE");
  try {
    database.prepare(`
      UPDATE nodes
      SET width=ROUND(width * 1.3),
          height=ROUND(height * 1.2),
          revision=revision + 1,
          updated_at=?
    `).run(appliedAt);
    database.prepare("INSERT INTO runtime_migrations (id, applied_at, payload_json) VALUES (?, ?, ?)")
      .run(NODE_SIZE_V2_MIGRATION, appliedAt, JSON.stringify({ nodeCount, widthScale: 1.3, heightScale: 1.2 }));
    if (nodeCount > 0) {
      database.prepare("INSERT INTO events (type, entity_id, payload_json, created_at) VALUES (?, NULL, ?, ?)")
        .run("runtime.migration_applied", JSON.stringify({ id: NODE_SIZE_V2_MIGRATION, nodeCount, widthScale: 1.3, heightScale: 1.2 }), appliedAt);
    }
    database.exec("COMMIT");
    return { applied: true, nodeCount };
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function applyImageTemplatePromptMigration(database) {
  const applied = database.prepare("SELECT id FROM runtime_migrations WHERE id=?").get(IMAGE_TEMPLATE_PROMPT_V1_MIGRATION);
  if (applied) return;
  const rows = database.prepare("SELECT id, payload_json FROM nodes WHERE kind='image'").all();
  const appliedAt = nowIso();
  let nodeCount = 0;
  database.exec("BEGIN IMMEDIATE");
  try {
    for (const row of rows) {
      const payload = JSON.parse(row.payload_json || "{}");
      const starterPrompt = imageGenerationStarterPrompt(payload.imageNodeType);
      if (!starterPrompt || payload.prompt?.trim()) continue;
      const existingPrompt = readNodePrompt(database, row.id);
      const text = existingPrompt?.text?.trim() || starterPrompt;
      database.prepare("UPDATE nodes SET payload_json=?, revision=revision+1, updated_at=? WHERE id=?")
        .run(JSON.stringify({ ...payload, prompt: text }), appliedAt, row.id);
      if (!existingPrompt?.text?.trim()) {
        writeNodePrompt(database, {
          nodeId: row.id, text, provider: existingPrompt?.provider ?? null, modelId: existingPrompt?.modelId ?? null,
          mode: existingPrompt?.mode ?? null, parameters: existingPrompt?.parameters ?? {}, referenceNodeIds: payload.refs ?? [],
          referenceMediaIds: payload.referenceMediaIds ?? [], updatedAt: appliedAt
        });
      }
      nodeCount += 1;
    }
    database.prepare("INSERT INTO runtime_migrations (id, applied_at, payload_json) VALUES (?, ?, ?)")
      .run(IMAGE_TEMPLATE_PROMPT_V1_MIGRATION, appliedAt, JSON.stringify({ nodeCount }));
    if (nodeCount > 0) database.prepare("INSERT INTO events (type, entity_id, payload_json, created_at) VALUES (?, NULL, ?, ?)")
      .run("runtime.migration_applied", JSON.stringify({ id: IMAGE_TEMPLATE_PROMPT_V1_MIGRATION, nodeCount }), appliedAt);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}
