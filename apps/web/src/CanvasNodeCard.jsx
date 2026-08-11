"use client";

import { memo, useEffect, useState } from "react";
import { NodeResizeControl } from "@xyflow/react";
import { Boxes, Check, ChevronDown, Clapperboard, Drama, FileText, Grid2X2Plus, Image as ImageIcon, LoaderCircle, Sparkles, Trash2 } from "lucide-react";
import { CanvasConnectionHandle } from "./CanvasConnectionHandle.jsx";
import { NODE_ITEM_DEFINITIONS } from "./CanvasMenus.jsx";
import { CinematicControllerNode } from "./CinematicControllerNode.jsx";
import { CinematicDomainNode } from "./CinematicDomainNode.jsx";
import { CinematicWorkspacePanel } from "./CinematicWorkspacePanel.jsx";
import { DirectorConsolePanel } from "./DirectorConsolePanel.jsx";
import { EditableNodeTitle } from "./EditableNodeTitle.jsx";
import { NodePromptCard } from "./NodePromptCard.jsx";
import { MomoAssetNode, industrialAssetTypeLabel } from "./MomoAssetNode.jsx";
import { MomoCompareNode } from "./MomoCompareNode.jsx";
import { MomoGridNode } from "./MomoGridNode.jsx";
import { MomoImageEditNode } from "./MomoImageEditNode.jsx";
import { MomoVideoNode } from "./MomoVideoNode.jsx";
import { MomoAudioNode } from "./MomoAudioNode.jsx";
import { MomoWorldNode } from "./MomoWorldNode.jsx";
import { ImageEditCanvasWorkspace } from "./ImageEditCanvasWorkspace.jsx";
import { PanoramaViewer, isPanoramaNode } from "./PanoramaViewer.jsx";
import { IMAGE_DERIVATION_TYPES, primeVideoPreviewFrame } from "./canvas-node-policies.js";
import { mediaCandidatesForNode, mediaReviewStateForNode, mediaUrlForNode } from "./media-candidate-policy.js";
import { mediaEmptyState } from "./media-empty-state-policy.js";
import { INVISIBLE_NODE_RESIZE_HANDLES, shouldEnableInvisibleNodeResize, shouldShowNodePrompt } from "./canvas-node-selection-policy.js";
import { canvasNodeIsExpanded, nodePresentationDensity } from "./canvas-node-view-policy.js";
import { buildNodePresentationV2, nodeVisibleText } from "./node-presentation-view-model.js";
import { assetAuthorityBoardHistory } from "./asset-authority-board-view-policy.js";
import { assetTypeForNode } from "./cinematic-asset-node-view-model.js";
import { ProfessionalContributionNode } from "./ProfessionalContributionNode.jsx";
import { StoryboardBatchNodeTrace } from "./StoryboardBatchNodeTrace.jsx";
import { ResilientMediaImage } from "./ResilientMediaImage.jsx";

const LABELS = { ...Object.fromEntries(NODE_ITEM_DEFINITIONS.map((item) => [item.kind, item.label])), story: "文本", subject: "主体", batch: "分镜表", videoShot: "视频镜头", review: "最终检查", storyboard: "故事板", "video-clip": "视频合成" };

function isStoryboardGroup(node) {
  return ["selection-group", "storyboard-image-group", "storyboard-video-group", "panorama-capture-group"].includes(node.payload?.groupRole);
}

function stop(event) {
  event.preventDefault();
  event.stopPropagation();
}

function CanvasNodeCard({ data, selected }) {
  const { canvasNode: node, canvas, actions, selectedIds, editingTextId, editingTitleId, readOnly = false, zoomPercent = 100 } = data;
  const mediaCandidates = mediaCandidatesForNode(node);
  const [previewMediaId, setPreviewMediaId] = useState(null);
  const displayedMediaId = previewMediaId && mediaCandidates.includes(previewMediaId) ? previewMediaId : node.payload?.currentMediaId;
  const mediaUrl = mediaUrlForNode(node, displayedMediaId);
  const isImage = ["image", "subject", "upload", "material", "historyPick"].includes(node.kind);
  const isVideo = ["video", "videoShot", "compose", "video-clip"].includes(node.kind);
  const isText = node.kind === "text" || node.kind === "story";
  const isScript = node.kind === "script" || node.kind === "batch";
  const isDirector = node.kind === "director";
  const isCinematic = node.kind === "cinematic";
  const isCinematicDomain = ["storyboard", "shot", "generationUnit", "qa"].includes(node.kind);
  const isInlineExpanded = canvasNodeIsExpanded(node);
  const density = nodePresentationDensity(zoomPercent);
  const definition = NODE_ITEM_DEFINITIONS.find((item) => item.kind === node.kind);
  const NodeIcon = definition?.icon || Boxes;
  const presentation = buildNodePresentationV2(node, { density, readOnly });
  const isAudio = node.kind === "audio";
  const isWorld = node.kind === "world";
  const isAsset = node.kind === "asset";
  const isCompare = node.kind === "compare";
  const isGrid = node.kind === "grid";
  const isImageEdit = node.kind === "imageEdit";
  const isPanorama = isPanoramaNode(node);
  const isProfessionalContribution = node.kind === "review" && node.payload?.resourceType === "professional_contribution";
  const batchItemStatus = node.payload?.storyboardBatchTrace?.itemStatus;
  const isGenerating = node.payload?.generationStatus === "running" && batchItemStatus !== "queued";
  const imageEmptyState = mediaEmptyState(node, "image");
  const hasMultiSelection = selectedIds.length > 1;
  const title = isAsset && (!node.title || node.title === "资产") ? `${industrialAssetTypeLabel(assetTypeForNode(node))}资产` : node.title || LABELS[node.kind] || node.kind;
  const status = presentation.state;
  const textContent = nodeVisibleText(node);
  const shortSummary = String(presentation.preview?.summary || "").trim();
  const connectedNodes = actions.connectedNodes(node.id);
  const enableInvisibleResize = shouldEnableInvisibleNodeResize({ readOnly, selected, selectionCount: selectedIds.length });
  const showPrompt = shouldShowNodePrompt({ expanded: isInlineExpanded, node, selected, selectionCount: selectedIds.length });
  const assetBoardHistory = isAsset ? assetAuthorityBoardHistory(node, mediaCandidates).map((entry) => ({ ...entry, url: mediaUrlForNode(node, entry.mediaId) })) : [];

  useEffect(() => {
    if (previewMediaId && !mediaCandidates.includes(previewMediaId)) setPreviewMediaId(null);
  }, [mediaCandidates, previewMediaId]);

  const promoteMedia = async (mediaId) => {
    const saved = await actions.setPrimaryMedia(node, mediaId, isVideo ? "video" : "image");
    if (saved) setPreviewMediaId(null);
  };

  if (isStoryboardGroup(node)) {
    return (
      <div className={`node-wrap group-container group-frame-wrap${selected ? " selected" : ""}`}>
        <div className="node-caption group-node-caption"><span>{title}</span></div>
        {selected && !hasMultiSelection && !readOnly ? <button aria-label="删除组" className="group-delete-button nodrag nopan" onClick={(event) => { stop(event); void actions.deleteOne(node.id); }} title="删除组" type="button"><Trash2 size={14} /></button> : null}
        <article className="node-shell node-group-frame" data-nodeid={node.id}>
          <span className="node-source-meta" data-grouprole={node.payload?.groupRole} data-source-shot-id={node.payload?.sourceShotId} />
          <CanvasConnectionHandle id="target" label={`${title} 输入端口`} readOnly={readOnly} side="input" zoomPercent={zoomPercent} />
          <CanvasConnectionHandle id="source" label={`${title} 输出端口`} readOnly={readOnly} side="output" zoomPercent={zoomPercent} />
        </article>
      </div>
    );
  }

  return (
    <div className={`node-wrap density-${density}${selected ? " selected" : ""}${isGenerating ? " is-generating" : ""}${isScript ? " script-node-wrap" : ""}${isCinematic ? " cinematic-node-wrap" : ""}${isInlineExpanded ? " is-expanded" : ""}${isVideo ? " video-node-wrap" : ""}${isAudio ? " audio-node-wrap" : ""}`}>
      {selected && !hasMultiSelection && !readOnly && isImage && mediaUrl && !isPanorama ? <div className="image-derivation-toolbar nodrag nopan">
        <button onClick={(event) => { stop(event); void actions.deriveImage(node, "scene_panorama_equirectangular", "720°完整环境全景"); }} type="button">720° 全景</button>
        <details><summary><Grid2X2Plus size={14} /><span>专业版式</span><ChevronDown size={12} /></summary><div className="image-derivation-menu nowheel">{IMAGE_DERIVATION_TYPES.map(([type, label]) => <button key={type} onClick={(event) => { stop(event); void actions.deriveImage(node, type, label); event.currentTarget.closest("details")?.removeAttribute("open"); }} type="button">{label}</button>)}</div></details>
        <button aria-label="删除节点" onClick={(event) => { stop(event); void actions.deleteOne(node.id); }} title="删除节点" type="button"><Trash2 size={14} /></button>
      </div> : null}
      <div className={`node-caption${isImage && mediaUrl ? " image-result-caption" : ""}${isText || isScript ? " text-node-caption" : ""}`}>
        <EditableNodeTitle editing={!readOnly && editingTitleId === node.id} icon={isText ? <FileText size={12} /> : isScript ? <Sparkles size={12} /> : isCinematic ? <Clapperboard size={12} /> : isAsset || isVideo ? <NodeIcon size={12} /> : null} onBegin={() => { if (!readOnly) actions.editTitle(node.id); }} onCancel={actions.cancelTitle} onSave={(value) => actions.saveTitle(node, value)} title={title} />
        {isGenerating ? <span aria-label="节点生成中" className="node-caption-generation"><LoaderCircle aria-hidden="true" size={12} /><b>生成中</b></span> : null}
      </div>
      {enableInvisibleResize ? INVISIBLE_NODE_RESIZE_HANDLES.map(({ cursor, position }) => (
        <NodeResizeControl aria-hidden="true" className={`node-invisible-resize node-invisible-resize-${position} nodrag nopan`} data-invisible-resize-hit-area="true" keepAspectRatio={isGrid || ((isImage || isImageEdit || isVideo) && Boolean(mediaUrl) && !isPanorama)} key={position} minHeight={isInlineExpanded ? 640 : isText ? 160 : isImageEdit ? 250 : 180} minWidth={isInlineExpanded ? 860 : isText ? 240 : isGrid ? 180 : isImageEdit ? 250 : 260} onResizeEnd={(_event, params) => actions.resizeNode(node, params)} position={position} style={{ background: "transparent", border: 0, boxShadow: "none", color: "transparent", cursor, opacity: 0, outline: 0 }} />
      )) : null}
      <article className={`node-shell node-${node.kind}${isImage && mediaUrl ? " image-result-node" : ""}${isPanorama ? " panorama-result-node" : ""}${isImage && !mediaUrl ? " empty-image-node" : ""}${isVideo ? " video-result-node" : ""}${isAudio ? " momo-audio-shell" : ""}${isWorld ? " momo-world-shell" : ""}${isAsset ? " momo-asset-shell" : ""}${isImageEdit ? " momo-image-edit-shell" : ""}${isProfessionalContribution ? " professional-review-shell" : ""}`} data-nodeid={node.id}>
        {!isGrid ? <CanvasConnectionHandle id="target" label={`输入：${presentation.inputLabel}`} readOnly={readOnly} side="input" zoomPercent={zoomPercent} /> : null}
        {isInlineExpanded && isImageEdit ? (
          <ImageEditCanvasWorkspace actions={actions} connectedNodes={connectedNodes} node={node} readOnly={readOnly} />
        ) : isInlineExpanded && (isCinematic || isCinematicDomain) ? (
          <CinematicWorkspacePanel embedded notify={actions.notify} onClose={(event) => { event?.stopPropagation?.(); actions.setNodeExpanded(node, false); }} onFit={() => actions.fitNode(node.id)} projectId={node.projectId} readOnly={readOnly} selected={node} />
        ) : isInlineExpanded && isDirector ? (
          <DirectorConsolePanel canvas={canvas} notify={actions.notify} onClose={(event) => { event?.stopPropagation?.(); actions.setNodeExpanded(node, false); }} onFit={() => actions.fitNode(node.id)} projectId={node.projectId} refresh={actions.refresh} selected={node} />
        ) : isInlineExpanded && isScript ? (
          <CinematicWorkspacePanel embedded notify={actions.notify} onClose={(event) => { event?.stopPropagation?.(); actions.setNodeExpanded(node, false); }} onFit={() => actions.fitNode(node.id)} projectId={node.projectId} readOnly={readOnly} selected={node} />
        ) : isCinematic ? (
          <CinematicControllerNode node={node} onOpen={() => actions.openWorkspace(node.id)} />
        ) : isCinematicDomain ? (
          <CinematicDomainNode node={node} onOpen={() => actions.openWorkspace(node.id)} />
        ) : isImageEdit ? (
          <MomoImageEditNode actions={actions} mediaUrl={mediaUrl} node={node} readOnly={readOnly} selected={selected && !hasMultiSelection} />
        ) : isImage && mediaUrl ? (
          isPanorama ? <PanoramaViewer imageUrl={mediaUrl} onExport={(captures) => actions.exportPanorama(node, captures)} selected={selected && !hasMultiSelection} title={title} /> : <div className="image-result-surface"><ResilientMediaImage alt={title} onLoad={(event) => actions.fitMediaNode(node, event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)} src={mediaUrl} /></div>
        ) : isImage ? (
          <div aria-label={isGenerating ? "处理中" : imageEmptyState.label} className="node-image-placeholder"><ImageIcon size={34} strokeWidth={1.5} /><strong>{imageEmptyState.label}</strong><small>{imageEmptyState.detail}</small></div>
        ) : isVideo ? (
          <MomoVideoNode actions={actions} connectedNodes={connectedNodes} displayedMediaId={displayedMediaId} mediaUrl={mediaUrl} node={node} readOnly={readOnly} selected={selected && !hasMultiSelection} />
        ) : isAsset ? (
          <MomoAssetNode actions={actions} boardHistory={assetBoardHistory} displayedMediaId={displayedMediaId} mediaUrl={mediaUrl} node={node} onPreviewMedia={setPreviewMediaId} readOnly={readOnly} />
        ) : isCompare ? (
          <MomoCompareNode actions={actions} connectedNodes={connectedNodes} node={node} readOnly={readOnly} selected={selected && !hasMultiSelection} />
        ) : isGrid ? (
          <MomoGridNode actions={actions} node={node} readOnly={readOnly} selected={selected && !hasMultiSelection} />
        ) : isAudio ? (
          <MomoAudioNode actions={actions} node={node} readOnly={readOnly} selected={selected && !hasMultiSelection} />
        ) : isWorld ? (
          <MomoWorldNode actions={actions} connectedNodes={connectedNodes} node={node} readOnly={readOnly} selected={selected && !hasMultiSelection} />
        ) : isProfessionalContribution ? (
          <ProfessionalContributionNode node={node} />
        ) : isText ? (
          <div aria-label={`${title} 正文`} aria-multiline="true" className={`text-node-editor${!readOnly && editingTextId === node.id ? " nowheel nopan nodrag editing" : ""}`} contentEditable={!readOnly && editingTextId === node.id} onBlur={(event) => { if (!readOnly) actions.saveText(node, event.currentTarget.innerText); }} role="textbox" suppressContentEditableWarning>{textContent || (readOnly ? "暂无文本" : "双击开始输入文本")}</div>
        ) : (
          <>
            <div className="node-topline"><strong>{presentation.typeLabel}</strong><span className={`node-status status-${status}`}>{status === "ready" || status === "succeeded" ? "可用" : status === "running" ? "生成中" : status === "failed" ? "失败" : status === "readonly" ? "只读" : "待输入"}</span></div>
            <div className={`canvas-node-preview preview-${node.kind}`}>
              {isScript ? <><Sparkles size={22} /><strong>{presentation.typeLabel}</strong><p>{shortSummary || presentation.description}</p></> : isDirector ? <><Drama size={27} /><strong>{presentation.typeLabel}</strong><p>{shortSummary || presentation.description}</p></> : <><NodeIcon size={24} /><strong>{presentation.typeLabel}</strong><p>{shortSummary || presentation.description}</p></>}
            </div>
            <div className="node-footer"><span>{node.payload?.currentMediaId ? "本地媒体" : "本地节点"}</span><small>r{node.revision}</small></div>
          </>
        )}
        {isGenerating && !isAsset ? <div className="node-generation-progress" data-phase={node.payload?.generationPhase || "running"}><strong>Provider 正在生成</strong><span className="node-generation-track indeterminate"><i /></span><StoryboardBatchNodeTrace node={node} /></div> : null}
        {!isGenerating ? <StoryboardBatchNodeTrace node={node} /> : null}
        <CanvasConnectionHandle id="source" label={`输出：${presentation.outputLabel}`} readOnly={readOnly} side="output" zoomPercent={zoomPercent} />
      </article>
      {(isImage || isImageEdit || isVideo) && mediaCandidates.length > 1 ? (
        <aside aria-label={`${isVideo ? "视频" : "图片"}候选`} className="media-candidate-rail nodrag nopan nowheel" onWheelCapture={(event) => event.stopPropagation()}>
          {mediaCandidates.map((mediaId, index) => {
            const primary = mediaId === node.payload?.currentMediaId;
            const previewing = mediaId === displayedMediaId;
            const candidateUrl = mediaUrlForNode(node, mediaId);
            const review = mediaReviewStateForNode(node, mediaId);
            return <div className={`media-candidate-thumb${primary ? " primary" : ""}${previewing ? " previewing" : ""}`} key={mediaId}>
              <button aria-label={`查看${isVideo ? "视频" : "图片"}候选 ${index + 1}${primary ? "（当前主资源）" : review?.state === "rejected" ? "（已拒绝）" : ""}`} aria-pressed={previewing} className="media-candidate-preview" onClick={(event) => { event.stopPropagation(); setPreviewMediaId(mediaId); }} title={review?.detail || `查看候选 ${index + 1}`} type="button">
                {isVideo ? <video aria-hidden="true" muted onLoadedMetadata={primeVideoPreviewFrame} preload="metadata" src={candidateUrl} /> : <img alt="" src={candidateUrl} />}
              </button>
              {primary ? <span className="media-candidate-state"><Check size={10} />{isVideo ? "主视频" : "主图"}</span> : review?.state === "rejected" ? <span className="media-candidate-state rejected" title={review.detail}>已拒绝</span> : readOnly ? <span className="media-candidate-state">候选</span> : <button className="media-candidate-promote" onClick={(event) => { event.stopPropagation(); void promoteMedia(mediaId); }} title={isVideo ? "设为主视频" : "设为主图"} type="button">{isVideo ? "设为主视频" : "设为主图"}</button>}
            </div>;
          })}
        </aside>
      ) : null}
      {showPrompt ? <div className={`generator-factory nodrag nopan${isAsset ? " asset-generator-factory" : ""}`}><NodePromptCard actions={actions} connectedNodes={connectedNodes} node={node} readOnly={readOnly} /></div> : null}
    </div>
  );
}

export const MemoCanvasNodeCard = memo(CanvasNodeCard);
