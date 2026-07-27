import {
  DIRECTOR_STAGE_VERSION,
  UnuTvError,
  validateDirectorStageCommandV1,
  validateDirectorStageDocumentV1
} from "@ununu/unutv-contracts";

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function assertValid(validation, code, label) {
  if (!validation.ok) throw new UnuTvError(code, `${label}: ${validation.issues.map((entry) => `${entry.path} ${entry.message}`).join("; ")}`, 400, validation.issues);
}

function replaceById(items, next) {
  const index = items.findIndex((item) => item.id === next.id);
  if (index < 0) return [...items, next];
  return items.map((item, itemIndex) => itemIndex === index ? next : item);
}

function requireById(items, id, entity) {
  const item = items.find((entry) => entry.id === id);
  if (!item) throw new UnuTvError(`director_${entity}_not_found`, `Director ${entity} not found: ${id}`, 404);
  return item;
}

function ensureUnreferencedObject(stage, objectId) {
  const route = stage.routes.find((entry) => entry.objectId === objectId);
  if (route) throw new UnuTvError("director_object_in_use", `Object ${objectId} is referenced by route ${route.id}`, 409);
  const camera = stage.cameras.find((entry) => entry.objectStates?.some((state) => state.objectId === objectId));
  if (camera) throw new UnuTvError("director_object_in_use", `Object ${objectId} is referenced by camera ${camera.id}`, 409);
}

function ensureUncapturedCamera(stage, cameraId) {
  const capture = stage.captures.find((entry) => entry.cameraId === cameraId);
  if (capture) throw new UnuTvError("director_camera_in_use", `Camera ${cameraId} is referenced by capture ${capture.id}`, 409);
}

export function createEmptyDirectorStage({ dimensions, timestamp }) {
  return {
    version: DIRECTOR_STAGE_VERSION,
    revision: 1,
    dimensions: clone(dimensions ?? { width: 20, depth: 20, height: 8, unit: "m" }),
    objects: [],
    routes: [],
    cameras: [],
    selectedCameraId: "",
    captures: [],
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function applyDirectorStageCommand(currentStage, command, timestamp) {
  assertValid(validateDirectorStageCommandV1(command), "invalid_director_command", "Invalid DirectorStageCommandV1");
  if (command.type === "initialize") {
    if (currentStage) throw new UnuTvError("director_stage_exists", "Director stage is already initialized", 409);
    if (command.expectedRevision !== 0) throw new UnuTvError("revision_conflict", `Expected director stage revision ${command.expectedRevision}, found 0`, 409);
    const initialized = createEmptyDirectorStage({ dimensions: command.payload.dimensions, timestamp });
    assertValid(validateDirectorStageDocumentV1(initialized), "invalid_director_stage", "Invalid DirectorStageDocumentV1");
    return initialized;
  }

  if (!currentStage) throw new UnuTvError("director_stage_not_initialized", "Initialize the Director Stage before applying commands", 409);
  assertValid(validateDirectorStageDocumentV1(currentStage), "invalid_director_stage", "Invalid persisted DirectorStageDocumentV1");
  if (command.expectedRevision !== currentStage.revision) {
    throw new UnuTvError("revision_conflict", `Expected director stage revision ${command.expectedRevision}, found ${currentStage.revision}`, 409);
  }

  const next = clone(currentStage);
  const payload = command.payload;
  if (command.type === "set_environment") next.environment = clone(payload.environment);
  if (command.type === "clear_environment") delete next.environment;
  if (command.type === "upsert_object") next.objects = replaceById(next.objects, clone(payload.object));
  if (command.type === "move_object") {
    const object = requireById(next.objects, payload.objectId, "object");
    next.objects = replaceById(next.objects, { ...object, position: clone(payload.position), ...(payload.rotation ? { rotation: clone(payload.rotation) } : {}) });
  }
  if (command.type === "remove_object") {
    requireById(next.objects, payload.objectId, "object");
    ensureUnreferencedObject(next, payload.objectId);
    next.objects = next.objects.filter((entry) => entry.id !== payload.objectId);
  }
  if (command.type === "upsert_route") {
    if (payload.route.objectId) requireById(next.objects, payload.route.objectId, "object");
    next.routes = replaceById(next.routes, clone(payload.route));
  }
  if (command.type === "remove_route") {
    requireById(next.routes, payload.routeId, "route");
    next.routes = next.routes.filter((entry) => entry.id !== payload.routeId);
  }
  if (command.type === "upsert_camera") {
    for (const state of payload.camera.objectStates ?? []) requireById(next.objects, state.objectId, "object");
    for (const routeId of payload.camera.routeIds ?? []) requireById(next.routes, routeId, "route");
    next.cameras = replaceById(next.cameras, clone(payload.camera));
    if (!next.selectedCameraId) next.selectedCameraId = payload.camera.id;
  }
  if (command.type === "remove_camera") {
    requireById(next.cameras, payload.cameraId, "camera");
    ensureUncapturedCamera(next, payload.cameraId);
    next.cameras = next.cameras.filter((entry) => entry.id !== payload.cameraId);
    if (next.selectedCameraId === payload.cameraId) next.selectedCameraId = next.cameras[0]?.id ?? "";
  }
  if (command.type === "select_camera") {
    requireById(next.cameras, payload.cameraId, "camera");
    next.selectedCameraId = payload.cameraId;
  }
  if (command.type === "record_capture") {
    requireById(next.cameras, payload.capture.cameraId, "camera");
    if (payload.capture.stageRevision !== currentStage.revision) {
      throw new UnuTvError("director_capture_stale", `Capture references stage revision ${payload.capture.stageRevision}, current revision is ${currentStage.revision}`, 409);
    }
    next.captures = replaceById(next.captures, clone(payload.capture));
  }
  if (command.type === "remove_capture") {
    requireById(next.captures, payload.captureId, "capture");
    next.captures = next.captures.filter((entry) => entry.id !== payload.captureId);
  }

  next.revision = currentStage.revision + 1;
  next.updatedAt = timestamp;
  assertValid(validateDirectorStageDocumentV1(next), "invalid_director_stage", "Invalid resulting DirectorStageDocumentV1");
  return next;
}
