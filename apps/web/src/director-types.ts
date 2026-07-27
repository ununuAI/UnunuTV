export interface DirectorStageVector3 { x: number; y: number; z: number }
export type DirectorStageObjectType = "wall" | "door" | "counter" | "refrigerator" | "shelf" | "character" | "prop" | "light" | "other";
export type DirectorStageRouteType = "character" | "camera" | "action";
export interface DirectorStageRoutePoint extends DirectorStageVector3 { atMs?: number }

export interface DirectorStageObject {
  id: string;
  label: string;
  type: DirectorStageObjectType;
  position: DirectorStageVector3;
  rotation: DirectorStageVector3;
  frontDirection?: DirectorStageVector3;
  size: DirectorStageVector3;
  color: string;
  visible: boolean;
  sourceAssetId?: string;
  sourceVersionId?: string;
  bodyType?: "mannequin" | "asset" | "glb" | string;
  modelUrl?: string;
  modelName?: string;
  pose?: string;
  jointAngles?: Record<string, Record<string, number>>;
  uniformScale?: number;
  scale?: DirectorStageVector3;
  shadowEnabled?: boolean;
  locked?: boolean;
  panoramaGroundSnapEnabled?: boolean;
}

export interface DirectorStageRoute {
  id: string;
  label: string;
  type: DirectorStageRouteType;
  color: string;
  objectId?: string;
  points: DirectorStageRoutePoint[];
}

export interface DirectorStageObjectState {
  objectId: string;
  position: DirectorStageVector3;
  rotation?: DirectorStageVector3;
  visible: boolean;
  pose?: string;
  jointAngles?: Record<string, Record<string, number>>;
}

export interface DirectorStageCamera {
  id: string;
  label: string;
  position: DirectorStageVector3;
  target: DirectorStageVector3;
  fov: number;
  aspectRatio: string;
  shotIds: string[];
  routeIds?: string[];
  intentionalForegroundCropIds?: string[];
  captureTimeMs?: number;
  objectStates?: DirectorStageObjectState[];
  lookAtTarget?: string;
  lookAt?: DirectorStageVector3;
  cameraRotation?: DirectorStageVector3;
  zoom?: number;
  visible?: boolean;
  locked?: boolean;
  screenshots?: string[];
}

export interface DirectorStageCapture {
  id: string;
  imageNodeId: string;
  mediaId: string;
  cameraId: string;
  stageRevision: number;
  capturedAt: string;
}

export interface DirectorStageEnvironmentAnchor {
  id: string;
  label: string;
  projection: "equirectangular" | "gaussian_splat";
  position: DirectorStageVector3;
  rotation?: DirectorStageVector3;
  scale?: DirectorStageVector3;
  yawOffsetDeg: number;
  sourceAssetId: string;
  sourceVersionId: string;
  mediaId: string;
  format?: string;
  url: string;
  previewMediaId?: string;
  previewUrl?: string;
}

export interface DirectorStageEnvironment {
  version: "director_stage_environment_v1";
  mode: "panorama_equirectangular" | "gaussian_splat";
  anchors: DirectorStageEnvironmentAnchor[];
  activeAnchorId: string;
  semanticGeometryVisibility: "hidden" | "editor_only" | "always";
}

export interface DirectorCompositionKeyframe {
  id?: string;
  atMs?: number;
  time?: number;
  [key: string]: unknown;
}

export interface DirectorCompositionTrack {
  id: string;
  name?: string;
  targetId?: string;
  keyframes: DirectorCompositionKeyframe[];
  interpolation?: "linear" | "step" | "ease" | string;
}

export interface DirectorCompositionAnimation {
  version: 1;
  duration: number;
  motionPaths: DirectorCompositionTrack[];
  characterTracks: DirectorCompositionTrack[];
  propTracks: DirectorCompositionTrack[];
  cameraTracks: DirectorCompositionTrack[];
  groupTracks: DirectorCompositionTrack[];
  activeCameraTrackId: string;
}

export interface DirectorCompositionData {
  characters: DirectorStageObject[];
  characterGroups: Array<Record<string, unknown>>;
  cameras: DirectorStageCamera[];
  props: DirectorStageObject[];
  animation: DirectorCompositionAnimation;
  environment: {
    panoramaUrl: string;
    skyColor: string;
    groundVisible: boolean;
    groundOpacity: number;
    groundHeight: number;
    panoramaRotationY: number;
    panoramaRadius: number;
    sceneScale: number;
    sceneTranslation: DirectorStageVector3;
    sceneRotation: DirectorStageVector3;
    gaussianSplatUrl: string;
    gaussianSplatName: string;
    gaussianSplatSphericalHarmonicsDegree: number;
    gaussianSplatPosition: DirectorStageVector3;
    gaussianSplatRotation: DirectorStageVector3;
    gaussianSplatScale: DirectorStageVector3;
    gaussianGroundSnapEnabled: boolean;
  };
}

export interface DirectorStageDocument {
  version: "director_stage_v1";
  revision: number;
  dimensions: { width: number; depth: number; height: number; unit: "m" };
  environment?: DirectorStageEnvironment;
  objects: DirectorStageObject[];
  routes: DirectorStageRoute[];
  cameras: DirectorStageCamera[];
  selectedCameraId: string;
  captures: DirectorStageCapture[];
  compositionData?: DirectorCompositionData;
  createdAt: string;
  updatedAt: string;
}

export interface CanvasNode {
  id: string;
  title: string;
  directorStage?: DirectorStageDocument;
}

export interface VideoP0Actions {
  updateDirectorStage: (nodeId: string, directorStage: DirectorStageDocument, expectedRevision: number) => Promise<void> | void;
  updateDirectorEnvironment: (nodeId: string, environment: DirectorStageEnvironment, expectedRevision: number) => Promise<DirectorStageDocument>;
  importDirectorStagePanorama: (nodeId: string, directorStage: DirectorStageDocument, expectedRevision: number, dataUrl: string, title: string) => Promise<void> | void;
  exportDirectorStageCamera: (nodeId: string, cameraId: string, dataUrl: string, width: number, height: number, captureTimeMs?: number, captureVariant?: "blocking_plate" | "context_wide") => Promise<void> | void;
}
