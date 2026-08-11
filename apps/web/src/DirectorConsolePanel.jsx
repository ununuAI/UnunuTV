"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { applyDirectorCompositionAtTime } from "@ununu/unutv-contracts";
import { api } from "./api.js";
import { DirectorConsoleWorkspace } from "./DirectorConsoleWorkspace.tsx";
import { buildCinematicBoundaryFacts } from "./cinematic-boundary-view-model.js";
import { directorExportPosition } from "./director-export-placement-policy.js";

export function DirectorConsolePanel({ canvas, projectId, selected, notify, onClose, onFit, refresh }) {
  const [stage, setStage] = useState(null);
  const [boundaryFacts, setBoundaryFacts] = useState([]);
  const stageRef = useRef(null);
  const bindingWorldRef = useRef("");

  const commitStage = useCallback((next) => {
    stageRef.current = next;
    setStage(next);
    return next;
  }, []);

  useEffect(() => {
    let current = true;
    api.director(projectId, selected.id).then(async (result) => {
      let next = result.director?.stage || selected.payload?.directorStage || null;
      if (!next) {
        const initialized = await api.applyDirectorCommand(projectId, selected.id, {
          version: "director_stage_command_v1",
          commandId: `director-initialize-${selected.id}`,
          idempotencyKey: `director-initialize-${selected.id}`,
          type: "initialize",
          expectedRevision: 0,
          actor: { actorType: "owner", actorId: "web-director-console" },
          payload: { dimensions: { width: 20, depth: 20, height: 8, unit: "m" } }
        });
        next = initialized.director.stage;
      }
      if (current) commitStage(next);
    }).catch(notify);
    return () => { current = false; };
  }, [commitStage, projectId, selected.id, selected.payload?.directorStage, notify]);

  useEffect(() => {
    const productionId = selected.payload?.productionId;
    if (!productionId) {
      setBoundaryFacts([]);
      return;
    }
    let current = true;
    Promise.all([
      api.sequencePrevis(projectId, productionId),
      api.generationUnits(projectId, productionId),
      api.cinematicEvaluations(projectId, productionId)
    ]).then(([previsResult, unitResult, evaluationResult]) => {
      if (!current) return;
      const sequencePrevis = (previsResult.sequencePrevis || [])
        .find((entry) => entry.sequencePrevisId === selected.payload?.sequencePrevisId)
        || previsResult.sequencePrevis?.[0]
        || null;
      setBoundaryFacts(buildCinematicBoundaryFacts({
        sequencePrevis,
        units: unitResult.generationUnits || unitResult.units || [],
        evaluations: evaluationResult.evaluations || []
      }));
    }).catch((error) => {
      if (current) notify(error);
    });
    return () => { current = false; };
  }, [notify, projectId, selected.payload?.productionId, selected.payload?.sequencePrevisId]);

  useEffect(() => {
    if (!stage || stage.environment) return;
    const incomingWorld = canvas.edges
      .filter((edge) => edge.toNodeId === selected.id)
      .map((edge) => canvas.nodes.find((node) => node.id === edge.fromNodeId))
      .find((node) => node?.kind === "world" && (node.payload?.worldMediaId || node.payload?.currentMediaId));
    if (!incomingWorld) return;
    const isGaussian = Boolean(incomingWorld.payload?.worldMediaId) || incomingWorld.payload?.worldProjection === "gaussian_splat";
    const mediaId = isGaussian ? incomingWorld.payload.worldMediaId : incomingWorld.payload.currentMediaId;
    const bindingKey = `${selected.id}:${incomingWorld.id}:${mediaId}:${stage.revision}`;
    if (bindingWorldRef.current === bindingKey) return;
    bindingWorldRef.current = bindingKey;
    api.bindDirectorWorld(projectId, selected.id, {
      worldNodeId: incomingWorld.id,
      mediaId,
      previewMediaId: incomingWorld.payload.currentMediaId,
      expectedRevision: stage.revision,
      projection: isGaussian ? "gaussian_splat" : "equirectangular",
      format: incomingWorld.payload?.worldFormat,
      idempotencyKey: `web-world-bind:${bindingKey}`
    }).then((result) => {
      commitStage(result.director.stage);
      notify("已将连接的 3D 世界资产绑定到导演台", false);
    }).catch((error) => {
      bindingWorldRef.current = "";
      notify(error);
    });
  }, [canvas.edges, canvas.nodes, commitStage, notify, projectId, selected.id, stage]);

  const persistStage = useCallback(async (draft, expectedRevision) => {
    const applied = await api.applyDirectorCommand(projectId, selected.id, {
      version: "director_stage_command_v1",
      commandId: `director-replace-${crypto.randomUUID()}`,
      idempotencyKey: `web-director-replace:${selected.id}:${expectedRevision}:${crypto.randomUUID()}`,
      type: "replace_document",
      expectedRevision,
      actor: { actorType: "owner", actorId: "web-director-console" },
      payload: { stage: draft }
    });
    const next = applied.director.stage;
    commitStage(next);
    await refresh();
    return next;
  }, [commitStage, projectId, refresh, selected.id]);

  const actions = {
    updateDirectorStage: async (_nodeId, draft, expectedRevision) => {
      await persistStage(draft, expectedRevision);
      notify("导演台空间修订已保存", false);
    },
    updateDirectorEnvironment: async (_nodeId, environment, expectedRevision) => {
      const applied = await api.applyDirectorCommand(projectId, selected.id, {
        version: "director_stage_command_v1",
        commandId: `director-environment-${crypto.randomUUID()}`,
        idempotencyKey: `web-director-environment:${selected.id}:${expectedRevision}:${crypto.randomUUID()}`,
        type: "set_environment",
        expectedRevision,
        actor: { actorType: "owner", actorId: "web-director-console" },
        payload: { environment }
      });
      commitStage(applied.director.stage);
      await refresh();
      notify("3D 世界位姿已通过导演台原子命令保存", false);
      return applied.director.stage;
    },
    importDirectorStagePanorama: async (_nodeId, draft, expectedRevision, dataUrl, title) => {
      const media = await api.importDataMedia(projectId, { nodeId: selected.id, kind: "image", dataUrl, title });
      const url = `/api/projects/${projectId}/media/${media.id}`;
      const next = { ...draft, compositionData: draft.compositionData ? { ...draft.compositionData, environment: { ...draft.compositionData.environment, panoramaUrl: url } } : draft.compositionData };
      await api.setPanorama(projectId, selected.id, { mediaId: media.id, metadata: { projection: "equirectangular", title, url } });
      await persistStage(next, expectedRevision);
      notify("2:1 全景图已导入并绑定到导演台", false);
    },
    exportDirectorStageCamera: async (_nodeId, cameraId, dataUrl, width, height, captureTimeMs = 0, captureVariant = "blocking_plate") => {
      const currentStage = stageRef.current || stage;
      const evaluatedStage = currentStage?.compositionData
        ? applyDirectorCompositionAtTime(currentStage, captureTimeMs)
        : currentStage;
      const camera = evaluatedStage?.cameras?.find((item) => item.id === cameraId);
      if (!camera) throw new Error(`找不到机位：${cameraId}`);
      const variantLabel = captureVariant === "context_wide"
        ? "同机位广角空间锚图"
        : captureVariant === "composited_previs_frame"
          ? `合成预演帧 ${(captureTimeMs / 1000).toFixed(2)}s`
          : "3D调度底图";
      const existing = captureVariant === "composited_previs_frame"
        ? null
        : canvas.nodes.find((item) => item.kind === "image" && item.payload?.createdBy === "director-stage-camera-export" && item.payload?.directorStageExport?.sourceDirectorNodeId === selected.id && item.payload?.directorStageExport?.cameraId === cameraId && (item.payload?.directorStageExport?.captureVariant || "blocking_plate") === captureVariant);
      const media = await api.importDataMedia(projectId, { nodeId: existing?.id || selected.id, kind: "image", dataUrl, title: `${selected.title} · ${camera.label} · ${variantLabel}` });
      const captureId = existing?.payload?.directorStageExport?.captureId || `director-capture-${crypto.randomUUID()}`;
      const mediaUrl = `/api/projects/${projectId}/media/${media.id}`;
      const frameEvidence = captureVariant === "composited_previs_frame"
        ? {
            version: "director_composited_previs_frame_v1",
            compositionVersion: evaluatedStage.compositionData?.version,
            compositionPlayable: evaluatedStage.compositionData?.readiness?.playable === true,
            captureTimeMs,
            durationMs: Number(evaluatedStage.compositionData?.playback?.durationSeconds || 0) * 1000,
            evaluatedCameraId: evaluatedStage.selectedCameraId,
            evaluatedObjectStates: evaluatedStage.objects.map((object) => ({
              objectId: object.id,
              position: object.position,
              rotation: object.rotation,
              visible: object.visible,
            })),
            sequencePrevisId: selected.payload?.sequencePrevisId || null,
            sequencePrevisRevision: selected.payload?.sequencePrevisRevision || null,
          }
        : null;
      const payload = { ...(existing?.payload || {}), createdBy: "director-stage-camera-export", currentMediaId: media.id, mediaIds: [media.id], currentImage: { mediaId: media.id, url: mediaUrl }, imageArtifacts: { version: "image_artifacts_v1", classification: "control_map", controlMap: { mediaId: media.id, url: mediaUrl } }, directorStageExport: { version: "director_stage_export_v2", captureId, sourceDirectorNodeId: selected.id, stageRevision: currentStage.revision, cameraId, cameraSnapshot: camera, captureVariant, captureTimeMs, width, height, ...(frameEvidence ? { frameEvidence } : {}) } };
      let imageNode = existing;
      if (existing) imageNode = await api.updateNode(projectId, existing.id, { payload });
      else {
        const position = directorExportPosition({ nodes: canvas.nodes, sourceNode: selected, stage: currentStage, cameraId, captureVariant });
        imageNode = await api.createNode(projectId, canvas.id, { kind: "image", title: `${camera.label} · ${variantLabel}`, ...position, payload });
        await api.connect(projectId, {
          canvasId: canvas.id,
          fromNodeId: selected.id,
          toNodeId: imageNode.id,
          role: captureVariant === "composited_previs_frame"
            ? "cinematic_stage:previs_composited_frame"
            : "director-camera-export"
        });
      }
      if (captureVariant === "blocking_plate") {
        const timestamp = new Date().toISOString();
        const recorded = await api.applyDirectorCommand(projectId, selected.id, {
          version: "director_stage_command_v1",
          commandId: `director-capture-${crypto.randomUUID()}`,
          idempotencyKey: `director-capture:${selected.id}:${captureId}:${media.id}`,
          type: "record_capture",
          expectedRevision: currentStage.revision,
          actor: { actorType: "owner", actorId: "web-director-console" },
          payload: { capture: { id: captureId, imageNodeId: imageNode.id, mediaId: media.id, cameraId, stageRevision: currentStage.revision, capturedAt: timestamp } }
        });
        commitStage(recorded.director.stage);
      }
      await refresh();
      notify("导演台机位图已导出到真实图片节点", false);
    }
  };

  return <div className="director-console-node-workspace"><DirectorConsoleWorkspace actions={actions} node={{ id: selected.id, title: selected.title, directorStage: stage || undefined, boundaryFacts }} onClose={onClose} />{onFit ? <button className="director-node-fit nodrag nopan" onClick={onFit} type="button">适应当前视野</button> : null}</div>;
}
