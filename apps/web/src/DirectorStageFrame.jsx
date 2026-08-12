"use client";

// 3D 导演台。承载 apps/web/public/director/ 下的独立预编译应用,
// 通过 postMessage 与宿主通信。
//
// 该应用来自 infinite-canvas(AGPL-3.0),以未修改的构建产物整体嵌入,
// 随附的 UE Mannequin 模型为 Sketchfab Standard 授权。
//
// 契约(共 6 条消息):
//   宿主 → 导演台   storyai:director-session   { instanceId, theme, project }
//                   storyai:director-panoramas { panoramas }
//   导演台 → 宿主   storyai:director-ready
//                   storyai:director-close
//                   storyai:director-project-changed  { project }
//                   storyai:director-panorama-removed { edgeId, sourceNodeId }
//                   storyai:director-captures-sent    { captures: [{ dataUrl, fileName }] }
//
// project 对宿主是不透明的:只负责存下来和回灌,不解释其内部结构。
// 它存在导演节点的 payload.foreignStage 里 —— 节点 payload 本就是自由 JSON
// 且带 revision,不必让外来结构去过 DirectorStageDocument 的校验。
//
// 截图走 UnuTV 正规路径:dataURL → importDataMedia → 建图片节点 → 连回导演节点,
// 所以机位截图和别处生成的图在画布上是同一种东西。

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api.js";

const FRAME_SRC = "/director/index.html";
const MSG = {
  session: "storyai:director-session",
  panoramas: "storyai:director-panoramas",
  ready: "storyai:director-ready",
  close: "storyai:director-close",
  projectChanged: "storyai:director-project-changed",
  panoramaRemoved: "storyai:director-panorama-removed",
  capturesSent: "storyai:director-captures-sent"
};

/** 导演台回传的场景状态存在节点 payload 里,与 UnuTV 自己的 stage 文档并存互不干扰。 */
export const foreignStageOf = (node) => node?.payload?.foreignStage ?? null;

const PANORAMA_TYPES = ["scene_panorama_equirectangular", "panorama_equirectangular"];

/** 机位 id 用可读 slug,便于在分镜验收标准里认出是哪个机位。 */
const slug = (text) =>
  String(text).trim().toLowerCase().replace(/[^\w一-鿿]+/g, "-").replace(/^-|-$/g, "") || "camera";

/** 连进导演节点的全景图 / 世界节点 → 导演台的环境球。
 *  形状按对方契约:{ edgeId, sourceNodeId, imageUrl, fileName, projectionMode } */
export function directorPanoramas(canvas, directorNode) {
  if (!canvas?.edges || !directorNode) return [];
  return canvas.edges
    .filter((edge) => edge.toNodeId === directorNode.id)
    .map((edge) => ({ edge, source: canvas.nodes.find((item) => item.id === edge.fromNodeId) }))
    .filter(({ source }) => {
      if (!source) return false;
      if (source.kind === "world") return Boolean(source.payload?.worldMediaId || source.payload?.currentMediaId);
      const type = source.payload?.imageType ?? source.payload?.type;
      return source.kind === "image"
        && (PANORAMA_TYPES.includes(type) || /^720°/.test(source.title || ""));
    })
    .map(({ edge, source }) => {
      const mediaId = source.kind === "world"
        ? (source.payload.currentMediaId || source.payload.worldMediaId)
        : (source.payload?.mediaId || source.payload?.currentMediaId);
      const gaussian = source.kind === "world" && source.payload?.worldProjection === "gaussian_splat";
      return {
        edgeId: edge.id,
        sourceNodeId: source.id,
        imageUrl: `/api/projects/${directorNode.projectId}/media/${mediaId}`,
        fileName: `${source.title || "环境"}.png`,
        projectionMode: gaussian ? "backdrop" : "equirectangular"
      };
    })
    .filter((item) => !item.imageUrl.endsWith("/undefined"));
}

export function DirectorStageFrame({
  node,
  projectId,
  canvasId,
  panoramas = [],
  theme = "dark",
  notify,
  refresh,
  onClose
}) {
  const frameRef = useRef(null);
  const [ready, setReady] = useState(false);
  const sessionSentRef = useRef(false);
  const savingRef = useRef(false);
  const pendingRef = useRef(null);
  const nodeRef = useRef(node);
  nodeRef.current = node;

  const post = useCallback((type, payload) => {
    frameRef.current?.contentWindow?.postMessage({ type, payload }, window.location.origin);
  }, []);

  /** 场景状态落盘。串行化 + 落后一拍合并,避免拖动时打爆接口。 */
  const persist = useCallback(async (foreignStage) => {
    if (savingRef.current) { pendingRef.current = foreignStage; return; }
    savingRef.current = true;
    try {
      const current = nodeRef.current;
      await api.updateNode(projectId, current.id, {
        payload: { ...(current.payload ?? {}), foreignStage }
      });
    } catch (error) {
      notify?.(error);
    } finally {
      savingRef.current = false;
      const queued = pendingRef.current;
      pendingRef.current = null;
      if (queued) void persist(queued);
    }
  }, [notify, projectId]);

  /** 确保 UnuTV 侧的 stage 文档存在。截图必须记进它,
   *  否则 bind-shot → cameraTrajectoryPlan → director_stage_blocking 参考图
   *  这条既有链路接不上,导演台就只是个看图工具。 */
  const ensureStage = useCallback(async () => {
    const existing = await api.director(projectId, nodeRef.current.id).catch(() => null);
    if (existing?.director?.stage) return existing.director.stage;
    const created = await api.applyDirectorCommand(projectId, nodeRef.current.id, {
      version: "director_stage_command_v1",
      commandId: `director-init-${crypto.randomUUID()}`,
      idempotencyKey: `director-init:${nodeRef.current.id}`,
      type: "initialize",
      expectedRevision: 0,
      actor: { actorType: "owner", actorId: "web-director-stage-frame" },
      payload: { dimensions: { width: 24, height: 8, depth: 24, unit: "m" } }
    });
    return created.director.stage;
  }, [projectId]);

  /** 尽量从外来场景里取真实机位参数;取不到就用占位值,
   *  下游真正依赖的是 cameraSnapshot.label 与绑定本身。 */
  const cameraFromForeign = useCallback((capture, index) => {
    const foreign = foreignStageOf(nodeRef.current);
    const label = (capture.fileName || `机位 ${index + 1}`).replace(/\.[^.]+$/, "");
    const list = Array.isArray(foreign?.cameras) ? foreign.cameras : [];
    const hit = list.find((item) => item?.name === label || item?.label === label) ?? list[index] ?? null;
    const vec = (value, fallback) => (
      Array.isArray(value) && value.length === 3 && value.every(Number.isFinite)
        ? { x: value[0], y: value[1], z: value[2] }
        : (value && Number.isFinite(value.x) ? { x: value.x, y: value.y, z: value.z } : fallback)
    );
    return {
      id: `foreign-${slug(label)}`,
      label,
      position: vec(hit?.position, { x: 0, y: 1.6, z: 6 }),
      target: vec(hit?.target ?? hit?.lookAt, { x: 0, y: 1.2, z: 0 }),
      fov: Number.isFinite(hit?.fov) ? Math.min(179, Math.max(1, hit.fov)) : 40,
      aspectRatio: typeof hit?.aspectRatio === "string" ? hit.aspectRatio : "16:9",
      shotIds: []
    };
  }, []);

  /** 机位截图 → 媒体 → 画布图片节点 → 连回导演节点 → 记进 stage。 */
  const ingestCaptures = useCallback(async (captures) => {
    const base = nodeRef.current;
    let stage = await ensureStage().catch((error) => { notify?.(error); return null; });
    if (!stage) return;

    let created = 0;
    for (const [index, capture] of captures.entries()) {
      try {
        const media = await api.importDataMedia(projectId, {
          dataUrl: capture.dataUrl,
          kind: "image",
          title: capture.fileName || `导演台机位-${index + 1}.png`
        });
        const mediaId = media?.mediaId ?? media?.id ?? media?.media?.id;
        if (!mediaId) continue;

        const camera = cameraFromForeign(capture, index);
        const imageNode = await api.createNode(projectId, canvasId, {
          kind: "image",
          title: camera.label,
          x: Math.round((base.x ?? 0) + (base.width ?? 480) + 80),
          y: Math.round((base.y ?? 0) + index * 340),
          width: 430,
          height: 310,
          payload: { mediaId, mime: "image/png", source: "director_stage_capture", directorNodeId: base.id }
        });
        if (!imageNode?.id) continue;

        await api
          .connect(projectId, { canvasId, fromNodeId: base.id, toNodeId: imageNode.id, role: "director-camera-export" })
          .catch(() => {});

        // 机位先入册,record_capture 才能引用它
        const withCamera = await api.applyDirectorCommand(projectId, base.id, {
          version: "director_stage_command_v1",
          commandId: `director-camera-${crypto.randomUUID()}`,
          idempotencyKey: `director-camera:${base.id}:${camera.id}:${stage.revision}`,
          type: "upsert_camera",
          expectedRevision: stage.revision,
          actor: { actorType: "owner", actorId: "web-director-stage-frame" },
          payload: { camera }
        });
        stage = withCamera.director.stage;

        const recorded = await api.applyDirectorCommand(projectId, base.id, {
          version: "director_stage_command_v1",
          commandId: `director-capture-${crypto.randomUUID()}`,
          idempotencyKey: `director-capture:${base.id}:${imageNode.id}:${mediaId}`,
          type: "record_capture",
          expectedRevision: stage.revision,
          actor: { actorType: "owner", actorId: "web-director-stage-frame" },
          payload: {
            capture: {
              id: `capture-${crypto.randomUUID()}`,
              imageNodeId: imageNode.id,
              mediaId,
              cameraId: camera.id,
              stageRevision: stage.revision,
              capturedAt: new Date().toISOString()
            }
          }
        });
        stage = recorded.director.stage;
        created += 1;
      } catch (error) {
        notify?.(error);
      }
    }
    if (created) {
      notify?.(`已把 ${created} 张机位截图放到画布,并记入导演台。到分镜上绑定即可作为空间参考进入生成。`, false);
      await refresh?.();
    }
  }, [cameraFromForeign, canvasId, ensureStage, notify, projectId, refresh]);

  useEffect(() => {
    function onMessage(event) {
      if (event.origin !== window.location.origin) return;
      if (event.source !== frameRef.current?.contentWindow) return;
      const { type, payload } = event.data ?? {};

      if (type === MSG.ready) { setReady(true); return; }
      if (type === MSG.close) { onClose?.(); return; }

      if (type === MSG.projectChanged) {
        const next = payload?.project;
        if (next && typeof next === "object" && !Array.isArray(next)) void persist(next);
        return;
      }

      if (type === MSG.capturesSent) {
        const list = Array.isArray(payload?.captures) ? payload.captures : [];
        const usable = list.filter((item) => typeof item?.dataUrl === "string" && item.dataUrl.startsWith("data:image/"));
        if (usable.length) void ingestCaptures(usable);
        return;
      }

      if (type === MSG.panoramaRemoved) {
        // 环境球由宿主的全景节点提供,移除只影响导演台内的引用
        return;
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [ingestCaptures, onClose, persist]);

  // 握手:导演台就绪后灌入已存场景
  useEffect(() => {
    if (!ready || sessionSentRef.current) return;
    sessionSentRef.current = true;
    post(MSG.session, {
      instanceId: node.id,
      theme,
      project: foreignStageOf(node) ?? undefined
    });
  }, [node, post, ready, theme]);

  // 全景节点变化时同步环境球
  useEffect(() => {
    if (!ready || !sessionSentRef.current) return;
    post(MSG.panoramas, { panoramas });
  }, [panoramas, post, ready]);

  return (
    <div className="director-stage-frame">
      <iframe
        className="director-stage-iframe"
        ref={frameRef}
        src={FRAME_SRC}
        title="3D 导演台"
      />
      {!ready ? <div className="director-stage-loading">导演台载入中…</div> : null}
    </div>
  );
}
