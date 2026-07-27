/**
 * Legacy one-shot entry removed.
 * Keeps only the historical evaluation helper; one-shot production is removed.
 */
import { buildStructuralAcceptEvaluation } from "./evaluation-accept-helper.mjs";

export function buildOneShotAcceptEvaluation(input) {
  return buildStructuralAcceptEvaluation(input);
}

export function createOneShotUseCases() {
  return {
    // Deprecated: callers must use the canonical cinematic workflow entry.
    oneShotCinematicEpisode: async () => {
      const { UnuTvError } = await import("@ununu/unutv-contracts");
      throw new UnuTvError(
        "one_shot_removed",
        "one-shot black-box entry was removed. Use workflow short-drama (canonical UnunuTV cinematic workflow).",
        410
      );
    },
    buildOneShotAcceptEvaluation
  };
}
