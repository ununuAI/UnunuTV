import assert from "node:assert/strict";
import test from "node:test";
import { deriveDeterministicPrevisBlocking } from "../packages/core/src/cinematic-previs-blocking-policy.mjs";

const characters = ["许岚", "夏梨", "苏禾", "叶真", "沈一川", "林远", "何小满", "陆星野"].map((name) => ({ name }));

test("prose blocking becomes named actor routes around the declared scene relation", () => {
  const blocking = deriveDeterministicPrevisBlocking({
    characters,
    shot: {
      blocking: {
        actors: ["陆星野前移半步后停住", "其他七人保持各自物品接触"],
        positions: "木箱在北门门槛中央；陆星野位于箱体南侧托举；其余七人分布门外雨棚、前厅东西墙与楼梯口。",
        paths: "只有陆星野完成0.5米前移，其他人无位移",
      },
    },
  });
  assert.equal(blocking.actors.length, 8);
  assert.deepEqual(new Set(blocking.actors.map((actor) => actor.name)), new Set(characters.map((entry) => entry.name)));
  assert.ok(blocking.actors.every((actor) => actor.start.x > 0 && actor.start.z > 0));
  assert.notDeepEqual(
    blocking.actors.find((actor) => actor.name === "陆星野").start,
    blocking.actors.find((actor) => actor.name === "陆星野").end,
  );
  assert.deepEqual(
    blocking.actors.find((actor) => actor.name === "许岚").start,
    blocking.actors.find((actor) => actor.name === "许岚").end,
  );
  const lead = blocking.actors.find((actor) => actor.name === "陆星野");
  assert.ok(Math.abs(blocking.lookAt.x - (lead.start.x + lead.end.x) / 2) < 0.001);
  assert.ok(Math.abs(blocking.lookAt.z - (lead.start.z + lead.end.z) / 2) < 0.001);
});

test("explicit structured actor coordinates remain authoritative", () => {
  const blocking = deriveDeterministicPrevisBlocking({
    characters,
    shot: {
      blocking: {
        actors: [{ name: "许岚", start: { x: 2, y: 0, z: 3 }, end: { x: 4, y: 0, z: 5 } }],
      },
    },
  });
  assert.deepEqual(blocking.actors[0].start, { x: 2, y: 0, z: 3 });
  assert.deepEqual(blocking.actors[0].end, { x: 4, y: 0, z: 5 });
});

test("其余五人 expands named principals to the full declared ensemble", () => {
  const characters = ["许岚", "夏梨", "苏禾", "叶真", "沈一川", "林远", "何小满", "陆星野"];
  const blocking = deriveDeterministicPrevisBlocking({
    characters,
    shot: {
      blocking: {
        positions: "林远靠箱体，许岚在侧，沈一川在对面，其余五人围成松散弧线",
        actors: ["许岚核对合同", "沈一川提出异议", "林远写字", "其余五人以不同微反应回应"],
        paths: "林远前移半步，其余人保持松散站位"
      }
    }
  });
  assert.equal(blocking.actors.length, 8);
  assert.deepEqual(blocking.actors.map((actor) => actor.name), characters);
});

test("narrative positions never collapse multiple actors onto one topology point", () => {
  const blocking = deriveDeterministicPrevisBlocking({
    characters,
    shot: {
      blocking: {
        positions: "夏梨在东侧持手机，苏禾隔着半步位于湿墙与布料之间",
        actors: ["苏禾克制遮挡", "夏梨先确认对方再停止录制"],
        paths: "两人保持半步距离"
      }
    }
  });
  assert.equal(blocking.actors.length, 2);
  const [left, right] = blocking.actors;
  assert.ok(Math.hypot(left.start.x - right.start.x, left.start.z - right.start.z) >= 0.48);
});
