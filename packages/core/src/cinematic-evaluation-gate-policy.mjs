import { UnuTvError, auditCinematicEvaluationGate } from "@ununu/unutv-contracts";

/** Persisted review records may reject freely, but ACCEPT must satisfy every defining visual fact. */
export function enforceCinematicEvaluationAcceptance(evaluation, generationUnitRecord) {
  if (!evaluation?.generationUnitId) return { acceptAllowed: true, errors: [], ok: true };
  if (!generationUnitRecord?.generationUnit) {
    throw new UnuTvError("generation_unit_not_found", `Generation unit not found: ${evaluation.generationUnitId}`, 404);
  }
  const gate = auditCinematicEvaluationGate({ generationUnit: generationUnitRecord.generationUnit, evaluation });
  if (gate.persistAllowed === false) {
    throw new UnuTvError("cinematic_evaluation_sequence_gate_failed", "审片缺少真实状态对账或返工处置与结论不兼容。", 409, gate);
  }
  if (evaluation.decision === "ACCEPT" && !gate.acceptAllowed) {
    throw new UnuTvError(
      "cinematic_evaluation_gate_failed",
      "定义性视觉事实未通过，禁止将候选标记为 ACCEPT。",
      409,
      gate
    );
  }
  return gate;
}
