import assert from "node:assert/strict";
import test from "node:test";
import { formatGenerationError } from "../apps/web/src/generation-error-message.js";

test("real-person provider rejection includes provider, model, action and request ids", () => {
  const message = formatGenerationError({
    id: "run-c6556e01-34a4-4277-a383-e5beafcccf13",
    nodeId: "node-ac1357a8-91a7-4049-a3b8-35b2e26a7874",
    provider: "ark",
    request: { model: "doubao-seedance-2-0-mini-260615" },
    result: {
      message: "The request failed because the input image 'content[1]' may contain real person. Request id: 021784440508203ffa368fe9ac51d90198cd5026e9cf3e3d8ceb5"
    }
  }, { title: "视频" });

  assert.match(message, /Provider：Ark/);
  assert.match(message, /模型：doubao-seedance-2-0-mini-260615/);
  assert.match(message, /参考图被供应商检测为可能含真人/);
  assert.match(message, /Ark 已认证的人像\/虚拟人资产/);
  assert.match(message, /Request ID：021784440508203ffa368fe9ac51d90198cd5026e9cf3e3d8ceb5/);
  assert.match(message, /本地任务：run-c6556e01-34a4-4277-a383-e5beafcccf13/);
});

test("unknown provider errors preserve their full reason", () => {
  const message = formatGenerationError({
    id: "run-example",
    provider: "openrouter",
    request: { model: "x-ai/grok-imagine-video" },
    result: { message: "HTTP 503: upstream unavailable" }
  });

  assert.match(message, /Provider：OpenRouter/);
  assert.match(message, /原因：HTTP 503: upstream unavailable/);
});

test("OpenRouter prompt length failures are translated into an actionable Chinese message", () => {
  const message = formatGenerationError({
    id: "run-too-long",
    provider: "openrouter",
    request: { model: "x-ai/grok-imagine-video" },
    result: { message: "HTTP 400: {\"code\":\"invalid-argument\",\"error\":\"Prompt length exceeds the maximum allowed length of 4096\"}" }
  });

  assert.match(message, /UTF-8 长度超过 4096 bytes/);
  assert.match(message, /发送前显示实际 bytes/);
});

test("asynchronous Grok moderation failures use the provider poll error", () => {
  const message = formatGenerationError({
    id: "run-moderated",
    nodeId: "node-video",
    provider: "openrouter",
    request: { model: "x-ai/grok-imagine-video" },
    result: {
      status: "failed",
      pollResponse: {
        status: "failed",
        error: "HTTP 400: {\"code\":\"imagine:content-moderated\",\"error\":\"Generated video rejected by content moderation.\"}"
      }
    }
  }, { title: "视频" });

  assert.match(message, /Provider：OpenRouter/);
  assert.match(message, /模型：x-ai\/grok-imagine-video/);
  assert.match(message, /生成结果被内容审核拒绝/);
  assert.match(message, /年龄、裸露、床上情境或性暗示/);
  assert.match(message, /本地任务：run-moderated/);
});
