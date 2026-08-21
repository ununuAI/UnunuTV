import assert from "node:assert/strict";
import test from "node:test";
import { storyreelSheetCellRect } from "../apps/web/src/slice-storyreel-sheet.js";

test("sheet cells are cut left-to-right then top-to-bottom", () => {
  assert.deepEqual(storyreelSheetCellRect(200, 200, 0, 2, 2), { sx: 0, sy: 0, sw: 100, sh: 100 });
  assert.deepEqual(storyreelSheetCellRect(200, 200, 1, 2, 2), { sx: 100, sy: 0, sw: 100, sh: 100 });
  assert.deepEqual(storyreelSheetCellRect(200, 200, 2, 2, 2), { sx: 0, sy: 100, sw: 100, sh: 100 });
  assert.deepEqual(storyreelSheetCellRect(200, 200, 3, 2, 2), { sx: 100, sy: 100, sw: 100, sh: 100 });
});
