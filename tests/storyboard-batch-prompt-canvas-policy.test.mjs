import assert from "node:assert/strict";
import test from "node:test";
import { resolveNodePromptCapability } from "@ununu/unutv-contracts";
import { projectStoryboardBatchItemPayload } from "../packages/core/src/storyboard-batch-canvas-projection.mjs";
import { persistStoryboardBatchPromptOnCanvas } from "../packages/core/src/storyboard-batch-prompt-canvas-policy.mjs";

function fixture(overrides = {}) {
  const executionNode = {
    id: "node-image-execution",
    canvasId: "canvas-main",
    kind: "image",
    payload: {},
    revision: 1
  };
  const sourceNode = {
    id: "node-scene-reference",
    canvasId: "canvas-main",
    kind: "asset",
    payload: {},
    revision: 1
  };
  const compilation = {
    compilationId: "image-prompt-compilation-1",
    envelope: {
      abstractIntentResolution: {
        providerClauses: ["低位暖灯形成具体方向性侧逆光"],
        unresolved: []
      },
      compiledContentPrompt: "参考图1「无名公寓门厅空间母版」\n\n唯一冻结时刻：八人刚刚停步。",
      compilerVersion: "ununu-cinematic-image-prompt-v3",
      generationParameters: {
        aspectRatio: "9:16",
        count: 1,
        model: "gpt-image-2",
        provider: "ununu",
        referenceMediaIds: ["media-scene-reference"],
        resolution: "1024x1536"
      },
      lint: { errors: [], ok: true, warnings: [] },
      manualOverride: false,
      payloadHash: "payload-hash-1",
      protocolId: "ununu.storyboard.keyframe.v1",
      protocolVersion: "2.0.0",
      referenceBindings: [{
        assetId: "asset-scene-reference",
        authorityRevision: "scene:r3",
        controls: ["空间拓扑", "人物站位"],
        displayName: "无名公寓门厅空间母版",
        doesNotControl: ["表演时序"],
        mediaId: "media-scene-reference",
        providerIndex: 1,
        required: true,
        role: "director_blocking",
        sourceNodeId: "node-scene-reference",
        versionId: "asset-version-scene-r3"
      }],
      requiresPreflight: false,
      sourceVersions: {
        targetRevision: 11,
        visualBibleRevision: 3
      }
    }
  };
  const item = {
    id: "storyboard-batch-item-1",
    idempotencyKey: "storyboard-batch-1:shot-1:image:v1"
  };
  const job = {
    id: "storyboard-batch-1",
    kind: "image",
    model: "gpt-image-2",
    provider: "ununu"
  };
  const request = {
    aspectRatio: "9:16",
    background: "opaque",
    count: 1,
    model: "gpt-image-2",
    n: 1,
    outputFormat: "png",
    prompt: compilation.envelope.compiledContentPrompt,
    provider: "ununu",
    quality: "auto",
    referenceMediaIds: ["media-scene-reference"],
    size: "1024x1536"
  };
  return {
    compilation,
    executionNode,
    item,
    job,
    media: {
      id: "media-scene-reference",
      nodeId: sourceNode.id,
      sha256: "sha256-scene-reference"
    },
    request,
    sourceNode,
    ...overrides
  };
}

function fakePorts(state, { failPromptSave = false } = {}) {
  return {
    media: {
      async open(_projectId, mediaId) {
        return mediaId === state.media.id ? state.media : null;
      }
    },
    projects: {
      async connectEdge(_projectId, edge) {
        state.edges.push(edge);
        return edge;
      },
      async getNode(_projectId, nodeId) {
        return [state.executionNode, state.sourceNode].find((node) => node.id === nodeId) ?? null;
      },
      async saveNodePrompt(_projectId, prompt) {
        if (failPromptSave) throw Object.assign(new Error("prompt storage unavailable"), { code: "prompt_storage_unavailable" });
        state.prompts.push(prompt);
        return { ...prompt, version: 1 };
      }
    }
  };
}

test("storyboard image compilation persists the canonical PromptDocument, request parameters, lineage, manifest and typed edges before dispatch", async () => {
  const state = { ...fixture(), edges: [], prompts: [] };
  const receipt = await persistStoryboardBatchPromptOnCanvas({
    compilation: state.compilation,
    executionNode: state.executionNode,
    item: state.item,
    job: state.job,
    ports: fakePorts(state),
    projectId: "project-1",
    request: state.request
  });

  assert.equal(state.prompts.length, 1);
  const prompt = state.prompts[0];
  assert.equal(prompt.text, state.compilation.envelope.compiledContentPrompt);
  assert.equal(prompt.provider, "ununu");
  assert.equal(prompt.modelId, "gpt-image-2");
  assert.equal(prompt.parameters.size, "1024x1536");
  assert.equal(prompt.parameters.background, "opaque");
  assert.equal(prompt.parameters.model, "gpt-image-2");
  assert.equal(prompt.parameters.n, 1);
  assert.equal(prompt.parameters.provider, "ununu");
  assert.equal(prompt.parameters.payloadHash, "payload-hash-1");
  assert.equal(prompt.parameters.compiledContentPrompt, state.compilation.envelope.compiledContentPrompt);
  assert.equal(prompt.parameters.sourceVersions.targetRevision, 11);
  assert.equal(prompt.parameters.sourceVersions.storyboardBatchCanvasPrompt.compilationId, state.compilation.compilationId);
  assert.deepEqual(prompt.referenceNodeIds, [state.sourceNode.id]);
  assert.deepEqual(prompt.referenceMediaIds, [state.media.id]);
  const referenceToken = prompt.document.content.find((token) => token.type === "reference");
  assert.equal(referenceToken.mediaId, state.media.id);
  assert.equal(referenceToken.sourceNodeId, state.sourceNode.id);
  assert.equal(referenceToken.providerIndex, 1);
  assert.equal(state.edges.length, 1);
  assert.equal(state.edges[0].fromNodeId, state.sourceNode.id);
  assert.equal(state.edges[0].toNodeId, state.executionNode.id);
  assert.equal(state.edges[0].role, "cinematic_reference:director_blocking");
  assert.equal(receipt.referenceManifest.bindings[0].edgeId, state.edges[0].id);
  assert.equal(receipt.referenceManifest.bindings[0].checksum, state.media.sha256);
  const canvasPayload = projectStoryboardBatchItemPayload({}, {
    compilation: state.compilation,
    item: state.item,
    job: state.job,
    promptPersistence: receipt,
    request: state.request
  });
  assert.deepEqual(canvasPayload.promptDocument, prompt.document);
  assert.equal(canvasPayload.cinematicPayloadHash, "payload-hash-1");
  assert.equal(canvasPayload.cinematicGenerationRequestParameters.background, "opaque");
  assert.equal(canvasPayload.cinematicReferenceManifest.bindings[0].edgeId, state.edges[0].id);
  assert.equal(resolveNodePromptCapability({ kind: "image", payload: canvasPayload }).promptCapable, true);
});

test("storyboard prompt preflight failure cannot persist or dispatch", async () => {
  let providerCalls = 0;
  const base = fixture();
  const state = {
    ...base,
    compilation: {
      ...base.compilation,
      envelope: {
        ...base.compilation.envelope,
        lint: { errors: [{ code: "unresolved_abstract_intent" }], ok: false, warnings: [] },
        requiresPreflight: true
      }
    },
    edges: [],
    prompts: []
  };
  await assert.rejects(
    (async () => {
      await persistStoryboardBatchPromptOnCanvas({
        compilation: state.compilation,
        executionNode: state.executionNode,
        item: state.item,
        job: state.job,
        ports: fakePorts(state),
        projectId: "project-1",
        request: state.request
      });
      providerCalls += 1;
    })(),
    (error) => error.code === "storyboard_prompt_preflight_failed"
  );
  assert.equal(providerCalls, 0);
  assert.equal(state.edges.length, 0);
  assert.equal(state.prompts.length, 0);
});

test("storyboard prompt persistence failure cannot dispatch Provider", async () => {
  let providerCalls = 0;
  const state = { ...fixture(), edges: [], prompts: [] };
  await assert.rejects(
    (async () => {
      await persistStoryboardBatchPromptOnCanvas({
        compilation: state.compilation,
        executionNode: state.executionNode,
        item: state.item,
        job: state.job,
        ports: fakePorts(state, { failPromptSave: true }),
        projectId: "project-1",
        request: state.request
      });
      providerCalls += 1;
    })(),
    (error) => error.code === "prompt_storage_unavailable"
  );
  assert.equal(providerCalls, 0);
  assert.equal(state.prompts.length, 0);
});

test("storyboard prompt persistence port is mandatory before dispatch", async () => {
  let providerCalls = 0;
  const state = { ...fixture(), edges: [], prompts: [] };
  const ports = fakePorts(state);
  delete ports.projects.saveNodePrompt;
  await assert.rejects(
    (async () => {
      await persistStoryboardBatchPromptOnCanvas({
        compilation: state.compilation,
        executionNode: state.executionNode,
        item: state.item,
        job: state.job,
        ports,
        projectId: "project-1",
        request: state.request
      });
      providerCalls += 1;
    })(),
    (error) => error.code === "storyboard_prompt_persistence_port_required"
  );
  assert.equal(providerCalls, 0);
  assert.equal(state.edges.length, 0);
});

test("storyboard reference cannot self-bind the execution node", async () => {
  let providerCalls = 0;
  const base = fixture();
  const state = {
    ...base,
    compilation: {
      ...base.compilation,
      envelope: {
        ...base.compilation.envelope,
        referenceBindings: base.compilation.envelope.referenceBindings.map((binding) => ({
          ...binding,
          sourceNodeId: base.executionNode.id
        }))
      }
    },
    edges: [],
    prompts: []
  };
  await assert.rejects(
    (async () => {
      await persistStoryboardBatchPromptOnCanvas({
        compilation: state.compilation,
        executionNode: state.executionNode,
        item: state.item,
        job: state.job,
        ports: fakePorts(state),
        projectId: "project-1",
        request: state.request
      });
      providerCalls += 1;
    })(),
    (error) => error.code === "storyboard_prompt_reference_source_required"
  );
  assert.equal(providerCalls, 0);
  assert.equal(state.edges.length, 0);
  assert.equal(state.prompts.length, 0);
});
