import assert from "node:assert/strict";
import test from "node:test";
import {
  AUTOMATION_FLOW_WINDOW_INSET,
  defaultAutomationFlowFrame,
  moveAutomationFlowFrame,
  resizeAutomationFlowFrame
} from "../apps/web/src/automation-flow-window-policy.js";

test("automation flow opens as a large canvas-level work window beside the left capsule", () => {
  const frame = defaultAutomationFlowFrame({ width: 1536, height: 900 });
  assert.deepEqual(frame, { x: 221, y: 74, width: 1180, height: 800 });
  assert.ok(frame.x >= AUTOMATION_FLOW_WINDOW_INSET.left);
  assert.ok(frame.width > 900);
  assert.ok(frame.height > 600);
});

test("automation flow and the first cinematic work window share the exact default frame", async () => {
  const { defaultCinematicControlFrame } = await import("../apps/web/src/cinematic-control-window-policy.js");
  for (const viewport of [{ width: 1536, height: 900 }, { width: 1256, height: 1084 }, { width: 1200, height: 760 }]) {
    const automation = defaultAutomationFlowFrame(viewport);
    const cinematic = defaultCinematicControlFrame(viewport);
    assert.deepEqual(automation, cinematic);
  }
});

test("automation flow window remains movable and resizable inside the visible workspace", () => {
  const viewport = { width: 1200, height: 760 };
  const frame = defaultAutomationFlowFrame(viewport);
  assert.deepEqual(moveAutomationFlowFrame({ frame, delta: { x: -1000, y: -1000 }, viewport }), { ...frame, x: 104, y: 66 });
  assert.deepEqual(resizeAutomationFlowFrame({ frame, delta: { x: -1000, y: -1000 }, viewport }), { x: frame.x, y: frame.y, width: 760, height: 520 });
  const expanded = resizeAutomationFlowFrame({ frame, delta: { x: 1000, y: 1000 }, viewport });
  assert.equal(expanded.x + expanded.width, viewport.width - 18);
  assert.equal(expanded.y + expanded.height, viewport.height - 18);
});
