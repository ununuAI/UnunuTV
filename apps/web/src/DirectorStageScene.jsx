"use client";

// 自建 3D 导演台的场景层(R3F)。
//
// 直接渲染 UnuTV 自己的 DirectorStageDocument —— objects / routes / cameras,
// 不经过任何外来的不透明结构。这样走位路线天然可编辑,截图天然能 record_capture,
// cameraTrajectoryPlan 那条既有链路不需要额外桥接。
//
// 这里只留相机装置、框选与地面拖拽、以及场景装配;
// 演员/几何体/走位线/机位标记等实体在 director-stage-actors.jsx。

import { Suspense, useEffect, useRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Grid, OrbitControls, PerspectiveCamera } from "@react-three/drei";
import * as THREE from "three";
import { CameraMarker, LocalModel, Mannequin, PanoramaSphere, StageGeometry, StageRoute } from "./director-stage-actors.jsx";
import { aspectOf, round, v3 } from "./director-stage-math.js";

// aspectOf 从这里继续对外暴露,调用方不必知道它挪了位置
export { aspectOf };

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

/** 框选:在视口上拖出一个矩形,把投影落在框内的对象一次选中。
 *  用世界坐标投影到屏幕来判定,不做 GPU 拾取——对 previs 这种量级足够,
 *  而且不受遮挡影响(被前排挡住的人也能框到)。 */
function MarqueeSelect({ active, objectIds, onRect, onPick }) {
  const { camera, gl, scene, controls, size } = useThree();
  const state = useRef(null);

  useEffect(() => {
    if (!active) return undefined;
    const el = gl.domElement;
    const local = (event) => {
      const rect = el.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };

    const down = (event) => {
      if (event.button !== 0) return;
      state.current = { from: local(event), to: local(event) };
      if (controls) controls.enabled = false;
      el.setPointerCapture?.(event.pointerId);
      onRect?.(state.current);
    };
    const move = (event) => {
      if (!state.current) return;
      state.current = { ...state.current, to: local(event) };
      onRect?.(state.current);
    };
    const up = (event) => {
      const box = state.current;
      state.current = null;
      if (controls) controls.enabled = true;
      el.releasePointerCapture?.(event.pointerId);
      onRect?.(null);
      if (!box) return;
      const left = Math.min(box.from.x, box.to.x);
      const right = Math.max(box.from.x, box.to.x);
      const top = Math.min(box.from.y, box.to.y);
      const bottom = Math.max(box.from.y, box.to.y);
      if (right - left < 4 && bottom - top < 4) { onPick?.([], event.shiftKey || event.metaKey); return; }
      const picked = [];
      const vector = new THREE.Vector3();
      for (const id of objectIds) {
        const object = scene.getObjectByName(id);
        if (!object) continue;
        object.getWorldPosition(vector).project(camera);
        const sx = (vector.x * 0.5 + 0.5) * size.width;
        const sy = (-vector.y * 0.5 + 0.5) * size.height;
        if (sx >= left && sx <= right && sy >= top && sy <= bottom) picked.push(id);
      }
      onPick?.(picked, event.shiftKey || event.metaKey);
    };

    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      if (controls) controls.enabled = true;
    };
  }, [active, camera, controls, gl, objectIds, onPick, onRect, scene, size]);

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
  marquee,          // true 时左键拖拽为框选
  onMarqueeRect,
  onMarqueePick,
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
        <GroundDrag enabled={Boolean(gizmo) && !marquee} onSelect={onSelect} onTransform={onTransform}
          selectedIds={selectedIds} snap={gridSnap} />
      ) : null}
      {!cameraView ? (
        <MarqueeSelect active={Boolean(marquee)} objectIds={objects.map((item) => item.id)}
          onPick={onMarqueePick} onRect={onMarqueeRect} />
      ) : null}

      {!cameraView ? <AxisViewRig request={axisView} /> : null}
      {!cameraView ? <OrbitControls enableRotate={!marquee} makeDefault maxPolarAngle={Math.PI / 2.02} target={[0, 1, 0]} /> : null}
    </Canvas>
  );
}

