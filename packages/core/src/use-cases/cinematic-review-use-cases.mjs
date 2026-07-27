import { assertCinematicContract, createId, nowIso, requireObject, requireText, UnuTvError } from "@ununu/unutv-contracts";
import { enforceCinematicEvaluationAcceptance } from "../cinematic-evaluation-gate-policy.mjs";
import { projectCinematicEvaluationToNodePayload } from "../cinematic-evaluation-node-policy.mjs";
import { ensureCinematicEvaluationRun } from "./cinematic-evaluation-run-use-case.mjs";

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
