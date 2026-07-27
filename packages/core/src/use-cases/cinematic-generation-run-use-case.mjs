import { assertCinematicPromptDraft, assertFormalGenerationIntent, createBoundPromptDocumentV1, promptDocumentReferenceBindings, UnuTvError, nowIso, requireObject, requireText } from "@ununu/unutv-contracts";
import { FORMAL_GENERATION_UNIT_RUN } from "../cinematic-workflow-policy.mjs";

const VIDEO_NODE_KINDS = new Set(["video", "videoShot", "video-clip"]);

export function auditCompiledProviderReferenceSet(envelope, parameters) {
  const bindings = Array.isArray(envelope?.referenceBindings) ? envelope.referenceBindings : [];
  const providerMediaIds = Array.isArray(parameters?.referenceMediaIds) ? parameters.referenceMediaIds.filter(Boolean) : [];
  const frameIds = new Set([parameters?.firstFrameMediaId, parameters?.lastFrameMediaId].filter(Boolean));
  const expected = bindings
    .filter((binding) => binding?.providerEligible !== false && !frameIds.has(binding?.mediaId))
    .sort((left, right) => Number(left.providerIndex || 0) - Number(right.providerIndex || 0));
  const expectedMediaIds = expected.map((binding) => binding.mediaId).filter(Boolean);
  const errors = [];
  if (expectedMediaIds.length !== providerMediaIds.length || expectedMediaIds.some((mediaId, index) => mediaId !== providerMediaIds[index])) {
    errors.push({ code: "compiled_provider_reference_manifest_mismatch", message: "Compiled reference bindings and generationParameters.referenceMediaIds differ", expectedMediaIds, providerMediaIds });
  }
  expected.forEach((binding, index) => {
    if (Number(binding.providerIndex) !== index + 1) errors.push({ code: "compiled_provider_reference_index_mismatch", message: `Reference ${binding.mediaId} providerIndex is not ${index + 1}`, mediaId: binding.mediaId, providerIndex: binding.providerIndex });
  });
  return { ok: errors.length === 0, errors, bindings: expected, expectedMediaIds, providerMediaIds };
}

function requireExecutionDependencies(dependencies) {
  if (typeof dependencies.runNode !== "function"
    || typeof dependencies.pollRun !== "function"
    || typeof dependencies.updateNode !== "function"
    || typeof dependencies.saveNodePrompt !== "function") {
    throw new TypeError("Missing generation unit execution dependencies");
  }
}

async function syncNode(projects, updateNode, projectId, nodeId, payload) {
  const current = await projects.getNode(projectId, nodeId);
  return updateNode({ projectId, nodeId, expectedRevision: current.revision, payload: { ...current.payload, ...payload } });
}

async function auditLiveCanvasProductionGraph({ compilation, node, projectId, projects }) {
  const prompt = await projects.getNodePrompt(projectId, node.id);
  const canvas = await projects.openCanvas(projectId, node.canvasId);
  const nodes = new Map((canvas?.nodes || []).map((entry) => [entry.id, entry]));
  const edges = canvas?.edges || [];
  const errors = [];
  if (!prompt?.text?.trim() || prompt.text !== compilation.envelope.compiledContentPrompt) {
    errors.push({ code: "canvas_compiled_prompt_required", message: "正式生成节点必须显示当前编译版本的完整 Prompt。" });
  }
  for (const binding of compilation.envelope.referenceBindings || []) {
    if (binding.required === false) continue;
    const source = binding.sourceNodeId ? nodes.get(binding.sourceNodeId) : null;
    if (!source || source.payload?.auditOnly === true || source.payload?.canvasHidden === true) {
      errors.push({
        code: "canvas_reference_node_required",
        message: `${binding.displayName || binding.mediaId || binding.assetId || "参考资产"} 缺少可见画布源节点。`,
        sourceNodeId: binding.sourceNodeId || null
      });
      continue;
    }
    const role = `cinematic_reference:${binding.role || "reference"}`;
    if (!edges.some((edge) => edge.fromNodeId === source.id && edge.toNodeId === node.id && edge.role === role)) {
      errors.push({
        code: "canvas_reference_edge_required",
        message: `${binding.displayName || binding.mediaId || binding.assetId || "参考资产"} 尚未以 ${role} 连到正式生成节点。`,
        sourceNodeId: source.id
      });
    }
  }
  return { ok: errors.length === 0, errors, canvasId: node.canvasId };
}

export function createCinematicGenerationRunUseCase({
  budget,
  findCompilationStaleness,
  getCompilationRecord,
  getGenerationUnit,
  linkGenerationUnitRun,
  listProviderRuns,
  pollRun,
  projects,
  runNode,
  saveNodePrompt,
  updateNode
}) {
  const dependencies = { budget, pollRun, runNode, saveNodePrompt, updateNode };

  return async function runGenerationUnit(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const productionId = requireText(input.productionId, "productionId");
    const generationUnitId = requireText(input.generationUnitId, "generationUnitId");
    const billingMode = input.billingMode ?? "provider_account";
    const budgetless = billingMode !== "legacy_budget";
    const unitRecord = await getGenerationUnit({ projectId, productionId, generationUnitId });
    const compilation = await getCompilationRecord(projectId, productionId, generationUnitId);
    if (!compilation) throw new UnuTvError("prompt_compilation_required", "Compile and preflight this generation unit before formal generation", 409);
    const staleSources = await findCompilationStaleness(projectId, productionId, unitRecord, compilation);
    if (staleSources.length > 0) {
      throw new UnuTvError("stale_prompt_compilation", "A Prompt source changed after compilation; recompile before generation", 409, { staleSources });
    }
    if (!compilation.envelope.lint?.ok || !compilation.envelope.preflight?.ok) {
      throw new UnuTvError("cinematic_preflight_failed", "Prompt lint and model capability preflight must pass before formal generation", 409, {
        lint: compilation.envelope.lint,
        preflight: compilation.envelope.preflight
      });
    }
    const promptDraft = compilation.envelope?.promptDraft;
    try { assertCinematicPromptDraft(promptDraft); }
    catch (error) { throw new UnuTvError("prompt_draft_required", "Formal generation requires the persisted Prompt Draft produced by compilation", 409, { cause: error.details ?? null }); }
    if (promptDraft.status !== "preflight_ready" || promptDraft.compiledContentPrompt !== compilation.envelope.compiledContentPrompt) {
      throw new UnuTvError("prompt_draft_not_ready", "Prompt Draft is not the same preflight-ready content being dispatched", 409, { status: promptDraft.status });
    }
    const referenceAudit = auditCompiledProviderReferenceSet(compilation.envelope, compilation.envelope.generationParameters);
    if (!referenceAudit.ok) {
      throw new UnuTvError("compiled_provider_reference_manifest_mismatch", "The final Provider reference manifest is inconsistent; generation is blocked", 409, { referenceAudit });
    }
    const nodeId = requireText(unitRecord.generationUnit.executionNodeId, "generationUnit.executionNodeId");
    const node = await projects.getNode(projectId, nodeId);
    if (!node || !VIDEO_NODE_KINDS.has(node.kind)) {
      throw new UnuTvError("video_execution_node_required", "Generation unit executionNodeId must reference an existing video node", 409);
    }
    let formalGenerationIntent;
    try {
      formalGenerationIntent = assertFormalGenerationIntent(input.formalGenerationIntent);
    } catch (error) {
      throw new UnuTvError(
        "formal_generation_intent_required",
        "正式视频需要绑定当前预演、生成单元和编译版本的一次性提交意图",
        409,
        { cause: error.details ?? error.message }
      );
    }
    const intentMismatches = [];
    if (formalGenerationIntent.generationUnitId !== generationUnitId) intentMismatches.push("generationUnitId");
    if (formalGenerationIntent.generationUnitRevision !== unitRecord.generationUnit.revision) intentMismatches.push("generationUnitRevision");
    if (formalGenerationIntent.compilationId !== compilation.compilationId) intentMismatches.push("compilationId");
    if (formalGenerationIntent.payloadHash !== compilation.envelope.payloadHash) intentMismatches.push("payloadHash");
    if (formalGenerationIntent.executionNodeId !== nodeId) intentMismatches.push("executionNodeId");
    if (intentMismatches.length) {
      throw new UnuTvError(
        "stale_formal_generation_intent",
        "正式视频提交意图与当前画布节点或编译版本不一致",
        409,
        { mismatches: intentMismatches }
      );
    }
    if (unitRecord.generationUnit.canvasGraphPolicy === "required") {
      const canvasGraph = await auditLiveCanvasProductionGraph({ compilation, node, projectId, projects });
      if (!canvasGraph.ok) {
        throw new UnuTvError(
          "canvas_production_graph_not_ready",
          "正式生成只能执行画布上已填写完整 Prompt 且参考资产连线齐全的节点",
          409,
          canvasGraph
        );
      }
    }
    requireExecutionDependencies(dependencies);
    const parameters = compilation.envelope.generationParameters;
    const provider = requireText(parameters.provider, "generationParameters.provider");
    const model = requireText(parameters.model, "generationParameters.model");
    const idempotencyKey = requireText(input.idempotencyKey, "idempotencyKey");
    let reservation = null;
    if (!budgetless) {
      const amount = Number(input.amount);
      if (!(amount > 0) || !Number.isFinite(amount)) throw new UnuTvError("invalid_payload", "amount must be greater than zero", 400);
      if (typeof budget?.reserveBudget !== "function") throw new TypeError("Missing legacy budget dependency");
      reservation = await budget.reserveBudget({
        projectId,
        provider,
        model,
        taskType: "video",
        amount,
        currency: input.currency,
        idempotencyKey: `${idempotencyKey}:budget:v1`
      });
    }
    const request = {
      ...requireObject(parameters.providerOptions, "generationParameters.providerOptions", {}),
      prompt: compilation.envelope.compiledContentPrompt,
      provider: parameters.provider,
      model: parameters.model,
      mode: parameters.mode,
      duration: parameters.duration,
      aspectRatio: parameters.aspectRatio,
      resolution: parameters.resolution,
      count: parameters.count,
      generateAudio: parameters.generateAudio,
      billingMode,
      idempotencyKey,
      cinematicPromptCompilationId: compilation.compilationId,
      cinematicPayloadHash: compilation.envelope.payloadHash,
      formalGenerationIntent,
      generationUnitId,
      ...(parameters.firstFrameMediaId ? { firstFrameMediaId: parameters.firstFrameMediaId } : {}),
      ...(parameters.lastFrameMediaId ? { lastFrameMediaId: parameters.lastFrameMediaId } : {}),
      ...(parameters.referenceMediaIds?.length ? { referenceMediaIds: parameters.referenceMediaIds } : {}),
      ...(parameters.virtualPersonAssetIds?.length ? { virtualPersonAssetIds: parameters.virtualPersonAssetIds } : {})
    };
    const referenceMediaIds = Array.isArray(parameters.referenceMediaIds) ? parameters.referenceMediaIds : [];
    const promptDocument = createBoundPromptDocumentV1(compilation.envelope.compiledContentPrompt, referenceAudit.bindings);
    const documentMediaIds = promptDocumentReferenceBindings(promptDocument).map((binding) => binding.mediaId).filter(Boolean);
    if (documentMediaIds.length !== referenceAudit.expectedMediaIds.length || documentMediaIds.some((mediaId, index) => mediaId !== referenceAudit.expectedMediaIds[index])) {
      throw new UnuTvError("compiled_prompt_reference_manifest_mismatch", "Compiled prompt reference placeholders do not match the Provider reference manifest", 409, {
        expectedMediaIds: referenceAudit.expectedMediaIds,
        documentMediaIds
      });
    }
    await saveNodePrompt({
      projectId,
      nodeId,
      text: compilation.envelope.compiledContentPrompt,
      document: promptDocument,
      preserveText: true,
      provider: parameters.provider,
      modelId: parameters.model,
      mode: parameters.mode,
      parameters: {
        mode: parameters.mode,
        duration: parameters.duration,
        ratio: parameters.aspectRatio,
        resolution: parameters.resolution,
        n: parameters.count,
        generateAudio: parameters.generateAudio,
        ...(parameters.firstFrameMediaId ? { firstFrameMediaId: parameters.firstFrameMediaId } : {}),
        ...(parameters.lastFrameMediaId ? { lastFrameMediaId: parameters.lastFrameMediaId } : {}),
        ...(parameters.virtualPersonAssetIds?.length ? { virtualPersonAssetIds: parameters.virtualPersonAssetIds } : {})
      },
      referenceMediaIds
    });
    await syncNode(projects, updateNode, projectId, nodeId, {
      prompt: compilation.envelope.compiledContentPrompt,
      provider: parameters.provider,
      modelId: parameters.model,
      mode: parameters.mode,
      referenceMediaIds,
      cinematicReferenceBindings: compilation.envelope.referenceBindings,
      cinematicReferenceAudit: referenceAudit,
      generationStatus: "running",
      generationPhase: "requesting",
      generationMessage: `正在生成 ${generationUnitId}…`,
      generationUnitId,
      formalGenerationIntent,
      cinematicPromptCompilationId: compilation.compilationId
    });
    const existingRuns = await listProviderRuns(projectId);
    const sameCompiledIntent = (entry) => (
      entry.nodeId === nodeId
      && entry.request?.cinematicPromptCompilationId === compilation.compilationId
      && entry.request?.cinematicPayloadHash === compilation.envelope.payloadHash
      && entry.request?.formalGenerationIntent?.generationUnitId === generationUnitId
      && entry.request?.formalGenerationIntent?.generationUnitRevision === unitRecord.generationUnit.revision
      && ["queued", "running", "succeeded"].includes(entry.status)
    );
    let run = existingRuns.find((entry) => entry.nodeId === nodeId
      && entry.request?.idempotencyKey === idempotencyKey
      && entry.request?.cinematicPromptCompilationId === compilation.compilationId)
      // Defensive paid-boundary guard: even an older client that derived a
      // different lease-attempt key must reuse the single unresolved formal
      // intent for this exact GenerationUnit revision and payload.
      ?? (budgetless ? existingRuns.filter(sameCompiledIntent) : [])
        .sort((left, right) => String(left.createdAt).localeCompare(String(right.createdAt)))[0]
      ?? null;
    const reused = Boolean(run);
    if (!run) {
      run = await runNode({ projectId, nodeId, provider, request, generationUnitId, generationUnitAuthorization: FORMAL_GENERATION_UNIT_RUN });
      await linkGenerationUnitRun(projectId, generationUnitId, run.id, compilation.compilationId, nowIso());
    } else if (run.status === "running") {
      run = await pollRun({ projectId, runId: run.id });
    }
    if (["queued", "running"].includes(run.status)) {
      const canvasNode = await syncNode(projects, updateNode, projectId, nodeId, {
        generationStatus: "running",
        generationPhase: "provider_running",
        generationMessage: `Provider 正在生成 ${generationUnitId}，未重复提交`,
        providerRunId: run.id
      });
      return { canvasNode, compilation, outcomeUnknown: false, pending: true, reservation, reused, run };
    }
    if (run.status !== "succeeded") {
      const outcomeUnknown = run.result?.code === "paid_submission_outcome_unknown" || run.result?.code === "provider_unavailable";
      let settledReservation = reservation;
      if (!outcomeUnknown && reservation?.status === "reserved") {
        settledReservation = await budget.releaseBudgetReservation({ projectId, reservationId: reservation.id });
      }
      const canvasNode = await syncNode(projects, updateNode, projectId, nodeId, {
        generationStatus: outcomeUnknown ? "running" : "failed",
        generationPhase: outcomeUnknown ? "outcome_unknown" : "failed",
        generationMessage: outcomeUnknown ? "Provider 结果待确认，未重复提交" : (run.result?.message || "视频生成失败"),
        providerRunId: run.id
      });
      return { canvasNode, compilation, outcomeUnknown, pending: outcomeUnknown, reservation: settledReservation, reused, run };
    }
    const artifact = run.result?.artifacts?.find((entry) => entry.kind === "video" && entry.id);
    if (!artifact) {
      if (reservation?.status === "reserved") {
        await budget.consumeBudgetReservation({ projectId, reservationId: reservation.id, ...(input.actualAmount !== undefined ? { actualAmount: input.actualAmount } : {}) });
      }
      throw new UnuTvError("cinematic_video_artifact_missing", "Paid video run succeeded without a materialized video artifact", 502, { runId: run.id });
    }
    const currentNode = await projects.getNode(projectId, nodeId);
    const mediaIds = [...new Set([...(Array.isArray(currentNode.payload?.mediaIds) ? currentNode.payload.mediaIds : []), artifact.id])];
    const canvasNode = await updateNode({
      projectId,
      nodeId,
      expectedRevision: currentNode.revision,
      payload: {
        ...currentNode.payload,
        currentMediaId: artifact.id,
        mediaIds,
        generationStatus: "succeeded",
        generationPhase: "complete",
        generationMessage: `${generationUnitId} 视频候选已生成`,
        providerRunId: run.id,
        cinematicPromptCompilationId: compilation.compilationId
      }
    });
    let settledReservation = reservation;
    if (reservation?.status === "reserved") {
      settledReservation = await budget.consumeBudgetReservation({ projectId, reservationId: reservation.id, ...(input.actualAmount !== undefined ? { actualAmount: input.actualAmount } : {}) });
    }
    return { canvasNode, compilation, outcomeUnknown: false, pending: false, reservation: settledReservation, reused, run };
  };
}
