import { UnuTvError, nowIso } from "@ununu/unutv-contracts";

function parse(value) { return value ? JSON.parse(value) : undefined; }
function transaction(database, work) {
  database.exec("BEGIN IMMEDIATE");
  try { const result = work(); database.exec("COMMIT"); return result; }
  catch (error) { database.exec("ROLLBACK"); throw error; }
}
function conflict(entity, expected, actual) {
  if (expected !== undefined && Number(expected) !== actual) throw new UnuTvError("revision_conflict", `Expected ${entity} revision ${expected}, found ${actual}`, 409);
}
function readPrevis(database, productionId, sequencePrevisId) {
  const current = database.prepare("SELECT current_version FROM cinematic_sequence_previs WHERE id=? AND production_id=?").get(sequencePrevisId, productionId);
  if (!current) return undefined;
  return parse(database.prepare("SELECT payload_json FROM cinematic_sequence_previs_versions WHERE sequence_previs_id=? AND version=?").get(sequencePrevisId, current.current_version)?.payload_json);
}

export function attachCinematicSequenceWorkspaceMethods(prototype, emitEvent) {
  Object.assign(prototype, {
    saveSequencePrevis(projectId, productionId, previs, expectedRevision) {
      const database = this.database(projectId);
      return transaction(database, () => {
        const current = database.prepare("SELECT current_version, created_at FROM cinematic_sequence_previs WHERE id=? AND production_id=?").get(previs.sequencePrevisId, productionId);
        const actual = current?.current_version ?? 0;
        conflict("sequence previs", expectedRevision, actual);
        const version = actual + 1;
        const updatedAt = previs.updatedAt ?? nowIso();
        const saved = { ...previs, productionId, revision: version, createdAt: previs.createdAt ?? current?.created_at ?? updatedAt, updatedAt };
        database.prepare(`
          INSERT INTO cinematic_sequence_previs (id, production_id, status, current_version, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET status=excluded.status, current_version=excluded.current_version, updated_at=excluded.updated_at
        `).run(saved.sequencePrevisId, productionId, saved.status, version, saved.createdAt, updatedAt);
        database.prepare("INSERT INTO cinematic_sequence_previs_versions (sequence_previs_id, version, payload_json, created_at) VALUES (?, ?, ?, ?)")
          .run(saved.sequencePrevisId, version, JSON.stringify(saved), updatedAt);
        emitEvent(database, actual ? "cinematic.sequence_previs_updated" : "cinematic.sequence_previs_created", saved.sequencePrevisId, { productionId, version });
        return saved;
      });
    },
    getSequencePrevis(projectId, productionId, sequencePrevisId) {
      const database = this.database(projectId);
      const id = sequencePrevisId ?? database.prepare("SELECT id FROM cinematic_sequence_previs WHERE production_id=? ORDER BY updated_at DESC LIMIT 1").get(productionId)?.id;
      return id ? readPrevis(database, productionId, id) : undefined;
    },
    listSequencePrevis(projectId, productionId) {
      const database = this.database(projectId);
      return database.prepare("SELECT id FROM cinematic_sequence_previs WHERE production_id=? ORDER BY updated_at DESC").all(productionId)
        .map((row) => readPrevis(database, productionId, row.id));
    },
    listSequencePrevisVersions(projectId, productionId, sequencePrevisId) {
      const database = this.database(projectId);
      if (!database.prepare("SELECT 1 FROM cinematic_sequence_previs WHERE id=? AND production_id=?").get(sequencePrevisId, productionId)) return [];
      return database.prepare("SELECT version, payload_json, created_at FROM cinematic_sequence_previs_versions WHERE sequence_previs_id=? ORDER BY version DESC").all(sequencePrevisId)
        .map((row) => ({ version: row.version, sequencePrevis: parse(row.payload_json), createdAt: row.created_at }));
    },
    saveVisualContextBundle(projectId, bundle) {
      const database = this.database(projectId);
      database.prepare(`INSERT INTO cinematic_visual_context_bundles (id, production_id, sequence_previs_id, shot_id, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(bundle.visualContextBundleId, bundle.productionId, bundle.sequencePrevisId, bundle.shotId, JSON.stringify(bundle), bundle.createdAt);
      emitEvent(database, "cinematic.visual_context_compiled", bundle.visualContextBundleId, { productionId: bundle.productionId, shotId: bundle.shotId });
      return bundle;
    },
    getVisualContextBundle(projectId, productionId, visualContextBundleId) {
      const row = this.database(projectId).prepare("SELECT payload_json FROM cinematic_visual_context_bundles WHERE id=? AND production_id=?").get(visualContextBundleId, productionId);
      return parse(row?.payload_json);
    },
    listVisualContextBundles(projectId, productionId, shotId) {
      const query = shotId
        ? ["SELECT payload_json FROM cinematic_visual_context_bundles WHERE production_id=? AND shot_id=? ORDER BY created_at DESC", [productionId, shotId]]
        : ["SELECT payload_json FROM cinematic_visual_context_bundles WHERE production_id=? ORDER BY created_at DESC", [productionId]];
      return this.database(projectId).prepare(query[0]).all(...query[1]).map((row) => parse(row.payload_json));
    },
    saveVisualTakeMemory(projectId, memory) {
      const database = this.database(projectId);
      database.prepare(`INSERT INTO cinematic_visual_take_memories (id, production_id, generation_unit_id, run_id, media_id, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(memory.visualTakeMemoryId, memory.productionId, memory.generationUnitId, memory.runId, memory.mediaId, JSON.stringify(memory), memory.createdAt);
      emitEvent(database, "cinematic.visual_take_remembered", memory.visualTakeMemoryId, { generationUnitId: memory.generationUnitId, mediaId: memory.mediaId });
      return memory;
    },
    listVisualTakeMemories(projectId, productionId, generationUnitId) {
      const query = generationUnitId
        ? ["SELECT payload_json FROM cinematic_visual_take_memories WHERE production_id=? AND generation_unit_id=? ORDER BY created_at DESC", [productionId, generationUnitId]]
        : ["SELECT payload_json FROM cinematic_visual_take_memories WHERE production_id=? ORDER BY created_at DESC", [productionId]];
      return this.database(projectId).prepare(query[0]).all(...query[1]).map((row) => parse(row.payload_json));
    },
    saveCreativeDecisionTrace(projectId, trace) {
      const database = this.database(projectId);
      database.prepare(`INSERT INTO cinematic_creative_decision_traces (id, production_id, target_type, target_id, action, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(trace.creativeDecisionTraceId, trace.productionId, trace.targetType, trace.targetId, trace.action, JSON.stringify(trace), trace.createdAt);
      emitEvent(database, "cinematic.creative_decision_traced", trace.creativeDecisionTraceId, { targetType: trace.targetType, targetId: trace.targetId });
      return trace;
    },
    listCreativeDecisionTraces(projectId, productionId, targetType, targetId) {
      const clauses = ["production_id=?"], values = [productionId];
      if (targetType) { clauses.push("target_type=?"); values.push(targetType); }
      if (targetId) { clauses.push("target_id=?"); values.push(targetId); }
      return this.database(projectId).prepare(`SELECT payload_json FROM cinematic_creative_decision_traces WHERE ${clauses.join(" AND ")} ORDER BY created_at DESC`).all(...values)
        .map((row) => parse(row.payload_json));
    }
  });
}
