function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function resolvePromptModelSelection(prompt, payload) {
  const nodePayload = object(payload);
  const storedSelection = object(nodePayload.modelSelection);
  const promptModelId = text(prompt?.modelId);
  const storedModelId = text(storedSelection.modelId);
  const payloadModelId = text(nodePayload.modelId);
  const modelId = promptModelId || storedModelId || payloadModelId;
  if (!modelId) return undefined;

  const providerId = text(prompt?.provider)
    || text(storedSelection.providerId)
    || text(nodePayload.provider)
    || "ununu";
  const promptParameters = object(prompt?.parameters);
  const parameters = {
    ...object(nodePayload.parameters),
    ...object(storedSelection.parameters),
    ...promptParameters
  };
  const mode = text(prompt?.mode) || text(parameters.mode) || text(nodePayload.mode);
  if (mode && !text(parameters.mode)) parameters.mode = mode;

  return { modelId, providerId, parameters };
}
