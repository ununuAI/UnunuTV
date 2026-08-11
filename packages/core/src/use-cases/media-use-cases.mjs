import { UnuTvError, assertMediaPreparationV1, createId, nowIso, optionalText, requireEnum, requireNumber, requireText } from "@ununu/unutv-contracts";
import { inferMediaKind } from "../media-policy.mjs";

export function createMediaUseCases(ports, actions = {}) {
  async function importMedia(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const filePath = requireText(input.filePath, "filePath");
    return ports.media.importFile({
      projectId,
      nodeId: input.nodeId ? requireText(input.nodeId, "nodeId") : null,
      filePath,
      kind: inferMediaKind(filePath, input.kind),
      generated: Boolean(input.generated),
      title: optionalText(input.title, "")
    });
  }

  async function importDataMedia(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    return ports.media.importDataUrl({
      projectId,
      nodeId: input.nodeId ? requireText(input.nodeId, "nodeId") : null,
      dataUrl: requireText(input.dataUrl, "dataUrl"),
      kind: requireEnum(input.kind, ["image", "video", "audio"], "kind"),
      title: optionalText(input.title, "")
    });
  }

  async function publishMedia(input = {}) {
    return ports.publisher.publish({
      projectId: requireText(input.projectId, "projectId"),
      mediaId: requireText(input.mediaId, "mediaId"),
      provider: optionalText(input.provider, "ark"),
      expiresInSeconds: requireNumber(input.expiresInSeconds, "expiresInSeconds", 86400)
    });
  }

  async function extractMediaFrame(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const mediaId = requireText(input.mediaId, "mediaId");
    const seconds = requireNumber(input.seconds, "seconds");
    if (seconds < 0) throw new UnuTvError("invalid_frame_time", "seconds must be greater than or equal to 0", 400);
    const source = await ports.projects.getMedia(projectId, mediaId);
    if (!source) throw new UnuTvError("media_not_found", `Media not found: ${mediaId}`, 404);
    if (source.kind !== "video") throw new UnuTvError("video_media_required", "Frame extraction requires video media", 400);
    return ports.media.extractFrame({
      projectId,
      mediaId,
      seconds,
      nodeId: input.nodeId ? requireText(input.nodeId, "nodeId") : null,
      title: optionalText(input.title, "")
    });
  }

  async function separateMediaAudio(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const mediaId = requireText(input.mediaId, "mediaId");
    const sourceNodeId = requireText(input.sourceNodeId, "sourceNodeId");
    if (typeof ports.media?.separateAudioStems !== "function") {
      throw new UnuTvError("audio_separator_unavailable", "当前媒体端口未提供真正的音源分离能力。", 500);
    }
    if (typeof actions.createNode !== "function" || typeof actions.connectEdge !== "function") {
      throw new TypeError("Audio separation requires canvas mutation actions");
    }
    const sourceMedia = await ports.projects.getMedia(projectId, mediaId);
    if (!sourceMedia || !["audio", "video"].includes(sourceMedia.kind)) {
      throw new UnuTvError("audio_source_media_required", "Audio separation requires audio or video media", 400);
    }
    const sourceNode = await ports.projects.getNode(projectId, sourceNodeId);
    if (!sourceNode) throw new UnuTvError("node_not_found", `Node not found: ${sourceNodeId}`, 404);
    const canvas = await ports.projects.openCanvas(projectId, sourceNode.canvasId);
    const existingNodes = canvas.nodes.filter((node) => (
      node.payload?.resourceType === "cinematic_audio_stem"
      && node.payload?.sourceMediaId === mediaId
      && node.payload?.sourceChecksum === sourceMedia.sha256
    ));
    if (existingNodes.length >= 3) {
      return { reused: true, nodes: existingNodes, sourceMediaId: mediaId };
    }
    const separation = await ports.media.separateAudioStems({
      projectId,
      mediaId,
      title: optionalText(input.title, sourceNode.title || sourceMedia.title)
    });
    const nodes = [];
    const edges = [];
    for (const [index, stem] of separation.stems.entries()) {
      const node = await actions.createNode({
        projectId,
        canvasId: sourceNode.canvasId,
        kind: "audio",
        title: stem.media.title,
        x: 80 + index * 520,
        y: 0,
        size: { width: 444, height: 250 },
        payload: {
          productionId: sourceNode.payload?.productionId ?? null,
          stage: "sound_design",
          resourceType: "cinematic_audio_stem",
          resourceId: `${mediaId}:${stem.role}`,
          currentMediaId: stem.media.id,
          mediaIds: [stem.media.id],
          sourceNodeId,
          sourceMediaId: mediaId,
          sourceChecksum: sourceMedia.sha256,
          separationEngine: separation.engine,
          separationModel: separation.model,
          separationMode: separation.mode,
          stemRole: stem.role,
          reviewState: "candidate",
          warning: stem.role === "original_mix"
            ? "原始混音仅作审计母本"
            : "算法分离结果只是候选 stem，必须逐层试听审核后才可替换"
        }
      });
      const edge = await actions.connectEdge({
        projectId,
        canvasId: sourceNode.canvasId,
        fromNodeId: sourceNode.id,
        toNodeId: node.id,
        role: `cinematic_audio:${stem.role}`
      });
      nodes.push(node);
      edges.push(edge);
    }
    return { ...separation, edges, nodes, reused: false, stems: undefined };
  }

  async function createVideoQaContactSheet(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const mediaId = requireText(input.mediaId, "mediaId");
    const nodeId = requireText(input.nodeId, "nodeId");
    const times = Array.isArray(input.times) ? input.times.map(Number) : [0.5, 6, 11.5];
    if (times.length !== 3 || times.some((seconds) => !Number.isFinite(seconds) || seconds < 0)) {
      throw new UnuTvError("invalid_qa_frame_times", "QA contact sheet requires exactly three non-negative frame times", 400);
    }
    if (typeof actions.createNode !== "function" || typeof actions.updateNode !== "function" || typeof actions.connectEdge !== "function") {
      throw new TypeError("Video QA contact sheet requires canvas mutation actions");
    }
    const sourceMedia = await ports.projects.getMedia(projectId, mediaId);
    if (!sourceMedia || sourceMedia.kind !== "video") throw new UnuTvError("video_media_required", "QA contact sheet requires video media", 400);
    const sourceNode = await ports.projects.getNode(projectId, nodeId);
    if (!sourceNode) throw new UnuTvError("node_not_found", `Node not found: ${nodeId}`, 404);
    const canvas = await ports.projects.openCanvas(projectId, sourceNode.canvasId);
    const existing = canvas.nodes.find((node) => (
      node.payload?.resourceType === "cinematic_qa_contact_sheet"
      && node.payload?.sourceVideoMediaId === mediaId
      && node.payload?.sourceVideoChecksum === sourceMedia.sha256
      && JSON.stringify(node.payload?.frameTimes || []) === JSON.stringify(times)
    ));
    const existingQaEdge = existing
      ? canvas.edges.find((edge) => edge.fromNodeId === sourceNode.id && edge.toNodeId === existing.id && edge.role === "cinematic_qa:contact_sheet")
      : null;
    if (existing?.payload?.currentMediaId
      && existing.payload?.qaEvidence?.format === "cinematic_video_start_mid_end_v1"
      && existingQaEdge) {
      const lineagePayload = {
        ...existing.payload,
        productionId: sourceNode.payload?.productionId ?? existing.payload?.productionId ?? null,
        stage: "continuity_qa",
        generationUnitId: sourceNode.payload?.generationUnitId ?? existing.payload?.generationUnitId ?? null
      };
      const lineageNode = (
        lineagePayload.productionId === existing.payload?.productionId
        && lineagePayload.stage === existing.payload?.stage
        && lineagePayload.generationUnitId === existing.payload?.generationUnitId
      ) ? existing : await actions.updateNode({
        projectId,
        nodeId: existing.id,
        expectedRevision: existing.revision,
        payload: lineagePayload
      });
      return {
        reused: true,
        node: lineageNode,
        media: await ports.projects.getMedia(projectId, lineageNode.payload.currentMediaId),
        frameMediaIds: lineageNode.payload.frameMediaIds || [],
        edge: existingQaEdge
      };
    }
    const videoNodes = canvas.nodes
      .filter((node) => ["video", "videoShot", "video-clip"].includes(node.kind))
      .sort((left, right) => left.y - right.y || left.x - right.x || left.id.localeCompare(right.id));
    const videoIndex = Math.max(0, videoNodes.findIndex((node) => node.id === sourceNode.id));
    const qaNode = existing || await actions.createNode({
      projectId,
      canvasId: sourceNode.canvasId,
      kind: "image",
      title: optionalText(input.title, `${sourceNode.title || "镜头"} · 起中落 QA`),
      x: 80 + (videoIndex % 4) * 610,
      y: 9300 + Math.floor(videoIndex / 4) * 470,
      size: { width: 520, height: 308 },
      payload: {
        productionId: sourceNode.payload?.productionId ?? null,
        stage: "continuity_qa",
        resourceType: "cinematic_qa_contact_sheet",
        resourceId: sourceNode.payload?.generationUnitId || sourceNode.payload?.resourceId || mediaId,
        generationUnitId: sourceNode.payload?.generationUnitId ?? null,
        sourceNodeId: sourceNode.id,
        sourceVideoMediaId: mediaId,
        sourceVideoChecksum: sourceMedia.sha256,
        frameTimes: times,
        generationStatus: "extracting"
      }
    });
    const frames = [];
    for (const seconds of times) {
      frames.push(await ports.media.extractFrame({
        projectId,
        mediaId,
        seconds,
        nodeId: qaNode.id,
        title: `${qaNode.title} · ${seconds.toFixed(2)}s`
      }));
    }
    const artifact = await ports.grid.compose({
      projectId,
      cells: frames.map((frame) => frame.id),
      rows: 1,
      cols: 3,
      aspectRatio: 27 / 16
    });
    const contactSheet = await ports.media.importBytes({
      projectId,
      nodeId: qaNode.id,
      kind: artifact.kind,
      mimeType: artifact.mimeType,
      bytes: artifact.bytes,
      title: `${qaNode.title}.png`
    });
    const liveQaNode = await ports.projects.getNode(projectId, qaNode.id);
    const savedNode = await actions.updateNode({
      projectId,
      nodeId: qaNode.id,
      expectedRevision: liveQaNode.revision,
      payload: {
        ...liveQaNode.payload,
        currentMediaId: contactSheet.id,
        mediaIds: [...frames.map((frame) => frame.id), contactSheet.id],
        frameMediaIds: frames.map((frame) => frame.id),
        generationStatus: "succeeded",
        generatedWidth: artifact.width,
        generatedHeight: artifact.height,
        qaEvidence: {
          format: "cinematic_video_start_mid_end_v1",
          sourceVideoMediaId: mediaId,
          sourceVideoChecksum: sourceMedia.sha256,
          frameTimes: times
        }
      }
    });
    const edge = await actions.connectEdge({
      projectId,
      canvasId: sourceNode.canvasId,
      fromNodeId: sourceNode.id,
      toNodeId: savedNode.id,
      role: "cinematic_qa:contact_sheet"
    });
    return { reused: false, node: savedNode, media: contactSheet, frameMediaIds: frames.map((frame) => frame.id), edge };
  }

  async function getMediaPreparation(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const mediaId = requireText(input.mediaId, "mediaId");
    const preparation = await ports.projects.getMediaPreparation(projectId, mediaId);
    if (!preparation) throw new UnuTvError("media_preparation_not_found", `Media preparation not found: ${mediaId}`, 404);
    return assertMediaPreparationV1(preparation);
  }

  async function prepareMedia(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const mediaId = requireText(input.mediaId, "mediaId");
    const media = await ports.projects.getMedia(projectId, mediaId);
    if (!media) throw new UnuTvError("media_not_found", `Media not found: ${mediaId}`, 404);
    const existing = await ports.projects.getMediaPreparation(projectId, mediaId);
    if (input.force !== true && existing?.status === "succeeded" && existing.sourceChecksum === media.sha256) return assertMediaPreparationV1(existing);
    const timestamp = nowIso();
    const pending = assertMediaPreparationV1({
      version: "media_preparation_v1", id: existing?.id ?? createId("media-preparation"), projectId, mediaId, sourceChecksum: media.sha256,
      status: "pending", probe: null, waveform: null, thumbnailRelativePath: null, proxyRelativePath: null, error: null,
      createdAt: existing?.createdAt ?? timestamp, updatedAt: timestamp
    });
    await ports.projects.saveMediaPreparation(projectId, pending);
    try {
      const artifacts = await ports.media.prepare({ projectId, mediaId });
      const succeeded = assertMediaPreparationV1({ ...pending, ...artifacts, status: "succeeded", error: null, updatedAt: nowIso() });
      return ports.projects.saveMediaPreparation(projectId, succeeded);
    } catch (error) {
      await ports.projects.saveMediaPreparation(projectId, assertMediaPreparationV1({ ...pending, status: "failed", error: { code: error?.code ?? "media_preparation_failed", message: error?.message ?? String(error) }, updatedAt: nowIso() }));
      throw error;
    }
  }

  return { createVideoQaContactSheet, extractMediaFrame, getMediaPreparation, importDataMedia, importMedia, prepareMedia, publishMedia, separateMediaAudio };
}
