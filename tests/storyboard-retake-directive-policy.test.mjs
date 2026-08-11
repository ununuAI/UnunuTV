import assert from "node:assert/strict";
import test from "node:test";
import {
  buildStoryboardRetakeDirective,
  storyboardRetakePromptFields,
} from "../packages/core/src/storyboard-retake-directive-policy.mjs";

test("structured Owner rejection becomes a persisted retake directive", () => {
  const directive = buildStoryboardRetakeDirective({
    directive: {
      corrections: ["门牌初始状态必须精确显示“________ 公寓”"],
      prohibitions: ["把金属门牌改成木牌或石牌"],
    },
    rejectedMediaId: "media-rejected",
    review: { id: "review-reject", createdAt: "2026-07-28T13:00:00.000Z" },
  });
  assert.deepEqual(directive.corrections, ["门牌初始状态必须精确显示“________ 公寓”"]);
  assert.deepEqual(directive.prohibitions, ["把金属门牌改成木牌或石牌"]);
  assert.equal(directive.rejectedMediaId, "media-rejected");
});

test("retake corrections are compiled as continuity facts and prohibitions", () => {
  const fields = storyboardRetakePromptFields(
    { continuityFocus: "入口到客厅纵深不变", prohibitions: ["新增第九位住客"] },
    {
      retakeDirective: {
        corrections: ["林远只补写“无名”，固定的“公寓”二字必须保留"],
        prohibitions: ["把门牌文字留成只有“无名”"],
      },
    },
  );
  assert.match(fields.continuityFocus, /返工修正：林远只补写“无名”/u);
  assert.deepEqual(fields.prohibitions, ["新增第九位住客", "把门牌文字留成只有“无名”"]);
});
