import assert from "node:assert/strict";
import test from "node:test";
import { hydrateLegacyPromptReferences } from "../apps/web/src/prompt-document-hydration.js";

test("legacy reference labels hydrate into durable rich Prompt tokens", () => {
  const document = { type: "doc", version: 1, content: [{ type: "text", text: "场景（参考图1），角色（参考图2）。" }] };
  const hydrated = hydrateLegacyPromptReferences(document, [
    { key: "scene", label: "血月客栈", referenceKind: "image", mediaId: "media-scene" },
    { key: "baili", label: "白璃", referenceKind: "image", assetId: "asset-baili", assetVersionId: "version-baili", mediaId: "media-baili" }
  ]);
  assert.deepEqual(hydrated.content.map((token) => token.type), ["text", "reference", "text", "reference", "text"]);
  assert.deepEqual(hydrated.content.filter((token) => token.type === "reference").map((token) => ({ label: token.label, mediaId: token.mediaId, providerIndex: token.providerIndex })), [
    { label: "血月客栈", mediaId: "media-scene", providerIndex: 1 },
    { label: "白璃", mediaId: "media-baili", providerIndex: 2 }
  ]);
});

test("legacy reference hydration stays unchanged without a real binding", () => {
  const document = { type: "doc", version: 1, content: [{ type: "text", text: "（参考图1）" }] };
  assert.equal(hydrateLegacyPromptReferences(document, [{ key: "display-only", label: "只有名字", referenceKind: "image" }]), document);
});
