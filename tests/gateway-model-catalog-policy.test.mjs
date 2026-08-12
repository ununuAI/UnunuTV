import assert from "node:assert/strict";
import test from "node:test";
import {
  gatewayModelCapability,
  gatewayModelLabel,
  projectGatewayModels
} from "../packages/contracts/src/gateway-model-catalog-policy.mjs";

// 网关 /v1/models 只返回 id/object/created/owned_by,不声明模态,归类必须由我们做
const GATEWAY_SAMPLE = [
  { id: "openai/gpt-5.6-sol" }, { id: "openai/gpt-5.6-terra" }, { id: "openai/gpt-5.6-luna" },
  { id: "x-ai/grok-4.5" }, { id: "openai/gpt-5.5" }, { id: "openai/gpt-5.4" },
  { id: "deepseek/deepseek-v4-pro" }, { id: "deepseek/deepseek-v4-flash" },
  { id: "openai/gpt-5.4-mini" }, { id: "openai/gpt-5.3-codex-spark" }, { id: "openai/gpt-image-2" }
];

test("image models are separated from chat models by id, since the gateway declares no modality", () => {
  assert.equal(gatewayModelCapability("openai/gpt-image-2"), "image");
  assert.equal(gatewayModelCapability("openai/gpt-5.6-sol"), "text");
  assert.equal(gatewayModelCapability("deepseek/deepseek-v4-pro"), "text");
  assert.equal(gatewayModelCapability("x-ai/grok-4.5"), "text");
  assert.equal(gatewayModelCapability(""), null);
});

test("the real gateway catalog splits into ten chat models and one image model", () => {
  const text = projectGatewayModels(GATEWAY_SAMPLE, "text");
  const image = projectGatewayModels(GATEWAY_SAMPLE, "image");
  assert.equal(text.length, 10);
  assert.deepEqual(image.map((model) => model.id), ["openai/gpt-image-2"]);
  // 网关把新模型排在前面,顺序不能被打乱
  assert.equal(text[0].id, "openai/gpt-5.6-sol");
  assert.equal(text.some((model) => model.id === "openai/gpt-image-2"), false, "图片模型不该混进文本目录");
});

test("labels drop the vendor prefix and keep brand casing readable", () => {
  assert.equal(gatewayModelLabel("openai/gpt-5.6-sol"), "GPT 5.6 Sol");
  assert.equal(gatewayModelLabel("deepseek/deepseek-v4-pro"), "DeepSeek V4 Pro");
  assert.equal(gatewayModelLabel("x-ai/grok-4.5"), "Grok 4.5");
  assert.equal(gatewayModelLabel("openai/gpt-image-2"), "GPT Image 2");
});

test("a malformed or empty gateway payload yields an empty catalog instead of throwing", () => {
  assert.deepEqual(projectGatewayModels(null, "text"), []);
  assert.deepEqual(projectGatewayModels([{ noId: true }, 42], "text"), []);
  assert.deepEqual(projectGatewayModels(["openai/gpt-5.5"], "text"), [{ id: "openai/gpt-5.5", label: "GPT 5.5" }]);
});
