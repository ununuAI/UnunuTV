import { requireText, UnuTvError } from "@ununu/unutv-contracts";

/**
 * Public end-to-end entry adapter.
 *
 * This is intentionally a thin UnunuTV boundary: it may create the minimal
 * project/source records needed to start a workflow, but it must not design a
 * story, invent characters, fabricate media, accept creative revisions, or
 * call a Provider. All creative orchestration belongs to the persisted
 * cinematic workflow and its nextAction loop.
 */
export function createCinematicWorkflowEntryUseCases({
  createProject,
  createNode,
  createCinematicProduction,
  startCinematicWorkflow
} = {}) {
  if (typeof createProject !== "function"
    || typeof createNode !== "function"
    || typeof createCinematicProduction !== "function"
    || typeof startCinematicWorkflow !== "function") {
    throw new TypeError("canonical cinematic workflow entry requires project, node, production, and workflow ports");
  }

  async function startShortDramaWorkflow(input = {}) {
    const data = input.data && typeof input.data === "object" ? input.data : {};
    const brief = requireText(input.brief ?? data.brief, "brief");
    if (input.placeholderImagePath || data.placeholderImagePath) {
      throw new UnuTvError(
        "placeholder_media_forbidden",
        "The canonical cinematic workflow cannot use placeholder images; provide real approved UnunuTV media or remain blocked",
        400
      );
    }

    const title = input.title || data.title || brief.slice(0, 48) || "短剧第1集";
    const targetDurationSeconds = Number(input.targetDurationSeconds ?? input.duration ?? data.targetDurationSeconds ?? 60);
    const aspectRatio = input.aspectRatio || data.aspectRatio || "9:16";
    const dryRun = input.dryRun === true || data.dryRun === true;
    const execute = !dryRun && input.execute !== false && data.execute !== false;
    const projectId = input.projectId || data.projectId || null;
    const productionId = input.productionId || data.productionId || null;
    const sourceNodeId = input.sourceNodeId || data.sourceNodeId || null;
    let project = null;
    let canvas = null;
    let sourceNode = null;
    let production = null;

    if (!projectId && (productionId || sourceNodeId)) {
      throw new UnuTvError("canonical_entry_ids_incomplete", "productionId/sourceNodeId require projectId", 400);
    }
    if (projectId && (!productionId || !sourceNodeId)) {
      throw new UnuTvError(
        "canonical_entry_ids_required",
        "An existing project must provide both productionId and sourceNodeId; the entry adapter does not guess or mutate an unrelated canvas",
        400
      );
    }

    if (!projectId) {
      const created = await createProject({ title });
      project = created.project;
      canvas = created.canvas;
      sourceNode = await createNode({
        projectId: project.id,
        canvasId: canvas.id,
        kind: "script",
        title: "剧本",
        payload: {
          brief,
          contentType: "short_drama",
          targetDurationSeconds,
          aspectRatio,
          stage: "script",
          stageStatus: "pending",
          source: "owner_input"
        }
      });
      production = await createCinematicProduction({
        projectId: project.id,
        sourceNodeId: sourceNode.id,
        title,
        projectType: "short_drama"
      });
    }

    const resolvedProjectId = project?.id || projectId;
    const resolvedProductionId = production?.productionId || productionId;
    const resolvedSourceNodeId = sourceNode?.id || sourceNodeId;
    const generationStrategies = input.generationStrategies
      || data.generationStrategies
      || ((input.provider || input.model || data.provider || data.model)
        ? {
          video_generation: {
            provider: input.provider || data.provider,
            model: input.model || data.model,
            executionNodeId: input.executionNodeId || data.executionNodeId
          }
        }
        : undefined);
    // Reference media are creative inputs, not an optional UI decoration. Keep
    // the exact bindings in the durable workflow configuration so every later
    // stage (asset authority, storyboard, prompt compilation and Provider
    // dispatch) sees the same source of truth. Do not infer or replace them.
    const referenceBindings = input.referenceBindings
      ?? data.referenceBindings
      ?? input.configuration?.referenceBindings
      ?? data.configuration?.referenceBindings
      ?? [];
    const referenceMediaIds = input.referenceMediaIds
      ?? data.referenceMediaIds
      ?? input.configuration?.referenceMediaIds
      ?? data.configuration?.referenceMediaIds
      ?? [];
    if (!Array.isArray(referenceBindings) || !Array.isArray(referenceMediaIds)) {
      throw new UnuTvError("canonical_reference_inputs_invalid", "referenceBindings and referenceMediaIds must be arrays; UnunuTV will not guess missing visual sources", 400);
    }
    const visualAnchorPolicy = input.visualAnchorPolicy
      ?? data.visualAnchorPolicy
      ?? input.configuration?.visualAnchorPolicy
      ?? data.configuration?.visualAnchorPolicy
      ?? null;
    const generationMode = input.generationMode
      ?? data.generationMode
      ?? input.configuration?.generationMode
      ?? data.configuration?.generationMode
      ?? null;
    const storyPacket = input.storyPacket ?? data.storyPacket ?? input.configuration?.storyPacket ?? data.configuration?.storyPacket ?? null;
    const visualBible = input.visualBible ?? data.visualBible ?? input.configuration?.visualBible ?? data.configuration?.visualBible ?? null;
    const scriptRows = input.scriptRows ?? data.scriptRows ?? input.configuration?.scriptRows ?? data.configuration?.scriptRows ?? null;
    const configuration = {
      ...(data.configuration && typeof data.configuration === "object" ? data.configuration : {}),
      ...(input.configuration && typeof input.configuration === "object" ? input.configuration : {}),
      brief,
      aspectRatio,
      targetDurationSeconds,
      execute,
      fullDelivery: !dryRun && input.fullDelivery !== false && data.fullDelivery !== false,
      oneShot: false,
      autoAcceptTakes: false,
      referenceBindings,
      referenceMediaIds,
      ...(visualAnchorPolicy ? { visualAnchorPolicy } : {}),
      ...(generationMode ? { generationMode } : {}),
      ...(storyPacket ? { storyPacket } : {}),
      ...(visualBible ? { visualBible } : {}),
      ...(Array.isArray(scriptRows) ? { scriptRows } : {}),
      ...(generationStrategies ? { generationStrategies } : {})
    };
    const started = await startCinematicWorkflow({
      ...input,
      projectId: resolvedProjectId,
      productionId: resolvedProductionId,
      sourceNodeId: resolvedSourceNodeId,
      brief,
      targetDurationSeconds,
      generationStrategies,
      execute,
      configuration
    });
    return {
      ...started,
      entrypoint: "workflow.cinematic",
      orchestrationOwner: "ununu-unutv",
      providerCallsIssued: false,
      created: {
        projectId: project?.id || null,
        canvasId: canvas?.id || null,
        sourceNodeId: sourceNode?.id || null,
        productionId: production?.productionId || null
      }
    };
  }

  return { startShortDramaWorkflow };
}
