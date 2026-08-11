import { nowIso } from "@ununu/unutv-contracts";

export const STORYBOARD_BATCH_LINEAGE_V1_MIGRATION = "20260728-storyboard-batch-source-lineage-v1";

function columnExists(database, table, column) {
  return database.prepare(`PRAGMA table_info(${table})`).all().some((entry) => entry.name === column);
}

export function applyStoryboardBatchLineageMigration(database) {
  if (database.prepare("SELECT id FROM runtime_migrations WHERE id=?").get(STORYBOARD_BATCH_LINEAGE_V1_MIGRATION)) return { applied: false };
  const appliedAt = nowIso();
  const columns = [];
  database.exec("BEGIN IMMEDIATE");
  try {
    for (const [table, column] of [
      ["storyboard_batch_jobs", "source_lineage_json"],
      ["storyboard_batch_jobs", "current_source_lineage_json"],
      ["storyboard_batch_items", "source_lineage_json"]
    ]) {
      if (columnExists(database, table, column)) continue;
      database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} TEXT`);
      columns.push(`${table}.${column}`);
    }
    database.prepare("INSERT INTO runtime_migrations (id, applied_at, payload_json) VALUES (?, ?, ?)")
      .run(STORYBOARD_BATCH_LINEAGE_V1_MIGRATION, appliedAt, JSON.stringify({
        columns,
        legacyBatchesRemainUnbound: true
      }));
    database.exec("COMMIT");
    return { applied: true, columns };
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}
