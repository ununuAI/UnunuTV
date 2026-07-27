"use client";

import { useEffect, useRef } from "react";

export function EditableNodeTitle({ editing, icon, onBegin, onCancel, onSave, title }) {
  const inputRef = useRef(null);

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  if (editing) {
    return <input
      aria-label="编辑节点标题"
      className="node-title-input nodrag nopan nowheel"
      defaultValue={title}
      maxLength={120}
      onBlur={(event) => void onSave(event.currentTarget.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        } else if (event.key === "Escape") {
          event.preventDefault();
          event.currentTarget.value = title;
          onCancel();
        }
        event.stopPropagation();
      }}
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      ref={inputRef}
    />;
  }

  return <span
    aria-label={`${title}，双击编辑节点标题`}
    className="node-title-label nodrag nopan"
    onClick={(event) => event.stopPropagation()}
    onDoubleClick={(event) => { event.preventDefault(); event.stopPropagation(); onBegin(); }}
    onKeyDown={(event) => {
      if (event.key !== "Enter" && event.key !== "F2") return;
      event.preventDefault();
      event.stopPropagation();
      onBegin();
    }}
    onMouseDown={(event) => event.stopPropagation()}
    onPointerDown={(event) => event.stopPropagation()}
    role="button"
    tabIndex={0}
    title="双击编辑节点标题"
  >{icon}{title}</span>;
}
