import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createLocalRuntime } from "../packages/local-runtime/src/index.mjs";

test("legacy short-drama canvas pipeline is sealed", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-sd-legacy-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  const runtime = createLocalRuntime({ dataRoot, runAutomationExecutor: false, recoverAutomation: false });
  context.after(() => runtime.close());

  await assert.rejects(
    () => runtime.app.produceShortDramaOnCanvas({ brief: "不应进入旧管线" }),
    (error) => error?.code === "legacy_short_drama_pipeline_blocked" && error?.status === 410
  );
});
