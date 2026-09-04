"use client";

import { ArrowUp, AtSign, ChevronDown, FileText, Image as ImageIcon, LoaderCircle, Maximize2, MessageCircleMore, Minimize2, Paperclip, SlidersHorizontal, Slash, Sparkles, Timer, Video, Volume2, WandSparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AUDIO_VOICE_OPTIONS, audioVoiceLabel } from "./audio-voice-catalog";
import { DEFAULT_TEXT_MODEL_ID } from "./prompt-workbench-api";
import type { CanvasNode, ModelExecutionSelection, ScriptAssetItem, VideoP0Actions } from "./prompt-types";
import { ModelReferencePacket } from "./ModelReferencePacket";
import { ModelRequestManifest } from "./ModelRequestManifest";
import { ModelExecutionControls } from "./ModelExecutionControls";
import { NodeReferenceControls, NodeReferenceRows } from "./NodeReferenceControls";
import { PromptDocumentEditor, type PromptDocumentV1 } from "./PromptDocumentEditor";
import { CinematicPromptFacts } from "./CinematicPromptFacts";
import { hydrateLegacyPromptReferences } from "./prompt-document-hydration.js";
import { INDEXTTS2_MODEL_ID } from "./generation-run-payload.js";
import { DEFAULT_VIDEO_MODEL_ID, DEFAULT_VIDEO_PROVIDER_ID, DEFAULT_VIDEO_RESOLUTION, GROK_PROMPT_MAX_BYTES, GROK_VIDEO_MODEL_ID, H3_VIDEO_MODEL_ID, SEEDANCE_VIDEO_MODEL_ID, clampVideoDuration, utf8ByteLength, videoDurationRange, videoProviderId } from "./video-generation-capabilities.js";
import { PROMPT_OUTPUT_MODES, promptOutputModeMeta } from "./prompt-output-mode-policy.js";
import { videoReferenceInputState } from "./video-reference-input-policy.js";
function modelOptionsFor(node: CanvasNode) {
  if (node.kind === "script") return ["GVLM 3.1", "CVLM 5.5", "GVLM 3.1 Flash"];
  if (node.kind === "image" || node.kind === "subject" || node.kind === "material" || node.kind === "historyPick") return ["Z-image Turbo"];
  if (node.kind === "video" || node.kind === "videoShot" || node.kind === "compose") return ["Motion 1.0"];
  return [node.cost];
}

function specOptionsFor(node: CanvasNode) {
  if (node.kind === "image" || node.kind === "subject" || node.kind === "material" || node.kind === "historyPick") return ["16:9", "1K"];
  if (node.kind === "video" || node.kind === "videoShot" || node.kind === "compose") return ["16:9", "480p"];
  return [];
}

function primaryModelLabel(node: CanvasNode) {
  const [first] = modelOptionsFor(node);
  if (node.cost === "输入" || node.cost === "文件" || node.cost === "检查") return node.cost;
  if (node.cost.includes("·")) return node.cost.split("·")[0]?.trim() ?? node.cost;
  if (node.cost.includes(" ")) return node.cost;
  return first ?? node.cost;
}

function sourceChipLabel(node: CanvasNode) {
  return node.title.slice(0, 2) || "@";
}

function isMediaPromptNode(node: CanvasNode) {
  return node.kind === "image" || node.kind === "video" || node.kind === "videoShot" || node.kind === "compose";
}

function isVideoPromptNode(node: CanvasNode) {
  return node.kind === "video" || node.kind === "videoShot" || node.kind === "compose";
}

type VideoReferenceMode = "text_to_video" | "image_reference" | "first_frame" | "first_last_frame";

const H3_PROFILE_OPTIONS = [
  { id: "480p_accelerated", label: "480P 加速", resolution: "480p" },
  { id: "720p_accelerated", label: "720P 加速", resolution: "720p" },
  { id: "480p_native", label: "480P 原生", resolution: "480p" },
  { id: "720p_native", label: "720P 原生", resolution: "720p" }
] as const;

const INDEXTTS2_EMOTIONS = [
  ["emo_sad", "悲伤", 0], ["emo_calm", "平静", 0.3], ["emo_angry", "愤怒", 0],
  ["emo_happy", "开心", 0.5], ["emo_afraid", "害怕", 0], ["emo_disgusted", "厌恶", 0],
  ["emo_surprised", "惊讶", 0], ["emo_melancholic", "忧郁", 0]
] as const;
type IndexTtsEmotionKey = typeof INDEXTTS2_EMOTIONS[number][0];

function isH3Profile(value: unknown) {
  return H3_PROFILE_OPTIONS.some((profile) => profile.id === value);
}

function h3ProfileLabel(value: string) {
  return H3_PROFILE_OPTIONS.find((profile) => profile.id === value)?.label || "480P 加速";
}

function h3ProfileResolution(value: string) {
  return H3_PROFILE_OPTIONS.find((profile) => profile.id === value)?.resolution || "480p";
}
function normalizeVideoReferenceMode(mode: unknown): VideoReferenceMode {
  if (mode === "text_to_video" || mode === "first_frame" || mode === "first_last_frame") return mode;
  return "image_reference";
}

function videoReferenceModeLabel(mode: VideoReferenceMode) {
  if (mode === "text_to_video") return "文生视频";
  if (mode === "first_frame") return "首帧";
  if (mode === "first_last_frame") return "首尾帧";
  return "全能参考";
}

function normalizedVideoResolution(modelId: string, providerId: string, resolution: unknown, h3Profile?: unknown) {
  if (modelId === SEEDANCE_VIDEO_MODEL_ID) return "480p";
  if (modelId === H3_VIDEO_MODEL_ID) {
    if (providerId === "autodl") {
      const hostedResolution = String(resolution || DEFAULT_VIDEO_RESOLUTION).toLowerCase();
      return ["480p", "768p", "1080p"].includes(hostedResolution) ? hostedResolution : DEFAULT_VIDEO_RESOLUTION;
    }
    if (isH3Profile(h3Profile)) return String(h3Profile);
    return String(resolution).toLowerCase() === "720p" ? "720p_accelerated" : "480p_accelerated";
  }
  return String(resolution || "720p");
}

const IMAGE_TYPE_LABELS: Record<string, string> = {
  freeform: "普通图片",
  actor_casting_single: "演员白底单人候选",
  actor_identity_board: "演员身份板（六视图＋整头特写）",
  costume_single: "服装单张候选",
  costume_design_sheet: "服装款式资源板",
  hair_makeup_single: "妆造单张候选",
  hair_makeup_design_sheet: "妆造资源板",
  character_identity_board: "角色身份板（六视图＋整头特写）",
  character_source_reference: "角色身份参考图",
  multi_camera_nine_grid: "多机位九宫格",
  multi_character_nine_grid: "多角色九宫格设定表",
  story_progression_four_grid: "剧情推演四宫格",
  character_face_three_view: "角色脸部三视图",
  character_fullbody_three_view: "角色全身三视图",
  character_six_view: "角色六视图",
  character_design_sheet: "角色设定图",
  scene_design_sheet: "场景设定图",
  scene_authority_multiview: "场景权威多视角",
  scene_multiview: "场景多视角图",
  scene_multiview_contact_sheet: "场景多视角总览",
  scene_spatial_map: "场景空间控制图",
  scene_panorama_equirectangular: "720°完整环境全景",
  panorama_equirectangular: "720°完整环境全景",
  director_blocking_plate: "3D调度底图",
  shot_anchor_frame_candidate: "真实机位锚帧候选",
  shot_handoff_target_candidate: "重叠交接目标帧候选",
  scene_cubemap_six_faces: "场景立方体六面图",
  product_design_sheet: "产品 / 道具设定图",
  color_palette: "材质与颜色分配板",
  fu_card: "FU 规则卡",
  fu_visual_card: "FU 视觉卡",
  storyboard_25_grid: "25 宫格连续分镜",
  cinematic_lighting_correction: "电影级光影校正"
};

function imageTypeLabel(templateId: string) {
  return IMAGE_TYPE_LABELS[templateId] ?? "自定义图片类型";
}

const REFERENCE_ROLE_LABELS: Record<string, string> = {
  actor: "演员",
  character: "角色",
  costume: "服装",
  hair_makeup: "妆造",
  prop: "道具",
  scene: "场景",
  style: "风格"
};

function referenceRole(node: CanvasNode) {
  if (node.assetRole) return node.assetRole;
  if (node.imageNodeType === "actor_identity_board" || node.imageNodeType === "actor_casting_single") return "actor";
  if (node.imageNodeType === "character_identity_board") return "character";
  return "other";
}

function referenceMention(node: CanvasNode, index: number) {
  return `（参考图${index + 1}）`;
}

function PromptMiniTools({ blocked }: { blocked?: string }) {
  return (
    <div className="prompt-mini-tools">
      <button className="generator-tool" title="@ 引用节点" type="button">
        <AtSign size={13} />
      </button>
      <button className="generator-tool" title="斜杠菜单" type="button">
        <Slash size={13} />
      </button>
      <button className="generator-tool" title="附件" type="button">
        <Paperclip size={13} />
      </button>
      <span className="generator-credit">
        <Sparkles size={13} />
        {blocked ? "-" : "1"}
      </span>
    </div>
  );
}

function outputModeIcon(mode: string) {
  if (mode === "image") return <ImageIcon size={13} />;
  if (mode === "audio") return <Volume2 size={13} />;
  if (mode === "video") return <Video size={13} />;
  return <FileText size={13} />;
}

function PromptOutputModeSelect({ actions, node, readOnly }: { actions: VideoP0Actions; node: CanvasNode; readOnly: boolean }) {
  if (node.sourceKind !== "asset") return null;
  const active = promptOutputModeMeta(node.outputMode || node.kind);
  return <details className="prompt-output-mode-select">
    <summary aria-label={`当前输出：${active.label}`}>{outputModeIcon(active.id)}<span>{active.label}</span><ChevronDown size={11} /></summary>
    <div className="prompt-output-mode-menu nowheel" onWheelCapture={(event) => event.stopPropagation()} role="listbox">
      {PROMPT_OUTPUT_MODES.map((mode) => <button aria-selected={active.id === mode.id} className={active.id === mode.id ? "active" : ""} disabled={readOnly} key={mode.id} onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); void actions.setPromptOutputMode?.(node.id, mode.id); }} role="option" type="button">{outputModeIcon(mode.id)}<span><strong>{mode.label}</strong><small>{mode.placeholder}</small></span>{active.id === mode.id ? <b>✓</b> : null}</button>)}
    </div>
  </details>;
}

export function PromptCard({
  actions,
  assets = [],
  connectedSourceNodes = [],
  node,
  readOnly = false,
  sourceNodes = [],
  variant
}: {
  actions: VideoP0Actions;
  assets?: ScriptAssetItem[];
  connectedSourceNodes?: CanvasNode[];
  node: CanvasNode;
  readOnly?: boolean;
  sourceNodes?: CanvasNode[];
  variant: "generator" | "input";
}) {
  const [value, setValue] = useState(node.prompt);
  const [promptDocument, setPromptDocument] = useState<PromptDocumentV1>(() => (node.promptDocument as PromptDocumentV1 | undefined) ?? { type: "doc", version: 1, content: [{ type: "text", text: node.prompt }] });
  const [expanded, setExpanded] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [videoModelId, setVideoModelId] = useState(String(node.modelSelection?.modelId ?? DEFAULT_VIDEO_MODEL_ID));
  const [videoProvider, setVideoProvider] = useState(String(node.modelSelection?.providerId ?? videoProviderId(String(node.modelSelection?.modelId ?? DEFAULT_VIDEO_MODEL_ID), DEFAULT_VIDEO_PROVIDER_ID)));
  const [videoMode, setVideoMode] = useState<VideoReferenceMode>(normalizeVideoReferenceMode(node.modelSelection?.parameters?.mode));
  const [videoRatio, setVideoRatio] = useState(String(node.modelSelection?.parameters?.ratio ?? node.modelSelection?.parameters?.aspectRatio ?? "16:9"));
  const [videoResolution, setVideoResolution] = useState(normalizedVideoResolution(
    String(node.modelSelection?.modelId ?? DEFAULT_VIDEO_MODEL_ID),
    String(node.modelSelection?.providerId ?? videoProviderId(String(node.modelSelection?.modelId ?? DEFAULT_VIDEO_MODEL_ID), DEFAULT_VIDEO_PROVIDER_ID)),
    node.modelSelection?.parameters?.resolution,
    node.modelSelection?.parameters?.h3Profile
  ));
  const [videoDuration, setVideoDuration] = useState(Number(node.modelSelection?.parameters?.duration ?? 4));
  const [videoCount, setVideoCount] = useState(Number(node.modelSelection?.parameters?.n ?? node.modelSelection?.parameters?.count ?? 1));
  const [videoGenerateAudio, setVideoGenerateAudio] = useState(Boolean(node.modelSelection?.parameters?.generateAudio ?? true));
  const [audioModelId, setAudioModelId] = useState(String(node.modelSelection?.modelId ?? "seed-audio-1.0"));
  const [audioProvider, setAudioProvider] = useState(String(node.modelSelection?.providerId ?? "openspeech"));
  const [audioSpeakerId, setAudioSpeakerId] = useState(String(node.modelSelection?.parameters?.speakerId ?? ""));
  const [audioSpeed, setAudioSpeed] = useState(Number(node.modelSelection?.parameters?.speed ?? 1));
  const [indexTtsEmotions, setIndexTtsEmotions] = useState<Record<IndexTtsEmotionKey, number>>(() => Object.fromEntries(
    INDEXTTS2_EMOTIONS.map(([key, , fallback]) => [key, Number(node.modelSelection?.parameters?.[key] ?? fallback)])
  ) as Record<IndexTtsEmotionKey, number>);
  const [indexTtsRandom, setIndexTtsRandom] = useState(Boolean(node.modelSelection?.parameters?.emo_random ?? false));
  const inputRef = useRef<HTMLDivElement>(null);
  const expandedInputRef = useRef<HTMLTextAreaElement>(null);
  const mentionTargetRef = useRef<{ surface: "compact" | "expanded"; triggerIndex: number; range?: Range } | null>(null);
  const activeNodeIdRef = useRef(node.id);
  const draftDirtyRef = useRef(false);
  const draftVersionRef = useRef(0);
  const latestSelectionRef = useRef<ModelExecutionSelection | undefined>(node.modelSelection);

  const closeOwnedVideoPopovers = () => {
    for (const owner of document.querySelectorAll<HTMLElement>("[data-video-popover-owner]")) {
      if (owner.dataset.videoPopoverOwner !== node.id) continue;
      for (const details of owner.querySelectorAll("details[open]")) details.removeAttribute("open");
    }
  };

  const updateDraftValue = (nextValue: string) => {
    if (readOnly) return;
    draftDirtyRef.current = true;
    draftVersionRef.current += 1;
    setValue(nextValue);
  };

  useEffect(() => {
    const changedNode = activeNodeIdRef.current !== node.id;
    activeNodeIdRef.current = node.id;
    if (changedNode || !draftDirtyRef.current || node.prompt === value) {
      draftDirtyRef.current = false;
      setValue(node.prompt);
      setPromptDocument((node.promptDocument as PromptDocumentV1 | undefined) ?? { type: "doc", version: 1, content: [{ type: "text", text: node.prompt }] });
      if (inputRef.current && inputRef.current.textContent !== node.prompt) {
        inputRef.current.textContent = node.prompt;
      }
    }
  }, [node.id, node.prompt, node.promptDocument]);

  useEffect(() => {
    latestSelectionRef.current = node.modelSelection;
  }, [node.modelSelection]);

  useEffect(() => {
    if (readOnly || !draftDirtyRef.current || value === node.prompt) return undefined;
    const version = draftVersionRef.current;
    const timer = window.setTimeout(() => {
      void Promise.resolve(actions.savePromptDraft(node.id, value, latestSelectionRef.current)).then(() => {
        if (draftVersionRef.current === version) draftDirtyRef.current = false;
      });
    }, 450);
    return () => window.clearTimeout(timer);
  }, [actions, node.id, node.prompt, readOnly, value]);

  useEffect(() => {
    setVideoModelId(String(node.modelSelection?.modelId ?? DEFAULT_VIDEO_MODEL_ID));
    setVideoProvider(String(node.modelSelection?.providerId ?? videoProviderId(String(node.modelSelection?.modelId ?? DEFAULT_VIDEO_MODEL_ID), DEFAULT_VIDEO_PROVIDER_ID)));
    setVideoMode(normalizeVideoReferenceMode(node.modelSelection?.parameters?.mode));
    setVideoRatio(String(node.modelSelection?.parameters?.ratio ?? node.modelSelection?.parameters?.aspectRatio ?? "16:9"));
    setVideoResolution(normalizedVideoResolution(
      String(node.modelSelection?.modelId ?? DEFAULT_VIDEO_MODEL_ID),
      String(node.modelSelection?.providerId ?? videoProviderId(String(node.modelSelection?.modelId ?? DEFAULT_VIDEO_MODEL_ID), DEFAULT_VIDEO_PROVIDER_ID)),
      node.modelSelection?.parameters?.resolution,
      node.modelSelection?.parameters?.h3Profile
    ));
    setVideoDuration(Number(node.modelSelection?.parameters?.duration ?? 4));
    setVideoCount(Number(node.modelSelection?.parameters?.n ?? node.modelSelection?.parameters?.count ?? 1));
    setVideoGenerateAudio(Boolean(node.modelSelection?.parameters?.generateAudio ?? true));
    setAudioSpeakerId(String(node.modelSelection?.parameters?.speakerId ?? ""));
    setAudioSpeed(Number(node.modelSelection?.parameters?.speed ?? 1));
  }, [
    node.id,
    node.modelSelection?.modelId,
    node.modelSelection?.providerId,
    node.modelSelection?.parameters?.audioSpeed,
    node.modelSelection?.parameters?.aspectRatio,
    node.modelSelection?.parameters?.count,
    node.modelSelection?.parameters?.duration,
    node.modelSelection?.parameters?.generateAudio,
    node.modelSelection?.parameters?.h3Profile,
    node.modelSelection?.parameters?.mode,
    node.modelSelection?.parameters?.n,
    node.modelSelection?.parameters?.ratio,
    node.modelSelection?.parameters?.resolution,
    node.modelSelection?.parameters?.speed,
    node.modelSelection?.parameters?.speakerId
  ]);

  useEffect(() => {
    if (!expanded) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [expanded]);

  useEffect(() => {
    if (!isVideoPromptNode(node)) return undefined;
    const dismissOnOutsideClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const owner = target?.closest<HTMLElement>("[data-video-popover-owner]");
      if (owner?.dataset.videoPopoverOwner === node.id) return;
      closeOwnedVideoPopovers();
    };
    document.addEventListener("click", dismissOnOutsideClick);
    return () => document.removeEventListener("click", dismissOnOutsideClick);
  }, [node.id]);

  useEffect(() => {
    if (!expanded && inputRef.current && inputRef.current.textContent !== value) {
      inputRef.current.textContent = value;
    }
  }, [expanded, value]);

  const closeExpandedPrompt = () => {
    if (inputRef.current) inputRef.current.textContent = value;
    mentionTargetRef.current = null;
    setMentionOpen(false);
    setExpanded(false);
  };

  const appendAudioToken = (token: string) => {
    if (readOnly) return;
    const nextValue = `${value}${value && !value.endsWith(" ") ? " " : ""}${token}`;
    updateDraftValue(nextValue);
    if (inputRef.current) inputRef.current.textContent = nextValue;
  };

  const mentionNodes = connectedSourceNodes.length > 0 ? connectedSourceNodes : sourceNodes;
  const promptReferenceCandidates = useMemo(() => {
    const connected = mentionNodes.map((reference) => ({
      key: `node-${reference.id}`,
      label: reference.title,
      mediaId: reference.referenceMediaIds?.[0],
      referenceKind: reference.kind === "video" || reference.kind === "audio" ? reference.kind : "image",
      sourceNodeId: reference.id,
      thumbnailUrl: reference.previewUrl
    }));
    const library = assets.flatMap((asset) => asset.versions.flatMap((version) => version?.mediaId ? [{ key: `asset-${asset.id}-${version.id}`, label: asset.name, referenceKind: version.kind || asset.mediaKind || "image", assetId: asset.id, assetVersionId: version.id, mediaId: version.mediaId, thumbnailUrl: version.url || asset.thumbnailUrl }] : []));
    const pinned = (node.assetReferences ?? []).flatMap((reference) => library.filter((candidate) => candidate.assetId === reference.assetId && candidate.assetVersionId === reference.versionId));
    const all = [...connected, ...pinned, ...library];
    const preferred = (node.referenceMediaIds ?? []).flatMap((mediaId) => {
      const candidate = all.find((item) => item.mediaId === mediaId);
      return candidate ? [candidate] : [];
    });
    return [...preferred, ...connected, ...pinned, ...library].filter((candidate, index, items) => {
      const binding = candidate.mediaId || candidate.assetId || candidate.sourceNodeId || candidate.key;
      return items.findIndex((item) => (item.mediaId || item.assetId || item.sourceNodeId || item.key) === binding) === index;
    });
  }, [assets, mentionNodes, node.assetReferences, node.referenceMediaIds]);
  useEffect(() => {
    // Async node/asset loading can briefly leave the editor on the canvas
    // payload's plain document while the server's exact pinned document has
    // already arrived. Never migrate or persist that stale local snapshot.
    if (!node.promptDocument || JSON.stringify(promptDocument) !== JSON.stringify(node.promptDocument)) return;
    const hydrated = hydrateLegacyPromptReferences(promptDocument, promptReferenceCandidates) as PromptDocumentV1;
    if (hydrated === promptDocument) return;
    setPromptDocument(hydrated);
  }, [actions, node.id, node.promptDocument, promptDocument, promptReferenceCandidates]);
  const closeReferenceMention = () => {
    mentionTargetRef.current = null;
    setMentionOpen(false);
  };
  const updateReferenceMention = (surface: "compact" | "expanded", nextValue: string, caretOffset: number | null, range?: Range) => {
    if (readOnly) return;
    const rangeText = range?.endContainer.textContent ?? "";
    if (surface === "compact" && range && range.endContainer.nodeType === Node.TEXT_NODE && range.endOffset > 0 && rangeText[range.endOffset - 1] === "@") {
      mentionTargetRef.current = { surface, triggerIndex: -1, range };
      setMentionOpen(true);
      return;
    }
    if (caretOffset !== null && caretOffset > 0 && nextValue[caretOffset - 1] === "@") {
      mentionTargetRef.current = { surface, triggerIndex: caretOffset - 1, range };
      setMentionOpen(true);
      return;
    }
    if (mentionTargetRef.current?.surface === surface) closeReferenceMention();
  };
  const insertReferenceMention = (reference: CanvasNode, index: number) => {
    if (readOnly) return;
    const target = mentionTargetRef.current;
    if (!target) {
      closeReferenceMention();
      return;
    }
    const token = referenceMention(reference, index);
    if (target.surface === "compact") {
      const host = inputRef.current;
      const range = target.range?.cloneRange();
      const container = range?.endContainer;
      const containerText = container?.textContent ?? "";
      if (!host || !range || !container || !host.contains(container) || container.nodeType !== Node.TEXT_NODE || range.endOffset < 1 || containerText[range.endOffset - 1] !== "@") {
        closeReferenceMention();
        return;
      }
      const nextCharacter = containerText[range.endOffset] ?? "";
      const trailingSpace = nextCharacter === "" || !/\s/.test(nextCharacter) ? " " : "";
      range.setStart(container, range.endOffset - 1);
      range.deleteContents();
      const insertedText = document.createTextNode(`${token}${trailingSpace}`);
      range.insertNode(insertedText);
      range.setStartAfter(insertedText);
      range.collapse(true);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      updateDraftValue(host.textContent ?? "");
      closeReferenceMention();
      host.focus();
      return;
    }
    if (value[target.triggerIndex] !== "@") {
      closeReferenceMention();
      return;
    }
    const beforeTrigger = value.slice(0, target.triggerIndex);
    const afterTrigger = value.slice(target.triggerIndex + 1);
    const trailingSpace = afterTrigger === "" || !/^\s/.test(afterTrigger) ? " " : "";
    const nextValue = `${beforeTrigger}${token}${trailingSpace}${afterTrigger}`;
    const nextCaretOffset = beforeTrigger.length + token.length + trailingSpace.length;
    updateDraftValue(nextValue);
    closeReferenceMention();
    if (expandedInputRef.current) {
      window.requestAnimationFrame(() => {
        expandedInputRef.current?.focus();
        expandedInputRef.current?.setSelectionRange(nextCaretOffset, nextCaretOffset);
      });
    }
  };

  const flushDraft = () => {
    if (readOnly) return;
    if (!draftDirtyRef.current) return;
    const version = draftVersionRef.current;
    void Promise.resolve(actions.savePromptDraft(node.id, value, latestSelectionRef.current)).then(() => {
      if (draftVersionRef.current === version) draftDirtyRef.current = false;
    });
  };

  const sendValue = (selection?: ModelExecutionSelection) => readOnly ? Promise.resolve(null) : actions.sendPrompt(node.id, value.trim() || node.prompt, selection);
  const connectedVideoInputs = connectedSourceNodes.filter((source) => ["image", "subject", "material", "historyPick"].includes(source.kind));
  const visibleVideoInputCount = connectedVideoInputs.length + (node.assetReferences?.length ?? 0);
  const visibleVideoReferenceIds = [...new Set([
    ...connectedVideoInputs.flatMap((source) => source.referenceMediaIds ?? []),
    ...(node.assetReferences ?? []).map((reference) => reference.mediaId).filter((mediaId): mediaId is string => Boolean(mediaId))
  ])];
  const fallbackVideoReferenceIds = node.referenceMediaIds ?? [];
  const videoReferenceIds = visibleVideoInputCount > 0 ? visibleVideoReferenceIds : fallbackVideoReferenceIds;
  const videoReferenceCount = visibleVideoInputCount > 0 ? visibleVideoInputCount : fallbackVideoReferenceIds.length;
  const videoReferenceInput = videoReferenceInputState({
    inputCount: videoReferenceCount,
    mode: videoMode,
    readyMediaCount: videoReferenceIds.length
  });
  const videoReferenceReady = videoReferenceInput.canRun;
  const videoReferenceIssue = videoReferenceInput.issue;
  const videoReferenceCapacity = videoReferenceInput.maximumCount ?? Infinity;
  const videoAddDisabled = videoReferenceCount >= videoReferenceCapacity;
  const videoDurationCapability = videoDurationRange({ modelId: videoModelId, mode: videoMode, generateAudio: videoGenerateAudio, providerId: videoProvider });
  const displayedVideoDuration = clampVideoDuration(videoDuration, videoDurationCapability);
  const videoSelection = (mode: VideoReferenceMode = videoMode, overrides: { duration?: number; generateAudio?: boolean } = {}): ModelExecutionSelection => {
    const generateAudio = videoModelId === H3_VIDEO_MODEL_ID ? true : (overrides.generateAudio ?? videoGenerateAudio);
    const duration = clampVideoDuration(overrides.duration ?? videoDuration, videoDurationRange({ modelId: videoModelId, mode, generateAudio, providerId: videoProvider }));
    return {
      modelId: videoModelId,
      providerId: videoProvider,
      parameters: {
        mode,
        ratio: videoRatio,
        resolution: videoModelId === SEEDANCE_VIDEO_MODEL_ID ? "480p" : videoModelId === H3_VIDEO_MODEL_ID && videoProvider === "minimax" ? h3ProfileResolution(videoResolution) : videoResolution,
        duration,
        n: videoCount,
        generateAudio,
        ...(videoModelId === H3_VIDEO_MODEL_ID && videoProvider === "minimax" ? { h3Profile: videoResolution } : {}),
        ...(mode === "first_frame" && videoReferenceIds[0] ? { firstFrameMediaId: videoReferenceIds[0] } : {}),
        ...(mode === "first_last_frame" && videoReferenceIds[0] && videoReferenceIds[1]
          ? { firstFrameMediaId: videoReferenceIds[0], lastFrameMediaId: videoReferenceIds[1] }
          : {})
      }
    };
  };
  const runVideoGeneration = () => {
    if (!videoReferenceReady) return Promise.resolve(null);
    const selection = videoSelection();
    setVideoDuration(Number(selection.parameters?.duration));
    return sendValue(selection);
  };
  const chooseVideoMode = (mode: VideoReferenceMode) => {
    if (readOnly) return;
    if ((videoModelId === GROK_VIDEO_MODEL_ID && mode === "first_last_frame") || (videoModelId === H3_VIDEO_MODEL_ID && videoProvider === "autodl" && mode === "first_frame")) return;
    const autoDlChannel = videoModelId === H3_VIDEO_MODEL_ID && videoProvider === "autodl";
    const nextRatio = autoDlChannel && mode !== "image_reference" && videoRatio === "1:1" ? "16:9" : videoRatio;
    const nextResolution = autoDlChannel && mode !== "image_reference" && videoResolution === "1080p" ? "768p" : videoResolution;
    setVideoMode(mode);
    setVideoRatio(nextRatio);
    setVideoResolution(nextResolution);
    const duration = clampVideoDuration(videoDuration, videoDurationRange({ modelId: videoModelId, mode, generateAudio: videoGenerateAudio, providerId: videoProvider }));
    setVideoDuration(duration);
    const selection = videoSelection(mode, { duration });
    selection.parameters = { ...selection.parameters, ratio: nextRatio, resolution: nextResolution };
    latestSelectionRef.current = selection;
    void actions.savePromptDraft(node.id, value, selection);
  };
  const chooseVideoModel = (modelId: string, providerId: string, resolution: string) => {
    if (readOnly) return;
    const nextMode = (modelId === GROK_VIDEO_MODEL_ID && videoMode === "first_last_frame")
      || (modelId === H3_VIDEO_MODEL_ID && providerId === "autodl" && videoMode === "first_frame")
      ? "image_reference"
      : videoMode;
    const nextRatio = providerId === "autodl" && (!["16:9", "9:16", ...(nextMode === "image_reference" ? ["1:1"] : [])].includes(videoRatio)
      || (videoRatio === "1:1" && connectedSourceNodes.some((source) => source.kind === "audio")))
      ? "16:9"
      : videoRatio;
    const duration = clampVideoDuration(videoDuration, videoDurationRange({ modelId, mode: nextMode, generateAudio: videoGenerateAudio, providerId }));
    const nextResolution = providerId === "autodl" && resolution === "1080p" && (nextMode !== "image_reference" || duration > 10)
      ? "768p"
      : resolution;
    const current = videoSelection(nextMode, { duration });
    const { h3Profile: _h3Profile, ...baseParameters } = current.parameters ?? {};
    const selection: ModelExecutionSelection = {
      modelId,
      providerId,
      parameters: {
        ...baseParameters,
        mode: nextMode,
        ratio: nextRatio,
        resolution: modelId === H3_VIDEO_MODEL_ID && providerId === "minimax" ? h3ProfileResolution(nextResolution) : nextResolution,
        duration,
        ...(modelId === H3_VIDEO_MODEL_ID ? { ...(providerId === "minimax" ? { h3Profile: nextResolution } : {}), generateAudio: true } : {})
      }
    };
    setVideoModelId(modelId);
    setVideoProvider(providerId);
    setVideoMode(nextMode);
    setVideoRatio(nextRatio);
    setVideoResolution(nextResolution);
    setVideoDuration(duration);
    setVideoCount(1);
    latestSelectionRef.current = selection;
    void actions.savePromptDraft(node.id, value, selection);
  };
  const audioSelection = (modelId = audioModelId, providerId = audioProvider): ModelExecutionSelection => modelId === INDEXTTS2_MODEL_ID
    ? {
      modelId,
      providerId,
      parameters: {
        ...indexTtsEmotions,
        emo_random: indexTtsRandom,
        emo_control_method: "与音色参考音频相同"
      }
    }
    : { modelId, providerId, parameters: { responseFormat: "mp3", speakerId: audioSpeakerId, speed: audioSpeed } };
  const chooseAudioModel = (modelId: string, providerId: string) => {
    if (readOnly) return;
    setAudioModelId(modelId);
    setAudioProvider(providerId);
    const selection = audioSelection(modelId, providerId);
    latestSelectionRef.current = selection;
    void actions.savePromptDraft(node.id, value, selection);
  };
  const saveAudioConfig = () => sendValue(audioSelection());
  const isInput = variant === "input";
  const isTextNode = node.kind === "text";
  const isScriptNode = node.kind === "script";
  const isImageExecutionNode = node.kind === "image";
  const isVideoExecutionNode = isVideoPromptNode(node);
  const isAudioExecutionNode = node.kind === "audio";
  const isAutoDlIndexTts2 = audioModelId === INDEXTTS2_MODEL_ID && audioProvider === "autodl";
  const indexTtsReferenceCount = connectedSourceNodes.filter((source) => source.kind === "audio" && (source.referenceMediaIds?.length || source.previewUrl)).length
    + (node.assetReferences ?? []).filter((reference) => assets.some((asset) => asset.id === reference.assetId && asset.mediaKind === "audio")).length;
  const indexTtsReferenceReady = indexTtsReferenceCount >= 1 && indexTtsReferenceCount <= 2;
  const isFormalDialogueNode = String(node.payload?.resourceType ?? "") === "cinematic_dialogue_line";
  const audioVoiceRunnable = isAutoDlIndexTts2 ? indexTtsReferenceReady && !isFormalDialogueNode : !isFormalDialogueNode || Boolean(audioSpeakerId);
  const isTextExecutionNode = isTextNode || isScriptNode;
  const isMediaNode = isMediaPromptNode(node);
  const usesCompactContext = isTextExecutionNode || isMediaNode || isAudioExecutionNode;
  const textHasReferences = isTextExecutionNode && (connectedSourceNodes.length > 0 || (node.assetReferences?.length ?? 0) > 0);
  const blocked = node.blockedReason;
  const modelOptions = modelOptionsFor(node);
  const specOptions = specOptionsFor(node);
  const statusText = sourceNodes.length > 0 ? `已连接输入：${sourceNodes.map((source) => source.title).join(" / ")}` : blocked ?? (isInput ? "当前节点结果可通过连线作为其他节点的输入。" : node.summary);
  const refNodes = sourceNodes.length > 0 ? sourceNodes : node.refs.map((ref) => ({ id: ref, title: ref }) as CanvasNode);
  const promptClassName = `prompt-card prompt-card-${variant} copilotKitInputContainer${readOnly ? " prompt-card-readonly" : ""}${expanded ? " prompt-card-expanded" : ""}${isTextNode ? " prompt-card-text" : ""}${isScriptNode ? " prompt-card-script" : ""}${isMediaNode ? " prompt-card-media" : ""}${isVideoExecutionNode ? " prompt-card-video" : ""}${isAudioExecutionNode ? " prompt-card-audio" : ""}${isTextExecutionNode && !textHasReferences ? " prompt-card-text-no-upstream" : ""}`;
  const isArkSeedanceMini = videoModelId === SEEDANCE_VIDEO_MODEL_ID;
  const isMiniMaxH3 = videoModelId === H3_VIDEO_MODEL_ID;
  const isAutoDlH3 = isMiniMaxH3 && videoProvider === "autodl";
  const autoDlHasAudioReference = isAutoDlH3 && connectedSourceNodes.some((source) => source.kind === "audio");
  const autoDlResolutionOptions = isAutoDlH3 && videoMode === "image_reference" && displayedVideoDuration <= 10
    ? ["480p", "768p", "1080p"]
    : ["480p", "768p"];
  const autoDlRatioOptions = autoDlHasAudioReference ? ["16:9", "9:16"] : ["16:9", "9:16", "1:1"];
  const videoModeDisplayLabel = isAutoDlH3
    ? videoMode === "text_to_video"
      ? "文生视频"
      : videoMode === "first_last_frame"
        ? "首尾帧控制"
        : videoReferenceCount <= 1 && !autoDlHasAudioReference ? "图生视频" : "多参生视频"
    : videoReferenceModeLabel(videoMode);
  const isOpenRouterGrok = videoModelId === GROK_VIDEO_MODEL_ID;
  const videoPromptBytes = utf8ByteLength(value.trim() || node.prompt);
  const videoPromptTooLong = isOpenRouterGrok && videoPromptBytes > GROK_PROMPT_MAX_BYTES;
  const videoModelLabel = isArkSeedanceMini ? "Seedance 2.0 Mini" : isMiniMaxH3 ? `MiniMax H3 · ${isAutoDlH3 ? "AutoDL" : "本地"}` : "Grok Imagine Video";
  const imageTemplateId = node.imageNodeType === "panorama_equirectangular"
    ? "scene_panorama_equirectangular"
    : node.imageNodeType && node.imageNodeType !== "standard"
      ? node.imageNodeType
      : "freeform";
  const fixedImageSizeByTemplate: Record<string, string> = {
    actor_casting_single: "1024x1536",
    actor_identity_board: "1536x1024",
    character_identity_board: "1536x1024",
    costume_single: "1024x1536",
    costume_design_sheet: "1536x1024",
    hair_makeup_single: "1024x1536",
    hair_makeup_design_sheet: "1536x1024",
    scene_panorama_equirectangular: "3808x1904"
  };
  const fixedImageSize = fixedImageSizeByTemplate[imageTemplateId];
  const imageInitialSelection: ModelExecutionSelection = {
    modelId: node.modelSelection?.modelId ?? "openai/gpt-image-2",
    providerId: node.modelSelection?.providerId ?? "ununu",
    parameters: {
      ...(node.modelSelection?.parameters ?? {}),
      background: node.modelSelection?.parameters?.background === "opaque" ? "opaque" : "auto",
      n: typeof node.modelSelection?.parameters?.n === "number"
        ? node.modelSelection.parameters.n
        : imageTemplateId === "shot_anchor_frame_candidate" || imageTemplateId === "shot_handoff_target_candidate"
          ? 4
          : 1,
      outputFormat: "png",
      quality: node.modelSelection?.parameters?.quality ?? "auto",
      responseFormat: "b64_json",
      size: fixedImageSize ?? node.modelSelection?.parameters?.size ?? "auto",
      templateId: imageTemplateId
    }
  };
  const isLockedImageType = imageTemplateId !== "freeform";
  const isNodeGenerating = node.status === "running" || Boolean(node.generationActivity);
  const promptPlaceholder = node.sourceKind === "asset"
    ? promptOutputModeMeta(node.outputMode || node.kind).placeholder
    : isScriptNode ? "可选：额外要求。不填也会按左侧剧本生成分镜脚本"
      : isAudioExecutionNode ? "输入要合成的文本"
        : isVideoExecutionNode ? "描述动作、运镜、节奏与时长"
          : isInput ? "写入这个节点的输入内容" : "告诉这个节点要生成什么";

  const videoFooter = (
    <div
      className="generator-actions video-execution-controls copilotKitInputControls"
      data-video-popover-owner={node.id}
      onClickCapture={(event) => {
        const activeDetails = event.target instanceof Element ? event.target.closest("details") : null;
        for (const details of event.currentTarget.querySelectorAll("details[open]")) {
          if (details === activeDetails) continue;
          details.removeAttribute("open");
        }
      }}
    >
      <PromptOutputModeSelect actions={actions} node={node} readOnly={readOnly} />
      <details className="generator-model-select">
        <summary className="generator-model" data-model={videoModelLabel}>
          <WandSparkles size={14} />
          <span>{videoModelLabel}</span>
          <ChevronDown size={12} />
        </summary>
        <div className="generator-model-menu" role="listbox">
          <button className={isOpenRouterGrok ? "active" : ""} onClick={(event) => { chooseVideoModel(GROK_VIDEO_MODEL_ID, "openrouter", videoResolution === "480p" ? "480p" : "720p"); event.currentTarget.closest("details")?.removeAttribute("open"); }} type="button">Grok Imagine Video · OpenRouter</button>
          <button className={isArkSeedanceMini ? "active" : ""} onClick={(event) => { chooseVideoModel(SEEDANCE_VIDEO_MODEL_ID, "ark", "480p"); event.currentTarget.closest("details")?.removeAttribute("open"); }} type="button">Seedance 2.0 Mini · Ark</button>
          <button className={isMiniMaxH3 && !isAutoDlH3 ? "active" : ""} onClick={(event) => { chooseVideoModel(H3_VIDEO_MODEL_ID, "minimax", isH3Profile(videoResolution) ? videoResolution : "480p_accelerated"); event.currentTarget.closest("details")?.removeAttribute("open"); }} type="button">MiniMax H3 · 本地算力</button>
          <button className={isAutoDlH3 ? "active" : ""} onClick={(event) => { chooseVideoModel(H3_VIDEO_MODEL_ID, "autodl", ["480p", "768p", "1080p"].includes(videoResolution) ? videoResolution : DEFAULT_VIDEO_RESOLUTION); event.currentTarget.closest("details")?.removeAttribute("open"); }} type="button">MiniMax H3 · AutoDL</button>
        </div>
      </details>
      <details className="video-mode-select">
        <summary className="generator-spec-pill">
          <ImageIcon size={13} />
          <span>{videoModeDisplayLabel}</span>
          <ChevronDown size={12} />
        </summary>
        <div className="video-mode-menu nowheel" onWheelCapture={(event) => event.stopPropagation()}>
          <small>视频生成模式</small>
          {[
            { icon: <FileText size={14} />, label: "文生视频", mode: "text_to_video" as VideoReferenceMode, note: "不使用图片" },
            { icon: <ImageIcon size={14} />, label: isAutoDlH3 ? "图生 / 多参生视频" : "全能参考", mode: "image_reference" as VideoReferenceMode, note: isAutoDlH3 ? "1张图为图生；多图或图片＋音频为多参" : "可使用多张图片" },
            { icon: <Video size={14} />, label: "首帧", mode: "first_frame" as VideoReferenceMode, note: "只使用 1 张图片" },
            { icon: <Video size={14} />, label: isAutoDlH3 ? "首尾帧控制" : "首尾帧", mode: "first_last_frame" as VideoReferenceMode, note: isAutoDlH3 ? "图生视频的高级约束：首帧＋尾帧" : "首帧＋尾帧，共 2 张" }
          ].filter(({ mode }) => !(isAutoDlH3 && mode === "first_frame")).map(({ icon, label, mode, note }) => {
            const unsupported = (isOpenRouterGrok && mode === "first_last_frame") || (isAutoDlH3 && mode === "first_frame");
            return (
            <button
              className={videoMode === mode ? "active" : ""}
              disabled={unsupported}
              key={mode}
              onClick={(event) => {
                chooseVideoMode(mode);
                event.currentTarget.closest("details")?.removeAttribute("open");
              }}
              title={unsupported ? "Grok Imagine Video 当前只支持单首帧，不支持首尾帧" : note}
              type="button"
            >
              {icon}
              <span><strong>{label}</strong><small>{unsupported ? "当前模型不支持" : note}</small></span>
            </button>
          );})}
        </div>
      </details>
      <details className="video-parameter-select">
        <summary className="generator-spec-pill">
          <Video size={13} />
          <span>{videoRatio} · {isMiniMaxH3 && !isAutoDlH3 ? h3ProfileLabel(videoResolution) : videoResolution} · {displayedVideoDuration}s · {isMiniMaxH3 || videoGenerateAudio ? "音频" : "静音"} · {videoCount}个</span>
          <ChevronDown size={12} />
        </summary>
        <div className="video-parameter-menu nowheel" onWheelCapture={(event) => event.stopPropagation()}>
          <section><span>比例</span><div>{(isAutoDlH3 ? autoDlRatioOptions : isMiniMaxH3 ? ["21:9", "16:9", "9:16", "1:1", "4:3", "3:4"] : ["16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3"]).map((ratio) => <button className={videoRatio === ratio ? "active" : ""} key={ratio} onClick={() => setVideoRatio(ratio)} type="button">{ratio}</button>)}</div></section>
          <section><span>{isMiniMaxH3 && !isAutoDlH3 ? "生成档位" : "清晰度"}</span><div>{isAutoDlH3 ? autoDlResolutionOptions.map((resolution) => <button className={videoResolution === resolution ? "active" : ""} key={resolution} onClick={() => setVideoResolution(resolution)} type="button">{resolution.toUpperCase()}</button>) : isMiniMaxH3 ? H3_PROFILE_OPTIONS.map((profile) => <button className={videoResolution === profile.id ? "active" : ""} key={profile.id} onClick={() => setVideoResolution(profile.id)} type="button">{profile.label}</button>) : (isArkSeedanceMini ? ["480p"] : ["480p", "720p"]).map((resolution) => <button className={videoResolution === resolution ? "active" : ""} key={resolution} onClick={() => setVideoResolution(resolution)} type="button">{resolution.toUpperCase()}</button>)}</div></section>
          <section><span>生成时长</span><label><input max={videoDurationCapability.max} min={videoDurationCapability.min} onChange={(event) => { const next = Number(event.target.value); setVideoDuration(next); if (isAutoDlH3 && videoResolution === "1080p" && (videoMode !== "image_reference" || next > 10)) setVideoResolution("768p"); }} type="range" value={displayedVideoDuration} /><strong>{displayedVideoDuration}s</strong></label></section>
          <section><span>生成数量</span><div>{[1].map((count) => <button className={videoCount === count ? "active" : ""} key={count} onClick={() => setVideoCount(count)} type="button">{count}个</button>)}</div></section>
          <section className={`video-audio-setting${isMiniMaxH3 ? " is-fixed" : ""}`}><span>原声音频</span>{isMiniMaxH3 ? <strong className="video-audio-fixed">固定开启</strong> : <label><input checked={videoGenerateAudio} onChange={(event) => { const next = event.target.checked; setVideoGenerateAudio(next); setVideoDuration((current) => clampVideoDuration(current, videoDurationRange({ modelId: videoModelId, mode: videoMode, generateAudio: next }))); }} type="checkbox" /><strong>{videoGenerateAudio ? "生成" : "关闭"}</strong></label>}</section>
        </div>
      </details>
      <span className="generator-spacer" />
      <button aria-busy={isNodeGenerating} aria-label="生成视频" className="send-dot generator-send" disabled={readOnly || isNodeGenerating || !videoReferenceReady || videoPromptTooLong} onClick={() => void runVideoGeneration()} title={readOnly ? "全自动运行期间只读" : isNodeGenerating ? "视频任务正在处理中" : videoPromptTooLong ? `提示词 ${videoPromptBytes} bytes，超过 Grok 的 ${GROK_PROMPT_MAX_BYTES} bytes 上限` : videoReferenceReady ? "提交视频生成任务" : videoReferenceIssue} type="button">{isNodeGenerating ? <LoaderCircle aria-hidden="true" className="model-execution-spinner" size={14} /> : <ArrowUp size={14} />}</button>
    </div>
  );

  const audioFooter = (
    <div className="generator-actions audio-execution-controls copilotKitInputControls">
      <PromptOutputModeSelect actions={actions} node={node} readOnly={readOnly} />
      <details className="generator-model-select">
        <summary className="generator-model" data-model={isAutoDlIndexTts2 ? "IndexTTS2 · AutoDL" : "Seed Audio 1.0"}><Volume2 size={14} /><span>{isAutoDlIndexTts2 ? "IndexTTS2 · AutoDL" : "Seed Audio 1.0"}</span><ChevronDown size={12} /></summary>
        <div className="generator-model-menu" role="listbox">
          <button className={!isAutoDlIndexTts2 ? "active" : ""} onClick={(event) => { chooseAudioModel("seed-audio-1.0", "openspeech"); event.currentTarget.closest("details")?.removeAttribute("open"); }} type="button">Seed Audio 1.0 · 豆包音频</button>
          <button className={isAutoDlIndexTts2 ? "active" : ""} onClick={(event) => { chooseAudioModel(INDEXTTS2_MODEL_ID, "autodl"); event.currentTarget.closest("details")?.removeAttribute("open"); }} type="button">IndexTTS2 · AutoDL</button>
        </div>
      </details>
      {!isAutoDlIndexTts2 ? <details className="audio-voice-select">
        <summary className="generator-spec-pill"><Volume2 size={13} /><span>{audioVoiceLabel(audioSpeakerId)}</span><ChevronDown size={12} /></summary>
        <div className="audio-voice-menu nowheel" onWheelCapture={(event) => event.stopPropagation()}>
          {AUDIO_VOICE_OPTIONS.map((voice) => (
            <button className={audioSpeakerId === voice.id ? "active" : ""} key={voice.id || "auto"} onClick={(event) => { setAudioSpeakerId(voice.id); event.currentTarget.closest("details")?.removeAttribute("open"); }} title={voice.description} type="button">
              <span><strong>{voice.label}</strong><small>{voice.verified ? "可用" : "待验证"}</small></span>
            </button>
          ))}
          <label className="audio-custom-speaker">
            <span>自定义音色 ID</span>
            <input onChange={(event) => setAudioSpeakerId(event.target.value.trim())} placeholder="粘贴 speaker ID" value={AUDIO_VOICE_OPTIONS.some((voice) => voice.id === audioSpeakerId) ? "" : audioSpeakerId} />
          </label>
        </div>
      </details> : <span className="generator-spec-pill" title="第1条音频为音色参考；第2条可选音频为情绪参考"><Volume2 size={13} />{indexTtsReferenceCount}/2 条参考</span>}
      <details className="audio-parameter-select">
        <summary className="generator-spec-pill" title="音频参数"><SlidersHorizontal size={13} /><span>{isAutoDlIndexTts2 ? `平静 ${indexTtsEmotions.emo_calm.toFixed(1)} · 开心 ${indexTtsEmotions.emo_happy.toFixed(1)}` : `${audioSpeed.toFixed(1)}x`}</span><ChevronDown size={12} /></summary>
        {isAutoDlIndexTts2 ? <div className="audio-parameter-menu index-tts-emotion-menu nowheel" onWheelCapture={(event) => event.stopPropagation()}>
          {INDEXTTS2_EMOTIONS.map(([key, label]) => <label key={key}><span>{label}</span><input max="1" min="0" onChange={(event) => setIndexTtsEmotions((current) => ({ ...current, [key]: Number(event.target.value) }))} step="0.1" type="range" value={indexTtsEmotions[key]} /><strong>{indexTtsEmotions[key].toFixed(1)}</strong></label>)}
          <label><span>随机情绪</span><input checked={indexTtsRandom} onChange={(event) => setIndexTtsRandom(event.target.checked)} type="checkbox" /><strong>{indexTtsRandom ? "开启" : "关闭"}</strong></label>
        </div> : <div className="audio-parameter-menu nowheel" onWheelCapture={(event) => event.stopPropagation()}><span>语速</span><label><input max="1.5" min="0.6" onChange={(event) => setAudioSpeed(Number(event.target.value))} step="0.1" type="range" value={audioSpeed} /><strong>{audioSpeed.toFixed(1)}x</strong></label></div>}
      </details>
      <span className="generator-spacer" />
      <button aria-busy={isNodeGenerating} aria-label="生成音频" className="send-dot generator-send" disabled={readOnly || isNodeGenerating || !audioVoiceRunnable} onClick={() => void saveAudioConfig()} title={readOnly ? "全自动运行期间只读" : isNodeGenerating ? "音频正在生成" : isAutoDlIndexTts2 && isFormalDialogueNode ? "正式对白仍须走已接受的角色声音权威" : isAutoDlIndexTts2 && !indexTtsReferenceReady ? "请连接1条音色参考；可再连接1条情绪参考" : !audioVoiceRunnable ? "正式对白必须先选择音色" : isAutoDlIndexTts2 ? "通过AutoDL生成IndexTTS2音频" : audioSpeakerId ? "使用所选音色生成音频" : "使用默认音色生成音频"} type="button">{isNodeGenerating ? <LoaderCircle aria-hidden="true" className="model-execution-spinner" size={14} /> : <ArrowUp size={14} />}</button>
    </div>
  );

  const promptInput = (
    <div className="generator-input-wrap">
      <PromptDocumentEditor
        candidates={promptReferenceCandidates}
        document={promptDocument}
        onChange={(nextDocument) => { setPromptDocument(nextDocument); void actions.savePromptDocument?.(node.id, nextDocument, latestSelectionRef.current); }}
        onPlainTextChange={updateDraftValue}
        onSubmit={() => { if (!node.canRun) return; if (isVideoExecutionNode) { if (videoReferenceReady) void runVideoGeneration(); } else void sendValue(); }}
        placeholder={promptPlaceholder}
        readOnly={readOnly}
      />
      {isVideoExecutionNode && isOpenRouterGrok ? <span className={`video-prompt-byte-count${videoPromptTooLong ? " over-limit" : ""}`}>{videoPromptBytes} / {GROK_PROMPT_MAX_BYTES} bytes</span> : null}
    </div>
  );

  return (
    <section className={promptClassName} aria-label={`${node.title} prompt`} data-readonly={readOnly || undefined}>
      <div className="generator-input-shell copilotKitInput">
        {!usesCompactContext ? (
          <div className="generator-card-topline">
            <div className="generator-ref-row">
              {refNodes.length > 0 ? (
                refNodes.map((ref, index) => (
                  <span className="generator-ref-chip" key={ref.id} title={ref.title}>
                    <span className="ref-thumb">{sourceChipLabel(ref)}</span>
                    <span className="ref-count">{index + 1}</span>
                  </span>
                ))
              ) : (
                <span className="generator-ref-chip" title={node.title}>
                  <span className="ref-thumb">{isInput ? "T" : "S"}</span>
                  <span className="ref-count">1</span>
                </span>
              )}
            </div>
            <button aria-label="打开节点详情" className="generator-expand" type="button">
              <Maximize2 size={13} />
            </button>
          </div>
        ) : (
          <button
            aria-label={expanded ? "关闭全屏 Prompt 编辑器" : isScriptNode ? "展开脚本提示词" : isTextNode ? "展开文本提示词" : isVideoExecutionNode ? "展开视频提示词" : isAudioExecutionNode ? "展开音频文本" : "展开图片提示词"}
            className="generator-expand generator-expand-floating"
            onClick={() => {
              setExpanded((current) => !current);
            }}
            type="button"
          >
            {expanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
        )}
        {isTextExecutionNode && textHasReferences ? <NodeReferenceRows actions={actions} assets={assets} node={node} sourceNodes={connectedSourceNodes} /> : null}
        {isMediaNode ? (
          <div className="generator-media-context">
            <NodeReferenceControls
              actions={actions}
              addDisabled={isVideoExecutionNode && videoAddDisabled}
              addDisabledReason={isVideoExecutionNode && videoAddDisabled ? (videoMode === "text_to_video" ? "文生视频不使用图片" : `${videoReferenceModeLabel(videoMode)}已达到图片数量上限`) : undefined}
              assets={assets}
              maximumReferenceCount={isVideoExecutionNode ? videoReferenceInput.maximumCount : undefined}
              node={node}
              referenceIssue={isVideoExecutionNode ? videoReferenceIssue : undefined}
              referenceMode={isVideoExecutionNode ? videoMode : undefined}
              referenceState={isVideoExecutionNode ? videoReferenceInput.state : undefined}
              requiredReferenceCount={isVideoExecutionNode ? videoReferenceInput.requiredCount : undefined}
              sourceNodes={connectedSourceNodes}
            />
          </div>
        ) : null}
        {isAudioExecutionNode ? (
          <div className="generator-audio-context">
            <NodeReferenceControls actions={actions} assets={assets} maximumReferenceCount={isAutoDlIndexTts2 ? 2 : undefined} node={node} referenceIssue={isAutoDlIndexTts2 && !indexTtsReferenceReady ? "IndexTTS2需要1条音色参考，可选第2条情绪参考；参考音频会经临时公网链接发送给AutoDL。" : undefined} referenceMode={isAutoDlIndexTts2 ? "indextts2" : undefined} referenceState={isAutoDlIndexTts2 ? indexTtsReferenceReady ? "ready" : "missing" : undefined} requiredReferenceCount={isAutoDlIndexTts2 ? 1 : undefined} sourceNodes={connectedSourceNodes}>
              {!isAutoDlIndexTts2 ? <><button className="generator-addon" onClick={() => appendAudioToken("<break time=\"0.5s\" />")} title="插入 0.5 秒停顿标记" type="button"><Timer size={13} />停顿</button>
              <button className="generator-addon" onClick={() => appendAudioToken("（轻声）")} title="插入语气提示" type="button"><MessageCircleMore size={13} />语气词</button></> : null}
            </NodeReferenceControls>
          </div>
        ) : null}
        {!usesCompactContext ? (
          <div className="generator-status-row">
            <span className={`state-dot ${node.status}`} />
            <span>{statusText}</span>
          </div>
        ) : null}
        {!usesCompactContext && node.status === "running" ? (
          <div className="generator-progress">
            <i />
          </div>
        ) : null}
        {!usesCompactContext ? (
          <NodeReferenceControls actions={actions} assets={assets} node={node} sourceNodes={connectedSourceNodes} />
        ) : null}
        {!usesCompactContext ? <ModelReferencePacket packet={node.modelReferencePacket} sourceNodes={sourceNodes} /> : null}
        {!usesCompactContext ? <ModelRequestManifest manifest={node.modelRequestManifest} receipt={node.modelExecutionReceipt} /> : null}
        <CinematicPromptFacts facts={node.cinematicPromptFacts} />
        {isTextExecutionNode || isImageExecutionNode ? (
          <ModelExecutionControls.Provider
            busy={isNodeGenerating}
            capability={isImageExecutionNode ? "image" : "text"}
            initialSelection={isImageExecutionNode ? imageInitialSelection : node.modelSelection ?? { modelId: DEFAULT_TEXT_MODEL_ID, providerId: "ununu" }}
            onSelectionChange={(selection) => {
              if (readOnly) return;
              latestSelectionRef.current = selection;
              void actions.savePromptDraft(node.id, value, selection);
            }}
            onSubmit={(selection) => sendValue(selection)}
          >
            {isImageExecutionNode && isLockedImageType ? <div className="image-node-type-lock"><ImageIcon size={13} /><span>{imageTypeLabel(imageTemplateId)}</span><small>类型已锁定</small></div> : null}
            {promptInput}
            <ModelExecutionControls.Feedback />
            <ModelExecutionControls.Frame>
              <PromptOutputModeSelect actions={actions} node={node} readOnly={readOnly} />
              <ModelExecutionControls.Selector />
              {isImageExecutionNode ? <ModelExecutionControls.Parameters /> : null}
              <ModelExecutionControls.Spacer />
              <ModelExecutionControls.Submit disabled={readOnly || !node.canRun} title={readOnly ? "全自动运行期间只读" : isImageExecutionNode ? "生成图片" : isScriptNode ? "生成脚本表" : "发布文本生成"} />
            </ModelExecutionControls.Frame>
            {(isTextExecutionNode || isImageExecutionNode) && expanded && typeof document !== "undefined" ? createPortal(
              <div className="text-prompt-dialog-layer" role="presentation">
                <section aria-label={isScriptNode ? "展开脚本提示词" : isTextNode ? "展开文本提示词" : "展开图片提示词"} aria-modal="true" className="text-prompt-dialog" role="dialog">
                  <button
                    aria-label={isScriptNode ? "收起脚本提示词" : isTextNode ? "收起文本提示词" : "收起图片提示词"}
                    className="text-prompt-dialog-close"
                    onClick={closeExpandedPrompt}
                    title="收起"
                    type="button"
                  >
                    <Minimize2 size={14} />
                  </button>
                  {isImageExecutionNode ? (
                    <NodeReferenceControls actions={actions} assets={assets} node={node} sourceNodes={connectedSourceNodes} />
                  ) : textHasReferences ? <NodeReferenceRows actions={actions} assets={assets} node={node} sourceNodes={connectedSourceNodes} /> : null}
                  {isImageExecutionNode && isLockedImageType ? <div className="image-node-type-lock"><ImageIcon size={13} /><span>{imageTypeLabel(imageTemplateId)}</span><small>类型已锁定</small></div> : null}
                  <div className="text-prompt-dialog-editor nowheel" onWheelCapture={(event) => event.stopPropagation()}>
                    <PromptDocumentEditor
                      candidates={promptReferenceCandidates}
                      document={promptDocument}
                      onChange={(nextDocument) => { setPromptDocument(nextDocument); void actions.savePromptDocument?.(node.id, nextDocument, latestSelectionRef.current); }}
                      onPlainTextChange={updateDraftValue}
                      onSubmit={() => { if (node.canRun) void sendValue(); }}
                      placeholder={isScriptNode ? "填写镜头数量、节奏、时长等拆镜要求" : isTextNode ? "告诉这个文本节点要生成什么" : "描述要生成的图片"}
                      readOnly={readOnly}
                    />
                  </div>
                  <ModelExecutionControls.Feedback />
                  <ModelExecutionControls.Frame>
                    <ModelExecutionControls.Selector />
                    {isImageExecutionNode ? <ModelExecutionControls.Parameters /> : null}
                    <ModelExecutionControls.Spacer />
                    <ModelExecutionControls.Submit disabled={readOnly || !node.canRun} title={readOnly ? "全自动运行期间只读" : isImageExecutionNode ? "生成图片" : isScriptNode ? "生成脚本表" : "发布文本生成"} />
                  </ModelExecutionControls.Frame>
                </section>
              </div>,
              document.querySelector(".video-p0-shell") ?? document.body
            ) : null}
          </ModelExecutionControls.Provider>
        ) : <>{promptInput}{isVideoExecutionNode ? videoFooter : isAudioExecutionNode ? audioFooter : (
        <div className="generator-actions copilotKitInputControls">
          <PromptOutputModeSelect actions={actions} node={node} readOnly={readOnly} />
          <details className="generator-model-select">
            <summary className="generator-model" data-model={primaryModelLabel(node)}>
              <span className="model-dot" />
              <span>{primaryModelLabel(node)}</span>
              <ChevronDown size={12} />
            </summary>
            <div className="generator-model-menu" role="listbox">
              {modelOptions.map((option) => (
                <button className={option === primaryModelLabel(node) ? "active" : ""} key={option} type="button">
                  {option}
                </button>
              ))}
            </div>
          </details>
          {specOptions.map((option) => (
            <span className="generator-spec-pill" key={option}>
              {option}
            </span>
          ))}

          <span className="generator-spacer" />
          <div className="generator-submit-group">
            <PromptMiniTools blocked={blocked} />
            <button className="send-dot generator-send" disabled={readOnly || (!isInput && !node.canRun)} onClick={() => void sendValue()} title={readOnly ? "全自动运行期间只读" : blocked ?? (isInput ? "保存输入" : "发送到节点")} type="button">
              <ArrowUp size={14} />
            </button>
          </div>
        </div>
        )}</>}
        {(isVideoExecutionNode || isAudioExecutionNode) && expanded && typeof document !== "undefined" ? createPortal(
          <div className="text-prompt-dialog-layer" role="presentation">
            <section
              aria-label={isVideoExecutionNode ? "展开视频提示词" : "展开音频文本"}
              aria-modal="true"
              className={`text-prompt-dialog ${isVideoExecutionNode ? "video-prompt-dialog" : "audio-prompt-dialog"}`}
              role="dialog"
            >
              <button
                aria-label={isVideoExecutionNode ? "收起视频提示词" : "收起音频文本"}
                className="text-prompt-dialog-close"
                onClick={closeExpandedPrompt}
                title="收起"
                type="button"
              >
                <Minimize2 size={14} />
              </button>
              {isVideoExecutionNode ? (
                <NodeReferenceControls
                  actions={actions}
                  addDisabled={videoAddDisabled}
                  addDisabledReason={videoAddDisabled ? (videoMode === "text_to_video" ? "文生视频不使用图片" : `${videoReferenceModeLabel(videoMode)}已达到图片数量上限`) : undefined}
                  assets={assets}
                  node={node}
                  referenceMode={videoMode}
                  sourceNodes={connectedSourceNodes}
                />
              ) : (
                <NodeReferenceControls actions={actions} assets={assets} maximumReferenceCount={isAutoDlIndexTts2 ? 2 : undefined} node={node} referenceIssue={isAutoDlIndexTts2 && !indexTtsReferenceReady ? "IndexTTS2需要1条音色参考，可选第2条情绪参考；参考音频会经临时公网链接发送给AutoDL。" : undefined} referenceMode={isAutoDlIndexTts2 ? "indextts2" : undefined} referenceState={isAutoDlIndexTts2 ? indexTtsReferenceReady ? "ready" : "missing" : undefined} requiredReferenceCount={isAutoDlIndexTts2 ? 1 : undefined} sourceNodes={connectedSourceNodes}>
                  {!isAutoDlIndexTts2 ? <><button className="generator-addon" onClick={() => appendAudioToken("<break time=\"0.5s\" />")} type="button"><Timer size={13} />停顿</button>
                  <button className="generator-addon" onClick={() => appendAudioToken("（轻声）")} type="button"><MessageCircleMore size={13} />语气词</button></> : null}
                </NodeReferenceControls>
              )}
              <div className="text-prompt-dialog-editor nowheel" onWheelCapture={(event) => event.stopPropagation()}>
                <PromptDocumentEditor
                  candidates={promptReferenceCandidates}
                  document={promptDocument}
                  onChange={(nextDocument) => { setPromptDocument(nextDocument); void actions.savePromptDocument?.(node.id, nextDocument, latestSelectionRef.current); }}
                  onPlainTextChange={updateDraftValue}
                  onSubmit={() => { if (node.canRun) void sendValue(); }}
                  placeholder={isVideoExecutionNode ? "描述动作、运镜、节奏与时长" : "输入要合成的文本"}
                  readOnly={readOnly}
                />
              </div>
              {isVideoExecutionNode && isOpenRouterGrok ? <span className={`video-prompt-byte-count expanded${videoPromptTooLong ? " over-limit" : ""}`}>{videoPromptBytes} / {GROK_PROMPT_MAX_BYTES} bytes</span> : null}
              {isVideoExecutionNode ? videoFooter : audioFooter}
            </section>
          </div>,
          document.querySelector(".video-p0-shell") ?? document.body
        ) : null}
      </div>
    </section>
  );
}
