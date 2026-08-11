import {
  UnuTvError,
  createBoundPromptDocumentV1,
  createId,
  nowIso
} from "@ununu/unutv-contracts";

function text(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function orderedReferenceMediaIds(request = {}) {
  return [
    text(request.firstFrameMediaId),
    text(request.lastFrameMediaId),
    ...(Array.isArray(request.referenceMediaIds) ? request.referenceMediaIds.map(text) : [])
  ].filter(Boolean);
}

function sameOrdered(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function fail(code, message, details = null) {
  throw new UnuTvError(code, message, 409, details);
}

function requireCompilation(compilation, job, request) {
  const envelope = compilation?.envelope;
  const prompt = text(envelope?.compiledContentPrompt);
  if (!prompt || !text(envelope?.payloadHash) || !envelope?.sourceVersions) {
    fail(
      "storyboard_prompt_compilation_incomplete",
      "故事板图片必须先得到包含 Prompt、payloadHash 与 sourceVersions 的完整编译结果。"
    );
  }
  if (envelope.manualOverride === true || envelope.requiresPreflight === true || envelope.lint?.ok !== true) {
    fail(
      "storyboard_prompt_preflight_failed",
      "故事板编译 Prompt 未通过确定性预检，禁止进入 Provider。",
      { lint: envelope.lint ?? null, manualOverride: envelope.manualOverride === true }
    );
  }
  if (request?.prompt !== prompt) {
    fail(
      "storyboard_prompt_request_mismatch",
      "Provider 请求必须逐字复用已编译 Prompt，禁止在 dispatch 阶段重写或降级。"
    );
  }
  if (text(request?.provider) !== text(envelope.generationParameters?.provider)
    || text(request?.model) !== text(envelope.generationParameters?.model)
    || text(request?.provider) !== text(job?.provider)
    || text(request?.model) !== text(job?.model)) {
    fail(
      "storyboard_prompt_model_mismatch",
      "画布编译证据、批次与 Provider 请求的 provider/model 必须完全一致。"
    );
  }
  if (Number(request?.n ?? request?.count) !== 1) {
    fail("storyboard_prompt_count_invalid", "故事板单帧批次每次只能生成一张图片。");
  }
  if (job?.kind === "image" && (!text(request?.size) || !text(request?.background))) {
    fail(
      "storyboard_image_request_parameters_required",
      "故事板图片必须把 size 与 background 作为 Provider 参数显式持久化。"
    );
  }
  const bindings = [...(envelope.referenceBindings ?? [])].sort(
    (left, right) => Number(left.providerIndex) - Number(right.providerIndex)
  );
  const bindingMediaIds = bindings.map((binding) => text(binding.mediaId)).filter(Boolean);
  const requestMediaIds = orderedReferenceMediaIds(request);
  if (!sameOrdered(bindingMediaIds, requestMediaIds)) {
    fail(
      "storyboard_prompt_reference_order_mismatch",
      "画布参考清单必须与 Provider 最终图片输入顺序完全一致。",
      { bindingMediaIds, requestMediaIds }
    );
  }
  return { bindings, envelope, prompt };
}

async function resolveReferenceManifest({ bindings, executionNode, ports, projectId }) {
  const resolved = [];
  for (const binding of bindings) {
    const mediaId = text(binding.mediaId);
    const media = mediaId ? await ports.media.open(projectId, mediaId) : null;
    if (!media) {
      fail(
        "storyboard_prompt_reference_media_required",
        "故事板 Prompt 的每个参考 token 都必须绑定当前可读取媒体。",
        { mediaId, providerIndex: binding.providerIndex }
      );
    }
    if (text(binding.checksum) && text(media.sha256) !== text(binding.checksum)) {
      fail(
        "storyboard_prompt_reference_checksum_mismatch",
        "故事板 Prompt 参考媒体 checksum 与编译绑定不一致。",
        { actualChecksum: media.sha256, expectedChecksum: binding.checksum, mediaId }
      );
    }
    const sourceNodeId = text(binding.sourceNodeId);
    const sourceNode = sourceNodeId ? await ports.projects.getNode(projectId, sourceNodeId) : null;
    if (!sourceNode || sourceNode.canvasId !== executionNode.canvasId || sourceNode.id === executionNode.id) {
      fail(
        "storyboard_prompt_reference_source_required",
        "每个正式故事板参考必须来自同画布独立可见节点，禁止执行节点自引用。",
        { executionNodeId: executionNode.id, mediaId, sourceNodeId }
      );
    }
    resolved.push({
      assetId: text(binding.assetId),
      authorityRevision: text(binding.authorityRevision),
      checksum: text(media.sha256),
      controls: Array.isArray(binding.controls) ? binding.controls : [],
      displayName: text(binding.displayName) || `参考图${binding.providerIndex}`,
      doesNotControl: Array.isArray(binding.doesNotControl) ? binding.doesNotControl : [],
      edgeRole: `cinematic_reference:${text(binding.role) || "reference"}`,
      mediaId,
      providerIndex: Number(binding.providerIndex),
      role: text(binding.role) || "reference",
      sourceNodeId,
      versionId: text(binding.versionId)
    });
  }
  return resolved;
}

async function materializeTypedEdges({ executionNode, manifest, ports, projectId }) {
  if (!manifest.length) return [];
  if (typeof ports.projects.connectEdge !== "function") {
    fail("storyboard_prompt_reference_edge_port_required", "故事板 Prompt 持久化缺少 typed edge 端口。");
  }
  const edges = [];
  for (const binding of manifest) {
    edges.push(await ports.projects.connectEdge(projectId, {
      id: createId("edge"),
      canvasId: executionNode.canvasId,
      fromNodeId: binding.sourceNodeId,
      toNodeId: executionNode.id,
      role: binding.edgeRole,
      createdAt: nowIso()
    }));
  }
  return edges;
}

export async function persistStoryboardBatchPromptOnCanvas({
  compilation,
  executionNode,
  item,
  job,
  ports,
  projectId,
  request
}) {
  if (typeof ports.projects.saveNodePrompt !== "function") {
    fail("storyboard_prompt_persistence_port_required", "故事板 Prompt 必须先持久化到画布，禁止直接调用 Provider。");
  }
  const { bindings, envelope, prompt } = requireCompilation(compilation, job, request);
  const manifestBindings = await resolveReferenceManifest({
    bindings,
    executionNode,
    ports,
    projectId
  });
  const edges = await materializeTypedEdges({
    executionNode,
    manifest: manifestBindings,
    ports,
    projectId
  });
  const referenceManifest = {
    version: "StoryboardPromptReferenceManifestV1",
    compilationId: compilation.compilationId,
    executionNodeId: executionNode.id,
    payloadHash: envelope.payloadHash,
    bindings: manifestBindings.map((binding, index) => ({
      ...binding,
      edgeId: edges[index]?.id ?? null
    }))
  };
  const sourceVersions = {
    ...structuredClone(envelope.sourceVersions),
    storyboardBatchCanvasPrompt: {
      compilationId: compilation.compilationId,
      itemId: item.id,
      jobId: job.id,
      payloadHash: envelope.payloadHash,
      referenceManifest
    }
  };
  const documentBindings = bindings.map((binding) => {
    const resolved = manifestBindings.find(
      (entry) => entry.providerIndex === Number(binding.providerIndex)
    );
    return { ...binding, sourceNodeId: resolved?.sourceNodeId ?? binding.sourceNodeId ?? null };
  });
  const document = createBoundPromptDocumentV1(prompt, documentBindings);
  await ports.projects.saveNodePrompt(projectId, {
    nodeId: executionNode.id,
    text: prompt,
    document,
    provider: job.provider,
    modelId: job.model,
    mode: text(request.mode),
    parameters: {
      abstractIntentResolution: envelope.abstractIntentResolution ?? null,
      aspectRatio: text(request.aspectRatio),
      background: text(request.background),
      compiledContentPrompt: prompt,
      compilerVersion: envelope.compilerVersion,
      count: Number(request.n ?? request.count),
      n: Number(request.n ?? request.count),
      outputFormat: text(request.outputFormat),
      payloadHash: envelope.payloadHash,
      provider: text(request.provider),
      protocolId: envelope.protocolId,
      protocolVersion: envelope.protocolVersion,
      quality: text(request.quality),
      referenceManifest,
      resolution: text(request.resolution),
      size: text(request.size),
      model: text(request.model),
      sourceVersions,
      requestTrace: {
        idempotencyKey: item.idempotencyKey,
        itemId: item.id,
        jobId: job.id
      }
    },
    referenceNodeIds: manifestBindings.map((binding) => binding.sourceNodeId),
    referenceMediaIds: manifestBindings.map((binding) => binding.mediaId),
    updatedAt: nowIso()
  });
  return {
    document,
    payloadHash: envelope.payloadHash,
    referenceManifest,
    requestParameters: {
      aspectRatio: text(request.aspectRatio),
      background: text(request.background),
      model: text(request.model),
      n: Number(request.n ?? request.count),
      outputFormat: text(request.outputFormat),
      provider: text(request.provider),
      quality: text(request.quality),
      resolution: text(request.resolution),
      size: text(request.size)
    },
    sourceVersions
  };
}
