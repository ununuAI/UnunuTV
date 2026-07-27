import assert from "node:assert/strict";
import test from "node:test";
import {
  directorObjectRequiresFullFrame,
  validateDirectorIntentionalForegroundCropIds
} from "../packages/contracts/src/index.mjs";

test("Director captures permit only explicitly declared foreground crops", () => {
  const camera = { intentionalForegroundCropIds: ["baili", "guchen", "luoqing"] };
  assert.equal(directorObjectRequiresFullFrame(camera, "baili"), false);
  assert.equal(directorObjectRequiresFullFrame(camera, "guest-1"), true);
  assert.equal(validateDirectorIntentionalForegroundCropIds(camera).ok, true);
});

test("invalid foreground-crop declarations fail closed", () => {
  const camera = { intentionalForegroundCropIds: ["baili", "baili", ""] };
  const validation = validateDirectorIntentionalForegroundCropIds(camera);
  assert.equal(validation.ok, false);
  assert.equal(directorObjectRequiresFullFrame(camera, "baili"), true);
  assert.deepEqual(new Set(validation.issues.map((entry) => entry.code)), new Set(["duplicate_id", "required"]));
});
