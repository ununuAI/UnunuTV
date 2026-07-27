import { UnuTvError, nowIso } from "@ununu/unutv-contracts";

function parse(value, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  return typeof value === "string" ? JSON.parse(value) : value;
}

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

function revisionConflict(entity, expected, actual) {
  if (expected !== undefined && Number(expected) !== actual) {
    throw new UnuTvError("revision_conflict", `Expected ${entity} revision ${expected}, found ${actual}`, 409);
  }
}

function currentVersion(database, table, idColumn, id) {
  return database.prepare(`SELECT current_version AS currentVersion FROM ${table} WHERE ${idColumn}=?`).get(id)?.currentVersion;
}

function hydrateProduction(database, row) {
  if (!row) return undefined;
  const version = database.prepare(`
    SELECT team_manifest_ids_json, legacy_extensions_json
    FROM cinematic_production_versions WHERE production_id=? AND version=?
  `).get(row.id, row.current_version);
  return {
    productionId: row.id,
    projectType: row.project_type,
    productionMode: row.production_mode,
    storyPacketIds: database.prepare("SELECT id FROM story_packets WHERE production_id=? ORDER BY is_primary DESC, created_at").all(row.id).map((entry) => entry.id),
    visualBibleId: database.prepare("SELECT id FROM visual_bibles WHERE production_id=? ORDER BY updated_at DESC LIMIT 1").get(row.id)?.id ?? null,
    shotIds: database.prepare("SELECT id FROM cinematic_shots WHERE production_id=? AND is_active=1 ORDER BY order_index, created_at").all(row.id).map((entry) => entry.id),
    generationUnitIds: database.prepare("SELECT id FROM generation_units WHERE production_id=? AND is_active=1 ORDER BY created_at").all(row.id).map((entry) => entry.id),
    assetAuthorityIds: database.prepare("SELECT id FROM cinematic_asset_authorities WHERE production_id=? AND is_active=1 ORDER BY authority_type, created_at").all(row.id).map((entry) => entry.id),
    teamManifestIds: parse(version?.team_manifest_ids_json, []),
    reviewState: row.review_state,
    revision: row.current_version,
    title: row.title,
    sourceNodeId: row.source_node_id,
    legacyExtensions: parse(version?.legacy_extensions_json, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function readVersionedJson(database, { currentTable, id, idColumn = "id", productionId, versionColumn, versionIdColumn, versionTable }) {
  const row = database.prepare(`SELECT * FROM ${currentTable} WHERE ${idColumn}=?${productionId ? " AND production_id=?" : ""}`)
    .get(...(productionId ? [id, productionId] : [id]));
  if (!row) return undefined;
  const version = database.prepare(`SELECT ${versionColumn} AS payload FROM ${versionTable} WHERE ${versionIdColumn}=? AND version=?`)
    .get(id, row.current_version);
  return parse(version?.payload, undefined);
}

export function attachCinematicProductionMethods(prototype, recordEvent) {
  prototype.createCinematicProduction = function createCinematicProduction(projectId, production) {
    const database = this.database(projectId);
    return transaction(database, () => {
      database.prepare(`
        INSERT INTO cinematic_productions
          (id, project_type, production_mode, title, source_node_id, review_state, current_version, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(production.productionId, production.projectType, production.productionMode, production.title, production.sourceNodeId, production.reviewState, production.revision, production.createdAt, production.updatedAt);
      database.prepare(`
        INSERT INTO cinematic_production_versions
          (production_id, version, team_manifest_ids_json, legacy_extensions_json, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(production.productionId, production.revision, JSON.stringify(production.teamManifestIds), JSON.stringify(production.legacyExtensions ?? {}), production.createdAt);
      recordEvent(database, "cinematic.production_created", production.productionId, { projectType: production.projectType });
      return hydrateProduction(database, database.prepare("SELECT * FROM cinematic_productions WHERE id=?").get(production.productionId));
    });
  };

  prototype.listCinematicProductions = function listCinematicProductions(projectId) {
    const database = this.database(projectId);
    return database.prepare("SELECT * FROM cinematic_productions ORDER BY updated_at DESC").all().map((row) => hydrateProduction(database, row));
  };

  prototype.getCinematicProduction = function getCinematicProduction(projectId, productionId) {
    const database = this.database(projectId);
    return hydrateProduction(database, database.prepare("SELECT * FROM cinematic_productions WHERE id=?").get(productionId));
  };

  prototype.updateCinematicProduction = function updateCinematicProduction(projectId, production, expectedRevision) {
    const database = this.database(projectId);
    return transaction(database, () => {
      const current = database.prepare("SELECT current_version FROM cinematic_productions WHERE id=?").get(production.productionId);
      if (!current) return undefined;
      revisionConflict("cinematic production", expectedRevision, current.current_version);
      const version = current.current_version + 1;
      const updatedAt = production.updatedAt ?? nowIso();
      database.prepare(`
        UPDATE cinematic_productions
        SET project_type=?, production_mode=?, title=?, source_node_id=?, review_state=?, current_version=?, updated_at=?
        WHERE id=?
      `).run(production.projectType, production.productionMode, production.title, production.sourceNodeId, production.reviewState, version, updatedAt, production.productionId);
      database.prepare(`
        INSERT INTO cinematic_production_versions
          (production_id, version, team_manifest_ids_json, legacy_extensions_json, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(production.productionId, version, JSON.stringify(production.teamManifestIds ?? []), JSON.stringify(production.legacyExtensions ?? {}), updatedAt);
      recordEvent(database, "cinematic.production_updated", production.productionId, { version });
      return hydrateProduction(database, database.prepare("SELECT * FROM cinematic_productions WHERE id=?").get(production.productionId));
    });
  };

  prototype.saveStoryPacket = function saveStoryPacket(projectId, productionId, packet, expectedRevision) {
    const database = this.database(projectId);
    return transaction(database, () => {
      const current = database.prepare("SELECT current_version FROM story_packets WHERE id=? AND production_id=?").get(packet.storyPacketId, productionId);
      revisionConflict("story packet", expectedRevision, current?.current_version ?? 0);
      const version = (current?.current_version ?? 0) + 1;
      const updatedAt = packet.updatedAt ?? nowIso();
      const saved = { ...packet, revision: version, updatedAt };
      database.prepare(`
        INSERT INTO story_packets (id, production_id, current_version, is_primary, created_at, updated_at)
        VALUES (?, ?, ?, 1, ?, ?)
        ON CONFLICT(id) DO UPDATE SET current_version=excluded.current_version, is_primary=1, updated_at=excluded.updated_at
      `).run(packet.storyPacketId, productionId, version, updatedAt, updatedAt);
      database.prepare("INSERT INTO story_packet_versions (story_packet_id, version, packet_json, created_at) VALUES (?, ?, ?, ?)")
        .run(packet.storyPacketId, version, JSON.stringify(saved), updatedAt);
      recordEvent(database, "cinematic.story_packet_saved", packet.storyPacketId, { productionId, version });
      return saved;
    });
  };

  prototype.getStoryPacket = function getStoryPacket(projectId, productionId, storyPacketId) {
    const database = this.database(projectId);
    const id = storyPacketId ?? database.prepare("SELECT id FROM story_packets WHERE production_id=? ORDER BY is_primary DESC, updated_at DESC LIMIT 1").get(productionId)?.id;
    if (!id) return undefined;
    return readVersionedJson(database, {
      currentTable: "story_packets", id, productionId, versionTable: "story_packet_versions",
      versionIdColumn: "story_packet_id", versionColumn: "packet_json"
    });
  };

  prototype.saveVisualBible = function saveVisualBible(projectId, productionId, bible, expectedRevision) {
    const database = this.database(projectId);
    return transaction(database, () => {
      const current = database.prepare("SELECT current_version FROM visual_bibles WHERE id=? AND production_id=?").get(bible.visualBibleId, productionId);
      revisionConflict("visual bible", expectedRevision, current?.current_version ?? 0);
      const version = (current?.current_version ?? 0) + 1;
      const updatedAt = bible.updatedAt ?? nowIso();
      const saved = { ...bible, revision: version, updatedAt };
      database.prepare(`
        INSERT INTO visual_bibles (id, production_id, current_version, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET current_version=excluded.current_version, updated_at=excluded.updated_at
      `).run(bible.visualBibleId, productionId, version, updatedAt, updatedAt);
      database.prepare("INSERT INTO visual_bible_versions (visual_bible_id, version, bible_json, created_at) VALUES (?, ?, ?, ?)")
        .run(bible.visualBibleId, version, JSON.stringify(saved), updatedAt);
      recordEvent(database, "cinematic.visual_bible_saved", bible.visualBibleId, { productionId, version });
      return saved;
    });
  };

  prototype.getVisualBible = function getVisualBible(projectId, productionId) {
    const database = this.database(projectId);
    const id = database.prepare("SELECT id FROM visual_bibles WHERE production_id=? ORDER BY updated_at DESC LIMIT 1").get(productionId)?.id;
    if (!id) return undefined;
    return readVersionedJson(database, {
      currentTable: "visual_bibles", id, productionId, versionTable: "visual_bible_versions",
      versionIdColumn: "visual_bible_id", versionColumn: "bible_json"
    });
  };

  prototype.saveCinematicAssetAuthority = function saveCinematicAssetAuthority(projectId, productionId, authority, expectedRevision) {
    const database = this.database(projectId);
    return transaction(database, () => {
      const current = database.prepare("SELECT current_version FROM cinematic_asset_authorities WHERE id=? AND production_id=?").get(authority.authorityId, productionId);
      revisionConflict("cinematic asset authority", expectedRevision, current?.current_version ?? 0);
      const version = (current?.current_version ?? 0) + 1;
      const updatedAt = authority.updatedAt ?? nowIso();
      const saved = { ...authority, revision: version, updatedAt };
      database.prepare(`
        INSERT INTO cinematic_asset_authorities (id, production_id, authority_type, status, risk_level, current_version, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
        ON CONFLICT(id) DO UPDATE SET authority_type=excluded.authority_type, status=excluded.status, risk_level=excluded.risk_level,
          current_version=excluded.current_version, is_active=1, updated_at=excluded.updated_at
      `).run(authority.authorityId, productionId, authority.authorityType, authority.status, authority.riskLevel, version, updatedAt, updatedAt);
      database.prepare("INSERT INTO cinematic_asset_authority_versions (authority_id, version, authority_json, created_at) VALUES (?, ?, ?, ?)")
        .run(authority.authorityId, version, JSON.stringify(saved), updatedAt);
      recordEvent(database, "cinematic.asset_authority_saved", authority.authorityId, { productionId, authorityType: authority.authorityType, version });
      return saved;
    });
  };

  prototype.getCinematicAssetAuthority = function getCinematicAssetAuthority(projectId, productionId, authorityId) {
    return readVersionedJson(this.database(projectId), {
      currentTable: "cinematic_asset_authorities", id: authorityId, productionId,
      versionTable: "cinematic_asset_authority_versions", versionIdColumn: "authority_id", versionColumn: "authority_json"
    });
  };

  prototype.listCinematicAssetAuthorities = function listCinematicAssetAuthorities(projectId, productionId) {
    const database = this.database(projectId);
    return database.prepare("SELECT id FROM cinematic_asset_authorities WHERE production_id=? AND is_active=1 ORDER BY authority_type, updated_at DESC").all(productionId)
      .map((row) => this.getCinematicAssetAuthority(projectId, productionId, row.id));
  };

  prototype.listCinematicAssetAuthorityVersions = function listCinematicAssetAuthorityVersions(projectId, productionId, authorityId) {
    const database = this.database(projectId);
    const belongs = database.prepare("SELECT 1 FROM cinematic_asset_authorities WHERE id=? AND production_id=?").get(authorityId, productionId);
    if (!belongs) return [];
    return database.prepare(`
      SELECT version, authority_json, created_at
      FROM cinematic_asset_authority_versions
      WHERE authority_id=?
      ORDER BY version DESC
    `).all(authorityId).map((row) => ({ version: row.version, authority: JSON.parse(row.authority_json), createdAt: row.created_at }));
  };

  prototype.batchSaveCinematicAssetAuthorities = function batchSaveCinematicAssetAuthorities(projectId, productionId, authorities, expectedRevisions = {}) {
    const database = this.database(projectId);
    return transaction(database, () => {
      const saved = [];
      for (const authority of authorities) {
        const current = database.prepare("SELECT current_version FROM cinematic_asset_authorities WHERE id=? AND production_id=?").get(authority.authorityId, productionId);
        revisionConflict("cinematic asset authority", expectedRevisions[authority.authorityId], current?.current_version ?? 0);
        const version = (current?.current_version ?? 0) + 1;
        const updatedAt = authority.updatedAt ?? nowIso();
        const record = { ...authority, revision: version, updatedAt };
        database.prepare(`
          INSERT INTO cinematic_asset_authorities (id, production_id, authority_type, status, risk_level, current_version, is_active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
          ON CONFLICT(id) DO UPDATE SET authority_type=excluded.authority_type, status=excluded.status, risk_level=excluded.risk_level,
            current_version=excluded.current_version, is_active=1, updated_at=excluded.updated_at
        `).run(authority.authorityId, productionId, authority.authorityType, authority.status, authority.riskLevel, version, updatedAt, updatedAt);
        database.prepare("INSERT INTO cinematic_asset_authority_versions (authority_id, version, authority_json, created_at) VALUES (?, ?, ?, ?)")
          .run(authority.authorityId, version, JSON.stringify(record), updatedAt);
        recordEvent(database, "cinematic.asset_authority_saved", authority.authorityId, { productionId, authorityType: authority.authorityType, version, batch: true });
        saved.push(record);
      }
      return saved;
    });
  };

  prototype.saveCinematicImagePromptCompilation = function saveCinematicImagePromptCompilation(projectId, compilation) {
    const database = this.database(projectId);
    database.prepare(`
      INSERT INTO cinematic_image_prompt_compilations
        (id, production_id, target_type, target_id, payload_hash, compiler_version, manual_override, envelope_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(compilation.compilationId, compilation.productionId, compilation.targetType, compilation.targetId, compilation.envelope.payloadHash,
      compilation.envelope.compilerVersion, compilation.envelope.manualOverride ? 1 : 0, JSON.stringify(compilation.envelope), compilation.createdAt);
    recordEvent(database, "cinematic.image_prompt_compiled", compilation.compilationId, { targetType: compilation.targetType, targetId: compilation.targetId, payloadHash: compilation.envelope.payloadHash });
    return compilation;
  };

  prototype.getCinematicImagePromptCompilation = function getCinematicImagePromptCompilation(projectId, productionId, targetType, targetId) {
    const row = this.database(projectId).prepare("SELECT * FROM cinematic_image_prompt_compilations WHERE production_id=? AND target_type=? AND target_id=? ORDER BY created_at DESC LIMIT 1")
      .get(productionId, targetType, targetId);
    return row ? { compilationId: row.id, productionId, targetType, targetId, envelope: parse(row.envelope_json, {}), createdAt: row.created_at } : undefined;
  };

  prototype.saveCinematicShot = function saveCinematicShot(projectId, productionId, shot, expectedRevision) {
    const database = this.database(projectId);
    return transaction(database, () => {
      const current = database.prepare("SELECT current_version FROM cinematic_shots WHERE id=? AND production_id=?").get(shot.shotId, productionId);
      revisionConflict("cinematic shot", expectedRevision, current?.current_version ?? 0);
      const version = (current?.current_version ?? 0) + 1;
      const updatedAt = shot.updatedAt ?? nowIso();
      const saved = { ...shot, revision: version, updatedAt };
      database.prepare(`
        INSERT INTO cinematic_shots (id, production_id, order_index, current_version, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, 1, ?, ?)
        ON CONFLICT(id) DO UPDATE SET order_index=excluded.order_index, current_version=excluded.current_version, is_active=1, updated_at=excluded.updated_at
      `).run(shot.shotId, productionId, shot.order, version, updatedAt, updatedAt);
      database.prepare("INSERT INTO cinematic_shot_versions (shot_id, version, spec_json, created_at) VALUES (?, ?, ?, ?)")
        .run(shot.shotId, version, JSON.stringify(saved), updatedAt);
      recordEvent(database, "cinematic.shot_saved", shot.shotId, { productionId, version });
      return saved;
    });
  };

  prototype.getCinematicShot = function getCinematicShot(projectId, productionId, shotId) {
    return readVersionedJson(this.database(projectId), {
      currentTable: "cinematic_shots", id: shotId, productionId, versionTable: "cinematic_shot_versions",
      versionIdColumn: "shot_id", versionColumn: "spec_json"
    });
  };

  prototype.listCinematicShots = function listCinematicShots(projectId, productionId) {
    const database = this.database(projectId);
    return database.prepare("SELECT id FROM cinematic_shots WHERE production_id=? AND is_active=1 ORDER BY order_index, created_at").all(productionId)
      .map((row) => this.getCinematicShot(projectId, productionId, row.id));
  };

  prototype.saveCinematicScriptBreakdown = function saveCinematicScriptBreakdown(projectId, breakdown, expectedRevision) {
    const database = this.database(projectId);
    return transaction(database, () => {
      const current = database.prepare("SELECT current_version FROM cinematic_script_breakdowns WHERE id=? AND production_id=?").get(breakdown.breakdownId, breakdown.productionId);
      revisionConflict("cinematic script breakdown", expectedRevision, current?.current_version ?? 0);
      const version = (current?.current_version ?? 0) + 1;
      const saved = { ...breakdown, revision: version };
      database.prepare(`
        INSERT INTO cinematic_script_breakdowns (id, production_id, source_node_id, source_document_revision, current_version, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET source_document_revision=excluded.source_document_revision,
          current_version=excluded.current_version, updated_at=excluded.updated_at
      `).run(saved.breakdownId, saved.productionId, saved.sourceNodeId, saved.sourceDocumentRevision, version, saved.createdAt, saved.updatedAt);
      database.prepare("INSERT INTO cinematic_script_breakdown_versions (breakdown_id, version, breakdown_json, created_at) VALUES (?, ?, ?, ?)")
        .run(saved.breakdownId, version, JSON.stringify(saved), saved.updatedAt);
      recordEvent(database, "cinematic.script_breakdown_saved", saved.breakdownId, { productionId: saved.productionId, sourceNodeId: saved.sourceNodeId, version });
      return saved;
    });
  };

  prototype.getCinematicScriptBreakdown = function getCinematicScriptBreakdown(projectId, productionId, sourceNodeId) {
    const database = this.database(projectId);
    const row = database.prepare(`
      SELECT id, current_version FROM cinematic_script_breakdowns WHERE production_id=? AND source_node_id=?
    `).get(productionId, sourceNodeId);
    if (!row) return undefined;
    const version = database.prepare("SELECT breakdown_json FROM cinematic_script_breakdown_versions WHERE breakdown_id=? AND version=?")
      .get(row.id, row.current_version);
    return version ? JSON.parse(version.breakdown_json) : undefined;
  };

  prototype.listCinematicScriptBreakdowns = function listCinematicScriptBreakdowns(projectId, productionId) {
    return this.database(projectId).prepare("SELECT source_node_id AS sourceNodeId FROM cinematic_script_breakdowns WHERE production_id=? ORDER BY created_at")
      .all(productionId).map((row) => this.getCinematicScriptBreakdown(projectId, productionId, row.sourceNodeId));
  };

  prototype.saveGenerationUnit = function saveGenerationUnit(projectId, productionId, unit, referenceBindings, expectedRevision) {
    const database = this.database(projectId);
    return transaction(database, () => {
      const current = database.prepare("SELECT current_version FROM generation_units WHERE id=? AND production_id=?").get(unit.generationUnitId, productionId);
      revisionConflict("generation unit", expectedRevision, current?.current_version ?? 0);
      const version = (current?.current_version ?? 0) + 1;
      const updatedAt = unit.updatedAt ?? nowIso();
      const savedUnit = { ...unit, revision: version, updatedAt };
      const isActive = unit.productionPlanState === "superseded" ? 0 : 1;
      database.prepare(`
        INSERT INTO generation_units (id, production_id, strategy, visual_anchor_policy, current_version, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET strategy=excluded.strategy, visual_anchor_policy=excluded.visual_anchor_policy,
          current_version=excluded.current_version, is_active=excluded.is_active, updated_at=excluded.updated_at
      `).run(unit.generationUnitId, productionId, unit.strategy, unit.visualAnchorPolicy, version, isActive, updatedAt, updatedAt);
      database.prepare("INSERT INTO generation_unit_versions (generation_unit_id, version, spec_json, created_at) VALUES (?, ?, ?, ?)")
        .run(unit.generationUnitId, version, JSON.stringify(savedUnit), updatedAt);
      database.prepare("DELETE FROM generation_unit_shots WHERE generation_unit_id=?").run(unit.generationUnitId);
      for (const link of unit.shotLinks) {
        database.prepare(`
          INSERT INTO generation_unit_shots (generation_unit_id, shot_id, order_index, role, transition_json)
          VALUES (?, ?, ?, ?, ?)
        `).run(unit.generationUnitId, link.shotId, link.order, link.role ?? "artistic_shot", JSON.stringify({ cutReason: link.cutReason ?? "", transition: link.transition ?? null }));
      }
      database.prepare("UPDATE reference_bindings SET is_active=0, updated_at=? WHERE generation_unit_id=?").run(updatedAt, unit.generationUnitId);
      for (const binding of referenceBindings) {
        const bindingId = `reference-binding-${unit.generationUnitId}-${binding.providerIndex}`;
        const currentBinding = database.prepare("SELECT current_version FROM reference_bindings WHERE id=?").get(bindingId);
        const bindingVersion = (currentBinding?.current_version ?? 0) + 1;
        database.prepare(`
          INSERT INTO reference_bindings (id, generation_unit_id, provider_index, current_version, is_active, created_at, updated_at)
          VALUES (?, ?, ?, ?, 1, ?, ?)
          ON CONFLICT(id) DO UPDATE SET provider_index=excluded.provider_index, current_version=excluded.current_version,
            is_active=1, updated_at=excluded.updated_at
        `).run(bindingId, unit.generationUnitId, binding.providerIndex, bindingVersion, updatedAt, updatedAt);
        database.prepare("INSERT INTO reference_binding_versions (reference_binding_id, version, binding_json, created_at) VALUES (?, ?, ?, ?)")
          .run(bindingId, bindingVersion, JSON.stringify(binding), updatedAt);
      }
      recordEvent(database, "cinematic.generation_unit_saved", unit.generationUnitId, { productionId, version });
      return this.getGenerationUnit(projectId, productionId, unit.generationUnitId);
    });
  };

  prototype.getGenerationUnit = function getGenerationUnit(projectId, productionId, generationUnitId) {
    const database = this.database(projectId);
    const generationUnit = readVersionedJson(database, {
      currentTable: "generation_units", id: generationUnitId, productionId, versionTable: "generation_unit_versions",
      versionIdColumn: "generation_unit_id", versionColumn: "spec_json"
    });
    if (!generationUnit) return undefined;
    const referenceBindings = database.prepare(`
      SELECT id, current_version FROM reference_bindings
      WHERE generation_unit_id=? AND is_active=1 ORDER BY provider_index
    `).all(generationUnitId).map((row) => {
      const version = database.prepare("SELECT binding_json FROM reference_binding_versions WHERE reference_binding_id=? AND version=?")
        .get(row.id, row.current_version);
      return parse(version.binding_json, {});
    });
    return { generationUnit, referenceBindings };
  };

  prototype.listGenerationUnits = function listGenerationUnits(projectId, productionId) {
    const database = this.database(projectId);
    return database.prepare("SELECT id FROM generation_units WHERE production_id=? AND is_active=1 ORDER BY created_at").all(productionId)
      .map((row) => this.getGenerationUnit(projectId, productionId, row.id));
  };

  prototype.saveProfessionalContribution = function saveProfessionalContribution(projectId, productionId, contribution) {
    const database = this.database(projectId);
    database.prepare(`
      INSERT INTO professional_contributions
        (id, production_id, target_type, target_id, role_id, revision, contribution_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(contribution.contributionId, productionId, contribution.targetType, contribution.targetId, contribution.roleId, contribution.revision, JSON.stringify(contribution), contribution.createdAt ?? nowIso());
    recordEvent(database, "cinematic.professional_contribution_saved", contribution.contributionId, { productionId, targetType: contribution.targetType, targetId: contribution.targetId });
    return contribution;
  };

  prototype.listProfessionalContributions = function listProfessionalContributions(projectId, productionId, targetType, targetId) {
    const database = this.database(projectId);
    const clauses = ["production_id=?"];
    const parameters = [productionId];
    if (targetType) { clauses.push("target_type=?"); parameters.push(targetType); }
    if (targetId) { clauses.push("target_id=?"); parameters.push(targetId); }
    return database.prepare(`SELECT contribution_json FROM professional_contributions WHERE ${clauses.join(" AND ")} ORDER BY created_at`).all(...parameters)
      .map((row) => parse(row.contribution_json, {}));
  };

  prototype.savePromptCompilation = function savePromptCompilation(projectId, compilation) {
    const database = this.database(projectId);
    database.prepare(`
      INSERT INTO prompt_compilations
        (id, production_id, generation_unit_id, payload_hash, compiler_version, manual_override, envelope_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(compilation.compilationId, compilation.productionId, compilation.generationUnitId, compilation.envelope.payloadHash,
      compilation.envelope.compilerVersion, compilation.envelope.manualOverride ? 1 : 0, JSON.stringify(compilation.envelope), compilation.createdAt);
    recordEvent(database, "cinematic.prompt_compiled", compilation.compilationId, { generationUnitId: compilation.generationUnitId, payloadHash: compilation.envelope.payloadHash });
    return compilation;
  };

  prototype.getPromptCompilation = function getPromptCompilation(projectId, productionId, generationUnitId) {
    const row = this.database(projectId).prepare(`
      SELECT id, production_id, generation_unit_id, envelope_json, created_at
      FROM prompt_compilations WHERE production_id=? AND generation_unit_id=? ORDER BY created_at DESC LIMIT 1
    `).get(productionId, generationUnitId);
    if (!row) return undefined;
    return { compilationId: row.id, productionId: row.production_id, generationUnitId: row.generation_unit_id, envelope: parse(row.envelope_json, {}), createdAt: row.created_at };
  };

  prototype.linkGenerationUnitRun = function linkGenerationUnitRun(projectId, generationUnitId, runId, compilationId, createdAt) {
    const database = this.database(projectId);
    database.prepare("INSERT INTO generation_unit_runs (generation_unit_id, run_id, compilation_id, created_at) VALUES (?, ?, ?, ?)")
      .run(generationUnitId, runId, compilationId, createdAt);
    recordEvent(database, "cinematic.generation_unit_run_linked", runId, { compilationId, generationUnitId });
    return { compilationId, createdAt, generationUnitId, runId };
  };

  prototype.saveCinematicEvaluation = function saveCinematicEvaluation(projectId, productionId, evaluation) {
    const database = this.database(projectId);
    database.prepare(`
      INSERT INTO cinematic_evaluations
        (id, production_id, generation_unit_id, run_id, media_id, decision, revision, evaluation_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(evaluation.evaluationId, productionId, evaluation.generationUnitId ?? null, evaluation.runId, evaluation.mediaId,
      evaluation.decision, evaluation.revision, JSON.stringify(evaluation), evaluation.createdAt);
    recordEvent(database, "cinematic.evaluation_saved", evaluation.evaluationId, { productionId, decision: evaluation.decision });
    return evaluation;
  };

  prototype.listCinematicEvaluations = function listCinematicEvaluations(projectId, productionId) {
    return this.database(projectId).prepare("SELECT evaluation_json FROM cinematic_evaluations WHERE production_id=? ORDER BY created_at DESC").all(productionId)
      .map((row) => parse(row.evaluation_json, {}));
  };
}
