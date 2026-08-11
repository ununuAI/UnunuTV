import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const productionWorkspaceSource = await readFile(
  new URL("../apps/web/src/CinematicProductionWorkspace.tsx", import.meta.url),
  "utf8",
);
const sequenceWorkspaceSource = await readFile(
  new URL("../apps/web/src/CinematicSequencePrevisWorkspace.tsx", import.meta.url),
  "utf8",
);

test("read-only production mode leaves Sequence Previs observation controls enabled", () => {
  assert.match(
    productionWorkspaceSource,
    /disabled=\{props\.readOnly && stageId !== "previs"\}/,
  );
  assert.match(sequenceWorkspaceSource, /readOnly\?: boolean/);
  assert.match(sequenceWorkspaceSource, /data-playback-evidence=/);
});

test("read-only playback never writes a receipt or enables production mutations", () => {
  assert.match(
    sequenceWorkspaceSource,
    /if \(props\.readOnly\) setPlaybackEvidence\(evidence\);\s*else void props\.actions\.recordSequencePrevisPlayback/,
  );
  assert.match(
    sequenceWorkspaceSource,
    /disabled=\{props\.readOnly \|\| ownerReviewBlocked \|\| playing\}/,
  );
  assert.match(
    sequenceWorkspaceSource,
    /className="cp-previs-compile" disabled=\{props\.readOnly\}/,
  );
  assert.match(sequenceWorkspaceSource, /<fieldset disabled=\{props\.readOnly\}>/);
});
