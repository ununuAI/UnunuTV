"use client";

import { Handle, Position } from "@xyflow/react";
import { MemoCanvasNodeCard } from "./CanvasNodeCard.jsx";

export const TEMP_NODE_ID = "__temporary_connection__";
export const DEFAULT_EDGE_OPTIONS = Object.freeze({ type: "default", interactionWidth: 20, style: { stroke: "var(--edge)", strokeWidth: 1.7 } });

function TempConnectionNode() {
  return <div className="temp-connection-node"><Handle className="canvas-flow-handle temp target" id="target" position={Position.Left} type="target" /><span /></div>;
}

export const CANVAS_NODE_TYPES = Object.freeze({ canvasNode: MemoCanvasNodeCard, tempNode: TempConnectionNode });
