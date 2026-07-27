import { UnuTvError } from "@ununu/unutv-contracts";

/**
 * Migration tombstone for the former direct short-drama canvas pipeline.
 *
 * The old implementation mixed creative planning, placeholder media,
 * automatic reviews, Provider dispatch, and timeline assembly in one use-case.
 * It is intentionally no longer present in the runtime. Keeping this small
 * tombstone preserves an actionable error for stale callers while forcing all
 * production requests through the canonical cinematic workflow entry.
 */
export function createShortDramaCanvasUseCases() {
  async function produceShortDramaOnCanvas() {
    throw new UnuTvError(
      "legacy_short_drama_pipeline_blocked",
      "The legacy short-drama canvas pipeline is sealed; use workflow short-drama to enter the UnunuTV cinematic workflow",
      410
    );
  }

  return { produceShortDramaOnCanvas };
}
