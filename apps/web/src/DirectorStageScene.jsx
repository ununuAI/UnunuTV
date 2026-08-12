"use client";

// 自建 3D 导演台的场景层(R3F)。
//
// 直接渲染 UnuTV 自己的 DirectorStageDocument —— objects / routes / cameras,
// 不经过任何外来的不透明结构。这样走位路线天然可编辑,截图天然能 record_capture,
// cameraTrajectoryPlan 那条既有链路不需要额外桥接。
//
// 模型:public/models/mannequin.glb,3ds Max Biped 命名的 67 关节骨架,
// Sketchfab Standard 授权(允许商用)。

import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Grid, Line, OrbitControls, PerspectiveCamera, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { BODY_TYPES, JOINT, readBodyType, readPose } from "./director-pose-presets.js";

const MODEL_URL = "/models/mannequin.glb";
useGLTF.preload(MODEL_URL);

const v3 = (value, fallback = 0) => new THREE.Vector3(
  Number.isFinite(value?.x) ? value.x : fallback,
  Number.isFinite(value?.y) ? value.y : fallback,
  Number.isFinite(value?.z) ? value.z : fallback
);

export function aspectOf(ratio) {
  const [w, h] = String(ratio || "16:9").split(":").map(Number);
  return Number.isFinite(w) && Number.isFinite(h) && h > 0 ? w / h : 16 / 9;
}

/** 一个演员。GLB 只加载一次,每个实例克隆骨架后各自摆姿势。 */
function Mannequin({ object, selected, onSelect }) {
  const { scene } = useGLTF(MODEL_URL);
  const group = useRef(null);

  // 蒙皮模型必须用 SkeletonUtils.clone:普通 clone 不会重新 bind,
  // 骨骼失效后网格会按原始 182 单位渲染,相机就埋在它脚背里 —— 看起来就是空场景。
  const instance = useMemo(() => {
    const clone = cloneSkinned(scene);
    const bones = new Map();
    const bind = new Map();
    clone.traverse((child) => {
      if (child.isBone) {
        bones.set(child.name, child);
        // 记下绑定姿态:姿势是在它之上的偏移,直接归零会把骨架拧坏
        bind.set(child.name, child.rotation.clone());
      }
      if (child.isSkinnedMesh || child.isMesh) child.material = child.material.clone();
    });
    // 按实测包围盒归一化,不依赖任何写死的尺度常量
    const box = new THREE.Box3().setFromObject(clone);
    const nativeHeight = Math.max(0.001, box.max.y - box.min.y);
    return { clone, bones, bind, nativeHeight };
  }, [scene]);

  const pose = readPose(object);
  const body = BODY_TYPES[readBodyType(object)] ?? BODY_TYPES.男性素体;

  useLayoutEffect(() => {
    const find = (prefix) => [...instance.bones.entries()].find(([name]) => name.startsWith(prefix))?.[1];
    for (const [short, prefix] of Object.entries(JOINT)) {
      const bone = find(prefix);
      if (!bone) continue;
      const base = instance.bind.get(bone.name) ?? new THREE.Euler();
      const angles = Array.isArray(pose[short]) && pose[short].length === 3 ? pose[short] : [0, 0, 0];
      bone.rotation.set(base.x + angles[0], base.y + angles[1], base.z + angles[2]);
    }
    const spine = find(JOINT.spine);
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
  const targetHeight = Number.isFinite(object.size?.y) ? object.size.y : 1.8;
  const scale = body.scale * (targetHeight / instance.nativeHeight);

  return (
    <group
      name={object.id}
      onClick={(event) => { event.stopPropagation(); onSelect(object.id, event.nativeEvent?.shiftKey || event.nativeEvent?.metaKey); }}
      position={[position.x, position.y, position.z]}
      ref={group}
      rotation={[rotation.x, rotation.y, rotation.z]}
      scale={scale}
      visible={object.visible !== false}
    >
      <primitive object={instance.clone} />
      {selected ? (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.42, 0.5, 40]} />
          <meshBasicMaterial color="#6fb3b8" opacity={0.9} transparent />
        </mesh>
      ) : null}
      <Billboard height={instance.nativeHeight} label={object.label} />
    </group>
  );
}

function Billboard({ label, height = 2 }) {
  const ref = useRef(null);
  useFrame(({ camera }) => { ref.current?.quaternion.copy(camera.quaternion); });
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "rgba(15,16,19,.82)";
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(0, 0, 256, 64, 12); ctx.fill(); }
    else ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = "#e5e4e0";
    ctx.font = "600 30px system-ui, -apple-system, PingFang SC, sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(String(label ?? "").slice(0, 8), 128, 34);
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    return map;
  }, [label]);
  return (
    <sprite position={[0, height * 1.08, 0]} ref={ref} scale={[height * 0.5, height * 0.125, 1]}>
      <spriteMaterial depthTest={false} map={texture} transparent />
    </sprite>
  );
}

/** 几何体道具。object.geometry 决定形状,缺省是盒子。 */
function StageGeometry({ object, selected, onSelect }) {
  const group = useRef(null);
  const position = v3(object.position);
  const rotation = v3(object.rotation);
  const size = v3(object.size, 1);
  const half = (size.y || 1) / 2;
  const geometry = useMemo(() => {
    const [x, y, z] = [size.x || 1, size.y || 1, size.z || 1];
    switch (object.geometry) {
      case "sphere": return new THREE.SphereGeometry(Math.max(x, z) / 2, 32, 24);
      case "cylinder": return new THREE.CylinderGeometry(x / 2, x / 2, y, 32);
      case "cone": return new THREE.ConeGeometry(x / 2, y, 32);
      case "torus": return new THREE.TorusGeometry(x / 2, Math.min(x, z) / 6, 16, 40);
      case "pyramid": return new THREE.ConeGeometry(x / 2, y, 4);
      default: return new THREE.BoxGeometry(x, y, z);
    }
  }, [object.geometry, size.x, size.y, size.z]);

  return (
    <group
      name={object.id}
      onClick={(event) => { event.stopPropagation(); onSelect(object.id, event.nativeEvent?.shiftKey || event.nativeEvent?.metaKey); }}
      position={[position.x, position.y + half, position.z]}
      ref={group}
      rotation={[rotation.x, rotation.y, rotation.z]}
      visible={object.visible !== false}
    >
      <mesh castShadow geometry={geometry} receiveShadow>
        <meshStandardMaterial color={object.color || "#5d6672"} roughness={0.8} />
      </mesh>
      <lineSegments>
        <edgesGeometry args={[geometry]} />
        <lineBasicMaterial color={selected ? "#6fb3b8" : "#1b1d21"} />
      </lineSegments>
    </group>
  );
}

/** 会话内导入的本地 GLB。不落盘,刷新即失效。 */
function LocalModel({ object, url, selected, onSelect }) {
  const { scene } = useGLTF(url);
  const group = useRef(null);
  const clone = useMemo(() => scene.clone(true), [scene]);
  const position = v3(object.position);
  const rotation = v3(object.rotation);
  return (
    <group
      name={object.id}
      onClick={(event) => { event.stopPropagation(); onSelect(object.id, event.nativeEvent?.shiftKey || event.nativeEvent?.metaKey); }}
      position={[position.x, position.y, position.z]}
      ref={group}
      rotation={[rotation.x, rotation.y, rotation.z]}
      scale={Number.isFinite(object.size?.y) ? object.size.y : 1}
      visible={object.visible !== false}
    >
      <primitive object={clone} />
      <Billboard label={object.label} />
    </group>
  );
}

/** 走位路线。routes 会被 automation executor 投影成 shot.cameraTrajectoryPlan 进提示词。 */
function StageRoute({ route, selected, onSelect }) {
  const points = useMemo(
    () => (route.points ?? []).map((point) => [point.x ?? 0, (point.y ?? 0) + 0.04, point.z ?? 0]),
    [route.points]
  );
  if (points.length < 2) return null;
  const color = route.color || (route.type === "camera" ? "#d9a441" : "#6fb3b8");
  return (
    <group onClick={(event) => { event.stopPropagation(); onSelect(route.id, event.nativeEvent?.shiftKey || event.nativeEvent?.metaKey); }}>
      <Line color={color} dashSize={0.18} dashed={route.type === "camera"} gapSize={0.12}
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

/** 全景环境球:连进导演节点的全景图当内壁贴图。 */
function PanoramaSphere({ url, radius, yaw }) {
  const [texture, setTexture] = useState(null);
  useEffect(() => {
    if (!url) { setTexture(null); return undefined; }
    let alive = true;
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    loader.load(url, (loaded) => {
      if (!alive) { loaded.dispose(); return; }
      loaded.colorSpace = THREE.SRGBColorSpace;
      loaded.mapping = THREE.EquirectangularReflectionMapping;
      setTexture(loaded);
    }, undefined, () => setTexture(null));
    return () => { alive = false; };
  }, [url]);
  if (!texture) return null;
  return (
    <mesh rotation={[0, yaw ?? 0, 0]} scale={[-1, 1, 1]}>
      <sphereGeometry args={[radius ?? 40, 60, 40]} />
      <meshBasicMaterial fog={false} map={texture} side={THREE.BackSide} toneMapped={false} />
    </mesh>
  );
}

function ActiveCameraRig({ camera }) {
  const ref = useRef(null);
  const { size } = useThree();
  useEffect(() => {
    if (!ref.current) return;
    ref.current.lookAt(v3(camera.target));
    ref.current.updateProjectionMatrix();
  }, [camera, size]);
  const position = v3(camera.position);
  return (
    <PerspectiveCamera far={400} fov={camera.fov || 40} makeDefault near={0.05}
      position={[position.x, position.y, position.z]} ref={ref} />
  );
}

/** 六向正交视图:把导演视角相机搬到轴向位置。 */
function AxisViewRig({ request }) {
  const { camera, controls } = useThree();
  useEffect(() => {
    if (!request?.axis) return;
    const distance = 11;
    const map = {
      x: [distance, 1.4, 0], y: [0, distance, 0.001], z: [0, 1.4, distance]
    };
    const base = map[request.axis] ?? map.z;
    const sign = request.sign ?? 1;
    camera.position.set(base[0] * sign, request.axis === "y" ? base[1] * sign : base[1], base[2] * sign);
    camera.lookAt(0, 1, 0);
    if (controls?.target) { controls.target.set(0, 1, 0); controls.update?.(); }
  }, [camera, controls, request]);
  return null;
}

/** 地面拖拽:直接抓住角色在地面上拖,选中几个就一起动。
 *
 *  不用 TransformControls —— three r169+ 把它改成了 Controls 子类、手柄要走
 *  getHelper(),而 drei 10.7.7 还按旧方式处理,在 three r182 下手柄不渲染;
 *  即便自己接上,细箭头对摆人也不如直接拖顺手。这里用一块隐形地面接管
 *  指针,把位移原样加到所有选中对象上,松手一次提交。 */
function GroundDrag({ selectedIds, enabled, snap, onTransform, onSelect }) {
  const { scene, controls } = useThree();
  const drag = useRef(null);

  const snapTo = (value) => (snap ? Math.round(value / snap) * snap : value);

  const begin = (event) => {
    if (!enabled) return;
    const ids = selectedIds.length ? selectedIds : [];
    const members = ids.map((id) => scene.getObjectByName(id)).filter(Boolean);
    if (!members.length) return;
    event.stopPropagation();
    if (controls) controls.enabled = false;
    event.target?.setPointerCapture?.(event.pointerId);
    drag.current = {
      origin: event.point.clone(),
      members: members.map((object) => ({ object, from: object.position.clone() }))
    };
  };

  const move = (event) => {
    const state = drag.current;
    if (!state) return;
    event.stopPropagation();
    const delta = event.point.clone().sub(state.origin);
    for (const m of state.members) {
      m.object.position.set(
        snapTo(m.from.x + delta.x),
        m.from.y,
        snapTo(m.from.z + delta.z)
      );
    }
  };

  const finish = (event) => {
    const state = drag.current;
    drag.current = null;
    if (controls) controls.enabled = true;
    event?.target?.releasePointerCapture?.(event.pointerId);
    if (!state) return;
    const moved = state.members.filter((m) => m.object.position.distanceTo(m.from) > 0.001);
    if (!moved.length) return;
    onTransform?.(state.members.map((m) => ({
      id: m.object.name,
      position: { x: round(m.object.position.x), y: round(m.object.position.y), z: round(m.object.position.z) },
      rotation: { x: round(m.object.rotation.x), y: round(m.object.rotation.y), z: round(m.object.rotation.z) }
    })));
  };

  return (
    <mesh
      onPointerDown={begin}
      onPointerMove={move}
      onPointerUp={finish}
      onPointerLeave={finish}
      position={[0, 0, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      visible={false}
    >
      <planeGeometry args={[400, 400]} />
      <meshBasicMaterial />
    </mesh>
  );
}

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
  selectedIds = [],
  activeCameraId,
  viewMode,
  gridSnap,
  groundOpacity,
  panorama,
  localModels,
  gizmo,            // "translate" | "rotate" | "scale" | null
  axisView,
  onSelect,
  onTransform,
  onReady
}) {
  const objects = stage?.objects ?? [];
  const routes = stage?.routes ?? [];
  const cameras = stage?.cameras ?? [];
  const activeCamera = cameras.find((item) => item.id === activeCameraId) ?? cameras[0] ?? null;
  const cameraView = viewMode === "camera" && activeCamera;
  const isSelected = (id) => selectedIds.includes(id);

  return (
    <Canvas gl={{ preserveDrawingBuffer: true, antialias: true }} onCreated={(state) => onReady?.(state)} shadows>
      <color args={["#101216"]} attach="background" />
      {panorama?.url ? null : <fog args={["#101216", 26, 78]} attach="fog" />}

      {cameraView
        ? <ActiveCameraRig camera={activeCamera} />
        : <PerspectiveCamera far={400} fov={46} makeDefault near={0.05} position={[7, 5.2, 9]} />}

      <hemisphereLight args={["#cfd8e3", "#20242b", 0.72]} />
      <directionalLight castShadow intensity={2.1} position={[6, 11, 5]}
        shadow-camera-bottom={-16} shadow-camera-left={-16} shadow-camera-right={16}
        shadow-camera-top={16} shadow-mapSize={[2048, 2048]} />
      <directionalLight intensity={0.5} position={[-8, 5, -6]} />

      <PanoramaSphere radius={panorama?.radius} url={panorama?.url} yaw={panorama?.yaw} />

      <mesh position={[0, -0.001, 0]} receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color="#171a1f" opacity={groundOpacity} roughness={1} transparent />
      </mesh>
      <Grid cellColor="#2b3038" cellSize={gridSnap || 0.5} fadeDistance={62} infiniteGrid
        sectionColor="#3d444f" sectionSize={(gridSnap || 0.5) * 10} />

      <Suspense fallback={null}>
        {objects.map((object) => {
          const shared = { object, onSelect, selected: isSelected(object.id) };
          const localUrl = localModels?.[object.id];
          if (object.type === "character") return <Mannequin key={object.id} {...shared} />;
          if (localUrl) return <LocalModel key={object.id} url={localUrl} {...shared} />;
          return <StageGeometry key={object.id} {...shared} />;
        })}
      </Suspense>

      {routes.map((route) => (
        <StageRoute key={route.id} onSelect={onSelect} route={route} selected={isSelected(route.id)} />
      ))}

      {!cameraView && cameras.map((camera) => (
        <CameraMarker active={camera.id === activeCameraId} camera={camera} key={camera.id} onSelect={onSelect} />
      ))}

      {/* 场景内直接拖拽摆位:松手才落盘,拖动期间由 makeDefault 的 OrbitControls 自动让位 */}
      {!cameraView ? (
        <GroundDrag enabled={Boolean(gizmo)} onSelect={onSelect} onTransform={onTransform}
          selectedIds={selectedIds} snap={gridSnap} />
      ) : null}

      {!cameraView ? <AxisViewRig request={axisView} /> : null}
      {!cameraView ? <OrbitControls makeDefault maxPolarAngle={Math.PI / 2.02} target={[0, 1, 0]} /> : null}
    </Canvas>
  );
}

const round = (value) => Number(Number(value).toFixed(3));
