"use client";

import { Handle, Position } from "@xyflow/react";
import { GRID_ASPECT_RATIOS, GRID_LAYOUTS, gridCellIndex, normalizeGridState } from "@ununu/unutv-contracts";
import { Check, Expand, Grid2X2, Image as ImageIcon, LayoutGrid, LoaderCircle, Merge, Ratio, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { mediaUrlForNode } from "./media-candidate-policy.js";

function closeMenu(event) {
  event.currentTarget.closest("details")?.removeAttribute("open");
}

function GridChoiceMenu({ icon: Icon, label, onSelect, options, value }) {
  return <details className="momo-grid-choice nodrag nopan nowheel">
    <summary><Icon size={15} /><span>{label}</span></summary>
    <div className="momo-grid-choice-menu">
      {options.map((option) => <button className={option.value === value ? "active" : ""} key={option.value} onClick={(event) => { closeMenu(event); onSelect(option.value); }} type="button"><span>{option.label}</span>{option.value === value ? <Check size={13} /> : null}</button>)}
    </div>
  </details>;
}

export function MomoGridNode({ actions, node, readOnly = false, selected = false }) {
  const state = normalizeGridState(node.payload);
  const [composing, setComposing] = useState(false);
  const bindings = useMemo(() => {
    const result = Array(state.cellCount).fill(null);
    for (const input of actions.connectedInputs(node.id)) {
      const index = gridCellIndex(input.edge.role);
      if (index >= 0 && index < result.length && input.node.payload?.currentMediaId) result[index] = { ...input, mediaId: input.node.payload.currentMediaId };
    }
    return result;
  }, [actions, node.id, state.cellCount]);

  const compose = async () => {
    if (composing || !bindings.some(Boolean)) return;
    setComposing(true);
    try { await actions.composeGrid(node); } finally { setComposing(false); }
  };

  return <div className="momo-grid-node">
    {selected && !readOnly ? <div aria-label="宫格工具栏" className="momo-grid-toolbar nodrag nopan nowheel">
      <button onClick={() => actions.fitNode(node.id)} type="button"><Expand size={15} /><span>编辑</span></button>
      <i />
      <GridChoiceMenu icon={LayoutGrid} label={state.gridLayout} onSelect={(gridLayout) => actions.configureGrid(node, { gridLayout })} options={GRID_LAYOUTS} value={state.gridLayout} />
      <GridChoiceMenu icon={Ratio} label={state.aspectRatio} onSelect={(aspectRatio) => actions.configureGrid(node, { aspectRatio })} options={GRID_ASPECT_RATIOS} value={state.aspectRatio} />
      <button disabled={composing || !bindings.some(Boolean)} onClick={() => void compose()} type="button">{composing ? <LoaderCircle className="spin" size={15} /> : <Merge size={15} />}<span>合成</span></button>
      <button disabled={!bindings.some(Boolean)} onClick={() => void actions.clearGrid(node)} type="button"><Trash2 size={15} /><span>清空</span></button>
    </div> : null}
    <div className="momo-grid-cells" style={{ gridTemplateColumns: `repeat(${state.cols}, 1fr)`, gridTemplateRows: `repeat(${state.rows}, 1fr)` }}>
      {bindings.map((binding, index) => {
        const url = binding ? mediaUrlForNode(binding.node, binding.mediaId) : "";
        return <div className={`momo-grid-cell${url ? " filled" : ""}`} key={`cell-${index}`}>
          <Handle aria-label={`宫格第 ${index + 1} 格图片输入`} className="momo-grid-cell-handle" id={`cell-${index}`} isConnectable={!readOnly} position={Position.Left} style={{ pointerEvents: actions.isConnecting && !readOnly ? "auto" : "none" }} type="target" />
          {url ? <button aria-label={`查看第 ${index + 1} 格图片`} onDoubleClick={() => actions.fitNode(binding.node.id)} type="button"><img alt="格子图片" draggable={false} src={url} /></button> : <span aria-hidden="true"><ImageIcon size={20} strokeWidth={1.4} /></span>}
        </div>;
      })}
    </div>
  </div>;
}
