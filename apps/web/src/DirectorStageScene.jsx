"use client";

// 自建 3D 导演台的场景层(R3F)。
//
// 直接渲染 UnuTV 自己的 DirectorStageDocument —— objects / routes / cameras,
// 不经过任何外来的不透明结构。这样走位路线天然可编辑,截图天然能 record_capture,
// cameraTrajectoryPlan 那条既有链路不需要额外桥接。
//
// 模型:public/models/mannequin.glb,3ds Max Biped 命名的 67 关节骨架,
// Sketchfab Standard 授权(允许商用)。

import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Grid, Line, OrbitControls, PerspectiveCamera, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { BODY_TYPES, JOINT, readBodyType, readPose } from "./director-pose-presets.js";

const MODEL_URL = "/models/mannequin.glb";
useGLTF.preload(MODEL_URL);

const v3 = (value, fallback = 0) => new THREE.Vector3(
  Number.isFinite(value?.x) ? value.x : fallback,
  Number.isFinite(value?.y) ? value.y : fallback,
  Number.isFinite(value?.z) ? value.z : fallback
);

/** 一个演员。GLB 只加载一次,每个实例克隆骨架后各自摆姿势。 */
function Mannequin({ object, selected, onSelect }) {
  const { scene } = useGLTF(MODEL_URL);
  const root = useRef(null);

  // SkeletonUtils.clone 的等价做法:深克隆并重建骨骼绑定
  const instance = useMemo(() => {
    const clone = scene.clone(true);
    const bones = new Map();
    clone.traverse((child) => { if (child.isBone) bones.set(child.name, child); });
    clone.traverse((child) => {
      if (!child.isSkinnedMesh) return;
      const source = child.skeleton;
      child.skeleton = new THREE.Skeleton(
        source.bones.map((bone) => bones.get(bone.name) ?? bone),
        source.boneInverses
      );
      child.material = child.material.clone();
    });
    return { clone, bones };
  }, [scene]);

  // 应用姿势:每帧重置回绑定姿势再叠加,避免旋转累积
  const pose = readPose(object);
  const body = BODY_TYPES[readBodyType(object)] ?? BODY_TYPES.男性素体;
  useLayoutEffect(() => {
    for (const [short, prefix] of Object.entries(JOINT)) {
      const bone = [...instance.bones.entries()].find(([name]) => name.startsWith(prefix))?.[1];
      if (!bone) continue;
      const angles = pose[short];
      bone.rotation.set(0, 0, 0);
      if (Array.isArray(angles) && angles.length === 3) bone.rotation.set(...angles);
    }
    // 躯干粗细:缩放脊柱链的横截面
    const spine = [...instance.bones.entries()].find(([name]) => name.startsWith(JOINT.spine))?.[1];
    if (spine) spine.scale.set(body.girth, 1, body.girth);
  }, [body.girth, instance, pose]);

  useLayoutEffect(() => {
    const color = new THREE.Color(object.color || "#c9ced8");
    instance.clone.traverse((child) => {
      if (child.isSkinnedMesh || child.isMesh) {
        child.material.color = color;
        child.material.emissive = new THREE.Color(selected ? "#1d3b40" : "#000000");
        child.castShadow = true;
      }
    });
  }, [instance, object.color, selected]);

  const position = v3(object.position);
  const rotation = v3(object.rotation);

  return (
    <group
      onClick={(event) => { event.stopPropagation(); onSelect(object.id); }}
      position={[position.x, position.y, position.z]}
      ref={root}
      rotation={[rotation.x, rotation.y, rotation.z]}
      scale={body.scale * (Number.isFinite(object.size?.y) ? object.size.y / 1.8 : 1)}
      visible={object.visible !== false}
    >
      <primitive object={instance.clone} />
      {selected ? (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.42, 0.5, 40]} />
          <meshBasicMaterial color="#6fb3b8" transparent opacity={0.9} />
        </mesh>
      ) : null}
      <Billboard label={object.label} />
    </group>
  );
}

/** 角色标签,始终朝向观察者。 */
function Billboard({ label }) {
  const ref = useRef(null);
  useFrame(({ camera }) => { ref.current?.quaternion.copy(camera.quaternion); });
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "rgba(15,16,19,.82)";
    ctx.roundRect?.(0, 0, 256, 64, 12); ctx.fill();
    ctx.fillStyle = "#e5e4e0";
    ctx.font = "600 30px system-ui, -apple-system, PingFang SC, sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(String(label ?? "").slice(0, 8), 128, 34);
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    return map;
  }, [label]);
  return (
    <sprite position={[0, 2.1, 0]} ref={ref} scale={[0.9, 0.225, 1]}>
      <spriteMaterial depthTest={false} map={texture} transparent />
    </sprite>
  );
}

/** 非角色对象一律用带边框的盒子表示,足够锁体积与遮挡关系。 */
function StageBox({ object, selected, onSelect }) {
  const position = v3(object.position);
  const rotation = v3(object.rotation);
  const size = v3(object.size, 1);
  return (
    <group
      onClick={(event) => { event.stopPropagation(); onSelect(object.id); }}
      position={[position.x, position.y + size.y / 2, position.z]}
      rotation={[rotation.x, rotation.y, rotation.z]}
      visible={object.visible !== false}
    >
      <mesh castShadow receiveShadow>
        <boxGeometry args={[size.x || 1, size.y || 1, size.z || 1]} />
        <meshStandardMaterial color={object.color || "#5d6672"} roughness={0.8} />
      </mesh>
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(size.x || 1, size.y || 1, size.z || 1)]} />
        <lineBasicMaterial color={selected ? "#6fb3b8" : "#1b1d21"} />
      </lineSegments>
    </group>
  );
}

/** 走位路线。这是新导演台相对外来那个的关键增量:
 *  routes 会被 automation executor 投影成 shot.cameraTrajectoryPlan 进提示词。 */
function StageRoute({ route, selected, onSelect }) {
  const points = useMemo(
    () => (route.points ?? []).map((point) => [point.x ?? 0, (point.y ?? 0) + 0.04, point.z ?? 0]),
    [route.points]
  );
  if (points.length < 2) return null;
  const color = route.color || (route.type === "camera" ? "#d9a441" : "#6fb3b8");
  return (
    <group onClick={(event) => { event.stopPropagation(); onSelect(route.id); }}>
      <Line color={color} dashed={route.type === "camera"} dashSize={0.18} gapSize={0.12}
        lineWidth={selected ? 3 : 1.8} points={points} />
      {points.map((point, index) => (
        <mesh key={index} position={point}>
          <sphereGeometry args={[index === 0 ? 0.11 : 0.075, 12, 12]} />
          <meshBasicMaterial color={index === 0 ? "#9dbb63" : color} />
        </mesh>
      ))}
    </group>
  );
}

/** 机位标记 + 视锥,让你在导演视角里看得见镜头朝哪。 */
function CameraMarker({ camera, active, onSelect }) {
  const position = v3(camera.position);
  const target = v3(camera.target);
  const helper = useMemo(() => {
    const cam = new THREE.PerspectiveCamera(camera.fov || 40, aspectOf(camera.aspectRatio), 0.4, 3.2);
    cam.position.copy(position);
    cam.lookAt(target);
    cam.updateMatrixWorld();
    return new THREE.CameraHelper(cam);
  }, [camera.aspectRatio, camera.fov, position.x, position.y, position.z, target.x, target.y, target.z]);

  useEffect(() => {
    helper.traverse((child) => {
      if (child.material) child.material.color = new THREE.Color(active ? "#6fb3b8" : "#4a4d55");
    });
  }, [active, helper]);

  return (
    <group>
      <primitive object={helper} />
      <mesh onClick={(event) => { event.stopPropagation(); onSelect(camera.id); }} position={[position.x, position.y, position.z]}>
        <boxGeometry args={[0.24, 0.18, 0.32]} />
        <meshStandardMaterial color={active ? "#6fb3b8" : "#7a7d85"} />
      </mesh>
    </group>
  );
}

export function aspectOf(ratio) {
  const [w, h] = String(ratio || "16:9").split(":").map(Number);
  return Number.isFinite(w) && Number.isFinite(h) && h > 0 ? w / h : 16 / 9;
}

/** 机位视角:把渲染相机切到选中机位。 */
function ActiveCameraRig({ camera, enabled }) {
  const ref = useRef(null);
  const { set, size } = useThree();
  useEffect(() => {
    if (!enabled || !ref.current) return;
    const target = v3(camera.target);
    ref.current.lookAt(target);
    ref.current.updateProjectionMatrix();
  }, [camera, enabled, size]);
  if (!enabled) return null;
  const position = v3(camera.position);
  return (
    <PerspectiveCamera
      far={400}
      fov={camera.fov || 40}
      makeDefault
      near={0.05}
      position={[position.x, position.y, position.z]}
      ref={ref}
    />
  );
}

/** 九宫格与画幅遮罩,叠在视口上,不进 3D 场景。 */
export function ViewportOverlay({ aspect, showThirds, showMask }) {
  if (!showThirds && !showMask) return null;
  return (
    <div className="director-overlay" style={{ "--frame-aspect": aspect }}>
      <div className="director-frame">
        {showMask ? <span className="director-frame-edge" /> : null}
        {showThirds ? (
          <>
            <span className="director-thirds v" style={{ left: "33.333%" }} />
            <span className="director-thirds v" style={{ left: "66.666%" }} />
            <span className="director-thirds h" style={{ top: "33.333%" }} />
            <span className="director-thirds h" style={{ top: "66.666%" }} />
          </>
        ) : null}
      </div>
    </div>
  );
}

export function DirectorStageScene({
  stage,
  selectedId,
  activeCameraId,
  viewMode,          // "director" | "camera"
  gridSnap,
  groundOpacity,
  onSelect,
  onReady
}) {
  const objects = stage?.objects ?? [];
  const routes = stage?.routes ?? [];
  const cameras = stage?.cameras ?? [];
  const activeCamera = cameras.find((item) => item.id === activeCameraId) ?? cameras[0] ?? null;
  const cameraView = viewMode === "camera" && activeCamera;

  return (
    <Canvas
      gl={{ preserveDrawingBuffer: true, antialias: true }}
      onCreated={(state) => onReady?.(state)}
      shadows
    >
      <color args={["#101216"]} attach="background" />
      <fog args={["#101216", 26, 78]} attach="fog" />

      {cameraView
        ? <ActiveCameraRig camera={activeCamera} enabled />
        : <PerspectiveCamera far={400} fov={46} makeDefault near={0.05} position={[7, 5.2, 9]} />}

      <hemisphereLight args={["#cfd8e3", "#20242b", 0.72]} />
      <directionalLight
        castShadow
        intensity={2.1}
        position={[6, 11, 5]}
        shadow-camera-bottom={-16}
        shadow-camera-left={-16}
        shadow-camera-right={16}
        shadow-camera-top={16}
        shadow-mapSize={[2048, 2048]}
      />
      <directionalLight intensity={0.5} position={[-8, 5, -6]} />

      <mesh position={[0, -0.001, 0]} receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color="#171a1f" opacity={groundOpacity} roughness={1} transparent />
      </mesh>
      <Grid
        cellColor="#2b3038"
        cellSize={gridSnap || 0.5}
        fadeDistance={62}
        infiniteGrid
        sectionColor="#3d444f"
        sectionSize={(gridSnap || 0.5) * 10}
      />

      <Suspense fallback={null}>
        {objects.map((object) => (
          object.type === "character"
            ? <Mannequin key={object.id} object={object} onSelect={onSelect} selected={object.id === selectedId} />
            : <StageBox key={object.id} object={object} onSelect={onSelect} selected={object.id === selectedId} />
        ))}
      </Suspense>

      {routes.map((route) => (
        <StageRoute key={route.id} onSelect={onSelect} route={route} selected={route.id === selectedId} />
      ))}

      {!cameraView && cameras.map((camera) => (
        <CameraMarker active={camera.id === activeCameraId} camera={camera} key={camera.id} onSelect={onSelect} />
      ))}

      {!cameraView ? <OrbitControls makeDefault maxPolarAngle={Math.PI / 2.02} target={[0, 1, 0]} /> : null}
    </Canvas>
  );
}
