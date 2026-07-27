import fs from "node:fs";

const inputPath = process.argv[2] ?? "/tmp/p01a-shot-r49-result.json";
const current = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const shot = structuredClone(current.shot ?? current);
const plan = structuredClone(shot.cameraTrajectoryPlan);

plan.startState.focusDistanceMeters = 9.92;
plan.endState.focusDistanceMeters = 0.25;
plan.focusDistancePlan = [
  { atSeconds: 0, focusDistanceMeters: 9.92, target: "入口纵深与前排桌席", interpolation: "ease_out" },
  { atSeconds: 1, focusDistanceMeters: 9.33, target: "最近无遮挡尸傀后脑", interpolation: "ease_in_out" },
  { atSeconds: 2.4, focusDistanceMeters: 8.56, target: "最近无遮挡尸傀后脑唯一完整脸", interpolation: "hold" },
  { atSeconds: 3.3, focusDistanceMeters: 8.56, target: "最近无遮挡尸傀后脑唯一完整脸", interpolation: "ease_in" },
  { atSeconds: 3.7, focusDistanceMeters: 3, target: "白璃右肩背", interpolation: "ease_out" },
  { atSeconds: 4, focusDistanceMeters: 0.25, target: "贴镜月白斗篷H1", interpolation: "hold" }
];
plan.pathDescription = "0–1秒沿入口—后出口轴线低速跟入并到yaw -2.05°、pitch -4.00°，焦距面9.92米到9.33米；1–2.4秒缓推到Director实测中点(10,1.65,-1)、yaw -5.38°、pitch -4.35°，焦距面到8.56米并把最近无遮挡后脑唯一脸带到可审片尺度；2.4–3.3秒机位、朝向、65°视场和8.56米焦距面严格保持；3.3–4秒机位与朝向继续硬停，焦距面按8.56米→3.00米→0.25米依次回拉到白璃右肩背与贴镜斗篷H1。全程无内部切镜、无环绕、无越轴、无末段冲刺。";
plan.speedCurve = "0–1秒ease-out跟入；1–2.4秒低速ease-in-out并降至零；2.4–4秒摄影机平移、偏航、俯仰和滚转速度均为零；2.4–3.3秒焦距面8.56米保持，3.3–3.7秒ease-in回拉到3.00米，3.7–4秒ease-out回拉到0.25米贴镜斗篷。";
plan.lookAt = "0–1秒保持三主角与四桌八座纵深；1–3.3秒锁定最近无遮挡的后脑唯一皮肤脸、单头轮廓、身体朝桌和桌席接触，不声称看见画外头部正前方；3.3–3.7秒焦点回拉到白璃右肩背；3.7–4秒继续回拉到贴镜月白斗篷H1。";
plan.lensFocus = "65度视场角不变，不做数字变焦；焦距面必须按0秒9.92米、1秒9.33米、2.4秒8.56米、3.3秒8.56米、3.7秒3.00米、4秒0.25米连续插值。2.4–3.3秒后脑唯一脸锁焦0.9秒，随后只回拉到白璃右肩背与贴镜斗篷，曝光与血月红基线不跳变。";

process.stdout.write(JSON.stringify({ cameraTrajectoryPlan: plan }));
