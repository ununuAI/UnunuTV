import { validateCameraTrajectoryPlan } from "@ununu/unutv-contracts";

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function vector(value, fallback = { x: 0, y: 1.55, z: 0 }) {
  return {
    x: finite(value?.x, fallback.x),
    y: finite(value?.y, fallback.y),
    z: finite(value?.z, fallback.z)
  };
}

function distance(from, to) {
  return Math.max(0.01, Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z));
}

function cameraAngles(position, target) {
  const dx = target.x - position.x;
  const dy = target.y - position.y;
  const dz = target.z - position.z;
  const horizontal = Math.max(0.0001, Math.hypot(dx, dz));
  return {
    yawDegrees: Math.atan2(dx, dz) * (180 / Math.PI),
    pitchDegrees: Math.max(-89, Math.min(89, Math.atan2(dy, horizontal) * (180 / Math.PI)))
  };
}

function movementContract(text, pointCount) {
  const value = String(text || "按导演台既有路线连续移动");
  const compound = pointCount > 2 || /[；;]|先.+(?:再|后|最后)|转|切|停.+(?:后|再)|多节点/u.test(value);
  if (compound) return { movementType: "compound", guideType: "compound_guides" };
  if (/手持|震动|呼吸/u.test(value)) return { movementType: "handheld", guideType: "motion_envelope" };
  if (/弧线|弧移/u.test(value)) return { movementType: "arc", guideType: "path_curve" };
  if (/升|降|抬机|俯视|摇臂/u.test(value)) return { movementType: "crane", guideType: "path_curve" };
  if (/横移|平移|侧移/u.test(value)) return { movementType: "truck", guideType: "path_curve" };
  if (/摇镜|下摇|上摇|俯仰/u.test(value)) return { movementType: "pan_tilt", guideType: "orientation_arc" };
  if (/变焦|zoom/iu.test(value)) return { movementType: "zoom", guideType: "lens_curve" };
  return { movementType: "dolly", guideType: "path_curve" };
}

function routeDescription(points) {
  return points
    .map((point, index) => `节点${index + 1}(${point.x.toFixed(2)},${point.y.toFixed(2)},${point.z.toFixed(2)})@${(point.atMs / 1000).toFixed(2)}秒`)
    .join(" → ");
}

export function cameraTrajectoryNeedsProjection(shot) {
  const movement = String(shot?.cinematography?.movementPath || "");
  if (!movement.trim()) return false;
  const validation = shot.cameraTrajectoryPlan ? validateCameraTrajectoryPlan(shot.cameraTrajectoryPlan) : { ok: false };
  return !validation.ok;
}

export function deriveCameraTrajectoryPlan({
  shot,
  camera,
  route,
  cleanCaptures
} = {}) {
  if (!shot || !camera || !route) throw new TypeError("shot, camera and route are required");
  const durationSeconds = Math.max(0.1, finite(shot.durationSeconds, 5));
  const rawPoints = Array.isArray(route.points) && route.points.length
    ? route.points
    : [camera.position, camera.position];
  const routeStartMs = Number.isFinite(Number(route.startMs))
    ? Number(route.startMs)
    : 0;
  const points = rawPoints.map((entry, index) => ({
    ...vector(entry, vector(camera.position)),
    atMs: Number.isFinite(Number(entry?.atMs))
      ? Number(entry.atMs) - routeStartMs
      : Math.round((durationSeconds * 1000 * index) / Math.max(1, rawPoints.length - 1))
  }));
  const startPosition = vector(points[0], vector(camera.position));
  const endPosition = vector(points.at(-1), startPosition);
  const target = vector(camera.target, shot.cinematography?.lookAt || { x: 0, y: 1.4, z: 0 });
  const startAngles = cameraAngles(startPosition, target);
  const endAngles = cameraAngles(endPosition, target);
  const startFocus = distance(startPosition, target);
  const endFocus = distance(endPosition, target);
  const fov = Math.max(1, Math.min(179, finite(camera.fov, finite(shot.cinematography?.fov, 54))));
  const movement = String(shot.cinematography?.movementPath || camera.label || "按导演台既有路线连续移动");
  const type = movementContract(movement, points.length);
  const focusTarget = String(shot.cinematography?.focus || "镜头叙事主体");
  const composition = String(shot.cinematography?.composition || shot.cinematography?.shotSize || "保持已接受起落幅的主体位置、头顶余量和视线方向");
  const axis = String(shot.blocking?.axis || shot.cinematography?.axis || "保持已接受注意轴，不无动机跨轴");
  const blocking = String(shot.blocking?.positions || "主体按已接受导演台路径运动");
  const physics = String(shot.physicsVfx?.rules || shot.physicsVfx?.physics || "遮挡、接触与受力连续");
  const phaseTimes = points.map((point) => Math.max(0, Math.min(durationSeconds, point.atMs / 1000)));
  const uniqueFocusStates = [];
  for (const [index, atSeconds] of phaseTimes.entries()) {
    const position = points[index];
    const focusDistanceMeters = distance(position, target);
    if (uniqueFocusStates.some((entry) => Math.abs(entry.atSeconds - atSeconds) < 0.001)) continue;
    uniqueFocusStates.push({
      atSeconds,
      focusDistanceMeters,
      target: focusTarget,
      interpolation: index === points.length - 1 ? "hold" : "ease_in_out"
    });
  }
  if (uniqueFocusStates.length < 2) {
    uniqueFocusStates.push({
      atSeconds: durationSeconds,
      focusDistanceMeters: endFocus,
      target: focusTarget,
      interpolation: "hold"
    });
  } else {
    uniqueFocusStates[0].atSeconds = 0;
    uniqueFocusStates[0].focusDistanceMeters = startFocus;
    uniqueFocusStates.at(-1).atSeconds = durationSeconds;
    uniqueFocusStates.at(-1).focusDistanceMeters = endFocus;
  }
  const plan = {
    ...type,
    coordinateSpace: "world",
    startState: {
      position: startPosition,
      ...startAngles,
      rollDegrees: 0,
      fovDegrees: fov,
      focusDistanceMeters: startFocus
    },
    endState: {
      position: endPosition,
      ...endAngles,
      rollDegrees: 0,
      fovDegrees: fov,
      focusDistanceMeters: endFocus
    },
    focusDistancePlan: uniqueFocusStates,
    durationSeconds,
    pathDescription: movement,
    directionDefinition: `${routeDescription(points)}；${axis}`,
    speedCurve: `严格按导演台节点时间插值；${movement}；每个明确停机点保持稳定，不漂浮、不额外绕行`,
    lookAt: `光轴按导演台目标点(${target.x.toFixed(2)},${target.y.toFixed(2)},${target.z.toFixed(2)})并服从焦点合同：${focusTarget}`,
    lensFocus: `${shot.cinematography?.focalLength || "既定焦段"}，FOV ${fov.toFixed(1)}°；焦距面从${startFocus.toFixed(2)}米连续过渡到${endFocus.toFixed(2)}米`,
    framingInvariant: composition,
    subjectMotionRelation: blocking,
    occlusionPlan: `${physics}；只允许分镜已写明的动机性遮挡，禁止用全遮挡偷切或改变人物数量`,
    parallaxExpectation: "近景遮挡物位移快于中景人物，中景人物快于固定墙面；方向随既有路线连续，背景不得瞬移、翻面或缩放漂移",
    controlGeometryId: route.id,
    cleanCaptures: {
      startCaptureId: cleanCaptures.startCaptureId,
      midCaptureId: cleanCaptures.midCaptureId,
      endCaptureId: cleanCaptures.endCaptureId
    },
    overlayPolicy: "editor_only"
  };
  const validation = validateCameraTrajectoryPlan(plan);
  if (!validation.ok) {
    const error = new Error(`Projected camera trajectory is invalid: ${validation.issues.map((entry) => `${entry.path} ${entry.message}`).join("; ")}`);
    error.code = "invalid_projected_camera_trajectory";
    error.details = validation.issues;
    throw error;
  }
  return plan;
}
