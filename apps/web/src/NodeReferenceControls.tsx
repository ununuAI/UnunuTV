"use client";

import { FileText, Image as ImageIcon, Plus, SquarePlay, Volume2, X } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import type { CanvasNode, ScriptAssetItem, VideoP0Actions } from "./prompt-types";

type ReferenceCanvasNode = CanvasNode & {
  lockedReference?: boolean;
  referenceRoleLabel?: string;
  referenceSourceMark?: string;
};

function sourceIcon(node: CanvasNode) {
  if (node.kind === "image" || node.kind === "subject" || node.kind === "material" || node.kind === "historyPick") return <ImageIcon size={17} />;
  if (node.kind === "video" || node.kind === "videoShot" || node.kind === "compose") return <SquarePlay size={17} />;
  if (node.kind === "audio") return <Volume2 size={17} />;
  return <FileText size={17} />;
}

function assetVersion(asset: ScriptAssetItem, versionId: string) {
  return asset.versions.find((version) => version.id === versionId);
}

function videoReferenceRole(mode: string | undefined, index: number) {
  if (mode === "first_frame") return index === 0 ? "首帧" : "未使用";
  if (mode === "first_last_frame") return index === 0 ? "首帧" : index === 1 ? "尾帧" : "未使用";
  if (mode === "text_to_video") return "未使用";
  return mode ? "全能" : "";
}

export function NodeReferenceRows({ actions, assets, node, referenceMode, sourceNodes }: {
  actions: VideoP0Actions;
  assets: ScriptAssetItem[];
  node: CanvasNode;
  sourceNodes: ReferenceCanvasNode[];
  referenceMode?: string;
}) {
  const assetById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);
  const assetReferences = node.assetReferences ?? [];
  if (sourceNodes.length === 0 && assetReferences.length === 0) return null;

  return (
    <div className="generator-ref-row compact-upstream-row" aria-label="节点参考输入">
      {sourceNodes.map((source, index) => {
        const waitingForMedia = (source.kind === "image" || source.kind === "video" || source.kind === "audio") && !source.previewUrl;
        return (
          <span className={`generator-ref-chip compact-upstream-ref${waitingForMedia ? " waiting" : ""}`} key={`edge:${source.id}`} title={source.lockedReference ? `${source.title} · 来自 Core 编译` : waitingForMedia ? `${source.title} · 等待生成结果` : `${source.title} · 来自画布连线`}>
            <span className="ref-thumb">{source.kind === "audio" ? <Volume2 size={17} /> : source.previewUrl ? <img alt="" src={source.previewUrl} /> : sourceIcon(source)}</span>
            <span className="ref-count">{index + 1}</span>
            {referenceMode ? <span className="ref-role-mark">{source.referenceRoleLabel || videoReferenceRole(referenceMode, index)}</span> : null}
            <span className="ref-source-mark">{source.referenceSourceMark || "线"}</span>
            {!source.lockedReference ? <button
              aria-label={`断开与「${source.title}」的连接`}
              className="generator-ref-remove"
              onClick={(event) => {
                event.stopPropagation();
                if (event.detail === 0) actions.deleteEdge(source.id, node.id);
              }}
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                actions.deleteEdge(source.id, node.id);
              }}
              title={`断开「${source.title}」`}
              type="button"
            ><X size={10} /></button> : null}
          </span>
        );
      })}
      {assetReferences.map((reference, assetIndex) => {
        const asset = reference.assetId ? assetById.get(reference.assetId) : undefined;
        const version = asset ? assetVersion(asset, reference.versionId) : undefined;
        const title = reference.displayName ?? asset?.name ?? reference.assetId;
        const displayIndex = reference.providerIndex ?? sourceNodes.length + assetIndex + 1;
        return (
          <span className="generator-ref-chip compact-upstream-ref library-ref" key={`asset:${reference.assetId}:${reference.versionId}`} title={`${title} · 来自${asset?.scope === "global" ? "全局" : "本项目"}资源库`}>
          <span className="ref-thumb">{version?.kind === "audio" || asset?.mediaKind === "audio" ? <Volume2 size={17} /> : reference.previewUrl ?? version?.url ?? asset?.thumbnailUrl ? <img alt="" src={reference.previewUrl ?? version?.url ?? asset?.thumbnailUrl} /> : <ImageIcon size={17} />}</span>
            <span className="ref-count">{displayIndex}</span>
            {referenceMode ? <span className="ref-role-mark">{videoReferenceRole(referenceMode, sourceNodes.length + assetIndex)}</span> : null}
            <span className="ref-source-mark">库</span>
            {!reference.lockedReference && reference.assetId && reference.versionId ? <button
              aria-label={`移除资源库参考「${title}」`}
              className="generator-ref-remove"
              onClick={(event) => {
                event.stopPropagation();
                if (event.detail === 0) void actions.unbindNodeAssetReference(node.id, reference.assetId, reference.versionId);
              }}
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void actions.unbindNodeAssetReference(node.id, reference.assetId, reference.versionId);
              }}
              title={`移除资源库参考「${title}」`}
              type="button"
            ><X size={10} /></button> : null}
          </span>
        );
      })}
    </div>
  );
}

export function NodeReferenceControls({ actions, addDisabled = false, addDisabledReason, assets, children, node, referenceMode, sourceNodes }: {
  actions: VideoP0Actions;
  addDisabled?: boolean;
  addDisabledReason?: string;
  assets: ScriptAssetItem[];
  children?: ReactNode;
  node: CanvasNode;
  referenceMode?: string;
  sourceNodes: ReferenceCanvasNode[];
}) {
  return (
    <div className="node-reference-controls">
      <div className="generator-media-tool-row" aria-label="参考设置">
        <button className="generator-addon" disabled={addDisabled} onClick={() => actions.openPanel("referencePicker")} title={addDisabledReason || "从画布或我的资产添加参考"} type="button">
          <Plus size={13} />添加
        </button>
        {children}
      </div>
      <NodeReferenceRows actions={actions} assets={assets} node={node} referenceMode={referenceMode} sourceNodes={sourceNodes} />
    </div>
  );
}
