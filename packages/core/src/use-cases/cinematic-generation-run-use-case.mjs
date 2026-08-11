import { assertCinematicPromptDraft, assertFormalGenerationIntent, UnuTvError, nowIso, requireObject, requireText } from "@ununu/unutv-contracts";
import { FORMAL_GENERATION_UNIT_RUN } from "../cinematic-workflow-policy.mjs";
import {
  assessGenerationUnitCharacterIdentityBindings,
  cinematicCharacterIdentitySourceVersions,
  deriveCinematicCharacterIdentityBindings
} from "../cinematic-character-identity-policy.mjs";
import {
  CINEMATIC_VIRTUAL_AUTHORITY_EDGE_ROLE,
  cinematicReferenceEdgeRole,
  createCinematicCanvasPromptDocument,
  normalizeCinematicInputDecision
} from "../cinematic-canvas-prompt-graph-policy.mjs";
import { CINEMATIC_SCENE_AUTHORITY_EDGE_ROLE } from "../cinematic-scene-authority-policy.mjs";
import {
  auditCompiledProviderReferenceSet,
  requireGenerationExecutionDependencies,
  syncGenerationNode
} from "./cinematic-generation-run-helpers.mjs";
export { auditCompiledProviderReferenceSet } from "./cinematic-generation-run-helpers.mjs";
const VIDEO_NODE_KINDS = new Set(["video", "videoShot", "video-clip"]);

export async function auditLiveCanvasProductionGraph({ compilation, node, projectId, projects }) {
  const prompt = await projects.getNodePrompt(projectId, node.id);
  const canvas = await projects.openCanvas(projectId, node.canvasId);
  const nodes = new Map((canvas?.nodes || []).map((entry) => [entry.id, entry]));
  const edges = canvas?.edges || [];
  const errors = [];
  const virtualAuthorityReferences = compilation.envelope.sourceVersions?.canvasProductionGraph?.virtualAuthorityReferences;
  if (!Array.isArray(virtualAuthorityReferences)) {
    errors.push({
      code: "canvas_virtual_authority_receipt_required",
      message: "编译 sourceVersions 缺少 canonical virtualAuthorityReferences receipt。"
    });
  }
  const expectedVirtualAuthorityReferences = Array.isArray(virtualAuthorityReferences)
    ? virtualAuthorityReferences
    : [];
  const expectedDocument = createCinematicCanvasPromptDocument(compilation, {
    audit: { virtualAuthorityReferences: expectedVirtualAuthorityReferences }
  });
  const referenceNodeIds = [...new Set((compilation.envelope.referenceBindings || [])
    .map((binding) => binding.sourceNodeId)
    .filter(Boolean))];
  const expectedInputDecision = normalizeCinematicInputDecision(compilation, {
    audit: { referenceNodeIds, virtualAuthorityReferences: expectedVirtualAuthorityReferences }
  });
  const expectedSourceVersions = compilation.envelope.sourceVersions ?? {};
  if (!prompt?.text?.trim() || prompt.text !== compilation.envelope.compiledContentPrompt) {
    errors.push({ code: "canvas_compiled_prompt_required", message: "正式生成节点必须显示当前编译版本的完整 Prompt。" });
  }
  if (JSON.stringify(prompt?.document ?? null) !== JSON.stringify(expectedDocument)) {
    errors.push({ code: "canvas_prompt_document_mismatch", message: "画布 PromptDocument 与编译时完整参考 token 不一致；禁止在 run 阶段用更少 bindings 覆盖。" });
  }
  if (JSON.stringify(prompt?.parameters?.inputDecision ?? null) !== JSON.stringify(expectedInputDecision)) {
    errors.push({ code: "canvas_input_decision_mismatch", message: "画布 normalized inputDecision 与编译版本不一致，必须重新编译而不是在 run 阶段修写。" });
  }
  if (JSON.stringify(prompt?.parameters?.sourceVersions ?? null) !== JSON.stringify(expectedSourceVersions)) {
    errors.push({ code: "canvas_prompt_source_versions_mismatch", message: "画布 Prompt sourceVersions 与编译版本不一致。" });
  }
  if (node.payload?.cinematicPayloadHash !== compilation.envelope.payloadHash) {
    errors.push({ code: "canvas_payload_hash_mismatch", message: "画布节点 payloadHash 与编译版本不一致。" });
  }
  if (JSON.stringify(node.payload?.cinematicInputDecision ?? null) !== JSON.stringify(expectedInputDecision)) {
    errors.push({ code: "canvas_node_input_decision_mismatch", message: "画布节点 inputDecision 与编译版本不一致。" });
  }
  if (JSON.stringify(node.payload?.cinematicSourceVersions ?? null) !== JSON.stringify(expectedSourceVersions)) {
    errors.push({ code: "canvas_node_source_versions_mismatch", message: "画布节点 sourceVersions 与编译版本不一致。" });
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
    if (source.id === node.id) {
      errors.push({
        code: "canvas_reference_source_must_be_distinct",
        message: `${binding.displayName || binding.mediaId || binding.assetId || "参考资产"} 的来源节点不能与正式生成执行节点相同。`,
        sourceNodeId: source.id
      });
      continue;
    }
    const role = cinematicReferenceEdgeRole(binding);
    if (!edges.some((edge) => edge.fromNodeId === source.id && edge.toNodeId === node.id && edge.role === role)) {
      errors.push({
        code: "canvas_reference_edge_required",
        message: `${binding.displayName || binding.mediaId || binding.assetId || "参考资产"} 尚未以 ${role} 连到正式生成节点。`,
        sourceNodeId: source.id
      });
    }
    if (binding.role === "scene_authority") {
      const mismatches = [
        role !== CINEMATIC_SCENE_AUTHORITY_EDGE_ROLE && "typed_edge_role",
        source.kind !== "asset" && "source_kind",
        source.payload?.authorityId !== binding.authorityId && "authority_id",
        Number(source.payload?.authorityRevision) !== Number(binding.sceneAuthorityRevision ?? binding.authorityRevision) && "authority_revision",
        source.payload?.assetId !== binding.assetId && "asset_id",
        (source.payload?.currentVersionId ?? source.payload?.assetVersionId) !== (binding.assetVersionId ?? binding.versionId) && "asset_version_id",
        source.payload?.currentMediaId !== binding.mediaId && "media_id",
        source.payload?.currentMediaChecksum !== (binding.mediaChecksum ?? binding.checksum) && "media_checksum",
        source.payload?.sceneTopologyRevision !== binding.topologyRevision && "topology_revision"
      ].filter(Boolean);
      if (mismatches.length) {
        errors.push({
          code: "canvas_scene_authority_version_mismatch",
          message: `${binding.displayName || binding.authorityId || "场景 Authority"} 的 live asset 节点与编译时拓扑/媒体/checksum 不一致。`,
          authorityId: binding.authorityId ?? null,
          mismatches,
          sourceNodeId: source.id
        });
      }
    }
  }
  const seenAuthorityIds = new Set();
  const seenSourceNodeIds = new Set();
  expectedVirtualAuthorityReferences.forEach((receipt, appearanceIndex) => {
    if (
      Number(receipt?.appearanceIndex) !== appearanceIndex
      || typeof receipt?.authorityId !== "string"
      || !receipt.authorityId.trim()
      || !Number.isInteger(receipt?.authorityRevision)
      || receipt.authorityRevision < 1
      || typeof receipt?.virtualPersonAssetId !== "string"
      || !receipt.virtualPersonAssetId.trim()
      || typeof receipt?.provider !== "string"
      || !receipt.provider.trim()
      || typeof receipt?.source !== "string"
      || !receipt.source.trim()
      || typeof receipt?.sourceNodeId !== "string"
      || !receipt.sourceNodeId.trim()
      || receipt?.edgeRole !== CINEMATIC_VIRTUAL_AUTHORITY_EDGE_ROLE
    ) {
      errors.push({
        code: "canvas_virtual_authority_receipt_mismatch",
        message: `第 ${appearanceIndex + 1} 个 virtual Authority receipt 缺失或顺序/字段不完整。`,
        appearanceIndex,
        receipt
      });
      return;
    }
    if (seenAuthorityIds.has(receipt.authorityId) || seenSourceNodeIds.has(receipt.sourceNodeId)) {
      errors.push({
        code: "canvas_virtual_authority_receipt_not_one_to_one",
        message: "virtual Authority receipt 必须按出场顺序一一对应独立 Authority 与独立源节点。",
        appearanceIndex,
        authorityId: receipt.authorityId,
        sourceNodeId: receipt.sourceNodeId
      });
      return;
    }
    seenAuthorityIds.add(receipt.authorityId);
    seenSourceNodeIds.add(receipt.sourceNodeId);
    const source = nodes.get(receipt.sourceNodeId);
    if (!source || source.payload?.auditOnly === true || source.payload?.canvasHidden === true || source.kind !== "asset") {
      errors.push({
        code: "canvas_virtual_authority_node_required",
        message: `${receipt.authorityId} 缺少编译 receipt 指定的独立、可见 Authority asset 节点。`,
        appearanceIndex,
        authorityId: receipt.authorityId,
        sourceNodeId: receipt.sourceNodeId
      });
      return;
    }
    if (source.id === node.id) {
      errors.push({
        code: "canvas_reference_source_must_be_distinct",
        message: `${receipt.authorityId} 的 virtual Authority 节点不能与正式生成执行节点自引用。`,
        appearanceIndex,
        authorityId: receipt.authorityId,
        sourceNodeId: source.id
      });
      return;
    }
    const identity = source.payload?.externalProviderIdentity
      ?? source.payload?.identityProvenance
      ?? source.payload?.currentIdentityProvenance
      ?? {};
    const sourceVirtualPersonAssetIds = new Set([
      source.payload?.virtualPersonAssetId,
      identity.assetId,
      identity.virtualPersonAssetId,
      ...(Array.isArray(source.payload?.virtualPersonAssetIds) ? source.payload.virtualPersonAssetIds : [])
    ].filter(Boolean));
    if (
      source.payload?.authorityId !== receipt.authorityId
      || Number(source.payload?.authorityRevision) !== Number(receipt.authorityRevision)
      || identity.provider !== receipt.provider
      || identity.source !== receipt.source
      || !sourceVirtualPersonAssetIds.has(receipt.virtualPersonAssetId)
    ) {
      errors.push({
        code: "canvas_virtual_authority_node_version_mismatch",
        message: `${receipt.authorityId} 的 live Authority node 与编译 receipt 的 provider/source/revision/virtual person ID 不一致。`,
        appearanceIndex,
        authorityId: receipt.authorityId,
        authorityRevision: receipt.authorityRevision,
        sourceNodeId: source.id,
        virtualPersonAssetId: receipt.virtualPersonAssetId
      });
      return;
    }
    const identityEdges = edges.filter((edge) => (
      edge.fromNodeId === source.id
      && edge.toNodeId === node.id
      && edge.role === CINEMATIC_VIRTUAL_AUTHORITY_EDGE_ROLE
    ));
    if (identityEdges.length !== 1) {
      errors.push({
        code: identityEdges.length
          ? "canvas_virtual_authority_edge_ambiguous"
          : "canvas_virtual_authority_edge_required",
        message: `${receipt.authorityId} 必须以唯一 typed semantic identity edge 连接到正式生成节点。`,
        appearanceIndex,
        authorityId: receipt.authorityId,
        edgeRole: CINEMATIC_VIRTUAL_AUTHORITY_EDGE_ROLE,
        sourceNodeId: source.id
      });
    }
  });
  return { ok: errors.length === 0, errors, canvasId: node.canvasId, expectedInputDecision, prompt };
}

export function createCinematicGenerationRunUseCase({
  budget,
  findCompilationStaleness,
  getCompilationRecord,
  getGenerationUnit,
  linkGenerationUnitRun,
  listProviderRuns,
  listAssetAuthorities,
  pollRun,
  projects,
  runNode,
  updateNode
}) {
  const dependencies = { budget, pollRun, runNode, updateNode };

  return async function runGenerationUnit(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const productionId = requireText(input.productionId, "productionId");
    const generationUnitId = requireText(input.generationUnitId, "generationUnitId");
    const billingMode = input.billingMode ?? "provider_account";
    const budgetless = billingMode !== "legacy_budget";
    const unitRecord = await getGenerationUnit({ projectId, productionId, generationUnitId });
    if (!unitRecord.generationUnit.sequenceWorkspaceBinding) {
      throw new UnuTvError(
        "sequence_previs_required",
        "正式视频提交前必须绑定已接受的连续预演与本镜视觉上下文",
        409,
        { generationUnitId }
      );
    }
    const requestedCompilationId = typeof input.formalGenerationIntent?.compilationId === "string"
      ? input.formalGenerationIntent.compilationId.trim()
      : "";
    const compilation = await getCompilationRecord(
      projectId,
      productionId,
      generationUnitId,
      requestedCompilationId
        ? { compilationId: requestedCompilationId, includeInactive: true }
        : false
    );
    if (!compilation) throw new UnuTvError("prompt_compilation_required", "Compile and preflight this generation unit before formal generation", 409);
    const staleSources = await findCompilationStaleness(projectId, productionId, unitRecord, compilation);
    if (staleSources.length > 0) {
      throw new UnuTvError("stale_prompt_compilation", "A Prompt source changed after compilation; recompile before generation", 409, { staleSources });
    }
    const authorities = typeof listAssetAuthorities === "function"
      ? await listAssetAuthorities(projectId, productionId)
      : [];
    const characterAuthorityIds = Array.isArray(unitRecord.generationUnit.characterAuthorityIds)
      ? unitRecord.generationUnit.characterAuthorityIds
      : [];
    const identityAudit = assessGenerationUnitCharacterIdentityBindings({
      authorities,
      characterAuthorityIds,
      generationUnit: unitRecord.generationUnit
    });
    const derivedIdentity = deriveCinematicCharacterIdentityBindings({ authorities, characterAuthorityIds });
    const currentIdentitySourceVersions = cinematicCharacterIdentitySourceVersions(derivedIdentity.bindings);
    const compiledIdentitySourceVersions = compilation.envelope.sourceVersions?.characterIdentityBindings ?? null;
    const compiledVirtualPersonAssetIds = compilation.envelope.generationParameters?.virtualPersonAssetIds ?? [];
    const compiledCanvasVirtualAuthorityVersions = (
      compilation.envelope.sourceVersions?.canvasProductionGraph?.virtualAuthorityReferences ?? []
    ).map((receipt) => ({
      authorityId: receipt.authorityId,
      authorityRevision: receipt.authorityRevision,
      provider: receipt.provider,
      source: receipt.source,
      virtualPersonAssetId: receipt.virtualPersonAssetId
    }));
    if (!identityAudit.ok
      || JSON.stringify(compiledIdentitySourceVersions) !== JSON.stringify(currentIdentitySourceVersions)
      || JSON.stringify(compiledVirtualPersonAssetIds) !== JSON.stringify(derivedIdentity.virtualPersonAssetIds)
      || JSON.stringify(compiledCanvasVirtualAuthorityVersions) !== JSON.stringify(currentIdentitySourceVersions)) {
      throw new UnuTvError(
        "stale_character_identity_binding",
        "正式生成前人物 Authority、虚拟人物 ID 或 identity sourceVersions 已不一致；必须修正 GenerationUnit 并重新编译。",
        409,
        {
          errors: identityAudit.errors,
          compiledIdentitySourceVersions,
          compiledCanvasVirtualAuthorityVersions,
          currentIdentitySourceVersions,
          compiledVirtualPersonAssetIds,
          currentVirtualPersonAssetIds: derivedIdentity.virtualPersonAssetIds
        }
      );
    }
    if (compilation.envelope.manualOverride === true
      || compilation.envelope.manualPromptProvided === true
      || compilation.envelope.promptSource === "manual_preview") {
      throw new UnuTvError(
        "manual_prompt_formal_generation_forbidden",
        "人工自由文本预览不得提交正式视频；请修改结构化字段并重新编译生成新的 payloadHash",
        409,
        {
          compilationId: compilation.compilationId,
          payloadHash: compilation.envelope.payloadHash,
          promptSource: compilation.envelope.promptSource ?? null
        }
      );
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
    const canvasGraph = await auditLiveCanvasProductionGraph({ compilation, node, projectId, projects });
    if (!canvasGraph.ok) {
      throw new UnuTvError(
        "canvas_production_graph_not_ready",
        "正式生成无条件要求画布上当前编译 Prompt、完整参考 token、typed edges、inputDecision 与 sourceVersions 一致。",
        409,
        canvasGraph
      );
    }
    requireGenerationExecutionDependencies(dependencies);
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
      ...(canvasGraph.expectedInputDecision.firstFrameMediaId ? { firstFrameMediaId: canvasGraph.expectedInputDecision.firstFrameMediaId } : {}),
      ...(canvasGraph.expectedInputDecision.lastFrameMediaId ? { lastFrameMediaId: canvasGraph.expectedInputDecision.lastFrameMediaId } : {}),
      ...(canvasGraph.expectedInputDecision.ordinaryReferenceMediaIds.length ? { referenceMediaIds: canvasGraph.expectedInputDecision.ordinaryReferenceMediaIds } : {}),
      ...(canvasGraph.expectedInputDecision.virtualPersonAssetIds.length ? { virtualPersonAssetIds: canvasGraph.expectedInputDecision.virtualPersonAssetIds } : {})
    };
    const referenceMediaIds = canvasGraph.expectedInputDecision.ordinaryReferenceMediaIds;
    await syncGenerationNode(projects, updateNode, projectId, nodeId, {
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
      const canvasNode = await syncGenerationNode(projects, updateNode, projectId, nodeId, {
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
      const canvasNode = await syncGenerationNode(projects, updateNode, projectId, nodeId, {
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
