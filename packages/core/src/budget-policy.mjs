import { UnuTvError, budgetGrantAvailableAmount } from "@ununu/unutv-contracts";

function allowed(list, value) { return !list.length || list.includes(value); }

export function assertBudgetReservationAllowed(grant, request, timestamp = Date.now()) {
  if (!grant) throw new UnuTvError("BUDGET_GRANT_REQUIRED", "项目尚未设置全自动预算授权", 402);
  if (!Number.isFinite(request.amount) || request.amount <= 0) throw new UnuTvError("BUDGET_PRICE_UNKNOWN", "付费任务价格未知，自动化已安全暂停", 402);
  if (grant.validUntil && Date.parse(grant.validUntil) <= timestamp) throw new UnuTvError("BUDGET_GRANT_EXPIRED", "项目预算授权已过期", 402);
  if (!allowed(grant.allowedProviders, request.provider)) throw new UnuTvError("BUDGET_PROVIDER_NOT_ALLOWED", `预算未授权 Provider：${request.provider}`, 402);
  if (!allowed(grant.allowedModels, request.model)) throw new UnuTvError("BUDGET_MODEL_NOT_ALLOWED", `预算未授权模型：${request.model}`, 402);
  if (!allowed(grant.allowedTaskTypes, request.taskType)) throw new UnuTvError("BUDGET_TASK_NOT_ALLOWED", `预算未授权任务类型：${request.taskType}`, 402);
  if (request.amount > grant.perTaskLimit) throw new UnuTvError("BUDGET_TASK_LIMIT_EXCEEDED", "本次任务超过单任务预算上限", 402, { amount: request.amount, perTaskLimit: grant.perTaskLimit });
  const available = budgetGrantAvailableAmount(grant);
  if (request.amount > available) throw new UnuTvError("BUDGET_INSUFFICIENT", "项目预算余额不足，自动化已安全暂停", 402, { amount: request.amount, available });
  return { availableBefore: available, availableAfter: available - request.amount };
}
