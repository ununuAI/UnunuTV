"use client";

import { Handle, Position } from "@xyflow/react";
import { Plus } from "lucide-react";
import { useState } from "react";
import { clampConnectionHandleMotion } from "./connection-handle-policy.js";

const EMPTY_MOTION = Object.freeze({ active: false, x: 0, y: 0 });

export function CanvasConnectionHandle({ id, isConnecting = false, label, readOnly, side, zoomPercent = 100 }) {
  const [motion, setMotion] = useState(EMPTY_MOTION);
  const input = side === "input";
  const moveVisual = (event, active = true) => {
    const handle = event.currentTarget.parentElement;
    if (!handle) return;
    const rect = handle.getBoundingClientRect();
    const zoom = Math.max(.02, Number(zoomPercent) / 100 || 1);
    const rawX = (event.clientX - (rect.left + rect.width / 2)) / zoom;
    const rawY = (event.clientY - (rect.top + rect.height / 2)) / zoom;
    setMotion({ active, ...clampConnectionHandleMotion({ input, x: rawX, y: rawY }) });
  };
  const resetVisual = () => setMotion(EMPTY_MOTION);

  return <Handle
    aria-label={label}
    className={`canvas-flow-handle ${input ? "input-handle" : "output-handle"}${input && isConnecting ? " is-connection-target" : ""}`}
    id={id}
    isConnectable={!readOnly}
    position={input ? Position.Left : Position.Right}
    type={input ? "target" : "source"}
  >
    <span
      aria-hidden="true"
      className="handle-sensor nodrag nopan"
      onMouseEnter={(event) => moveVisual(event)}
      onMouseLeave={resetVisual}
      onMouseMove={(event) => moveVisual(event)}
    />
    <span
      aria-hidden="true"
      className={`handle-visual${motion.active ? " is-active" : ""}`}
      style={motion.active ? { "--handle-dx": `${motion.x}px`, "--handle-dy": `${motion.y}px`, transition: "opacity .2s ease, scale .15s ease" } : undefined}
    >
      <span className="handle-plus-icon"><Plus size={18} strokeWidth={1.7} /></span>
    </span>
  </Handle>;
}
