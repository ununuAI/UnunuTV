import { createBoundPromptDocumentV1, createId, nowIso } from "@ununu/unutv-contracts";

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

export async function resolveCanvasReferenceGraph({ ports, projectId, generationUnit, referenceBindings }) {
  if (typeof generationUnit.executionNodeId !== "string" || !generationUnit.executionNodeId.trim()) {
    return {
      audit: { ok: false, errors: [{ code: "canvas_execution_node_required", message: "GenerationUnit 缺少可见画布执行节点。" }], edgeIds: [], executionNodeId: null, referenceNodeIds: [] },
      executionNode: null,
      referenceBindings
    };
  }
  const executionNode = await ports.projects.getNode(projectId, generationUnit.executionNodeId);
  if (!executionNode) {
    return {
      audit: { ok: false, errors: [{ code: "canvas_execution_node_required", message: "GenerationUnit 缺少可见画布执行节点。" }], edgeIds: [], executionNodeId: generationUnit.executionNodeId, referenceNodeIds: [] },
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
    const resolved = { ...binding, sourceNodeId: sourceNode.id };
    resolvedBindings.push(resolved);
    referenceNodeIds.push(sourceNode.id);
    const role = `cinematic_reference:${binding.role || "reference"}`;
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
  return {
    audit: {
      ok: errors.length === 0,
      errors,
      edgeIds: [...new Set(edgeIds)],
      executionNodeId: executionNode.id,
      referenceNodeIds: [...new Set(referenceNodeIds)]
    },
    executionNode,
    referenceBindings: resolvedBindings
  };
}

export async function persistCompiledPromptOnCanvas({ dependencies, ports, projectId, compilation, generationUnit, canvasGraph }) {
  if (!canvasGraph.executionNode || typeof dependencies.saveNodePrompt !== "function" || typeof dependencies.updateNode !== "function") return;
  const parameters = compilation.envelope.generationParameters;
  const document = createBoundPromptDocumentV1(compilation.envelope.compiledContentPrompt, compilation.envelope.referenceBindings);
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
      generateAudio: parameters.generateAudio
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
      canvasReferenceGraph: canvasGraph.audit,
      generationUnitId: generationUnit.generationUnitId,
      generationUnitRevision: generationUnit.revision
    }
  });
}
