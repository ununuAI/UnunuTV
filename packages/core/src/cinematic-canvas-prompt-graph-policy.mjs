import { assertPromptDocumentV1, createBoundPromptDocumentV1, createId, nowIso } from "@ununu/unutv-contracts";
import { CINEMATIC_SCENE_AUTHORITY_EDGE_ROLE } from "./cinematic-scene-authority-policy.mjs";

export const CINEMATIC_VIRTUAL_AUTHORITY_EDGE_ROLE = "cinematic_reference:semantic_identity";

function nodeReferenceIds(node) {
  const payload = node?.payload || {};
  return new Set([
    payload.assetId,
    payload.currentMediaId,
    payload.mediaId,
    payload.resourceId,
    ...(Array.isArray(payload.mediaIds) ? payload.mediaIds : [])
  ].filter(Boolean));
}

function nodeVirtualPersonAssetIds(node) {
  const payload = node?.payload || {};
  return new Set([
    payload.virtualPersonAssetId,
    payload.externalProviderIdentity?.assetId,
    payload.identityProvenance?.virtualPersonAssetId,
    payload.currentIdentityProvenance?.virtualPersonAssetId,
    ...(Array.isArray(payload.virtualPersonAssetIds) ? payload.virtualPersonAssetIds : [])
  ].filter(Boolean));
}

function nodeVirtualAuthoritySourceVersion(node) {
  const payload = node?.payload || {};
  const identity = payload.externalProviderIdentity
    ?? payload.identityProvenance
    ?? payload.currentIdentityProvenance
    ?? {};
  return {
    provider: identity.provider ?? payload.virtualPersonProvider ?? null,
    source: identity.source ?? payload.virtualPersonSource ?? null
  };
}

export function virtualAuthorityReferenceRequirements(generationUnit = {}) {
  const characterAuthorityIds = Array.isArray(generationUnit.characterAuthorityIds)
    ? [...generationUnit.characterAuthorityIds]
    : [];
  const virtualPersonAssetIds = Array.isArray(generationUnit.generationParameters?.virtualPersonAssetIds)
    ? [...generationUnit.generationParameters.virtualPersonAssetIds]
    : [];
  const sourceVersions = Array.isArray(generationUnit.characterIdentitySourceVersions)
    ? generationUnit.characterIdentitySourceVersions
    : [];
  const errors = [];
  if (characterAuthorityIds.length !== virtualPersonAssetIds.length
    || characterAuthorityIds.length !== sourceVersions.length) {
    errors.push({
      code: "canvas_virtual_authority_mapping_mismatch",
      message: "characterAuthorityIds、virtualPersonAssetIds 与 characterIdentitySourceVersions 必须按出场顺序一一对应。",
      characterAuthorityIds,
      sourceVersions,
      virtualPersonAssetIds
    });
  }
  if (new Set(characterAuthorityIds).size !== characterAuthorityIds.length
    || new Set(virtualPersonAssetIds).size !== virtualPersonAssetIds.length) {
    errors.push({
      code: "canvas_virtual_authority_mapping_not_one_to_one",
      message: "每个出场角色 Authority 与虚拟人物 ID 必须唯一且一一对应，禁止重复或复用。",
      characterAuthorityIds,
      virtualPersonAssetIds
    });
  }
  const requirements = characterAuthorityIds.map((authorityId, appearanceIndex) => {
    const virtualPersonAssetId = virtualPersonAssetIds[appearanceIndex] ?? null;
    const sourceVersion = sourceVersions[appearanceIndex] ?? null;
    if (typeof authorityId !== "string" || !authorityId.trim()
      || typeof virtualPersonAssetId !== "string" || !virtualPersonAssetId.trim()
      || !sourceVersion
      || sourceVersion.authorityId !== authorityId
      || sourceVersion.virtualPersonAssetId !== virtualPersonAssetId
      || !Number.isInteger(sourceVersion.authorityRevision)
      || sourceVersion.authorityRevision < 1
      || typeof sourceVersion.provider !== "string"
      || !sourceVersion.provider.trim()
      || typeof sourceVersion.source !== "string"
      || !sourceVersion.source.trim()) {
      errors.push({
        code: "canvas_virtual_authority_source_version_mismatch",
        message: `第 ${appearanceIndex + 1} 个出场角色的 Authority、虚拟人物 ID 与 sourceVersion 不一致。`,
        appearanceIndex,
        authorityId,
        sourceVersion,
        virtualPersonAssetId
      });
    }
    return {
      appearanceIndex,
      authorityId,
      authorityRevision: sourceVersion?.authorityRevision ?? null,
      provider: sourceVersion?.provider ?? null,
      source: sourceVersion?.source ?? null,
      virtualPersonAssetId
    };
  });
  return { errors, ok: errors.length === 0, requirements };
}

export function cinematicReferenceEdgeRole(binding = {}) {
  const role = typeof binding.role === "string" ? binding.role.trim() : "";
  if (role === "scene_authority") return CINEMATIC_SCENE_AUTHORITY_EDGE_ROLE;
  if (["first_frame", "initial_state", "storyboard_first_frame"].includes(role)) {
    return "cinematic_reference:temporal_first";
  }
  if (["last_frame", "end_state", "storyboard_last_frame"].includes(role)) {
    return "cinematic_reference:temporal_last";
  }
  if (role === "handoff_h0") return "cinematic_reference:continuation_h0";
  if (["handoff_h1", "continuity_tail"].includes(role)) return "cinematic_reference:continuation_h1";
  return "cinematic_reference:semantic";
}

export function normalizeCinematicInputDecision(compilation, canvasGraph) {
  const parameters = compilation.envelope.generationParameters;
  const compiledDecision = compilation.envelope.visualInputDecision ?? {};
  const compiledGraphReceipt = compilation.envelope.sourceVersions?.canvasProductionGraph ?? {};
  const graphAudit = canvasGraph?.audit ?? {};
  const virtualAuthorityReferences = graphAudit.virtualAuthorityReferences
    ?? compiledGraphReceipt.virtualAuthorityReferences
    ?? [];
  const referenceNodeIds = [
    ...(graphAudit.referenceNodeIds ?? compiledGraphReceipt.referenceNodeIds ?? []),
    ...virtualAuthorityReferences.map((receipt) => receipt.sourceNodeId).filter(Boolean)
  ];
  const referenceBindings = compilation.envelope.referenceBindings.map((binding) => ({
    assetId: binding.assetId ?? null,
    edgeRole: cinematicReferenceEdgeRole(binding),
    mediaId: binding.mediaId ?? null,
    providerEligible: binding.providerEligible !== false,
    providerIndex: binding.providerIndex ?? null,
    required: binding.required !== false,
    role: binding.role ?? "reference",
    sourceNodeId: binding.sourceNodeId ?? null,
    versionId: binding.versionId ?? null
  }));
  return {
    firstFrameMediaId: parameters.firstFrameMediaId ?? null,
    lastFrameMediaId: parameters.lastFrameMediaId ?? null,
    mode: parameters.mode,
    ok: compiledDecision.ok !== false,
    ordinaryReferenceMediaIds: [...(parameters.referenceMediaIds ?? [])],
    rationale: compiledDecision.rationale ?? null,
    referenceBindings,
    referenceNodeIds: [...new Set(referenceNodeIds)],
    virtualAuthorityReferences: [...virtualAuthorityReferences],
    virtualPersonAssetIds: [...(parameters.virtualPersonAssetIds ?? [])],
    visualAnchorPolicy: compiledDecision.visualAnchorPolicy ?? null
  };
}

export function createCinematicCanvasPromptDocument(compilation, canvasGraph) {
  const document = createBoundPromptDocumentV1(
    compilation.envelope.compiledContentPrompt,
    compilation.envelope.referenceBindings
  );
  const content = [...document.content];
  const virtualAuthorityReferences = canvasGraph?.audit?.virtualAuthorityReferences
    ?? compilation.envelope.sourceVersions?.canvasProductionGraph?.virtualAuthorityReferences
    ?? [];
  for (const receipt of virtualAuthorityReferences) {
    content.push({
      type: "reference",
      id: `virtual-authority-${receipt.authorityId}-${receipt.appearanceIndex + 1}`,
      label: `角色身份 Authority ${receipt.appearanceIndex + 1}`,
      referenceKind: "virtual_person",
      assetId: receipt.virtualPersonAssetId,
      assetVersionId: `authority:${receipt.authorityId}:r${receipt.authorityRevision}`,
      mediaId: null,
      sourceNodeId: receipt.sourceNodeId,
      providerIndex: null,
      role: "character_identity",
      controls: ["人物身份", "面孔", "年龄感", "体型"],
      doesNotControl: ["动作时序", "运镜", "场景拓扑"],
      authorityRevision: `r${receipt.authorityRevision}`,
      versionPolicy: "pinned"
    });
  }
  return assertPromptDocumentV1({ ...document, content });
}

export async function resolveCanvasReferenceGraph({ ports, projectId, generationUnit, referenceBindings }) {
  if (typeof generationUnit.executionNodeId !== "string" || !generationUnit.executionNodeId.trim()) {
    return {
      audit: { ok: false, errors: [{ code: "canvas_execution_node_required", message: "GenerationUnit 缺少可见画布执行节点。" }], edgeIds: [], executionNodeId: null, referenceNodeIds: [], virtualAuthorityReferences: [] },
      executionNode: null,
      referenceBindings
    };
  }
  const executionNode = await ports.projects.getNode(projectId, generationUnit.executionNodeId);
  if (!executionNode) {
    return {
      audit: { ok: false, errors: [{ code: "canvas_execution_node_required", message: "GenerationUnit 缺少可见画布执行节点。" }], edgeIds: [], executionNodeId: generationUnit.executionNodeId, referenceNodeIds: [], virtualAuthorityReferences: [] },
      executionNode: null,
      referenceBindings
    };
  }
  const canvas = await ports.projects.openCanvas(projectId, executionNode.canvasId);
  const nodes = Array.isArray(canvas?.nodes) ? canvas.nodes : [];
  const edges = Array.isArray(canvas?.edges) ? [...canvas.edges] : [];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const resolvedBindings = [];
  const errors = [];
  const edgeIds = [];
  const referenceNodeIds = [];
  const virtualAuthorityReferences = [];

  for (const binding of referenceBindings) {
    const explicitId = binding.sourceNodeId || binding.directorNodeId || null;
    let sourceNode = explicitId ? byId.get(explicitId) : null;
    if (!sourceNode) {
      sourceNode = nodes.find((candidate) => {
        const ids = nodeReferenceIds(candidate);
        return ids.has(binding.mediaId) || ids.has(binding.assetId);
      }) || null;
    }
    if (!sourceNode || sourceNode.canvasId !== executionNode.canvasId || sourceNode.payload?.auditOnly === true || sourceNode.payload?.canvasHidden === true) {
      resolvedBindings.push(binding);
      if (binding.required !== false) {
        errors.push({
          code: "canvas_reference_node_required",
          message: `${binding.displayName || binding.mediaId || binding.assetId || "参考资产"} 必须先作为可见画布节点存在，再连接到正式生成节点。`,
          mediaId: binding.mediaId || null,
          assetId: binding.assetId || null
        });
      }
      continue;
    }
    if (sourceNode.id === executionNode.id) {
      resolvedBindings.push(binding);
      errors.push({
        code: "canvas_reference_source_must_be_distinct",
        message: `${binding.displayName || binding.mediaId || binding.assetId || "参考资产"} 的来源节点不能与正式生成执行节点相同。`,
        mediaId: binding.mediaId || null,
        assetId: binding.assetId || null,
        executionNodeId: executionNode.id,
        sourceNodeId: sourceNode.id
      });
      continue;
    }
    const resolved = { ...binding, sourceNodeId: sourceNode.id };
    resolvedBindings.push(resolved);
    referenceNodeIds.push(sourceNode.id);
    const role = cinematicReferenceEdgeRole(binding);
    let edge = edges.find((candidate) => candidate.fromNodeId === sourceNode.id
      && candidate.toNodeId === executionNode.id
      && candidate.role === role);
    if (!edge) {
      edge = await ports.projects.connectEdge(projectId, {
        id: createId("edge"),
        canvasId: executionNode.canvasId,
        fromNodeId: sourceNode.id,
        toNodeId: executionNode.id,
        role,
        createdAt: nowIso()
      });
      edges.push(edge);
    }
    edgeIds.push(edge.id);
  }
  const virtualAuthority = virtualAuthorityReferenceRequirements(generationUnit);
  errors.push(...virtualAuthority.errors);
  for (const requirement of virtualAuthority.requirements) {
    const authorityNodes = nodes.filter((candidate) => candidate?.payload?.authorityId === requirement.authorityId);
    const visibleAssetNodes = authorityNodes.filter((candidate) => (
      candidate.kind === "asset"
      && candidate.canvasId === executionNode.canvasId
      && candidate.payload?.auditOnly !== true
      && candidate.payload?.canvasHidden !== true
    ));
    const exactNodes = visibleAssetNodes.filter((candidate) => (
      Number(candidate.payload?.authorityRevision) === Number(requirement.authorityRevision)
      && nodeVirtualPersonAssetIds(candidate).has(requirement.virtualPersonAssetId)
      && nodeVirtualAuthoritySourceVersion(candidate).provider === requirement.provider
      && nodeVirtualAuthoritySourceVersion(candidate).source === requirement.source
    ));
    if (exactNodes.length === 0) {
      if (authorityNodes.some((candidate) => candidate.id === executionNode.id)) {
        errors.push({
          code: "canvas_reference_source_must_be_distinct",
          message: `${requirement.authorityId} 的角色 Authority 来源节点不能与正式生成执行节点相同。`,
          appearanceIndex: requirement.appearanceIndex,
          authorityId: requirement.authorityId,
          executionNodeId: executionNode.id,
          virtualPersonAssetId: requirement.virtualPersonAssetId
        });
        continue;
      }
      errors.push({
        code: visibleAssetNodes.length
          ? "canvas_virtual_authority_node_version_mismatch"
          : "canvas_virtual_authority_node_required",
        message: `${requirement.authorityId} r${requirement.authorityRevision} / ${requirement.virtualPersonAssetId} 必须解析到同画布独立可见的 Authority asset 节点。`,
        appearanceIndex: requirement.appearanceIndex,
        authorityId: requirement.authorityId,
        authorityRevision: requirement.authorityRevision,
        candidateNodeIds: visibleAssetNodes.map((node) => node.id),
        virtualPersonAssetId: requirement.virtualPersonAssetId
      });
      continue;
    }
    if (exactNodes.length > 1) {
      errors.push({
        code: "canvas_virtual_authority_node_ambiguous",
        message: `${requirement.authorityId} 同时解析到多个当前 Authority asset 节点，禁止随机选择。`,
        appearanceIndex: requirement.appearanceIndex,
        authorityId: requirement.authorityId,
        sourceNodeIds: exactNodes.map((node) => node.id),
        virtualPersonAssetId: requirement.virtualPersonAssetId
      });
      continue;
    }
    const sourceNode = exactNodes[0];
    const identityEdges = edges.filter((candidate) => candidate.fromNodeId === sourceNode.id
      && candidate.toNodeId === executionNode.id
      && candidate.role === CINEMATIC_VIRTUAL_AUTHORITY_EDGE_ROLE);
    if (identityEdges.length === 0) {
      errors.push({
        code: "canvas_virtual_authority_edge_required",
        message: `${requirement.authorityId} 的 Authority asset 节点必须以 typed semantic identity edge 连接到正式生成节点。`,
        appearanceIndex: requirement.appearanceIndex,
        authorityId: requirement.authorityId,
        edgeRole: CINEMATIC_VIRTUAL_AUTHORITY_EDGE_ROLE,
        executionNodeId: executionNode.id,
        sourceNodeId: sourceNode.id,
        virtualPersonAssetId: requirement.virtualPersonAssetId
      });
      continue;
    }
    if (identityEdges.length > 1) {
      errors.push({
        code: "canvas_virtual_authority_edge_ambiguous",
        message: `${requirement.authorityId} 存在多个 semantic identity edge，禁止随机选择。`,
        appearanceIndex: requirement.appearanceIndex,
        authorityId: requirement.authorityId,
        edgeIds: identityEdges.map((edge) => edge.id),
        edgeRole: CINEMATIC_VIRTUAL_AUTHORITY_EDGE_ROLE,
        executionNodeId: executionNode.id,
        sourceNodeId: sourceNode.id,
        virtualPersonAssetId: requirement.virtualPersonAssetId
      });
      continue;
    }
    const edge = identityEdges[0];
    edgeIds.push(edge.id);
    referenceNodeIds.push(sourceNode.id);
    virtualAuthorityReferences.push({
      ...requirement,
      edgeId: edge.id,
      edgeRole: CINEMATIC_VIRTUAL_AUTHORITY_EDGE_ROLE,
      sourceNodeId: sourceNode.id
    });
  }
  return {
    audit: {
      ok: errors.length === 0,
      errors,
      edgeIds: [...new Set(edgeIds)],
      executionNodeId: executionNode.id,
      referenceNodeIds: [...new Set(referenceNodeIds)],
      virtualAuthorityReferences
    },
    executionNode,
    referenceBindings: resolvedBindings
  };
}

/**
 * Unit-design materialization command. It may create only missing canonical
 * virtual Authority identity edges. Source-node selection and all validation
 * remain owned by resolveCanvasReferenceGraph, which compile/run call in
 * audit-only mode.
 */
export async function materializeCinematicVirtualAuthorityEdges({
  connectEdge,
  ports,
  projectId,
  generationUnit
}) {
  const initial = await resolveCanvasReferenceGraph({
    ports,
    projectId,
    generationUnit,
    referenceBindings: []
  });
  const missingEdges = initial.audit.errors.filter((error) => error.code === "canvas_virtual_authority_edge_required");
  const nonMaterializableErrors = initial.audit.errors.filter((error) => error.code !== "canvas_virtual_authority_edge_required");
  if (nonMaterializableErrors.length || missingEdges.length === 0) return initial;
  if (typeof connectEdge !== "function") {
    return {
      ...initial,
      audit: {
        ...initial.audit,
        ok: false,
        errors: [{
          code: "canvas_virtual_authority_edge_materializer_required",
          message: "unit-design 缺少 canonical connectEdge command，不能创建虚拟人物 Authority identity edge。"
        }]
      }
    };
  }
  for (const error of [...missingEdges].sort(
    (left, right) => Number(left.appearanceIndex) - Number(right.appearanceIndex)
  )) {
    await connectEdge({
      projectId,
      canvasId: initial.executionNode.canvasId,
      fromNodeId: error.sourceNodeId,
      toNodeId: initial.executionNode.id,
      role: CINEMATIC_VIRTUAL_AUTHORITY_EDGE_ROLE
    });
  }
  return resolveCanvasReferenceGraph({
    ports,
    projectId,
    generationUnit,
    referenceBindings: []
  });
}

export async function persistCompiledPromptOnCanvas({ dependencies, ports, projectId, compilation, generationUnit, canvasGraph }) {
  if (!canvasGraph.executionNode || typeof dependencies.saveNodePrompt !== "function" || typeof dependencies.updateNode !== "function") return;
  const parameters = compilation.envelope.generationParameters;
  const inputDecision = normalizeCinematicInputDecision(compilation, canvasGraph);
  const sourceVersions = structuredClone(compilation.envelope.sourceVersions ?? {});
  const document = createCinematicCanvasPromptDocument(compilation, canvasGraph);
  await dependencies.saveNodePrompt({
    projectId,
    nodeId: canvasGraph.executionNode.id,
    text: compilation.envelope.compiledContentPrompt,
    document,
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
      firstFrameMediaId: inputDecision.firstFrameMediaId,
      lastFrameMediaId: inputDecision.lastFrameMediaId,
      referenceMediaIds: inputDecision.ordinaryReferenceMediaIds,
      virtualPersonAssetIds: inputDecision.virtualPersonAssetIds,
      segmentDecision: compilation.envelope.segmentDecision,
      segmentSeam: compilation.envelope.segmentSeam,
      directorPromptPolicy: compilation.envelope.directorPromptPolicy,
      abstractIntentResolution: compilation.envelope.directorPromptPolicy?.abstractIntent ?? null,
      inputDecision,
      sourceVersions
    },
    referenceNodeIds: canvasGraph.audit.referenceNodeIds,
    referenceMediaIds: parameters.referenceMediaIds
  });
  const current = await ports.projects.getNode(projectId, canvasGraph.executionNode.id);
  await dependencies.updateNode({
    projectId,
    nodeId: current.id,
    expectedRevision: current.revision,
    payload: {
      ...current.payload,
      prompt: compilation.envelope.compiledContentPrompt,
      promptCompilationId: compilation.compilationId,
      cinematicPromptCompilationId: compilation.compilationId,
      cinematicPayloadHash: compilation.envelope.payloadHash,
      cinematicReferenceBindings: compilation.envelope.referenceBindings,
      cinematicInputDecision: inputDecision,
      cinematicSegmentDecision: compilation.envelope.segmentDecision,
      cinematicSegmentSeam: compilation.envelope.segmentSeam,
      cinematicDirectorPromptPolicy: compilation.envelope.directorPromptPolicy,
      cinematicAbstractIntentResolution: compilation.envelope.directorPromptPolicy?.abstractIntent ?? null,
      cinematicSourceVersions: sourceVersions,
      firstFrameMediaId: inputDecision.firstFrameMediaId,
      lastFrameMediaId: inputDecision.lastFrameMediaId,
      referenceMediaIds: inputDecision.ordinaryReferenceMediaIds,
      virtualPersonAssetIds: inputDecision.virtualPersonAssetIds,
      canvasReferenceGraph: canvasGraph.audit,
      generationUnitId: generationUnit.generationUnitId,
      generationUnitRevision: generationUnit.revision
    }
  });
}
