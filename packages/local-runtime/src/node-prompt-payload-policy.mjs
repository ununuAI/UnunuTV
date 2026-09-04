export function mergeNodePromptPayload(payload, input) {
  const next = {
    ...payload,
    prompt: input.text,
    ...(input.provider ? { provider: input.provider } : {}),
    ...(input.modelId ? { modelId: input.modelId } : {}),
    ...(input.mode ? { mode: input.mode } : {}),
    parameters: input.parameters
  };
  if (input.modelId) {
    next.modelSelection = {
      modelId: input.modelId,
      providerId: input.provider || payload?.provider || "ununu",
      parameters: {
        ...input.parameters,
        ...(input.mode && !input.parameters?.mode ? { mode: input.mode } : {})
      }
    };
  }
  return next;
}
