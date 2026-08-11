function parse(value, fallback = {}) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function changes(result) {
  return Number(result?.changes ?? 0);
}

function identifierSet(rows, field = "id") {
  return new Set(rows.map((row) => row[field]).filter(Boolean));
}

function containsIdentifier(value, identifiers, seen = new Set()) {
  if (typeof value === "string") return identifiers.has(value);
  if (!value || typeof value !== "object" || seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some((entry) => containsIdentifier(entry, identifiers, seen));
  return Object.values(value).some((entry) => containsIdentifier(entry, identifiers, seen));
}

function markDerivedCanvasNodesStale(database, productionId, sourceNodeId, identifiers, screenplayDocument, updatedAt) {
  const rows = database.prepare("SELECT id, payload_json FROM nodes").all();
  const byResourceType = {};
  let total = 0;
  const derivedResourceTypes = new Set([
    "candidate_master",
    "cinematic_audio_stem",
    "cinematic_evaluation_evidence",
    "cinematic_image_prompt_compilation",
    "cinematic_prompt_compilation",
    "cinematic_qa_contact_sheet",
    "cinematic_shot",
    "cinematic_sound_design_plan",
    "delivery_package",
    "director_capture",
    "director_previs",
    "director_previs_clean_frame",
    "director_previs_frame",
    "director_stage",
    "generation_unit",
    "generation_unit_execution",
    "image_prompt_compilation",
    "professional_contribution",
    "prompt_compilation",
    "script_breakdown",
    "sequence_previs",
    "sequence_previs_controller",
    "sound_design",
    "sound_plan",
    "storyboard",
    "storyboard_image_execution",
    "take_memory",
    "timeline",
    "timeline_clip",
    "visual_context_bundle"
  ]);
  const update = database.prepare(`
    UPDATE nodes
    SET payload_json=?, revision=revision+1, updated_at=?
    WHERE id=?
  `);
  for (const row of rows) {
    if (row.id === sourceNodeId) continue;
    const payload = parse(row.payload_json);
    const belongs = payload.productionId === productionId
      || containsIdentifier(payload, identifiers);
    const resourceType = typeof payload.resourceType === "string"
      ? payload.resourceType
      : "unknown";
    const derived = derivedResourceTypes.has(resourceType)
      || resourceType.endsWith("_output");
    if (!belongs || !derived) continue;
    const invalidatedBy = {
      code: "screenplay_authority_revision_changed",
      screenplayDocumentChecksum: screenplayDocument.checksum,
      screenplayDocumentId: screenplayDocument.documentId,
      screenplayDocumentRevision: screenplayDocument.revision,
      at: updatedAt
    };
    update.run(JSON.stringify({
      ...payload,
      ...(Object.hasOwn(payload, "generationStatus") ? { generationStatus: "stale" } : {}),
      ...(Object.hasOwn(payload, "qcStatus") ? { qcStatus: "stale" } : {}),
      ...(Object.hasOwn(payload, "reviewState") ? { reviewState: "stale" } : {}),
      ...(Object.hasOwn(payload, "status") ? { status: "stale" } : {}),
      invalidated: true,
      invalidatedBy,
      stageStatus: "stale",
      stale: true
    }), updatedAt, row.id);
    identifiers.add(row.id);
    byResourceType[resourceType] = (byResourceType[resourceType] ?? 0) + 1;
    total += 1;
  }
  return { byResourceType, total };
}

function deactivateTimelineBindings(database, productionId, identifiers, updatedAt) {
  const rows = database.prepare(`
    SELECT id, node_id AS nodeId, payload_json AS payloadJson
    FROM timeline_clips
    WHERE is_active=1
  `).all();
  const update = database.prepare("UPDATE timeline_clips SET is_active=0 WHERE id=?");
  const touchedTimelines = new Set();
  let count = 0;
  for (const row of rows) {
    const payload = parse(row.payloadJson);
    if (
      payload.productionId !== productionId
      && !identifiers.has(row.nodeId)
      && !containsIdentifier(payload, identifiers)
    ) {
      continue;
    }
    update.run(row.id);
    const timelineId = database.prepare("SELECT timeline_id AS timelineId FROM timeline_clips WHERE id=?").get(row.id)?.timelineId;
    if (timelineId) touchedTimelines.add(timelineId);
    count += 1;
  }
  const touch = database.prepare("UPDATE timelines SET updated_at=? WHERE id=?");
  const deactivateTimeline = database.prepare(`
    UPDATE timelines SET is_active=0, updated_at=?
    WHERE id=? AND NOT EXISTS (
      SELECT 1 FROM timeline_clips WHERE timeline_id=? AND is_active=1
    )
  `);
  const inactiveTimelines = new Set();
  for (const timelineId of touchedTimelines) {
    touch.run(updatedAt, timelineId);
    if (changes(deactivateTimeline.run(updatedAt, timelineId, timelineId))) {
      inactiveTimelines.add(timelineId);
    }
  }
  return { inactiveTimelines, timelineBindings: count, touchedTimelines };
}

function deactivateImagePromptCompilations(database, productionId, identifiers) {
  const rows = database.prepare(`
    SELECT id, target_type AS targetType, target_id AS targetId, envelope_json AS envelopeJson
    FROM cinematic_image_prompt_compilations
    WHERE production_id=? AND is_active=1
  `).all(productionId);
  const update = database.prepare(
    "UPDATE cinematic_image_prompt_compilations SET is_active=0 WHERE id=?"
  );
  let count = 0;
  for (const row of rows) {
    // Production-scoped image compilations are execution derivatives. Keep
    // target/envelope lineage intact, but remove every one from current state.
    count += changes(update.run(row.id));
  }
  return count;
}

function deactivateRenderLineage(database, timelineIds, updatedAt) {
  if (!timelineIds.size) {
    return {
      deliveryPackages: 0,
      exportMasters: 0,
      renderJobs: 0,
      technicalQcReports: 0
    };
  }
  const placeholders = [...timelineIds].map(() => "?").join(",");
  const renderJobIds = identifierSet(database.prepare(`
    SELECT id FROM render_jobs
    WHERE timeline_id IN (${placeholders}) AND is_active=1
  `).all(...timelineIds));
  const result = {
    renderJobs: changes(database.prepare(`
      UPDATE render_jobs SET is_active=0, updated_at=?
      WHERE timeline_id IN (${placeholders}) AND is_active=1
    `).run(updatedAt, ...timelineIds)),
    exportMasters: 0,
    technicalQcReports: 0,
    deliveryPackages: 0
  };
  if (!renderJobIds.size) return result;
  const jobPlaceholders = [...renderJobIds].map(() => "?").join(",");
  result.exportMasters = changes(database.prepare(`
    UPDATE export_masters SET is_active=0
    WHERE render_job_id IN (${jobPlaceholders}) AND is_active=1
  `).run(...renderJobIds));
  result.technicalQcReports = changes(database.prepare(`
    UPDATE technical_qc_reports SET is_active=0
    WHERE render_job_id IN (${jobPlaceholders}) AND is_active=1
  `).run(...renderJobIds));
  result.deliveryPackages = changes(database.prepare(`
    UPDATE delivery_packages SET is_active=0
    WHERE render_job_id IN (${jobPlaceholders}) AND is_active=1
  `).run(...renderJobIds));
  return result;
}

/**
 * Deactivate only screenplay-derived current state. Version/history tables,
 * media, reviews, project assets and cinematic authorities remain untouched.
 *
 * This helper deliberately does not open or commit a transaction. Its caller
 * must execute it after inserting the new screenplay version and before the
 * same transaction commits.
 */
export function invalidateCinematicDerivedState(database, {
  sourceNodeId,
  screenplayDocument,
  updatedAt
}) {
  const productions = database.prepare(`
    SELECT id FROM cinematic_productions WHERE source_node_id=?
  `).all(sourceNodeId);
  const receipts = [];
  for (const { id: productionId } of productions) {
    const shotIds = identifierSet(database.prepare(
      "SELECT id FROM cinematic_shots WHERE production_id=? AND is_active=1"
    ).all(productionId));
    const generationUnitIds = identifierSet(database.prepare(
      "SELECT id FROM generation_units WHERE production_id=? AND is_active=1"
    ).all(productionId));
    const storyboardRows = database.prepare(
      "SELECT id FROM storyboard_documents_v2 WHERE production_id=? AND is_active=1"
    ).all(productionId);
    const storyboardIds = identifierSet(storyboardRows);
    const storyboardShotIds = storyboardIds.size
      ? identifierSet(database.prepare(`
          SELECT id FROM storyboard_shots_v2
          WHERE storyboard_id IN (${[...storyboardIds].map(() => "?").join(",")})
        `).all(...storyboardIds))
      : new Set();
    const previsIds = identifierSet(database.prepare(
      "SELECT id FROM cinematic_sequence_previs WHERE production_id=? AND is_active=1"
    ).all(productionId));
    const identifiers = new Set([
      productionId,
      ...shotIds,
      ...generationUnitIds,
      ...storyboardIds,
      ...storyboardShotIds,
      ...previsIds
    ]);

    const invalidated = {
      breakdowns: changes(database.prepare(`
        UPDATE cinematic_script_breakdowns
        SET is_active=0, updated_at=?
        WHERE production_id=? AND is_active=1
      `).run(updatedAt, productionId)),
      shots: changes(database.prepare(`
        UPDATE cinematic_shots SET is_active=0, updated_at=?
        WHERE production_id=? AND is_active=1
      `).run(updatedAt, productionId)),
      generationUnits: changes(database.prepare(`
        UPDATE generation_units SET is_active=0, updated_at=?
        WHERE production_id=? AND is_active=1
      `).run(updatedAt, productionId)),
      referenceBindings: generationUnitIds.size
        ? changes(database.prepare(`
            UPDATE reference_bindings SET is_active=0, updated_at=?
            WHERE generation_unit_id IN (${[...generationUnitIds].map(() => "?").join(",")})
              AND is_active=1
          `).run(updatedAt, ...generationUnitIds))
        : 0,
      storyboards: changes(database.prepare(`
        UPDATE storyboard_documents_v2 SET is_active=0, updated_at=?
        WHERE production_id=? AND is_active=1
      `).run(updatedAt, productionId)),
      sequencePrevis: changes(database.prepare(`
        UPDATE cinematic_sequence_previs SET is_active=0, updated_at=?
        WHERE production_id=? AND is_active=1
      `).run(updatedAt, productionId)),
      visualContextBundles: changes(database.prepare(`
        UPDATE cinematic_visual_context_bundles SET is_active=0
        WHERE production_id=? AND is_active=1
      `).run(productionId)),
      visualTakeMemories: changes(database.prepare(`
        UPDATE cinematic_visual_take_memories SET is_active=0
        WHERE production_id=? AND is_active=1
      `).run(productionId)),
      promptCompilations: changes(database.prepare(`
        UPDATE prompt_compilations SET is_active=0
        WHERE production_id=? AND is_active=1
      `).run(productionId)),
      evaluations: changes(database.prepare(`
        UPDATE cinematic_evaluations SET is_active=0
        WHERE production_id=? AND is_active=1
      `).run(productionId)),
      professionalContributions: changes(database.prepare(`
        UPDATE professional_contributions SET is_active=0
        WHERE production_id=? AND is_active=1
      `).run(productionId))
    };
    const canvasInvalidation = markDerivedCanvasNodesStale(
      database,
      productionId,
      sourceNodeId,
      identifiers,
      screenplayDocument,
      updatedAt
    );
    invalidated.canvasNodes = canvasInvalidation.total;
    invalidated.canvasNodesByResourceType = canvasInvalidation.byResourceType;
    invalidated.imagePromptCompilations = deactivateImagePromptCompilations(
      database,
      productionId,
      identifiers
    );
    const timelineInvalidation = deactivateTimelineBindings(
      database,
      productionId,
      identifiers,
      updatedAt
    );
    invalidated.timelineBindings = timelineInvalidation.timelineBindings;
    invalidated.timelines = timelineInvalidation.inactiveTimelines.size;
    Object.assign(
      invalidated,
      deactivateRenderLineage(database, timelineInvalidation.touchedTimelines, updatedAt)
    );

    const terminalBatchStates = ["succeeded", "failed", "cancelled"];
    const batchJobs = database.prepare(`
      SELECT id FROM storyboard_batch_jobs
      WHERE production_id=? AND status NOT IN (${terminalBatchStates.map(() => "?").join(",")})
    `).all(productionId, ...terminalBatchStates);
    invalidated.storyboardBatchJobs = 0;
    invalidated.storyboardBatchItems = 0;
    for (const job of batchJobs) {
      invalidated.storyboardBatchItems += changes(database.prepare(`
        UPDATE storyboard_batch_items
        SET status='cancelled', updated_at=?, completed_at=COALESCE(completed_at, ?),
          error_json=?
        WHERE job_id=? AND status NOT IN ('succeeded', 'failed', 'cancelled')
      `).run(
        updatedAt,
        updatedAt,
        JSON.stringify({
          code: "screenplay_authority_revision_changed",
          message: "Storyboard work was cancelled because its source screenplay revision is stale"
        }),
        job.id
      ));
      invalidated.storyboardBatchJobs += changes(database.prepare(`
        UPDATE storyboard_batch_jobs
        SET status='cancelled', updated_at=?, completed_at=COALESCE(completed_at, ?),
          cancelled_at=COALESCE(cancelled_at, ?)
        WHERE id=?
      `).run(updatedAt, updatedAt, updatedAt, job.id));
    }

    const receiptId = `screenplay-invalidation-${productionId}-${screenplayDocument.revision}`;
    const receipt = {
      format: "CinematicDerivedStateInvalidationV1",
      receiptId,
      productionId,
      sourceNodeId,
      screenplayDocumentId: screenplayDocument.documentId,
      screenplayDocumentRevision: screenplayDocument.revision,
      screenplayDocumentChecksum: screenplayDocument.checksum,
      invalidatedCounts: invalidated,
      createdAt: updatedAt
    };
    database.prepare(`
      INSERT INTO cinematic_screenplay_invalidations
        (id, production_id, source_node_id, screenplay_document_revision,
          screenplay_document_checksum, invalidation_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(production_id, source_node_id, screenplay_document_revision)
      DO UPDATE SET screenplay_document_checksum=excluded.screenplay_document_checksum,
        invalidation_json=excluded.invalidation_json, created_at=excluded.created_at
    `).run(
      receiptId,
      productionId,
      sourceNodeId,
      screenplayDocument.revision,
      screenplayDocument.checksum,
      JSON.stringify(receipt),
      updatedAt
    );
    receipts.push(receipt);
  }
  return receipts;
}
