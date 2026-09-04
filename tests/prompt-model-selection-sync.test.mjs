import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createLocalRuntime } from "@ununu/unutv-local-runtime";
import { resolvePromptModelSelection } from "../apps/web/src/prompt-model-selection.js";

test("Prompt UI falls back to canonical flat node execution fields", () => {
  assert.deepEqual(resolvePromptModelSelection(null, {
    provider: "autodl",
    modelId: "MiniMax-H3",
    mode: "image_reference",
    parameters: { duration: 15, resolution: "768p", aspectRatio: "16:9" }
  }), {
    providerId: "autodl",
    modelId: "MiniMax-H3",
    parameters: { duration: 15, resolution: "768p", aspectRatio: "16:9", mode: "image_reference" }
  });
});

test("text-only Prompt saves preserve and project the existing model selection", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "ununu-prompt-selection-sync-"));
  const runtime = createLocalRuntime({ dataRoot, recoverAutomation: false, recoverRenders: false, runAutomationExecutor: false });
  context.after(() => runtime.close());
  const { project, canvas } = await runtime.app.createProject({ title: "Prompt selection sync" });
  const created = await runtime.app.createNode({
    projectId: project.id,
    canvasId: canvas.id,
    kind: "video",
    title: "H3 15s",
    payload: {
      provider: "autodl",
      modelId: "MiniMax-H3",
      mode: "image_reference",
      parameters: { duration: 15, resolution: "768p", aspectRatio: "16:9" }
    }
  });

  await runtime.app.saveNodePrompt({ projectId: project.id, nodeId: created.id, text: "H3 prompt" });

  const prompt = await runtime.app.getNodePrompt({ projectId: project.id, nodeId: created.id });
  assert.equal(prompt.provider, "autodl");
  assert.equal(prompt.modelId, "MiniMax-H3");
  assert.equal(prompt.mode, "image_reference");
  assert.deepEqual(prompt.parameters, { duration: 15, resolution: "768p", aspectRatio: "16:9" });

  const node = await runtime.projects.getNode(project.id, created.id);
  assert.deepEqual(node.payload.modelSelection, {
    providerId: "autodl",
    modelId: "MiniMax-H3",
    parameters: { duration: 15, resolution: "768p", aspectRatio: "16:9", mode: "image_reference" }
  });
});
