"use client";

import { memo, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NodeResizeControl } from "@xyflow/react";
import { resolveTextNodeMode } from "@ununu/unutv-contracts";
import { AlignJustify, AudioLines, Boxes, Camera, Check, ChevronDown, Download, Drama, FileText, Film, Grid2X2Plus, Image as ImageIcon, Plus, Trash2 } from "lucide-react";
import { api } from "./api.js";
import { CanvasConnectionHandle } from "./CanvasConnectionHandle.jsx";
import { NODE_ITEM_DEFINITIONS } from "./CanvasMenus.jsx";
import { DirectorFullscreen } from "./DirectorStageWorkspace.jsx";
import { EditableNodeTitle } from "./EditableNodeTitle.jsx";
import { NodePromptCard } from "./NodePromptCard.jsx";
import { MomoAssetNode, industrialAssetTypeLabel } from "./MomoAssetNode.jsx";
import { MomoCompareNode } from "./MomoCompareNode.jsx";
import { MomoGridNode } from "./MomoGridNode.jsx";
import { MomoImageEditNode } from "./MomoImageEditNode.jsx";
import { MomoVideoNode } from "./MomoVideoNode.jsx";
import { MomoAudioNode } from "./MomoAudioNode.jsx";
import { MomoWorldNode } from "./MomoWorldNode.jsx";
import { ImageEditFullscreen } from "./ImageEditCanvasWorkspace.jsx";
import { PanoramaViewer, isPanoramaNode } from "./PanoramaViewer.jsx";
import { IMAGE_DERIVATION_TYPES } from "./canvas-node-policies.js";
import { mediaCandidatesForNode, mediaReviewStateForNode, mediaUrlForNode } from "./media-candidate-policy.js";
import { mediaEmptyState } from "./media-empty-state-policy.js";
import { INVISIBLE_NODE_RESIZE_HANDLES, shouldEnableInvisibleNodeResize, shouldShowNodePrompt } from "./canvas-node-selection-policy.js";
import { canvasNodeIsExpanded, nodePresentationDensity } from "./canvas-node-view-policy.js";
import { buildNodePresentationV2, nodeVisibleText } from "./node-presentation-view-model.js";
import { assetAuthorityBoardHistory } from "./asset-authority-board-view-policy.js";
import { assetTypeForNode } from "./cinematic-asset-node-view-model.js";
import { ProfessionalContributionNode } from "./ProfessionalContributionNode.jsx";
import { ScriptEmptySurface, ScriptResourceSurface, ScriptTableOverlay, scriptRowsFromNode } from "./ScriptShotTableNode.jsx";
import { ScriptStoryreelPlayer } from "./ScriptStoryreelPlayer.jsx";
import { isMasterScriptNode, isScriptGroupNode, resolveScriptOwner, scriptGroupsFromDocument } from "./script-group-policy.js";
import { currentGroupEdition } from "./script-storyreel-policy.js";
import { splitScriptGroupsOnCanvas } from "./split-script-groups.js";
import { StoryboardBatchNodeTrace } from "./StoryboardBatchNodeTrace.jsx";
import { ResilientMediaImage } from "./ResilientMediaImage.jsx";
import { appendStartMs, preparedMediaDurationMs } from "./timeline-media-policy.js";
import { mediaDownloadFileName } from "./media-download-policy.js";

const LABELS = { ...Object.fromEntries(NODE_ITEM_DEFINITIONS.map((item) => [item.kind, item.label])), story: "文本", subject: "主体", batch: "分镜表", videoShot: "视频镜头", review: "最终检查", storyboard: "故事板", "video-clip": "视频合成" };
const candidateThumbnailPreparations = new Map();

function prepareCandidateThumbnail(projectId, mediaId) {
  const key = `${projectId}:${mediaId}`;
  if (!candidateThumbnailPreparations.has(key)) {
    candidateThumbnailPreparations.set(key, api.prepareMedia(projectId, mediaId).catch((error) => {
      candidateThumbnailPreparations.delete(key);
      throw error;
    }));
  }
  return candidateThumbnailPreparations.get(key);
}

function VideoCandidateThumbnail({ index, mediaId, projectId }) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState("loading");
  const thumbnailUrl = `/api/projects/${projectId}/media/${mediaId}/thumbnail${attempt ? `?candidate_thumbnail=${attempt}` : ""}`;
  useEffect(() => { setAttempt(0); setState("loading"); }, [mediaId, projectId]);
  const prepare = () => {
    if (state === "preparing" || state === "failed") return;
    setState("preparing");
    void prepareCandidateThumbnail(projectId, mediaId)
      .then(() => { setAttempt((value) => value + 1); setState("loading"); })
      .catch(() => setState("failed"));
  };
  return <span className="media-candidate-video-thumbnail" data-state={state}>
    <img alt="" onError={prepare} onLoad={() => setState("loaded")} src={thumbnailUrl} />
    {state !== "loaded" ? <span aria-hidden="true" className="media-candidate-video-placeholder"><Film size={20} /><small>{index + 1}</small></span> : null}
  </span>;
}

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
  const [splittingScript, setSplittingScript] = useState(false);
  const [storyreelOpen, setStoryreelOpen] = useState(false);
  const [separatingDialogue, setSeparatingDialogue] = useState(false);
  const [capturingFrame, setCapturingFrame] = useState(false);
  const [downloadingImage, setDownloadingImage] = useState(false);
  const videoPlaybackRef = useRef({ duration: null, seconds: 0 });
  const isImage = ["image", "subject", "upload", "material", "historyPick"].includes(node.kind);
  const isVideo = ["video", "videoShot", "compose", "video-clip"].includes(node.kind);
  const newestVideoMediaId = isVideo ? mediaCandidates[0] : null;
  const newestVideoMediaIdRef = useRef(newestVideoMediaId);
  const displayedMediaId = previewMediaId && mediaCandidates.includes(previewMediaId)
    ? previewMediaId
    : newestVideoMediaId || node.payload?.currentMediaId;
  const mediaUrl = mediaUrlForNode(node, displayedMediaId);
  const isText = node.kind === "text" || node.kind === "story";
  const isPromptText = node.kind === "text" && resolveTextNodeMode(node) === "prompt";
  const isScript = node.kind === "script";
  const scriptRows = isScript ? scriptRowsFromNode(node, canvas.nodes) : [];
  const isScriptGroup = isScript && isScriptGroupNode(node);
  const canSplitScript = isScript && isMasterScriptNode(node) && scriptGroupsFromDocument({ rows: scriptRows }).length > 0;
  const isDirector = node.kind === "director";
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
  const isCancelingGeneration = node.payload?.generationPhase === "canceling";
  const providerSupportsGenerationCancel = ["minimax", "ark", "flux"].includes(node.payload?.provider);
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

  useEffect(() => {
    const previousNewest = newestVideoMediaIdRef.current;
    newestVideoMediaIdRef.current = newestVideoMediaId;
    if (isVideo && newestVideoMediaId && previousNewest && newestVideoMediaId !== previousNewest) {
      setPreviewMediaId(newestVideoMediaId);
    }
  }, [isVideo, newestVideoMediaId]);

  const promoteMedia = async (mediaId) => {
    const saved = await actions.setPrimaryMedia(node, mediaId, isVideo ? "video" : "image");
    if (saved) setPreviewMediaId(isVideo ? mediaId : null);
  };

  const addVideoToTimeline = async (event) => {
    stop(event);
    if (!isVideo || !displayedMediaId || readOnly) return;
    const projectId = canvas.projectId;
    try {
      const timelines = (await api.timelines(projectId)).timelines || [];
      const timelineId = timelines[0]?.id || (await api.createTimeline(projectId, "主时间线")).id;
      const timeline = await api.timeline(projectId, timelineId);
      const track = timeline.tracks.find((entry) => entry.kind === "video" && !entry.locked)?.order;
      if (track === undefined) throw new Error("主时间线没有可写入的视频轨");
      let preparation = null;
      try { preparation = await api.prepareMedia(projectId, displayedMediaId); }
      catch { /* 代理失败不阻止原始媒体入轨。 */ }
      const durationMs = preparedMediaDurationMs(preparation);
      await api.addClip(projectId, timelineId, {
        nodeId: node.id,
        mediaId: displayedMediaId,
        track,
        startMs: appendStartMs(timeline, track),
        durationMs,
        payload: { source: "canvas_video_button", sourceDurationMs: durationMs, title }
      });
      actions.notify?.("视频已加入主时间线", false);
    } catch (error) {
      actions.notify?.(error);
    }
  };

  const separateDialogueAudio = async (event) => {
    stop(event);
    if (!isVideo || !displayedMediaId || readOnly || separatingDialogue) return;
    setSeparatingDialogue(true);
    try { await actions.separateDialogue?.(node, displayedMediaId); }
    catch { /* action 已显示准确错误 */ }
    finally { setSeparatingDialogue(false); }
  };

  const captureCurrentFrame = async (event) => {
    stop(event);
    if (!isVideo || !displayedMediaId || readOnly || capturingFrame) return;
    setCapturingFrame(true);
    const playback = videoPlaybackRef.current;
    const seconds = Number.isFinite(playback.duration) && playback.duration > 0
      ? Math.min(playback.seconds, Math.max(0, playback.duration - 0.05))
      : playback.seconds;
    try { await actions.captureVideoFrame?.(node, displayedMediaId, seconds); }
    catch { /* action 已显示准确错误 */ }
    finally { setCapturingFrame(false); }
  };

  const downloadDisplayedImage = async (event) => {
    stop(event);
    if (!isImage || !mediaUrl || downloadingImage) return;
    setDownloadingImage(true);
    let objectUrl;
    try {
      const response = await fetch(mediaUrl);
      if (!response.ok) throw new Error(`图片下载失败（HTTP ${response.status}）`);
      const blob = await response.blob();
      objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = mediaDownloadFileName(title, blob.type || response.headers.get("content-type"));
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      actions.notify?.("图片已开始下载", false);
    } catch (error) {
      actions.notify?.(error);
    } finally {
      if (objectUrl) window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      setDownloadingImage(false);
    }
  };
  if (isStoryboardGroup(node)) {
    return (
      <div className={`node-wrap group-container group-frame-wrap${selected ? " selected" : ""}`}>
        <div className="node-caption group-node-caption"><span>{title}</span></div>
        {selected && !hasMultiSelection && !readOnly ? <button aria-label="删除组" className="group-delete-button nodrag nopan" onClick={(event) => { stop(event); void actions.deleteOne(node.id); }} title="删除组" type="button"><Trash2 size={14} /></button> : null}
        <article className="node-shell node-group-frame" data-nodeid={node.id}>
          <span className="node-source-meta" data-grouprole={node.payload?.groupRole} data-source-shot-id={node.payload?.sourceShotId} />
          <CanvasConnectionHandle id="target" isConnecting={actions.isConnecting} label={`${title} 输入端口`} readOnly={readOnly} side="input" zoomPercent={zoomPercent} />
          <CanvasConnectionHandle id="source" label={`${title} 输出端口`} readOnly={readOnly} side="output" zoomPercent={zoomPercent} />
        </article>
      </div>
    );
  }

  const directorOverlay = isDirector && isInlineExpanded && typeof document !== "undefined"
    ? createPortal(
        <DirectorFullscreen
          canvas={canvas}
          node={node}
          notify={actions.notify}
          onClose={() => actions.setNodeExpanded(node, false)}
          refresh={actions.refresh}
        />,
        document.body
      )
    : null;
  const imageEditOverlay = isImageEdit && isInlineExpanded && typeof document !== "undefined"
    ? createPortal(
        <ImageEditFullscreen
          actions={actions}
          connectedNodes={connectedNodes}
          node={node}
          onClose={() => actions.setNodeExpanded(node, false)}
          readOnly={readOnly}
        />,
        document.body
      )
    : null;
  const scriptOverlay = isScript && isInlineExpanded && scriptRows.length > 0 && typeof document !== "undefined"
    ? createPortal(
        <ScriptTableOverlay
          actions={actions}
          canvas={canvas}
          node={node}
          onClose={() => actions.setNodeExpanded(node, false)}
          readOnly={readOnly}
          rows={scriptRows}
          title={isScriptGroup ? title : (node.payload?.scriptDocument?.title || title)}
        />,
        document.body
      )
    : null;
  const storyreelOwner = isScriptGroup ? resolveScriptOwner(node, canvas.nodes) : node;
  const storyreelOverlay = isScript && storyreelOpen && scriptRows.length > 0 && typeof document !== "undefined"
    ? createPortal(
        <ScriptStoryreelPlayer
          actions={actions}
          anchor={node}
          assets={storyreelOwner?.payload?.scriptDocument?.assets || []}
          canvas={canvas}
          canvasId={canvas.id}
          nodes={canvas.nodes}
          onClose={() => setStoryreelOpen(false)}
          owner={storyreelOwner || node}
          projectId={node.projectId}
          rows={scriptRows}
          title={isScriptGroup ? title : (node.payload?.scriptDocument?.title || title)}
        />,
        document.body
      )
    : null;

  return (
    <div className={`node-wrap density-${density}${selected ? " selected" : ""}${isInlineExpanded ? " is-expanded" : ""}${isVideo ? " video-node-wrap" : ""}${isAudio ? " audio-node-wrap" : ""}${isScript ? " script-node-wrap" : ""}`}>
      {directorOverlay}
      {imageEditOverlay}
      {scriptOverlay}
      {storyreelOverlay}
      {selected && !hasMultiSelection && !readOnly && isImage && mediaUrl && !isPanorama ? <div className="image-derivation-toolbar nodrag nopan">
        <button onClick={(event) => { stop(event); void actions.deriveImage(node, "scene_panorama_equirectangular", "720°完整环境全景"); }} type="button">720° 全景</button>
        <details><summary><Grid2X2Plus size={14} /><span>专业版式</span><ChevronDown size={12} /></summary><div className="image-derivation-menu nowheel">{IMAGE_DERIVATION_TYPES.map(([type, label]) => <button key={type} onClick={(event) => { stop(event); void actions.deriveImage(node, type, label); event.currentTarget.closest("details")?.removeAttribute("open"); }} type="button">{label}</button>)}</div></details>
        <button aria-label="删除节点" onClick={(event) => { stop(event); void actions.deleteOne(node.id); }} title="删除节点" type="button"><Trash2 size={14} /></button>
      </div> : null}
      <div className={`node-caption${isImage && mediaUrl ? " image-result-caption" : ""}${isText || isScript ? " text-node-caption" : ""}`}>
        <EditableNodeTitle editing={!readOnly && editingTitleId === node.id} icon={isText ? <FileText size={12} /> : isScript ? <AlignJustify size={12} /> : isImage || isAsset || isVideo ? <NodeIcon size={12} /> : null} onBegin={() => { if (!readOnly) actions.editTitle(node.id); }} onCancel={actions.cancelTitle} onSave={(value) => actions.saveTitle(node, value)} title={title} />
        {isImage && mediaUrl ? <button aria-label="下载当前图片" className="video-caption-action nodrag nopan" disabled={downloadingImage} onClick={downloadDisplayedImage} title="下载当前正在预览的图片候选" type="button"><Download size={12} />{downloadingImage ? "下载中…" : "下载"}</button> : null}
        {isVideo && displayedMediaId && !readOnly ? <div className="video-caption-actions nodrag nopan">
          <button aria-label="分离视频人声" className="video-caption-action" disabled={separatingDialogue} onClick={separateDialogueAudio} title="提取人声为独立音频节点，原视频保持不变" type="button"><AudioLines size={12} />{separatingDialogue ? "分离中…" : "人声分离"}</button>
          <button aria-label="截取视频当前帧" className="video-caption-action" disabled={capturingFrame} onClick={captureCurrentFrame} title="按播放器当前位置创建图片节点" type="button"><Camera size={12} />{capturingFrame ? "截取中…" : "截取当前帧"}</button>
          <button aria-label="将视频加入时间线" className="video-caption-action" onClick={addVideoToTimeline} type="button"><Plus size={12} />加入时间线</button>
        </div> : null}
      </div>
      {enableInvisibleResize ? INVISIBLE_NODE_RESIZE_HANDLES.map(({ cursor, position }) => (
        <NodeResizeControl aria-hidden="true" className={`node-invisible-resize node-invisible-resize-${position} nodrag nopan`} data-invisible-resize-hit-area="true" keepAspectRatio={isGrid || ((isImage || isImageEdit || isVideo) && Boolean(mediaUrl) && !isPanorama)} key={position} minHeight={isInlineExpanded ? 640 : isText ? 160 : isImageEdit ? 250 : 180} minWidth={isInlineExpanded ? 860 : isText ? 240 : isGrid ? 180 : isImageEdit ? 250 : 260} onResizeEnd={(_event, params) => actions.resizeNode(node, params)} position={position} style={{ background: "transparent", border: 0, boxShadow: "none", color: "transparent", cursor, opacity: 0, outline: 0 }} />
      )) : null}
      <article className={`node-shell node-${node.kind}${isImage && mediaUrl ? " image-result-node" : ""}${isPanorama ? " panorama-result-node" : ""}${isImage && !mediaUrl ? " empty-image-node" : ""}${isVideo ? " video-result-node" : ""}${isVideo && !mediaUrl ? " empty-video-node" : ""}${isAudio ? " momo-audio-shell" : ""}${isWorld ? " momo-world-shell" : ""}${isAsset ? " momo-asset-shell" : ""}${isImageEdit ? " momo-image-edit-shell" : ""}${isProfessionalContribution ? " professional-review-shell" : ""}`} data-nodeid={node.id}>
        {!isGrid ? <CanvasConnectionHandle id="target" isConnecting={actions.isConnecting} label={`输入：${presentation.inputLabel}`} readOnly={readOnly} side="input" zoomPercent={zoomPercent} /> : null}
        {isImageEdit ? (
          <MomoImageEditNode actions={actions} mediaUrl={mediaUrl} node={node} readOnly={readOnly} selected={selected && !hasMultiSelection} />
        ) : isImage && mediaUrl ? (
          isPanorama ? <PanoramaViewer imageUrl={mediaUrl} onExport={(captures) => actions.exportPanorama(node, captures)} selected={selected && !hasMultiSelection} title={title} /> : <div className="image-result-surface"><ResilientMediaImage alt={title} key={mediaUrl} onLoad={(event) => actions.fitMediaNode(node, event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)} src={mediaUrl} /></div>
        ) : isImage ? (
          <div aria-label={isGenerating ? "处理中" : imageEmptyState.label} className="node-image-placeholder"><ImageIcon size={34} strokeWidth={1.5} /><strong>{imageEmptyState.label}</strong><small>{imageEmptyState.detail}</small></div>
        ) : isVideo ? (
          <MomoVideoNode actions={actions} connectedNodes={connectedNodes} displayedMediaId={displayedMediaId} key={`${node.id}:${displayedMediaId}`} mediaUrl={mediaUrl} node={node} onPlaybackPositionChange={(playback) => { videoPlaybackRef.current = playback; }} readOnly={readOnly} selected={selected && !hasMultiSelection} />
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
        ) : isScript ? (
          scriptRows.length > 0
            ? <ScriptResourceSurface
              groupMeta={isScriptGroup ? `${currentGroupEdition(storyreelOwner?.payload?.scriptDocument?.storyreel, node.payload?.groupNumber)?.label || "版本1"} · 与脚本表同源同步` : ""}
              onExpand={() => actions.setNodeExpanded(node, true)}
              onPreview={isScriptGroup ? () => setStoryreelOpen(true) : undefined}
              onSplit={canSplitScript && !readOnly ? async () => {
                if (splittingScript) return;
                setSplittingScript(true);
                try {
                  const result = await splitScriptGroupsOnCanvas({ canvas, source: node });
                  await actions.refresh?.();
                  actions.notify?.(`已拆出 ${result.groupCount} 个生成组，和脚本表同源同步`, false);
                } catch (error) {
                  actions.notify?.(error);
                } finally {
                  setSplittingScript(false);
                }
              } : undefined}
              readOnly={readOnly}
              rows={scriptRows}
              splitting={splittingScript}
              title={isScriptGroup ? title : (node.payload?.scriptDocument?.title || title)}
            />
            : <ScriptEmptySurface />
        ) : isText ? (
          <div
            aria-label={`${title} 正文`}
            aria-multiline="true"
            className={`text-node-editor${!isPromptText && !readOnly && editingTextId === node.id ? " nowheel nopan nodrag editing" : ""}`}
            contentEditable={!isPromptText && !readOnly && editingTextId === node.id}
            onBlur={(event) => { if (!isPromptText && !readOnly) actions.saveText(node, event.currentTarget.innerText); }}
            role="textbox"
            suppressContentEditableWarning
          >
            {textContent || (isPromptText ? "在下方输入 Prompt 后生成文本" : readOnly ? "暂无文本" : "双击开始输入文本")}
          </div>
        ) : (
          <>
            <div className="node-topline"><strong>{presentation.typeLabel}</strong><span className={`node-status status-${status}`}>{status === "ready" || status === "succeeded" ? "可用" : status === "running" ? "生成中" : status === "failed" ? "失败" : status === "readonly" ? "只读" : "待输入"}</span></div>
            <div className={`canvas-node-preview preview-${node.kind}`}>
              {isDirector ? <><Drama size={27} /><strong>{presentation.typeLabel}</strong><p>{shortSummary || presentation.description}</p></> : <><NodeIcon size={24} /><strong>{presentation.typeLabel}</strong><p>{shortSummary || presentation.description}</p></>}
            </div>
            <div className="node-footer"><span>{node.payload?.currentMediaId ? "本地媒体" : "本地节点"}</span><small>r{node.revision}</small></div>
          </>
        )}
        {isGenerating && !isAsset ? <div className="node-generation-progress" data-phase={node.payload?.generationPhase || "running"}><strong>{isCancelingGeneration ? "正在取消生成…" : "Provider 正在生成"}</strong><span className="node-generation-track indeterminate"><i /></span>{!readOnly && providerSupportsGenerationCancel ? <button className="node-generation-cancel nodrag nopan" disabled={isCancelingGeneration || !node.payload?.generationRunId} onClick={(event) => { event.stopPropagation(); void actions.cancelRun?.(node); }} onMouseDown={(event) => event.stopPropagation()} type="button">{isCancelingGeneration ? "正在取消" : "取消生成"}</button> : null}<StoryboardBatchNodeTrace node={node} /></div> : null}
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
              <button aria-label={`查看${isVideo ? "视频" : "图片"}候选 ${index + 1}${primary ? "（当前主资源）" : review?.state === "rejected" ? "（已拒绝）" : ""}`} aria-pressed={previewing} className="media-candidate-preview" onClick={(event) => { event.stopPropagation(); setPreviewMediaId(mediaId); }} onMouseDown={(event) => event.stopPropagation()} title={review?.detail || `查看候选 ${index + 1}`} type="button">
                {isVideo ? <VideoCandidateThumbnail index={index} mediaId={mediaId} projectId={node.payload?.mediaOwnerProjectId || node.projectId} /> : <img alt="" src={candidateUrl} />}
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
