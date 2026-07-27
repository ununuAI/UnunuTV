"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Brush, CircleDot, Eraser, Focus, Grid3X3, ImagePlus, MousePointer2, Redo2, Save, Square, Trash2, Type, Undo2, WandSparkles, X } from "lucide-react";
import { mediaUrlForNode } from "./media-candidate-policy.js";
import { createImageEditOperation, imageEditCanvasSize, imageEditPoint, IMAGE_EDIT_TOOL_ITEMS, updateImageEditOperation } from "./image-edit-canvas-policy.js";
import { renderImageEditCanvas } from "./image-edit-canvas-renderer.js";

const TOOL_ICONS = { select: MousePointer2, brush: Brush, eraser: Eraser, mosaic: WandSparkles, gridMask: Grid3X3, rectangle: Square, arrow: ArrowUpRight, text: Type, number: CircleDot, image: ImagePlus };

function sourceOptions(node, connectedNodes) {
  const options = [];
  const add = (owner, mediaId, label) => {
    if (!mediaId || options.some((item) => item.mediaId === mediaId)) return;
    options.push({ mediaId, label, url: mediaUrlForNode(owner, mediaId) });
  };
  add(node, node.payload?.currentMediaId, "当前结果");
  for (const [index, mediaId] of (node.payload?.historyMediaIds || []).entries()) add(node, mediaId, `历史 ${index + 1}`);
  for (const source of connectedNodes.filter((item) => ["image", "imageEdit"].includes(item.kind))) add(source, source.payload?.currentMediaId, source.title || "连接图片");
  return options;
}

export function ImageEditCanvasWorkspace({ actions, connectedNodes, node, readOnly }) {
  const canvasRef = useRef(null);
  const imageRef = useRef(null);
  const activeRef = useRef(null);
  const options = useMemo(() => sourceOptions(node, connectedNodes), [connectedNodes, node]);
  const persisted = node.payload?.editorDocument || node.payload?.editorSnapshot || {};
  const initialSourceId = persisted.sourceMediaId || node.payload?.currentMediaId || options[0]?.mediaId || null;
  const initialCanvas = imageEditCanvasSize(persisted.canvas?.ratio || "16:9", persisted.canvas || undefined);
  const [document, setDocument] = useState({ version: 1, sourceMediaId: initialSourceId, canvas: { ...initialCanvas, ratio: persisted.canvas?.ratio || "16:9", backgroundColor: persisted.canvas?.backgroundColor || "#ffffff" }, operations: persisted.operations || [] });
  const [tool, setTool] = useState("select");
  const [redo, setRedo] = useState([]);
  const [activeOperation, setActiveOperation] = useState(null);
  const [color, setColor] = useState("#ff5b4d");
  const [size, setSize] = useState(12);
  const [textValue, setTextValue] = useState("文字");
  const [numberValue, setNumberValue] = useState(1);
  const [saving, setSaving] = useState(false);
  const source = options.find((item) => item.mediaId === document.sourceMediaId) || null;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = document.canvas.width;
    canvas.height = document.canvas.height;
    renderImageEditCanvas(canvas, imageRef.current, document, activeOperation);
  }, [activeOperation, document]);

  useEffect(() => {
    imageRef.current = null;
    if (!source?.url) {
      renderImageEditCanvas(canvasRef.current, null, document, activeRef.current);
      return;
    }
    const image = new window.Image();
    image.onload = () => { imageRef.current = image; renderImageEditCanvas(canvasRef.current, image, document, activeRef.current); };
    image.src = source.url;
  }, [source?.url]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.target instanceof HTMLInputElement) return;
      const match = IMAGE_EDIT_TOOL_ITEMS.find((item) => item.shortcut.toLowerCase() === event.key.toLowerCase());
      if (match && !readOnly) setTool(match.value);
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) setRedo((items) => { const operation = items[0]; if (!operation) return items; setDocument((value) => ({ ...value, operations: [...value.operations, operation] })); return items.slice(1); });
        else setDocument((value) => { const operation = value.operations.at(-1); if (!operation) return value; setRedo((items) => [operation, ...items]); return { ...value, operations: value.operations.slice(0, -1) }; });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [readOnly]);

  const pointerDown = (event) => {
    if (readOnly || ["select", "image"].includes(tool)) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const operation = createImageEditOperation(tool, imageEditPoint(event, event.currentTarget), { color, size, text: textValue, number: numberValue });
    activeRef.current = operation;
    setActiveOperation(operation);
  };
  const pointerMove = (event) => {
    if (!activeRef.current) return;
    const operation = updateImageEditOperation(activeRef.current, imageEditPoint(event, event.currentTarget));
    activeRef.current = operation;
    setActiveOperation(operation);
  };
  const pointerUp = () => {
    const operation = activeRef.current;
    if (!operation) return;
    activeRef.current = null;
    setActiveOperation(null);
    setDocument((value) => ({ ...value, operations: [...value.operations, operation] }));
    setRedo([]);
    if (operation.type === "number") setNumberValue((value) => value + 1);
  };
  const setRatio = (ratio) => setDocument((value) => ({ ...value, canvas: { ...value.canvas, ...imageEditCanvasSize(ratio, value.canvas), ratio } }));
  const undo = () => setDocument((value) => { const operation = value.operations.at(-1); if (!operation) return value; setRedo((items) => [operation, ...items]); return { ...value, operations: value.operations.slice(0, -1) }; });
  const redoOne = () => setRedo((items) => { const operation = items[0]; if (!operation) return items; setDocument((value) => ({ ...value, operations: [...value.operations, operation] })); return items.slice(1); });
  const save = async () => {
    if (readOnly || !canvasRef.current) return;
    setSaving(true);
    try { await actions.saveImageEdit(node, { dataUrl: canvasRef.current.toDataURL("image/png"), document: { ...document, updatedAt: new Date().toISOString() } }); }
    finally { setSaving(false); }
  };

  return <section className="image-edit-workspace nodrag nopan nowheel">
    <header><strong>图片编辑</strong><span>{source?.label || "未选择源图"}</span><div><button onClick={() => actions.fitNode(node.id)} title="聚焦" type="button"><Focus size={15} /></button><button onClick={() => actions.setNodeExpanded(node, false)} title="收起" type="button"><X size={16} /></button></div></header>
    <nav aria-label="图片编辑工具">{IMAGE_EDIT_TOOL_ITEMS.map((item) => { const Icon = TOOL_ICONS[item.value]; return <button aria-pressed={tool === item.value} disabled={readOnly} key={item.value} onClick={() => setTool(item.value)} title={`${item.label} (${item.shortcut})`} type="button"><Icon size={16} /><span>{item.label}</span></button>; })}</nav>
    <div className="image-edit-body">
      <aside><strong>连接图片</strong>{options.length ? options.map((item) => <button aria-pressed={item.mediaId === document.sourceMediaId} key={item.mediaId} onClick={() => setDocument((value) => ({ ...value, sourceMediaId: item.mediaId }))} type="button"><img alt="" src={item.url} /><span>{item.label}</span></button>) : <p>连接图片或图片编辑节点后开始</p>}</aside>
      <main><canvas aria-label="图片编辑画布" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} ref={canvasRef} /></main>
      <aside className="image-edit-properties"><strong>工具设置</strong><label>颜色<input disabled={readOnly} onChange={(event) => setColor(event.target.value)} type="color" value={color} /></label><label>笔触<input disabled={readOnly} max="60" min="2" onChange={(event) => setSize(Number(event.target.value))} type="range" value={size} /></label>{tool === "text" ? <label>文字<input disabled={readOnly} onChange={(event) => setTextValue(event.target.value)} value={textValue} /></label> : null}<div className="image-edit-ratios"><button aria-pressed={document.canvas.ratio === "free"} onClick={() => setRatio("free")} type="button">自由</button><button aria-pressed={document.canvas.ratio === "16:9"} onClick={() => setRatio("16:9")} type="button">16:9</button><button aria-pressed={document.canvas.ratio === "9:16"} onClick={() => setRatio("9:16")} type="button">9:16</button></div></aside>
    </div>
    <footer><div><button disabled={!document.operations.length || readOnly} onClick={undo} type="button"><Undo2 size={15} />撤销</button><button disabled={!redo.length || readOnly} onClick={redoOne} type="button"><Redo2 size={15} />重做</button><button disabled={!document.operations.length || readOnly} onClick={() => { setDocument((value) => ({ ...value, operations: [] })); setRedo([]); }} type="button"><Trash2 size={15} />清空</button></div><button className="image-edit-save" disabled={readOnly || saving} onClick={save} type="button"><Save size={15} />{saving ? "保存中" : "保存结果"}</button></footer>
  </section>;
}
