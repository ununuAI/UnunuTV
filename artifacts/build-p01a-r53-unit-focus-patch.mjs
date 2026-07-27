import fs from "node:fs";

const inputPath = process.argv[2] ?? "/tmp/p01a-unit-r52-result.json";
const current = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const unit = structuredClone(current.generationUnit ?? current);
const patch = {
  narrativeTask: unit.narrativeTask,
  controlIntent: structuredClone(unit.controlIntent),
  promptCoverage: structuredClone(unit.promptCoverage),
  reviewRequirements: structuredClone(unit.reviewRequirements),
  highRiskNegatives: structuredClone(unit.highRiskNegatives)
};

const focusByTime = new Map([[0, 9.92], [1, 9.33], [2.4, 8.56], [3.3, 8.56], [3.7, 3], [4, 0.25]]);
const cameraTrack = patch.controlIntent.temporalMotionPlan.tracks.find((track) => track.trackId === "track-camera-p01a");
if (!cameraTrack) throw new Error("P01A camera track not found");
for (const state of cameraTrack.states) {
  if (!focusByTime.has(state.atSeconds)) throw new Error(`Unexpected P01A camera boundary: ${state.atSeconds}`);
  state.focusDistanceMeters = focusByTime.get(state.atSeconds);
}
cameraTrack.transitions[0].path = "沿+Z轴直线跟入0.6米并从yaw 0°、pitch -3.76°平滑到yaw -2.05°、pitch -4.00°；焦距面9.92米→9.33米";
cameraTrack.transitions[1].path = "沿+Z轴直线缓推0.8米并平滑到Director中点实测yaw -5.38°、pitch -4.35°；焦距面9.33米→8.56米";
cameraTrack.transitions[2].path = "世界位置、yaw、pitch、roll与FOV严格保持；焦距面8.56米锁定后脑唯一脸";
cameraTrack.transitions[3].path = "世界位置与朝向严格保持；焦距面8.56米→3.00米回拉到白璃右肩背";
cameraTrack.transitions[3].interpolation = "ease_in";
cameraTrack.transitions[4].path = "世界位置和朝向保持；焦距面3.00米→0.25米追随贴镜斗篷形成H1";
cameraTrack.transitions[4].interpolation = "ease_out";

patch.promptCoverage.cameraFramingLensFocus = "65度视场角不变；摄影机从入口门槛外沿入口—中央轴低速推进，2.4秒到Director中点(10,1.65,-1)、yaw -5.38°、pitch -4.35°并硬停，2.4–4秒机位和朝向不再变化。焦距面严格按0秒9.92米、1秒9.33米、2.4秒8.56米、3.3秒8.56米、3.7秒3.00米、4秒0.25米推进：先锁后脑唯一脸0.9秒，再回拉到白璃右肩背和贴镜斗篷H1。不环绕、不越轴、不突然变焦、不末段冲刺。";
patch.promptCoverage.timingSpeed = "严格使用0/1/2.4/3.3/3.7/4秒边界：0–1秒ease-out；1–2.4秒低速缓推并减至零；2.4–4秒摄影机及三位主角世界位置和整体朝向速度为零；焦距面在2.4–3.3秒保持8.56米，3.3–3.7秒回拉到3.00米，3.7–4秒回拉到0.25米；3.7–4秒只有斗篷持续遮幅。";
patch.promptCoverage.cameraTrajectory = "摄影机从(10,1.7,-2.4)、yaw 0°、pitch -3.76°沿+Z跟入，1秒到(10,1.68,-1.8)、yaw -2.05°、pitch -4.00°，2.4秒到(10,1.65,-1)、yaw -5.38°、pitch -4.35°；2.4–4秒位置与朝向严格保持。焦距面按9.92→9.33→8.56→8.56→3.00→0.25米与0/1/2.4/3.3/3.7/4秒逐点同步。Director控制图为editor_only度量辅助，绝不进入Provider图片集合。";
patch.promptCoverage.endStateHandoff = "3.7秒前，本背视机位可见的后脑唯一完整皮肤脸、单头闭合皮肤、身体朝桌和四桌八座已在8.56米焦距面稳定证明0.9秒；头部正前方无脸仍为Authority画外不变量，若意外入画必须通过像素硬审。4秒焦距面到0.25米，H1由白璃月白斗篷真实全画幅贴镜覆盖，方向、速度、纹理、曝光、环境底噪和布料声均可供P01B无缝续接。";
patch.controlIntent.dynamicControl.cameraTrajectory = "摄影机从(10,1.7,-2.4)、yaw 0°、pitch -3.76°沿+Z跟入，1秒到(10,1.68,-1.8)、yaw -2.05°、pitch -4.00°，2.4秒到Director中点(10,1.65,-1)、yaw -5.38°、pitch -4.35°；2.4–4秒位置、yaw、pitch、roll与65° FOV严格保持。焦距面依次为0秒9.92米、1秒9.33米、2.4秒8.56米、3.3秒8.56米、3.7秒3.00米、4秒0.25米，先锁定后脑唯一脸，再回拉到白璃右肩背与贴镜斗篷。不环绕、不越轴、不内部切镜、不末段冲刺。";
patch.controlIntent.dynamicControl.endState = "H1为白璃月白斗篷在0.25米焦距面真实全画幅贴镜遮挡；遮挡前，背视机位可见的后脑唯一脸、单头闭合皮肤、身体朝桌与桌席接触已在8.56米焦距面静止保持0.9秒。头部正前方无脸是Authority画外不变量，只有意外入画时才做像素硬审；三主角、八酒客、四桌八座和入口轴状态明确。";

if (process.argv.includes("--summary")) {
  console.log(JSON.stringify({ cameraStates: cameraTrack.states, cameraTransitions: cameraTrack.transitions, promptCamera: patch.promptCoverage.cameraFramingLensFocus }, null, 2));
} else {
  process.stdout.write(JSON.stringify(patch));
}
