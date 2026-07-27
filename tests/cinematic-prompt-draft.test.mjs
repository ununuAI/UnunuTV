import assert from "node:assert/strict";
import test from "node:test";
import { assertCinematicPromptDraft, validateCinematicPromptDraft } from "@ununu/unutv-contracts";

function draft(overrides = {}) {
  return {
    format: "CinematicPromptDraftV1",
    version: "1.0.0",
    draftId: "prompt-draft-unit-r1",
    productionId: "production-1",
    generationUnitId: "unit-1",
    sourceVersions: { generationUnitRevision: 1, shotRevisions: [{ shotId: "shot-1", revision: 1 }] },
    orderedSections: [{ title: "动作", required: true, priority: 100, lines: ["角色从入口走到桌边"] }],
    compiledContentPrompt: "角色从入口走到桌边。",
    referenceBindings: [],
    generationParameters: { provider: "ark", model: "seedance", mode: "text_to_video" },
    negativeConstraints: ["不得偷切"],
    status: "preflight_ready",
    createdAt: "2026-07-23T00:00:00.000Z",
    ...overrides
  };
}

test("Prompt Draft validates as a persisted, ordered production artifact", () => {
  const value = draft();
  assert.equal(validateCinematicPromptDraft(value).ok, true);
  assert.equal(assertCinematicPromptDraft(value), value);
});

test("Prompt Draft rejects missing sections or non-ready state", () => {
  assert.equal(validateCinematicPromptDraft(draft({ orderedSections: [] })).ok, false);
  assert.throws(() => assertCinematicPromptDraft(draft({ status: "unknown" })), (error) => error.code === "invalid_cinematic_prompt_draft");
});
