import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assertPromptDocumentV1,
  createBoundPromptDocumentV1,
  promptDocumentPlainText,
  promptDocumentReferenceBindings
} from "@ununu/unutv-contracts";
import { createLocalRuntime } from "@ununu/unutv-local-runtime";

const document = {
  type: "doc",
  version: 1,
  content: [
    { type: "text", text: "真实手持跟拍" },
    { type: "reference", id: "ref-character", label: "陆星野", referenceKind: "character", assetId: "asset-character", assetVersionId: "asset-version-2", mediaId: "media-character", role: "identity", controls: ["face", "body"], doesNotControl: ["camera"], versionPolicy: "pinned" },
    { type: "constraint", id: "constraint-skin", label: "保留真实皮肤纹理", constraintId: "skin-realism", severity: "hard" },
    { type: "skill", id: "skill-live-action", label: "真人写实", skillId: "live-action-realism" }
  ]
};

test("compiled reference placeholders become exact pinned rich tokens", () => {
  const bound = createBoundPromptDocumentV1("白璃（参考图1）进入血月客栈（参考图2）", [
    { providerIndex: 1, displayName: "白璃身份母版", assetId: "asset-baili", versionId: "version-baili", mediaId: "media-baili", role: "character_identity", authorityRevision: "authority-baili:r3", controls: ["面孔"], doesNotControl: ["运镜"] },
    { providerIndex: 2, displayName: "客栈空间母版", assetId: "asset-inn", versionId: "version-inn", mediaId: "media-inn", role: "scene_identity", authorityRevision: "authority-inn:r2" }
  ]);
  const references = bound.content.filter((token) => token.type === "reference");
  assert.deepEqual(references.map((token) => ({ label: token.label, mediaId: token.mediaId, assetVersionId: token.assetVersionId, providerIndex: token.providerIndex })), [
    { label: "白璃身份母版", mediaId: "media-baili", assetVersionId: "version-baili", providerIndex: 1 },
    { label: "客栈空间母版", mediaId: "media-inn", assetVersionId: "version-inn", providerIndex: 2 }
  ]);
  assert.equal(promptDocumentPlainText(bound), "白璃（参考媒体1）进入血月客栈（参考媒体2）");
});

test("Momo-style reference equals mappings become pinned rich tokens without losing aliases", () => {
  const bound = createBoundPromptDocumentV1([
    "【参考】",
    "参考图1「S01 · 3D导演台空间调度底图」 = S01空间调度。",
    "参考图2「三主角 · 身份合集」 = 白璃、顾沉、洛青。"
  ].join("\n"), [
    { providerIndex: 1, displayName: "S01 · 3D导演台空间调度底图", assetId: "asset-stage", versionId: "version-stage", mediaId: "media-stage", role: "director_blocking" },
    { providerIndex: 2, displayName: "三主角 · 身份合集", assetId: "asset-heroes", versionId: "version-heroes", mediaId: "media-heroes", role: "character_identity_ensemble" }
  ]);
  const references = bound.content.filter((token) => token.type === "reference");
  assert.deepEqual(references.map((token) => [token.label, token.providerIndex, token.mediaId]), [
    ["S01 · 3D导演台空间调度底图", 1, "media-stage"],
    ["三主角 · 身份合集", 2, "media-heroes"]
  ]);
  assert.equal(promptDocumentPlainText(bound), "【参考】\n（参考媒体1） = S01空间调度。\n（参考媒体2） = 白璃、顾沉、洛青。");
});

test("PromptDocumentV1 keeps UI titles separate from provider reference numbering", () => {
  const normalized = assertPromptDocumentV1(document);
  assert.equal(normalized.content[1].label, "陆星野");
  assert.equal(normalized.content[1].mediaId, "media-character");
  assert.equal(promptDocumentPlainText(document), "真实手持跟拍（参考媒体1）（约束：保留真实皮肤纹理）（启用能力：真人写实）");
  assert.deepEqual(promptDocumentReferenceBindings(document), [{
    assetId: "asset-character",
    assetVersionId: "asset-version-2",
    authorityRevision: null,
    controls: ["face", "body"],
    doesNotControl: ["camera"],
    mediaId: "media-character",
    providerIndex: 1,
    role: "identity",
    sourceNodeId: null,
    versionPolicy: "pinned"
  }]);
});

test("PromptDocumentV1 persists atomically and contributes real media bindings", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "ununu-prompt-document-"));
  const runtime = createLocalRuntime({ dataRoot });
  context.after(() => runtime.close());
  const { project, canvas } = await runtime.app.createProject({ title: "富 Prompt" });
  const node = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "video", title: "镜头" });
  const saved = await runtime.app.saveNodePrompt({ projectId: project.id, nodeId: node.id, document, parameters: {}, referenceNodeIds: [], referenceMediaIds: [] });
  assert.equal(saved.text, "真实手持跟拍（参考媒体1）（约束：保留真实皮肤纹理）（启用能力：真人写实）");
  assert.deepEqual(saved.referenceMediaIds, ["media-character"]);
  assert.deepEqual((await runtime.app.getNodePrompt({ projectId: project.id, nodeId: node.id })).document, assertPromptDocumentV1(document));
});

test("PromptDocumentV1 rejects display-only references", () => {
  assert.throws(() => assertPromptDocumentV1({ type: "doc", version: 1, content: [{ type: "reference", id: "ref", label: "只有名字" }] }), /must bind/);
});
