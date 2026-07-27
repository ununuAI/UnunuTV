"use client";

import { useEffect, useRef, useState } from "react";
import { CinematicWorkspacePanel } from "./CinematicWorkspacePanel.jsx";
import {
  constrainCinematicControlFrame,
  defaultCinematicControlFrame,
  moveCinematicControlFrame,
  resizeCinematicControlFrame
} from "./cinematic-control-window-policy.js";

const viewport = () => ({
  width: typeof window === "undefined" ? 1440 : window.innerWidth,
  height: typeof window === "undefined" ? 900 : window.innerHeight
});

const storageKey = (projectId) => `unutv:cinematic-control-window:v3:${projectId}`;

function interactiveTarget(target) {
  return target instanceof Element && Boolean(target.closest("button, input, textarea, select, a, [contenteditable='true'], summary"));
}

export function CinematicControlWindow({ node, notify, onClose, projectId, readOnly }) {
  const windowRef = useRef(null);
  const gestureRef = useRef(null);
  const [frame, setFrame] = useState(() => defaultCinematicControlFrame(viewport()));

  useEffect(() => {
    let next = defaultCinematicControlFrame(viewport());
    try {
      const stored = window.localStorage.getItem(storageKey(projectId));
      if (stored) next = constrainCinematicControlFrame(JSON.parse(stored), viewport());
    } catch {
      // Invalid personal view state must never block access to the production contract.
    }
    setFrame(next);
  }, [projectId]);

  useEffect(() => {
    const constrain = () => setFrame((current) => constrainCinematicControlFrame(current, viewport()));
    window.addEventListener("resize", constrain);
    return () => window.removeEventListener("resize", constrain);
  }, []);

  useEffect(() => {
    try { window.localStorage.setItem(storageKey(projectId), JSON.stringify(frame)); }
    catch { /* Personal view state persistence is best effort. */ }
  }, [frame, projectId]);

  function beginPointer(event, mode) {
    if (mode === "move") {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest(".cp-workspace-header") || interactiveTarget(target)) return;
    }
    event.preventDefault();
    const start = { x: event.clientX, y: event.clientY };
    gestureRef.current = { frame, next: frame, raf: 0 };

    const move = (nextEvent) => {
      const gesture = gestureRef.current;
      if (!gesture) return;
      const delta = { x: nextEvent.clientX - start.x, y: nextEvent.clientY - start.y };
      gesture.next = mode === "move"
        ? moveCinematicControlFrame({ frame: gesture.frame, delta, viewport: viewport() })
        : resizeCinematicControlFrame({ frame: gesture.frame, delta, viewport: viewport() });
      if (gesture.raf) return;
      gesture.raf = window.requestAnimationFrame(() => {
        gesture.raf = 0;
        const element = windowRef.current;
        if (!element) return;
        Object.assign(element.style, {
          left: `${gesture.next.x}px`,
          top: `${gesture.next.y}px`,
          width: `${gesture.next.width}px`,
          height: `${gesture.next.height}px`
        });
      });
    };
    const end = () => {
      const gesture = gestureRef.current;
      if (gesture?.raf) window.cancelAnimationFrame(gesture.raf);
      if (gesture) setFrame(gesture.next);
      gestureRef.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end, { once: true });
    window.addEventListener("pointercancel", end, { once: true });
  }

  return <section
    aria-label="影视总控浮动工作窗"
    className="cinematic-control-window"
    data-cinematic-node-id={node.id}
    data-production-id={node.payload?.productionId || ""}
    onPointerDown={(event) => beginPointer(event, "move")}
    ref={windowRef}
    style={{ height: frame.height, left: frame.x, top: frame.y, width: frame.width }}
  >
    <CinematicWorkspacePanel embedded floating notify={notify} onClose={onClose} projectId={projectId} readOnly={readOnly} selected={node} />
    <button aria-label="调整影视总控窗口大小" className="cinematic-control-resize-handle" onPointerDown={(event) => beginPointer(event, "resize")} type="button" />
  </section>;
}
