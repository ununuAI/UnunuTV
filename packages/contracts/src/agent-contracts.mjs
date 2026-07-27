export const AUTOMATION_TASK_STATES = Object.freeze(["queued", "running", "succeeded", "failed", "blocked", "cancelled", "reused"]);
export const AUTOMATION_ACTIVITY_KINDS = Object.freeze(["status", "progress", "artifact", "note", "warning", "completed", "failed"]);

function requiredText(value) {
  return typeof value === "string" && Boolean(value.trim());
}

function optionalProgress(value) {
  return value === null || value === undefined || (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1);
}

function optionalCount(value) {
  return value === null || value === undefined || (Number.isInteger(value) && value >= 0);
}

export function assertAgentProfile(value) {
  const issues = [];
  for (const field of ["profileId", "role", "displayName", "responsibility", "outputContract", "workflowVersion", "failureStrategy"]) if (typeof value?.[field] !== "string" || !value[field].trim()) issues.push(`${field} is required`);
  for (const field of ["skills", "knowledgeRefs", "tools", "writableResourceTypes", "paidTaskTypes"]) if (!Array.isArray(value?.[field])) issues.push(`${field} must be an array`);
  if (issues.length) throw Object.assign(new Error(`AgentProfile validation failed: ${issues.join("; ")}`), { code: "invalid_agent_profile", status: 500 });
  return value;
}

export function assertAutomationTask(value) {
  const issues = [];
  for (const field of ["id", "automationRunId", "projectId", "taskKey", "agentProfileId", "stage", "status", "idempotencyKey", "createdAt", "updatedAt"]) if (typeof value?.[field] !== "string" || !value[field].trim()) issues.push(`${field} is required`);
  if (!AUTOMATION_TASK_STATES.includes(value?.status)) issues.push("status is invalid");
  if (!Array.isArray(value?.dependencies)) issues.push("dependencies must be an array");
  if (typeof value?.paid !== "boolean") issues.push("paid must be boolean");
  if (!Number.isInteger(value?.attempt) || value.attempt < 0) issues.push("attempt must be a non-negative integer");
  for (const field of ["workerLeaseId", "heartbeatAt", "leaseExpiresAt"]) {
    if (value?.[field] !== null && value?.[field] !== undefined && !requiredText(value[field])) issues.push(`${field} must be a string or null`);
  }
  if (value?.status === "running" && !requiredText(value?.workerLeaseId)) issues.push("running task requires workerLeaseId");
  if (issues.length) throw Object.assign(new Error(`AutomationTask validation failed: ${issues.join("; ")}`), { code: "invalid_automation_task", status: 500 });
  return value;
}

export function assertAutomationArtifactRef(value) {
  const issues = [];
  for (const field of ["resourceType", "resourceId"]) if (!requiredText(value?.[field])) issues.push(`${field} is required`);
  for (const field of ["title", "versionId", "mediaId"]) if (value?.[field] !== undefined && value?.[field] !== null && typeof value[field] !== "string") issues.push(`${field} must be a string or null`);
  if (issues.length) throw Object.assign(new Error(`AutomationArtifactRef validation failed: ${issues.join("; ")}`), { code: "invalid_automation_artifact_ref", status: 400 });
  return value;
}

export function assertAutomationTaskActivity(value) {
  const issues = [];
  for (const field of ["id", "projectId", "automationRunId", "taskId", "agentProfileId", "kind", "message", "idempotencyKey", "createdAt"]) if (!requiredText(value?.[field])) issues.push(`${field} is required`);
  if (!AUTOMATION_ACTIVITY_KINDS.includes(value?.kind)) issues.push("kind is invalid");
  if (!Number.isInteger(value?.sequence) || value.sequence < 1) issues.push("sequence must be a positive integer");
  if (!optionalProgress(value?.progress)) issues.push("progress must be null or a number between 0 and 1");
  if (!optionalCount(value?.currentUnit)) issues.push("currentUnit must be null or a non-negative integer");
  if (!optionalCount(value?.totalUnits)) issues.push("totalUnits must be null or a non-negative integer");
  if (Number.isInteger(value?.currentUnit) && Number.isInteger(value?.totalUnits) && value.currentUnit > value.totalUnits) issues.push("currentUnit cannot exceed totalUnits");
  if (!Array.isArray(value?.artifactRefs)) issues.push("artifactRefs must be an array");
  else for (const artifact of value.artifactRefs) {
    try { assertAutomationArtifactRef(artifact); }
    catch (error) { issues.push(error.message); }
  }
  if (!value?.details || typeof value.details !== "object" || Array.isArray(value.details)) issues.push("details must be an object");
  if (issues.length) throw Object.assign(new Error(`AutomationTaskActivity validation failed: ${issues.join("; ")}`), { code: "invalid_automation_task_activity", status: 400 });
  return value;
}
