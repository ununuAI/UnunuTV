import { rmSync } from "node:fs";
import path from "node:path";
import { UnuTvError, nowIso } from "@ununu/unutv-contracts";
import { projectDirectory } from "./paths.mjs";

function transaction(database, work) {
  database.exec("BEGIN IMMEDIATE");
  try {
    const result = work();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function count(database, table, where = "1=1", values = []) {
  return database.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE ${where}`).get(...values).count;
}

function deleteWhere(database, table, where = "1=1", values = []) {
  const result = database.prepare(`DELETE FROM ${table} WHERE ${where}`).run(...values);
  return result.changes;
}

/**
 * Reset the active cinematic layer while preserving the production and its
 * StoryProductionPacket. This is intentionally a durable Core/CLI operation;
 * callers never receive database access and the receipt records the scope.
 */
export function attachCinematicProductionResetMethods(prototype, recordEvent) {
  prototype.resetCinematicProduction = function resetCinematicProduction(projectId, productionId, requestedSourceNodeId = null) {
    const database = this.database(projectId);
    const cleanupPaths = new Set();
    let receipt;
    const timestamp = nowIso();

    receipt = transaction(database, () => {
      const production = database.prepare("SELECT id, source_node_id AS sourceNodeId, current_version AS revision FROM cinematic_productions WHERE id=?").get(productionId);
      if (!production) throw new UnuTvError("cinematic_production_not_found", `Cinematic production not found: ${productionId}`, 404);
      const sourceNodeId = requestedSourceNodeId || production.sourceNodeId;
      if (!sourceNodeId || !database.prepare("SELECT id FROM nodes WHERE id=?").get(sourceNodeId)) {
        throw new UnuTvError("cinematic_story_source_required", "Reset requires the existing story source node so the story is preserved", 409);
      }

      const storyIds = database.prepare("SELECT id FROM story_packets WHERE production_id=?").all(productionId).map((row) => row.id);
      const keepMediaIds = database.prepare("SELECT id FROM media WHERE node_id=?").all(sourceNodeId).map((row) => row.id);
      const keepMediaSql = keepMediaIds.length ? `AND id NOT IN (${keepMediaIds.map(() => "?").join(",")})` : "";
      const keepMediaValues = keepMediaIds.length ? keepMediaIds : [];
      const deleted = {};
      const remove = (table, where, values = []) => { deleted[table] = deleteWhere(database, table, where, values); };

      // Stop and remove old orchestration state before removing its targets.
      remove("project_control_sessions");
      remove("automation_runs", "project_id=?", [projectId]);
      remove("workflow_layers");
      remove("budget_reservations", "project_id=?", [projectId]);
      remove("budget_grants", "project_id=?", [projectId]);

      // Remove all production-facing records while retaining story packets and
      // their complete version history.
      remove("cinematic_evaluations", "production_id=?", [productionId]);
      remove("cinematic_visual_take_memories", "production_id=?", [productionId]);
      remove("generation_unit_runs", "generation_unit_id IN (SELECT id FROM generation_units WHERE production_id=?)", [productionId]);
      remove("reference_binding_versions", "reference_binding_id IN (SELECT id FROM reference_bindings WHERE generation_unit_id IN (SELECT id FROM generation_units WHERE production_id=?))", [productionId]);
      remove("reference_bindings", "generation_unit_id IN (SELECT id FROM generation_units WHERE production_id=?)", [productionId]);
      remove("generation_unit_shots", "generation_unit_id IN (SELECT id FROM generation_units WHERE production_id=?)", [productionId]);
      remove("prompt_compilations", "production_id=?", [productionId]);
      remove("generation_unit_versions", "generation_unit_id IN (SELECT id FROM generation_units WHERE production_id=?)", [productionId]);
      remove("generation_units", "production_id=?", [productionId]);
      remove("cinematic_visual_context_bundles", "production_id=?", [productionId]);
      remove("cinematic_sequence_previs_versions", "sequence_previs_id IN (SELECT id FROM cinematic_sequence_previs WHERE production_id=?)", [productionId]);
      remove("cinematic_sequence_previs", "production_id=?", [productionId]);
      remove("cinematic_creative_decision_traces", "production_id=?", [productionId]);
      remove("storyboard_batch_items", "job_id IN (SELECT id FROM storyboard_batch_jobs WHERE production_id=?)", [productionId]);
      remove("storyboard_batch_jobs", "production_id=?", [productionId]);
      remove("storyboard_shot_versions_v2", "storyboard_shot_id IN (SELECT id FROM storyboard_shots_v2 WHERE storyboard_id IN (SELECT id FROM storyboard_documents_v2 WHERE production_id=?))", [productionId]);
      remove("storyboard_shots_v2", "storyboard_id IN (SELECT id FROM storyboard_documents_v2 WHERE production_id=?)", [productionId]);
      remove("storyboard_document_versions_v2", "storyboard_id IN (SELECT id FROM storyboard_documents_v2 WHERE production_id=?)", [productionId]);
      remove("storyboard_documents_v2", "production_id=?", [productionId]);
      remove("cinematic_script_breakdown_versions", "breakdown_id IN (SELECT id FROM cinematic_script_breakdowns WHERE production_id=?)", [productionId]);
      remove("cinematic_script_breakdowns", "production_id=?", [productionId]);
      remove("professional_contributions", "production_id=?", [productionId]);
      remove("cinematic_image_prompt_compilations", "production_id=?", [productionId]);
      remove("cinematic_shot_versions", "shot_id IN (SELECT id FROM cinematic_shots WHERE production_id=?)", [productionId]);
      remove("cinematic_shots", "production_id=?", [productionId]);
      remove("cinematic_asset_authority_versions", "authority_id IN (SELECT id FROM cinematic_asset_authorities WHERE production_id=?)", [productionId]);
      remove("cinematic_asset_authorities", "production_id=?", [productionId]);
      remove("visual_bible_versions", "visual_bible_id IN (SELECT id FROM visual_bibles WHERE production_id=?)", [productionId]);
      remove("visual_bibles", "production_id=?", [productionId]);

      // The project is dedicated to this production. Clear its edit/render
      // layer as well; no timeline or render artifact survives the reset.
      remove("delivery_packages", "project_id=?", [projectId]);
      remove("technical_qc_reports", "project_id=?", [projectId]);
      remove("export_masters", "project_id=?", [projectId]);
      remove("render_jobs", "project_id=?", [projectId]);
      remove("timelines");

      // Keep only the story node and any media explicitly attached to it.
      const preservedReviewIds = [sourceNodeId, ...storyIds];
      if (preservedReviewIds.length) remove("reviews", `target_id NOT IN (${preservedReviewIds.map(() => "?").join(",")})`, preservedReviewIds);
      else remove("reviews");
      remove("asset_versions");
      remove("assets");
      const mediaRows = database.prepare(`SELECT id, relative_path FROM media WHERE 1=1 ${keepMediaSql}`).all(...keepMediaValues);
      for (const media of mediaRows) cleanupPaths.add(media.relative_path);
      const preparationRows = database.prepare(`SELECT thumbnail_relative_path, proxy_relative_path FROM media_preparations WHERE media_id IN (SELECT id FROM media WHERE 1=1 ${keepMediaSql})`).all(...keepMediaValues);
      for (const row of preparationRows) for (const relativePath of [row.thumbnail_relative_path, row.proxy_relative_path]) if (relativePath) cleanupPaths.add(relativePath);
      remove("media_publications", `media_id NOT IN (SELECT id FROM media WHERE node_id=?)`, [sourceNodeId]);
      remove("media_preparations", `media_id NOT IN (SELECT id FROM media WHERE node_id=?)`, [sourceNodeId]);
      remove("media", `node_id IS NULL OR node_id<>?`, [sourceNodeId]);
      remove("groups");
      remove("nodes", "id<>?", [sourceNodeId]);

      const nextRevision = Number(production.revision) + 1;
      database.prepare("UPDATE cinematic_productions SET review_state='draft', current_version=?, updated_at=? WHERE id=?")
        .run(nextRevision, timestamp, productionId);
      database.prepare("INSERT INTO cinematic_production_versions (production_id, version, team_manifest_ids_json, legacy_extensions_json, created_at) VALUES (?, ?, '[]', '{}', ?)")
        .run(productionId, nextRevision, timestamp);
      recordEvent(database, "cinematic.production_reset", productionId, {
        preservedStoryPacketIds: storyIds,
        preservedSourceNodeId: sourceNodeId,
        deleted,
        resetRevision: nextRevision
      });
      return { projectId, productionId, preservedStoryPacketIds: storyIds, preservedSourceNodeId: sourceNodeId, deleted, resetRevision: nextRevision };
    });

    // Remove only files whose exact relative paths were read from the deleted
    // media rows. The story source node and its media are never touched.
    for (const relativePath of cleanupPaths) {
      try { rmSync(path.join(projectDirectory(this.dataRoot, projectId), relativePath), { force: true }); } catch { /* receipt remains authoritative */ }
    }
    return receipt;
  };
}
