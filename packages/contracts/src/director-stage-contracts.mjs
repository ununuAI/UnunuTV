import {
  DIRECTOR_COMPOSITION_VERSION,
  DIRECTOR_ROUTE_PATH_MODES,
  validateDirectorCompositionV1,
} from "./director-composition-contracts.mjs";

export const DIRECTOR_STAGE_VERSION = "director_stage_v1";
export const DIRECTOR_STAGE_ENVIRONMENT_VERSION = "director_stage_environment_v1";
export const DIRECTOR_STAGE_COMMAND_VERSION = "director_stage_command_v1";
export const DIRECTOR_STAGE_SHOT_BINDING_VERSION = "director_stage_shot_binding_v1";

export const DIRECTOR_STAGE_OBJECT_TYPES = Object.freeze([
  "wall", "door", "counter", "refrigerator", "shelf", "character", "prop", "light", "other"
]);
export const DIRECTOR_STAGE_ROUTE_TYPES = Object.freeze(["character", "camera", "action"]);
export const DIRECTOR_STAGE_ACTOR_TYPES = Object.freeze(["owner", "agent", "automation"]);
export const DIRECTOR_STAGE_COMMAND_TYPES = Object.freeze([
  "initialize",
  "replace_document",
  "set_environment",
  "clear_environment",
  "upsert_object",
  "move_object",
  "remove_object",
  "upsert_route",
  "remove_route",
  "upsert_camera",
  "remove_camera",
  "select_camera",
  "record_capture",
  "remove_capture"
]);

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function issue(path, message, code = "invalid_field") {
  return { code, message, path };
}

function requiredText(value, path, issues) {
  if (!hasText(value)) issues.push(issue(path, `${path} is required`, "required"));
}

function requiredRecord(value, path, issues) {
  if (!isRecord(value)) issues.push(issue(path, `${path} must be an object`, "invalid_type"));
}

function requiredArray(value, path, issues) {
  if (!Array.isArray(value)) issues.push(issue(path, `${path} must be an array`, "invalid_type"));
}

function enumValue(value, allowed, path, issues) {
  if (!allowed.includes(value)) issues.push(issue(path, `${path} must be one of: ${allowed.join(", ")}`, "invalid_enum"));
}

function finiteNumber(value, path, issues, { minimum, maximum } = {}) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    issues.push(issue(path, `${path} must be a finite number`, "invalid_number"));
    return;
  }
  if (minimum !== undefined && value < minimum) issues.push(issue(path, `${path} must be >= ${minimum}`, "invalid_number"));
  if (maximum !== undefined && value > maximum) issues.push(issue(path, `${path} must be <= ${maximum}`, "invalid_number"));
}

function integer(value, path, issues, minimum = 0) {
  if (!Number.isInteger(value) || value < minimum) issues.push(issue(path, `${path} must be an integer >= ${minimum}`, "invalid_number"));
}

function booleanValue(value, path, issues) {
  if (typeof value !== "boolean") issues.push(issue(path, `${path} must be boolean`, "invalid_type"));
}

function result(issues) {
  return Object.freeze({ issues: Object.freeze(issues), ok: issues.length === 0 });
}

function validateVector(value, path, issues) {
  requiredRecord(value, path, issues);
  if (!isRecord(value)) return;
  for (const axis of ["x", "y", "z"]) finiteNumber(value[axis], `${path}.${axis}`, issues);
}

function validateJointAngles(value, path, issues) {
  requiredRecord(value, path, issues);
  if (!isRecord(value)) return;
  for (const [jointName, axes] of Object.entries(value)) {
    const jointPath = `${path}.${jointName}`;
    requiredRecord(axes, jointPath, issues);
    if (!isRecord(axes)) continue;
    for (const [axis, angle] of Object.entries(axes)) {
      finiteNumber(angle, `${jointPath}.${axis}`, issues, {
        minimum: -360,
        maximum: 360,
      });
    }
  }
}

function validateDimensions(value, path, issues) {
  requiredRecord(value, path, issues);
  if (!isRecord(value)) return;
  for (const field of ["width", "depth", "height"]) finiteNumber(value[field], `${path}.${field}`, issues, { minimum: 0.001 });
  if (value.unit !== "m") issues.push(issue(`${path}.unit`, `${path}.unit must be m`, "invalid_enum"));
}

function validateObject(value, path, issues) {
  requiredRecord(value, path, issues);
  if (!isRecord(value)) return;
  requiredText(value.id, `${path}.id`, issues);
  requiredText(value.label, `${path}.label`, issues);
  enumValue(value.type, DIRECTOR_STAGE_OBJECT_TYPES, `${path}.type`, issues);
  validateVector(value.position, `${path}.position`, issues);
  validateVector(value.rotation, `${path}.rotation`, issues);
  validateVector(value.size, `${path}.size`, issues);
  requiredText(value.color, `${path}.color`, issues);
  booleanValue(value.visible, `${path}.visible`, issues);
}

function validateRoute(value, path, issues) {
  requiredRecord(value, path, issues);
  if (!isRecord(value)) return;
  requiredText(value.id, `${path}.id`, issues);
  requiredText(value.label, `${path}.label`, issues);
  enumValue(value.type, DIRECTOR_STAGE_ROUTE_TYPES, `${path}.type`, issues);
  requiredText(value.color, `${path}.color`, issues);
  if (value.objectId !== undefined) requiredText(value.objectId, `${path}.objectId`, issues);
  if (value.subjectFollowObjectId !== undefined) requiredText(value.subjectFollowObjectId, `${path}.subjectFollowObjectId`, issues);
  if (value.pathMode !== undefined) enumValue(value.pathMode, DIRECTOR_ROUTE_PATH_MODES, `${path}.pathMode`, issues);
  if (value.speedCurve !== undefined) enumValue(value.speedCurve, ["linear", "ease", "ease_in", "ease_out", "ease_in_out", "step", "hold"], `${path}.speedCurve`, issues);
  requiredArray(value.points, `${path}.points`, issues);
  if (Array.isArray(value.points)) value.points.forEach((point, index) => {
    validateVector(point, `${path}.points[${index}]`, issues);
    if (point?.atMs !== undefined) finiteNumber(point.atMs, `${path}.points[${index}].atMs`, issues, { minimum: 0 });
  });
}

function validateCamera(value, path, issues) {
  requiredRecord(value, path, issues);
  if (!isRecord(value)) return;
  requiredText(value.id, `${path}.id`, issues);
  requiredText(value.label, `${path}.label`, issues);
  validateVector(value.position, `${path}.position`, issues);
  validateVector(value.target, `${path}.target`, issues);
  finiteNumber(value.fov, `${path}.fov`, issues, { minimum: 1, maximum: 179 });
  requiredText(value.aspectRatio, `${path}.aspectRatio`, issues);
  requiredArray(value.shotIds, `${path}.shotIds`, issues);
  if (Array.isArray(value.shotIds)) value.shotIds.forEach((shotId, index) => requiredText(shotId, `${path}.shotIds[${index}]`, issues));
  if (value.routeIds !== undefined) {
    requiredArray(value.routeIds, `${path}.routeIds`, issues);
    if (Array.isArray(value.routeIds)) value.routeIds.forEach((routeId, index) => requiredText(routeId, `${path}.routeIds[${index}]`, issues));
  }
  if (value.intentionalForegroundCropIds !== undefined) {
    requiredArray(value.intentionalForegroundCropIds, `${path}.intentionalForegroundCropIds`, issues);
    if (Array.isArray(value.intentionalForegroundCropIds)) {
      const seen = new Set();
      value.intentionalForegroundCropIds.forEach((objectId, index) => {
        requiredText(objectId, `${path}.intentionalForegroundCropIds[${index}]`, issues);
        if (seen.has(objectId)) issues.push(issue(`${path}.intentionalForegroundCropIds[${index}]`, "intentional foreground crop ids must be unique", "duplicate_id"));
        seen.add(objectId);
      });
    }
  }
  if (value.objectStates !== undefined) {
    requiredArray(value.objectStates, `${path}.objectStates`, issues);
    if (Array.isArray(value.objectStates)) value.objectStates.forEach((state, index) => {
      const base = `${path}.objectStates[${index}]`;
      requiredRecord(state, base, issues);
      if (!isRecord(state)) return;
      requiredText(state.objectId, `${base}.objectId`, issues);
      validateVector(state.position, `${base}.position`, issues);
      if (state.rotation !== undefined) validateVector(state.rotation, `${base}.rotation`, issues);
      booleanValue(state.visible, `${base}.visible`, issues);
      if (state.pose !== undefined) requiredText(state.pose, `${base}.pose`, issues);
      if (state.jointAngles !== undefined) validateJointAngles(state.jointAngles, `${base}.jointAngles`, issues);
    });
  }
}

function validateCapture(value, path, issues) {
  requiredRecord(value, path, issues);
  if (!isRecord(value)) return;
  for (const field of ["id", "imageNodeId", "mediaId", "cameraId", "capturedAt"]) requiredText(value[field], `${path}.${field}`, issues);
  integer(value.stageRevision, `${path}.stageRevision`, issues, 1);
}

function validateEnvironment(value, path, issues) {
  requiredRecord(value, path, issues);
  if (!isRecord(value)) return;
  if (value.version !== DIRECTOR_STAGE_ENVIRONMENT_VERSION) issues.push(issue(`${path}.version`, `${path}.version must be ${DIRECTOR_STAGE_ENVIRONMENT_VERSION}`, "invalid_version"));
  if (value.mode !== "panorama_equirectangular" && value.mode !== "gaussian_splat") {
    issues.push(issue(`${path}.mode`, `${path}.mode must be panorama_equirectangular or gaussian_splat`, "invalid_enum"));
  }
  requiredArray(value.anchors, `${path}.anchors`, issues);
  if (Array.isArray(value.anchors)) value.anchors.forEach((anchor, index) => {
    const base = `${path}.anchors[${index}]`;
    requiredRecord(anchor, base, issues);
    if (!isRecord(anchor)) return;
    for (const field of ["id", "label", "sourceAssetId", "sourceVersionId", "mediaId"]) requiredText(anchor[field], `${base}.${field}`, issues);
    if (anchor.projection !== "equirectangular" && anchor.projection !== "gaussian_splat") issues.push(issue(`${base}.projection`, `${base}.projection is invalid`, "invalid_enum"));
    validateVector(anchor.position, `${base}.position`, issues);
    if (anchor.rotation !== undefined) validateVector(anchor.rotation, `${base}.rotation`, issues);
    if (anchor.scale !== undefined) validateVector(anchor.scale, `${base}.scale`, issues);
    finiteNumber(anchor.yawOffsetDeg, `${base}.yawOffsetDeg`, issues);
  });
  requiredText(value.activeAnchorId, `${path}.activeAnchorId`, issues);
  if (!Array.isArray(value.anchors) || !value.anchors.some((anchor) => anchor?.id === value.activeAnchorId)) {
    issues.push(issue(`${path}.activeAnchorId`, `${path}.activeAnchorId must reference an anchor`, "missing_reference"));
  }
  enumValue(value.semanticGeometryVisibility, ["hidden", "editor_only", "always"], `${path}.semanticGeometryVisibility`, issues);
}

function validateUniqueIds(items, path, issues) {
  if (!Array.isArray(items)) return;
  const ids = new Set();
  items.forEach((item, index) => {
    if (ids.has(item?.id)) issues.push(issue(`${path}[${index}].id`, `${path} ids must be unique`, "duplicate"));
    ids.add(item?.id);
  });
}

export function validateDirectorStageDocumentV1(value) {
  const issues = [];
  requiredRecord(value, "directorStage", issues);
  if (!isRecord(value)) return result(issues);
  if (value.version !== DIRECTOR_STAGE_VERSION) issues.push(issue("version", `version must be ${DIRECTOR_STAGE_VERSION}`, "invalid_version"));
  integer(value.revision, "revision", issues, 1);
  validateDimensions(value.dimensions, "dimensions", issues);
  for (const field of ["objects", "routes", "cameras", "captures"]) requiredArray(value[field], field, issues);
  if (Array.isArray(value.objects)) value.objects.forEach((entry, index) => validateObject(entry, `objects[${index}]`, issues));
  if (Array.isArray(value.routes)) value.routes.forEach((entry, index) => validateRoute(entry, `routes[${index}]`, issues));
  if (Array.isArray(value.cameras)) value.cameras.forEach((entry, index) => validateCamera(entry, `cameras[${index}]`, issues));
  if (Array.isArray(value.captures)) value.captures.forEach((entry, index) => validateCapture(entry, `captures[${index}]`, issues));
  for (const field of ["objects", "routes", "cameras", "captures"]) validateUniqueIds(value[field], field, issues);
  if (Array.isArray(value.cameras)) value.cameras.forEach((camera, cameraIndex) => {
    for (const [routeIndex, routeId] of (camera?.routeIds ?? []).entries()) {
      if (!value.routes?.some((route) => route?.id === routeId)) issues.push(issue(`cameras[${cameraIndex}].routeIds[${routeIndex}]`, "camera routeIds must reference a route", "missing_reference"));
    }
    for (const [stateIndex, state] of (camera?.objectStates ?? []).entries()) {
      if (!value.objects?.some((object) => object?.id === state?.objectId)) issues.push(issue(`cameras[${cameraIndex}].objectStates[${stateIndex}].objectId`, "camera objectStates must reference an object", "missing_reference"));
    }
  });
  if (typeof value.selectedCameraId !== "string") issues.push(issue("selectedCameraId", "selectedCameraId must be a string", "invalid_type"));
  if (value.selectedCameraId && !value.cameras?.some((camera) => camera.id === value.selectedCameraId)) {
    issues.push(issue("selectedCameraId", "selectedCameraId must reference a camera", "missing_reference"));
  }
  if (value.environment !== undefined) validateEnvironment(value.environment, "environment", issues);
  if (value.compositionData !== undefined && !isRecord(value.compositionData)) {
    issues.push(issue("compositionData", "compositionData must be an object", "invalid_type"));
  } else if (value.compositionData?.version === DIRECTOR_COMPOSITION_VERSION) {
    issues.push(...validateDirectorCompositionV1(value.compositionData, value).issues);
  }
  requiredText(value.createdAt, "createdAt", issues);
  requiredText(value.updatedAt, "updatedAt", issues);
  return result(issues);
}

export function validateDirectorStageCommandV1(value) {
  const issues = [];
  requiredRecord(value, "command", issues);
  if (!isRecord(value)) return result(issues);
  if (value.version !== DIRECTOR_STAGE_COMMAND_VERSION) issues.push(issue("version", `version must be ${DIRECTOR_STAGE_COMMAND_VERSION}`, "invalid_version"));
  for (const field of ["commandId", "idempotencyKey"]) requiredText(value[field], field, issues);
  enumValue(value.type, DIRECTOR_STAGE_COMMAND_TYPES, "type", issues);
  integer(value.expectedRevision, "expectedRevision", issues, 0);
  requiredRecord(value.actor, "actor", issues);
  if (isRecord(value.actor)) {
    enumValue(value.actor.actorType, DIRECTOR_STAGE_ACTOR_TYPES, "actor.actorType", issues);
    requiredText(value.actor.actorId, "actor.actorId", issues);
  }
  requiredRecord(value.payload, "payload", issues);
  if (!isRecord(value.payload)) return result(issues);
  const payload = value.payload;
  if (value.type === "initialize" && payload.dimensions !== undefined) validateDimensions(payload.dimensions, "payload.dimensions", issues);
  if (value.type === "replace_document") {
    const validation = validateDirectorStageDocumentV1(payload.stage);
    issues.push(...validation.issues.map((entry) => ({
      ...entry,
      path: `payload.stage.${entry.path}`,
    })));
  }
  if (value.type === "set_environment") validateEnvironment(payload.environment, "payload.environment", issues);
  if (value.type === "upsert_object") validateObject(payload.object, "payload.object", issues);
  if (value.type === "move_object") {
    requiredText(payload.objectId, "payload.objectId", issues);
    validateVector(payload.position, "payload.position", issues);
    if (payload.rotation !== undefined) validateVector(payload.rotation, "payload.rotation", issues);
  }
  if (value.type === "remove_object") requiredText(payload.objectId, "payload.objectId", issues);
  if (value.type === "upsert_route") validateRoute(payload.route, "payload.route", issues);
  if (value.type === "remove_route") requiredText(payload.routeId, "payload.routeId", issues);
  if (value.type === "upsert_camera") validateCamera(payload.camera, "payload.camera", issues);
  if (value.type === "remove_camera" || value.type === "select_camera") requiredText(payload.cameraId, "payload.cameraId", issues);
  if (value.type === "record_capture") validateCapture(payload.capture, "payload.capture", issues);
  if (value.type === "remove_capture") requiredText(payload.captureId, "payload.captureId", issues);
  return result(issues);
}

export function validateDirectorStageShotBindingV1(value) {
  const issues = [];
  requiredRecord(value, "directorStageShotBinding", issues);
  if (!isRecord(value)) return result(issues);
  if (value.version !== DIRECTOR_STAGE_SHOT_BINDING_VERSION) {
    issues.push(issue("version", `version must be ${DIRECTOR_STAGE_SHOT_BINDING_VERSION}`, "invalid_version"));
  }
  for (const field of ["directorNodeId", "cameraId", "captureId", "imageNodeId", "mediaId", "boundAt"]) {
    requiredText(value[field], field, issues);
  }
  integer(value.stageRevision, "stageRevision", issues, 1);
  requiredRecord(value.cameraSnapshot, "cameraSnapshot", issues);
  if (isRecord(value.cameraSnapshot)) validateCamera(value.cameraSnapshot, "cameraSnapshot", issues);
  requiredRecord(value.worldAuthority, "worldAuthority", issues);
  if (isRecord(value.worldAuthority)) {
    for (const field of ["assetIds", "versionIds", "mediaIds"]) {
      requiredArray(value.worldAuthority[field], `worldAuthority.${field}`, issues);
      if (Array.isArray(value.worldAuthority[field])) value.worldAuthority[field].forEach((entry, index) => requiredText(entry, `worldAuthority.${field}[${index}]`, issues));
    }
  }
  return result(issues);
}
