"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useProjectEvents } from "./use-project-events.js";
import { api } from "./api.js";
import { PromptCard } from "./PromptCard.tsx";
import { cinematicPromptFactsForNode } from "./cinematic-prompt-facts-view-model.js";
import { imageGenerationStarterPrompt } from "@ununu/unutv-contracts";
import { DEFAULT_TEXT_MODEL_ID } from "./prompt-workbench-api.ts";
import { normalizePromptOutputMode, promptOutputModeForNode } from "./prompt-output-mode-policy.js";
import { resolvePromptModelSelection } from "./prompt-model-selection.js";
import { providerFrameReferenceSources, providerReferenceMediaIds } from "./node-provider-reference-policy.js";
import { DEFAULT_VIDEO_MODEL_ID, DEFAULT_VIDEO_PROVIDER_ID, DEFAULT_VIDEO_RESOLUTION } from "./video-generation-capabilities.js";

function mediaUrl(projectId, mediaId, ownerProjectId) {
  return mediaId ? `/api/projects/${ownerProjectId || projectId}/media/${mediaId}` : undefined;
}

function mapAssets(projectId, assets) {
  return assets.map((asset) => {
    const versions = asset.versions.map((version) => ({
      id: version.id,
      kind: version.payload?.kind || (version.payload?.mime || "").split("/", 1)[0] || "image",
      mediaId: version.mediaId,
      url: mediaUrl(projectId, version.mediaId, version.ownerProjectId || asset.ownerProjectId)
    }));
    const current = versions.find((version) => version.id === asset.currentVersionId) || versions.at(-1);
    return {
      id: asset.id,
      mediaKind: current?.kind,
      name: asset.title,
      role: asset.role,
      scope: asset.scope,
      thumbnailLabel: asset.title.slice(0, 1),
      thumbnailUrl: current?.url,
      versions
    };
  });
}

function outputModeSelection(outputMode, hasVisualReference) {
  if (outputMode === "image") return { provider: "ununu", modelId: "openai/gpt-image-2", parameters: { outputMode } };
  if (outputMode === "audio") return { provider: "openspeech", modelId: "seed-audio-1.0", parameters: { outputMode, responseFormat: "mp3", speed: 1 } };
  if (outputMode === "video") return { provider: DEFAULT_VIDEO_PROVIDER_ID, modelId: DEFAULT_VIDEO_MODEL_ID, parameters: { outputMode, mode: hasVisualReference ? "image_reference" : "text_to_video", ratio: "16:9", resolution: DEFAULT_VIDEO_RESOLUTION, duration: 4, n: 1, generateAudio: true } };
  return { provider: "ununu", modelId: DEFAULT_TEXT_MODEL_ID, parameters: { outputMode } };
}

function exactPromptAssetReferences(document) {
  if (!document || document.type !== "doc" || !Array.isArray(document.content)) return [];
  return document.content
    .filter((token) => token?.type === "reference" && (token.assetId || token.mediaId))
    .map((token) => ({
      assetId: token.assetId || null,
      displayName: token.label,
      mediaId: token.mediaId || null,
      providerIndex: token.providerIndex || null,
      role: token.role || "reference",
      versionId: token.assetVersionId || null,
      lockedReference: true
    }))
    .filter((reference, index, references) => references.findIndex((candidate) => (candidate.mediaId || `${candidate.assetId}:${candidate.versionId}`) === (reference.mediaId || `${reference.assetId}:${reference.versionId}`)) === index);
}

export function NodePromptCard({ actions, connectedNodes, node, readOnly = false }) {
  const [prompt, setPrompt] = useState(null);
  const [assets, setAssets] = useState([]);
  const [runState, setRunState] = useState({ status: "idle", runId: null });
  const draftSaveQueue = useRef(Promise.resolve());
  const templatePrompt = node.kind === "image" ? imageGenerationStarterPrompt(node.payload?.imageNodeType) : "";
  const outputMode = promptOutputModeForNode(node, prompt);
  const worldGenerationUnavailable = node.kind === "world" && node.payload?.worldProviderReady !== true;
  const blockedReason = node.payload?.blockedReason || (worldGenerationUnavailable ? "尚未配置 3D 世界生成 Provider；可连接或导入现有世界媒体" : undefined);

  const load = useCallback(async () => {
    const [promptResult, assetResult] = await Promise.all([
      api.nodePrompt(node.projectId, node.id),
      api.assets(node.projectId)
    ]);
    setPrompt(promptResult.prompt || null);
    setAssets(mapAssets(node.projectId, assetResult.assets || []));
  }, [node.id, node.projectId]);

  useEffect(() => {
    let active = true;
    Promise.all([api.nodePrompt(node.projectId, node.id), api.assets(node.projectId)])
      .then(async ([promptResult, assetResult]) => {
        if (!active) return;
        const loadedPrompt = !readOnly && templatePrompt && !promptResult.prompt?.text && !node.payload?.prompt
          ? await api.saveNodePrompt(node.projectId, node.id, { text: templatePrompt, parameters: {}, referenceNodeIds: node.payload?.refs || [], referenceMediaIds: [] })
          : promptResult.prompt || null;
        if (!active) return;
        setPrompt(loadedPrompt);
        setAssets(mapAssets(node.projectId, assetResult.assets || []));
      })
      .catch(() => {});
    return () => { active = false; };
  }, [node.id, node.projectId, node.payload?.prompt, node.payload?.refs, readOnly, templatePrompt]);

  useProjectEvents(node.projectId, () => { void load(); }, (event) => (
    event.type === "node.prompt_saved" && (event.entityId === node.id || event.payload?.nodeId === node.id)
  ));

  useEffect(() => {
    if (node.payload?.generationStatus === "canceled") {
      setRunState({ status: "idle", runId: null });
      return;
    }
    const recoveredRunId = node.payload?.generationRunId;
    if (node.payload?.generationStatus !== "running" || !recoveredRunId) return;
    setRunState((current) => {
      if (current.status === "submitting" || current.runId === recoveredRunId) return current;
      return { status: node.payload?.generationPhase === "requesting" ? "requesting" : "running", runId: recoveredRunId };
    });
  }, [node.payload?.generationPhase, node.payload?.generationRunId, node.payload?.generationStatus]);

  const applyRunResult = useCallback(async (result) => {
    const status = result?.status || "failed";
    setRunState({ status: status === "queued" ? "requesting" : status === "running" ? "running" : status === "succeeded" || status === "canceled" ? "idle" : "failed", runId: status === "canceled" ? null : result?.id || null });
    if (status === "succeeded") await load();
    return result;
  }, [load]);

  const pollPendingRun = useCallback(async () => {
    if (!runState.runId) return;
    const result = await actions.readRun?.(runState.runId);
    if (!result) return;
    await applyRunResult(result);
  }, [actions, applyRunResult, runState.runId, runState.status]);

  useEffect(() => {
    if (!["requesting", "running"].includes(runState.status) || !runState.runId) return undefined;
    const timer = window.setTimeout(() => { void pollPendingRun(); }, 5000);
    return () => window.clearTimeout(timer);
  }, [pollPendingRun, runState.runId, runState.status]);

  // A formal cinematic run may compile more authority references than the
  // original editable node Prompt. Show the union so the canvas reflects the
  // exact provider request instead of silently displaying only the first image.
  const referenceMediaIds = [...new Set([
    ...(prompt?.referenceMediaIds || []),
    ...(node.payload?.referenceMediaIds || [])
  ])];
  const connectedReferenceMediaIds = connectedNodes
    .filter((item) => item.kind === "image" && item.payload?.currentMediaId)
    .map((item) => item.payload.currentMediaId);
  const ownAssetReferenceMediaIds = node.kind === "asset" && ["image", "video"].includes(outputMode) && node.payload?.currentMediaId ? [node.payload.currentMediaId] : [];
  const promptParameters = prompt?.parameters || {};
  const promptVideoMode = promptParameters.mode || prompt?.mode;
  const isVideoOutput = outputMode === "video" || ["video", "videoShot", "compose"].includes(node.kind);
  const orderedReferenceMediaIds = providerReferenceMediaIds({
    connectedReferenceMediaIds,
    explicitReferenceMediaIds: referenceMediaIds,
    isVideo: isVideoOutput,
    mode: promptVideoMode,
    ownReferenceMediaIds: ownAssetReferenceMediaIds,
    parameters: promptParameters
  });
  const locallyRunning = runState.status === "submitting" || runState.status === "requesting" || runState.status === "running";
  const assetReferences = useMemo(() => {
    const exact = exactPromptAssetReferences(prompt?.document);
    if (exact.length) return exact;
    const compiled = (node.payload?.cinematicReferenceBindings || []).map((binding) => ({
      assetId: binding.assetId || null,
      displayName: binding.displayName || binding.promptAlias || `参考图${binding.providerIndex || ""}`,
      mediaId: binding.mediaId || null,
      providerIndex: binding.providerIndex || null,
      role: binding.role || "reference",
      versionId: binding.versionId || null,
      previewUrl: binding.mediaId ? mediaUrl(node.projectId, binding.mediaId) : undefined,
      lockedReference: true
    }));
    if (compiled.length) return compiled;
    return referenceMediaIds.flatMap((mediaId) => {
      for (const asset of assets) {
        const version = asset.versions.find((candidate) => candidate.mediaId === mediaId);
      if (version) return [{ assetId: asset.id, versionId: version.id, mediaId }];
      }
      return [];
    });
  }, [assets, node.payload?.cinematicReferenceBindings, node.projectId, prompt?.document, referenceMediaIds]);

  const promptNode = useMemo(() => ({
    assetReferences,
    assetRole: node.payload?.assetRole,
    blockedReason,
    canRun: !readOnly && !worldGenerationUnavailable && node.payload?.generationStatus !== "running" && !locallyRunning,
    cinematicPromptFacts: cinematicPromptFactsForNode(node, prompt),
    cost: node.payload?.cost || (outputMode === "image" ? "GPT Image 2" : outputMode === "video" ? "Motion 1.0" : outputMode === "audio" ? "Seed Audio 1.0" : outputMode === "world" ? "3D 世界" : "纯文案"),
    generationActivity: locallyRunning ? { phase: runState.status } : node.payload?.generationStatus === "running" ? { phase: "running" } : undefined,
    id: node.id,
    imageNodeType: node.payload?.imageNodeType,
    kind: node.kind === "asset" ? outputMode : node.kind,
    modelSelection: resolvePromptModelSelection(prompt, node.payload),
    previewUrl: mediaUrl(node.projectId, node.payload?.currentMediaId, node.payload?.mediaOwnerProjectId),
    prompt: prompt?.text || node.payload?.prompt || templatePrompt,
    promptDocument: prompt?.document,
    outputMode,
    referenceMediaIds: orderedReferenceMediaIds,
    refs: prompt?.referenceNodeIds || connectedNodes.map((item) => item.id),
    status: locallyRunning ? "running" : node.payload?.generationStatus || (node.payload?.currentMediaId ? "done" : "idle"),
    sourceKind: node.kind,
    summary: node.payload?.summary || "当前节点结果可通过连线作为其他节点的输入。",
    title: node.title
  }), [assetReferences, blockedReason, connectedNodes, locallyRunning, node, orderedReferenceMediaIds, outputMode, prompt, readOnly, runState.status, templatePrompt, worldGenerationUnavailable]);

  const connectedPromptSources = useMemo(() => connectedNodes.map((source) => ({
    canRun: true,
    cost: source.payload?.cost || "输入",
    id: source.id,
    kind: source.kind,
    referenceMediaIds: source.payload?.currentMediaId ? [source.payload.currentMediaId] : [],
    previewUrl: mediaUrl(node.projectId, source.payload?.currentMediaId, source.payload?.mediaOwnerProjectId),
    prompt: source.payload?.prompt || "",
    refs: source.payload?.refs || [],
    status: source.payload?.generationStatus || "idle",
    summary: source.payload?.summary || "",
    title: source.title
  })), [connectedNodes, node.projectId]);

  const sourceNodes = useMemo(() => [...providerFrameReferenceSources({
    mode: promptVideoMode,
    parameters: promptParameters,
    projectId: node.projectId,
    promptText: prompt?.text
  }), ...connectedPromptSources], [connectedPromptSources, node.projectId, prompt?.text, promptParameters, promptVideoMode]);

  const promptActions = useMemo(() => ({
    bindNodeAssetReference: async (_nodeId, assetId, versionId) => {
      if (readOnly) return;
      const version = assets.find((asset) => asset.id === assetId)?.versions.find((item) => item.id === versionId);
      if (!version?.mediaId) return;
      const current = prompt || { text: node.payload?.prompt || "", parameters: {}, referenceNodeIds: connectedNodes.map((item) => item.id), referenceMediaIds: [] };
      await actions.savePrompt(node, { ...current, referenceMediaIds: [...new Set([...(current.referenceMediaIds || []), version.mediaId])] });
      await load();
    },
    deleteEdge: (fromNodeId, toNodeId) => { if (!readOnly) actions.deleteConnection(fromNodeId, toNodeId); },
    openPanel: (panel) => { if (!readOnly && panel === "referencePicker") actions.openReferencePicker?.(node.id); },
    savePromptDraft: (_nodeId, value, selection) => {
      if (readOnly) return Promise.resolve(prompt);
      const save = async () => {
        const { prompt: persisted } = await api.nodePrompt(node.projectId, node.id);
        const current = persisted || prompt || {
          text: node.payload?.prompt || "",
          parameters: {},
          referenceNodeIds: connectedNodes.map((item) => item.id),
          referenceMediaIds: []
        };
        const next = {
          ...current,
          text: value,
          ...(selection ? {
            provider: selection.providerId,
            modelId: selection.modelId,
            parameters: { ...(current.parameters || {}), ...(selection.parameters || {}), ...(node.kind === "asset" ? { outputMode } : {}) }
          } : {})
        };
        const saved = await api.saveNodePrompt(node.projectId, node.id, next);
        setPrompt(saved);
        return saved;
      };
      draftSaveQueue.current = draftSaveQueue.current.then(save, save);
      return draftSaveQueue.current;
    },
    savePromptDocument: (_nodeId, document, selection) => {
      if (readOnly || !document) return Promise.resolve(prompt);
      const save = async () => {
        const { prompt: persisted } = await api.nodePrompt(node.projectId, node.id);
        const current = persisted || prompt || { text: node.payload?.prompt || "", parameters: {}, referenceNodeIds: connectedNodes.map((item) => item.id), referenceMediaIds: [] };
        const next = {
          ...current,
          document,
          ...(selection ? { provider: selection.providerId, modelId: selection.modelId, parameters: { ...(current.parameters || {}), ...(selection.parameters || {}), ...(node.kind === "asset" ? { outputMode } : {}) } } : {})
        };
        const saved = await api.saveNodePrompt(node.projectId, node.id, next);
        setPrompt(saved);
        return saved;
      };
      draftSaveQueue.current = draftSaveQueue.current.then(save, save);
      return draftSaveQueue.current;
    },
    setPromptOutputMode: async (_nodeId, nextOutputMode) => {
      if (readOnly || node.kind !== "asset") return prompt;
      const mode = normalizePromptOutputMode(nextOutputMode);
      const { prompt: persisted } = await api.nodePrompt(node.projectId, node.id);
      const current = persisted || prompt || { text: node.payload?.prompt || "", parameters: {}, referenceNodeIds: connectedNodes.map((item) => item.id), referenceMediaIds: [] };
      const selection = outputModeSelection(mode, Boolean(node.payload?.currentMediaId || current.referenceMediaIds?.length || connectedNodes.some((item) => item.payload?.currentMediaId)));
      const saved = await api.saveNodePrompt(node.projectId, node.id, { ...current, ...selection });
      await actions.updatePayload?.(node, { promptOutputMode: mode });
      setPrompt(saved);
      return saved;
    },
    sendPrompt: async (_nodeId, value, selection) => {
      if (readOnly) return null;
      setRunState({ status: "submitting", runId: null });
      const provider = selection?.providerId || prompt?.provider || (outputMode === "audio" ? "openspeech" : ["image", "text"].includes(outputMode) ? "ununu" : "openrouter");
      const next = {
        document: prompt?.document,
        text: value,
        provider,
        modelId: selection?.modelId || prompt?.modelId,
        mode: selection?.parameters?.mode || prompt?.mode,
        parameters: { ...(prompt?.parameters || {}), ...(selection?.parameters || {}), ...(node.kind === "asset" ? { outputMode } : {}) },
        referenceNodeIds: connectedNodes.map((item) => item.id),
        referenceMediaIds: orderedReferenceMediaIds
      };
      try {
        await actions.savePrompt(node, next);
        if (worldGenerationUnavailable) {
          await load(); setRunState({ status: "idle", runId: null });
          return { status: "blocked", message: blockedReason };
        }
        if (node.kind === "asset") {
          if (outputMode === "text") {
            await actions.updatePayload?.(node, { assetDescription: value, promptOutputMode: outputMode });
            await load(); setRunState({ status: "idle", runId: null });
            return { status: "succeeded" };
          }
          if (actions.createPromptOutputNode) return applyRunResult(await actions.createPromptOutputNode(node, outputMode, next));
        }
        if (["image", "video", "videoShot", "compose", "audio", "text", "script"].includes(node.kind)) return applyRunResult(await actions.runNode(node, next));
        await load(); setRunState({ status: "idle", runId: null });
      } catch (error) { setRunState({ status: "failed", runId: null }); throw error; }
    },
    unbindNodeAssetReference: async (_nodeId, assetId, versionId) => {
      if (readOnly) return;
      const version = assets.find((asset) => asset.id === assetId)?.versions.find((item) => item.id === versionId);
      if (!version?.mediaId) return;
      const current = prompt || { text: node.payload?.prompt || "", parameters: {}, referenceNodeIds: connectedNodes.map((item) => item.id), referenceMediaIds: [] };
      await actions.savePrompt(node, { ...current, referenceMediaIds: (current.referenceMediaIds || []).filter((id) => id !== version.mediaId) });
      await load();
    }
  }), [actions, applyRunResult, assets, blockedReason, connectedNodes, load, node, orderedReferenceMediaIds, outputMode, prompt, readOnly, referenceMediaIds, worldGenerationUnavailable]);

  return <PromptCard actions={promptActions} assets={assets} connectedSourceNodes={connectedPromptSources} node={promptNode} readOnly={readOnly} sourceNodes={sourceNodes} variant="generator" />;
}
