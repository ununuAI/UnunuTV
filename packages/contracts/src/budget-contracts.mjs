export const BUDGET_RESERVATION_STATES = Object.freeze(["reserved", "consumed", "released"]);

function isMoney(value) { return typeof value === "number" && Number.isFinite(value) && value >= 0; }
function requiredText(value) { return typeof value === "string" && Boolean(value.trim()); }

export function assertBudgetGrant(value) {
  const issues = [];
  for (const field of ["id", "projectId", "currency", "createdAt", "updatedAt"]) if (!requiredText(value?.[field])) issues.push(`${field} is required`);
  for (const field of ["totalLimit", "perTaskLimit", "reservedAmount", "consumedAmount"]) if (!isMoney(value?.[field])) issues.push(`${field} must be a non-negative finite number`);
  if (value?.perTaskLimit > value?.totalLimit) issues.push("perTaskLimit cannot exceed totalLimit");
  if ((value?.reservedAmount ?? 0) + (value?.consumedAmount ?? 0) > (value?.totalLimit ?? 0)) issues.push("reserved plus consumed cannot exceed totalLimit");
  for (const field of ["allowedProviders", "allowedModels", "allowedTaskTypes"]) if (!Array.isArray(value?.[field])) issues.push(`${field} must be an array`);
  if (!Number.isInteger(value?.revision) || value.revision < 1) issues.push("revision must be a positive integer");
  if (issues.length) throw Object.assign(new Error(`BudgetGrant validation failed: ${issues.join("; ")}`), { code: "invalid_budget_grant", status: 400 });
  return value;
}

export function assertBudgetReservation(value) {
  const issues = [];
  for (const field of ["id", "projectId", "grantId", "provider", "model", "taskType", "currency", "status", "idempotencyKey", "createdAt", "updatedAt"]) if (!requiredText(value?.[field])) issues.push(`${field} is required`);
  if (!isMoney(value?.amount) || value.amount <= 0) issues.push("amount must be greater than zero");
  if (value?.actualAmount !== null && value?.actualAmount !== undefined && (!isMoney(value.actualAmount) || value.actualAmount > value.amount)) issues.push("actualAmount must be between zero and amount, or null while awaiting reconciliation");
  if (!BUDGET_RESERVATION_STATES.includes(value?.status)) issues.push("status is invalid");
  if (issues.length) throw Object.assign(new Error(`BudgetReservation validation failed: ${issues.join("; ")}`), { code: "invalid_budget_reservation", status: 400 });
  return value;
}

export function budgetReservationCostState(reservation) {
  if (reservation?.status === "reserved") return "reserved_estimate";
  if (reservation?.status === "consumed" && reservation.actualAmount === null) return "consumed_estimate_pending_reconciliation";
  if (reservation?.status === "consumed") return "consumed_actual";
  return "released";
}

export function budgetGrantAvailableAmount(grant) {
  return Math.max(0, grant.totalLimit - grant.reservedAmount - grant.consumedAmount);
}
