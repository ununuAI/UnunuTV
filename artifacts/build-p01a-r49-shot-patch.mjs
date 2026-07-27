import fs from "node:fs";

const inputPath = process.argv[2] ?? "/tmp/p01a-shots-current.json";
const document = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const shot = document.shots.find((entry) => entry.shotId === "shot-script-script-row-13d94706-568b-41fa-81ed-74695954da48");
if (!shot) throw new Error("P01A shot not found");
const plan = structuredClone(shot.cameraTrajectoryPlan);

plan.endState = {
  position: { x: 10, y: 1.65, z: -1 },
  yawDegrees: -5.38,
  pitchDegrees: -4.35,
  rollDegrees: 0,
  fovDegrees: 65,
  focusDistanceMeters: 8.5
};
plan.pathDescription = "0–1秒沿入口—后出口轴线低速跟入并到yaw -2.05°、pitch -4.00°；1–2.4秒缓推到Director实测中点机位(10,1.65,-1)、yaw -5.38°、pitch -4.35°并把最近无遮挡后脑脸带到可审片尺度；2.4–4秒机位位置、朝向和65°视场严格保持，2.4–3.3秒完成0.9秒证明，3.3–4秒只拉焦到白璃右肩与斗篷。全程无内部切镜、无环绕、无越轴、无末段冲刺。";
plan.controlGeometryId = "p01a-entry-occipital-reveal-wipe-r10-v1";
plan.cleanCaptures = {
  startCaptureId: "director-capture-15e3ea91-a237-4401-aef8-571e9f709e27",
  midCaptureId: "director-capture-e1f3b432-6b8f-4ebd-9de0-ea48c85649f7",
  endCaptureId: "director-capture-p01a-r10-hold-end-v1"
};

process.stdout.write(JSON.stringify({ cameraTrajectoryPlan: plan }));
