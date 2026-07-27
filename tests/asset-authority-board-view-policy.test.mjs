import assert from "node:assert/strict";
import test from "node:test";
import { assetAuthorityBoardHistory } from "../apps/web/src/asset-authority-board-view-policy.js";

test("asset board history keeps identity and active action boards independently viewable", () => {
  const node = {
    payload: {
      activeAuthorityBoardId: "fire-talisman-skill",
      assetType: "character",
      currentMediaId: "media-action",
      authorityMediaVersions: [
        { mediaId: "media-identity", boardId: "identity-master", label: "特写＋六视图身份母版", assetVersionId: "version-identity", authorityRevision: 5, reviewState: "accepted" },
        { mediaId: "media-action", boardId: "fire-talisman-skill", label: "火符与五雷技能相位板", assetVersionId: "version-action", authorityRevision: 5, reviewState: "candidate" }
      ]
    }
  };
  assert.deepEqual(assetAuthorityBoardHistory(node, ["media-identity", "media-action"]).map(({ label, isCurrent }) => ({ label, isCurrent })), [
    { label: "身份母版", isCurrent: false },
    { label: "火符 / 五雷", isCurrent: true }
  ]);
});

test("legacy character nodes still expose the first identity master without rewriting media state", () => {
  const node = { payload: { assetType: "character", currentMediaId: "media-action", activeAuthorityBoardId: "sword-sheath-combat" } };
  const history = assetAuthorityBoardHistory(node, ["media-identity", "media-action"]);
  assert.deepEqual(history.map((entry) => entry.label), ["身份母版", "刀鞘近战"]);
  assert.equal(history[0].isCurrent, false);
  assert.equal(history[1].isCurrent, true);
});
