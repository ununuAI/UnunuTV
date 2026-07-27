import { UnuTvError, requireText } from "@ununu/unutv-contracts";

export function generationStrategy(resolved, stage) {
  return resolved.configuration?.workflowManifest?.generationStrategies?.[stage]
    ?? resolved.configuration?.generationStrategies?.[stage]
    ?? resolved.configuration?.paidTaskBudgets?.[stage]
    ?? null;
}

export function buildAutomationRetryConfiguration({ configuration = {}, task, input = {}, cinematicWorkflow }) {
  if (!input.provider || !input.model || !input.executionNodeId) return null;
  const provider = requireText(input.provider, "provider");
  const model = requireText(input.model, "model");
  const executionNodeId = requireText(input.executionNodeId, "executionNodeId");
  if (cinematicWorkflow || configuration?.workflowManifest?.billingMode === "provider_account" || !input.amount) {
    const currentManifest = configuration.workflowManifest ?? {};
    return {
      ...configuration,
      workflowManifest: {
        ...currentManifest,
        generationStrategies: {
          ...(currentManifest.generationStrategies ?? {}),
          [task.stage]: {
            provider, model, executionNodeId,
            ...(input.configuration && typeof input.configuration === "object" && !Array.isArray(input.configuration) ? { configuration: input.configuration } : {})
          }
        }
      }
    };
  }
  const amount = Number(input.amount);
  if (!(amount > 0) || !Number.isFinite(amount)) throw new UnuTvError("invalid_payload", "amount must be greater than zero for legacy_budget retry", 400);
  return {
    ...configuration,
    paidTaskBudgets: {
      ...configuration.paidTaskBudgets,
      [task.stage]: {
        provider, model, executionNodeId, amount,
        ...(task.stage === "image_generation" || task.stage === "video_generation" ? { perItemAmount: amount } : {}),
        currency: input.currency ? requireText(input.currency, "currency") : "CNY",
        configuration: input.configuration && typeof input.configuration === "object" && !Array.isArray(input.configuration) ? input.configuration : {}
      }
    }
  };
}
