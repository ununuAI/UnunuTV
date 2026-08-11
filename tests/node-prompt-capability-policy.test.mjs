import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { resolveNodePromptCapability } from "@ununu/unutv-contracts";
import { createLocalRuntime } from "@ununu/unutv-local-runtime";
import { buildNodePresentationV2 } from "../apps/web/src/node-presentation-view-model.js";

test("canonical Prompt capability is limited to image, videoShot/video, and audio execution nodes", () => {
  for (const kind of ["image", "video", "videoShot", "audio"]) {
    const capability = resolveNodePromptCapability({ kind, payload: {} });
    assert.equal(capability.promptCapable, true, kind);
    assert.equal(capability.promptDocumentCapable, true, kind);
    assert.equal(capability.compiledClausesCapable, true, kind);
    assert.equal(capability.runSurfaceCapable, true, kind);
  }
  assert.equal(resolveNodePromptCapability({ kind: "videoShot", payload: {} }).executionKind, "video");
  assert.equal(resolveNodePromptCapability({ kind: "videoShot", payload: {} }).surface, "dedicated");
  for (const kind of ["review", "script", "story", "asset", "director", "cinematic", "generationUnit", "qa", "world"]) {
    assert.equal(resolveNodePromptCapability({ kind, payload: {} }).promptCapable, false, kind);
  }
});

test("dialogue_editor professional contribution never projects as Prompt-capable", () => {
  const reviewNode = {
    id: "review-dialogue-editor",
    kind: "review",
    title: "对白审校 · r1",
    revision: 1,
    payload: { resourceType: "professional_contribution", roleId: "dialogue_editor" }
  };
  const presentation = buildNodePresentationV2(reviewNode);
  assert.equal(presentation.capabilities.promptCapable, false);
  assert.equal(presentation.capabilities.promptDocumentCapable, false);
  assert.equal(presentation.capabilities.compiledClausesCapable, false);
  assert.equal(presentation.capabilities.runSurfaceCapable, false);
  assert.equal(presentation.capabilities.promptSurface, "none");
  assert.equal(presentation.capabilities.promptCapabilityReason, "non_generative_semantic_node");
});

test("Core rejects PromptDocument writes and hides legacy Prompt rows on review nodes", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "ununu-node-prompt-capability-"));
  const runtime = createLocalRuntime({ dataRoot, recoverAutomation: false, recoverRenders: false, runAutomationExecutor: false });
  context.after(() => runtime.close());
  const { project, canvas } = await runtime.app.createProject({ title: "Prompt capability" });
  const review = await runtime.app.createNode({
    projectId: project.id,
    canvasId: canvas.id,
    kind: "review",
    title: "对白审校",
    payload: { resourceType: "professional_contribution", roleId: "dialogue_editor" }
  });
  await assert.rejects(
    runtime.app.saveNodePrompt({
      projectId: project.id,
      nodeId: review.id,
      text: "自由 Prompt",
      document: { type: "doc", version: 1, content: [{ type: "text", text: "自由 Prompt" }] }
    }),
    (error) => error?.code === "prompt_not_supported"
  );
  assert.equal(await runtime.app.getNodePrompt({ projectId: project.id, nodeId: review.id }), undefined);
});
