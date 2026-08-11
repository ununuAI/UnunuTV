export function auditCompiledProviderReferenceSet(envelope, parameters) {
  const bindings = Array.isArray(envelope?.referenceBindings) ? envelope.referenceBindings : [];
  const providerMediaIds = Array.isArray(parameters?.referenceMediaIds) ? parameters.referenceMediaIds.filter(Boolean) : [];
  const frameIds = new Set([parameters?.firstFrameMediaId, parameters?.lastFrameMediaId].filter(Boolean));
  const fullProviderOrder = bindings
    .filter((binding) => binding?.providerEligible !== false)
    .sort((left, right) => Number(left.providerIndex || 0) - Number(right.providerIndex || 0));
  const expected = fullProviderOrder.filter((binding) => !frameIds.has(binding?.mediaId));
  const expectedMediaIds = expected.map((binding) => binding.mediaId).filter(Boolean);
  const errors = [];
  if (expectedMediaIds.length !== providerMediaIds.length || expectedMediaIds.some((mediaId, index) => mediaId !== providerMediaIds[index])) {
    errors.push({ code: "compiled_provider_reference_manifest_mismatch", message: "Compiled reference bindings and generationParameters.referenceMediaIds differ", expectedMediaIds, providerMediaIds });
  }
  fullProviderOrder.forEach((binding, index) => {
    if (Number(binding.providerIndex) !== index + 1) errors.push({ code: "compiled_provider_reference_index_mismatch", message: `Reference ${binding.mediaId} providerIndex is not ${index + 1}`, mediaId: binding.mediaId, providerIndex: binding.providerIndex });
  });
  return { ok: errors.length === 0, errors, bindings: fullProviderOrder, expectedMediaIds, providerMediaIds };
}

export function requireGenerationExecutionDependencies(dependencies) {
  if (typeof dependencies.runNode !== "function"
    || typeof dependencies.pollRun !== "function"
    || typeof dependencies.updateNode !== "function") {
    throw new TypeError("Missing generation unit execution dependencies");
  }
}

export async function syncGenerationNode(projects, updateNode, projectId, nodeId, payload) {
  const current = await projects.getNode(projectId, nodeId);
  return updateNode({ projectId, nodeId, expectedRevision: current.revision, payload: { ...current.payload, ...payload } });
}
