import test from "node:test";
import assert from "node:assert/strict";
import { H3_PROMPT_COMPILER_VERSION, h3PromptCompilerSystemPrompt } from "../packages/core/src/h3-prompt-compiler-policy.mjs";

test("H3 prompt compiler requires the stable section contract and all reference slots", () => {
  const prompt = h3PromptCompilerSystemPrompt({ duration: 15, mode: "image_reference", referenceCount: 2 });
  assert.equal(H3_PROMPT_COMPILER_VERSION, "ununu-h3-context-ir-v1");
  assert.match(prompt, /subject_definitions:/u);
  assert.match(prompt, /non_diegetic_music:/u);
  assert.match(prompt, /<Picture 1>/u);
  assert.match(prompt, /<Picture 2>/u);
  assert.match(prompt, /15 seconds/u);
  assert.match(prompt, /do not invent plot events/u);
});

test("H3 text-to-video compilation forbids phantom picture bindings", () => {
  const prompt = h3PromptCompilerSystemPrompt({ mode: "text_to_video", referenceCount: 0 });
  assert.match(prompt, /There are no image inputs/u);
  assert.match(prompt, /Do not use Picture reference tokens/u);
});
