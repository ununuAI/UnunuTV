import { UnuTvError } from "@ununu/unutv-contracts";

export const DEFAULT_AUTOMATION_LEASE_TTL_MS = 15_000;
export const MIN_AUTOMATION_LEASE_TTL_MS = 250;
export const MAX_AUTOMATION_LEASE_TTL_MS = 300_000;

export function normalizeAutomationLeaseTtl(value, fallback = DEFAULT_AUTOMATION_LEASE_TTL_MS) {
  const ttl = value === undefined || value === null ? fallback : Number(value);
  if (!Number.isFinite(ttl) || ttl < MIN_AUTOMATION_LEASE_TTL_MS || ttl > MAX_AUTOMATION_LEASE_TTL_MS) {
    throw new UnuTvError(
      "invalid_automation_lease_ttl",
      `leaseTtlMs must be between ${MIN_AUTOMATION_LEASE_TTL_MS} and ${MAX_AUTOMATION_LEASE_TTL_MS}`,
      400
    );
  }
  return Math.round(ttl);
}

export function automationLeaseWindow(timestamp, ttlMs) {
  const heartbeatAt = typeof timestamp === "string" ? timestamp : new Date(timestamp).toISOString();
  const started = Date.parse(heartbeatAt);
  if (!Number.isFinite(started)) throw new UnuTvError("invalid_automation_heartbeat", "heartbeatAt must be an ISO timestamp", 400);
  return {
    heartbeatAt,
    leaseExpiresAt: new Date(started + normalizeAutomationLeaseTtl(ttlMs)).toISOString()
  };
}

export function automationLeaseIsExpired(session, timestamp = Date.now()) {
  if (!session?.leaseId || !session?.leaseExpiresAt) return true;
  const expiresAt = Date.parse(session.leaseExpiresAt);
  const now = typeof timestamp === "string" ? Date.parse(timestamp) : Number(timestamp);
  return !Number.isFinite(expiresAt) || !Number.isFinite(now) || expiresAt <= now;
}

export function automationTaskLeaseIsExpired(task, timestamp = Date.now()) {
  if (!task?.workerLeaseId || !task?.leaseExpiresAt) return true;
  const expiresAt = Date.parse(task.leaseExpiresAt);
  const now = typeof timestamp === "string" ? Date.parse(timestamp) : Number(timestamp);
  return !Number.isFinite(expiresAt) || !Number.isFinite(now) || expiresAt <= now;
}

export function assertAutomationTaskLease(task, operationContext) {
  if (!task?.workerLeaseId || operationContext?.taskLeaseId !== task.workerLeaseId) {
    throw new UnuTvError(
      "AUTOMATION_TASK_LEASE_MISMATCH",
      "Task mutation requires the current worker lease",
      409,
      { taskId: task?.id ?? null }
    );
  }
  if (automationTaskLeaseIsExpired(task)) {
    throw new UnuTvError("AUTOMATION_TASK_LEASE_EXPIRED", "The worker lease expired; recover and reclaim the task", 409, { taskId: task.id });
  }
}
