import {
  CINEMATIC_WORKFLOW_CONTRACT_VERSION,
  CINEMATIC_WORKFLOW_PHASES,
  CINEMATIC_WORKFLOW_SKILL_ID,
  CINEMATIC_WORKFLOW_SKILL_VERSION,
  UnuTvError,
  assertCinematicWorkflowManifest,
  nowIso,
  resolveCinematicFormatProfile
} from "@ununu/unutv-contracts";

export const FORMAL_GENERATION_UNIT_RUN = Symbol("formal-generation-unit-run");

export function buildCinematicWorkflowManifest(input = {}) {
  const formatProfile = resolveCinematicFormatProfile({
    aspectRatio: input.aspectRatio,
    projectType: input.projectType
  });
  const manifest = {
    format: "UnunuCinematicWorkflowManifest",
    contractVersion: CINEMATIC_WORKFLOW_CONTRACT_VERSION,
    workflowId: input.workflowId,
    skillId: input.skillId ?? CINEMATIC_WORKFLOW_SKILL_ID,
    skillVersion: input.skillVersion ?? CINEMATIC_WORKFLOW_SKILL_VERSION,
    productionId: input.productionId,
    sourceNodeId: input.sourceNodeId,
    aspectRatio: formatProfile.aspectRatio,
    formatProfile,
    phases: [...CINEMATIC_WORKFLOW_PHASES],
    targetDurationSeconds: input.targetDurationSeconds ?? 30,
    deliveryMode: input.deliveryMode ?? "single_request_orchestration",
    // Formal video is a normal production stage, not a second billing dialog.
    // The workflow first accepts cheap visual proof, then records one exact
    // revision-bound submission intent before dispatch.
    paidBoundary: "previs_accept_then_single_formal_intent",
    billingMode: "provider_account",
    referencePolicy: {
      semanticImageReference: true,
      firstLastFrameMutuallyExclusive: true,
      annotatedReferenceAllowed: true,
      wholeSceneLocatorForLocalShot: true,
      annotationConflictAction: "block",
      ...(input.referencePolicy ?? {})
    },
    providerPolicy: {
      providerCalls: "only_after_previs_accept_and_formal_intent",
      noProviderOnStart: true,
      ...(input.providerPolicy ?? {})
    },
    canvasPolicy: {
      allProductionCapabilitiesVisible: true,
      compiledPromptsPersisted: true,
      referenceEdgesRequired: true,
      ...(input.canvasPolicy ?? {})
    },
    agentPolicy: {
      executorOnly: true,
      nextActionOnly: true,
      officialSkillCliApiOnly: true,
      browserProductionMutationAllowed: false,
      adHocTerminalProductionMutationAllowed: false,
      ...(input.agentPolicy ?? {})
    },
    generationStrategies: input.generationStrategies ?? {},
    skillContext: input.skillContext,
    createdAt: input.createdAt ?? nowIso()
  };
  return assertCinematicWorkflowManifest(manifest);
}

export function assertCinematicProductionWorkflow({ production, sourceNode, manifest }) {
  if (!production || production.productionMode !== "production") {
    throw new UnuTvError("cinematic_production_mode_required", "Cinematic workflow requires a production-mode cinematic production", 409);
  }
  if (!sourceNode) throw new UnuTvError("source_node_not_found", "Cinematic workflow source node was not found", 404);
  if (!['script', 'story', 'text'].includes(sourceNode.kind)) {
    throw new UnuTvError("invalid_workflow_source_node", "Cinematic workflow source node must be a script, story, or text node", 409, { nodeKind: sourceNode.kind });
  }
  if (production.sourceNodeId && production.sourceNodeId !== sourceNode.id) {
    throw new UnuTvError("workflow_source_mismatch", "Workflow source node does not match the production source node", 409, { productionSourceNodeId: production.sourceNodeId, sourceNodeId: sourceNode.id });
  }
  if (manifest.productionId !== production.productionId || manifest.sourceNodeId !== sourceNode.id) {
    throw new UnuTvError("workflow_manifest_scope_mismatch", "Workflow manifest is scoped to a different production or source node", 409);
  }
  return manifest;
}

export function assertProductionNodeRunAllowed(node, { generationUnitId = null, authorization = null } = {}) {
  if (generationUnitId && authorization === FORMAL_GENERATION_UNIT_RUN) return node;
  const payload = node?.payload ?? {};
  const productionBound = payload.productionId || payload.cinematicProductionId || payload.generationUnitId || payload.workflowId;
  if (productionBound && ["image", "video", "videoShot", "audio", "generationUnit"].includes(node.kind)) {
    throw new UnuTvError(
      "formal_generation_unit_required",
      "Production-bound media cannot bypass the cinematic workflow; compile and preflight a GenerationUnit before running it",
      409,
      { nodeId: node.id, nodeKind: node.kind, productionId: payload.productionId ?? payload.cinematicProductionId ?? null }
    );
  }
  return node;
}
