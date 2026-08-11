"use client";

import {
  Box,
  Camera,
  Check,
  CirclePlus,
  Clock3,
  DoorOpen,
  Download,
  Eye,
  EyeOff,
  Film,
  Lightbulb,
  Map,
  Move3d,
  Package,
  Pause,
  Play,
  Refrigerator,
  Rotate3d,
  RotateCcw,
  RotateCw,
  Save,
  Scaling,
  SkipBack,
  Trash2,
  Upload,
  UserRound,
  Video,
  Warehouse,
  X,
} from "lucide-react";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import * as THREE from "three";
import {
  applyDirectorCompositionAtTime,
  createDirectorArcRoutePoints,
  directorObjectRequiresFullFrame,
  normalizeDirectorCompositionV1,
} from "@ununu/unutv-contracts";
import { OldSparkRenderer, SplatFileType, SplatMesh } from "@sparkjsdev/spark";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { resolveWorkbenchMediaUrl } from "./workbench-api";
import type {
  CanvasNode,
  DirectorStageCamera,
  DirectorStageDocument,
  DirectorStageObject,
  DirectorStageObjectState,
  DirectorStageObjectType,
  DirectorStageRoute,
  DirectorStageVector3,
  VideoP0Actions,
} from "./director-types";

type Selection = { kind: "environment" | "object" | "camera" | "route"; id: string };
type ViewMode = "edit" | "top_2_5d" | "camera_first_person";
type TranslationAxis = "x" | "y" | "z";

interface DirectorViewportHandle {
  capture: (
    cameraId: string,
    options?: { annotationLabel?: string; fov?: number },
  ) => { dataUrl: string; height: number; width: number } | undefined;
}

const OBJECT_PRESETS: Array<{
  type: DirectorStageObjectType;
  label: string;
  color: string;
  size: DirectorStageVector3;
  icon: typeof Box;
}> = [
  {
    type: "wall",
    label: "墙体",
    color: "#d9e2ea",
    size: { x: 4, y: 3.2, z: 0.18 },
    icon: Warehouse,
  },
  {
    type: "door",
    label: "门",
    color: "#ef8f55",
    size: { x: 1.2, y: 2.3, z: 0.16 },
    icon: DoorOpen,
  },
  {
    type: "counter",
    label: "柜台",
    color: "#51a3c8",
    size: { x: 2.6, y: 1.05, z: 0.9 },
    icon: Package,
  },
  {
    type: "refrigerator",
    label: "冷柜",
    color: "#7cced1",
    size: { x: 0.75, y: 2.4, z: 4 },
    icon: Refrigerator,
  },
  {
    type: "shelf",
    label: "货架",
    color: "#9d8bd6",
    size: { x: 1.1, y: 1.8, z: 5 },
    icon: Box,
  },
  {
    type: "character",
    label: "人物",
    color: "#4f8ef7",
    size: { x: 0.55, y: 1.72, z: 0.4 },
    icon: UserRound,
  },
  {
    type: "prop",
    label: "道具",
    color: "#ffd45a",
    size: { x: 0.35, y: 0.35, z: 0.35 },
    icon: Package,
  },
  {
    type: "light",
    label: "灯光",
    color: "#61d995",
    size: { x: 0.35, y: 0.35, z: 0.35 },
    icon: Lightbulb,
  },
];

const JOINT_CONTROLS: Array<{ group: string; axes: string[] }> = [
  { group: "body", axes: ["bend", "turn", "tilt"] },
  { group: "torso", axes: ["bend", "turn", "tilt"] },
  { group: "head", axes: ["nod", "turn", "tilt"] },
  { group: "l_arm", axes: ["raise", "straddle", "turn"] },
  { group: "r_arm", axes: ["raise", "straddle", "turn"] },
  { group: "l_elbow", axes: ["bend"] },
  { group: "r_elbow", axes: ["bend"] },
  { group: "l_leg", axes: ["raise", "straddle", "turn"] },
  { group: "r_leg", axes: ["raise", "straddle", "turn"] },
  { group: "l_knee", axes: ["bend"] },
  { group: "r_knee", axes: ["bend"] },
];

const NEUTRAL_JOINTS: Record<string, Record<string, number>> = {
  body: { bend: 0, turn: 0, tilt: 0 },
  torso: { bend: 0, turn: 0, tilt: 0 },
  head: { nod: 0, turn: 0, tilt: 0 },
  l_arm: { raise: -5, straddle: 7, turn: 0 },
  r_arm: { raise: -5, straddle: 7, turn: 0 },
  l_elbow: { bend: 15 },
  r_elbow: { bend: 15 },
  l_leg: { raise: 0, straddle: 0, turn: 0 },
  r_leg: { raise: 0, straddle: 0, turn: 0 },
  l_knee: { bend: 0 },
  r_knee: { bend: 0 },
};

const POSE_PRESETS: Array<{
  id: string;
  label: string;
  joints: Record<string, Record<string, number>>;
}> = [
  { id: "stand", label: "站立", joints: NEUTRAL_JOINTS },
  {
    id: "walk",
    label: "行走",
    joints: {
      ...NEUTRAL_JOINTS,
      torso: { bend: 3, turn: 0, tilt: 0 },
      l_arm: { raise: 28, straddle: 5, turn: 0 },
      r_arm: { raise: -28, straddle: 5, turn: 0 },
      l_leg: { raise: -22, straddle: 0, turn: 0 },
      r_leg: { raise: 22, straddle: 0, turn: 0 },
      l_knee: { bend: 18 },
      r_knee: { bend: 6 },
    },
  },
  {
    id: "run",
    label: "奔跑",
    joints: {
      ...NEUTRAL_JOINTS,
      body: { bend: 10, turn: 0, tilt: 0 },
      torso: { bend: 12, turn: 0, tilt: 0 },
      l_arm: { raise: 48, straddle: 8, turn: 0 },
      r_arm: { raise: -48, straddle: 8, turn: 0 },
      l_elbow: { bend: 65 },
      r_elbow: { bend: 65 },
      l_leg: { raise: -38, straddle: 3, turn: 0 },
      r_leg: { raise: 38, straddle: 3, turn: 0 },
      l_knee: { bend: 55 },
      r_knee: { bend: 20 },
    },
  },
  {
    id: "sit",
    label: "坐下",
    joints: {
      ...NEUTRAL_JOINTS,
      torso: { bend: 2, turn: 0, tilt: 0 },
      l_arm: { raise: 5, straddle: 12, turn: 0 },
      r_arm: { raise: 5, straddle: 12, turn: 0 },
      l_leg: { raise: 75, straddle: 3, turn: 0 },
      r_leg: { raise: 75, straddle: 3, turn: 0 },
      l_knee: { bend: 90 },
      r_knee: { bend: 90 },
    },
  },
  {
    id: "crouch",
    label: "蹲下",
    joints: {
      ...NEUTRAL_JOINTS,
      body: { bend: 12, turn: 0, tilt: 0 },
      torso: { bend: 18, turn: 0, tilt: 0 },
      l_arm: { raise: 22, straddle: 18, turn: 0 },
      r_arm: { raise: 22, straddle: 18, turn: 0 },
      l_leg: { raise: 35, straddle: 12, turn: 0 },
      r_leg: { raise: 35, straddle: 12, turn: 0 },
      l_knee: { bend: 85 },
      r_knee: { bend: 85 },
    },
  },
  {
    id: "fight",
    label: "战斗",
    joints: {
      ...NEUTRAL_JOINTS,
      body: { bend: 5, turn: -12, tilt: 0 },
      torso: { bend: 5, turn: 12, tilt: 0 },
      head: { nod: -4, turn: 8, tilt: 0 },
      l_arm: { raise: 55, straddle: 35, turn: -15 },
      r_arm: { raise: 72, straddle: 22, turn: 15 },
      l_elbow: { bend: 72 },
      r_elbow: { bend: 58 },
      l_leg: { raise: -12, straddle: 24, turn: -8 },
      r_leg: { raise: 18, straddle: 20, turn: 8 },
      l_knee: { bend: 22 },
      r_knee: { bend: 32 },
    },
  },
  {
    id: "sword",
    label: "挥剑",
    joints: {
      ...NEUTRAL_JOINTS,
      body: { bend: 8, turn: -25, tilt: 0 },
      torso: { bend: 6, turn: 32, tilt: -5 },
      head: { nod: -6, turn: 20, tilt: 0 },
      l_arm: { raise: 42, straddle: 26, turn: -18 },
      r_arm: { raise: 118, straddle: 20, turn: 22 },
      l_elbow: { bend: 48 },
      r_elbow: { bend: 28 },
      l_leg: { raise: -18, straddle: 18, turn: -10 },
      r_leg: { raise: 24, straddle: 16, turn: 10 },
      l_knee: { bend: 18 },
      r_knee: { bend: 34 },
    },
  },
];

function cloneStage(stage: DirectorStageDocument) {
  const cloned = JSON.parse(JSON.stringify(stage)) as DirectorStageDocument;
  if (cloned.compositionData) {
    cloned.compositionData = normalizeDirectorCompositionV1(
      cloned.compositionData,
      cloned,
    ) as DirectorStageDocument["compositionData"];
  }
  return cloned;
}

/** Standard blocking mannequin. Identity stays explicit through a stable label. */
function createRoleAMannequin(
  material: THREE.MeshStandardMaterial,
  size: DirectorStageVector3,
  selected: boolean,
  identityLabel: string,
  jointAngles?: Record<string, Record<string, number>>,
): THREE.Group {
  const group = new THREE.Group();
  const height = Math.max(1.4, size.y);
  const width = Math.max(0.4, size.x);
  const depth = Math.max(0.28, size.z);
  // Group origin matches previous capsule center so director position.y stays mid-body.
  const y0 = -height / 2;

  const add = (
    geometry: THREE.BufferGeometry,
    x: number,
    y: number,
    z: number,
    sx = 1,
    sy = 1,
    sz = 1,
    name?: string,
  ) => {
    const mesh = new THREE.Mesh(geometry, material);
    if (name) mesh.name = name;
    mesh.position.set(x, y0 + y, z);
    mesh.scale.set(sx, sy, sz);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    group.add(mesh);
    return mesh;
  };

  const headR = height * 0.075;
  const neckH = height * 0.04;
  const torsoH = height * 0.28;
  const torsoW = width * 0.72;
  const torsoD = depth * 0.55;
  const hipH = height * 0.08;
  const legH = height * 0.38;
  const legR = width * 0.12;
  const armH = height * 0.28;
  const armR = width * 0.09;
  const footH = height * 0.04;
  const hipY = footH + legH;

  const addPivotedLimb = (
    name: string,
    geometry: THREE.BufferGeometry,
    pivot: DirectorStageVector3,
    meshOffset: DirectorStageVector3,
  ) => {
    const joint = new THREE.Group();
    joint.name = name;
    joint.position.set(pivot.x, y0 + pivot.y, pivot.z);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `${name}_mesh`;
    mesh.position.set(meshOffset.x, meshOffset.y, meshOffset.z);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    joint.add(mesh);
    group.add(joint);
    return joint;
  };

  // Legs pivot at the hip instead of rotating around their own centres. This
  // keeps action poses connected when a director assigns shot-local angles.
  const leftLeg = addPivotedLimb(
    "l_leg",
    new THREE.CapsuleGeometry(legR, Math.max(0.08, legH - legR * 2), 6, 10),
    { x: -width * 0.16, y: hipY, z: 0 },
    { x: 0, y: -legH / 2, z: 0 },
  );
  const rightLeg = addPivotedLimb(
    "r_leg",
    new THREE.CapsuleGeometry(legR, Math.max(0.08, legH - legR * 2), 6, 10),
    { x: width * 0.16, y: hipY, z: 0 },
    { x: 0, y: -legH / 2, z: 0 },
  );
  for (const leg of [leftLeg, rightLeg]) {
    const foot = new THREE.Mesh(
      new THREE.BoxGeometry(legR * 2.2, footH, legR * 3.2),
      material,
    );
    foot.name = `${leg.name.replace("_leg", "")}_foot`;
    foot.position.set(0, -legH - footH / 2, legR * 0.35);
    foot.castShadow = false;
    foot.receiveShadow = false;
    leg.add(foot);
  }
  // hips + torso
  add(
    new THREE.BoxGeometry(torsoW * 0.95, hipH, torsoD * 1.05),
    0,
    hipY + hipH / 2,
    0,
    1,
    1,
    1,
    "hip",
  );
  add(
    new THREE.BoxGeometry(torsoW, torsoH, torsoD),
    0,
    hipY + hipH + torsoH / 2,
    0,
    1,
    1,
    1,
    "torso",
  );
  // shoulders
  const shoulderY = hipY + hipH + torsoH * 0.92;
  add(
    new THREE.CapsuleGeometry(armR * 1.15, width * 0.55, 4, 8),
    0,
    shoulderY,
    0,
    1,
    1,
    1,
  ).rotation.z = Math.PI / 2;
  // Arms use shoulder pivots for the same reason as the legs.
  addPivotedLimb(
    "l_arm",
    new THREE.CapsuleGeometry(armR, Math.max(0.06, armH - armR * 2), 6, 10),
    { x: -width * 0.42, y: shoulderY, z: 0 },
    { x: 0, y: -armH / 2, z: 0 },
  );
  addPivotedLimb(
    "r_arm",
    new THREE.CapsuleGeometry(armR, Math.max(0.06, armH - armR * 2), 6, 10),
    { x: width * 0.42, y: shoulderY, z: 0 },
    { x: 0, y: -armH / 2, z: 0 },
  );
  // neck + head
  const neckY = hipY + hipH + torsoH;
  add(
    new THREE.CylinderGeometry(headR * 0.45, headR * 0.55, neckH, 10),
    0,
    neckY + neckH / 2,
    0,
    1,
    1,
    1,
    "neck",
  );
  add(
    new THREE.SphereGeometry(headR, 16, 12),
    0,
    neckY + neckH + headR * 0.95,
    0,
    1,
    1,
    1,
    "head",
  );

  const axisValue = (groupName: string, axis: "pitch" | "yaw" | "roll") => {
    const values = jointAngles?.[groupName] ?? {};
    const candidates =
      axis === "pitch"
        ? ["pitch", "bend", "nod", "raise"]
        : axis === "yaw"
          ? ["yaw", "turn", "straddle"]
          : ["roll", "tilt", "turn"];
    return THREE.MathUtils.degToRad(
      Number(
        candidates
          .map((candidate) => values[candidate])
          .find((value) => Number.isFinite(value)) ?? 0,
      ),
    );
  };
  const setJoint = (name: string, groupName: string) => {
    const part = group.getObjectByName(name);
    if (part)
      part.rotation.set(
        axisValue(groupName, "pitch"),
        axisValue(groupName, "yaw"),
        axisValue(groupName, "roll"),
      );
  };
  setJoint("torso", "torso");
  setJoint("head", "head");
  setJoint("l_arm", "l_arm");
  setJoint("r_arm", "r_arm");
  setJoint("l_leg", "l_leg");
  setJoint("r_leg", "r_leg");

  // Floating identity card. Storyboard frames must never make the video model
  // guess which mannequin represents which bound character.
  const labelCanvas = document.createElement("canvas");
  labelCanvas.width = 256;
  labelCanvas.height = 96;
  const ctx = labelCanvas.getContext("2d");
  if (ctx) {
    ctx.clearRect(0, 0, labelCanvas.width, labelCanvas.height);
    const padX = 28;
    const padY = 18;
    const text = identityLabel;
    ctx.font = "bold 44px system-ui, sans-serif";
    const metrics = ctx.measureText(text);
    const tw = metrics.width;
    const th = 44;
    const bx = (labelCanvas.width - tw) / 2 - padX;
    const by = (labelCanvas.height - th) / 2 - padY / 2;
    const bw = tw + padX * 2;
    const bh = th + padY;
    ctx.fillStyle = "rgba(18, 22, 30, 0.92)";
    ctx.strokeStyle = selected
      ? "rgba(255,255,255,0.85)"
      : "rgba(120,140,170,0.55)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    const r = 22;
    ctx.moveTo(bx + r, by);
    ctx.arcTo(bx + bw, by, bx + bw, by + bh, r);
    ctx.arcTo(bx + bw, by + bh, bx, by + bh, r);
    ctx.arcTo(bx, by + bh, bx, by, r);
    ctx.arcTo(bx, by, bx + bw, by, r);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#f4f7fb";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, labelCanvas.width / 2, labelCanvas.height / 2 + 2);
  }
  const labelTexture = new THREE.CanvasTexture(labelCanvas);
  labelTexture.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: labelTexture,
      transparent: true,
      depthTest: true,
    }),
  );
  label.scale.set(0.7, 0.26, 1);
  label.position.set(0, height / 2 + 0.28, 0);
  group.add(label);

  group.userData.roleAMannequin = true;
  return group;
}

function createTranslationGizmo(object: DirectorStageObject, position: DirectorStageVector3) {
  const gizmo = new THREE.Group();
  const scaleY = object.scale?.y ?? object.uniformScale ?? 1;
  const footY = position.y - (object.size.y * scaleY) / 2;
  gizmo.position.set(position.x, footY + 0.035, position.z);
  gizmo.userData.directorTransformGizmoObjectId = object.id;
  const length = Math.max(0.85, Math.min(1.35, object.size.y * 0.7));
  const axes: Array<{ axis: TranslationAxis; color: number; direction: THREE.Vector3 }> = [
    { axis: "x", color: 0xff4d5e, direction: new THREE.Vector3(1, 0, 0) },
    { axis: "y", color: 0x55e58d, direction: new THREE.Vector3(0, 1, 0) },
    { axis: "z", color: 0x4b8dff, direction: new THREE.Vector3(0, 0, 1) },
  ];
  for (const { axis, color, direction } of axes) {
    const arrow = new THREE.ArrowHelper(direction, new THREE.Vector3(), length, color, 0.24, 0.13);
    arrow.traverse((child) => {
      child.userData.directorTranslateAxis = axis;
      child.userData.directorTranslateObjectId = object.id;
      child.renderOrder = 80;
      const material = (child as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      for (const candidate of Array.isArray(material) ? material : material ? [material] : []) {
        candidate.depthTest = false;
        candidate.depthWrite = false;
        candidate.transparent = true;
      }
    });
    gizmo.add(arrow);
  }
  const origin = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 16, 10),
    new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, depthWrite: false }),
  );
  origin.renderOrder = 80;
  gizmo.add(origin);
  return gizmo;
}

type PanoramaAnchor = NonNullable<
  DirectorStageDocument["environment"]
>["anchors"][number];

function stageCamera(
  spec: DirectorStageCamera,
  aspect: number,
  panoramaAnchor?: PanoramaAnchor,
  farClip = 500,
) {
  const camera = new THREE.PerspectiveCamera(
    spec.fov / Math.max(0.01, spec.zoom ?? 1),
    aspect,
    0.05,
    Math.max(0.1, farClip),
  );
  const position = new THREE.Vector3(
    spec.position.x,
    spec.position.y,
    spec.position.z,
  );
  const targetSpec = spec.lookAt ?? spec.target;
  const target = new THREE.Vector3(targetSpec.x, targetSpec.y, targetSpec.z);
  if (panoramaAnchor?.projection === "equirectangular") {
    // A single equirectangular authority image only contains rays captured from
    // its original optical centre. Moving the render camera away from that
    // centre makes directions drift. Keep the Director Stage camera coordinates
    // in structured control data, but render that direction from the panorama
    // optical centre.
    const semanticDirection = target.sub(position);
    // Director Stage uses +X=cold-case, +Z=warehouse, while the accepted
    // equirectangular authority maps those axes to Three's -Z and -X rays.
    // Convert bases here so semantic coordinates and the panorama agree.
    const direction = new THREE.Vector3(
      -semanticDirection.z,
      semanticDirection.y,
      -semanticDirection.x,
    ).normalize();
    camera.position.set(
      panoramaAnchor.position.x,
      panoramaAnchor.position.y,
      panoramaAnchor.position.z,
    );
    camera.lookAt(camera.position.clone().add(direction));
  } else {
    camera.position.copy(position);
    camera.lookAt(target);
  }
  camera.updateProjectionMatrix();
  return camera;
}

function compositionEnvironmentAnchor(
  compositionEnvironment: DirectorStageDocument["compositionData"] extends infer T
    ? T extends { environment: infer E }
      ? E
      : never
    : never,
): PanoramaAnchor | undefined {
  if (!compositionEnvironment) return undefined;
  if (compositionEnvironment.gaussianSplatUrl) {
    return {
      id: "composition-gaussian-splat",
      label: compositionEnvironment.gaussianSplatName || "UnuTV Gaussian Splat",
      projection: "gaussian_splat",
      position: compositionEnvironment.gaussianSplatPosition,
      rotation: compositionEnvironment.gaussianSplatRotation,
      scale: compositionEnvironment.gaussianSplatScale,
      yawOffsetDeg: compositionEnvironment.gaussianSplatRotation.y,
      sourceAssetId: "composition-gaussian-splat",
      sourceVersionId: "composition-gaussian-splat",
      mediaId: "composition-gaussian-splat",
      format: compositionEnvironment.gaussianSplatUrl.split(/[?#]/, 1)[0]?.split(".").pop()?.toLowerCase(),
      url: resolveWorkbenchMediaUrl(compositionEnvironment.gaussianSplatUrl) ?? compositionEnvironment.gaussianSplatUrl,
    };
  }
  if (!compositionEnvironment.panoramaUrl) return undefined;
  return {
    id: "composition-panorama",
    label: "UnuTV 全景输入",
    projection: "equirectangular",
    position: compositionEnvironment.sceneTranslation,
    yawOffsetDeg: compositionEnvironment.panoramaRotationY,
    sourceAssetId: "composition-panorama",
    sourceVersionId: "composition-panorama",
    mediaId: "composition-panorama",
    url: resolveWorkbenchMediaUrl(compositionEnvironment.panoramaUrl) ?? compositionEnvironment.panoramaUrl,
  };
}

function splatFileType(format?: string) {
  const normalized = String(format || "").replace(/^\./, "").toLowerCase();
  const values: Record<string, SplatFileType> = {
    ply: SplatFileType.PLY,
    spz: SplatFileType.SPZ,
    splat: SplatFileType.SPLAT,
    ksplat: SplatFileType.KSPLAT,
    sog: SplatFileType.PCSOGSZIP,
    rad: SplatFileType.RAD,
  };
  return values[normalized];
}

function captureDimensions(aspectRatio: string) {
  const dimensions: Record<string, { height: number; width: number }> = {
    "16:9": { width: 1280, height: 720 },
    "9:16": { width: 720, height: 1280 },
    "1:1": { width: 1024, height: 1024 },
    "4:3": { width: 1200, height: 900 },
    "21:9": { width: 1470, height: 630 },
  };
  return dimensions[aspectRatio] ?? { width: 1280, height: 720 };
}

function objectFitsCameraFrame(
  object: DirectorStageObject,
  objectState: DirectorStageObjectState | undefined,
  camera: THREE.PerspectiveCamera,
) {
  const position = objectState?.position ?? object.position;
  const scale = object.scale ?? {
    x: object.uniformScale ?? 1,
    y: object.uniformScale ?? 1,
    z: object.uniformScale ?? 1,
  };
  const halfHeight = Math.max(0.2, object.size.y * scale.y * 0.5);
  const halfWidth = Math.max(0.1, object.size.x * scale.x * 0.5);
  const samples = [
    new THREE.Vector3(position.x, position.y, position.z),
    new THREE.Vector3(position.x, position.y + halfHeight, position.z),
    new THREE.Vector3(position.x, position.y - halfHeight, position.z),
    new THREE.Vector3(position.x - halfWidth, position.y, position.z),
    new THREE.Vector3(position.x + halfWidth, position.y, position.z),
  ];
  camera.updateMatrixWorld(true);
  return samples.every((sample) => {
    const projected = sample.project(camera);
    return (
      projected.z >= -1 &&
      projected.z <= 1 &&
      Math.abs(projected.x) <= 0.97 &&
      Math.abs(projected.y) <= 0.97
    );
  });
}

function cameraCrossesDoorPortal(
  object: DirectorStageObject,
  objectState: DirectorStageObjectState | undefined,
  cameraSpec: DirectorStageCamera,
) {
  if (object.type !== "door") return false;
  const position = objectState?.position ?? object.position;
  const target = cameraSpec.lookAt ?? cameraSpec.target;
  const scale = object.scale ?? {
    x: object.uniformScale ?? 1,
    y: object.uniformScale ?? 1,
    z: object.uniformScale ?? 1,
  };
  const dimensions = {
    x: object.size.x * scale.x,
    y: object.size.y * scale.y,
    z: object.size.z * scale.z,
  };
  const planeAxis = (Object.entries(dimensions) as Array<
    [keyof DirectorStageVector3, number]
  >).reduce((smallest, entry) => (entry[1] < smallest[1] ? entry : smallest))[0];
  const cameraSide = cameraSpec.position[planeAxis] - position[planeAxis];
  const targetSide = target[planeAxis] - position[planeAxis];
  return cameraSide * targetSide < 0;
}

const DirectorViewport = forwardRef<
  DirectorViewportHandle,
  {
    stage: DirectorStageDocument;
    viewMode: ViewMode;
    showSemanticGeometry: boolean;
    showShotControls: boolean;
    selectedCameraId: string;
    selected?: Selection;
    onSelectObject: (id: string) => void;
    onSelectCamera: (id: string) => void;
    onMoveObject: (id: string, position: DirectorStageVector3) => void;
    onMoveCamera: (id: string, position: DirectorStageVector3) => void;
    onMoveCameraTarget: (id: string, target: DirectorStageVector3) => void;
  }
>(function DirectorViewport(
  {
    stage,
    viewMode,
    showSemanticGeometry,
    showShotControls,
    selectedCameraId,
    selected,
    onSelectObject,
    onSelectCamera,
    onMoveObject,
    onMoveCamera,
    onMoveCameraTarget,
  },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const editViewRef = useRef<{ position: THREE.Vector3; target: THREE.Vector3 } | undefined>(undefined);
  const interactionCallbacksRef = useRef({
    onMoveCamera,
    onMoveCameraTarget,
    onMoveObject,
    onSelectCamera,
    onSelectObject,
  });
  interactionCallbacksRef.current = {
    onMoveCamera,
    onMoveCameraTarget,
    onMoveObject,
    onSelectCamera,
    onSelectObject,
  };
  const runtimeRef = useRef<
    | {
        renderer: THREE.WebGLRenderer;
        scene: THREE.Scene;
        cameraHelpers: THREE.Group;
        metricStageHelpers: THREE.Group;
        objectHelpers: THREE.Group;
        panoramaHelpers: THREE.Group;
        routeHelpers: THREE.Group;
        semanticGeometryHelpers: THREE.Group;
      }
    | undefined
  >(undefined);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new THREE.WebGLRenderer({
      canvas,
      // Spark's renderer draws the Gaussian footprint itself. Its documented
      // Three integration requires WebGL antialiasing to stay off; enabling it
      // wastes a multisampled target and can leave the legacy Momo-compatible
      // accumulator with no visible first frame.
      antialias: false,
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x070b10, 1);
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x070b10, 30, 80);
    const cameraHelpers = new THREE.Group();
    const metricStageHelpers = new THREE.Group();
    const objectHelpers = new THREE.Group();
    const panoramaHelpers = new THREE.Group();
    const routeHelpers = new THREE.Group();
    const semanticGeometryHelpers = new THREE.Group();
    scene.add(cameraHelpers);
    scene.add(metricStageHelpers);
    scene.add(objectHelpers);
    scene.add(panoramaHelpers);
    scene.add(routeHelpers);
    scene.add(semanticGeometryHelpers);

    const authorityEnvironment =
      stage.environment?.anchors.find(
        (anchor) => anchor.id === stage.environment?.activeAnchorId,
      ) ?? stage.environment?.anchors[0];
    const compositionEnvironment = stage.compositionData?.environment;
    const environment = authorityEnvironment ?? compositionEnvironmentAnchor(compositionEnvironment);
    const selectedCameraSpec =
      stage.cameras.find((camera) => camera.id === selectedCameraId) ??
      stage.cameras[0];
    const selectedObjectStates = new globalThis.Map(
      selectedCameraSpec?.objectStates?.map(
        (state) => [state.objectId, state] as const,
      ) ?? [],
    );
    let environmentGeometry: THREE.SphereGeometry | undefined;
    let environmentMaterial: THREE.MeshBasicMaterial | undefined;
    let environmentTexture: THREE.Texture | undefined;
    let environmentTextureObjectUrl: string | undefined;
    let sparkRenderer: OldSparkRenderer | undefined;
    let splatMesh: SplatMesh | undefined;
    let gaussianViewDirty = false;
    const environmentAbortController = new AbortController();
    if (environment?.url && environment.projection === "gaussian_splat") {
      // Momo's bundled Director Console uses the original SparkRenderer path.
      // Spark 2 keeps that exact integration as OldSparkRenderer; the new LOD
      // renderer has a different first-frame accumulator lifecycle.
      // Spark's compatibility renderer otherwise rebuilds its accumulator on
      // every frame.  SPZ files with directional colour data can therefore
      // alternate between a completed and an empty buffer even at a static
      // camera.  The Director owns the view lifecycle, so regenerate only
      // after load or a real camera/scene change and finish it before draw.
      sparkRenderer = new OldSparkRenderer({
        renderer,
        autoUpdate: false,
        preUpdate: true,
      });
      sparkRenderer.userData.directorSplatRuntime = true;
      scene.add(sparkRenderer);
      splatMesh = new SplatMesh({
        url: environment.url,
        fileType: splatFileType(environment.format),
      });
      splatMesh.userData.directorSplatRuntime = true;
      splatMesh.position.set(environment.position.x, environment.position.y, environment.position.z);
      const rotation = environment.rotation ?? { x: 0, y: environment.yawOffsetDeg, z: 0 };
      splatMesh.rotation.set(
        THREE.MathUtils.degToRad(rotation.x),
        THREE.MathUtils.degToRad(rotation.y),
        THREE.MathUtils.degToRad(rotation.z),
      );
      const scale = environment.scale ?? { x: 1, y: 1, z: 1 };
      splatMesh.scale.set(scale.x, scale.y, scale.z);
      scene.add(splatMesh);
      void splatMesh.initialized
        .then(() => {
          if (!environmentAbortController.signal.aborted) gaussianViewDirty = true;
        })
        .catch((error) => {
          if (!environmentAbortController.signal.aborted)
            console.error("Failed to load director Gaussian Splat environment", error);
        });
    } else if (environment?.url) {
      environmentGeometry = new THREE.SphereGeometry(100, 96, 64);
      environmentGeometry.scale(-1, 1, 1);
      // The panorama sphere sits outside the whole stage, so scene fog would
      // otherwise fully fade it to the black clear color before it reaches the
      // camera. Keep fog on stage helpers, but never apply it to the authority
      // environment itself.
      environmentMaterial = new THREE.MeshBasicMaterial({
        depthWrite: false,
        fog: false,
        opacity: 0,
        transparent: true,
      });
      const environmentMesh = new THREE.Mesh(
        environmentGeometry,
        environmentMaterial,
      );
      environmentMesh.position.set(
        environment.position.x,
        environment.position.y,
        environment.position.z,
      );
      environmentMesh.rotation.y = THREE.MathUtils.degToRad(
        environment.yawOffsetDeg,
      );
      panoramaHelpers.add(environmentMesh);
      const textureLoader = new THREE.TextureLoader();
      void fetch(environment.url, { signal: environmentAbortController.signal })
        .then((response) => {
          if (!response.ok)
            throw new Error(`真实场景纹理读取失败（HTTP ${response.status}）`);
          return response.blob();
        })
        .then((blob) => {
          if (environmentAbortController.signal.aborted || !environmentMaterial)
            return;
          environmentTextureObjectUrl = URL.createObjectURL(blob);
          environmentTexture = textureLoader.load(
            environmentTextureObjectUrl,
            (loadedTexture) => {
              if (!environmentMaterial) return;
              loadedTexture.colorSpace = THREE.SRGBColorSpace;
              environmentMaterial.map = loadedTexture;
              environmentMaterial.opacity = 1;
              environmentMaterial.needsUpdate = true;
            },
          );
        })
        .catch((error) => {
          if (!environmentAbortController.signal.aborted)
            console.error("Failed to load director environment", error);
        });
    }

    {
      const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(stage.dimensions.width, stage.dimensions.depth),
        new THREE.MeshStandardMaterial({
          color: 0x111922,
          roughness: 0.95,
          metalness: 0.05,
        }),
      );
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(
        stage.dimensions.width / 2,
        0,
        stage.dimensions.depth / 2,
      );
      metricStageHelpers.add(floor);
      const grid = new THREE.GridHelper(
        Math.max(stage.dimensions.width, stage.dimensions.depth),
        Math.ceil(Math.max(stage.dimensions.width, stage.dimensions.depth)),
        0x31506a,
        0x1c2a36,
      );
      grid.position.set(
        stage.dimensions.width / 2,
        0.005,
        stage.dimensions.depth / 2,
      );
      metricStageHelpers.add(grid);
    }

    const ambient = new THREE.HemisphereLight(0xbfdcff, 0x18202a, 1.8);
    scene.add(ambient);
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(
      stage.dimensions.width * 0.4,
      stage.dimensions.height * 3,
      stage.dimensions.depth * 0.3,
    );
    scene.add(key);

    for (const object of stage.objects) {
      const objectState = selectedObjectStates.get(object.id);
      const effectiveVisible = objectState?.visible ?? object.visible;
      if (!effectiveVisible) continue;
      // A 2:1 panorama has appearance but no metric depth. Keep structural
      // proxies in a separate group so live panorama preview can stay clean,
      // while exported blocking plates can render the honest metre-scale stage.
      const isStructuralProxy = object.type !== "character" && object.type !== "prop";
      const objectTargetGroup = environment && isStructuralProxy
        ? semanticGeometryHelpers
        : objectHelpers;
      const isCameraControlOverlay =
        viewMode === "camera_first_person" && showShotControls;
      const isSelected =
        selected?.kind === "object" && selected.id === object.id;
      const material = new THREE.MeshStandardMaterial({
        color: object.color,
        roughness:
          object.type === "refrigerator"
            ? 0.2
            : object.type === "character"
              ? 0.45
              : 0.65,
        metalness: object.type === "refrigerator" ? 0.25 : 0.05,
        // A director-stage door marks a doorway/door plane, not an opaque wall.
        // Keeping it translucent lets camera views prove sight lines through an
        // open doorway while the orange semantic marker remains visible.
        transparent: isCameraControlOverlay || object.type === "door",
        opacity: isCameraControlOverlay
          ? 0.55
          : object.type === "door"
            ? 0.2
            : 1,
        depthWrite: !isCameraControlOverlay && object.type !== "door",
        depthTest: !isCameraControlOverlay,
        side: object.type === "door" ? THREE.DoubleSide : THREE.FrontSide,
        emissive: isSelected
          ? new THREE.Color(object.color).multiplyScalar(0.24)
          : new THREE.Color(0x000000),
      });
      const position = objectState?.position ?? object.position;
      const rotation = objectState?.rotation ?? object.rotation;
      const jointAngles = objectState?.jointAngles ?? object.jointAngles;
      if (object.type === "character") {
        // Identity-free Role-A mannequin for blocking; face/costume stay on bound character assets.
        const uniformScale = Math.max(0.01, object.uniformScale ?? 1);
        const mannequin = createRoleAMannequin(
          material,
          {
            x: object.size.x,
            y: object.size.y,
            z: object.size.z,
          },
          isSelected,
          object.label.replace(/^S\d+/, "") || object.label,
          jointAngles,
        );
        mannequin.name = object.label;
        mannequin.userData.directorObjectId = object.id;
        mannequin.traverse((child) => {
          child.renderOrder = isCameraControlOverlay ? 10 : 0;
          if ((child as THREE.Mesh).isMesh) {
            child.userData.directorObjectId = object.id;
          }
        });
        mannequin.position.set(position.x, position.y, position.z);
        mannequin.rotation.set(
          THREE.MathUtils.degToRad(
            rotation.x +
              Number(
                jointAngles?.body?.pitch ??
                  jointAngles?.body?.bend ??
                  0,
              ),
          ),
          THREE.MathUtils.degToRad(
            rotation.y +
              Number(
                jointAngles?.body?.yaw ??
                  jointAngles?.body?.turn ??
                  0,
              ),
          ),
          THREE.MathUtils.degToRad(
            rotation.z +
              Number(
                jointAngles?.body?.roll ??
                  jointAngles?.body?.tilt ??
                  0,
              ),
          ),
        );
        const scale = object.scale ?? {
          x: uniformScale,
          y: uniformScale,
          z: uniformScale,
        };
        mannequin.scale.set(scale.x, scale.y, scale.z);
        objectTargetGroup.add(mannequin);
        if (isSelected) {
          const outline = new THREE.BoxHelper(mannequin, 0xffffff);
          objectTargetGroup.add(outline);
        }
      } else {
        const geometry = new THREE.BoxGeometry(
          object.size.x,
          object.size.y,
          object.size.z,
        );
        const mesh = new THREE.Mesh(geometry, material);
        mesh.renderOrder = isCameraControlOverlay ? 10 : 0;
        mesh.name = object.label;
        mesh.userData.directorObjectId = object.id;
        mesh.userData.directorSemanticSolid = isStructuralProxy;
        mesh.position.set(position.x, position.y, position.z);
        mesh.rotation.set(
          THREE.MathUtils.degToRad(rotation.x),
          THREE.MathUtils.degToRad(rotation.y),
          THREE.MathUtils.degToRad(rotation.z),
        );
        objectTargetGroup.add(mesh);
        if (isStructuralProxy) {
          const edges = new THREE.LineSegments(
            new THREE.EdgesGeometry(geometry),
            new THREE.LineBasicMaterial({
              color: object.color,
              transparent: true,
              opacity: 0.64,
            }),
          );
          edges.name = `${object.label} 线框`;
          edges.userData.directorObjectId = object.id;
          edges.userData.directorSemanticEdges = true;
          edges.position.copy(mesh.position);
          edges.rotation.copy(mesh.rotation);
          edges.visible = isCameraControlOverlay;
          objectTargetGroup.add(edges);
        }
        if (isSelected) {
          const outline = new THREE.BoxHelper(mesh, 0xffffff);
          objectTargetGroup.add(outline);
        }
      }
    }

    if (
      (viewMode === "edit" || viewMode === "top_2_5d") &&
      selected?.kind === "object"
    ) {
      const object = stage.objects.find((candidate) => candidate.id === selected.id);
      const objectState = object ? selectedObjectStates.get(object.id) : undefined;
      if (
        object &&
        (objectState?.visible ?? object.visible) &&
        !object.locked
      ) {
        objectHelpers.add(createTranslationGizmo(object, objectState?.position ?? object.position));
      }
    }

    for (const route of stage.routes) {
      if (route.points.length < 2) continue;
      const routeGroup = new THREE.Group();
      routeGroup.userData.directorRouteId = route.id;
      routeHelpers.add(routeGroup);
      const routeObjectState = route.objectId
        ? selectedObjectStates.get(route.objectId)
        : undefined;
      if (
        viewMode === "camera_first_person" &&
        route.objectId &&
        routeObjectState?.visible === false
      )
        continue;
      const geometry = new THREE.BufferGeometry().setFromPoints(
        route.points.map(
          (point) => new THREE.Vector3(point.x, point.y + 0.04, point.z),
        ),
      );
      const line = new THREE.Line(
        geometry,
        new THREE.LineBasicMaterial({ color: route.color }),
      );
      routeGroup.add(line);
      const tail = route.points[route.points.length - 2]!;
      const head = route.points[route.points.length - 1]!;
      const arrowOrigin = new THREE.Vector3(tail.x, tail.y + 0.04, tail.z);
      const arrowDirection = new THREE.Vector3(
        head.x - tail.x,
        head.y - tail.y,
        head.z - tail.z,
      );
      const arrowLength = arrowDirection.length();
      if (arrowLength > 0.001) {
        const arrow = new THREE.ArrowHelper(
          arrowDirection.normalize(),
          arrowOrigin,
          arrowLength,
          route.color,
          Math.min(0.2, arrowLength * 0.32),
          Math.min(0.12, arrowLength * 0.2),
        );
        routeGroup.add(arrow);
      }
      if (viewMode === "camera_first_person" && route.type === "camera")
        continue;
      for (const point of route.points) {
        const markerRadius =
          viewMode === "camera_first_person" ? 0.035 : 0.1;
        const marker = new THREE.Mesh(
          new THREE.SphereGeometry(markerRadius, 12, 8),
          new THREE.MeshBasicMaterial({ color: route.color }),
        );
        marker.position.set(point.x, point.y + 0.04, point.z);
        routeGroup.add(marker);
      }
    }

    for (const cameraSpec of stage.cameras) {
      const helperTarget = cameraSpec.lookAt ?? cameraSpec.target;
      const targetDistance = Math.hypot(
        helperTarget.x - cameraSpec.position.x,
        helperTarget.y - cameraSpec.position.y,
        helperTarget.z - cameraSpec.position.z,
      );
      const isActiveHelper = cameraSpec.id === selectedCameraId;
      const helperDepth = isActiveHelper
        ? Math.max(1.8, Math.min(4, targetDistance * 0.48))
        : Math.max(0.9, Math.min(1.6, targetDistance * 0.2));
      const helperCamera = stageCamera(cameraSpec, 16 / 9, undefined, helperDepth);
      const helper = new THREE.CameraHelper(helperCamera);
      // The large frustum lines are visual only. Making the whole CameraHelper
      // pickable causes ordinary empty-space orbit drags to move the shot camera
      // whenever the pointer happens to cross one of its long guide lines.
      helper.visible = viewMode !== "camera_first_person";
      helper.material.transparent = true;
      helper.material.opacity = isActiveHelper ? 0.82 : 0.2;
      helper.renderOrder = isActiveHelper ? 72 : 68;
      cameraHelpers.add(helper);
      const cameraHandle = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 14, 10),
        new THREE.MeshBasicMaterial({ color: 0xffd166, depthTest: false }),
      );
      cameraHandle.position.set(cameraSpec.position.x, cameraSpec.position.y, cameraSpec.position.z);
      cameraHandle.userData.directorCameraId = cameraSpec.id;
      cameraHandle.renderOrder = 70;
      cameraHelpers.add(cameraHandle);
      const targetMarker = new THREE.Mesh(
        new THREE.SphereGeometry(0.14, 12, 8),
        new THREE.MeshBasicMaterial({ color: 0xffa94d }),
      );
      targetMarker.position.set(helperTarget.x, helperTarget.y, helperTarget.z);
      targetMarker.userData.directorCameraTargetId = cameraSpec.id;
      cameraHelpers.add(targetMarker);
    }

    const editCamera = new THREE.PerspectiveCamera(52, 1, 0.05, 500);
    const topCamera = new THREE.OrthographicCamera(-8, 8, 8, -8, 0.05, 500);
    topCamera.position.set(
      stage.dimensions.width / 2,
      Math.max(stage.dimensions.width, stage.dimensions.depth) * 2.2,
      stage.dimensions.depth * 1.05,
    );
    topCamera.lookAt(
      stage.dimensions.width / 2,
      0,
      stage.dimensions.depth / 2,
    );
    topCamera.updateProjectionMatrix();
    const savedEditView = editViewRef.current;
    if (savedEditView) {
      editCamera.position.copy(savedEditView.position);
    } else {
      editCamera.position.set(
        stage.dimensions.width * 1.25,
        stage.dimensions.height * 3.2,
        stage.dimensions.depth * 1.25,
      );
    }
    const controls = new OrbitControls(editCamera, canvas);
    if (savedEditView) {
      controls.target.copy(savedEditView.target);
    } else {
      controls.target.set(
        stage.dimensions.width / 2,
        Math.max(1, stage.dimensions.height / 3),
        stage.dimensions.depth / 2,
      );
    }
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.update();
    const rememberEditView = () => {
      editViewRef.current = {
        position: editCamera.position.clone(),
        target: controls.target.clone(),
      };
    };
    controls.addEventListener("change", rememberEditView);
    const markGaussianViewDirty = () => {
      gaussianViewDirty = true;
    };
    controls.addEventListener("change", markGaussianViewDirty);
    rememberEditView();

    let activeCamera: THREE.PerspectiveCamera | THREE.OrthographicCamera =
      viewMode === "camera_first_person" && selectedCameraSpec
        ? stageCamera(
            selectedCameraSpec,
            captureDimensions(selectedCameraSpec.aspectRatio).width /
              captureDimensions(selectedCameraSpec.aspectRatio).height,
            showShotControls ? undefined : environment,
          )
        : viewMode === "top_2_5d"
          ? topCamera
          : editCamera;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(320, Math.floor(rect.width));
      const height = Math.max(220, Math.floor(rect.height));
      renderer.setSize(width, height, false);
      if (activeCamera instanceof THREE.PerspectiveCamera) {
        activeCamera.aspect =
          viewMode === "camera_first_person" && selectedCameraSpec
            ? captureDimensions(selectedCameraSpec.aspectRatio).width /
              captureDimensions(selectedCameraSpec.aspectRatio).height
            : width / height;
      } else {
        const halfDepth = Math.max(
          stage.dimensions.width,
          stage.dimensions.depth,
        ) * 0.62;
        const aspect = width / height;
        activeCamera.left = -halfDepth * aspect;
        activeCamera.right = halfDepth * aspect;
        activeCamera.top = halfDepth;
        activeCamera.bottom = -halfDepth;
      }
      activeCamera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const raycaster = new THREE.Raycaster();
    raycaster.params.Line.threshold = 0.14;
    const pointer = new THREE.Vector2();
    const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const dragPoint = new THREE.Vector3();
    const dragOffset = new THREE.Vector3();
    let draggingObjectId: string | undefined;
    let draggingCameraId: string | undefined;
    let draggingCameraTargetId: string | undefined;
    let draggingAxis: TranslationAxis | undefined;
    let draggingPointerId: number | undefined;
    let pendingDragPosition: DirectorStageVector3 | undefined;
    let axisDragOrigin: DirectorStageVector3 | undefined;
    const axisPointerStart = new THREE.Vector2();
    const axisScreenDirection = new THREE.Vector2();
    let axisPixelsPerUnit = 1;
    const pointerCoordinates = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, activeCamera);
    };
    const objectHitAt = (event: PointerEvent) => {
      pointerCoordinates(event);
      return raycaster
        .intersectObjects(scene.children, true)
        .find(
          (entry) => typeof entry.object.userData.directorObjectId === "string",
        );
    };
    const gizmoHitAt = (event: PointerEvent) => {
      pointerCoordinates(event);
      return raycaster
        .intersectObjects(objectHelpers.children, true)
        .find(
          (entry) =>
            typeof entry.object.userData.directorTranslateAxis === "string" &&
            typeof entry.object.userData.directorTranslateObjectId === "string",
        );
    };
    const cameraHitAt = (event: PointerEvent) => {
      pointerCoordinates(event);
      return raycaster
        .intersectObjects(cameraHelpers.children, true)
        .find(
          (entry) => typeof entry.object.userData.directorCameraId === "string",
        );
    };
    const cameraTargetHitAt = (event: PointerEvent) => {
      pointerCoordinates(event);
      return raycaster
        .intersectObjects(cameraHelpers.children, true)
        .find(
          (entry) =>
            typeof entry.object.userData.directorCameraTargetId === "string",
        );
    };
    const worldPointAt = (event: PointerEvent) => {
      pointerCoordinates(event);
      return raycaster.ray.intersectPlane(dragPlane, dragPoint)
        ? dragPoint.clone()
        : undefined;
    };
    const pointerDown = (event: PointerEvent) => {
      if (viewMode === "camera_first_person") return;
      const gizmoMatch = gizmoHitAt(event);
      const objectMatch = gizmoMatch ? undefined : objectHitAt(event);
      const targetMatch = objectMatch ? undefined : cameraTargetHitAt(event);
      const cameraMatch =
        objectMatch || targetMatch ? undefined : cameraHitAt(event);
      const objectId = (gizmoMatch?.object.userData.directorTranslateObjectId ??
        objectMatch?.object.userData.directorObjectId) as string | undefined;
      const translateAxis = gizmoMatch?.object.userData.directorTranslateAxis as
        TranslationAxis | undefined;
      const cameraTargetId = targetMatch?.object.userData
        .directorCameraTargetId as string | undefined;
      const cameraId = cameraMatch?.object.userData.directorCameraId as
        string | undefined;
      if (!objectId && !cameraId && !cameraTargetId) return;
      const object = objectId
        ? stage.objects.find((candidate) => candidate.id === objectId)
        : undefined;
      const camera =
        (cameraId ?? cameraTargetId)
          ? stage.cameras.find(
              (candidate) => candidate.id === (cameraId ?? cameraTargetId),
            )
          : undefined;
      // Locked objects/cameras remain selectable but cannot be moved.
      if (
        (!objectId && !camera) ||
        (object && object.locked) ||
        (camera && camera.locked)
      ) {
        if (objectId)
          interactionCallbacksRef.current.onSelectObject(objectId);
        else if (cameraId || cameraTargetId)
          interactionCallbacksRef.current.onSelectCamera(
            cameraId ?? cameraTargetId!,
          );
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      const draggedId = objectId ?? cameraId ?? cameraTargetId;
      if (!draggedId) return;
      const origin =
        object?.position ??
        (cameraTargetId
          ? (camera?.lookAt ?? camera?.target)
          : camera?.position);
      if (!origin) return;
      if (translateAxis && object) {
        const rect = canvas.getBoundingClientRect();
        const axisVector = new THREE.Vector3(
          translateAxis === "x" ? 1 : 0,
          translateAxis === "y" ? 1 : 0,
          translateAxis === "z" ? 1 : 0,
        );
        const projectedOrigin = new THREE.Vector3(origin.x, origin.y, origin.z).project(activeCamera);
        const projectedEnd = new THREE.Vector3(origin.x, origin.y, origin.z)
          .add(axisVector)
          .project(activeCamera);
        axisScreenDirection.set(
          ((projectedEnd.x - projectedOrigin.x) * rect.width) / 2,
          (-(projectedEnd.y - projectedOrigin.y) * rect.height) / 2,
        );
        axisPixelsPerUnit = axisScreenDirection.length();
        if (axisPixelsPerUnit < 1) return;
        axisScreenDirection.normalize();
        axisPointerStart.set(event.clientX, event.clientY);
        axisDragOrigin = { ...origin };
        draggingAxis = translateAxis;
        draggingObjectId = objectId;
        draggingPointerId = event.pointerId;
        pendingDragPosition = { ...origin };
        canvas.setPointerCapture(event.pointerId);
        canvas.style.cursor = translateAxis === "y" ? "ns-resize" : "grabbing";
        controls.enabled = false;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      const planeY =
        object?.position.y ??
        (cameraTargetId
          ? (camera?.lookAt ?? camera?.target)?.y
          : camera?.position.y) ??
        0;
      dragPlane.set(new THREE.Vector3(0, 1, 0), -planeY);
      const point = worldPointAt(event);
      if (!point) return;
      dragOffset.set(origin.x - point.x, 0, origin.z - point.z);
      draggingObjectId = objectId;
      draggingCameraId = cameraId;
      draggingCameraTargetId = cameraTargetId;
      draggingPointerId = event.pointerId;
      pendingDragPosition = { ...origin };
      canvas.setPointerCapture(event.pointerId);
      canvas.style.cursor = "grabbing";
      controls.enabled = false;
      event.preventDefault();
      event.stopPropagation();
    };
    const pointerMove = (event: PointerEvent) => {
      if (
        (!draggingObjectId && !draggingCameraId && !draggingCameraTargetId) ||
        draggingPointerId !== event.pointerId
      )
        return;
      const object = draggingObjectId
        ? stage.objects.find((candidate) => candidate.id === draggingObjectId)
        : undefined;
      const camera = draggingCameraId
        ? stage.cameras.find((candidate) => candidate.id === draggingCameraId)
        : undefined;
      const targetCamera = draggingCameraTargetId
        ? stage.cameras.find(
            (candidate) => candidate.id === draggingCameraTargetId,
          )
        : undefined;
      const subjectPosition = targetCamera
        ? (targetCamera.lookAt ?? targetCamera.target)
        : undefined;
      const subject =
        object ??
        camera ??
        (subjectPosition ? { position: subjectPosition } : undefined);
      if (!subject) return;
      let next: DirectorStageVector3;
      if (draggingAxis && axisDragOrigin) {
        const pointerDelta = new THREE.Vector2(
          event.clientX - axisPointerStart.x,
          event.clientY - axisPointerStart.y,
        );
        const distance = pointerDelta.dot(axisScreenDirection) / axisPixelsPerUnit;
        next = {
          x: axisDragOrigin.x + (draggingAxis === "x" ? distance : 0),
          y: axisDragOrigin.y + (draggingAxis === "y" ? distance : 0),
          z: axisDragOrigin.z + (draggingAxis === "z" ? distance : 0),
        };
      } else {
        const point = worldPointAt(event);
        if (!point) return;
        next = {
          x: point.x + dragOffset.x,
          y: subject.position.y,
          z: point.z + dragOffset.z,
        };
      }
      pendingDragPosition = next;
      // Move the rendered mesh immediately. React state is committed only on
      // pointer-up so the Three.js scene is not rebuilt on every mouse move.
      const visual = draggingObjectId
        ? objectHelpers.children.find(
            (child) => child.userData.directorObjectId === draggingObjectId,
          )
        : draggingCameraTargetId
          ? cameraHelpers.children.find(
              (child) =>
                child.userData.directorCameraTargetId ===
                draggingCameraTargetId,
            )
          : cameraHelpers.children.find(
              (child) => child.userData.directorCameraId === draggingCameraId,
            );
      if (visual) {
        if (draggingCameraId && visual.matrixAutoUpdate === false) {
          // THREE.CameraHelper stores its camera transform in a frozen matrix,
          // so moving `.position` alone would not move the visible frustum.
          visual.matrix.setPosition(next.x, next.y, next.z);
          visual.matrixWorldNeedsUpdate = true;
        } else {
          visual.position.set(next.x, next.y, next.z);
        }
      }
      if (draggingObjectId && object) {
        const gizmo = objectHelpers.children.find(
          (child) => child.userData.directorTransformGizmoObjectId === draggingObjectId,
        );
        if (gizmo) {
          const scaleY = object.scale?.y ?? object.uniformScale ?? 1;
          gizmo.position.set(next.x, next.y - (object.size.y * scaleY) / 2 + 0.035, next.z);
        }
      }
      event.preventDefault();
      event.stopPropagation();
    };
    const pointerUp = (event: PointerEvent) => {
      if (
        (!draggingObjectId && !draggingCameraId && !draggingCameraTargetId) ||
        draggingPointerId !== event.pointerId
      )
        return;
      const objectId = draggingObjectId;
      const cameraId = draggingCameraId;
      const cameraTargetId = draggingCameraTargetId;
      const position = pendingDragPosition;
      draggingObjectId = undefined;
      draggingCameraId = undefined;
      draggingCameraTargetId = undefined;
      draggingAxis = undefined;
      axisDragOrigin = undefined;
      draggingPointerId = undefined;
      pendingDragPosition = undefined;
      controls.enabled = viewMode === "edit";
      canvas.style.cursor = "";
      if (canvas.hasPointerCapture(event.pointerId))
        canvas.releasePointerCapture(event.pointerId);
      if (objectId) interactionCallbacksRef.current.onSelectObject(objectId);
      else if (cameraId || cameraTargetId)
        interactionCallbacksRef.current.onSelectCamera(cameraId ?? cameraTargetId!);
      if (position && objectId)
        interactionCallbacksRef.current.onMoveObject(objectId, position);
      if (position && cameraId)
        interactionCallbacksRef.current.onMoveCamera(cameraId, position);
      if (position && cameraTargetId)
        interactionCallbacksRef.current.onMoveCameraTarget(cameraTargetId, position);
      event.preventDefault();
      event.stopPropagation();
    };
    const pointerCancel = (event: PointerEvent) => {
      if (
        (!draggingObjectId && !draggingCameraId && !draggingCameraTargetId) ||
        draggingPointerId !== event.pointerId
      )
        return;
      draggingObjectId = undefined;
      draggingCameraId = undefined;
      draggingCameraTargetId = undefined;
      draggingAxis = undefined;
      axisDragOrigin = undefined;
      draggingPointerId = undefined;
      pendingDragPosition = undefined;
      controls.enabled = viewMode === "edit";
      canvas.style.cursor = "";
      if (canvas.hasPointerCapture(event.pointerId))
        canvas.releasePointerCapture(event.pointerId);
    };
    canvas.addEventListener("pointerdown", pointerDown, true);
    canvas.addEventListener("pointermove", pointerMove, true);
    canvas.addEventListener("pointerup", pointerUp, true);
    canvas.addEventListener("pointercancel", pointerCancel, true);
    let frame = 0;
    const render = () => {
      controls.enabled =
        viewMode === "edit" &&
        !draggingObjectId &&
        !draggingCameraId &&
        !draggingCameraTargetId;
      if (controls.enabled) controls.update();
      const controlsVisible =
        viewMode !== "camera_first_person" || showShotControls;
      const equirectMetricControlView =
        environment?.projection === "equirectangular" &&
        (viewMode !== "camera_first_person" ||
          showShotControls ||
          showSemanticGeometry);
      // A pure 3D director stage has no panorama behind it. In camera mode its
      // semantic room and mannequins are the actual storyboard plate, so they
      // must remain visible even when route/control overlays are hidden.
      objectHelpers.visible = !environment || controlsVisible;
      metricStageHelpers.visible = !environment || showSemanticGeometry || equirectMetricControlView;
      panoramaHelpers.visible = !equirectMetricControlView;
      routeHelpers.visible = controlsVisible;
      semanticGeometryHelpers.visible = !environment || showSemanticGeometry || equirectMetricControlView;
      cameraHelpers.visible = viewMode !== "camera_first_person";
      if (sparkRenderer && splatMesh?.isInitialized && gaussianViewDirty) {
        scene.updateMatrixWorld(true);
        activeCamera.updateMatrixWorld(true);
        sparkRenderer.update({ scene, viewToWorld: activeCamera.matrixWorld });
        gaussianViewDirty = false;
      }
      if (
        viewMode === "camera_first_person" &&
        selectedCameraSpec
      ) {
        const rect = canvas.getBoundingClientRect();
        const canvasWidth = Math.max(320, Math.floor(rect.width));
        const canvasHeight = Math.max(220, Math.floor(rect.height));
        const ratio =
          captureDimensions(selectedCameraSpec.aspectRatio).width /
          captureDimensions(selectedCameraSpec.aspectRatio).height;
        const viewportWidth = Math.min(canvasWidth, canvasHeight * ratio);
        const viewportHeight = viewportWidth / ratio;
        const viewportX = Math.floor((canvasWidth - viewportWidth) / 2);
        const viewportY = Math.floor((canvasHeight - viewportHeight) / 2);
        renderer.setScissorTest(true);
        renderer.setScissor(0, 0, canvasWidth, canvasHeight);
        renderer.setViewport(0, 0, canvasWidth, canvasHeight);
        renderer.clear();
        renderer.setScissor(
          viewportX,
          viewportY,
          Math.floor(viewportWidth),
          Math.floor(viewportHeight),
        );
        renderer.setViewport(
          viewportX,
          viewportY,
          Math.floor(viewportWidth),
          Math.floor(viewportHeight),
        );
      } else {
        renderer.setScissorTest(false);
        const size = renderer.getSize(new THREE.Vector2());
        renderer.setViewport(0, 0, size.x, size.y);
      }
      renderer.render(scene, activeCamera);
      frame = window.requestAnimationFrame(render);
    };
    frame = window.requestAnimationFrame(render);
    runtimeRef.current = {
      renderer,
      scene,
      cameraHelpers,
      metricStageHelpers,
      objectHelpers,
      panoramaHelpers,
      routeHelpers,
      semanticGeometryHelpers,
    };

    return () => {
      rememberEditView();
      controls.removeEventListener("change", rememberEditView);
      controls.removeEventListener("change", markGaussianViewDirty);
      runtimeRef.current = undefined;
      window.cancelAnimationFrame(frame);
      canvas.removeEventListener("pointerdown", pointerDown, true);
      canvas.removeEventListener("pointermove", pointerMove, true);
      canvas.removeEventListener("pointerup", pointerUp, true);
      canvas.removeEventListener("pointercancel", pointerCancel, true);
      observer.disconnect();
      controls.dispose();
      environmentAbortController.abort();
      environmentTexture?.dispose();
      splatMesh?.dispose();
      sparkRenderer?.dispose?.();
      if (environmentTextureObjectUrl)
        URL.revokeObjectURL(environmentTextureObjectUrl);
      scene.traverse((object) => {
        if (object.userData.directorSplatRuntime) return;
        if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material)
            ? object.material
            : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
      renderer.dispose();
    };
  }, [
    selected,
    selectedCameraId,
    showSemanticGeometry,
    showShotControls,
    stage,
    viewMode,
  ]);

  useImperativeHandle(
    ref,
    () => ({
      capture(cameraId, options) {
        const runtime = runtimeRef.current;
        const canvas = canvasRef.current;
        const spec = stage.cameras.find((camera) => camera.id === cameraId);
        if (!runtime || !canvas || !spec) return undefined;
        const output = captureDimensions(spec.aspectRatio);
        const authorityEnvironment =
          stage.environment?.anchors.find(
            (anchor) => anchor.id === stage.environment?.activeAnchorId,
          ) ?? stage.environment?.anchors[0];
        const compositionEnvironment = stage.compositionData?.environment;
        const environment = authorityEnvironment ?? compositionEnvironmentAnchor(compositionEnvironment);
        const captureSpec = Number.isFinite(options?.fov)
          ? { ...spec, fov: Math.max(20, Math.min(120, Number(options?.fov))) }
          : spec;
        const metricPanoramaPlate = environment?.projection === "equirectangular";
        const camera = stageCamera(
          captureSpec,
          output.width / output.height,
          metricPanoramaPlate ? undefined : environment,
        );
        const objectStates = new globalThis.Map(
          (spec.objectStates ?? []).map((state) => [state.objectId, state]),
        );
        const expectedCharacters = stage.objects.filter(
          (object) =>
            object.type === "character" &&
            (objectStates.get(object.id)?.visible ?? object.visible),
        );
        const outsideFrame = expectedCharacters.filter(
          (object) =>
            directorObjectRequiresFullFrame(spec, object.id) &&
            !objectFitsCameraFrame(object, objectStates.get(object.id), camera),
        );
        if (outsideFrame.length > 0) {
          throw new Error(
            `调度底图拒绝导出：${outsideFrame
              .map((object) => object.label.replace(/^S\d+/, ""))
              .join("、")}未完整进入画幅。`,
          );
        }
        const crossedPortalIds = new Set(
          stage.objects
            .filter((object) =>
              cameraCrossesDoorPortal(object, objectStates.get(object.id), captureSpec),
            )
            .map((object) => object.id),
        );
        const semanticObjectsById = new globalThis.Map(
          stage.objects.map((object) => [object.id, object]),
        );
        const previousPixelRatio = runtime.renderer.getPixelRatio();
        const previousSize = runtime.renderer.getSize(new THREE.Vector2());
        const previousCameraHelperVisibility = runtime.cameraHelpers.visible;
        const previousMetricStageVisibility = runtime.metricStageHelpers.visible;
        const previousObjectHelperVisibility = runtime.objectHelpers.visible;
        const previousPanoramaVisibility = runtime.panoramaHelpers.visible;
        const previousRouteHelperVisibility = runtime.routeHelpers.visible;
        const previousSemanticGeometryVisibility = runtime.semanticGeometryHelpers.visible;
        const previousSemanticChildVisibility: Array<{
          child: THREE.Object3D;
          visible: boolean;
        }> = [];
        const previousSemanticMaterialStates: Array<{
          material: THREE.MeshStandardMaterial;
          transparent: boolean;
          opacity: number;
          depthWrite: boolean;
        }> = [];
        const previousRouteItemVisibility = runtime.routeHelpers.children.map((child) => child.visible);
        runtime.cameraHelpers.visible = false;
        // A single 2:1 panorama is not metric 3D and cannot stay registered
        // under camera translation. Export an honest metre-scale control plate
        // and keep the panorama as a separate appearance reference instead of
        // compositing a visually plausible but spatially false background.
        runtime.metricStageHelpers.visible = metricPanoramaPlate || previousMetricStageVisibility;
        runtime.objectHelpers.visible = true;
        runtime.panoramaHelpers.visible = !metricPanoramaPlate;
        runtime.routeHelpers.visible = true;
        runtime.semanticGeometryHelpers.visible = metricPanoramaPlate || previousSemanticGeometryVisibility;
        // Structural proxies are constraints with different physical meaning.
        // Camera-crossed portals disappear; other doors remain as openings;
        // counters, walls and stairs keep their solid blocking volume.
        runtime.semanticGeometryHelpers.traverse((child) => {
          if (
            !child.userData.directorSemanticSolid &&
            !child.userData.directorSemanticEdges
          )
            return;
          previousSemanticChildVisibility.push({ child, visible: child.visible });
          const objectId = String(child.userData.directorObjectId || "");
          const semanticObject = semanticObjectsById.get(objectId);
          const isDoor = semanticObject?.type === "door";
          const isCrossedPortal = crossedPortalIds.has(objectId);
          if (child.userData.directorSemanticSolid) {
            child.visible = !isCrossedPortal && !isDoor;
            if (child.visible && child instanceof THREE.Mesh) {
              const materials = Array.isArray(child.material)
                ? child.material
                : [child.material];
              materials.forEach((material) => {
                if (!(material instanceof THREE.MeshStandardMaterial)) return;
                previousSemanticMaterialStates.push({
                  material,
                  transparent: material.transparent,
                  opacity: material.opacity,
                  depthWrite: material.depthWrite,
                });
                material.transparent = false;
                material.opacity = 1;
                material.depthWrite = true;
                material.needsUpdate = true;
              });
            }
          } else {
            child.visible = !isCrossedPortal && isDoor;
          }
        });
        const visibleRouteIds = new Set(spec.routeIds ?? stage.routes.map((route) => route.id));
        runtime.routeHelpers.children.forEach((child) => {
          const routeId = String(child.userData.directorRouteId || "");
          child.visible = !routeId || visibleRouteIds.has(routeId);
        });
        runtime.renderer.setPixelRatio(1);
        runtime.renderer.setSize(output.width, output.height, false);
        runtime.renderer.render(runtime.scene, camera);
        const annotatedCanvas = document.createElement("canvas");
        annotatedCanvas.width = output.width;
        annotatedCanvas.height = output.height;
        const annotatedContext = annotatedCanvas.getContext("2d");
        if (!annotatedContext) return undefined;
        annotatedContext.drawImage(runtime.renderer.domElement, 0, 0);
        // The canvas node already carries the full shot title. Keep the plate
        // image itself clean: object labels and route geometry do the work, so
        // only a compact technical badge remains in-frame.
        annotatedContext.fillStyle = "rgba(7, 12, 18, 0.72)";
        annotatedContext.fillRect(output.width - 188, 16, 172, 34);
        annotatedContext.fillStyle = metricPanoramaPlate ? "#ffb19f" : "#9edbc1";
        annotatedContext.font = "600 15px system-ui, sans-serif";
        annotatedContext.textAlign = "center";
        annotatedContext.textBaseline = "middle";
        annotatedContext.fillText(
          metricPanoramaPlate ? "米制调度 · 全景独立" : "真实 3D 调度",
          output.width - 102,
          33,
        );
        const dataUrl = annotatedCanvas.toDataURL("image/png");
        const width = runtime.renderer.domElement.width;
        const height = runtime.renderer.domElement.height;
        runtime.renderer.setPixelRatio(previousPixelRatio);
        runtime.renderer.setSize(previousSize.x, previousSize.y, false);
        runtime.cameraHelpers.visible = previousCameraHelperVisibility;
        runtime.metricStageHelpers.visible = previousMetricStageVisibility;
        runtime.objectHelpers.visible = previousObjectHelperVisibility;
        runtime.panoramaHelpers.visible = previousPanoramaVisibility;
        runtime.routeHelpers.visible = previousRouteHelperVisibility;
        runtime.semanticGeometryHelpers.visible = previousSemanticGeometryVisibility;
        previousSemanticChildVisibility.forEach((state) => {
          state.child.visible = state.visible;
        });
        previousSemanticMaterialStates.forEach((state) => {
          state.material.transparent = state.transparent;
          state.material.opacity = state.opacity;
          state.material.depthWrite = state.depthWrite;
          state.material.needsUpdate = true;
        });
        runtime.routeHelpers.children.forEach((child, index) => {
          child.visible = previousRouteItemVisibility[index] ?? true;
        });
        return { dataUrl, width, height };
      },
    }),
    [stage, viewMode],
  );

  return (
    <canvas
      aria-label="导演台三维空间"
      className="director-console-canvas"
      ref={canvasRef}
    />
  );
});

function NumberField({
  label,
  value,
  onChange,
  step = 0.1,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
}) {
  return (
    <label>
      <span>{label}</span>
      <input
        value={Number.isFinite(value) ? value : 0}
        step={step}
        type="number"
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function VectorFields({
  label,
  value,
  onChange,
}: {
  label: string;
  value: DirectorStageVector3;
  onChange: (value: DirectorStageVector3) => void;
}) {
  return (
    <fieldset className="director-vector-fields">
      <legend>{label}</legend>
      <NumberField
        label="X"
        value={value.x}
        onChange={(x) => onChange({ ...value, x })}
      />
      <NumberField
        label="Y"
        value={value.y}
        onChange={(y) => onChange({ ...value, y })}
      />
      <NumberField
        label="Z"
        value={value.z}
        onChange={(z) => onChange({ ...value, z })}
      />
    </fieldset>
  );
}

function CharacterDirectControls({
  camera,
  object,
  onChange,
}: {
  camera?: DirectorStageCamera;
  object: DirectorStageObject;
  onChange: (object: DirectorStageObject) => void;
}) {
  const turn = (delta: number) =>
    onChange({
      ...object,
      rotation: {
        ...object.rotation,
        y: ((object.rotation.y + delta + 540) % 360) - 180,
      },
    });
  const faceCamera = () => {
    if (!camera) return;
    const yaw = THREE.MathUtils.radToDeg(
      Math.atan2(
        camera.position.x - object.position.x,
        camera.position.z - object.position.z,
      ),
    );
    onChange({ ...object, rotation: { ...object.rotation, y: yaw } });
  };
  const applyPose = (preset: (typeof POSE_PRESETS)[number]) =>
    onChange({
      ...object,
      pose: preset.id,
      jointAngles: JSON.parse(JSON.stringify(preset.joints)) as Record<
        string,
        Record<string, number>
      >,
    });
  return (
    <div className="director-character-controls">
      <strong>人物朝向</strong>
      <div className="director-rotation-buttons">
        <button onClick={() => turn(-15)} type="button">
          左转 15°
        </button>
        <button onClick={() => turn(15)} type="button">
          右转 15°
        </button>
        <button onClick={() => turn(180)} type="button">
          转身 180°
        </button>
        <button disabled={!camera} onClick={faceCamera} type="button">
          面向机位
        </button>
      </div>
      <strong>姿势预设</strong>
      <div className="director-pose-buttons">
        {POSE_PRESETS.map((preset) => (
          <button
            className={object.pose === preset.id ? "active" : ""}
            key={preset.id}
            onClick={() => applyPose(preset)}
            type="button"
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
}

async function readPanoramaFile(file: File) {
  if (!new Set(["image/png", "image/jpeg", "image/webp"]).has(file.type))
    throw new Error("请选择 PNG、JPEG 或 WebP 图片。");
  if (file.size > 25 * 1024 * 1024) throw new Error("全景图不能超过 25MB。");
  const objectUrl = URL.createObjectURL(file);
  try {
    const dimensions = await new Promise<{ width: number; height: number }>(
      (resolve, reject) => {
        const image = new window.Image();
        image.onload = () =>
          resolve({ width: image.naturalWidth, height: image.naturalHeight });
        image.onerror = () => reject(new Error("无法读取这张图片。"));
        image.src = objectUrl;
      },
    );
    if (dimensions.width < 512 || dimensions.height < 256)
      throw new Error("全景图分辨率至少需要 512×256。");
    if (Math.abs(dimensions.width / dimensions.height - 2) > 0.04)
      throw new Error(
        `这张图是 ${dimensions.width}×${dimensions.height}，请选择标准 2:1 等距柱状全景图。`,
      );
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () =>
        typeof reader.result === "string"
          ? resolve(reader.result)
          : reject(new Error("无法读取全景图。"));
      reader.onerror = () => reject(new Error("无法读取全景图。"));
      reader.readAsDataURL(file);
    });
    return { dataUrl, dimensions };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function emptyRoute(index: number): DirectorStageRoute {
  return {
    id: `route-${Date.now()}-${index}`,
    label: `人物路线 ${index + 1}`,
    type: "character",
    color: "#52d6ff",
    pathMode: "polyline",
    speedCurve: "linear",
    startMs: 0,
    endMs: 2000,
    points: [
      { x: 1, y: 0, z: 1, atMs: 0 },
      { x: 4, y: 0, z: 5, atMs: 1000 },
      { x: 8, y: 0, z: 10, atMs: 2000 },
    ],
  };
}

export function DirectorConsoleWorkspace({
  actions,
  node,
  onClose,
}: {
  actions: VideoP0Actions;
  node: CanvasNode;
  onClose: () => void;
}) {
  type CompletePlaybackEvidence = {
    playbackSessionId: string;
    startedAt: string;
    completedAt: string;
    sampleCount: number;
    maxObservedStepMs: number;
    manualSeekCount: number;
    intervals: Array<{ startSeconds: number; endSeconds: number }>;
  };
  type ActivePlaybackSession = Omit<CompletePlaybackEvidence, "completedAt" | "intervals">;
  const viewportRef = useRef<DirectorViewportHandle>(null);
  const panoramaInputRef = useRef<HTMLInputElement>(null);
  const sourceStage = node.directorStage;
  const [draft, setDraft] = useState<DirectorStageDocument | undefined>(() =>
    sourceStage ? cloneStage(sourceStage) : undefined,
  );
  const draftRef = useRef<DirectorStageDocument | undefined>(draft);
  const [selection, setSelection] = useState<Selection>();
  const [viewMode, setViewMode] = useState<ViewMode>("camera_first_person");
  const [showSemanticGeometry, setShowSemanticGeometry] = useState(
    () => sourceStage?.environment?.semanticGeometryVisibility === "always",
  );
  const [showShotControls, setShowShotControls] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [timelineCursorMs, setTimelineCursorMs] = useState(0);
  const [completePlaybackEvidence, setCompletePlaybackEvidence] = useState<CompletePlaybackEvidence>();
  const activePlaybackSessionRef = useRef<ActivePlaybackSession>();
  const historyRef = useRef<DirectorStageDocument[]>([]);
  const futureRef = useRef<DirectorStageDocument[]>([]);
  const [message, setMessage] = useState(() =>
    sourceStage?.environment?.mode === "panorama_equirectangular"
      ? "已加载 2:1 全景外观参考；它没有米制深度，调度底图将使用独立米制舞台。"
      : sourceStage?.environment
      ? "已加载真实 3D 场景权威；空间方块默认隐藏，只保留坐标控制。"
      : "结构数据保存在导演台节点；下游只使用导出的图片节点。",
  );

  useEffect(() => {
    if (!sourceStage || dirty) return;
    const next = cloneStage(sourceStage);
    draftRef.current = next;
    setDraft(next);
    historyRef.current = [];
    futureRef.current = [];
  }, [dirty, sourceStage]);

  const selectedObject =
    draft && selection?.kind === "object"
      ? draft.objects.find((object) => object.id === selection.id)
      : undefined;
  const selectedCamera =
    draft && selection?.kind === "camera"
      ? draft.cameras.find((camera) => camera.id === selection.id)
      : undefined;
  const selectedRoute =
    draft && selection?.kind === "route"
      ? draft.routes.find((route) => route.id === selection.id)
      : undefined;
  const selectedEnvironmentAnchor =
    draft && selection?.kind === "environment"
      ? draft.environment?.anchors.find((anchor) => anchor.id === selection.id)
      : undefined;
  const composition = draft?.compositionData;
  const evaluatedStage = useMemo(
    () => draft
      ? (draft.compositionData
          ? applyDirectorCompositionAtTime(draft, timelineCursorMs)
          : draft) as DirectorStageDocument
      : undefined,
    [draft, timelineCursorMs],
  );
  const activeCamera =
    evaluatedStage?.cameras.find(
      (camera) => camera.id === evaluatedStage.selectedCameraId,
    ) ?? evaluatedStage?.cameras[0];

  useEffect(() => {
    if (!isPlaying || !composition) return;
    const durationMs = Math.max(0, composition.playback.durationSeconds * 1000);
    if (!durationMs || !composition.readiness.playable) {
      setIsPlaying(false);
      return;
    }
    let frame = 0;
    let previous = performance.now();
    let cursor = timelineCursorMs;
    const advance = (now: number) => {
      const delta = Math.min(250, Math.max(0, now - previous));
      previous = now;
      cursor = Math.min(durationMs, cursor + delta);
      const activeSession = activePlaybackSessionRef.current;
      if (activeSession) {
        activeSession.sampleCount += 1;
        activeSession.maxObservedStepMs = Math.max(activeSession.maxObservedStepMs, delta);
      }
      setTimelineCursorMs(cursor);
      if (cursor >= durationMs) {
        if (activeSession && activeSession.manualSeekCount === 0) {
          setCompletePlaybackEvidence({
            ...activeSession,
            completedAt: new Date().toISOString(),
            intervals: [{ startSeconds: 0, endSeconds: durationMs / 1000 }],
          });
        }
        activePlaybackSessionRef.current = undefined;
        setIsPlaying(false);
      }
      else frame = window.requestAnimationFrame(advance);
    };
    frame = window.requestAnimationFrame(advance);
    return () => window.cancelAnimationFrame(frame);
  }, [composition, isPlaying]);

  const updateDraft = (
    updater: (current: DirectorStageDocument) => DirectorStageDocument,
  ) => {
    const current = draftRef.current;
    if (!current) return;
    const next = updater(current);
    historyRef.current = [
      ...historyRef.current.slice(-49),
      cloneStage(current),
    ];
    futureRef.current = [];
    draftRef.current = next;
    setDraft(next);
    setDirty(true);
  };
  const undo = () => {
    const current = draftRef.current;
    const previous = historyRef.current.pop();
    if (!current || !previous) return;
    futureRef.current = [
      cloneStage(current),
      ...futureRef.current.slice(0, 49),
    ];
    draftRef.current = previous;
    setDraft(previous);
    setDirty(true);
  };
  const redo = () => {
    const current = draftRef.current;
    const next = futureRef.current.shift();
    if (!current || !next) return;
    historyRef.current = [
      ...historyRef.current.slice(-49),
      cloneStage(current),
    ];
    draftRef.current = next;
    setDraft(next);
    setDirty(true);
  };
  const updateObject = (next: DirectorStageObject) =>
    updateDraft((current) => ({
      ...current,
      objects: current.objects.map((object) =>
        object.id === next.id ? next : object,
      ),
    }));
  const moveObject = (id: string, position: DirectorStageVector3) => {
    const object = draft?.objects.find((candidate) => candidate.id === id);
    if (object) updateObject({ ...object, position });
  };
  const moveCamera = (id: string, position: DirectorStageVector3) => {
    const camera = draft?.cameras.find((candidate) => candidate.id === id);
    if (camera) updateCamera({ ...camera, position });
  };
  const moveCameraTarget = (id: string, target: DirectorStageVector3) => {
    const camera = draft?.cameras.find((candidate) => candidate.id === id);
    if (camera) updateCamera({ ...camera, target, lookAt: target });
  };
  const updateCamera = (next: DirectorStageCamera) =>
    updateDraft((current) => ({
      ...current,
      selectedCameraId: next.id,
      cameras: current.cameras.map((camera) =>
        camera.id === next.id ? next : camera,
      ),
    }));
  const updateRoute = (next: DirectorStageRoute) =>
    updateDraft((current) => ({
      ...current,
      routes: current.routes.map((route) =>
        route.id === next.id ? next : route,
      ),
    }));
  const updateComposition = (
    updater: (
      current: NonNullable<DirectorStageDocument["compositionData"]>,
    ) => NonNullable<DirectorStageDocument["compositionData"]>,
  ) =>
    updateDraft((current) =>
      current.compositionData
        ? { ...current, compositionData: updater(current.compositionData) }
        : current,
    );
  const recordKeyframe = () => {
    if (!composition) return;
    const selectedId = selection?.id ?? activeCamera?.id;
    const trackKind =
      selection?.kind === "object"
        ? "characterTracks"
        : selection?.kind === "route"
          ? "motionPaths"
          : "cameraTracks";
    const targetTrackId =
      selection?.kind === "camera" ? selection.id : selectedId;
    updateComposition((current) => {
      const tracks = [...current.animation[trackKind]];
      let index = tracks.findIndex(
        (track) => (track.targetId ?? track.id) === targetTrackId,
      );
      if (index < 0) {
        tracks.push({
          id: `director-${trackKind}-${targetTrackId ?? Date.now()}`,
          name:
            selection?.kind === "object"
              ? (selectedObject?.label ?? "角色轨道")
              : selection?.kind === "camera"
                ? (selectedCamera?.label ?? "机位轨道")
                : "主机位",
          targetId: targetTrackId,
          keyframes: [],
          interpolation: "linear",
        });
        index = tracks.length - 1;
      }
      const keyframe: Record<string, unknown> = {
        id: `kf-${Date.now()}`,
        atMs: Math.max(
          0,
          Math.min(current.animation.duration * 1000, timelineCursorMs),
        ),
      };
      if (selectedObject) {
        keyframe.position = { ...selectedObject.position };
        keyframe.rotation = { ...selectedObject.rotation };
        keyframe.jointAngles = selectedObject.jointAngles ?? {};
      } else if (selectedCamera ?? activeCamera) {
        const camera = selectedCamera ?? activeCamera!;
        keyframe.position = { ...camera.position };
        keyframe.lookAt = { ...(camera.lookAt ?? camera.target) };
        keyframe.fov = camera.fov;
        keyframe.zoom = camera.zoom ?? 1;
      }
      const track = tracks[index];
      if (!track) return current;
      const keyframes = [
        ...track.keyframes.filter(
          (frame) =>
            Number(frame.atMs ?? frame.time ?? -1) !== Number(keyframe.atMs),
        ),
        keyframe,
      ].sort(
        (a, b) => Number(a.atMs ?? a.time ?? 0) - Number(b.atMs ?? b.time ?? 0),
      );
      tracks[index] = { ...track, keyframes };
      return {
        ...current,
        animation: {
          ...current.animation,
          [trackKind]: tracks,
          ...(trackKind === "cameraTracks"
            ? { activeCameraTrackId: track.id }
            : {}),
        },
      };
    });
  };

  const importPanorama = async (file?: File) => {
    if (!file || !draft) return;
    setBusy(true);
    setMessage("正在导入 2:1 全景图并绑定到当前导演台…");
    try {
      const { dataUrl, dimensions } = await readPanoramaFile(file);
      await Promise.resolve(
        actions.importDirectorStagePanorama(
          node.id,
          draft,
          sourceStage?.revision ?? draft.revision,
          dataUrl,
          file.name,
        ),
      );
      historyRef.current = [];
      futureRef.current = [];
      setDirty(false);
      setMessage(
        `已导入 ${file.name}（${dimensions.width}×${dimensions.height}）作为非度量外观参考；米制调度将独立导出。`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "全景图导入失败");
    } finally {
      setBusy(false);
      if (panoramaInputRef.current) panoramaInputRef.current.value = "";
    }
  };

  const save = async () => {
    if (!draft || !sourceStage) return;
    setBusy(true);
    setMessage("正在保存导演台结构…");
    try {
      await Promise.resolve(
        actions.updateDirectorStage(node.id, draft, sourceStage.revision),
      );
      setDirty(false);
      setMessage(`已保存空间修订 v${sourceStage.revision + 1}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "导演台保存失败");
      throw error;
    } finally {
      setBusy(false);
    }
  };

  const exportCamera = async (
    captureVariant:
      | "blocking_plate"
      | "composited_previs_frame" = "blocking_plate",
  ) => {
    if (!draft || !activeCamera) return;
    if (
      captureVariant === "composited_previs_frame" &&
      !composition?.readiness.playable
    ) {
      setMessage("当前 composition 缺少完整真实路径，禁止导出伪合成预演帧。");
      return;
    }
    setBusy(true);
    setMessage(
      captureVariant === "composited_previs_frame"
        ? `正在导出 ${(timelineCursorMs / 1000).toFixed(2)}s 的逐帧合成预演…`
        : "正在导出米制人物、机位与站位调度底图…",
    );
    try {
      if (dirty)
        await Promise.resolve(
          actions.updateDirectorStage(
            node.id,
            draft,
            sourceStage?.revision ?? draft.revision,
          ),
        );
      const capture = viewportRef.current?.capture(activeCamera.id);
      if (!capture) throw new Error("当前三维视口尚未准备好。");
      await Promise.resolve(
        actions.exportDirectorStageCamera(
          node.id,
          activeCamera.id,
          capture.dataUrl,
          capture.width,
          capture.height,
          activeCamera.captureTimeMs ?? timelineCursorMs,
          captureVariant,
        ),
      );
      setDirty(false);
      setMessage(
        captureVariant === "composited_previs_frame"
          ? `已导出 ${activeCamera.label} · ${(timelineCursorMs / 1000).toFixed(2)}s 合成预演帧。`
          : `已导出 ${activeCamera.label} 的米制调度底图；全景外观参考将独立绑定，不能把两者伪合成为视频首帧。`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "机位导出失败");
    } finally {
      setBusy(false);
    }
  };

  const exportWideContextCameras = async () => {
    if (!draft) return;
    setBusy(true);
    setMessage(`正在导出 ${draft.cameras.length} 张同机位广角空间锚图…`);
    try {
      if (dirty)
        await Promise.resolve(
          actions.updateDirectorStage(
            node.id,
            draft,
            sourceStage?.revision ?? draft.revision,
          ),
        );
      for (const [index, camera] of draft.cameras.entries()) {
        setMessage(
          `正在导出同机位广角空间锚图 ${index + 1}/${draft.cameras.length}：${camera.label}`,
        );
        const capture = viewportRef.current?.capture(camera.id, {
          annotationLabel: `${camera.label} · 同机位广角空间锚`,
          fov: Math.max(90, camera.fov),
        });
        if (!capture) throw new Error(`机位 ${camera.label} 尚未准备好。`);
        await Promise.resolve(
          actions.exportDirectorStageCamera(
            node.id,
            camera.id,
            capture.dataUrl,
            capture.width,
            capture.height,
            camera.captureTimeMs ?? 0,
            "context_wide",
          ),
        );
      }
      setDirty(false);
      setMessage(`已导出 ${draft.cameras.length} 张同机位广角空间锚图。`);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "同机位广角空间锚图导出失败",
      );
    } finally {
      setBusy(false);
    }
  };

  if (!draft) {
    return (
      <section className="director-console-workspace">
        <div className="director-console-loading">
          <strong>正在初始化导演台…</strong>
          <span>场景结构将保存到当前导演节点</span>
          <button onClick={onClose} type="button">
            关闭
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="director-console-workspace">
      <header className="director-console-header">
        <div>
          <span>3D 导演台</span>
          <strong>{node.title}</strong>
          <small>
            空间修订 v{sourceStage?.revision ?? draft.revision}
            {dirty ? " · 未保存" : " · 已保存"}
          </small>
        </div>
        <div className="director-console-view-switch">
          <button
            className={viewMode === "edit" ? "active" : ""}
            onClick={() => setViewMode("edit")}
            type="button"
          >
            <Move3d size={15} />
            编辑视角
          </button>
          <button
            className={viewMode === "top_2_5d" ? "active" : ""}
            onClick={() => setViewMode("top_2_5d")}
            type="button"
          >
            <Map size={15} />
            2.5D 俯视
          </button>
          <button
            className={
              viewMode === "camera_first_person" ? "active" : ""
            }
            onClick={() => setViewMode("camera_first_person")}
            type="button"
          >
            <Video size={15} />
            摄影机第一视角
          </button>
          {viewMode === "camera_first_person" ? (
            <button
              className={showShotControls ? "active" : ""}
              onClick={() => setShowShotControls((current) => !current)}
              type="button"
            >
              {showShotControls ? <EyeOff size={15} /> : <Eye size={15} />}
              {showShotControls ? "隐藏镜头控制" : "显示镜头控制"}
            </button>
          ) : null}
          {draft.environment ? (
            <button
              className={showSemanticGeometry ? "active" : ""}
              onClick={() => setShowSemanticGeometry((current) => !current)}
              type="button"
            >
              {showSemanticGeometry ? <EyeOff size={15} /> : <Eye size={15} />}
              {showSemanticGeometry ? "隐藏空间控制" : "显示空间控制"}
            </button>
          ) : null}
        </div>
        <div className="director-console-actions">
          <button
            disabled={historyRef.current.length === 0 || busy}
            onClick={undo}
            type="button"
          >
            <RotateCcw size={15} />
            撤销
          </button>
          <button
            disabled={futureRef.current.length === 0 || busy}
            onClick={redo}
            type="button"
          >
            <RotateCw size={15} />
            重做
          </button>
          <button
            disabled={!dirty || busy}
            onClick={() => void save()}
            type="button"
          >
            <Save size={15} />
            保存结构
          </button>
          <button
            className="primary"
            disabled={!activeCamera || busy}
            onClick={() => void exportCamera("blocking_plate")}
            type="button"
          >
            <Download size={15} />
            导出3D调度底图
          </button>
          <button
            disabled={
              !activeCamera ||
              !composition?.readiness.playable ||
              busy
            }
            onClick={() => void exportCamera("composited_previs_frame")}
            title={
              composition?.readiness.playable
                ? "导出当前逐帧求值后的相机、人物、道具与环境合成预演帧"
                : "缺少完整真实路径，禁止导出"
            }
            type="button"
          >
            <Film size={15} />
            导出当前合成预演帧
          </button>
          <button
            disabled={draft.cameras.length === 0 || busy}
            onClick={() => void exportWideContextCameras()}
            type="button"
          >
            <Camera size={15} />
            批量导出同机位广角图
          </button>
          <button aria-label="关闭导演台" onClick={onClose} type="button">
            <X size={17} />
          </button>
        </div>
      </header>

      <aside className="director-console-tree">
        {draft.environment ? (
          <section>
            <header>
              <strong>{draft.environment.mode === "panorama_equirectangular" ? "全景外观参考（非度量）" : "真实 3D 场景权威"}</strong>
              <span>{draft.environment.anchors.length}</span>
            </header>
            <div className="director-environment-authority">
              {draft.environment.anchors.map((anchor) => (
                <button
                  className={
                    selection?.kind === "environment" && selection.id === anchor.id
                      ? "active selected"
                      : anchor.id === draft.environment?.activeAnchorId
                      ? "active"
                      : ""
                  }
                  key={anchor.id}
                  onClick={() => setSelection({ kind: "environment", id: anchor.id })}
                  type="button"
                >
                  {anchor.previewUrl || anchor.projection === "equirectangular" ? (
                    <img alt="" src={anchor.previewUrl || anchor.url} />
                  ) : (
                    <span className="director-splat-authority-icon"><Map size={16} /></span>
                  )}
                  <div>
                    <strong>{anchor.label}</strong>
                    <small>
                      {anchor.projection} · {anchor.mediaId}
                    </small>
                  </div>
                </button>
              ))}
            </div>
          </section>
        ) : null}
        <section>
          <header>
            <strong>
              {draft.environment ? "空间控制（默认隐藏）" : "场景对象"}
            </strong>
            <span>{draft.objects.length}</span>
          </header>
          <div className="director-object-presets">
            {OBJECT_PRESETS.map((preset) => {
              const Icon = preset.icon;
              return (
                <button
                  key={preset.type}
                  title={`添加${preset.label}`}
                  onClick={() => {
                    const id = `${preset.type}-${Date.now()}`;
                    const object: DirectorStageObject = {
                      id,
                      label: `${preset.label} ${draft.objects.filter((item) => item.type === preset.type).length + 1}`,
                      type: preset.type,
                      color: preset.color,
                      visible: true,
                      position: {
                        x: draft.dimensions.width / 2,
                        y: preset.size.y / 2,
                        z: draft.dimensions.depth / 2,
                      },
                      rotation: { x: 0, y: 0, z: 0 },
                      size: preset.size,
                    };
                    updateDraft((current) => ({
                      ...current,
                      objects: [...current.objects, object],
                    }));
                    setSelection({ kind: "object", id });
                  }}
                  type="button"
                >
                  <Icon size={14} />
                  <span>{preset.label}</span>
                </button>
              );
            })}
          </div>
          <div className="director-tree-list">
            {draft.objects.map((object) => (
              <button
                className={
                  selection?.kind === "object" && selection.id === object.id
                    ? "active"
                    : ""
                }
                key={object.id}
                onClick={() => setSelection({ kind: "object", id: object.id })}
                type="button"
              >
                <i style={{ background: object.color }} />
                <span>{object.label}</span>
                <small>{object.id}</small>
                {object.visible ? <Eye size={12} /> : <EyeOff size={12} />}
              </button>
            ))}
          </div>
        </section>
        <section>
          <header>
            <strong>人物 / 运镜路线</strong>
            <button
              onClick={() => {
                const route = emptyRoute(draft.routes.length);
                updateDraft((current) => ({
                  ...current,
                  routes: [...current.routes, route],
                }));
                setSelection({ kind: "route", id: route.id });
              }}
              type="button"
            >
              <CirclePlus size={14} />
            </button>
          </header>
          <div className="director-tree-list">
            {draft.routes.map((route) => (
              <button
                className={
                  selection?.kind === "route" && selection.id === route.id
                    ? "active"
                    : ""
                }
                key={route.id}
                onClick={() => setSelection({ kind: "route", id: route.id })}
                type="button"
              >
                <i style={{ background: route.color }} />
                <span>{route.label}</span>
                <small>{route.points.length} 点</small>
              </button>
            ))}
          </div>
        </section>
        <section>
          <header>
            <strong>摄影机</strong>
            <button
              onClick={() => {
                const index = draft.cameras.length + 1;
                const camera: DirectorStageCamera = {
                  id: `camera-${Date.now()}`,
                  label: `机位 ${index}`,
                  position: {
                    x: draft.dimensions.width / 2,
                    y: 2.2,
                    z: draft.dimensions.depth + 3,
                  },
                  target: {
                    x: draft.dimensions.width / 2,
                    y: 1.3,
                    z: draft.dimensions.depth / 2,
                  },
                  fov: 50,
                  aspectRatio: "16:9",
                  shotIds: [],
                  lookAt: {
                    x: draft.dimensions.width / 2,
                    y: 1.3,
                    z: draft.dimensions.depth / 2,
                  },
                  zoom: 1,
                  screenshots: [],
                };
                updateDraft((current) => ({
                  ...current,
                  cameras: [...current.cameras, camera],
                }));
                setSelection({ kind: "camera", id: camera.id });
              }}
              type="button"
            >
              <CirclePlus size={14} />
            </button>
          </header>
          <div className="director-tree-list">
            {draft.cameras.map((camera) => (
              <button
                className={draft.selectedCameraId === camera.id ? "active" : ""}
                key={camera.id}
                onClick={() => {
                  if (draft.selectedCameraId !== camera.id) {
                    updateDraft((current) => ({
                      ...current,
                      selectedCameraId: camera.id,
                    }));
                  }
                  setSelection({ kind: "camera", id: camera.id });
                }}
                type="button"
              >
                <Camera size={13} />
                <span>{camera.label}</span>
                <small>
                  {camera.fov}° · {camera.zoom ?? 1}x
                </small>
              </button>
            ))}
          </div>
        </section>
        {composition ? (
          <section className="director-composition-summary">
            <header>
              <strong>
                <Film size={13} />
                UnuTV compositionData
              </strong>
              <span>v1</span>
            </header>
            <div className="director-composition-stats">
              <span>角色 {composition.characters.length}</span>
              <span>道具 {composition.props.length}</span>
              <span>
                轨道{" "}
                {composition.animation.cameraTracks.length +
                  composition.animation.characterTracks.length +
                  composition.animation.propTracks.length}
              </span>
            </div>
          </section>
        ) : null}
        {node.boundaryFacts?.length ? (
          <section className="director-boundary-facts">
            <header>
              <strong>段间接缝 / Boundary</strong>
              <span>{node.boundaryFacts.length}</span>
            </header>
            <div className="director-boundary-list">
              {node.boundaryFacts.map((boundary) => (
                <article key={boundary.boundaryId}>
                  <div>
                    <strong>
                      {boundary.fromLabel} → {boundary.toLabel}
                    </strong>
                    <span
                      className={
                        boundary.blockers.length ? "is-blocked" : "is-ready"
                      }
                    >
                      {boundary.acceptanceStatus}
                    </span>
                  </div>
                  <dl>
                    <div>
                      <dt>Segment decision</dt>
                      <dd>{boundary.segmentDecision}</dd>
                    </div>
                    <div>
                      <dt>剪辑语义</dt>
                      <dd>
                        {boundary.isAutomaticCutPoint
                          ? `${boundary.cutType}${boundary.hiddenCut === true ? " · hidden cut" : boundary.hiddenCut === false ? " · visible cut" : " · hidden 未声明"}`
                          : "模型分段边界，不是自动剪辑点"}
                      </dd>
                    </div>
                    <div>
                      <dt>Stable tail / rollback</dt>
                      <dd>
                        {boundary.stableTailFrameId || "未绑定"} /{" "}
                        {boundary.rollbackFrameId || "未绑定"}
                      </dd>
                    </div>
                    <div>
                      <dt>Bridge segment</dt>
                      <dd>{boundary.bridgeSegmentId || "无/未声明"}</dd>
                    </div>
                    <div>
                      <dt>H0 / H1 / overlap</dt>
                      <dd>
                        {boundary.handoffMode} ·{" "}
                        {boundary.h0MediaId || "H0未绑定"} /{" "}
                        {boundary.h1MediaId || "H1未绑定"} ·{" "}
                        {boundary.overlap}
                      </dd>
                    </div>
                    <div>
                      <dt>Trim point</dt>
                      <dd>{boundary.trimPoint}</dd>
                    </div>
                  </dl>
                  {boundary.blockers.length ? (
                    <p>{boundary.blockers.join("；")}</p>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        ) : null}
        {composition ? (
          <section className="director-composition-environment">
            <header>
              <strong>
                <Map size={13} />
                环境输入
              </strong>
              <span>
                {composition.environment.gaussianSplatUrl
                  ? "Gaussian"
                  : composition.environment.panoramaUrl
                    ? "全景"
                    : "空"}
              </span>
            </header>
            <input
              ref={panoramaInputRef}
              className="director-panorama-file-input"
              accept="image/png,image/jpeg,image/webp"
              type="file"
              onChange={(event) => void importPanorama(event.target.files?.[0])}
            />
            <div className="director-panorama-actions">
              <button
                className="primary"
                disabled={busy}
                onClick={() => panoramaInputRef.current?.click()}
                type="button"
              >
                <Upload size={13} />
                导入 2:1 全景图
              </button>
              {composition.environment.panoramaUrl ? (
                <button
                  disabled={busy}
                  onClick={() =>
                    updateComposition((current) => ({
                      ...current,
                      environment: { ...current.environment, panoramaUrl: "" },
                    }))
                  }
                  type="button"
                >
                  <X size={13} />
                  清除全景
                </button>
              ) : null}
            </div>
            {composition.environment.panoramaUrl ? (
              <div className="director-panorama-preview">
                <img
                  alt="当前全景环境"
                  src={resolveWorkbenchMediaUrl(
                    composition.environment.panoramaUrl,
                  )}
                />
                <small>{composition.environment.panoramaUrl}</small>
              </div>
            ) : (
              <p className="director-panorama-help">
                选择电脑里的标准 2:1 等距柱状全景图，导入后会直接保存到项目并在
                3D 视口中生效。
              </p>
            )}
            <label className="director-text-field">
              <span>全景 URL</span>
              <input
                value={composition.environment.panoramaUrl}
                onChange={(event) =>
                  updateComposition((current) => ({
                    ...current,
                    environment: {
                      ...current.environment,
                      panoramaUrl: event.target.value,
                    },
                  }))
                }
                placeholder="也可粘贴 2:1 equirectangular 图片 URL"
              />
            </label>
            <label className="director-text-field">
              <span>Gaussian Splat URL</span>
              <input
                value={composition.environment.gaussianSplatUrl}
                onChange={(event) =>
                  updateComposition((current) => ({
                    ...current,
                    environment: {
                      ...current.environment,
                      gaussianSplatUrl: event.target.value,
                    },
                  }))
                }
                placeholder="可选"
              />
            </label>
            <label className="director-checkbox-field">
              <input
                checked={composition.environment.groundVisible}
                type="checkbox"
                onChange={(event) =>
                  updateComposition((current) => ({
                    ...current,
                    environment: {
                      ...current.environment,
                      groundVisible: event.target.checked,
                    },
                  }))
                }
              />
              <span>显示地面</span>
            </label>
          </section>
        ) : null}
        {composition ? (
          <section className="director-timeline-panel">
            <header>
              <strong>
                <Clock3 size={13} />
                动画时间轴
              </strong>
              <span>{composition.animation.duration}s</span>
            </header>
            <NumberField
              label="总时长（秒）"
              value={composition.animation.duration}
              step={0.1}
              onChange={(duration) =>
                updateComposition((current) => ({
                  ...current,
                  playback: {
                    ...current.playback,
                    durationSeconds: Math.max(0.1, duration),
                  },
                  animation: {
                    ...current.animation,
                    duration: Math.max(0.1, duration),
                  },
                }))
              }
            />
            <div className="director-timeline-playback">
              <button
                aria-label="回到预演起点"
                onClick={() => {
                  setIsPlaying(false);
                  setTimelineCursorMs(0);
                  activePlaybackSessionRef.current = undefined;
                  setCompletePlaybackEvidence(undefined);
                }}
                type="button"
              >
                <SkipBack size={13} />
                回到起点
              </button>
              <button
                className="primary"
                disabled={!composition.readiness.playable}
                onClick={() => {
                  if (isPlaying) {
                    setIsPlaying(false);
                    activePlaybackSessionRef.current = undefined;
                    setCompletePlaybackEvidence(undefined);
                    return;
                  }
                  const durationMs =
                    composition.playback.durationSeconds * 1000;
                  const startsAtZero = timelineCursorMs <= 1 || timelineCursorMs >= durationMs;
                  if (timelineCursorMs >= durationMs) setTimelineCursorMs(0);
                  activePlaybackSessionRef.current = startsAtZero
                    ? {
                        playbackSessionId: `director-playback-${Date.now()}`,
                        startedAt: new Date().toISOString(),
                        sampleCount: 1,
                        maxObservedStepMs: 0,
                        manualSeekCount: 0,
                      }
                    : undefined;
                  setCompletePlaybackEvidence(undefined);
                  setViewMode("camera_first_person");
                  setIsPlaying(true);
                }}
                title={
                  composition.readiness.playable
                    ? "从当前时间连续逐帧播放"
                    : "缺少真实摄影机路径或完整时间覆盖，禁止伪播放"
                }
                type="button"
              >
                {isPlaying ? <Pause size={13} /> : <Play size={13} />}
                {isPlaying ? "暂停" : "播放预演"}
              </button>
              <span>
                {composition.readiness.playable
                  ? `${composition.playback.frameRate}fps · 连续求值`
                  : `阻塞 ${composition.readiness.issues.length} 项`}
              </span>
            </div>
            {completePlaybackEvidence ? (
              <output
                data-playback-receipt={JSON.stringify(completePlaybackEvidence)}
                data-testid="director-playback-evidence"
              >
                完整播放已完成 · 0–{composition.playback.durationSeconds}s · 无手动跳转
              </output>
            ) : null}
            {!composition.readiness.playable ? (
              <ul className="director-composition-readiness">
                {composition.readiness.issues.slice(0, 4).map((entry) => (
                  <li key={`${entry.code}:${entry.path}`}>{entry.message}</li>
                ))}
              </ul>
            ) : null}
            <label className="director-timeline-cursor">
              <span>时间指针（秒）</span>
              <input
                max={composition.animation.duration}
                min={0}
                step={0.1}
                type="range"
                value={Math.min(
                  composition.animation.duration,
                  timelineCursorMs / 1000,
                )}
                onChange={(event) => {
                  if (activePlaybackSessionRef.current) activePlaybackSessionRef.current.manualSeekCount += 1;
                  setIsPlaying(false);
                  activePlaybackSessionRef.current = undefined;
                  setCompletePlaybackEvidence(undefined);
                  setTimelineCursorMs(Number(event.target.value) * 1000);
                }}
              />
              <code>{(timelineCursorMs / 1000).toFixed(1)}s</code>
            </label>
            <button
              className="primary director-keyframe-button"
              disabled={!selection && !activeCamera}
              onClick={recordKeyframe}
              type="button"
            >
              <Clock3 size={13} />
              记录当前状态为关键帧
            </button>
            <div className="director-timeline-tracks">
              {[
                ...composition.animation.cameraTracks,
                ...composition.animation.characterTracks,
                ...composition.animation.propTracks,
                ...composition.animation.motionPaths,
              ].map((track) => (
                <button
                  key={track.id}
                  className={
                    composition.animation.activeCameraTrackId === track.id
                      ? "active"
                      : ""
                  }
                  onClick={() =>
                    updateComposition((current) => ({
                      ...current,
                      animation: {
                        ...current.animation,
                        activeCameraTrackId: track.id,
                      },
                    }))
                  }
                  type="button"
                >
                  <span>{track.name ?? track.id}</span>
                  <small>{track.keyframes.length} 关键帧</small>
                </button>
              ))}
            </div>
          </section>
        ) : null}
      </aside>

      <main className="director-console-main">
        <DirectorViewport
          ref={viewportRef}
          stage={evaluatedStage ?? draft}
          selected={selection}
          selectedCameraId={(evaluatedStage ?? draft).selectedCameraId}
          showSemanticGeometry={showSemanticGeometry}
          showShotControls={showShotControls}
          viewMode={viewMode}
          onSelectObject={(id) => setSelection({ kind: "object", id })}
          onSelectCamera={(id) => setSelection({ kind: "camera", id })}
          onMoveObject={moveObject}
          onMoveCamera={moveCamera}
          onMoveCameraTarget={moveCameraTarget}
        />
        <div className="director-console-overlay">
          <span>
            <Map size={13} />
            {draft.dimensions.width} × {draft.dimensions.depth} ×{" "}
            {draft.dimensions.height} m
          </span>
          <span>
            <Camera size={13} />
            {activeCamera?.label ?? "无机位"}
            {Number.isFinite(activeCamera?.captureTimeMs)
              ? ` · ${activeCamera?.captureTimeMs}ms`
              : ""}
          </span>
          <span>
            {draft.environment
              ? `${draft.environment.mode === "panorama_equirectangular" ? "非度量全景参考" : "真实 3D 场景"} · ${draft.environment.anchors.find((anchor) => anchor.id === draft.environment?.activeAnchorId)?.label ?? "已导入"}`
              : "橙=门 · 蓝=人物 · 紫=货架 · 青=冷柜"}
          </span>
        </div>
      </main>

      <aside className="director-console-inspector">
        <header>
          <strong>属性</strong>
          <span>
            {selection ? `${selection.kind} / ${selection.id}` : "选择一个对象或世界"}
          </span>
        </header>
        {!selection ? (
          <div className="director-empty-inspector">
            <Move3d size={28} />
            <p>在左侧选择 3D 世界，或在三维视口选择对象，再编辑精确坐标。</p>
          </div>
        ) : null}
        {selectedEnvironmentAnchor && draft.environment ? (
          <section>
            <label className="director-text-field">
              <span>世界资产</span>
              <strong>{selectedEnvironmentAnchor.label}</strong>
            </label>
            <label className="director-text-field">
              <span>空间格式</span>
              <strong>{selectedEnvironmentAnchor.projection} · {selectedEnvironmentAnchor.format?.toUpperCase() ?? "MEDIA"}</strong>
            </label>
            <VectorFields
              label="世界原点（米）"
              value={selectedEnvironmentAnchor.position}
              onChange={(position) =>
                updateDraft((current) => ({
                  ...current,
                  environment: current.environment
                    ? {
                        ...current.environment,
                        anchors: current.environment.anchors.map((anchor) =>
                          anchor.id === selectedEnvironmentAnchor.id
                            ? { ...anchor, position }
                            : anchor,
                        ),
                      }
                    : current.environment,
                }))
              }
            />
            <VectorFields
              label="世界旋转（度）"
              value={selectedEnvironmentAnchor.rotation ?? { x: 0, y: selectedEnvironmentAnchor.yawOffsetDeg, z: 0 }}
              onChange={(rotation) =>
                updateDraft((current) => ({
                  ...current,
                  environment: current.environment
                    ? {
                        ...current.environment,
                        anchors: current.environment.anchors.map((anchor) =>
                          anchor.id === selectedEnvironmentAnchor.id
                            ? { ...anchor, rotation, yawOffsetDeg: rotation.y }
                            : anchor,
                        ),
                      }
                    : current.environment,
                }))
              }
            />
            <VectorFields
              label="世界缩放"
              value={selectedEnvironmentAnchor.scale ?? { x: 1, y: 1, z: 1 }}
              onChange={(scale) =>
                updateDraft((current) => ({
                  ...current,
                  environment: current.environment
                    ? {
                        ...current.environment,
                        anchors: current.environment.anchors.map((anchor) =>
                          anchor.id === selectedEnvironmentAnchor.id
                            ? { ...anchor, scale }
                            : anchor,
                        ),
                      }
                    : current.environment,
                }))
              }
            />
            <button
              disabled={busy || !dirty}
              onClick={async () => {
                if (!draft.environment || !sourceStage) return;
                setBusy(true);
                setMessage("正在保存 3D 世界位姿…");
                try {
                  const next = await actions.updateDirectorEnvironment(
                    node.id,
                    draft.environment,
                    sourceStage.revision,
                  );
                  const clean = cloneStage(next);
                  draftRef.current = clean;
                  setDraft(clean);
                  historyRef.current = [];
                  futureRef.current = [];
                  setDirty(false);
                  setMessage(`已保存 3D 世界位姿 · 空间修订 v${next.revision}`);
                } catch (error) {
                  setMessage(error instanceof Error ? error.message : "3D 世界位姿保存失败");
                } finally {
                  setBusy(false);
                }
              }}
              type="button"
            >
              <Save size={14} />
              保存世界位姿
            </button>
            <small className="director-inspector-note">用户与 Agent 共用 set_environment 原子命令；世界资产本体保持版本化，不在浏览器中改写。</small>
          </section>
        ) : null}
        {selectedObject ? (
          <section>
            <label className="director-text-field">
              <span>名称</span>
              <input
                value={selectedObject.label}
                onChange={(event) =>
                  updateObject({ ...selectedObject, label: event.target.value })
                }
              />
            </label>
            <label className="director-text-field">
              <span>类型</span>
              <strong>{selectedObject.type}</strong>
            </label>
            {selectedObject.type === "character" ? (
              <>
                <label className="director-text-field">
                  <span>模型名</span>
                  <input
                    value={selectedObject.modelName ?? ""}
                    onChange={(event) =>
                      updateObject({
                        ...selectedObject,
                        modelName: event.target.value,
                      })
                    }
                  />
                </label>
                <label className="director-text-field">
                  <span>姿态</span>
                  <input
                    value={selectedObject.pose ?? "stand"}
                    onChange={(event) =>
                      updateObject({
                        ...selectedObject,
                        pose: event.target.value,
                      })
                    }
                  />
                </label>
              <NumberField
                label="统一缩放"
                  value={selectedObject.uniformScale ?? 1}
                  step={0.01}
                  onChange={(uniformScale) =>
                    updateObject({
                      ...selectedObject,
                      uniformScale,
                      scale: {
                        x: uniformScale,
                        y: uniformScale,
                        z: uniformScale,
                      },
                  })
                }
              />
              <CharacterDirectControls camera={selectedCamera ?? activeCamera} object={selectedObject} onChange={updateObject} />
              <div className="director-joint-controls">
                  <strong>关节角度（UnuTV 字段，度）</strong>
                  {JOINT_CONTROLS.map(({ group, axes }) => (
                    <fieldset key={group}>
                      <legend>{group}</legend>
                      {axes.map((axis) => (
                        <NumberField
                          key={axis}
                          label={axis}
                          value={Number(
                            selectedObject.jointAngles?.[group]?.[axis] ?? 0,
                          )}
                          step={1}
                          onChange={(value) =>
                            updateObject({
                              ...selectedObject,
                              jointAngles: {
                                ...(selectedObject.jointAngles ?? {}),
                                [group]: {
                                  ...(selectedObject.jointAngles?.[group] ??
                                    {}),
                                  [axis]: value,
                                },
                              },
                            })
                          }
                        />
                      ))}
                    </fieldset>
                  ))}
                </div>
              </>
            ) : null}
            <label className="director-color-field">
              <span>语义颜色</span>
              <input
                type="color"
                value={selectedObject.color}
                onChange={(event) =>
                  updateObject({ ...selectedObject, color: event.target.value })
                }
              />
              <code>{selectedObject.color}</code>
            </label>
            <button
              className="director-visibility"
              onClick={() =>
                updateObject({
                  ...selectedObject,
                  visible: !selectedObject.visible,
                })
              }
              type="button"
            >
              {selectedObject.visible ? (
                <Eye size={14} />
              ) : (
                <EyeOff size={14} />
              )}
              {selectedObject.visible ? "参与场景与导出" : "已从场景隐藏"}
            </button>
            <label className="director-checkbox-field">
              <input
                checked={selectedObject.locked === true}
                type="checkbox"
                onChange={(event) =>
                  updateObject({
                    ...selectedObject,
                    locked: event.target.checked,
                  })
                }
              />
              <span>锁定对象（仍可选择）</span>
            </label>
            <VectorFields
              label="位置（米）"
              value={selectedObject.position}
              onChange={(position) =>
                updateObject({ ...selectedObject, position })
              }
            />
            <VectorFields
              label="旋转（度）"
              value={selectedObject.rotation}
              onChange={(rotation) =>
                updateObject({ ...selectedObject, rotation })
              }
            />
            <VectorFields
              label="尺寸（米）"
              value={selectedObject.size}
              onChange={(size) => updateObject({ ...selectedObject, size })}
            />
            <VectorFields
              label="三轴缩放"
              value={
                selectedObject.scale ?? {
                  x: selectedObject.uniformScale ?? 1,
                  y: selectedObject.uniformScale ?? 1,
                  z: selectedObject.uniformScale ?? 1,
                }
              }
              onChange={(scale) => updateObject({ ...selectedObject, scale })}
            />
            <button
              className="danger"
              onClick={() => {
                updateDraft((current) => ({
                  ...current,
                  objects: current.objects.filter(
                    (object) => object.id !== selectedObject.id,
                  ),
                }));
                setSelection(undefined);
              }}
              type="button"
            >
              <Trash2 size={14} />
              删除对象
            </button>
          </section>
        ) : null}
        {selectedCamera ? (
          <section>
            <label className="director-text-field">
              <span>机位名</span>
              <input
                value={selectedCamera.label}
                onChange={(event) =>
                  updateCamera({ ...selectedCamera, label: event.target.value })
                }
              />
            </label>
            <label className="director-checkbox-field">
              <input
                checked={selectedCamera.locked === true}
                type="checkbox"
                onChange={(event) =>
                  updateCamera({
                    ...selectedCamera,
                    locked: event.target.checked,
                  })
                }
              />
              <span>锁定机位（仍可选择）</span>
            </label>
            <VectorFields
              label="摄影机位置"
              value={selectedCamera.position}
              onChange={(position) =>
                updateCamera({ ...selectedCamera, position })
              }
            />
            <VectorFields
              label="注视目标"
              value={selectedCamera.target}
              onChange={(target) => updateCamera({ ...selectedCamera, target })}
            />
            <NumberField
              label="视野角 FOV"
              value={selectedCamera.fov}
              step={1}
              onChange={(fov) => updateCamera({ ...selectedCamera, fov })}
            />
            <NumberField
              label="镜头变焦"
              value={selectedCamera.zoom ?? 1}
              step={0.01}
              onChange={(zoom) => updateCamera({ ...selectedCamera, zoom })}
            />
            <label className="director-text-field">
              <span>画面比例</span>
              <select
                value={selectedCamera.aspectRatio}
                onChange={(event) =>
                  updateCamera({
                    ...selectedCamera,
                    aspectRatio: event.target.value,
                  })
                }
              >
                <option>16:9</option>
                <option>9:16</option>
                <option>1:1</option>
                <option>4:3</option>
                <option>21:9</option>
              </select>
            </label>
            {draft.cameras.length > 1 ? (
              <button
                className="danger"
                onClick={() => {
                  updateDraft((current) => {
                    const cameras = current.cameras.filter(
                      (camera) => camera.id !== selectedCamera.id,
                    );
                    return {
                      ...current,
                      cameras,
                      selectedCameraId:
                        cameras[0]?.id ?? current.selectedCameraId,
                    };
                  });
                  setSelection(undefined);
                }}
                type="button"
              >
                <Trash2 size={14} />
                删除机位
              </button>
            ) : null}
          </section>
        ) : null}
        {selectedRoute ? (
          <section>
            <label className="director-text-field">
              <span>路线名</span>
              <input
                value={selectedRoute.label}
                onChange={(event) =>
                  updateRoute({ ...selectedRoute, label: event.target.value })
                }
              />
            </label>
            <label className="director-text-field">
              <span>路线类型</span>
              <select
                value={selectedRoute.type}
                onChange={(event) =>
                  updateRoute({
                    ...selectedRoute,
                    type: event.target.value as DirectorStageRoute["type"],
                  })
                }
              >
                <option value="character">人物走位</option>
                <option value="camera">镜头路径</option>
                <option value="action">动作路径</option>
              </select>
            </label>
            <label className="director-text-field">
              <span>绑定目标</span>
              <select
                value={selectedRoute.objectId ?? ""}
                onChange={(event) =>
                  updateRoute({
                    ...selectedRoute,
                    objectId: event.target.value || undefined,
                  })
                }
              >
                <option value="">未绑定（阻塞可播放）</option>
                {(selectedRoute.type === "camera"
                  ? draft.cameras
                  : draft.objects
                ).map((target) => (
                  <option key={target.id} value={target.id}>
                    {target.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="director-text-field">
              <span>路径几何</span>
              <select
                value={selectedRoute.pathMode ?? "polyline"}
                onChange={(event) => {
                  const pathMode = event.target
                    .value as NonNullable<DirectorStageRoute["pathMode"]>;
                  const first = selectedRoute.points[0];
                  const last = selectedRoute.points.at(-1);
                  const startMs =
                    selectedRoute.startMs ?? Number(first?.atMs ?? 0);
                  const endMs =
                    selectedRoute.endMs ??
                    Number(
                      last?.atMs ??
                        composition?.playback.durationSeconds * 1000 ??
                        1000,
                    );
                  const points =
                    pathMode !== "polyline" && first && last
                      ? createDirectorArcRoutePoints({
                          direction: pathMode,
                          durationMs: Math.max(1, endMs - startMs),
                          start: first,
                          end: last,
                        }).map((point: DirectorStageRoute["points"][number]) => ({
                          ...point,
                          atMs: Number(point.atMs ?? 0) + startMs,
                        }))
                      : selectedRoute.points;
                  updateRoute({
                    ...selectedRoute,
                    pathMode,
                    startMs,
                    endMs,
                    points,
                  });
                }}
              >
                <option value="polyline">多节点折线</option>
                <option value="arc_left">左弧线</option>
                <option value="arc_right">右弧线</option>
              </select>
            </label>
            <label className="director-text-field">
              <span>速度曲线</span>
              <select
                value={selectedRoute.speedCurve ?? "linear"}
                onChange={(event) =>
                  updateRoute({
                    ...selectedRoute,
                    speedCurve: event.target
                      .value as NonNullable<DirectorStageRoute["speedCurve"]>,
                  })
                }
              >
                <option value="linear">线性</option>
                <option value="ease_in">缓入</option>
                <option value="ease_out">缓出</option>
                <option value="ease_in_out">缓入缓出</option>
                <option value="step">阶跃</option>
                <option value="hold">保持</option>
              </select>
            </label>
            {selectedRoute.type === "camera" ? (
              <label className="director-text-field">
                <span>主体跟随</span>
                <select
                  value={selectedRoute.subjectFollowObjectId ?? ""}
                  onChange={(event) =>
                    updateRoute({
                      ...selectedRoute,
                      subjectFollowObjectId: event.target.value || undefined,
                    })
                  }
                >
                  <option value="">固定注视目标</option>
                  {draft.objects
                    .filter((object) => object.type === "character")
                    .map((object) => (
                      <option key={object.id} value={object.id}>
                        {object.label}
                      </option>
                    ))}
                </select>
              </label>
            ) : null}
            <div className="director-route-points">
              {selectedRoute.points.map((point, index) => (
                <div key={index}>
                  <VectorFields
                    label={`点 ${index + 1}`}
                    value={point}
                    onChange={(next) =>
                      updateRoute({
                        ...selectedRoute,
                        points: selectedRoute.points.map(
                          (candidate, candidateIndex) =>
                            candidateIndex === index
                              ? { ...candidate, ...next }
                              : candidate,
                        ),
                      })
                    }
                  />
                  <NumberField
                    label={`点 ${index + 1} 时间（ms）`}
                    value={Number(point.atMs ?? 0)}
                    step={40}
                    onChange={(atMs) =>
                      updateRoute({
                        ...selectedRoute,
                        points: selectedRoute.points.map(
                          (candidate, candidateIndex) =>
                            candidateIndex === index
                              ? { ...candidate, atMs: Math.max(0, atMs) }
                              : candidate,
                        ),
                      })
                    }
                  />
                </div>
              ))}
            </div>
            <button
              onClick={() =>
                updateRoute({
                  ...selectedRoute,
                  points: [
                    ...selectedRoute.points,
                    selectedRoute.points.at(-1)
                      ? { ...selectedRoute.points.at(-1)! }
                      : { x: 0, y: 0, z: 0 },
                  ],
                })
              }
              type="button"
            >
              <CirclePlus size={14} />
              增加路径点
            </button>
            <button
              className="danger"
              onClick={() => {
                updateDraft((current) => ({
                  ...current,
                  routes: current.routes.filter(
                    (route) => route.id !== selectedRoute.id,
                  ),
                }));
                setSelection(undefined);
              }}
              type="button"
            >
              <Trash2 size={14} />
              删除路线
            </button>
          </section>
        ) : null}
      </aside>

      <footer className="director-console-footer">
        <div>
          <Check size={14} />
          <span>{message}</span>
        </div>
        <div>
          <Move3d size={14} />
          拖人物=地面移动 · 红X左右 · 绿Y上下 · 蓝Z前后
          <Rotate3d size={14} />
          空白处旋转视角且不会重置
          <Scaling size={14} />
          右侧可精确输入
        </div>
      </footer>
    </section>
  );
}
