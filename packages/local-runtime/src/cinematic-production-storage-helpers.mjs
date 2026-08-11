import { UnuTvError } from "@ununu/unutv-contracts";
import { runDatabaseTransaction } from "./project-transaction.mjs";

export function parseCinematicStorageValue(value, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  return typeof value === "string" ? JSON.parse(value) : value;
}

export function runCinematicStorageTransaction(database, work) {
  return runDatabaseTransaction(database, work);
}

export function assertCinematicStorageRevision(entity, expected, actual) {
  if (expected !== undefined && Number(expected) !== actual) {
    throw new UnuTvError(
      "revision_conflict",
      `Expected ${entity} revision ${expected}, found ${actual}`,
      409
    );
  }
}

export function readCinematicCurrentVersion(database, table, idColumn, id) {
  return database.prepare(
    `SELECT current_version AS currentVersion FROM ${table} WHERE ${idColumn}=?`
  ).get(id)?.currentVersion;
}

export function hydrateCinematicProduction(database, row) {
  if (!row) return undefined;
  const version = database.prepare(`
    SELECT team_manifest_ids_json, legacy_extensions_json
    FROM cinematic_production_versions WHERE production_id=? AND version=?
  `).get(row.id, row.current_version);
  return {
    productionId: row.id,
    projectType: row.project_type,
    productionMode: row.production_mode,
    storyPacketIds: database.prepare(
      "SELECT id FROM story_packets WHERE production_id=? ORDER BY is_primary DESC, created_at"
    ).all(row.id).map((entry) => entry.id),
    visualBibleId: database.prepare(
      "SELECT id FROM visual_bibles WHERE production_id=? ORDER BY updated_at DESC LIMIT 1"
    ).get(row.id)?.id ?? null,
    shotIds: database.prepare(
      "SELECT id FROM cinematic_shots WHERE production_id=? AND is_active=1 ORDER BY order_index, created_at"
    ).all(row.id).map((entry) => entry.id),
    generationUnitIds: database.prepare(
      "SELECT id FROM generation_units WHERE production_id=? AND is_active=1 ORDER BY created_at"
    ).all(row.id).map((entry) => entry.id),
    assetAuthorityIds: database.prepare(
      "SELECT id FROM cinematic_asset_authorities WHERE production_id=? AND is_active=1 ORDER BY authority_type, created_at"
    ).all(row.id).map((entry) => entry.id),
    teamManifestIds: parseCinematicStorageValue(version?.team_manifest_ids_json, []),
    reviewState: row.review_state,
    revision: row.current_version,
    title: row.title,
    sourceNodeId: row.source_node_id,
    legacyExtensions: parseCinematicStorageValue(version?.legacy_extensions_json, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function readCinematicVersionedJson(
  database,
  { currentTable, id, idColumn = "id", productionId, versionColumn, versionIdColumn, versionTable }
) {
  const row = database.prepare(
    `SELECT * FROM ${currentTable} WHERE ${idColumn}=?${productionId ? " AND production_id=?" : ""}`
  ).get(...(productionId ? [id, productionId] : [id]));
  if (!row) return undefined;
  const version = database.prepare(
    `SELECT ${versionColumn} AS payload FROM ${versionTable} WHERE ${versionIdColumn}=? AND version=?`
  ).get(id, row.current_version);
  return parseCinematicStorageValue(version?.payload, undefined);
}
