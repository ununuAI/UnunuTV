import assert from "node:assert/strict";
import test from "node:test";
import {
  CINEMATIC_DYNAMIC_PROMPT_COVERAGE_FIELDS,
  CINEMATIC_STATIC_PROMPT_COVERAGE_FIELDS,
  evaluatePromptConstraintCoverage,
  validatePromptConstraintCoverage
} from "../packages/contracts/src/index.mjs";

function coverage({ dynamics = false, overrides = {} } = {}) {
  const fields = dynamics
    ? [...CINEMATIC_STATIC_PROMPT_COVERAGE_FIELDS, ...CINEMATIC_DYNAMIC_PROMPT_COVERAGE_FIELDS]
    : CINEMATIC_STATIC_PROMPT_COVERAGE_FIELDS;
  return {
    ...Object.fromEntries(fields.map((field) => [field, `${field} 的可观察事实与验收边界`])),
    escapeRoutes: ["模型可能把未约束的头颅外轮廓膨胀成第二头块"],
    counterexampleClosures: [{
      observedFailure: "生成正常反向侧脸加巨大空白头囊",
      omittedDetail: "没有约束颈椎连接、外轮廓和面部浮雕深度",
      positiveConstraint: "颈椎连接头颅底面中央，外轮廓保持普通单头尺度，后脑五官为浅浮雕",
      vetoCriterion: "出现第二头块、独立下颌或非中央颈部连接即拒绝"
    }],
    ...overrides
  };
}

test("static image Prompt coverage requires every observable geometry and state domain", () => {
  const result = validatePromptConstraintCoverage(coverage());
  assert.equal(result.ok, true, JSON.stringify(result.issues));
  const incomplete = coverage({ overrides: { topologyAttachments: "" } });
  const audit = evaluatePromptConstraintCoverage({ coverage: incomplete, required: true });
  assert.equal(audit.ok, false);
  assert.equal(audit.errors.some((entry) => entry.message.includes("topologyAttachments")), true);
});

test("video Prompt coverage additionally requires trajectories, timing, physics, audio and handoff", () => {
  const staticOnly = evaluatePromptConstraintCoverage({ coverage: coverage(), includeDynamics: true, required: true });
  assert.equal(staticOnly.ok, false);
  assert.equal(staticOnly.errors.some((entry) => entry.message.includes("subjectTrajectories")), true);
  const complete = evaluatePromptConstraintCoverage({ coverage: coverage({ dynamics: true }), includeDynamics: true, required: true });
  assert.equal(complete.ok, true, JSON.stringify(complete.errors));
  assert.equal(complete.coveredFields.length, 20);
});

test("a required production gate blocks missing coverage before Provider execution", () => {
  const audit = evaluatePromptConstraintCoverage({ coverage: null, includeDynamics: true, required: true });
  assert.deepEqual(audit.errors.map((entry) => entry.code), ["prompt_constraint_coverage_required"]);
});
