"use client";

import { SCRIPT_REVIEW_FIELDS, SCRIPT_ROW_FIELDS, scriptRowFieldValue, scriptRowMissingFields } from "@ununu/unutv-contracts";
import { AlignJustify, Maximize2, Play, Plus, Split, X } from "lucide-react";
import { useState } from "react";
import { ScriptAssetBoard } from "./ScriptAssetBoard.jsx";
import { mergeScriptAssetSlots } from "./script-asset-board.js";
import { isMasterScriptNode, isScriptGroupNode, resolveScriptDocument, resolveScriptOwner, scriptGroupsFromDocument } from "./script-group-policy.js";
import { splitScriptGroupsOnCanvas } from "./split-script-groups.js";
import { ScriptStoryreelPlayer } from "./ScriptStoryreelPlayer.jsx";

export function scriptDocumentFromNode(node, nodes = []) {
  return resolveScriptDocument(node, nodes);
}

export function scriptRowsFromNode(node, nodes = []) {
  return scriptDocumentFromNode(node, nodes)?.rows || [];
}

function fieldCell(row, field) {
  const text = scriptRowFieldValue(row, field.key);
  return {
    empty: !text,
    text: text || "未想"
  };
}

function missingSummary(rows) {
  const missing = new Set();
  for (const row of rows) {
    for (const field of scriptRowMissingFields(row)) missing.add(field.label);
  }
  return [...missing];
}

function reviewRows(rows) {
  const items = [];
  let lastScene = null;
  let lastGroup = null;
  for (const row of rows) {
    const sceneId = row.sceneId || "SC01";
    if (sceneId !== lastScene) {
      items.push({ type: "scene", id: `scene-${sceneId}`, sceneId });
      lastScene = sceneId;
      lastGroup = null;
    }
    const groupNumber = Number(row.groupNumber) || 1;
    if (groupNumber !== lastGroup) {
      items.push({
        type: "group",
        id: `group-${groupNumber}`,
        groupNumber,
        count: rows.filter((item) => (Number(item.groupNumber) || 1) === groupNumber).length
      });
      lastGroup = groupNumber;
    }
    items.push({ type: "shot", id: row.id || `shot-${row.shotNumber}`, row });
  }
  return items;
}

function ScriptResourceCell({ label, references = [] }) {
  if (!references.length) {
    return (
      <button aria-label={`${label}等待生成后回填`} className="script-resource-add" disabled title={`${label}将在资源生成后自动回填`} type="button">
        <Plus size={14} />
      </button>
    );
  }

  return (
    <div aria-label={label} className="script-resource-list">
      {references.map((reference) => (
        <span className="script-resource-thumb" key={`${reference.assetId || reference.label}-${reference.versionId || reference.mediaId || ""}`} title={reference.label ?? label}>
          {reference.thumbnailUrl ? <img alt={reference.label ?? label} src={reference.thumbnailUrl} /> : <AlignJustify size={15} />}
        </span>
      ))}
    </div>
  );
}

export function ScriptEmptySurface() {
  return (
    <div className="script-empty-surface" data-testid="script-node-empty-state">
      <div aria-label="等待生成分镜脚本" className="script-empty-mark">
        <AlignJustify size={54} strokeWidth={2.8} />
      </div>
    </div>
  );
}

export function ScriptResourceSurface({ groupMeta, onExpand, onPreview, onSplit, readOnly = false, rows, splitting = false, title }) {
  const missing = missingSummary(rows);
  const groups = scriptGroupsFromDocument({ rows });
  return (
    <div className="script-node-table-surface" data-testid="script-node-table-state">
      <div className="script-node-table-title">
        <strong>{title}</strong>
        <div className="script-node-table-actions">
          {groupMeta ? <em className="script-group-meta">{groupMeta}</em> : null}
          {missing.length ? <em className="script-missing-count">{missing.length} 项未想</em> : <em className="script-missing-count is-complete">全列已想</em>}
          {onPreview ? (
            <button
              aria-label="导演预演"
              className="script-split-button nodrag nopan"
              onClick={(event) => {
                event.stopPropagation();
                onPreview();
              }}
              title="按这组时长、画面和台词播一遍，不生成视频"
              type="button"
            >
              <Play size={13} />
              <span>导演预演</span>
            </button>
          ) : null}
          {onSplit ? (
            <button
              aria-label="拆出生成组"
              className="script-split-button nodrag nopan"
              disabled={readOnly || splitting || !groups.length}
              onClick={(event) => {
                event.stopPropagation();
                onSplit();
              }}
              title="按生成组拆到画布右侧，和这张表同源同步"
              type="button"
            >
              <Split size={13} />
              <span>{splitting ? "拆分中" : `拆出生成组${groups.length ? ` ${groups.length}` : ""}`}</span>
            </button>
          ) : null}
          <button
            aria-label="放大脚本表"
            className="nodrag nopan"
            onClick={(event) => {
              event.stopPropagation();
              onExpand?.();
            }}
            type="button"
          >
            <Maximize2 size={14} />
          </button>
        </div>
      </div>
      <div className="script-node-table-scroll">
        <div className="script-node-table-row header is-review">
          {SCRIPT_REVIEW_FIELDS.map((field) => <span key={field.key}>{field.label}</span>)}
        </div>
        {reviewRows(rows).map((item) => item.type === "scene"
          ? <div className="script-node-table-row is-group" key={item.id}><span>场次 {item.sceneId}</span></div>
          : item.type === "group"
          ? <div className="script-node-table-row is-group" key={item.id}><span>生成组 {item.groupNumber} · {item.count} 镜</span></div>
          : <div className="script-node-table-row is-review" key={item.id}>
            {SCRIPT_REVIEW_FIELDS.map((field) => {
              const cell = fieldCell(item.row, field);
              return <span className={cell.empty ? "is-missing" : undefined} key={field.key}>{cell.text}</span>;
            })}
          </div>)}
      </div>
    </div>
  );
}

export function ScriptTableOverlay({ actions, canvas, node, onClose, readOnly = false, rows, title }) {
  const owner = resolveScriptOwner(node, canvas?.nodes || []) || node;
  const document = resolveScriptDocument(node, canvas?.nodes || []);
  const viewRows = rows?.length ? rows : document?.rows || [];
  const missing = missingSummary(viewRows);
  const [step, setStep] = useState("shots");
  const [splitting, setSplitting] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const assetSlots = mergeScriptAssetSlots(viewRows, owner?.payload?.scriptDocument?.assets || []);
  const boundAssets = assetSlots.filter((item) => item.mediaId).length;
  const canSplit = isMasterScriptNode(node) && scriptGroupsFromDocument(document).length > 0;

  async function splitGroups() {
    if (readOnly || splitting || !canSplit) return;
    setSplitting(true);
    try {
      const result = await splitScriptGroupsOnCanvas({ canvas, source: node });
      await actions.refresh?.();
      actions.notify?.(`已拆出 ${result.groupCount} 个生成组，和脚本表同源同步`, false);
    } catch (error) {
      actions.notify?.(error);
    } finally {
      setSplitting(false);
    }
  }
  return (
    <div className="script-table-overlay-layer" role="presentation">
      <section aria-label="脚本视图" aria-modal="true" className="script-table-overlay" role="dialog">
        <header className="script-workspace-head">
          <strong className="script-workspace-title">{title}</strong>
          <nav aria-label="分镜步骤" className="script-workspace-steps">
            <button className={`script-workspace-step${step === "shots" ? " is-active" : ""}`} onClick={() => setStep("shots")} type="button">
              <em>1</em>
              <span>
                <strong>确认镜头</strong>
                <small>{viewRows.length} 个镜头待核对</small>
              </span>
            </button>
            <i aria-hidden="true" className="script-workspace-step-line" />
            <button className={`script-workspace-step${step === "assets" ? " is-active" : ""}`} onClick={() => setStep("assets")} type="button">
              <em>2</em>
              <span>
                <strong>准备资产</strong>
                <small>{boundAssets}/{assetSlots.length} 已绑定</small>
              </span>
            </button>
            <i aria-hidden="true" className="script-workspace-step-line" />
            <button className={`script-workspace-step${step === "prompts" ? " is-active" : ""}`} onClick={() => setStep("prompts")} type="button">
              <em>3</em>
              <span>
                <strong>合成提示词</strong>
                <small>翻译后再发给模型</small>
              </span>
            </button>
          </nav>
          <div className="script-workspace-tools">
            {canSplit ? (
              <button className="script-split-button" disabled={readOnly || splitting} onClick={() => void splitGroups()} type="button">
                <Split size={13} />
                <span>{splitting ? "拆分中" : "拆出生成组"}</span>
              </button>
            ) : isScriptGroupNode(node) ? (
              <>
                <small>与脚本表同源同步</small>
                <button className="script-split-button" onClick={() => setPreviewOpen(true)} type="button">
                  <Play size={13} />
                  <span>导演预演</span>
                </button>
              </>
            ) : null}
            {step === "assets" ? <small>{boundAssets}/{assetSlots.length} 已绑定</small> : null}
            <button aria-label="关闭脚本视图" className="script-workspace-close nodrag nopan" onClick={onClose} type="button">
              <X size={14} />
            </button>
          </div>
        </header>
        <div className="script-workspace-body">
        {step === "assets" && canvas && node ? <ScriptAssetBoard actions={actions} canvas={canvas} node={owner || node} readOnly={readOnly} rows={viewRows} /> : null}
        {step === "prompts" ? <div className="script-prompt-step"><p>提示词不直接发表结构。资产绑好后，再按行把画面、台词、声音翻译拼接成视频提示词。</p></div> : null}
        {step === "shots" ? <div className="script-table-overlay-scroll">
          <p className="script-table-missing">{missing.length ? `未想：${missing.join("、")}` : "全列已想"}{isScriptGroupNode(node) ? " · 改这里会写回分镜脚本" : ""}</p>
          <table>
            <thead>
              <tr>
                {SCRIPT_ROW_FIELDS.map((field) => <th key={field.key}>{field.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {reviewRows(viewRows).flatMap((item) => item.type === "scene"
                ? [<tr className="is-group" key={item.id}><td colSpan={SCRIPT_ROW_FIELDS.length}>场次 {item.sceneId}</td></tr>]
                : item.type === "group"
                ? [<tr className="is-group" key={item.id}><td colSpan={SCRIPT_ROW_FIELDS.length}>生成组 {item.groupNumber} · {item.count} 镜</td></tr>]
                : [<tr key={item.id}>
                  {SCRIPT_ROW_FIELDS.map((field) => {
                    const cell = fieldCell(item.row, field);
                    return <td className={cell.empty ? "is-missing" : undefined} key={field.key}>{cell.text}</td>;
                  })}
                </tr>])}
            </tbody>
          </table>
        </div> : null}
        </div>
      </section>
      {previewOpen ? (
        <ScriptStoryreelPlayer
          actions={actions}
          anchor={node}
          assets={owner?.payload?.scriptDocument?.assets || []}
          canvas={canvas}
          canvasId={canvas?.id || node?.canvasId}
          nodes={canvas?.nodes || []}
          onClose={() => setPreviewOpen(false)}
          owner={owner}
          projectId={owner?.projectId || node?.projectId}
          rows={viewRows}
          title={title || document?.title || "导演预演"}
        />
      ) : null}
    </div>
  );
}
