import { UnuTvError } from "@ununu/unutv-contracts";

const parse = (value) => value ? JSON.parse(value) : [];

function grantRow(row) {
  return row ? {
    id: row.id, projectId: row.project_id, totalLimit: row.total_limit, perTaskLimit: row.per_task_limit, currency: row.currency,
    allowedProviders: parse(row.allowed_providers_json), allowedModels: parse(row.allowed_models_json), allowedTaskTypes: parse(row.allowed_task_types_json),
    validUntil: row.valid_until, reservedAmount: row.reserved_amount, consumedAmount: row.consumed_amount, revision: row.revision,
    createdAt: row.created_at, updatedAt: row.updated_at
  } : undefined;
}

function reservationRow(row) {
  return row ? {
    id: row.id, projectId: row.project_id, grantId: row.grant_id, automationRunId: row.automation_run_id, taskId: row.task_id,
    provider: row.provider, model: row.model, taskType: row.task_type, amount: row.amount, actualAmount: row.actual_amount,
    currency: row.currency, status: row.status, idempotencyKey: row.idempotency_key, createdAt: row.created_at, updatedAt: row.updated_at,
    consumedAt: row.consumed_at, releasedAt: row.released_at
  } : undefined;
}

export function attachProjectBudgetMethods(prototype, emitEvent) {
  prototype.getBudgetGrant = function getBudgetGrant(projectId) {
    return grantRow(this.database(projectId).prepare("SELECT * FROM budget_grants WHERE project_id=?").get(projectId));
  };
  prototype.saveBudgetGrant = function saveBudgetGrant(projectId, grant) {
    const database = this.database(projectId);
    database.prepare(`
      INSERT INTO budget_grants (id, project_id, total_limit, per_task_limit, currency, allowed_providers_json, allowed_models_json, allowed_task_types_json, valid_until, reserved_amount, consumed_amount, revision, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_id) DO UPDATE SET total_limit=excluded.total_limit, per_task_limit=excluded.per_task_limit, currency=excluded.currency,
        allowed_providers_json=excluded.allowed_providers_json, allowed_models_json=excluded.allowed_models_json, allowed_task_types_json=excluded.allowed_task_types_json,
        valid_until=excluded.valid_until, revision=excluded.revision, updated_at=excluded.updated_at
    `).run(grant.id, projectId, grant.totalLimit, grant.perTaskLimit, grant.currency, JSON.stringify(grant.allowedProviders), JSON.stringify(grant.allowedModels), JSON.stringify(grant.allowedTaskTypes), grant.validUntil, grant.reservedAmount, grant.consumedAmount, grant.revision, grant.createdAt, grant.updatedAt);
    emitEvent(database, "budget.grant_saved", grant.id, { totalLimit: grant.totalLimit, perTaskLimit: grant.perTaskLimit, revision: grant.revision });
    return this.getBudgetGrant(projectId);
  };
  prototype.createBudgetReservation = function createBudgetReservation(projectId, reservation) {
    const database = this.database(projectId);
    database.exec("BEGIN IMMEDIATE");
    try {
      const existing = reservationRow(database.prepare("SELECT * FROM budget_reservations WHERE grant_id=? AND idempotency_key=?").get(reservation.grantId, reservation.idempotencyKey));
      if (existing) { database.exec("COMMIT"); return existing; }
      const updated = database.prepare(`
        UPDATE budget_grants SET reserved_amount=reserved_amount+?, updated_at=?
        WHERE id=? AND total_limit-reserved_amount-consumed_amount>=?
      `).run(reservation.amount, reservation.updatedAt, reservation.grantId, reservation.amount);
      if (!updated.changes) throw new UnuTvError("BUDGET_INSUFFICIENT", "项目预算余额不足，自动化已安全暂停", 402);
      database.prepare(`
        INSERT INTO budget_reservations (id, project_id, grant_id, automation_run_id, task_id, provider, model, task_type, amount, actual_amount, currency, status, idempotency_key, created_at, updated_at, consumed_at, released_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 'reserved', ?, ?, ?, NULL, NULL)
      `).run(reservation.id, projectId, reservation.grantId, reservation.automationRunId, reservation.taskId, reservation.provider, reservation.model, reservation.taskType, reservation.amount, reservation.currency, reservation.idempotencyKey, reservation.createdAt, reservation.updatedAt);
      database.exec("COMMIT");
      emitEvent(database, "budget.reserved", reservation.id, { amount: reservation.amount, taskType: reservation.taskType, automationRunId: reservation.automationRunId });
      return reservation;
    } catch (error) { database.exec("ROLLBACK"); throw error; }
  };
  prototype.getBudgetReservation = function getBudgetReservation(projectId, reservationId) {
    return reservationRow(this.database(projectId).prepare("SELECT * FROM budget_reservations WHERE id=?").get(reservationId));
  };
  prototype.findBudgetReservation = function findBudgetReservation(projectId, grantId, idempotencyKey) {
    return reservationRow(this.database(projectId).prepare("SELECT * FROM budget_reservations WHERE grant_id=? AND idempotency_key=?").get(grantId, idempotencyKey));
  };
  prototype.settleBudgetReservation = function settleBudgetReservation(projectId, reservationId, action, amount, timestamp) {
    const database = this.database(projectId);
    database.exec("BEGIN IMMEDIATE");
    try {
      const reservation = reservationRow(database.prepare("SELECT * FROM budget_reservations WHERE id=?").get(reservationId));
      if (!reservation) throw new UnuTvError("budget_reservation_not_found", `Budget reservation not found: ${reservationId}`, 404);
      if (reservation.status === action) { database.exec("COMMIT"); return reservation; }
      if (reservation.status !== "reserved") throw new UnuTvError("budget_reservation_settled", "Budget reservation is already settled", 409);
      if (action === "consumed") {
        const accounted = amount ?? reservation.amount;
        if (!Number.isFinite(accounted) || accounted < 0 || accounted > reservation.amount) throw new UnuTvError("invalid_budget_consumption", "Actual cost must be between zero and the reserved amount", 400);
        database.prepare("UPDATE budget_grants SET reserved_amount=reserved_amount-?, consumed_amount=consumed_amount+?, updated_at=? WHERE id=?")
          .run(reservation.amount, accounted, timestamp, reservation.grantId);
        database.prepare("UPDATE budget_reservations SET status='consumed', actual_amount=?, consumed_at=?, updated_at=? WHERE id=?").run(amount, timestamp, timestamp, reservationId);
      } else {
        database.prepare("UPDATE budget_grants SET reserved_amount=reserved_amount-?, updated_at=? WHERE id=?").run(reservation.amount, timestamp, reservation.grantId);
        database.prepare("UPDATE budget_reservations SET status='released', released_at=?, updated_at=? WHERE id=?").run(timestamp, timestamp, reservationId);
      }
      database.exec("COMMIT");
      const saved = this.getBudgetReservation(projectId, reservationId);
      emitEvent(database, `budget.${action}`, reservationId, { amount: saved.actualAmount ?? saved.amount, automationRunId: saved.automationRunId });
      return saved;
    } catch (error) { database.exec("ROLLBACK"); throw error; }
  };
  prototype.reconcileBudgetReservationCost = function reconcileBudgetReservationCost(projectId, reservationId, actualAmount, timestamp) {
    const database = this.database(projectId);
    database.exec("BEGIN IMMEDIATE");
    try {
      const reservation = reservationRow(database.prepare("SELECT * FROM budget_reservations WHERE id=?").get(reservationId));
      if (!reservation) throw new UnuTvError("budget_reservation_not_found", `Budget reservation not found: ${reservationId}`, 404);
      if (reservation.status !== "consumed") throw new UnuTvError("budget_reconciliation_requires_consumed", "Only consumed reservations can be reconciled", 409);
      if (actualAmount !== null && (!Number.isFinite(actualAmount) || actualAmount < 0 || actualAmount > reservation.amount)) throw new UnuTvError("invalid_budget_consumption", "Actual cost must be between zero and the reserved amount, or null", 400);
      const previousAccounted = reservation.actualAmount ?? reservation.amount;
      const nextAccounted = actualAmount ?? reservation.amount;
      const delta = nextAccounted - previousAccounted;
      const updated = database.prepare("UPDATE budget_grants SET consumed_amount=consumed_amount+?, updated_at=? WHERE id=? AND consumed_amount+reserved_amount+?<=total_limit")
        .run(delta, timestamp, reservation.grantId, delta);
      if (!updated.changes) throw new UnuTvError("BUDGET_INSUFFICIENT", "Reconciled actual cost would exceed the project budget", 402);
      database.prepare("UPDATE budget_reservations SET actual_amount=?, updated_at=? WHERE id=?").run(actualAmount, timestamp, reservationId);
      database.exec("COMMIT");
      const saved = this.getBudgetReservation(projectId, reservationId);
      emitEvent(database, "budget.reconciled", reservationId, { actualAmount: saved.actualAmount, accountedAmount: saved.actualAmount ?? saved.amount, previousAccounted });
      return saved;
    } catch (error) { database.exec("ROLLBACK"); throw error; }
  };
  prototype.listBudgetReservations = function listBudgetReservations(projectId, automationRunId = null) {
    const database = this.database(projectId);
    const rows = automationRunId ? database.prepare("SELECT * FROM budget_reservations WHERE automation_run_id=? ORDER BY created_at DESC").all(automationRunId) : database.prepare("SELECT * FROM budget_reservations ORDER BY created_at DESC").all();
    return rows.map(reservationRow);
  };
}
