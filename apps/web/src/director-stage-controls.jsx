"use client";

// 导演台里可复用的小控件:工具坞分组与下拉、三分量向量行、关节角度行。
// 都是纯受控组件,不碰导演台状态。

import { DEG } from "./director-stage-units.js";

export function DockGroup({ children }) {
  return <div className="dock-group">{children}</div>;
}

/** 坞上的下拉:点开一层浮层,避免把所有按钮平铺成一长条。 */
export function DockMenu({ label, disabled, children }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return undefined;
    const close = () => setOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [open]);
  return (
    <span className="dock-menu">
      <button className={open ? "on" : ""} disabled={disabled}
        onClick={(event) => { event.stopPropagation(); setOpen((value) => !value); }} type="button">{label}</button>
      {open ? <div className="dock-menu-pop" onClick={(event) => event.stopPropagation()}>{children}</div> : null}
    </span>
  );
}

export function VectorRow({ label, value, onChange, step = 0.25, deg = false }) {
  const scale = deg ? DEG : 1;
  const read = (axis) => Number(((value?.[axis] ?? 0) * scale).toFixed(2));
  const write = (axis, next) => onChange({
    x: value?.x ?? 0, y: value?.y ?? 0, z: value?.z ?? 0,
    ...(value?.atMs !== undefined ? { atMs: value.atMs } : {}),
    [axis]: Number(next) / scale
  });
  return (
    <div className="vector-row">
      <span>{label}</span>
      {["x", "y", "z"].map((axis) => (
        <input key={axis} onChange={(event) => write(axis, event.target.value)} step={step} type="number" value={read(axis)} />
      ))}
    </div>
  );
}

export function JointRow({ label, value, onChange, onCommit }) {
  return (
    <div className="joint-row">
      <span>{label}</span>
      {[0, 1, 2].map((axis) => (
        <input
          key={axis}
          max={170}
          min={-170}
          onChange={(event) => onChange(axis, Number(event.target.value))}
          onKeyUp={onCommit}
          onPointerUp={onCommit}
          type="range"
          value={Math.round((value[axis] ?? 0) * DEG)}
        />
      ))}
    </div>
  );
}
