import test from "node:test";
import assert from "node:assert/strict";
import {
  directorExportLayout,
  directorExportPosition,
  directorExportPreferredSlot
} from "../apps/web/src/director-export-placement-policy.js";

const sourceNode = { id: "director-1", x: 3002, y: 1106, width: 1440, height: 900 };
const stage = {
  cameras: Array.from({ length: 14 }, (_, index) => ({ id: `cam-${String(index + 1).padStart(2, "0")}` }))
};

test("director exports use camera order to form a stable three-column grid", () => {
  assert.equal(directorExportPreferredSlot(stage, "cam-01"), 0);
  assert.equal(directorExportPreferredSlot(stage, "cam-04"), 3);
  assert.deepEqual(directorExportPosition({ nodes: [], sourceNode, stage, cameraId: "cam-01" }), { x: 4522, y: 1106 });
  assert.deepEqual(directorExportPosition({ nodes: [], sourceNode, stage, cameraId: "cam-03" }), {
    x: 4522 + 2 * (directorExportLayout.footprintWidth + directorExportLayout.columnGap),
    y: 1106
  });
  assert.deepEqual(directorExportPosition({ nodes: [], sourceNode, stage, cameraId: "cam-04" }), {
    x: 4522,
    y: 1106 + directorExportLayout.footprintHeight + directorExportLayout.rowGap
  });
});

test("director export placement skips occupied slots using expanded prompt footprint", () => {
  const occupied = {
    id: "image-1",
    kind: "image",
    x: 4522,
    y: 1106,
    width: 559,
    height: 314,
    payload: { createdBy: "director-stage-camera-export" }
  };
  assert.deepEqual(directorExportPosition({ nodes: [occupied], sourceNode, stage, cameraId: "cam-01" }), {
    x: 4522 + directorExportLayout.footprintWidth + directorExportLayout.columnGap,
    y: 1106
  });
});

test("context-wide exports start after the blocking-plate camera grid", () => {
  assert.equal(directorExportPreferredSlot(stage, "cam-01", "context_wide"), 14);
});
