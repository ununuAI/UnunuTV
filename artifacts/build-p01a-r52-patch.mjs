import fs from "node:fs";

const inputPath = process.argv[2] ?? "/tmp/p01a-unit-r51.json";
const current = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const unit = structuredClone(current.generationUnit ?? current);

function replaceInStrings(value) {
  if (typeof value === "string") {
    return value
      .replaceAll("yaw -5.4°", "yaw -5.38°")
      .replaceAll("pitch -5.58°", "pitch -4.35°")
      .replaceAll("从pitch -3.76°平滑到-4.5°", "从pitch -3.76°平滑到-4.00°")
      .replaceAll("yaw -1°、pitch -4.5°", "yaw -2.05°、pitch -4.00°")
      .replaceAll("到yaw -5.4°、pitch -5.58°", "到yaw -5.38°、pitch -4.35°");
  }
  if (Array.isArray(value)) return value.map(replaceInStrings);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, replaceInStrings(entry)]));
  }
  return value;
}

const patch = replaceInStrings({
  narrativeTask: unit.narrativeTask,
  controlIntent: unit.controlIntent,
  promptCoverage: unit.promptCoverage,
  reviewRequirements: unit.reviewRequirements,
  highRiskNegatives: unit.highRiskNegatives
});
const cameraTrack = patch.controlIntent.temporalMotionPlan.tracks.find((track) => track.trackId === "track-camera-p01a");
for (const state of cameraTrack.states) {
  if (state.atSeconds === 1) state.orientation = { yawDegrees: -2.05, pitchDegrees: -4, rollDegrees: 0 };
  if (state.atSeconds >= 2.4) state.orientation = { yawDegrees: -5.38, pitchDegrees: -4.35, rollDegrees: 0 };
}
for (const transition of cameraTrack.transitions) {
  if (transition.fromStateId === "camera-p01a-s0") transition.path = "沿+Z轴直线跟入0.6米并从yaw 0°、pitch -3.76°平滑到yaw -2.05°、pitch -4.00°";
  if (transition.fromStateId === "camera-p01a-s1") transition.path = "沿+Z轴直线缓推0.8米并平滑到Director中点实测yaw -5.38°、pitch -4.35°";
}

if (process.argv.includes("--summary")) {
  console.log(JSON.stringify({ cameraStates: cameraTrack.states, cameraTransitions: cameraTrack.transitions.slice(0, 2) }, null, 2));
} else {
  process.stdout.write(JSON.stringify(patch));
}
