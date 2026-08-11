export const DIRECTOR_COMPOSITION_VERSION = "director_composition_v1";
export const DIRECTOR_COMPOSITION_VIEWS = Object.freeze([
  "top_2_5d",
  "camera_first_person",
  "timeline",
]);
export const DIRECTOR_COMPOSITION_INTERPOLATIONS = Object.freeze([
  "linear",
  "ease",
  "ease_in",
  "ease_out",
  "ease_in_out",
  "step",
  "hold",
]);
export const DIRECTOR_ROUTE_PATH_MODES = Object.freeze([
  "polyline",
  "arc_left",
  "arc_right",
]);
const ZERO_VECTOR = Object.freeze({ x: 0, y: 0, z: 0 });
const DEFAULT_ENVIRONMENT = Object.freeze({
  panoramaUrl: "",
  skyColor: "#111827",
  groundVisible: true,
  groundOpacity: 1,
  groundHeight: 0,
  panoramaRotationY: 0,
  panoramaRadius: 50,
  sceneScale: 1,
  sceneTranslation: ZERO_VECTOR,
  sceneRotation: ZERO_VECTOR,
  gaussianSplatUrl: "",
  gaussianSplatName: "",
  gaussianSplatSphericalHarmonicsDegree: 0,
  gaussianSplatPosition: ZERO_VECTOR,
  gaussianSplatRotation: ZERO_VECTOR,
  gaussianSplatScale: Object.freeze({ x: 1, y: 1, z: 1 }),
  gaussianGroundSnapEnabled: false,
});
function record(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function positive(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
function text(value) {
  return typeof value === "string" ? value.trim() : "";
}
function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}
function vector(value, fallback = ZERO_VECTOR) {
  const source = record(value) ? value : fallback;
  return {
    x: finite(source.x, fallback.x),
    y: finite(source.y, fallback.y),
    z: finite(source.z, fallback.z),
  };
}
function issue(path, message, code = "invalid_field") {
  return { code, message, path };
}
function keyframeTimeMs(keyframe) {
  if (Number.isFinite(Number(keyframe?.atMs))) return Math.max(0, Number(keyframe.atMs));
  if (Number.isFinite(Number(keyframe?.time))) return Math.max(0, Number(keyframe.time));
  return 0;
}

function normalizeKeyframe(keyframe, fallbackTimeMs = 0) {
  const source = record(keyframe) ? keyframe : {};
  return {
    ...clone(source),
    atMs: Number.isFinite(Number(source.atMs ?? source.time))
      ? keyframeTimeMs(source)
      : Math.max(0, fallbackTimeMs),
  };
}

function normalizeTrack(track, fallbackId) {
  const source = record(track) ? track : {};
  const keyframes = (Array.isArray(source.keyframes) ? source.keyframes : [])
    .map((keyframe, index) => normalizeKeyframe(keyframe, index * 1000))
    .sort((left, right) => keyframeTimeMs(left) - keyframeTimeMs(right));
  const interpolation = DIRECTOR_COMPOSITION_INTERPOLATIONS.includes(source.interpolation)
    ? source.interpolation
    : "linear";
  return {
    ...clone(source),
    id: text(source.id) || fallbackId,
    ...(text(source.name) ? { name: text(source.name) } : {}),
    ...(text(source.targetId) ? { targetId: text(source.targetId) } : {}),
    interpolation,
    keyframes,
  };
}

function routeDurationMs(route, durationMs) {
  const maximum = Math.max(
    0,
    ...(Array.isArray(route?.points) ? route.points : []).map((point) => keyframeTimeMs(point)),
  );
  return maximum > 0 ? maximum : durationMs;
}

function routePointKeyframes(route, durationMs) {
  const points = Array.isArray(route?.points) ? route.points : [];
  const endMs = routeDurationMs(route, durationMs);
  return points.map((point, index) => ({
    position: vector(point),
    atMs: Number.isFinite(Number(point?.atMs))
      ? Math.max(0, Number(point.atMs))
      : points.length <= 1
        ? 0
        : (endMs * index) / (points.length - 1),
  }));
}

function deriveRouteTracks(routes, cameras, durationMs) {
  const motionPaths = [];
  const cameraTracks = [];
  const cameraByRouteId = new Map();
  for (const camera of cameras) {
    for (const routeId of Array.isArray(camera?.routeIds) ? camera.routeIds : []) {
      if (!cameraByRouteId.has(routeId)) cameraByRouteId.set(routeId, camera);
    }
  }
  for (const route of routes) {
    const keyframes = routePointKeyframes(route, durationMs);
    if (!keyframes.length) continue;
    const routeMetadata = {
      id: text(route.id) || `route-${motionPaths.length + cameraTracks.length + 1}`,
      name: text(route.label) || text(route.id) || "路线",
      targetId: text(route.objectId) || text(cameraByRouteId.get(route.id)?.id),
      interpolation: DIRECTOR_COMPOSITION_INTERPOLATIONS.includes(route.speedCurve)
        ? route.speedCurve
        : "linear",
      pathMode: DIRECTOR_ROUTE_PATH_MODES.includes(route.pathMode)
        ? route.pathMode
        : "polyline",
      subjectFollowObjectId: text(route.subjectFollowObjectId),
      startMs: Number.isFinite(Number(route.startMs))
        ? Math.max(0, Number(route.startMs))
        : keyframeTimeMs(keyframes[0]),
      endMs: Number.isFinite(Number(route.endMs))
        ? Math.max(0, Number(route.endMs))
        : keyframeTimeMs(keyframes.at(-1)),
      shotIds: Array.isArray(cameraByRouteId.get(route.id)?.shotIds)
        ? [...cameraByRouteId.get(route.id).shotIds]
        : [],
      keyframes,
    };
    if (route.type === "camera") {
      const camera = cameraByRouteId.get(route.id);
      cameraTracks.push({
        ...routeMetadata,
        targetId: text(routeMetadata.targetId) || text(camera?.id),
        keyframes: keyframes.map((keyframe) => ({
          ...keyframe,
          ...(camera?.target ? { lookAt: vector(camera.target) } : {}),
          ...(Number.isFinite(Number(camera?.fov)) ? { fov: Number(camera.fov) } : {}),
          ...(Number.isFinite(Number(camera?.zoom)) ? { zoom: Number(camera.zoom) } : {}),
        })),
      });
    } else {
      motionPaths.push(routeMetadata);
    }
  }
  return { cameraTracks, motionPaths };
}

function normalizeEnvironment(value) {
  const source = record(value) ? value : {};
  return {
    ...clone(DEFAULT_ENVIRONMENT),
    ...clone(source),
    sceneTranslation: vector(source.sceneTranslation, DEFAULT_ENVIRONMENT.sceneTranslation),
    sceneRotation: vector(source.sceneRotation, DEFAULT_ENVIRONMENT.sceneRotation),
    gaussianSplatPosition: vector(source.gaussianSplatPosition, DEFAULT_ENVIRONMENT.gaussianSplatPosition),
    gaussianSplatRotation: vector(source.gaussianSplatRotation, DEFAULT_ENVIRONMENT.gaussianSplatRotation),
    gaussianSplatScale: vector(source.gaussianSplatScale, DEFAULT_ENVIRONMENT.gaussianSplatScale),
  };
}

function trackIntegrityIssues(track, path) {
  const issues = [];
  if (!Array.isArray(track.keyframes) || track.keyframes.length < 2) {
    issues.push(issue(`${path}.keyframes`, "可播放轨道至少需要两个真实关键帧。", "director_track_keyframes_required"));
    return issues;
  }
  for (let index = 1; index < track.keyframes.length; index += 1) {
    if (keyframeTimeMs(track.keyframes[index]) < keyframeTimeMs(track.keyframes[index - 1])) {
      issues.push(issue(`${path}.keyframes[${index}].atMs`, "轨道关键帧时间必须单调递增。", "director_track_time_non_monotonic"));
    }
  }
  return issues;
}

function cameraCoverageIssues(tracks, durationMs) {
  const issues = [];
  const ranges = tracks
    .map((track) => ({
      end: Number.isFinite(Number(track.endMs)) ? Number(track.endMs) : keyframeTimeMs(track.keyframes?.at(-1)),
      start: Number.isFinite(Number(track.startMs)) ? Number(track.startMs) : keyframeTimeMs(track.keyframes?.[0]),
    }))
    .filter((range) => Number.isFinite(range.start) && Number.isFinite(range.end) && range.end >= range.start)
    .sort((left, right) => left.start - right.start);
  if (!ranges.length) return [issue("animation.cameraTracks", "缺少可审计的摄影机时间范围。", "director_camera_coverage_required")];
  let cursor = 0;
  for (const [index, range] of ranges.entries()) {
    if (range.start > cursor + 0.5) issues.push(issue(`animation.cameraTracks[${index}]`, `摄影机播放在 ${cursor}ms→${range.start}ms 存在跳段。`, "director_camera_coverage_gap"));
    cursor = Math.max(cursor, range.end);
  }
  if (cursor + 0.5 < durationMs) issues.push(issue("animation.cameraTracks", `摄影机播放只覆盖到 ${cursor}ms，未到 ${durationMs}ms。`, "director_camera_coverage_incomplete"));
  return issues;
}

export function normalizeDirectorCompositionV1(value, stage = {}) {
  const source = record(value) ? value : {};
  const objects = Array.isArray(stage.objects) ? stage.objects : [];
  const routes = Array.isArray(stage.routes) ? stage.routes : [];
  const stageCameras = Array.isArray(stage.cameras) ? stage.cameras : [];
  const sourceAnimation = record(source.animation) ? source.animation : {};
  const durationSeconds = positive(
    sourceAnimation.duration ?? source.playback?.durationSeconds,
    1,
  );
  const durationMs = durationSeconds * 1000;
  const derived = deriveRouteTracks(routes, stageCameras, durationMs);
  const characters = Array.isArray(source.characters)
    ? clone(source.characters)
    : clone(objects.filter((object) => object?.type === "character"));
  const props = Array.isArray(source.props)
    ? clone(source.props)
    : clone(objects.filter((object) => object?.type === "prop"));
  const cameras = Array.isArray(source.cameras) && source.cameras.length
    ? clone(source.cameras)
    : clone(stageCameras);
  const normalizeTracks = (valueTracks, fallbackTracks, prefix, preferFallback = false) => (
    (preferFallback && fallbackTracks.length
      ? [
          ...fallbackTracks,
          ...(Array.isArray(valueTracks) ? valueTracks : []).filter(
            (track) => !fallbackTracks.some((fallback) => fallback.id === track?.id),
          ),
        ]
      : Array.isArray(valueTracks) && valueTracks.length
        ? valueTracks
        : fallbackTracks)
      .map((track, index) => normalizeTrack(track, `${prefix}-${index + 1}`))
  );
  const animation = {
    version: 1,
    duration: durationSeconds,
    motionPaths: normalizeTracks(sourceAnimation.motionPaths, derived.motionPaths, "motion", true),
    characterTracks: normalizeTracks(sourceAnimation.characterTracks, [], "character"),
    propTracks: normalizeTracks(sourceAnimation.propTracks, [], "prop"),
    cameraTracks: normalizeTracks(sourceAnimation.cameraTracks, derived.cameraTracks, "camera", true),
    groupTracks: normalizeTracks(sourceAnimation.groupTracks, [], "group"),
    activeCameraTrackId: text(sourceAnimation.activeCameraTrackId)
      || text(derived.cameraTracks[0]?.id)
      || "",
  };
  const readinessIssues = [];
  if (!animation.cameraTracks.length) {
    readinessIssues.push(issue("animation.cameraTracks", "缺少绑定摄影机的真实路径，不能宣称可播放。", "director_camera_track_required"));
  }
  for (const [index, track] of animation.cameraTracks.entries()) {
    readinessIssues.push(...trackIntegrityIssues(track, `animation.cameraTracks[${index}]`));
    if (!text(track.targetId)) readinessIssues.push(issue(`animation.cameraTracks[${index}].targetId`, "摄影机轨道必须绑定真实 camera id。", "director_camera_binding_required"));
  }
  if (animation.cameraTracks.length) readinessIssues.push(...cameraCoverageIssues(animation.cameraTracks, durationMs));
  for (const [index, track] of [...animation.characterTracks, ...animation.propTracks, ...animation.motionPaths].entries()) {
    if (!text(track.targetId)) readinessIssues.push(issue(`animation.motionTracks[${index}].targetId`, "对象运动轨道必须绑定真实 object id。", "director_object_binding_required"));
  }
  const normalized = {
    ...clone(source),
    version: DIRECTOR_COMPOSITION_VERSION,
    views: Array.isArray(source.views) && source.views.length
      ? [...new Set(source.views.filter((entry) => DIRECTOR_COMPOSITION_VIEWS.includes(entry)))]
      : [...DIRECTOR_COMPOSITION_VIEWS],
    playback: {
      frameRate: positive(source.playback?.frameRate, 24),
      durationSeconds,
      interpolation: DIRECTOR_COMPOSITION_INTERPOLATIONS.includes(source.playback?.interpolation)
        ? source.playback.interpolation
        : "linear",
    },
    axis: text(source.axis) || "X-right_Y-up_Z-depth",
    characters,
    characterGroups: Array.isArray(source.characterGroups) ? clone(source.characterGroups) : [],
    cameras,
    props,
    animation,
    environment: normalizeEnvironment(source.environment),
    readiness: {
      playable: readinessIssues.length === 0,
      issues: readinessIssues,
    },
  };
  if (source.version !== DIRECTOR_COMPOSITION_VERSION) {
    normalized.migration = {
      fromVersion: text(source.version) || "legacy_unversioned",
      normalizedAtRuntime: true,
    };
  }
  return normalized;
}

export function validateDirectorCompositionV1(value, stage = {}) {
  const issues = [];
  if (!record(value)) return { issues: [issue("compositionData", "compositionData must be an object", "invalid_type")], ok: false };
  if (value.version !== DIRECTOR_COMPOSITION_VERSION) issues.push(issue("compositionData.version", `compositionData.version must be ${DIRECTOR_COMPOSITION_VERSION}`, "invalid_version"));
  if (!record(value.animation)) issues.push(issue("compositionData.animation", "compositionData.animation must be an object", "invalid_type"));
  if (!record(value.playback)) issues.push(issue("compositionData.playback", "compositionData.playback must be an object", "invalid_type"));
  const normalized = normalizeDirectorCompositionV1(value, stage);
  if (!normalized.views.includes("top_2_5d") || !normalized.views.includes("camera_first_person")) {
    issues.push(issue("compositionData.views", "compositionData must expose top_2_5d and camera_first_person views", "director_views_required"));
  }
  if (!Number.isFinite(normalized.playback.frameRate) || normalized.playback.frameRate <= 0) issues.push(issue("compositionData.playback.frameRate", "frameRate must be positive", "invalid_number"));
  if (!Number.isFinite(normalized.playback.durationSeconds) || normalized.playback.durationSeconds <= 0) issues.push(issue("compositionData.playback.durationSeconds", "durationSeconds must be positive", "invalid_number"));
  return { issues, ok: issues.length === 0, readiness: normalized.readiness };
}

function easing(interpolation, progress) {
  const t = Math.max(0, Math.min(1, progress));
  if (interpolation === "step" || interpolation === "hold") return 0;
  if (interpolation === "ease_in") return t * t;
  if (interpolation === "ease_out") return 1 - (1 - t) * (1 - t);
  if (interpolation === "ease" || interpolation === "ease_in_out") {
    return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
  }
  return t;
}

function interpolateValue(left, right, progress) {
  if (typeof left === "number" && typeof right === "number" && Number.isFinite(left) && Number.isFinite(right)) {
    return left + (right - left) * progress;
  }
  if (record(left) && record(right)) {
    const output = {};
    for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
      output[key] = interpolateValue(left[key], right[key], progress);
    }
    return output;
  }
  return progress < 1 ? clone(left) : clone(right);
}

export function evaluateDirectorTrackAtTime(track, timeMs) {
  const keyframes = (Array.isArray(track?.keyframes) ? track.keyframes : [])
    .map((entry) => normalizeKeyframe(entry))
    .sort((left, right) => keyframeTimeMs(left) - keyframeTimeMs(right));
  if (!keyframes.length) return null;
  const clamped = Math.max(0, finite(timeMs));
  if (clamped <= keyframeTimeMs(keyframes[0])) return clone(keyframes[0]);
  if (clamped >= keyframeTimeMs(keyframes.at(-1))) return clone(keyframes.at(-1));
  const rightIndex = keyframes.findIndex((keyframe) => keyframeTimeMs(keyframe) >= clamped);
  const right = keyframes[rightIndex];
  const left = keyframes[Math.max(0, rightIndex - 1)];
  const start = keyframeTimeMs(left);
  const end = keyframeTimeMs(right);
  const progress = easing(track?.interpolation, end <= start ? 1 : (clamped - start) / (end - start));
  return {
    ...interpolateValue(left, right, progress),
    atMs: clamped,
  };
}

function followTarget(objects, objectId) {
  return objects.find((object) => object?.id === objectId)?.position ?? null;
}

export function evaluateDirectorCompositionAtTime(value, timeMs, stage = {}) {
  const composition = normalizeDirectorCompositionV1(value, stage);
  const durationMs = composition.playback.durationSeconds * 1000;
  const clampedTimeMs = Math.max(0, Math.min(durationMs, finite(timeMs)));
  const objectStates = new Map();
  const cameraStates = new Map();
  const objectTracks = [
    ...composition.animation.motionPaths,
    ...composition.animation.characterTracks,
    ...composition.animation.propTracks,
    ...composition.animation.groupTracks,
  ];
  for (const track of objectTracks) {
    const start = Number.isFinite(Number(track.startMs)) ? Number(track.startMs) : keyframeTimeMs(track.keyframes?.[0]);
    const end = Number.isFinite(Number(track.endMs)) ? Number(track.endMs) : keyframeTimeMs(track.keyframes?.at(-1));
    if (clampedTimeMs < start - 0.5 || clampedTimeMs > end + 0.5) continue;
    const targetId = text(track.targetId);
    const keyframe = evaluateDirectorTrackAtTime(track, clampedTimeMs);
    if (targetId && keyframe) objectStates.set(targetId, keyframe);
  }
  const evaluatedObjects = (Array.isArray(stage.objects) ? stage.objects : []).map((object) => {
    const state = objectStates.get(object.id);
    if (!state) return clone(object);
    return {
      ...clone(object),
      ...(record(state.position) ? { position: vector(state.position, object.position) } : {}),
      ...(record(state.rotation) ? { rotation: vector(state.rotation, object.rotation) } : {}),
      ...(record(state.jointAngles) ? { jointAngles: clone(state.jointAngles) } : {}),
      ...(typeof state.visible === "boolean" ? { visible: state.visible } : {}),
    };
  });
  for (const track of composition.animation.cameraTracks) {
    const targetId = text(track.targetId);
    const keyframe = evaluateDirectorTrackAtTime(track, clampedTimeMs);
    if (targetId && keyframe) cameraStates.set(targetId, { ...keyframe, track });
  }
  const activeCameraTrack = composition.animation.cameraTracks.find((track) => {
    const start = Number.isFinite(Number(track.startMs)) ? Number(track.startMs) : keyframeTimeMs(track.keyframes?.[0]);
    const end = Number.isFinite(Number(track.endMs)) ? Number(track.endMs) : keyframeTimeMs(track.keyframes?.at(-1));
    return clampedTimeMs >= start - 0.5 && clampedTimeMs <= end + 0.5;
  }) ?? composition.animation.cameraTracks.find((track) => track.id === composition.animation.activeCameraTrackId)
    ?? composition.animation.cameraTracks[0];
  const activeCameraId = text(activeCameraTrack?.targetId)
    || text(stage.selectedCameraId)
    || text(stage.cameras?.[0]?.id);
  const evaluatedCameras = (Array.isArray(stage.cameras) ? stage.cameras : []).map((camera) => {
    const state = cameraStates.get(camera.id);
    if (!state) return clone(camera);
    const subjectId = text(state.track?.subjectFollowObjectId);
    const subjectPosition = subjectId ? followTarget(evaluatedObjects, subjectId) : null;
    return {
      ...clone(camera),
      ...(record(state.position) ? { position: vector(state.position, camera.position) } : {}),
      target: subjectPosition
        ? vector(subjectPosition)
        : record(state.lookAt)
          ? vector(state.lookAt, camera.target)
          : clone(camera.target),
      ...(record(state.lookAt) || subjectPosition ? { lookAt: subjectPosition ? vector(subjectPosition) : vector(state.lookAt, camera.target) } : {}),
      ...(Number.isFinite(Number(state.fov)) ? { fov: Number(state.fov) } : {}),
      ...(Number.isFinite(Number(state.zoom)) ? { zoom: Number(state.zoom) } : {}),
      captureTimeMs: clampedTimeMs,
    };
  });
  return {
    cameras: evaluatedCameras,
    composition,
    objects: evaluatedObjects,
    selectedCameraId: activeCameraId,
    timeMs: clampedTimeMs,
  };
}

export function applyDirectorCompositionAtTime(stage, timeMs) {
  const source = record(stage) ? stage : {};
  const evaluated = evaluateDirectorCompositionAtTime(source.compositionData, timeMs, source);
  return {
    ...clone(source),
    objects: evaluated.objects,
    cameras: evaluated.cameras,
    selectedCameraId: evaluated.selectedCameraId,
    compositionData: evaluated.composition,
    evaluatedAtMs: evaluated.timeMs,
  };
}

export function createDirectorArcRoutePoints({
  direction,
  durationMs,
  end,
  nodeCount = 5,
  start,
  strength = 0.35,
} = {}) {
  const from = vector(start);
  const to = vector(end);
  const count = Math.max(3, Math.min(32, Math.round(positive(nodeCount, 5))));
  const totalMs = positive(durationMs, 1000);
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const distance = Math.hypot(dx, dz);
  const sign = direction === "arc_right" ? -1 : 1;
  const normalX = distance > 0 ? (-dz / distance) * sign : sign;
  const normalZ = distance > 0 ? (dx / distance) * sign : 0;
  const offset = distance * Math.max(0.05, Math.min(2, finite(strength, 0.35)));
  const control = {
    x: (from.x + to.x) / 2 + normalX * offset,
    y: (from.y + to.y) / 2,
    z: (from.z + to.z) / 2 + normalZ * offset,
  };
  return Array.from({ length: count }, (_, index) => {
    const t = index / (count - 1);
    const oneMinus = 1 - t;
    return {
      x: oneMinus * oneMinus * from.x + 2 * oneMinus * t * control.x + t * t * to.x,
      y: oneMinus * oneMinus * from.y + 2 * oneMinus * t * control.y + t * t * to.y,
      z: oneMinus * oneMinus * from.z + 2 * oneMinus * t * control.z + t * t * to.z,
      atMs: totalMs * t,
    };
  });
}
