"use client";

// 导演台截图:渲染 → 落媒体 → 建图片节点 → 连线 → record_capture。
// 全程走 UnuTV 既有链路,所以导出的机位图能直接在分镜上绑成
// director_stage_blocking 参考图。

import { useCallback } from "react";
import * as THREE from "three";
import { api } from "./api.js";
import { aspectOf } from "./DirectorStageScene.jsx";
import { command } from "./director-stage-command.js";
import { DEG } from "./director-stage-units.js";

export function useDirectorCapture({
  activeCamera, canvasId, node, notify, projectId, refresh, setBusy, setStage, stageRef, three
}) {
  const renderFrom = useCallback((position, target, fov, aspect) => {
    const ctx = three.current;
    if (!ctx) return null;
    const { gl, scene, size } = ctx;
    const cam = new THREE.PerspectiveCamera(fov, aspect, 0.05, 400);
    cam.position.set(position.x, position.y, position.z);
    cam.lookAt(new THREE.Vector3(target.x, target.y, target.z));
    cam.updateProjectionMatrix();
    const height = Math.round(Math.min(size.height, 1080));
    gl.setSize(Math.round(height * aspect), height, false);
    gl.render(scene, cam);
    const dataUrl = gl.domElement.toDataURL("image/png");
    gl.setSize(size.width, size.height, false);
    return dataUrl;
  }, []);

  /** 截图 → 媒体 → 图片节点 → 连线 → record_capture。走 UnuTV 既有链路。 */
  const persistCaptures = useCallback(async (shots) => {
    let current = stageRef.current;
    let created = 0;
    for (const [index, shot] of shots.entries()) {
      try {
        const media = await api.importDataMedia(projectId, {
          dataUrl: shot.dataUrl, kind: "image", title: `${shot.label}.png`
        });
        const mediaId = media?.mediaId ?? media?.id ?? media?.media?.id;
        if (!mediaId) continue;
        // 画布图片节点读的是 currentMediaId,不是 mediaId ——
        // 写错字段的话节点会一直停在「等待图片生成」的空状态。
        const mediaUrl = `/api/projects/${projectId}/media/${mediaId}`;
        const imageNode = await api.createNode(projectId, canvasId, {
          kind: "image", title: shot.label,
          x: Math.round((node.x ?? 0) + (node.width ?? 560) + 80),
          y: Math.round((node.y ?? 0) + index * 340),
          width: 430, height: 310,
          payload: {
            createdBy: "director-stage-camera-export",
            currentMediaId: mediaId,
            mediaIds: [mediaId],
            currentImage: { mediaId, url: mediaUrl },
            imageArtifacts: {
              version: "image_artifacts_v1",
              classification: "control_map",
              controlMap: { mediaId, url: mediaUrl }
            },
            directorNodeId: node.id
          }
        });
        if (!imageNode?.id) continue;
        await api.connect(projectId, {
          canvasId, fromNodeId: node.id, toNodeId: imageNode.id, role: "director-camera-export"
        }).catch(() => {});
        const recorded = await api.applyDirectorCommand(projectId, node.id, command({
          type: "record_capture", expectedRevision: current.revision,
          payload: {
            capture: {
              id: `capture-${crypto.randomUUID()}`, imageNodeId: imageNode.id, mediaId,
              cameraId: shot.cameraId, stageRevision: current.revision,
              capturedAt: new Date().toISOString()
            }
          }
        }));
        current = recorded.director.stage;
        created += 1;
      } catch (error) {
        notify?.(error);
      }
    }
    if (created) {
      setStage(current);
      notify?.(`已导出 ${created} 张机位图到画布,并记入导演台。到分镜上绑定即可作为空间参考进入生成。`, false);
      await refresh?.();
    }
  }, [canvasId, node, notify, projectId, refresh]);

  const captureCurrent = async () => {
    if (!activeCamera) { notify?.("先加一个机位"); return; }
    const aspect = aspectOf(activeCamera.aspectRatio);
    const dataUrl = renderFrom(activeCamera.position, activeCamera.target, activeCamera.fov || 40, aspect);
    if (!dataUrl) return;
    setBusy(true);
    await persistCaptures([{ dataUrl, label: activeCamera.label, cameraId: activeCamera.id }]);
    setBusy(false);
  };

  /** 四方位 / 十二方位:绕注视点环绕一圈批量出图,给 AI 视频多角度空间参考。 */
  const captureOrbit = async (count) => {
    if (!activeCamera) { notify?.("先加一个机位"); return; }
    const aspect = aspectOf(activeCamera.aspectRatio);
    const target = activeCamera.target;
    const from = activeCamera.position;
    const radius = Math.hypot(from.x - target.x, from.z - target.z) || 5.5;
    const base = Math.atan2(from.z - target.z, from.x - target.x);
    const shots = [];
    for (let index = 0; index < count; index += 1) {
      const angle = base + (index / count) * Math.PI * 2;
      const position = { x: target.x + Math.cos(angle) * radius, y: from.y, z: target.z + Math.sin(angle) * radius };
      const dataUrl = renderFrom(position, target, activeCamera.fov || 40, aspect);
      if (dataUrl) shots.push({ dataUrl, label: `${activeCamera.label} · ${Math.round((angle - base) * DEG)}°`, cameraId: activeCamera.id });
    }
    setBusy(true);
    await persistCaptures(shots);
    setBusy(false);
  };

  return { captureCurrent, captureOrbit };
}
