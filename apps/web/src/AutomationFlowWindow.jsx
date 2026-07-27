"use client";

import { useEffect, useRef, useState } from "react";
import { AutomationTaskFlow } from "./AutomationTaskFlow.jsx";
import {
  constrainAutomationFlowFrame,
  defaultAutomationFlowFrame,
  moveAutomationFlowFrame,
  resizeAutomationFlowFrame
} from "./automation-flow-window-policy.js";

const viewport = () => ({
  width: typeof window === "undefined" ? 1440 : window.innerWidth,
  height: typeof window === "undefined" ? 900 : window.innerHeight
});

const storageKey = (projectId) => `unutv:automation-flow-window:v3:${projectId}`;

function interactiveTarget(target) {
  return target instanceof Element && Boolean(target.closest("button, input, textarea, select, a, [contenteditable='true'], summary"));
}

export function AutomationFlowWindow({ control, executionNodes = [], onClose, projectId }) {
  const windowRef = useRef(null);
  const gestureRef = useRef(null);
  const [frame, setFrame] = useState(() => defaultAutomationFlowFrame(viewport()));

  useEffect(() => {
    let next = defaultAutomationFlowFrame(viewport());
    try {
      const stored = window.localStorage.getItem(storageKey(projectId));
      if (stored) next = constrainAutomationFlowFrame(JSON.parse(stored), viewport());
    } catch {
      // Personal window geometry is best-effort view state.
    }
    setFrame(next);
  }, [projectId]);

  useEffect(() => {
    const constrain = () => setFrame((current) => constrainAutomationFlowFrame(current, viewport()));
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
      if (!(target instanceof Element) || !target.closest(".automation-task-popover > header") || interactiveTarget(target)) return;
    }
    event.preventDefault();
    const start = { x: event.clientX, y: event.clientY };
    gestureRef.current = { frame, next: frame, raf: 0 };

    const move = (nextEvent) => {
      const gesture = gestureRef.current;
      if (!gesture) return;
      const delta = { x: nextEvent.clientX - start.x, y: nextEvent.clientY - start.y };
      gesture.next = mode === "move"
        ? moveAutomationFlowFrame({ frame: gesture.frame, delta, viewport: viewport() })
        : resizeAutomationFlowFrame({ frame: gesture.frame, delta, viewport: viewport() });
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
    aria-label="全自动生产流浮动工作窗"
    className="automation-flow-window"
    data-state={control.session.state}
    onPointerDown={(event) => beginPointer(event, "move")}
    ref={windowRef}
    style={{ height: frame.height, left: frame.x, top: frame.y, width: frame.width }}
  >
    <AutomationTaskFlow
      activities={control.automationActivities}
      executionNodes={executionNodes}
      onClose={onClose}
      onRetry={control.actions.retryTask}
      presentation="window"
      reservations={[]}
      runId={control.session.automationRunId}
      tasks={control.automationTasks}
      workflowManifest={control.workflowStatus?.workflowManifest}
      providerCallsIssued={control.workflowStatus?.run?.configuration?.workflowManifest ? Boolean(control.workflowStatus.run.configuration.workflowManifest.providerCallsIssued) : false}
      nextGate={control.workflowStatus?.run?.configuration?.workflowManifest ? "preflight_then_auto_dispatch" : null}
    />
    <button aria-label="调整全自动生产流窗口大小" className="automation-flow-resize-handle" onPointerDown={(event) => beginPointer(event, "resize")} type="button" />
  </section>;
}
