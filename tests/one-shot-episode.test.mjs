import assert from "node:assert/strict";
import test from "node:test";
import { createLocalRuntime } from "../packages/local-runtime/src/index.mjs";

test("legacy oneShotCinematicEpisode remains removed", async () => {
  const runtime = createLocalRuntime({ runAutomationExecutor: false, recoverAutomation: false });
  try {
    await assert.rejects(
      () => runtime.app.oneShotCinematicEpisode({ brief: "不应进入旧的一次性 API" }),
      (error) => error?.code === "one_shot_removed" || error?.status === 410
    );
  } finally {
    runtime.close();
  }
});
