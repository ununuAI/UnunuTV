/** Platform OS contracts: nextAction, series, shared assets, continuity ledger. */

export const NEXT_ACTION_TYPES = Object.freeze([
  "advance", "run_worker", "owner_gate", "repair", "wait_provider",
  "promote_asset", "commit_ledger", "done", "failed"
]);

export const SERIES_EPISODE_STATES = Object.freeze([
  "draft", "running", "blocked", "delivered", "failed"
]);

export const SHARED_ASSET_KINDS = Object.freeze([
  "character", "scene", "prop", "voice", "costume_variant"
]);

export const SHARED_ASSET_STATES = Object.freeze([
  "candidate", "accepted", "deprecated"
]);

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Build a machine-readable nextAction for local thin skills / orchestrator clients.
 */
export function buildNextAction(input = {}) {
  const type = NEXT_ACTION_TYPES.includes(input.type) ? input.type : "failed";
  return {
    actionId: input.actionId ?? `na-${Date.now().toString(36)}`,
    type,
    phase: input.phase ?? null,
    seriesId: input.seriesId ?? null,
    episodeNumber: input.episodeNumber ?? null,
    worker: input.worker ?? null,
    command: isRecord(input.command) ? input.command : null,
    blocker: isRecord(input.blocker) ? input.blocker : null,
    ownerGate: isRecord(input.ownerGate) ? input.ownerGate : null,
    promptAuthority: isRecord(input.promptAuthority) ? input.promptAuthority : null,
    assetReuse: isRecord(input.assetReuse) ? input.assetReuse : null,
    idempotencyKey: input.idempotencyKey ?? null,
    message: typeof input.message === "string" ? input.message : null
  };
}

export function buildSeriesProject(input = {}) {
  const now = input.createdAt ?? new Date().toISOString();
  return {
    seriesId: input.seriesId,
    title: input.title ?? "未命名系列",
    contentType: input.contentType ?? "short_drama",
    sharedAssetLibraryId: input.sharedAssetLibraryId,
    ledgerId: input.ledgerId,
    episodeIds: Array.isArray(input.episodeIds) ? [...input.episodeIds] : [],
    defaultAspectRatio: input.defaultAspectRatio ?? "9:16",
    targetEpisodeSeconds: Number(input.targetEpisodeSeconds) > 0 ? Number(input.targetEpisodeSeconds) : 60,
    createdAt: now,
    updatedAt: input.updatedAt ?? now
  };
}

export function buildEpisodeRecord(input = {}) {
  const now = input.createdAt ?? new Date().toISOString();
  return {
    episodeId: input.episodeId,
    seriesId: input.seriesId,
    episodeNumber: Number(input.episodeNumber) || 1,
    projectId: input.projectId,
    productionId: input.productionId,
    sourceNodeId: input.sourceNodeId ?? null,
    title: input.title ?? `第${Number(input.episodeNumber) || 1}集`,
    brief: input.brief ?? "",
    status: SERIES_EPISODE_STATES.includes(input.status) ? input.status : "draft",
    entryLedgerRevision: Number(input.entryLedgerRevision) || 0,
    exitLedgerRevision: input.exitLedgerRevision == null ? null : Number(input.exitLedgerRevision),
    workflowRunId: input.workflowRunId ?? null,
    createdAt: now,
    updatedAt: input.updatedAt ?? now
  };
}

export function buildSharedAssetLibrary(input = {}) {
  return {
    libraryId: input.libraryId,
    seriesId: input.seriesId,
    entries: Array.isArray(input.entries) ? input.entries.map((entry) => ({
      entryId: entry.entryId,
      kind: SHARED_ASSET_KINDS.includes(entry.kind) ? entry.kind : "character",
      displayName: entry.displayName ?? entry.entryId,
      authorityId: entry.authorityId ?? null,
      acceptedMediaId: entry.acceptedMediaId ?? null,
      acceptedVersionId: entry.acceptedVersionId ?? null,
      freeze: entry.freeze !== false,
      parentEntryId: entry.parentEntryId ?? null,
      promoteEpisodeId: entry.promoteEpisodeId ?? null,
      status: SHARED_ASSET_STATES.includes(entry.status) ? entry.status : "candidate"
    })) : [],
    updatedAt: input.updatedAt ?? new Date().toISOString()
  };
}

export function buildContinuityLedger(input = {}) {
  return {
    ledgerId: input.ledgerId,
    seriesId: input.seriesId,
    revision: Number(input.revision) || 0,
    characters: isRecord(input.characters) ? input.characters : {},
    props: isRecord(input.props) ? input.props : {},
    plot: {
      promisesOpen: Array.isArray(input.plot?.promisesOpen) ? input.plot.promisesOpen : [],
      revealedFacts: Array.isArray(input.plot?.revealedFacts) ? input.plot.revealedFacts : [],
      forbiddenEarlyInfo: Array.isArray(input.plot?.forbiddenEarlyInfo) ? input.plot.forbiddenEarlyInfo : []
    },
    world: isRecord(input.world) ? input.world : { timeProgress: "", activeSceneAuthorityIds: [] },
    sourceEpisodeId: input.sourceEpisodeId ?? null,
    updatedAt: input.updatedAt ?? new Date().toISOString()
  };
}

/**
 * Knowledge refs are grounded only when every cap-/kn- id resolves and is usable.
 * Callers pass resolved maps from Knowledge Port.
 */
export function assertKnowledgeRefsGrounded(refs, resolved = {}) {
  const list = Array.isArray(refs) ? refs.map((entry) => String(entry || "").trim()).filter(Boolean) : [];
  const caps = list.filter((entry) => entry.startsWith("cap-"));
  const kns = list.filter((entry) => entry.startsWith("kn-"));
  const errors = [];
  if (!caps.length || !kns.length) {
    errors.push({ code: "knowledge_ref_shape_invalid", message: "knowledgeRefs must include at least one cap-* and one kn-*" });
  }
  const capMap = resolved.capabilities instanceof Map ? resolved.capabilities : new Map(Object.entries(resolved.capabilities || {}));
  const knMap = resolved.atoms instanceof Map ? resolved.atoms : new Map(Object.entries(resolved.atoms || {}));
  for (const id of caps) {
    const hit = capMap.get(id);
    if (!hit) errors.push({ code: "capability_not_found", message: `Unknown capability: ${id}`, id });
    else if (String(hit.status || "ACTIVE").toUpperCase() === "SUSPENDED") {
      errors.push({ code: "capability_suspended", message: `Capability suspended: ${id}`, id });
    }
  }
  for (const id of kns) {
    const hit = knMap.get(id);
    if (!hit) errors.push({ code: "knowledge_atom_not_found", message: `Unknown knowledge atom: ${id}`, id });
    else if (String(hit.status || "ACTIVE").toUpperCase() === "SUSPENDED") {
      errors.push({ code: "knowledge_atom_suspended", message: `Knowledge atom suspended: ${id}`, id });
    }
  }
  return { ok: errors.length === 0, errors, caps, kns };
}
