import assert from "node:assert/strict";
import test from "node:test";
import {
  compileImageGenerationPrompt,
  imageGenerationStarterPrompt,
  resolveImageGenerationTemplateIdForNode
} from "@ununu/unutv-contracts";

test("locked image templates expose a visible starter prompt", () => {
  const prompt = imageGenerationStarterPrompt("actor_identity_board");
  assert.match(prompt, /六视图/);
  assert.match(prompt, /不得换人/);
});

test("locked image templates compile hard constraints exactly once", () => {
  const compiled = compileImageGenerationPrompt("保持参考图人物身份。", "actor_identity_board");
  assert.match(compiled, /保持参考图人物身份/);
  assert.match(compiled, /【固定生成预设：演员身份板（六视图＋整头特写）】/);
  assert.match(compiled, /左侧约占 60%/);
  assert.equal(compileImageGenerationPrompt(compiled, "actor_identity_board"), compiled);
});

test("node template resolution uses the locked image node type", () => {
  assert.equal(resolveImageGenerationTemplateIdForNode({ payload: { imageNodeType: "character_six_view" } }), "character_six_view");
  assert.equal(resolveImageGenerationTemplateIdForNode({ payload: { imageNodeType: "panorama_equirectangular" } }), "scene_panorama_equirectangular");
  assert.equal(resolveImageGenerationTemplateIdForNode({ payload: {} }), "freeform");
});
