"use client";
import { useEffect, useState } from "react";
import { AlertTriangle, ChevronDown, Plus, Save, Trash2 } from "lucide-react";
import {
  CINEMATIC_FIELD_OPTIONS,
  CINEMATIC_HIDDEN_FIELDS,
  CINEMATIC_MULTILINE_FIELDS,
  cinematicFieldLabel,
  cinematicItemTemplate,
  setCinematicValueAtPath
} from "./cinematic-form-policy.js";

type JsonRecord = Record<string, any>;
type Path = Array<string | number>;

const OPEN_SECTIONS = new Set(["characters", "emotionalArc", "generationParameters", "scores"]);

function hasContent(value: unknown) {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") return Object.keys(value).length > 0;
  return value !== "" && value != null;
}

function PrimitiveField({ fieldKey, path, value, update }: { fieldKey: string; path: Path; value: any; update(path: Path, value: any): void }) {
  const label = cinematicFieldLabel(fieldKey);
  const options = CINEMATIC_FIELD_OPTIONS[fieldKey];
  if (typeof value === "boolean") return <label className="cp-form-toggle"><span><b>{label}</b><small>{value ? "已开启" : "已关闭"}</small></span><input checked={value} onChange={(event) => update(path, event.target.checked)} type="checkbox" /></label>;
  if (options) return <label className="cp-form-field"><span>{label}</span><select onChange={(event) => update(path, event.target.value)} value={String(value ?? "")}>{options.map(([id, text]) => <option key={id} value={id}>{text}</option>)}</select></label>;
  if (typeof value === "number") return <label className="cp-form-field"><span>{label}</span><input inputMode="decimal" onChange={(event) => update(path, Number(event.target.value))} type="number" value={value} /></label>;
  const longText = CINEMATIC_MULTILINE_FIELDS.has(fieldKey) || String(value ?? "").length > 90;
  return <label className={`cp-form-field${longText ? " is-wide" : ""}`}><span>{label}</span>{longText ? <textarea onChange={(event) => update(path, event.target.value)} rows={3} value={String(value ?? "")} /> : <input onChange={(event) => update(path, event.target.value)} value={String(value ?? "")} />}</label>;
}

function ArrayField({ fieldKey, path, value, update, depth }: { fieldKey: string; path: Path; value: any[]; update(path: Path, value: any): void; depth: number }) {
  const [open, setOpen] = useState(OPEN_SECTIONS.has(fieldKey));
  const objectItems = value.some((item) => item && typeof item === "object" && !Array.isArray(item));
  const add = () => update(path, [...value, cinematicItemTemplate(fieldKey, value)]);
  const remove = (index: number) => update(path, value.filter((_item, itemIndex) => itemIndex !== index));
  return <details className="cp-form-section" onToggle={(event) => setOpen(event.currentTarget.open)} open={open}><summary><span><b>{cinematicFieldLabel(fieldKey)}</b><small>{value.length ? `${value.length} 项` : "尚未填写"}</small></span><ChevronDown size={15} /></summary><div className={objectItems ? "cp-object-list" : "cp-simple-list"}>
    {value.map((item, index) => objectItems ? <article className="cp-object-item" key={index}><header><strong>{cinematicFieldLabel(fieldKey)} {index + 1}</strong><button aria-label={`删除${cinematicFieldLabel(fieldKey)} ${index + 1}`} onClick={() => remove(index)} type="button"><Trash2 size={13} /></button></header><div className="cp-form-grid"><Fields depth={depth + 1} path={[...path, index]} update={update} value={item} /></div></article> : <div className="cp-list-row" key={index}><input aria-label={`${cinematicFieldLabel(fieldKey)} ${index + 1}`} onChange={(event) => update([...path, index], typeof item === "number" ? Number(event.target.value) : event.target.value)} type={typeof item === "number" ? "number" : "text"} value={String(item ?? "")} /><button aria-label={`删除${cinematicFieldLabel(fieldKey)} ${index + 1}`} onClick={() => remove(index)} type="button"><Trash2 size={13} /></button></div>)}
    {!value.length ? <p className="cp-form-empty">还没有内容，点击下方按钮开始添加。</p> : null}<button className="cp-form-add" onClick={add} type="button"><Plus size={13} />新增{cinematicFieldLabel(fieldKey)}</button>
  </div></details>;
}

function ObjectField({ fieldKey, path, value, update, depth }: { fieldKey: string; path: Path; value: JsonRecord; update(path: Path, value: any): void; depth: number }) {
  const [newKey, setNewKey] = useState("");
  const [open, setOpen] = useState(OPEN_SECTIONS.has(fieldKey));
  const addField = () => {
    const key = newKey.trim();
    if (!key || Object.hasOwn(value, key)) return;
    update(path, { ...value, [key]: "" });
    setNewKey("");
  };
  return <details className="cp-form-section" onToggle={(event) => setOpen(event.currentTarget.open)} open={open}><summary><span><b>{cinematicFieldLabel(fieldKey)}</b><small>{Object.keys(value).length ? `${Object.keys(value).length} 个字段` : "尚未填写"}</small></span><ChevronDown size={15} /></summary><div className="cp-form-grid"><Fields depth={depth + 1} path={path} update={update} value={value} />{!Object.keys(value).length ? <p className="cp-form-empty">这个部分还没有内容，可按项目需要新增一项。</p> : null}</div><div className="cp-object-add"><input aria-label={`新增${cinematicFieldLabel(fieldKey)}字段`} onChange={(event) => setNewKey(event.target.value)} placeholder="新条目名称" value={newKey} /><button disabled={!newKey.trim()} onClick={addField} type="button"><Plus size={13} />添加条目</button></div></details>;
}

function Field({ fieldKey, path, value, update, depth }: { fieldKey: string; path: Path; value: any; update(path: Path, value: any): void; depth: number }) {
  if (CINEMATIC_HIDDEN_FIELDS.has(fieldKey)) return null;
  if (Array.isArray(value)) return <ArrayField depth={depth} fieldKey={fieldKey} path={path} update={update} value={value} />;
  if (value && typeof value === "object") return <ObjectField depth={depth} fieldKey={fieldKey} path={path} update={update} value={value} />;
  return <PrimitiveField fieldKey={fieldKey} path={path} update={update} value={value} />;
}

function Fields({ path, value, update, depth }: { path: Path; value: JsonRecord; update(path: Path, value: any): void; depth: number }) {
  return <>{Object.entries(value || {}).map(([key, entry]) => <Field depth={depth} fieldKey={key} key={key} path={[...path, key]} update={update} value={entry} />)}</>;
}

export function CinematicContractForm({ label, note, value, onSave }: { label: string; note?: string; value: JsonRecord; onSave(value: JsonRecord): Promise<void> }) {
  const [draft, setDraft] = useState<JsonRecord>(() => structuredClone(value));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => { setDraft(structuredClone(value)); setSaved(false); }, [value]);
  const update = (path: Path, next: any) => { setDraft((current) => setCinematicValueAtPath(current, path, next)); setSaved(false); };
  async function save() {
    setBusy(true); setError("");
    try { await onSave(draft); setSaved(true); } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); } finally { setBusy(false); }
  }
  return <section className="cp-contract-form"><header><div><strong>{label}</strong>{note && <small>{note}</small>}</div><button disabled={busy} onClick={() => void save()} type="button"><Save size={14} />{busy ? "保存中" : saved ? "已保存" : "保存修改"}</button></header><div className="cp-contract-form-body"><div className="cp-form-grid"><Fields depth={0} path={[]} update={update} value={draft} /></div></div>{error && <p className="cp-error"><AlertTriangle size={14} />{error}</p>}</section>;
}

function SummaryValue({ value, fieldKey }: { value: any; fieldKey: string }) {
  if (Array.isArray(value)) return value.length ? <ul>{value.map((item, index) => <li key={index}>{item && typeof item === "object" ? <SummaryValue fieldKey={fieldKey} value={item} /> : String(item)}</li>)}</ul> : <span>无</span>;
  if (value && typeof value === "object") return <dl>{Object.entries(value).filter(([key]) => !CINEMATIC_HIDDEN_FIELDS.has(key)).map(([key, entry]) => <div key={key}><dt>{cinematicFieldLabel(key)}</dt><dd><SummaryValue fieldKey={key} value={entry} /></dd></div>)}</dl>;
  return <span>{typeof value === "boolean" ? value ? "是" : "否" : hasContent(value) ? String(value) : "未填写"}</span>;
}

export function CinematicContractSummary({ label, note, value }: { label: string; note?: string; value: JsonRecord }) {
  return <section className="cp-contract-summary"><header><div><strong>{label}</strong>{note ? <small>{note}</small> : null}</div></header><SummaryValue fieldKey="root" value={value} /></section>;
}
