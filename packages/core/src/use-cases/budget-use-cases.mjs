import {
  UnuTvError,
  assertBudgetGrant,
  assertBudgetReservation,
  createId,
  nowIso,
  optionalText,
  requireNumber,
  requireText
} from "@ununu/unutv-contracts";
import { assertBudgetReservationAllowed } from "../budget-policy.mjs";

function bind(ports, method) {
  if (typeof ports.projects?.[method] !== "function") throw new TypeError(`Missing budget port: projects.${method}`);
  return ports.projects[method].bind(ports.projects);
}

function stringList(value, field) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) throw new UnuTvError("invalid_payload", `${field} must contain non-empty strings`, 400);
  return [...new Set(value.map((item) => item.trim()))];
}

export function createBudgetUseCases(ports) {
  const getGrantRecord = bind(ports, "getBudgetGrant");
  const saveGrantRecord = bind(ports, "saveBudgetGrant");
  const createReservationRecord = bind(ports, "createBudgetReservation");
  const getReservationRecord = bind(ports, "getBudgetReservation");
  const findReservationRecord = bind(ports, "findBudgetReservation");
  const settleReservationRecord = bind(ports, "settleBudgetReservation");
  const reconcileReservationRecord = bind(ports, "reconcileBudgetReservationCost");
  const listReservationRecords = bind(ports, "listBudgetReservations");

  async function getBudgetGrant(input = {}) { return getGrantRecord(requireText(input.projectId, "projectId")); }

  async function saveBudgetGrant(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const existing = await getGrantRecord(projectId);
    if (input.expectedRevision !== undefined && input.expectedRevision !== (existing?.revision ?? 0)) throw new UnuTvError("budget_grant_revision_conflict", "Budget grant changed; reload before saving", 409);
    const timestamp = nowIso();
    const grant = {
      id: existing?.id ?? createId("budget-grant"), projectId,
      totalLimit: requireNumber(input.totalLimit, "totalLimit"), perTaskLimit: requireNumber(input.perTaskLimit, "perTaskLimit"), currency: optionalText(input.currency, "CNY"),
      allowedProviders: stringList(input.allowedProviders, "allowedProviders"), allowedModels: stringList(input.allowedModels, "allowedModels"), allowedTaskTypes: stringList(input.allowedTaskTypes, "allowedTaskTypes"),
      validUntil: input.validUntil ? requireText(input.validUntil, "validUntil") : null,
      reservedAmount: existing?.reservedAmount ?? 0, consumedAmount: existing?.consumedAmount ?? 0,
      revision: (existing?.revision ?? 0) + 1, createdAt: existing?.createdAt ?? timestamp, updatedAt: timestamp
    };
    assertBudgetGrant(grant);
    return saveGrantRecord(projectId, grant);
  }

  async function pauseForBudget(projectId, error) {
    const session = await ports.projects.getProjectControlSession(projectId);
    if (session?.state !== "auto_running") return;
    const timestamp = nowIso();
    const pausing = await ports.projects.updateProjectControlSession(projectId, { ...session, state: "auto_pausing", revision: session.revision + 1, updatedAt: timestamp });
    const checkpoint = await ports.projects.createAutomationCheckpoint(projectId, { id: createId("checkpoint"), automationRunId: session.automationRunId, reason: "budget_blocked", payload: { code: error.code, message: error.message, details: error.details ?? null }, createdAt: timestamp });
    const paused = await ports.projects.updateProjectControlSession(projectId, { ...pausing, state: "auto_paused", leaseId: null, leaseExpiresAt: null, checkpointId: checkpoint.id, revision: pausing.revision + 1, updatedAt: nowIso(), payload: { ...pausing.payload, budgetBlock: checkpoint.payload } });
    const run = await ports.projects.getAutomationRun(projectId, session.automationRunId);
    await ports.projects.updateAutomationRun(projectId, { ...run, status: "paused", updatedAt: paused.updatedAt });
  }

  async function reserveBudget(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const grant = await getGrantRecord(projectId);
    const idempotencyKey = requireText(input.idempotencyKey ?? input.operationContext?.idempotencyKey, "idempotencyKey");
    if (grant) {
      const existing = await findReservationRecord(projectId, grant.id, idempotencyKey);
      if (existing) return existing;
    }
    const request = {
      provider: requireText(input.provider, "provider"), model: requireText(input.model, "model"), taskType: requireText(input.taskType, "taskType"),
      amount: typeof input.amount === "number" ? input.amount : Number.NaN, currency: optionalText(input.currency, grant?.currency ?? "CNY")
    };
    try {
      assertBudgetReservationAllowed(grant, request);
      if (request.currency !== grant.currency) throw new UnuTvError("BUDGET_CURRENCY_MISMATCH", `预算币种为 ${grant.currency}`, 402);
    }
    catch (error) { await pauseForBudget(projectId, error); throw error; }
    const timestamp = nowIso();
    const reservation = {
      id: createId("budget-reservation"), projectId, grantId: grant.id,
      automationRunId: input.operationContext?.automationRunId ?? input.automationRunId ?? null, taskId: input.taskId ? requireText(input.taskId, "taskId") : null,
      ...request, status: "reserved", idempotencyKey, createdAt: timestamp, updatedAt: timestamp, consumedAt: null, releasedAt: null
    };
    assertBudgetReservation(reservation);
    try { return await createReservationRecord(projectId, reservation); }
    catch (error) { if (String(error.code).startsWith("BUDGET_")) await pauseForBudget(projectId, error); throw error; }
  }

  async function settle(input, action) {
    const projectId = requireText(input.projectId, "projectId");
    const reservationId = requireText(input.reservationId, "reservationId");
    const existing = await getReservationRecord(projectId, reservationId);
    if (!existing) throw new UnuTvError("budget_reservation_not_found", `Budget reservation not found: ${reservationId}`, 404);
    const amount = action === "consumed" && input.actualAmount !== undefined ? requireNumber(input.actualAmount, "actualAmount") : null;
    return settleReservationRecord(projectId, reservationId, action, amount, nowIso());
  }

  const consumeBudgetReservation = (input = {}) => settle(input, "consumed");
  const releaseBudgetReservation = (input = {}) => settle(input, "released");
  async function reconcileBudgetReservation(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const reservationId = requireText(input.reservationId, "reservationId");
    const actualAmount = input.actualAmount === null ? null : requireNumber(input.actualAmount, "actualAmount");
    return reconcileReservationRecord(projectId, reservationId, actualAmount, nowIso());
  }
  async function listBudgetReservations(input = {}) { return listReservationRecords(requireText(input.projectId, "projectId"), input.automationRunId ?? null); }

  return { consumeBudgetReservation, getBudgetGrant, listBudgetReservations, reconcileBudgetReservation, releaseBudgetReservation, reserveBudget, saveBudgetGrant };
}
