"use client";

import { Camera, Grid3X3, LogOut, Maximize2, MousePointer2, RotateCcw, TableProperties, X } from "lucide-react";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { NodeToolbar, Position } from "@xyflow/react";
import { createPortal } from "react-dom";
import * as THREE from "three";

function normalizeYaw(yaw) {
  return ((yaw + 540) % 360) - 180;
}

function captureYaws(count, forwardYaw) {
  if (count === 1) return [normalizeYaw(forwardYaw)];
  const offsets = count === 4 ? [0, 90, 180, -90] : Array.from({ length: 12 }, (_, index) => index * 30);
  return offsets.map((offset) => normalizeYaw(forwardYaw + offset));
}

export function isPanoramaNode(node) {
  const type = node?.payload?.imageNodeType
    || node?.payload?.templateId
    || node?.payload?.modelSelection?.parameters?.templateId
    || node?.payload?.prompt?.parameters?.templateId;
  return node?.kind === "image" && (["scene_panorama_equirectangular", "panorama_equirectangular"].includes(type) || /^720°/.test(node?.title || ""));
}

const PanoramaViewport = forwardRef(function PanoramaViewport({ grid, imageUrl, interactive = true, onOrientation }, ref) {
  const canvasRef = useRef(null);
  const runtimeRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(72, 16 / 9, 0.01, 100);
    camera.rotation.order = "YXZ";
    const geometry = new THREE.SphereGeometry(10, 96, 64);
    geometry.scale(-1, 1, 1);
    const material = new THREE.MeshBasicMaterial({ opacity: 0, transparent: true });
    const abortController = new AbortController();
    let texture;
    let textureObjectUrl;
    void fetch(imageUrl, { signal: abortController.signal }).then((response) => {
      if (!response.ok) throw new Error(`全景纹理读取失败（HTTP ${response.status}）`);
      return response.blob();
    }).then((blob) => {
      if (abortController.signal.aborted) return;
      textureObjectUrl = URL.createObjectURL(blob);
      texture = new THREE.TextureLoader().load(textureObjectUrl, (loadedTexture) => {
        loadedTexture.colorSpace = THREE.SRGBColorSpace;
        material.map = loadedTexture;
        material.opacity = 1;
        material.needsUpdate = true;
      });
    }).catch((error) => { if (!abortController.signal.aborted) console.error("Failed to load panorama texture", error); });
    scene.add(new THREE.Mesh(geometry, material));
    const runtime = { camera, renderer, scene, yaw: 0, pitch: 0 };
    runtimeRef.current = runtime;

    const applyOrientation = () => {
      camera.rotation.y = THREE.MathUtils.degToRad(runtime.yaw);
      camera.rotation.x = THREE.MathUtils.degToRad(runtime.pitch);
      onOrientation({ yaw: runtime.yaw, pitch: runtime.pitch, fov: camera.fov });
    };
    applyOrientation();
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(320, Math.floor(rect.width));
      const height = Math.max(180, Math.floor(rect.height));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    const pointerDown = (event) => {
      event.stopPropagation();
      dragging = true;
      lastX = event.clientX;
      lastY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
    };
    const pointerMove = (event) => {
      event.stopPropagation();
      if (!dragging) return;
      runtime.yaw = normalizeYaw(runtime.yaw + (event.clientX - lastX) * 0.18);
      runtime.pitch = Math.max(-85, Math.min(85, runtime.pitch + (event.clientY - lastY) * 0.18));
      lastX = event.clientX;
      lastY = event.clientY;
      applyOrientation();
    };
    const pointerUp = (event) => {
      event.stopPropagation();
      dragging = false;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    };
    const wheel = (event) => {
      event.preventDefault();
      event.stopPropagation();
      camera.fov = Math.max(30, Math.min(100, camera.fov + Math.sign(event.deltaY) * 4));
      camera.updateProjectionMatrix();
      applyOrientation();
    };
    if (interactive) {
      canvas.addEventListener("pointerdown", pointerDown);
      canvas.addEventListener("pointermove", pointerMove);
      canvas.addEventListener("pointerup", pointerUp);
      canvas.addEventListener("pointercancel", pointerUp);
      canvas.addEventListener("wheel", wheel, { passive: false });
    }
    let frame = window.requestAnimationFrame(function render() { renderer.render(scene, camera); frame = window.requestAnimationFrame(render); });

    return () => {
      runtimeRef.current = null;
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.removeEventListener("pointerdown", pointerDown);
      canvas.removeEventListener("pointermove", pointerMove);
      canvas.removeEventListener("pointerup", pointerUp);
      canvas.removeEventListener("pointercancel", pointerUp);
      canvas.removeEventListener("wheel", wheel);
      geometry.dispose();
      material.dispose();
      abortController.abort();
      texture?.dispose();
      if (textureObjectUrl) URL.revokeObjectURL(textureObjectUrl);
      renderer.dispose();
    };
  }, [imageUrl, interactive, onOrientation]);

  useImperativeHandle(ref, () => ({
    capture(yaw, pitch) {
      const runtime = runtimeRef.current;
      if (!runtime) return undefined;
      const { camera, renderer, scene } = runtime;
      const previous = { yaw: runtime.yaw, pitch: runtime.pitch, fov: camera.fov };
      const previousSize = renderer.getSize(new THREE.Vector2());
      const previousRatio = renderer.getPixelRatio();
      runtime.yaw = yaw; runtime.pitch = pitch;
      camera.rotation.y = THREE.MathUtils.degToRad(yaw); camera.rotation.x = THREE.MathUtils.degToRad(pitch); camera.fov = 72; camera.aspect = 16 / 9; camera.updateProjectionMatrix();
      renderer.setPixelRatio(1); renderer.setSize(1280, 720, false); renderer.render(scene, camera);
      const dataUrl = renderer.domElement.toDataURL("image/png");
      runtime.yaw = previous.yaw; runtime.pitch = previous.pitch;
      camera.rotation.y = THREE.MathUtils.degToRad(previous.yaw); camera.rotation.x = THREE.MathUtils.degToRad(previous.pitch); camera.fov = previous.fov;
      renderer.setPixelRatio(previousRatio); renderer.setSize(previousSize.x, previousSize.y, false); camera.aspect = previousSize.x / Math.max(1, previousSize.y); camera.updateProjectionMatrix();
      return { dataUrl, yaw, pitch, label: `全景视角 ${yaw >= 0 ? "+" : ""}${Math.round(yaw)}°` };
    },
    current() { const runtime = runtimeRef.current; return { yaw: runtime?.yaw || 0, pitch: runtime?.pitch || 0 }; },
    reset() {
      const runtime = runtimeRef.current;
      if (!runtime) return;
      runtime.yaw = 0; runtime.pitch = 0; runtime.camera.fov = 72; runtime.camera.rotation.set(0, 0, 0); runtime.camera.updateProjectionMatrix();
      onOrientation({ yaw: 0, pitch: 0, fov: 72 });
    }
  }), [onOrientation]);

  return <div className={`panorama-viewport${interactive ? " is-interactive" : ""}`} style={{ backgroundImage: `url(${imageUrl})` }}><canvas aria-label={interactive ? "720度全景交互预览" : "720度全景节点预览；拖动可移动节点"} ref={canvasRef} />{grid ? <div aria-hidden="true" className="panorama-composition-grid" /> : null}</div>;
});

function PanoramaWorkspace({ imageUrl, onClose, onExport, title }) {
  const viewportRef = useRef(null);
  const workspaceRef = useRef(null);
  const [grid, setGrid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("拖动画面观察；滚轮调整视野角。");
  const [orientation, setOrientation] = useState({ yaw: 0, pitch: 0, fov: 72 });

  useEffect(() => {
    const closeOnEscape = (event) => { if (event.key === "Escape" && !document.fullscreenElement) onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      if (document.fullscreenElement === workspaceRef.current) void document.exitFullscreen().catch(() => undefined);
    };
  }, [onClose]);

  const closeWorkspace = () => {
    const exitFullscreen = document.fullscreenElement === workspaceRef.current
      ? document.exitFullscreen().catch(() => undefined)
      : Promise.resolve();
    void exitFullscreen.finally(onClose);
  };

  const toggleNativeFullscreen = async () => {
    const workspace = workspaceRef.current;
    if (!workspace) return;
    try {
      if (document.fullscreenElement === workspace) await document.exitFullscreen();
      else { if (document.fullscreenElement) await document.exitFullscreen(); await workspace.requestFullscreen(); }
    } catch { setMessage("浏览器未能切换原生全屏；网页内全景工作区仍可正常使用。"); }
  };

  const exportViews = async (count) => {
    const viewport = viewportRef.current;
    if (!viewport || busy) return;
    setBusy(true);
    setMessage(`正在导出 ${count === 1 ? "当前" : count} 个视角…`);
    try {
      const current = viewport.current();
      const captures = captureYaws(count, current.yaw).flatMap((yaw) => {
        const capture = viewport.capture(yaw, count === 1 ? current.pitch : 0);
        return capture ? [capture] : [];
      });
      if (captures.length !== count) throw new Error("全景视口尚未准备好。");
      await onExport(captures);
      setMessage(`已在画布创建 ${count} 个普通图片节点，并连接回当前全景。`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "全景视角导出失败"); }
    finally { setBusy(false); }
  };

  return createPortal(<section aria-label="720°全景工作区" className="panorama-workspace" ref={workspaceRef}>
    <header>
      <div><span>720°完整环境全景</span><strong>{title}</strong><small>2:1 等距柱状环境权威 · 不是视频首帧</small></div>
      <div className="panorama-workspace-toolbar">
        <button disabled={busy} onClick={() => void exportViews(1)} title="当前视角截图" type="button"><Camera size={16} /><span>当前视角</span></button>
        <button disabled={busy} onClick={() => void exportViews(4)} title="从当前方向导出原点4视角" type="button"><Grid3X3 size={16} /><span>原点4视角</span></button>
        <button disabled={busy} onClick={() => void exportViews(12)} title="每30度导出一个视角" type="button"><TableProperties size={16} /><span>12视角</span></button>
        <button onClick={() => viewportRef.current?.reset()} title="重置视角" type="button"><RotateCcw size={16} /></button>
        <button className={grid ? "active" : ""} onClick={() => setGrid((current) => !current)} title="构图参考线" type="button"><Grid3X3 size={16} /></button>
        <button onClick={() => void toggleNativeFullscreen()} title="原生全屏预览" type="button"><Maximize2 size={16} /></button>
        <button onClick={closeWorkspace} title="返回画布" type="button"><LogOut size={16} /></button>
        <button aria-label="关闭全景预览" onClick={closeWorkspace} type="button"><X size={17} /></button>
      </div>
    </header>
    <main>
      <PanoramaViewport grid={grid} imageUrl={imageUrl} onOrientation={setOrientation} ref={viewportRef} />
      <div className="panorama-axis-readout"><b>Y</b><span>横 {Math.round(orientation.yaw)}° · 纵 {Math.round(orientation.pitch)}°</span><span>视野 {Math.round(orientation.fov)}°</span></div>
    </main>
    <footer><span>{message}</span><small>截图节点可继续连接故事帧、镜头设计和视频节点。</small></footer>
  </section>, document.body);
}

export function PanoramaViewer({ imageUrl, onExport, selected, title }) {
  const rootRef = useRef(null);
  const viewportRef = useRef(null);
  const [grid, setGrid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [interactive, setInteractive] = useState(false);
  const [orientation, setOrientation] = useState({ yaw: 0, pitch: 0, fov: 72 });

  useEffect(() => { if (!selected) setInteractive(false); }, [selected]);

  const exportViews = async (count) => {
    const viewport = viewportRef.current;
    if (!viewport || busy) return;
    setBusy(true);
    try {
      const current = viewport.current();
      const captures = captureYaws(count, current.yaw).flatMap((yaw) => {
        const capture = viewport.capture(yaw, count === 1 ? current.pitch : 0);
        return capture ? [capture] : [];
      });
      if (captures.length === count) await onExport(captures);
    } finally { setBusy(false); }
  };

  const stopToolbarEvent = (event) => event.stopPropagation();
  const renderToolbarButtons = () => <>
    <button aria-pressed={interactive} className={interactive ? "active" : ""} onClick={() => setInteractive((value) => !value)} title={interactive ? "退出全景探索，恢复拖动节点" : "进入全景探索；默认拖动会移动节点"} type="button"><MousePointer2 size={13} /><span>{interactive ? "退出探索" : "探索"}</span></button>
    <button disabled={busy} onClick={() => void exportViews(1)} title="当前视角截图" type="button"><Camera size={13} /></button>
    <button disabled={busy} onClick={() => void exportViews(4)} title="从当前方向导出原点4视角" type="button"><Grid3X3 size={13} /><span>原点4</span></button>
    <button disabled={busy} onClick={() => void exportViews(12)} title="每30度导出一个视角" type="button"><TableProperties size={13} /><span>12</span></button>
    <button onClick={() => viewportRef.current?.reset()} title="重置视角" type="button"><RotateCcw size={13} /></button>
    <button className={grid ? "active" : ""} onClick={() => setGrid((current) => !current)} title="构图参考线" type="button"><Grid3X3 size={13} /></button>
    <button onClick={() => setExpanded(true)} title="放大全景工作区" type="button"><Maximize2 size={13} /></button>
  </>;

  return <div className={`panorama-inline${interactive ? " nodrag nopan nowheel is-exploring" : " is-node-drag-mode"}`} ref={rootRef}>
    <NodeToolbar
      className="panorama-node-toolbar nodrag nopan nowheel"
      isVisible={selected}
      offset={34}
      onClick={stopToolbarEvent}
      onMouseDown={stopToolbarEvent}
      onPointerDown={stopToolbarEvent}
      position={Position.Top}
    >{renderToolbarButtons()}</NodeToolbar>
    <PanoramaViewport grid={grid} imageUrl={imageUrl} interactive={interactive} onOrientation={setOrientation} ref={viewportRef} />
    <span className="panorama-inline-orientation">横 {Math.round(orientation.yaw)}° · 纵 {Math.round(orientation.pitch)}° · 视野 {Math.round(orientation.fov)}°</span>
    {expanded ? <PanoramaWorkspace imageUrl={imageUrl} onClose={() => setExpanded(false)} onExport={onExport} title={title} /> : null}
  </div>;
}
