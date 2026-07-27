import assert from "node:assert/strict";
import test from "node:test";
import { projectGenerationUnitLifecycleToNode, projectGenerationUnitPreflightToNode } from "../packages/core/src/cinematic-generation-unit-node-policy.mjs";
import { mediaEmptyState } from "../apps/web/src/media-empty-state-policy.js";

test("superseded and authority-blocked generation units project an honest empty canvas state", () => {
  const superseded = projectGenerationUnitLifecycleToNode({ lifecycle: "superseded", supersededReason: "旧场景像素已拒绝" });
  assert.equal(superseded.generationStatus, "blocked");
  assert.equal(superseded.generationUnitLifecycle, "superseded");
  assert.equal(superseded.auditOnly, true);
  assert.deepEqual(mediaEmptyState({ payload: superseded }, "video"), {
    detail: "旧生成单元已废弃：旧场景像素已拒绝",
    label: "旧生成单元已废弃"
  });
  const authorityBlocked = projectGenerationUnitLifecycleToNode({ lifecycle: "blocked_by_authority" });
  assert.equal(mediaEmptyState({ payload: authorityBlocked }, "video").label, "视频生产已阻断");
  assert.equal(projectGenerationUnitLifecycleToNode({ lifecycle: "active" }), null);
});

test("preflight projection keeps the execution node truthful and visibly ready", () => {
  const payload = projectGenerationUnitPreflightToNode({
    generationUnit: { executionNodeId: "node-p01a", revision: 58, lifecycle: "active", generationParameters: { firstFrameMediaId: null, lastFrameMediaId: null } },
    preflightResult: {
      compilationId: "prompt-compilation-current",
      ready: true,
      envelope: {
        sourceVersions: { generationUnitRevision: 58, shotRevisions: [{ shotId: "shot-p01a", revision: 56 }], teamManifestIds: ["team-current"] },
        lint: { errors: [] },
        preflight: { ok: true, errors: [] }
      }
    }
  });
  assert.equal(payload.generationStatus, "idle");
  assert.equal(payload.preflightStatus, "ready");
  assert.equal(payload.preflightReady, true);
  assert.equal(payload.shotRevision, 56);
  assert.equal(payload.promptCompilationId, "prompt-compilation-current");
  assert.equal(mediaEmptyState({ payload }, "video").label, "预检通过");
});
