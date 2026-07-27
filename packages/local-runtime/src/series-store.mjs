import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  buildSeriesProject,
  buildEpisodeRecord,
  buildSharedAssetLibrary,
  buildContinuityLedger,
  createId,
  nowIso
} from "@ununu/unutv-contracts";

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch { return fallback; }
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

/**
 * File-backed series / shared-library / continuity-ledger store under dataRoot/series.
 */
export function createSeriesStore(dataRoot) {
  const root = join(dataRoot, "series");
  mkdirSync(root, { recursive: true });

  function seriesDir(seriesId) {
    return join(root, seriesId);
  }

  function ensureDir(seriesId) {
    mkdirSync(seriesDir(seriesId), { recursive: true });
  }

  return {
    listSeries() {
      if (!existsSync(root)) return [];
      return readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => this.getSeries(entry.name))
        .filter(Boolean);
    },
    getSeries(seriesId) {
      const path = join(seriesDir(seriesId), "series.json");
      return readJson(path, null);
    },
    saveSeries(series) {
      ensureDir(series.seriesId);
      const next = { ...series, updatedAt: nowIso() };
      writeJson(join(seriesDir(series.seriesId), "series.json"), next);
      return next;
    },
    createSeries(input = {}) {
      const seriesId = input.seriesId || createId("series");
      const libraryId = input.sharedAssetLibraryId || createId("asset-library");
      const ledgerId = input.ledgerId || createId("ledger");
      ensureDir(seriesId);
      const series = buildSeriesProject({
        seriesId,
        title: input.title,
        contentType: input.contentType,
        sharedAssetLibraryId: libraryId,
        ledgerId,
        episodeIds: [],
        defaultAspectRatio: input.defaultAspectRatio,
        targetEpisodeSeconds: input.targetEpisodeSeconds
      });
      this.saveSeries(series);
      this.saveLibrary(buildSharedAssetLibrary({ libraryId, seriesId, entries: [] }));
      this.saveLedger(buildContinuityLedger({ ledgerId, seriesId, revision: 0 }));
      return series;
    },
    getLibrary(seriesId) {
      const series = this.getSeries(seriesId);
      if (!series) return null;
      return readJson(join(seriesDir(seriesId), "library.json"), null);
    },
    saveLibrary(library) {
      ensureDir(library.seriesId);
      const next = { ...library, updatedAt: nowIso() };
      writeJson(join(seriesDir(library.seriesId), "library.json"), next);
      return next;
    },
    getLedger(seriesId) {
      const series = this.getSeries(seriesId);
      if (!series) return null;
      return readJson(join(seriesDir(seriesId), "ledger.json"), null);
    },
    saveLedger(ledger) {
      ensureDir(ledger.seriesId);
      const next = { ...ledger, updatedAt: nowIso() };
      writeJson(join(seriesDir(ledger.seriesId), "ledger.json"), next);
      return next;
    },
    listEpisodes(seriesId) {
      const dir = join(seriesDir(seriesId), "episodes");
      if (!existsSync(dir)) return [];
      return readdirSync(dir)
        .filter((name) => name.endsWith(".json"))
        .map((name) => readJson(join(dir, name), null))
        .filter(Boolean)
        .sort((a, b) => a.episodeNumber - b.episodeNumber);
    },
    getEpisode(seriesId, episodeId) {
      return readJson(join(seriesDir(seriesId), "episodes", `${episodeId}.json`), null);
    },
    getEpisodeByNumber(seriesId, episodeNumber) {
      return this.listEpisodes(seriesId).find((entry) => entry.episodeNumber === Number(episodeNumber)) ?? null;
    },
    saveEpisode(episode) {
      ensureDir(episode.seriesId);
      mkdirSync(join(seriesDir(episode.seriesId), "episodes"), { recursive: true });
      const next = { ...episode, updatedAt: nowIso() };
      writeJson(join(seriesDir(episode.seriesId), "episodes", `${episode.episodeId}.json`), next);
      const series = this.getSeries(episode.seriesId);
      if (series && !series.episodeIds.includes(episode.episodeId)) {
        this.saveSeries({ ...series, episodeIds: [...series.episodeIds, episode.episodeId] });
      }
      return next;
    },
    createEpisode(input = {}) {
      const series = this.getSeries(input.seriesId);
      if (!series) throw new Error(`series_not_found:${input.seriesId}`);
      const episodeNumber = Number(input.episodeNumber) || (this.listEpisodes(series.seriesId).length + 1);
      const ledger = this.getLedger(series.seriesId);
      const episode = buildEpisodeRecord({
        episodeId: input.episodeId || createId("episode"),
        seriesId: series.seriesId,
        episodeNumber,
        projectId: input.projectId,
        productionId: input.productionId,
        sourceNodeId: input.sourceNodeId,
        title: input.title,
        brief: input.brief,
        status: input.status || "draft",
        entryLedgerRevision: ledger?.revision ?? 0
      });
      return this.saveEpisode(episode);
    }
  };
}
