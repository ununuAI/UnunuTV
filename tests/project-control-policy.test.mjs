import test from "node:test";
import assert from "node:assert/strict";
import { assertControlTransition, assertProjectMutationAllowed, projectIsReadOnly } from "@ununu/unutv-core";

const active = {
  state: "auto_running",
  automationRunId: "automation-run-1",
  leaseId: "lease-1"
};

test("manual projects accept owner writes and reject unleased automation", () => {
  assert.equal(assertProjectMutationAllowed(undefined, { actorType: "owner" }).actorType, "owner");
  assert.throws(() => assertProjectMutationAllowed(undefined, { actorType: "automation" }), (error) => error.code === "AUTOMATION_LEASE_REQUIRED" && error.status === 423);
});

test("full-auto mode is read-only for owners and writable only through the matching automation lease", () => {
  assert.equal(projectIsReadOnly(active), true);
  assert.throws(() => assertProjectMutationAllowed(active), (error) => error.code === "PROJECT_READ_ONLY_AUTOMATION_ACTIVE" && error.status === 423);
  assert.throws(() => assertProjectMutationAllowed(active, { actorType: "automation", automationRunId: "automation-run-1", leaseId: "wrong" }), /只读/);
  assert.equal(assertProjectMutationAllowed(active, { actorType: "automation", automationRunId: "automation-run-1", leaseId: "lease-1", idempotencyKey: "task-1" }).idempotencyKey, "task-1");
});

test("the control state machine blocks unsafe shortcuts", () => {
  assert.doesNotThrow(() => assertControlTransition("auto_running", "auto_pausing"));
  assert.doesNotThrow(() => assertControlTransition("auto_paused", "manual_editable"));
  assert.throws(() => assertControlTransition("auto_running", "auto_paused"), /Cannot change/);
  assert.throws(() => assertControlTransition("auto_completed_review", "auto_running"), /Cannot change/);
});

