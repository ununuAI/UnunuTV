import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createLocalRuntime } from "@ununu/unutv-local-runtime";
import { createUnuTvServer } from "@ununu/unutv-api";

test("local secrets are redacted, permissioned, and used without restart", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "ununu-unutv-secrets-"));
  let authorization;
  const fetchImpl = async (_url, options = {}) => {
    authorization = options.headers["x-api-key"];
    return Response.json({ code: 0, audio: Buffer.from("generated-audio").toString("base64") });
  };
  const runtime = createLocalRuntime({ dataRoot, env: {}, fetchImpl });
  context.after(() => runtime.close());

  const initial = await runtime.app.getProviderSettings();
  assert.equal(initial.providers.arkTts.configured, false);
  const status = await runtime.app.updateProviderSettings({
    ununuApiKey: "ununu-secret-value",
    arkApiKey: "ark-secret-value",
    openrouterApiKey: "openrouter-secret-value",
    openspeechApiKey: "tts-secret-value",
    openspeechSpeakerId: "voice-local"
  });
  assert.equal(status.providers.ark.configured, true);
  assert.equal(status.providers.ununu.configured, true);
  assert.equal(status.providers.openrouter.source, "local-file");
  assert.equal(JSON.stringify(status).includes("secret-value"), false);
  assert.equal(status.providers.openspeech.configured, true);
  assert.deepEqual(runtime.credentials.permissions(), {
    directory: 0o700,
    files: { ununuApiKey: 0o600, arkApiKey: 0o600, openrouterApiKey: 0o600, openspeechApiKey: 0o600, openspeechSpeakerId: 0o600 }
  });

  const { project, canvas } = await runtime.app.createProject();
  const audio = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "audio", payload: { text: "测试本地凭证热更新" } });
  const completed = await runtime.app.runNode({ projectId: project.id, nodeId: audio.id, request: { } });
  assert.equal(completed.status, "succeeded");
  assert.equal(authorization, "tts-secret-value");
  const databaseBytes = await readFile(path.join(dataRoot, "projects", project.id, "project.sqlite"));
  assert.equal(databaseBytes.includes(Buffer.from("tts-secret-value")), false);

  await runtime.app.updateProviderSettings({ openspeechApiKey: null, openspeechSpeakerId: null });
  const blocked = await runtime.app.runNode({ projectId: project.id, nodeId: audio.id, request: { } });
  assert.equal(blocked.status, "blocked");
  runtime.close();
  assert.doesNotThrow(() => runtime.close());
});

test("settings HTTP API never returns plaintext credentials", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "ununu-unutv-settings-api-"));
  const service = createUnuTvServer({ dataRoot });
  context.after(() => service.close());
  const address = await service.listen(0);
  const base = `http://127.0.0.1:${address.port}`;
  const secret = "never-return-this-secret";
  const savedResponse = await fetch(`${base}/api/settings/providers`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ arkApiKey: secret })
  });
  assert.equal(savedResponse.status, 200);
  const savedText = await savedResponse.text();
  assert.equal(savedText.includes(secret), false);
  assert.equal(JSON.parse(savedText).providers.ark.configured, true);
  const readText = await fetch(`${base}/api/settings/providers`).then((response) => response.text());
  assert.equal(readText.includes(secret), false);
  assert.equal(JSON.parse(readText).providers.ark.source, "local-file");
});
