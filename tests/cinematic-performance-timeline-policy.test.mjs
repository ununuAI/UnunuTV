import assert from "node:assert/strict";
import test from "node:test";
import { assessCinematicPerformanceTimeline } from "@ununu/unutv-contracts";
import { cinematicPerformance } from "./fixtures/cinematic-performance.mjs";
import { renderCinematicPerformanceTimeline } from "../packages/contracts/src/cinematic-prompt-render-policy.mjs";

test("a generic emotion label cannot replace a causal performance timeline", () => {
  const result = assessCinematicPerformanceTimeline({ durationSeconds: 5, performance: { baseline: "悲伤克制", microExpression: "眼眶泛红" } });
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((entry) => entry.code === "shot_performance_timeline_required"), true);
  assert.equal(result.errors.some((entry) => entry.code === "shot_performance_forbidden_shortcuts_required"), true);
});

test("performance beats must cover the full shot without gaps or overlaps", () => {
  const performance = cinematicPerformance(5);
  performance.temporalBeats[1].startSeconds = 2;
  performance.temporalBeats[2].endSeconds = 4.5;
  const result = assessCinematicPerformanceTimeline({ durationSeconds: 5, performance });
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((entry) => entry.code === "shot_performance_timeline_gap"), true);
  assert.equal(result.errors.some((entry) => entry.code === "shot_performance_timeline_duration_mismatch"), true);
});

test("a complete temporal performance contract is reviewable", () => {
  const result = assessCinematicPerformanceTimeline({ durationSeconds: 5, performance: cinematicPerformance(5) });
  assert.deepEqual({ ok: result.ok, beatCount: result.beatCount, durationSeconds: result.durationSeconds }, { ok: true, beatCount: 3, durationSeconds: 5 });
});

test("the compiled performance text preserves inner state, visible evidence and global timing", () => {
  const rendered = renderCinematicPerformanceTimeline(cinematicPerformance(5), 4);
  assert.match(rendered, /秒级表演因果/u);
  assert.match(rendered, /4-5.25秒：人物内在=/u);
  assert.match(rendered, /可见证据=/u);
  assert.match(rendered, /表演禁止捷径/u);
});
