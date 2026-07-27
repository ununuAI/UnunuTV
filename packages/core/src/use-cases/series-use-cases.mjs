import {
  UnuTvError,
  createId,
  nowIso,
  requireText,
  buildContinuityLedger
} from "@ununu/unutv-contracts";

export function createSeriesUseCases({ seriesStore, cinematic }) {
  if (!seriesStore) throw new TypeError("seriesStore is required");

  function requireSeries(seriesId) {
    const series = seriesStore.getSeries(seriesId);
    if (!series) throw new UnuTvError("series_not_found", `Series not found: ${seriesId}`, 404);
    return series;
  }

  async function createSeries(input = {}) {
    return seriesStore.createSeries({
      title: input.title,
      contentType: input.contentType || "short_drama",
      defaultAspectRatio: input.defaultAspectRatio,
      targetEpisodeSeconds: input.targetEpisodeSeconds || input.targetDurationSeconds
    });
  }

  async function listSeries() {
    return seriesStore.listSeries();
  }

  async function getSeries(input = {}) {
    const series = requireSeries(requireText(input.seriesId, "seriesId"));
    return {
      series,
      library: seriesStore.getLibrary(series.seriesId),
      ledger: seriesStore.getLedger(series.seriesId),
      episodes: seriesStore.listEpisodes(series.seriesId)
    };
  }

  async function createEpisode(input = {}) {
    const seriesId = requireText(input.seriesId, "seriesId");
    requireSeries(seriesId);
    const projectId = requireText(input.projectId, "projectId");
    let productionId = input.productionId || null;
    if (!productionId && cinematic?.createCinematicProduction) {
      const production = await cinematic.createCinematicProduction({
        projectId,
        sourceNodeId: input.sourceNodeId,
        title: input.title || `第${input.episodeNumber || 1}集`,
        projectType: input.projectType || "short_drama",
        productionMode: "production"
      });
      productionId = production.productionId;
    }
    if (!productionId) throw new UnuTvError("production_required", "createEpisode requires productionId or cinematic.createCinematicProduction", 400);
    return seriesStore.createEpisode({
      seriesId,
      projectId,
      productionId,
      sourceNodeId: input.sourceNodeId,
      episodeNumber: input.episodeNumber,
      title: input.title,
      brief: input.brief,
      status: "draft"
    });
  }

  async function listSeriesAssets(input = {}) {
    const seriesId = requireText(input.seriesId, "seriesId");
    requireSeries(seriesId);
    return seriesStore.getLibrary(seriesId);
  }

  async function promoteSeriesAsset(input = {}) {
    const seriesId = requireText(input.seriesId, "seriesId");
    requireSeries(seriesId);
    const library = seriesStore.getLibrary(seriesId);
    const entries = Array.isArray(library?.entries) ? library.entries : [];
    const entryId = input.entryId || createId("shared-asset");
    const displayName = input.displayName || input.entryId || "asset";
    const authorityId = input.authorityId || null;
    const parentEntryId = input.parentEntryId || null;

    // Freeze protection: never silently replace a frozen accepted identity with a new face.
    // Variants must declare parentEntryId; same entryId may refresh media only when force=true.
    const frozenIdentity = entries.find((item) => (
      item.status === "accepted"
      && item.freeze === true
      && !item.parentEntryId
      && (
        (authorityId && item.authorityId === authorityId)
        || (!authorityId && item.displayName === displayName && item.kind === (input.kind || "character"))
      )
      && item.entryId !== entryId
      && !parentEntryId
    ));
    if (frozenIdentity && input.force !== true) {
      throw new UnuTvError(
        "shared_asset_frozen",
        `Cannot promote a new identity over frozen shared asset ${frozenIdentity.entryId} (${frozenIdentity.displayName}). Use parentEntryId for a variant or force=true after Owner approval.`,
        409,
        { frozenEntryId: frozenIdentity.entryId, acceptedMediaId: frozenIdentity.acceptedMediaId }
      );
    }
    const existing = entries.find((item) => item.entryId === entryId);
    if (existing?.freeze === true && existing.status === "accepted" && input.force !== true) {
      const mediaChanged = existing.acceptedMediaId !== requireText(input.acceptedMediaId, "acceptedMediaId");
      const versionChanged = (existing.acceptedVersionId || null) !== (input.acceptedVersionId || null);
      if (mediaChanged || versionChanged) {
        throw new UnuTvError(
          "shared_asset_frozen",
          `Shared asset ${entryId} is frozen; refuse silent media/version overwrite without force=true`,
          409,
          { entryId, acceptedMediaId: existing.acceptedMediaId }
        );
      }
    }

    const entry = {
      entryId,
      kind: input.kind || "character",
      displayName,
      authorityId,
      acceptedMediaId: requireText(input.acceptedMediaId, "acceptedMediaId"),
      acceptedVersionId: input.acceptedVersionId || null,
      freeze: input.freeze !== false,
      parentEntryId,
      promoteEpisodeId: input.promoteEpisodeId || null,
      status: "accepted"
    };
    const next = {
      ...library,
      entries: [...entries.filter((item) => item.entryId !== entry.entryId), entry],
      updatedAt: nowIso()
    };
    return seriesStore.saveLibrary(next);
  }

  async function linkEpisodeWorkflow(input = {}) {
    const seriesId = requireText(input.seriesId, "seriesId");
    requireSeries(seriesId);
    const episodeId = requireText(input.episodeId, "episodeId");
    const episode = seriesStore.getEpisode(seriesId, episodeId);
    if (!episode) throw new UnuTvError("episode_not_found", `Episode not found: ${episodeId}`, 404);
    return seriesStore.saveEpisode({
      ...episode,
      workflowRunId: input.workflowRunId ?? episode.workflowRunId,
      status: input.status || episode.status || "running",
      productionId: input.productionId || episode.productionId,
      sourceNodeId: input.sourceNodeId || episode.sourceNodeId
    });
  }

  async function getSeriesLedger(input = {}) {
    const seriesId = requireText(input.seriesId, "seriesId");
    requireSeries(seriesId);
    return seriesStore.getLedger(seriesId);
  }

  async function commitSeriesLedger(input = {}) {
    const seriesId = requireText(input.seriesId, "seriesId");
    requireSeries(seriesId);
    const current = seriesStore.getLedger(seriesId);
    const episodeId = input.episodeId || null;
    const patch = input.patch && typeof input.patch === "object" ? input.patch : {};
    const next = buildContinuityLedger({
      ...current,
      revision: (Number(current.revision) || 0) + 1,
      characters: { ...current.characters, ...(patch.characters || {}) },
      props: { ...current.props, ...(patch.props || {}) },
      plot: {
        promisesOpen: patch.plot?.promisesOpen ?? current.plot?.promisesOpen ?? [],
        revealedFacts: [
          ...new Set([...(current.plot?.revealedFacts || []), ...(patch.plot?.revealedFacts || [])])
        ],
        forbiddenEarlyInfo: [
          ...new Set([...(current.plot?.forbiddenEarlyInfo || []), ...(patch.plot?.forbiddenEarlyInfo || [])])
        ]
      },
      world: { ...current.world, ...(patch.world || {}) },
      sourceEpisodeId: episodeId || current.sourceEpisodeId
    });
    const saved = seriesStore.saveLedger(next);
    if (episodeId) {
      const episode = seriesStore.getEpisode(seriesId, episodeId);
      if (episode) {
        seriesStore.saveEpisode({
          ...episode,
          status: "delivered",
          exitLedgerRevision: saved.revision
        });
      }
    }
    return saved;
  }

  /**
   * Bind accepted shared library media ids for reuse on episode open.
   */
  async function bindSharedAssetsForEpisode(input = {}) {
    const seriesId = requireText(input.seriesId, "seriesId");
    requireSeries(seriesId);
    const library = seriesStore.getLibrary(seriesId);
    const accepted = (library?.entries || []).filter((entry) => entry.status === "accepted" && entry.acceptedMediaId);
    return {
      libraryId: library.libraryId,
      bindings: accepted.map((entry, index) => ({
        assetId: entry.authorityId || entry.entryId,
        versionId: entry.acceptedVersionId || `v-${entry.entryId}`,
        mediaId: entry.acceptedMediaId,
        displayName: entry.displayName,
        role: entry.kind === "scene" ? "scene_authority" : entry.kind === "prop" ? "prop_authority" : "character_identity",
        authorityRevision: "shared-library",
        providerIndex: index + 1,
        controls: entry.kind === "scene" ? ["场景拓扑与陈设"] : ["角色身份与外形"],
        doesNotControl: entry.kind === "scene" ? ["角色表演"] : ["场景拓扑"],
        required: true,
        freeze: entry.freeze === true
      })),
      reuseRate: accepted.length ? 1 : 0,
      boundEntryIds: accepted.map((entry) => entry.entryId)
    };
  }

  return {
    createSeries,
    listSeries,
    getSeries,
    createEpisode,
    listSeriesAssets,
    promoteSeriesAsset,
    getSeriesLedger,
    commitSeriesLedger,
    bindSharedAssetsForEpisode,
    linkEpisodeWorkflow
  };
}
