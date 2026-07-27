import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  CINEMATIC_SHOT_REVISION_REVIEW_TYPE,
  cinematicRevisionReviewTargetId
} from "@ununu/unutv-contracts";
import { createLocalRuntime } from "@ununu/unutv-local-runtime";
import { cinematicPerformance } from "./fixtures/cinematic-performance.mjs";

test("Owner cannot ACCEPT a shot revision until its causal performance timeline is complete", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-performance-review-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  const runtime = createLocalRuntime({ dataRoot, recoverRenders: false, recoverAutomation: false, runAutomationExecutor: false });
  context.after(() => runtime.close());
  const { project } = await runtime.app.createProject({ title: "表演审批门禁" });
  const production = await runtime.app.createCinematicProduction({ projectId: project.id, title: "测试", projectType: "short_film" });
  const shot = await runtime.app.saveShot({ projectId: project.id, productionId: production.productionId, shot: {
    order: 1, narrativeJob: "人物在触发后转身", storyBeat: "确认来人", openingState: "人物背对入口", trigger: "脚步声进入",
    actionChain: ["先听脚步", "停顿", "再转身"], endingState: "人物看向入口", durationSeconds: 5,
    blocking: {}, cinematography: {}, lighting: {}, color: {}, performance: { baseline: "克制悲伤" }, sound: {}, physicsVfx: {}, editContinuity: {},
    dialogue: [], requiredAssetIds: [], mustNotAppearYet: ["脚步前转身"], acceptanceCriteria: ["转身时机准确"]
  } });
  const targetId = cinematicRevisionReviewTargetId("shot", shot.shotId, shot.revision);
  await assert.rejects(
    runtime.app.reviewTarget({ projectId: project.id, targetType: CINEMATIC_SHOT_REVISION_REVIEW_TYPE, targetId, state: "accepted" }),
    (error) => error?.code === "shot_performance_contract_required" && error?.details?.errors?.some((entry) => entry.code === "shot_performance_timeline_required")
  );
  const corrected = await runtime.app.updateShot({
    projectId: project.id, productionId: production.productionId, shotId: shot.shotId,
    patch: { performance: cinematicPerformance(5, { trigger: "脚步声先进入，人物确认后才转身" }) }
  });
  const accepted = await runtime.app.reviewTarget({
    projectId: project.id, targetType: CINEMATIC_SHOT_REVISION_REVIEW_TYPE,
    targetId: cinematicRevisionReviewTargetId("shot", corrected.shotId, corrected.revision), state: "accepted"
  });
  assert.equal(accepted.state, "accepted");
});
