import { assertCinematicContract, createId, nowIso, requireObject, requireText, UnuTvError } from "@ununu/unutv-contracts";
import { enforceCinematicEvaluationAcceptance } from "../cinematic-evaluation-gate-policy.mjs";
import { projectCinematicEvaluationToNodePayload } from "../cinematic-evaluation-node-policy.mjs";
import { ensureCinematicEvaluationRun } from "./cinematic-evaluation-run-use-case.mjs";

function evaluationEvidencePayload(payload = {}, evaluation = {}, productionId = null) {
  return {
    ...payload,
    productionId: payload.productionId ?? productionId,
    stage: "continuity_qa",
    resourceType: "cinematic_evaluation_evidence",
    cinematicEvaluationId: evaluation.evaluationId,
    cinematicEvaluationRevision: evaluation.revision,
    evaluatedGenerationUnitId: evaluation.generationUnitId ?? null,
    evaluatedMediaId: evaluation.mediaId,
    evaluationDecision: evaluation.decision,
    evaluationUsableRanges: evaluation.usableRanges,
    evaluationActualExitState: evaluation.actualExitState,
    evaluationRepairSuggestions: evaluation.repairSuggestions,
    evaluationVetoFindings: evaluation.vetoFindings ?? [],
    evaluationQaCompleted: true
  };
}

export function createCinematicReviewUseCases({ ports, requireProduction, getUnitRecord, saveEvaluationRecord, listEvaluationRecords }) {
  async function addEvaluation(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const productionId = requireText(input.productionId, "productionId");
    await requireProduction(projectId, productionId);
    const submitted = requireObject(input.evaluation, "evaluation");
    const { runId } = await ensureCinematicEvaluationRun(ports, projectId, submitted);
    const evaluation = {
      ...submitted, runId,
      evaluationId: submitted.evaluationId || createId("cinematic-evaluation"),
      revision: submitted.revision === undefined ? 1 : Number(submitted.revision),
      createdAt: nowIso()
    };
    assertCinematicContract("CinematicEvaluationRecord", evaluation);
    if (evaluation.generationUnitId) enforceCinematicEvaluationAcceptance(evaluation, await getUnitRecord(projectId, productionId, evaluation.generationUnitId));
    const saved = await saveEvaluationRecord(projectId, productionId, evaluation);
    if (typeof saved.sourceNodeId === "string" && saved.sourceNodeId.trim() && typeof ports.projects?.getNode === "function" && typeof ports.projects?.updateNode === "function") {
      const node = await ports.projects.getNode(projectId, saved.sourceNodeId);
      if (node) await ports.projects.updateNode(projectId, node.id, { payload: projectCinematicEvaluationToNodePayload(node.payload, saved) }, node.revision);
    }
    if (typeof saved.evidenceNodeId === "string" && saved.evidenceNodeId.trim() && typeof ports.projects?.getNode === "function" && typeof ports.projects?.updateNode === "function") {
      const evidenceNode = await ports.projects.getNode(projectId, saved.evidenceNodeId);
      if (!evidenceNode) throw new UnuTvError("evaluation_evidence_node_not_found", `Evaluation evidence node not found: ${saved.evidenceNodeId}`, 404);
      if (!["image", "review", "qa", "compose"].includes(evidenceNode.kind)) {
        throw new UnuTvError("evaluation_evidence_node_kind_invalid", "审片记录必须投影到可见的图片、Review、QA 或合成节点。", 409, {
          evidenceNodeId: evidenceNode.id,
          kind: evidenceNode.kind
        });
      }
      await ports.projects.updateNode(projectId, evidenceNode.id, {
        payload: evaluationEvidencePayload(evidenceNode.payload, saved, productionId)
      }, evidenceNode.revision);
    }
    return saved;
  }

  async function listEvaluations(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const productionId = requireText(input.productionId, "productionId");
    await requireProduction(projectId, productionId);
    return listEvaluationRecords(projectId, productionId);
  }

  return { addEvaluation, listEvaluations };
}
