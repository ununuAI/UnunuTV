import {
  CINEMATIC_SHOT_REVISION_REVIEW_TYPE,
  CINEMATIC_SEQUENCE_PREVIS_REVIEW_TYPE,
  CINEMATIC_VISUAL_STATE_DOMAINS,
  UnuTvError,
  cinematicRevisionReviewTargetId,
  cinematicSequencePrevisReviewTargetId,
  latestCinematicMediaReview,
  latestCinematicEvaluationsByUnit,
  nowIso
} from "@ununu/unutv-contracts";
import { generationStrategy } from "./automation-provider-strategy-policy.mjs";
import { requireCinematicVisualProductionOwnerAcceptance } from "./cinematic-visual-production-review-use-case.mjs";
import { cameraTrajectoryNeedsProjection } from "../cinematic-camera-trajectory-projection.mjs";
import { renderCleanPrevisFrameSvg, renderPrevisSvg } from "../previs-svg-renderer.mjs";

function artifact(resourceType, resourceId, title, extra = {}) {
  return { resourceType, resourceId, ...(title ? { title } : {}), ...extra };
}

function output(artifactRefs = [], details = {}) { return { artifactRefs, ...details }; }

export function createAutomationStageExecutor({ ports, dependencies, isBudgetlessWorkflow } = {}) {
  async function liveCanvas(projectId) {
    const project = await ports.projects.open(projectId);
    if (!project?.rootCanvasId) throw new UnuTvError("production_canvas_required", "A visible root canvas is required", 409);
    const canvas = await ports.projects.openCanvas(projectId, project.rootCanvasId);
    if (!canvas) throw new UnuTvError("production_canvas_required", "A visible root canvas is required", 409);
    return canvas;
  }

  async function ensureNode(projectId, {
    kind,
    title,
    x,
    y,
    resourceType,
    resourceId,
    payload = {}
  }) {
    const canvas = await liveCanvas(projectId);
    const current = canvas.nodes.find((node) => (
      node.payload?.resourceType === resourceType
      && node.payload?.resourceId === resourceId
    ));
    if (current) {
      if (typeof dependencies.updateNode !== "function") return current;
      return dependencies.updateNode({
        projectId,
        nodeId: current.id,
        title,
        x,
        y,
        expectedRevision: current.revision,
        payload: { ...current.payload, ...payload, resourceType, resourceId }
      });
    }
    if (typeof dependencies.createNode !== "function") throw new UnuTvError("canvas_projection_unavailable", "Canvas node creation is unavailable", 500);
    return dependencies.createNode({
      projectId,
      canvasId: canvas.id,
      kind,
      title,
      x,
      y,
      payload: { ...payload, resourceType, resourceId }
    });
  }

  async function ensureEdge(projectId, fromNodeId, toNodeId, role) {
    const canvas = await liveCanvas(projectId);
    const current = canvas.edges.find((edge) => (
      edge.fromNodeId === fromNodeId
      && edge.toNodeId === toNodeId
      && edge.role === role
    ));
    if (current) return current;
    if (typeof dependencies.connectEdge !== "function") throw new UnuTvError("canvas_projection_unavailable", "Canvas edge creation is unavailable", 500);
    return dependencies.connectEdge({
      projectId,
      canvasId: canvas.id,
      fromNodeId,
      toNodeId,
      role
    });
  }

  async function projectAcceptedDirectorRoutesIntoCameraContracts({ projectId, productionId }) {
    if (
      !dependencies.getDirectorStage
      || !dependencies.saveDirectorStage
      || !dependencies.directorCinematic
      || !dependencies.sequenceWorkspace
    ) return null;
    const shots = await dependencies.cinematic.listShots({ projectId, productionId });
    const missing = shots.filter(cameraTrajectoryNeedsProjection);
    if (!missing.length) return null;
    const directorNodeIds = [...new Set(missing.map((shot) => shot.directorStageBinding?.directorNodeId).filter(Boolean))];
    if (directorNodeIds.length !== 1) {
      throw new UnuTvError("director_stage_binding_required", "结构化运镜修复要求所有待修镜头绑定同一可见 Director Stage。", 409, {
        shotIds: missing.map((shot) => shot.shotId),
        directorNodeIds
      });
    }
    const directorNodeId = directorNodeIds[0];
    let director = await dependencies.getDirectorStage({ projectId, nodeId: directorNodeId });
    if (!director?.stage) throw new UnuTvError("director_stage_not_initialized", "Director Stage is not initialized", 409);
    let stage = director.stage;
    const allCleanAlreadyExist = missing.every((shot) => (
      ["start", "mid", "end"].every((phase) => stage.captures.some((capture) => (
        capture.shotId === shot.shotId && capture.phase === phase && capture.clean === true
      )))
    ));
    if (!allCleanAlreadyExist) {
      const nextStageRevision = Number(director.version ?? stage.revision ?? 0) + 1;
      const nextCaptures = (stage.captures || []).map((capture) => ({
        ...capture,
        providerEligible: false
      }));
      for (const [shotIndex, shot] of missing.entries()) {
        const camera = stage.cameras.find((entry) => entry.id === shot.directorStageBinding?.cameraId);
        if (!camera) throw new UnuTvError("director_capture_camera_missing", `Camera missing for ${shot.shotId}`, 409);
        for (const [phaseIndex, phase] of ["start", "mid", "end"].entries()) {
          const resourceId = `${shot.shotId}:${phase}`;
          let imageNode = await ensureNode(projectId, {
            kind: "image",
            title: `S${String(shot.order).padStart(2, "0")} ${phase === "start" ? "干净起幅" : phase === "mid" ? "干净中幅" : "干净落幅"}`,
            x: 80 + ((shotIndex * 3 + phaseIndex) % 4) * 610,
            y: 5700 + Math.floor((shotIndex * 3 + phaseIndex) / 4) * 470,
            resourceType: "director_previs_clean_frame",
            resourceId,
            payload: {
              productionId,
              shotId: shot.shotId,
              shotRevision: shot.revision,
              directorNodeId,
              phase,
              clean: true,
              providerEligible: false,
              controls: ["构图", "主体站位", "景深关系", "起中落状态"],
              doesNotControl: ["最终人物外观", "最终材质", "Provider参考图"],
              stage: "previs_design",
              stageStatus: "rendered"
            }
          });
          let mediaId = imageNode.payload?.currentMediaId || null;
          let checksum = imageNode.payload?.checksum || null;
          if (!mediaId) {
            const media = await ports.media.importBytes({
              projectId,
              nodeId: imageNode.id,
              kind: "image",
              mimeType: "image/svg+xml",
              bytes: renderCleanPrevisFrameSvg({ shot, phase }),
              title: `S${String(shot.order).padStart(2, "0")}-${phase}-clean-previs.svg`
            });
            mediaId = media.id;
            checksum = media.sha256;
            imageNode = await ports.projects.getNode(projectId, imageNode.id);
            imageNode = await dependencies.updateNode({
              projectId,
              nodeId: imageNode.id,
              expectedRevision: imageNode.revision,
              payload: {
                ...imageNode.payload,
                currentMediaId: mediaId,
                checksum,
                stageRevision: nextStageRevision
              }
            });
          }
          const captureId = `capture-${shot.shotId}-clean-${phase}-r${nextStageRevision}`;
          const existingIndex = nextCaptures.findIndex((entry) => (
            entry.shotId === shot.shotId && entry.phase === phase && entry.clean === true
          ));
          const capture = {
            id: captureId,
            imageNodeId: imageNode.id,
            mediaId,
            cameraId: camera.id,
            stageRevision: nextStageRevision,
            capturedAt: nowIso(),
            shotId: shot.shotId,
            phase,
            clean: true,
            view: "camera_pov",
            providerEligible: false
          };
          if (existingIndex >= 0) nextCaptures[existingIndex] = capture;
          else nextCaptures.push(capture);
          await ensureEdge(projectId, directorNodeId, imageNode.id, `cinematic_stage:clean_${phase}_capture`);
        }
      }
      stage = {
        ...stage,
        revision: nextStageRevision,
        captures: nextCaptures,
        updatedAt: nowIso()
      };
      director = await dependencies.saveDirectorStage({ projectId, nodeId: directorNodeId, stage });
      stage = director.stage;
    }

    const revisedShots = [];
    for (const shot of missing) {
      const startCapture = stage.captures.find((capture) => (
        capture.shotId === shot.shotId && capture.phase === "start" && capture.clean === true
      ));
      const bound = await dependencies.directorCinematic.bindDirectorCaptureToShot({
        projectId,
        productionId,
        shotId: shot.shotId,
        directorNodeId,
        captureId: startCapture.id
      });
      revisedShots.push(bound.shot);
      const canvas = await liveCanvas(projectId);
      const shotNode = canvas.nodes.find((node) => (
        node.payload?.resourceType === "cinematic_shot"
        && node.payload?.resourceId === shot.shotId
      ));
      if (shotNode) {
        await dependencies.updateNode({
          projectId,
          nodeId: shotNode.id,
          expectedRevision: shotNode.revision,
          payload: {
            ...shotNode.payload,
            revision: bound.shot.revision,
            shot: bound.shot,
            cameraTrajectoryPlan: bound.shot.cameraTrajectoryPlan,
            stageStatus: "awaiting_review"
          }
        });
      }
    }

    const latestPrevis = (await dependencies.sequenceWorkspace.listSequencePrevis({ projectId, productionId }))
      .sort((left, right) => right.revision - left.revision)[0] ?? null;
    let sequencePrevis = latestPrevis;
    if (latestPrevis) {
      const revisedById = new Map(revisedShots.map((shot) => [shot.shotId, shot]));
      sequencePrevis = await dependencies.sequenceWorkspace.updateSequencePrevis({
        projectId,
        productionId,
        sequencePrevisId: latestPrevis.sequencePrevisId,
        expectedRevision: latestPrevis.revision,
        patch: {
          status: "candidate",
          shots: latestPrevis.shots.map((previsShot) => {
            const currentShot = revisedById.get(previsShot.shotId);
            if (!currentShot) return previsShot;
            const startCapture = stage.captures.find((capture) => (
              capture.shotId === currentShot.shotId && capture.phase === "start" && capture.clean === true
            ));
            const route = stage.routes.find((entry) => entry.id === currentShot.cameraTrajectoryPlan?.controlGeometryId);
            return {
              ...previsShot,
              shotRevision: currentShot.revision,
              cameraState: {
                ...previsShot.cameraState,
                routeId: route?.id || previsShot.cameraState?.routeId,
                start: route?.points?.[0] || previsShot.cameraState?.start,
                end: route?.points?.at(-1) || previsShot.cameraState?.end
              },
              frameMediaId: startCapture?.mediaId || previsShot.frameMediaId,
              frameSourceRole: "director_low_poly_clean_start_control"
            };
          }),
          directorCaptureIds: stage.captures
            .filter((capture) => capture.clean === true)
            .map((capture) => capture.id)
        }
      });
      for (const shot of sequencePrevis.shots) {
        await dependencies.sequenceWorkspace.compileVisualContextBundle({
          projectId,
          productionId,
          sequencePrevisId: sequencePrevis.sequencePrevisId,
          shotId: shot.shotId
        });
      }
    }
    const directorNode = await ports.projects.getNode(projectId, directorNodeId);
    if (directorNode) {
      await dependencies.updateNode({
        projectId,
        nodeId: directorNodeId,
        expectedRevision: directorNode.revision,
        payload: {
          ...directorNode.payload,
          stageRevision: stage.revision,
          sequencePrevisId: sequencePrevis?.sequencePrevisId || directorNode.payload?.sequencePrevisId,
          sequencePrevisRevision: sequencePrevis?.revision || directorNode.payload?.sequencePrevisRevision,
          cleanCaptureCount: stage.captures.filter((capture) => capture.clean === true).length,
          stageStatus: "awaiting_review"
        }
      });
    }
    const targets = revisedShots.map((shot) => ({
      targetType: CINEMATIC_SHOT_REVISION_REVIEW_TYPE,
      targetId: cinematicRevisionReviewTargetId("shot", shot.shotId, shot.revision),
      shotId: shot.shotId,
      revision: shot.revision
    }));
    throw new UnuTvError(
      "shot_script_owner_acceptance_required",
      "已将接受过的导演台路线投影成结构化运镜合同和独立干净首/中/尾帧；请接受画布上的精确 Shot revision 后再编译视频。",
      409,
      {
        targetType: CINEMATIC_SHOT_REVISION_REVIEW_TYPE,
        targetId: targets[0]?.targetId,
        revision: targets[0]?.revision,
        targets,
        directorNodeId,
        directorStageRevision: stage.revision,
        sequencePrevisId: sequencePrevis?.sequencePrevisId,
        sequencePrevisRevision: sequencePrevis?.revision
      }
    );
  }

  async function requireCurrentSequencePrevisAcceptance({ projectId, productionId }) {
    if (!dependencies.sequenceWorkspace) return;
    const sequencePrevis = (await dependencies.sequenceWorkspace.listSequencePrevis({ projectId, productionId }))
      .sort((left, right) => right.revision - left.revision)[0] ?? null;
    if (!sequencePrevis) return;
    const reviews = await ports.projects.listReviews(projectId);
    const missingFrames = sequencePrevis.shots
      .filter((shot) => shot.frameMediaId && latestCinematicMediaReview(reviews, shot.frameMediaId)?.state !== "accepted")
      .map((shot) => ({
        targetType: "media",
        targetId: shot.frameMediaId,
        mediaId: shot.frameMediaId,
        shotId: shot.shotId,
        sequencePrevisId: sequencePrevis.sequencePrevisId,
        revision: sequencePrevis.revision
      }));
    if (missingFrames.length) {
      throw new UnuTvError(
        "sequence_previs_frame_pixel_acceptance_required",
        `${missingFrames[0].shotId} 的当前低模预演帧必须完成画布像素复核并精确 ACCEPT。`,
        409,
        {
          targetType: "media",
          targetId: missingFrames[0].mediaId,
          mediaId: missingFrames[0].mediaId,
          shotId: missingFrames[0].shotId,
          sequencePrevisId: sequencePrevis.sequencePrevisId,
          revision: sequencePrevis.revision,
          targets: missingFrames
        }
      );
    }
    const targetId = cinematicSequencePrevisReviewTargetId(sequencePrevis.sequencePrevisId, sequencePrevis.revision);
    const accepted = reviews.some((review) => (
      review.targetType === CINEMATIC_SEQUENCE_PREVIS_REVIEW_TYPE
      && review.targetId === targetId
      && review.state === "accepted"
    ));
    if (!accepted) {
      throw new UnuTvError(
        "sequence_previs_owner_acceptance_required",
        "当前低模连续预演、首中尾构图、路线和切镜必须获得精确版本 ACCEPT。",
        409,
        {
          targetType: CINEMATIC_SEQUENCE_PREVIS_REVIEW_TYPE,
          targetId,
          revision: sequencePrevis.revision,
          sequencePrevisId: sequencePrevis.sequencePrevisId,
          frameMediaIds: sequencePrevis.shots.map((shot) => shot.frameMediaId)
        }
      );
    }
  }

  async function requireCurrentShotAcceptances({ projectId, productionId }) {
    const [shots, reviews] = await Promise.all([
      dependencies.cinematic.listShots({ projectId, productionId }),
      ports.projects.listReviews(projectId)
    ]);
    const missing = shots
      .map((shot) => ({
        targetType: CINEMATIC_SHOT_REVISION_REVIEW_TYPE,
        targetId: cinematicRevisionReviewTargetId("shot", shot.shotId, shot.revision),
        shotId: shot.shotId,
        revision: shot.revision
      }))
      .filter((target) => !reviews.some((review) => (
        review.targetType === target.targetType
        && review.targetId === target.targetId
        && review.state === "accepted"
      )));
    if (!missing.length) return;
    throw new UnuTvError(
      "shot_script_owner_acceptance_required",
      `当前分镜脚本 ${missing[0].shotId} r${missing[0].revision} 必须先获得最新 Owner ACCEPT。`,
      409,
      {
        targetType: CINEMATIC_SHOT_REVISION_REVIEW_TYPE,
        targetId: missing[0].targetId,
        shotId: missing[0].shotId,
        revision: missing[0].revision,
        targets: missing
      }
    );
  }

  function requireProduction(resolved) {
    if (!resolved.productionId) throw new UnuTvError("automation_production_required", "Create an Ununu cinematic production before running full-auto", 409);
    return resolved.productionId;
  }

  function requireSource(resolved) {
    if (!resolved.sourceNodeId) throw new UnuTvError("automation_script_required", "Bind a structured script node before running full-auto", 409);
    return resolved.sourceNodeId;
  }

  async function handleStage(projectId, task, resolved, operationContext) {
    const productionId = task.stage === "script_analysis" || task.stage === "block_planning" ? resolved.productionId : requireProduction(resolved);
    if (task.stage === "script_analysis") {
      requireProduction(resolved);
      const packet = await dependencies.cinematic.getStoryPacket({ projectId, productionId });
      if (!packet) throw new UnuTvError("story_packet_required", "StoryProductionPacket is missing; Agent must create or approve story facts", 409);
      return { reused: true, output: output([artifact("story_packet", packet.storyPacketId, "StoryProductionPacket", { versionId: `r${packet.revision}` })]) };
    }
    if (task.stage === "block_planning") {
      const sourceNodeId = requireSource(resolved);
      const document = await dependencies.getScriptDocument({ projectId, nodeId: sourceNodeId });
      if (!document.rows.length) throw new UnuTvError("script_rows_required", "Structured script rows are required for block planning", 409);
      return { output: output([artifact("script_document", sourceNodeId, "结构化剧本", { versionId: `r${document.revision}` })], { rowCount: document.rows.length }) };
    }
    if (task.stage === "visual_bible") {
      const bible = await dependencies.cinematic.getVisualBible({ projectId, productionId });
      if (!bible) throw new UnuTvError("visual_bible_required", "VisualBible is missing; visual rules cannot be invented silently", 409);
      return { reused: true, output: output([artifact("visual_bible", bible.visualBibleId, "VisualBible", { versionId: `r${bible.revision}` })]) };
    }
    if (task.stage === "asset_design") {
      let [assets, authorities] = await Promise.all([
        dependencies.listAssets({ projectId, scope: "project" }),
        dependencies.authorities.listAssetAuthorities({ projectId, productionId })
      ]);
      if (!assets.length && !authorities.length) {
        const derived = await dependencies.authorities.deriveAssetAuthoritiesFromStory({ projectId, productionId, persist: true });
        authorities = derived.candidates;
      }
      if (!assets.length && !authorities.length) throw new UnuTvError("asset_authority_required", "剧作事实不足以派生资产权威；请先补充人物、场景或关键道具事实", 409);
      const bibleNode = (await liveCanvas(projectId)).nodes.find((node) => node.payload?.resourceType === "visual_bible");
      for (const [index, authority] of authorities.entries()) {
        const node = await ensureNode(projectId, {
          kind: "asset",
          title: `${authority.authorityType === "character" ? "角色" : authority.authorityType === "scene" ? "场景" : "道具"} · ${authority.displayName}`,
          x: 80 + (index % 4) * 630,
          y: 560 + Math.floor(index / 4) * 430,
          resourceType: "asset_authority",
          resourceId: authority.authorityId,
          payload: {
            authorityId: authority.authorityId,
            authorityType: authority.authorityType,
            productionId,
            revision: authority.revision,
            status: authority.status,
            authority,
            stage: "asset_design",
            stageStatus: authority.status
          }
        });
        if (bibleNode) await ensureEdge(projectId, bibleNode.id, node.id, "cinematic_stage:asset_authority");
      }
      return { reused: true, output: output([
        ...assets.map((entry) => artifact("asset", entry.id, entry.title, { versionId: entry.currentVersionId })),
        ...authorities.map((entry) => artifact("asset_authority", entry.authorityId, entry.displayName, { versionId: `r${entry.revision}` }))
      ]) };
    }
    if (task.stage === "shot_design") {
      const plan = await dependencies.scriptPlanning.planCinematicFromScript({ projectId, productionId, sourceNodeId: requireSource(resolved), createStoryboard: true });
      const storyboardNode = await ensureNode(projectId, {
        kind: "storyboard",
        title: plan.storyboard?.title || "EP01 镜头板",
        x: 720,
        y: 1900,
        resourceType: "storyboard",
        resourceId: plan.storyboard?.storyboardId || plan.breakdown.breakdownId,
        payload: {
          productionId,
          storyboardId: plan.storyboard?.storyboardId ?? null,
          breakdownId: plan.breakdown.breakdownId,
          revision: plan.storyboard?.revision ?? plan.breakdown.revision,
          shotCount: plan.shots.length,
          stage: "shot_design",
          stageStatus: "ready"
        }
      });
      await ensureEdge(projectId, requireSource(resolved), storyboardNode.id, "cinematic_stage:storyboard");
      for (const [index, shot] of plan.shots.entries()) {
        const shotNode = await ensureNode(projectId, {
          kind: "shot",
          title: `S${String(shot.order).padStart(2, "0")} · ${shot.narrativeJob}`,
          x: 80 + (index % 4) * 610,
          y: 2380 + Math.floor(index / 4) * 470,
          resourceType: "cinematic_shot",
          resourceId: shot.shotId,
          payload: {
            productionId,
            shotId: shot.shotId,
            revision: shot.revision,
            durationSeconds: shot.durationSeconds,
            shot,
            stage: "shot_design",
            stageStatus: "ready"
          }
        });
        await ensureEdge(projectId, storyboardNode.id, shotNode.id, "cinematic_stage:shot_intent");
      }
      return { reused: plan.replayed, output: output([
        artifact("script_breakdown", plan.breakdown.breakdownId, "场/节拍规划", { versionId: `r${plan.breakdown.revision}` }),
        ...plan.shots.map((shot) => artifact("cinematic_shot", shot.shotId, `镜头 ${shot.order}`, { versionId: `r${shot.revision}` })),
        ...(plan.storyboard ? [artifact("storyboard", plan.storyboard.storyboardId, plan.storyboard.title, { versionId: `r${plan.storyboard.revision}` })] : [])
      ]) };
    }
    if (task.stage === "previs_design") {
      if (!dependencies.sequenceWorkspace || !dependencies.saveDirectorStage || !dependencies.directorCinematic) {
        throw new UnuTvError("previs_runtime_unavailable", "Sequence previs runtime is unavailable", 500);
      }
      const existing = (await dependencies.sequenceWorkspace.listSequencePrevis({ projectId, productionId }))
        .sort((left, right) => right.revision - left.revision)[0] ?? null;
      if (existing) {
        const reviews = await ports.projects.listReviews(projectId);
        const targetId = cinematicSequencePrevisReviewTargetId(existing.sequencePrevisId, existing.revision);
        const accepted = reviews.some((review) => (
          review.targetType === CINEMATIC_SEQUENCE_PREVIS_REVIEW_TYPE
          && review.targetId === targetId
          && review.state === "accepted"
        ));
        if (!accepted) {
          throw new UnuTvError(
            "sequence_previs_owner_acceptance_required",
            "完整播放并复核低模预演、起落幅、人物路径、摄影机轨迹与每个切镜后，接受当前 Sequence Previs。",
            409,
            {
              targetType: CINEMATIC_SEQUENCE_PREVIS_REVIEW_TYPE,
              targetId,
              revision: existing.revision,
              sequencePrevisId: existing.sequencePrevisId,
              frameMediaIds: existing.shots.map((shot) => shot.frameMediaId)
            }
          );
        }
        return {
          reused: true,
          output: output([artifact("sequence_previs", existing.sequencePrevisId, existing.title, { versionId: `r${existing.revision}` })])
        };
      }

      const [story, authorities, boards, shots] = await Promise.all([
        dependencies.cinematic.getStoryPacket({ projectId, productionId }),
        dependencies.authorities.listAssetAuthorities({ projectId, productionId }),
        dependencies.storyboards.listStoryboards({ projectId, productionId }),
        dependencies.cinematic.listShots({ projectId, productionId })
      ]);
      if (!shots.length) throw new UnuTvError("cinematic_shots_required", "Low-poly previs requires current shots", 409);
      const directorNode = await ensureNode(projectId, {
        kind: "director",
        title: "EP01 低模预演与镜头控制台",
        x: 80,
        y: 3900,
        resourceType: "sequence_previs_controller",
        resourceId: productionId,
        payload: {
          productionId,
          views: ["top_2_5d", "editor", "camera_pov", "start_end_compare"],
          capabilities: ["actor_routes", "camera_routes", "left_right_arc", "multi_node_camera", "speed_curve", "subject_follow", "aspect_ratio_safe_frame"],
          stage: "previs_design",
          stageStatus: "candidate"
        }
      });
      const timestamp = nowIso();
      const objectsByName = new Map();
      const routes = [];
      const cameras = [];
      const captures = [];
      let stageRevision = 1;
      const currentDirector = await dependencies.getDirectorStage?.({ projectId, nodeId: directorNode.id });
      if (currentDirector?.stage?.revision) stageRevision = currentDirector.stage.revision + 1;
      for (const [shotIndex, shot] of shots.entries()) {
        for (const [actorIndex, actor] of (shot.blocking?.actors ?? []).entries()) {
          const id = `actor-${String(actor.name || actorIndex + 1).replace(/[^\p{L}\p{N}_-]+/gu, "-")}`;
          if (!objectsByName.has(id)) {
            const start = actor.start ?? { x: 2 + actorIndex, y: 0, z: 2 + (actorIndex % 3) };
            objectsByName.set(id, {
              id,
              label: actor.name || `人物${actorIndex + 1}`,
              type: "character",
              position: { x: Number(start.x) || 0, y: Number(start.y) || 0, z: Number(start.z) || 0 },
              rotation: { x: 0, y: Number(actor.facingDegrees) || 0, z: 0 },
              size: { x: 0.45, y: 1.72, z: 0.35 },
              color: actor.color || "#60a5fa",
              visible: true
            });
          }
          routes.push({
            id: `actor-route-${shot.shotId}-${actorIndex + 1}`,
            label: `${actor.name || `人物${actorIndex + 1}`} · S${String(shot.order).padStart(2, "0")}`,
            type: "character",
            color: actor.color || "#60a5fa",
            points: [
              { x: Number(actor.start?.x) || 0, y: Number(actor.start?.y) || 0, z: Number(actor.start?.z) || 0, atMs: 0 },
              { x: Number(actor.end?.x ?? actor.start?.x) || 0, y: Number(actor.end?.y ?? actor.start?.y) || 0, z: Number(actor.end?.z ?? actor.start?.z) || 0, atMs: Math.round((Number(shot.durationSeconds) || 5) * 1000) }
            ]
          });
        }
        const cameraRouteId = `camera-route-${shot.shotId}`;
        const routePoints = (shot.cinematography?.routePoints?.length
          ? shot.cinematography.routePoints
          : [{ x: 1.2, y: 1.55, z: 6.8 }, { x: 4.2, y: 1.55, z: 5.2 }])
          .map((point, index, all) => ({
            x: Number(point.x) || 0,
            y: Number(point.y ?? 1.55) || 1.55,
            z: Number(point.z) || 0,
            atMs: Math.round(((Number(shot.durationSeconds) || 5) * 1000 * index) / Math.max(1, all.length - 1))
          }));
        routes.push({
          id: cameraRouteId,
          label: `摄影机 · S${String(shot.order).padStart(2, "0")}`,
          type: "camera",
          color: "#3b82f6",
          points: routePoints
        });
        const cameraId = `camera-${shot.shotId}`;
        const first = routePoints[0];
        cameras.push({
          id: cameraId,
          label: `S${String(shot.order).padStart(2, "0")} · ${shot.cinematography?.movementPath || "固定机位"}`,
          position: { x: first.x, y: first.y, z: first.z },
          target: shot.cinematography?.lookAt ?? { x: 6, y: 1.45, z: 3.8 },
          fov: Number(shot.cinematography?.fov) || 54,
          aspectRatio: resolved.configuration?.aspectRatio || "9:16",
          shotIds: [shot.shotId],
          routeIds: [cameraRouteId],
          intentionalForegroundCropIds: [],
          objectStates: []
        });
        const imageNode = await ensureNode(projectId, {
          kind: "image",
          title: `S${String(shot.order).padStart(2, "0")} 低模起落幅预演`,
          x: 720 + (shotIndex % 3) * 620,
          y: 3900 + Math.floor(shotIndex / 3) * 470,
          resourceType: "director_previs_frame",
          resourceId: shot.shotId,
          payload: {
            productionId,
            shotId: shot.shotId,
            shotRevision: shot.revision,
            controls: ["场景关系", "人物站位", "人物路径", "摄影机轨迹", "起幅", "落幅", "画幅安全区"],
            doesNotControl: ["最终人物外观", "精细动作", "最终材质"],
            stage: "previs_design",
            stageStatus: "candidate"
          }
        });
        const media = await ports.media.importBytes({
          projectId,
          nodeId: imageNode.id,
          kind: "image",
          mimeType: "image/svg+xml",
          bytes: renderPrevisSvg({ shot, order: shot.order, durationSeconds: shot.durationSeconds }),
          title: `S${String(shot.order).padStart(2, "0")}-previs.svg`
        });
        const liveImageNode = await ports.projects.getNode(projectId, imageNode.id);
        await dependencies.updateNode({
          projectId,
          nodeId: imageNode.id,
          expectedRevision: liveImageNode.revision,
          payload: {
            ...liveImageNode.payload,
            currentMediaId: media.id,
            checksum: media.sha256,
            stageStatus: "rendered"
          }
        });
        const captureId = `capture-${shot.shotId}`;
        captures.push({
          id: captureId,
          imageNodeId: imageNode.id,
          mediaId: media.id,
          cameraId,
          stageRevision,
          capturedAt: timestamp
        });
        await ensureEdge(projectId, directorNode.id, imageNode.id, "cinematic_stage:previs_capture");
      }
      const stage = {
        version: "director_stage_v1",
        revision: stageRevision,
        dimensions: { width: 12, depth: 8, height: 3, unit: "m" },
        objects: [
          { id: "wall-north", label: "北墙", type: "wall", position: { x: 6, y: 1.5, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, size: { x: 12, y: 3, z: 0.15 }, color: "#64748b", visible: true },
          { id: "door-entry", label: "入口门", type: "door", position: { x: 6, y: 1.1, z: 0.1 }, rotation: { x: 0, y: 0, z: 0 }, size: { x: 1.4, y: 2.2, z: 0.12 }, color: "#a16207", visible: true },
          { id: "prop-public-box", label: "公共木箱", type: "prop", position: { x: 7.8, y: 0.35, z: 4.6 }, rotation: { x: 0, y: 0, z: 0 }, size: { x: 1.2, y: 0.7, z: 0.8 }, color: "#92400e", visible: true },
          ...objectsByName.values()
        ],
        routes,
        cameras,
        captures,
        selectedCameraId: cameras[0]?.id || "",
        compositionData: {
          views: ["top_2_5d", "editor", "camera_pov", "start_end_compare"],
          playback: { frameRate: 24, durationSeconds: shots.reduce((sum, shot) => sum + (Number(shot.durationSeconds) || 0), 0), interpolation: "continuous" },
          axis: { attentionAxis: "入口—公共木箱—楼梯", allowedCameraSide: "南侧主轴，只有动机明确的遮挡切才跨轴" }
        },
        createdAt: currentDirector?.stage?.createdAt || timestamp,
        updatedAt: timestamp
      };
      await dependencies.saveDirectorStage({ projectId, nodeId: directorNode.id, stage });
      const boundShots = [];
      for (const [index, shot] of shots.entries()) {
        const bound = await dependencies.directorCinematic.bindDirectorCaptureToShot({
          projectId,
          productionId,
          shotId: shot.shotId,
          directorNodeId: directorNode.id,
          captureId: captures[index].id
        });
        boundShots.push(bound.shot);
        const shotNode = (await liveCanvas(projectId)).nodes.find((node) => node.payload?.resourceType === "cinematic_shot" && node.payload?.resourceId === shot.shotId);
        if (shotNode) await ensureEdge(projectId, shotNode.id, directorNode.id, "cinematic_stage:director_previs");
      }
      const ordered = [...boundShots].sort((left, right) => left.order - right.order);
      let cursor = 0;
      const previsShots = ordered.map((shot, index) => {
        const duration = Number(shot.durationSeconds) || 5;
        const startSeconds = cursor;
        cursor += duration;
        return {
          previsShotId: `previs-shot-${shot.shotId}`,
          shotId: shot.shotId,
          shotRevision: shot.revision,
          order: index + 1,
          narrativeJob: shot.narrativeJob,
          startSeconds,
          endSeconds: cursor,
          entryPhase: shot.openingState,
          exitPhase: shot.endingState,
          cameraState: {
            movement: shot.cinematography?.movementPath || "固定机位",
            routeId: `camera-route-${shot.shotId}`,
            start: routes.find((route) => route.id === `camera-route-${shot.shotId}`)?.points?.[0],
            end: routes.find((route) => route.id === `camera-route-${shot.shotId}`)?.points?.at(-1)
          },
          performanceState: { description: shot.performance?.visibleEvidence || shot.storyBeat },
          spatialState: { description: shot.blocking?.positions || shot.openingState, actors: shot.blocking?.actors || [] },
          audioCue: { description: shot.sound?.design || shot.sound?.ambience || "按镜头声音合同" },
          frameMediaId: captures[index].mediaId,
          frameSourceRole: "director_low_poly_start_end_control"
        };
      });
      const cutDecisions = previsShots.slice(0, -1).map((shot, index) => ({
        cutDecisionId: `cut-${shot.shotId}-${previsShots[index + 1].shotId}`,
        fromShotId: shot.shotId,
        toShotId: previsShots[index + 1].shotId,
        atSeconds: shot.endSeconds,
        transitionType: index === 1 || index === 7 ? "audio_bridge" : "cut",
        motivation: ordered[index + 1].editContinuity?.cutIntent || "按动作因果与信息增量切换",
        outgoingPhase: shot.exitPhase,
        incomingPhase: previsShots[index + 1].entryPhase,
        axisRule: ordered[index + 1].editContinuity?.axis || "保持入口—木箱主轴",
        gazeRelation: "视线与下一镜主体方向连续",
        motionVector: "动作方向或声桥连续",
        audioBridge: ordered[index + 1].sound?.ambience || "雨声与室内搬运声连续",
        overlapSeconds: 0
      }));
      const sequencePrevis = await dependencies.sequenceWorkspace.saveSequencePrevis({
        projectId,
        productionId,
        sequencePrevis: {
          title: "EP01 完整低模预演",
          status: "candidate",
          storyPacketId: story.storyPacketId,
          storyPacketRevision: story.revision,
          durationSeconds: cursor,
          frameRate: 24,
          shots: previsShots,
          cutDecisions,
          acceptedAuthorityIds: authorities.filter((authority) => authority.status === "accepted").map((authority) => authority.authorityId),
          storyboardIds: boards.map((board) => board.storyboardId),
          directorCaptureIds: captures.map((capture) => capture.id),
          rejectedExampleEvaluationIds: [],
          revision: 1
        }
      });
      for (const shot of previsShots) {
        await dependencies.sequenceWorkspace.compileVisualContextBundle({
          projectId,
          productionId,
          sequencePrevisId: sequencePrevis.sequencePrevisId,
          shotId: shot.shotId
        });
      }
      const liveDirector = await ports.projects.getNode(projectId, directorNode.id);
      await dependencies.updateNode({
        projectId,
        nodeId: directorNode.id,
        expectedRevision: liveDirector.revision,
        payload: {
          ...liveDirector.payload,
          sequencePrevisId: sequencePrevis.sequencePrevisId,
          sequencePrevisRevision: sequencePrevis.revision,
          stageRevision,
          stageStatus: "awaiting_review"
        }
      });
      throw new UnuTvError(
        "sequence_previs_owner_acceptance_required",
        "低模预演已生成。请完整播放并复核逐镜起落幅、演员路径、摄影机轨迹、轴线与切镜后接受当前版本。",
        409,
        {
          targetType: CINEMATIC_SEQUENCE_PREVIS_REVIEW_TYPE,
          targetId: cinematicSequencePrevisReviewTargetId(sequencePrevis.sequencePrevisId, sequencePrevis.revision),
          revision: sequencePrevis.revision,
          sequencePrevisId: sequencePrevis.sequencePrevisId,
          directorNodeId: directorNode.id,
          frameMediaIds: captures.map((capture) => capture.mediaId)
        }
      );
    }
    if (task.stage === "prompt_compile") {
      await projectAcceptedDirectorRoutesIntoCameraContracts({ projectId, productionId });
      // Re-project the current Shot revision into the storyboard carrier proof
      // after a Director binding/trajectory revision. This is idempotent and
      // keeps accepted pixels while making their exact Shot scope explicit.
      for (const shot of await dependencies.cinematic.listShots({ projectId, productionId })) {
        if (!shot.directorStageBinding?.directorNodeId || !shot.directorStageBinding?.captureId) continue;
        await dependencies.directorCinematic?.bindDirectorCaptureToShot({
          projectId,
          productionId,
          shotId: shot.shotId,
          directorNodeId: shot.directorStageBinding.directorNodeId,
          captureId: shot.directorStageBinding.captureId
        });
      }
      await requireCurrentSequencePrevisAcceptance({ projectId, productionId });
      await requireCurrentShotAcceptances({ projectId, productionId });
      // Reconcile both missing and already-persisted units against the current
      // accepted storyboard/reference contract before every compile. This is
      // idempotent and repairs stale semantic bindings without bypassing the
      // visible GenerationUnit nodes.
      const { ensureGenerationUnitsForProduction } = await import("../workers/unit-design-worker.mjs");
      await ensureGenerationUnitsForProduction({
        projectId,
        productionId,
        cinematic: dependencies.cinematic,
        projects: ports.projects,
        generationStrategies: resolved.configuration?.generationStrategies
          || resolved.configuration?.workflowManifest?.generationStrategies
          || {},
        storyboards: dependencies.storyboards,
        sequenceWorkspace: dependencies.sequenceWorkspace,
        media: ports.media,
        createNode: dependencies.createNode,
        updateNode: dependencies.updateNode,
        connectEdge: dependencies.connectEdge,
        referenceBindings: resolved.configuration?.referenceBindings || [],
        referenceMediaIds: resolved.configuration?.referenceMediaIds || [],
        visualAnchorPolicy: resolved.configuration?.visualAnchorPolicy || null,
        generationMode: resolved.configuration?.generationMode || null,
        aspectRatio: resolved.configuration?.aspectRatio || resolved.configuration?.workflowManifest?.aspectRatio || "16:9",
        preserveExistingUnitContracts: true
      });
      let units = await dependencies.cinematic.listGenerationUnits({ projectId, productionId });
      if (!units.length) throw new UnuTvError("generation_units_required", "GenerationUnit 尚未建立；请为已批准镜头选择模型策略", 409);
      // Optional knowledge-grounded auto signoff when knowledge port is wired
      if (dependencies.knowledge) {
        const { autoSignoffGenerationUnit } = await import("../workers/expert-signoff-worker.mjs");
        for (const entry of units) {
          const existing = await dependencies.cinematic.listProfessionalContributions({ projectId, productionId });
          const has = existing.some((item) => item.targetId === entry.generationUnit.generationUnitId
            && Array.isArray(item.knowledgeRefs) && item.knowledgeRefs.some((ref) => String(ref).startsWith("kn-")));
          if (!has) {
            await autoSignoffGenerationUnit({
              projectId,
              productionId,
              generationUnitId: entry.generationUnit.generationUnitId,
              roles: ["continuity", "cinematography"],
              cinematic: dependencies.cinematic,
              knowledge: dependencies.knowledge
            });
          }
        }
      }
      const compilations = [];
      for (const entry of units) {
        const generationUnitId = entry.generationUnit.generationUnitId;
        const compilation = await dependencies.cinematic.compileGenerationUnit({ projectId, productionId, generationUnitId });
        const preflight = await dependencies.cinematic.preflightGenerationUnit({ projectId, productionId, generationUnitId });
        if (!preflight.ready) {
          throw new UnuTvError("automation_generation_unit_preflight_failed", `${generationUnitId} 未通过正式生成预检，Agent 不得继续提交 Provider。`, 409, {
            continuityAudit: preflight.continuityAudit,
            generationUnitId,
            lint: preflight.lint,
            modelPreflight: preflight.preflight,
            staleSources: preflight.staleSources
          });
        }
        compilations.push(compilation);
      }
      return { output: output(compilations.map((entry) => artifact("prompt_compilation", entry.compilationId, "CinematicPromptEnvelopeV2", { versionId: entry.envelope?.payloadHash }))) };
    }
    if (task.stage === "video_generation" && resolved.configuration?.workflowManifest) {
      // Cinematic OS path only: formal GenerationUnit run (no storyboard batch).
      const budgetless = isBudgetlessWorkflow(resolved);
      const units = await dependencies.cinematic.listGenerationUnits({ projectId, productionId });
      if (!units.length) throw new UnuTvError("generation_units_required", "正式视频阶段需要 GenerationUnit；禁止 storyboard batch 冒充 formal 路径", 409);
      const evaluations = await dependencies.cinematic.listEvaluations({ projectId, productionId });
      const latestEvaluations = latestCinematicEvaluationsByUnit(evaluations);
      const pendingUnits = units.filter((entry) => latestEvaluations.get(entry.generationUnit.generationUnitId)?.decision !== "ACCEPT");
      if (!pendingUnits.length) {
        return { reused: true, output: output(units.map((entry) => {
          const accepted = latestEvaluations.get(entry.generationUnit.generationUnitId);
          return artifact("cinematic_evaluation", accepted?.evaluationId || entry.generationUnit.generationUnitId, `已验收 ${entry.generationUnit.generationUnitId}`, { mediaId: accepted?.mediaId, versionId: accepted ? `r${accepted.revision}` : undefined });
        })) };
      }
      const budgetInput = generationStrategy(resolved, "video_generation");
      if (!budgetless && (!budgetInput?.provider || !budgetInput?.model || !(Number(budgetInput.perItemAmount ?? budgetInput.amount) > 0))) {
        throw new UnuTvError("automation_generation_strategy_required", "legacy_budget 自动视频生成需要 Provider、模型与预留金额", 409, { stage: task.stage });
      }
      const receipts = [];
      for (const entry of pendingUnits) {
        const unit = entry.generationUnit;
        const preflight = await dependencies.cinematic.preflightGenerationUnit({ projectId, productionId, generationUnitId: unit.generationUnitId });
        if (!preflight.ready) throw new UnuTvError("automation_generation_unit_preflight_failed", `${unit.generationUnitId} 预检失效，已停止 Provider 提交。`, 409, preflight);
        const formalGenerationIntent = {
          version: "formal_generation_intent_v1",
          generationUnitId: unit.generationUnitId,
          generationUnitRevision: unit.revision,
          compilationId: preflight.compilationId,
          payloadHash: preflight.envelope.payloadHash,
          executionNodeId: unit.executionNodeId,
          maxNewSubmissions: 1,
          createdAt: nowIso()
        };
        const receipt = await dependencies.cinematic.runGenerationUnit({
          projectId,
          productionId,
          generationUnitId: unit.generationUnitId,
          ...(budgetless ? { billingMode: "provider_account" } : {
            billingMode: "legacy_budget",
            amount: Number(budgetInput.perItemAmount ?? budgetInput.amount),
            currency: budgetInput.currency
          }),
          // Provider submission identity belongs to the immutable compiled
          // payload, not to the short automation worker lease. A lease can be
          // recovered while an Ark task is still running; including
          // task.attempt here would turn that recovery into another paid
          // submission for the same shot.
          idempotencyKey: `${task.idempotencyKey}:unit:${unit.generationUnitId}:payload:${preflight.envelope.payloadHash}:provider:v1`,
          formalGenerationIntent,
          operationContext
        });
        if (receipt.outcomeUnknown) throw new UnuTvError("paid_submission_outcome_unknown", `${unit.generationUnitId} Provider 结果待确认，自动流程不会重复提交。`, 409, { runId: receipt.run?.id });
        if (!receipt.pending && receipt.run?.status !== "succeeded") {
          throw new UnuTvError(
            receipt.run?.result?.code || "cinematic_video_generation_failed",
            receipt.run?.result?.message || `${unit.generationUnitId} 视频生成失败`,
            409,
            {
              generationUnitId: unit.generationUnitId,
              runId: receipt.run?.id || null,
              provider: unit.generationParameters?.provider || null,
              model: unit.generationParameters?.model || null,
              providerDetails: receipt.run?.result?.details || null
            }
          );
        }
        receipts.push(receipt);
      }
      if (receipts.some((receipt) => receipt.pending)) return { waiting: true, output: output(receipts.map((receipt) => artifact("provider_run", receipt.run.id, "GenerationUnit 视频任务"))) };

      // A generated take is only a candidate. A media receipt is not an
      // evaluation and must never be promoted to ACCEPT by the executor.
      // Persisting it on the storyboard is safe for inspection, while the
      // continuity_qa gate remains blocked until a real evaluation exists.
      for (const receipt of receipts) {
        const generationUnitId = receipt.compilation?.generationUnitId || receipt.generationUnitId;
        const mediaId = receipt.canvasNode?.payload?.currentMediaId
          || receipt.run?.result?.artifacts?.find((item) => item.kind === "video")?.id
          || null;
        if (!generationUnitId || !mediaId || !dependencies.storyboards?.listStoryboards || !dependencies.storyboards?.setStoryboardShotMedia) continue;
        const unitRecord = await dependencies.cinematic.getGenerationUnit({ projectId, productionId, generationUnitId });
        const boards = await dependencies.storyboards.listStoryboards({ projectId, productionId });
        for (const board of boards) {
          for (const shot of board.shots) {
            if (unitRecord.generationUnit.shotLinks.some((link) => link.shotId === shot.shotId) && !shot.videoMediaId) {
              let checksum = mediaId;
              try {
                const opened = ports.media?.open?.(projectId, mediaId);
                checksum = opened?.sha256 || mediaId;
              } catch { /* ignore */ }
              await dependencies.storyboards.setStoryboardShotMedia({
                projectId,
                productionId,
                storyboardId: board.storyboardId,
                storyboardShotId: shot.storyboardShotId,
                videoMediaId: mediaId,
                videoVersionId: `candidate-${generationUnitId}`,
                videoChecksum: checksum
              });
            }
          }
        }
      }

      return { output: output(receipts.map((receipt) => artifact("shot_video", receipt.compilation?.generationUnitId || receipt.run?.id, "GenerationUnit 视频候选", { mediaId: receipt.canvasNode?.payload?.currentMediaId, versionId: receipt.compilation?.envelope?.payloadHash }))) };
    }
    if (task.stage === "image_generation" && resolved.configuration?.workflowManifest) {
      // A semantic reference-driven shot must materialise/select its visual
      // anchor before video generation. The image is not a temporal first
      // frame unless the shot explicitly selected storyboard_first_frame.
      const units = await dependencies.cinematic.listGenerationUnits({ projectId, productionId });
      const needsImages = !units.length || units.some((entry) => {
        const mode = entry.generationUnit?.generationParameters?.mode;
        const anchors = entry.generationUnit?.visualAnchorPolicy;
        return mode === "image_reference" || (anchors && anchors !== "NONE");
      });
      if (!needsImages) return { reused: true, output: output([artifact("image_stage_not_required", productionId, "本镜明确选择 text_to_video")]) };
    }
    if (task.stage === "image_generation" || task.stage === "video_generation") {
      // Legacy non-cinematic automation may still use storyboard batch for images/videos.
      const budgetless = isBudgetlessWorkflow(resolved);
      const boards = await dependencies.storyboards.listStoryboards({ projectId, productionId });
      const mediaField = task.stage === "image_generation" ? "imageMediaId" : "videoMediaId";
      const missing = boards.flatMap((board) => board.shots.filter((shot) => !shot[mediaField]).map((shot) => ({ storyboardId: board.storyboardId, storyboardShotId: shot.storyboardShotId })));
      if (missing.length) {
        const budgetInput = generationStrategy(resolved, task.stage);
        const units = await dependencies.cinematic.listGenerationUnits({ projectId, productionId });
        const matchingUnit = units.find((entry) => entry.generationUnit?.shotLinks?.some((link) => missing.some((item) => item.storyboardShotId === link.shotId)));
        const fallbackNode = resolved.canvas?.nodes.find((node) => (task.stage === "image_generation" ? ["image", "imageEdit"].includes(node.kind) : ["video", "videoShot", "video-clip"].includes(node.kind)));
        const workflowStrategy = task.stage === "image_generation"
          ? {
            ...budgetInput,
            provider: budgetInput?.provider || "ununu",
            model: budgetInput?.model || "openai/gpt-image-2",
            executionNodeId: budgetInput?.executionNodeId ?? fallbackNode?.id
          }
          : (budgetless || !budgetInput ? {
            provider: matchingUnit?.generationUnit?.generationParameters?.provider ?? budgetInput?.provider,
            model: matchingUnit?.generationUnit?.generationParameters?.model ?? budgetInput?.model,
            executionNodeId: matchingUnit?.generationUnit?.executionNodeId ?? budgetInput?.executionNodeId ?? fallbackNode?.id
          } : budgetInput);
        const executionNodeIdByStoryboardShotId = {};
        if (task.stage === "image_generation") {
          for (const board of boards) {
            for (const shot of board.shots.filter((entry) => !entry.imageMediaId)) {
              const node = await ensureNode(projectId, {
                kind: "image",
                title: `${shot.title} · 视觉预演`,
                x: 80 + ((shot.order - 1) % 4) * 610,
                y: 5900 + Math.floor((shot.order - 1) / 4) * 470,
                resourceType: "storyboard_image_execution",
                resourceId: shot.storyboardShotId,
                payload: {
                  productionId,
                  storyboardId: board.storyboardId,
                  storyboardShotId: shot.storyboardShotId,
                  shotId: shot.shotId,
                  provider: workflowStrategy.provider,
                  modelId: workflowStrategy.model,
                  stage: "image_generation",
                  stageStatus: "ready"
                }
              });
              executionNodeIdByStoryboardShotId[shot.storyboardShotId] = node.id;
              const shotNode = (await liveCanvas(projectId)).nodes.find((entry) => entry.payload?.resourceType === "cinematic_shot" && entry.payload?.resourceId === shot.shotId);
              if (shotNode) await ensureEdge(projectId, shotNode.id, node.id, "cinematic_stage:storyboard_image");
            }
          }
          workflowStrategy.executionNodeId ||= Object.values(executionNodeIdByStoryboardShotId)[0];
        }
        if (!workflowStrategy?.provider || !workflowStrategy?.model || !workflowStrategy?.executionNodeId || (!budgetless && !(Number(budgetInput?.perItemAmount ?? budgetInput?.amount) > 0))) {
          throw new UnuTvError("automation_generation_strategy_required", `${task.stage} 需要已编译的 Provider、模型和执行节点；未发起 Provider 调用。`, 409, { stage: task.stage, missing });
        }
        const kind = task.stage === "image_generation" ? "image" : "video";
        if (task.stage === "image_generation" && resolved.configuration?.workflowManifest) {
          const missingShotIds = [...new Set(boards.flatMap((board) => (
            board.shots.filter((shot) => !shot.imageMediaId).map((shot) => shot.shotId)
          )))];
          if (missingShotIds.length) {
            await requireCinematicVisualProductionOwnerAcceptance({
              getProduction: ports.projects.getCinematicProduction.bind(ports.projects),
              getStoryPacket: ports.projects.getStoryPacket.bind(ports.projects),
              listReviews: ports.projects.listReviews.bind(ports.projects),
              listShots: ports.projects.listCinematicShots.bind(ports.projects),
              productionId,
              projectId,
              shotIds: missingShotIds,
              storyPacketId: boards.find((board) => board.source?.storyPacketId)?.source?.storyPacketId
            });
          }
        }
        const jobs = [];
        for (const board of boards) {
          const missingShotIds = board.shots.filter((shot) => !shot[mediaField]).map((shot) => shot.storyboardShotId);
          if (!missingShotIds.length) continue;
          const existing = (await dependencies.storyboards.listStoryboardBatchJobs({ projectId, productionId, storyboardId: board.storyboardId }))
            .find((job) => (
              job.kind === kind
              && job.configuration?.automationTaskId === task.id
              && job.status !== "cancelled"
              && !job.cancelledAt
              && job.items.some((item) => ["queued", "running", "blocked"].includes(item.status))
            ));
          let job = existing ?? await dependencies.storyboards.createStoryboardBatchJob({
            projectId, productionId, storyboardId: board.storyboardId, storyboardShotIds: missingShotIds, kind,
            provider: workflowStrategy.provider, model: workflowStrategy.model,
            configuration: {
              ...(budgetless ? {} : budgetInput?.configuration),
              ...(budgetInput?.configuration || {}),
              ...(budgetless ? { billingMode: "provider_account" } : {
                billingMode: "legacy_budget",
                amount: Number(budgetInput.perItemAmount ?? budgetInput.amount), currency: budgetInput.currency
              }),
              executionNodeId: workflowStrategy.executionNodeId,
              ...(Object.keys(executionNodeIdByStoryboardShotId).length ? { executionNodeIdByStoryboardShotId } : {}),
              aspectRatio: resolved.configuration?.aspectRatio || "9:16",
              resolution: task.stage === "image_generation" ? "1024x1536" : (workflowStrategy.resolution || "720p"),
              automationTaskId: task.id
            },
            operationContext
          });
          if (!["succeeded", "cancelled"].includes(job.status)) job = await dependencies.storyboards.advanceStoryboardBatchJob({ projectId, productionId, jobId: job.id, operationContext });
          jobs.push(job);
        }
        const failed = jobs.find((job) => ["failed", "cancelled"].includes(job.status) || job.items.some((item) => ["failed", "blocked"].includes(item.status)));
        if (failed) throw new UnuTvError("automation_storyboard_batch_blocked", "自动故事板 Provider 批次被门禁或失败状态阻塞", 409, { jobId: failed.id, status: failed.status, items: failed.items.filter((item) => ["failed", "blocked"].includes(item.status)).map((item) => ({ id: item.id, error: item.error })) });
        if (jobs.some((job) => job.status !== "succeeded")) return { waiting: true, output: output(jobs.map((job) => artifact("storyboard_batch", job.id, `${kind} 批量生产`))) };
      }
      const refreshedBoards = await dependencies.storyboards.listStoryboards({ projectId, productionId });
      if (task.stage === "image_generation" && resolved.configuration?.workflowManifest && dependencies.storyboards?.selectStoryboardImageForVideo) {
        // Every generated storyboard image becomes an explicit semantic
        // reference candidate. This is deliberately separate from
        // storyboard_first_frame selection: the image anchors identity,
        // scene topology and spatial layout; the shot contract controls time,
        // action, performance and camera motion.
        const reviews = await ports.projects.listReviews(projectId);
        const unaccepted = refreshedBoards.flatMap((board) => board.shots
          .filter((shot) => shot.imageMediaId && latestCinematicMediaReview(reviews, shot.imageMediaId)?.state !== "accepted")
          .map((shot) => ({
            storyboardId: board.storyboardId,
            storyboardShotId: shot.storyboardShotId,
            shotId: shot.shotId,
            mediaId: shot.imageMediaId
          })));
        if (unaccepted.length) {
          throw new UnuTvError(
            "storyboard_image_owner_acceptance_required",
            "逐镜视觉预演图已生成；请检查人物身份、场景拓扑、站位、构图和连续状态并接受合格图片。",
            409,
            {
              targetType: "media",
              targets: unaccepted,
              mediaIds: unaccepted.map((entry) => entry.mediaId)
            }
          );
        }
        for (const board of refreshedBoards) {
          for (const shot of board.shots) {
            if (!shot.imageMediaId || shot.videoReference?.selected) continue;
            const review = latestCinematicMediaReview(reviews, shot.imageMediaId);
            await dependencies.storyboards.selectStoryboardImageForVideo({
              projectId,
              productionId,
              storyboardId: board.storyboardId,
              storyboardShotId: shot.storyboardShotId,
              selected: true,
              role: "storyboard_composition",
              controls: ["人物身份", "场景构图", "空间站位", "服装与道具连续"],
              doesNotControl: ["动作时序", "表演节奏", "摄影机运动", "剪辑时点", "声音与对白"],
              acceptanceProof: {
                reviewId: review.id,
                mediaId: shot.imageMediaId,
                checksum: shot.imageChecksum,
                shotId: shot.shotId,
                shotRevision: shot.shotRevision,
                pixelReviewed: true,
                verifiedDomains: [...CINEMATIC_VISUAL_STATE_DOMAINS]
              }
            });
          }
        }
      }
      return { reused: missing.length === 0, output: output(refreshedBoards.flatMap((board) => board.shots.map((shot) => artifact(mediaField === "imageMediaId" ? "storyboard_image" : "shot_video", shot.storyboardShotId, shot.title, { mediaId: shot[mediaField] })))) };
    }
    if (task.stage === "sound_design") {
      const budgetless = isBudgetlessWorkflow(resolved);
      // Native-audio formal units already carry dialogue/ambience; soft-pass separate sound stage.
      if (resolved.configuration?.workflowManifest) {
        const units = await dependencies.cinematic.listGenerationUnits({ projectId, productionId });
        const nativeAudio = units.some((entry) => entry.generationUnit?.generationParameters?.generateAudio !== false);
        if (nativeAudio) {
          return {
            reused: true,
            output: output([artifact("native_audio", productionId, "视频原生音频，跳过独立 sound_design")])
          };
        }
      }
      const timelines = await dependencies.timeline.listTimelines({ projectId });
      const audioClips = [];
      for (const summary of timelines) {
        const timeline = await dependencies.timeline.getTimeline({ projectId, timelineId: summary.id });
        audioClips.push(...timeline.clips.filter((clip) => clip.track === 1 && clip.mediaId));
      }
      const audioNodes = resolved.canvas?.nodes.filter((node) => node.kind === "audio" && node.payload?.currentMediaId) ?? [];
      if (!audioClips.length && !audioNodes.length) {
        const budgetInput = generationStrategy(resolved, "sound_design");
        if (!budgetInput?.provider || !budgetInput?.model || !budgetInput?.executionNodeId) {
          throw new UnuTvError(
            "automation_sound_generation_strategy_required",
            "声音资产缺失；请在工作流策略中绑定声音 Provider、模型和音频执行节点，或导入现有音频",
            409,
            { stage: task.stage }
          );
        }
        if (!budgetless && !(Number(budgetInput.amount ?? budgetInput.perItemAmount) > 0)) {
          throw new UnuTvError("automation_generation_strategy_required", "legacy_budget 自动声音生成还需要预留金额", 409, { stage: task.stage });
        }
        const node = resolved.canvas?.nodes.find((entry) => entry.id === budgetInput.executionNodeId && entry.kind === "audio");
        if (!node) throw new UnuTvError("automation_audio_execution_node_invalid", "声音生成必须选择当前画布中的音频节点", 409);
        const idempotencyKey = `${task.idempotencyKey}:attempt:${task.attempt}:provider:v1`;
        let run = (await ports.projects.listRuns(projectId)).find((entry) => entry.nodeId === node.id && entry.request?.idempotencyKey === idempotencyKey) ?? null;
        if (run?.status === "queued") throw new UnuTvError("paid_submission_outcome_unknown", "检测到未确认结果的声音 Provider 提交；为避免重复提交，已停止自动重发", 409, { runId: run.id, idempotencyKey });
        if (!run) run = await dependencies.runNode({
          projectId,
          nodeId: node.id,
          provider: budgetInput.provider,
          request: {
            ...(budgetInput.configuration?.request ?? {}),
            billingMode: budgetless ? "provider_account" : "legacy_budget",
            idempotencyKey,
            model: budgetInput.model,
            text: budgetInput.configuration?.text ?? node.payload?.prompt ?? node.title
          }
        });
        else if (run.status === "running") run = await dependencies.pollRun({ projectId, runId: run.id });
        if (["queued", "running"].includes(run.status)) return { waiting: true, output: output([artifact("provider_run", run.id, "声音 Provider 任务")], { providerRunId: run.id }) };
        if (run.status !== "succeeded") throw new UnuTvError(run.result?.code ?? "automation_sound_provider_failed", run.result?.message ?? "声音 Provider 任务失败", 409, { runId: run.id });
        const generated = (run.result?.artifacts ?? []).filter((entry) => entry.kind === "audio");
        if (!generated.length) throw new UnuTvError("automation_sound_artifact_missing", "声音 Provider 未返回音频产物", 502, { runId: run.id });
        return { output: output(generated.map((entry) => artifact("audio_node", node.id, node.title, { mediaId: entry.id, providerRunId: run.id }))) };
      }
      return { reused: true, output: output([
        ...audioClips.map((clip) => artifact("timeline_audio", clip.id, "时间线音频", { mediaId: clip.mediaId })),
        ...audioNodes.map((node) => artifact("audio_node", node.id, node.title, { mediaId: node.payload.currentMediaId }))
      ]) };
    }
    if (task.stage === "continuity_qa") {
      const evaluations = await dependencies.cinematic.listEvaluations({ projectId, productionId });
      const units = await dependencies.cinematic.listGenerationUnits({ projectId, productionId });
      const activeUnits = units.filter((entry) => entry.generationUnit.lifecycle !== "archived");
      const latestEvaluations = latestCinematicEvaluationsByUnit(evaluations);
      if (!activeUnits.length) throw new UnuTvError("generation_unit_required", "连续性审片需要至少一个有效 GenerationUnit。", 409);
      const accepted = [];
      for (const entry of activeUnits) {
        const generationUnitId = entry.generationUnit.generationUnitId;
        const evaluation = latestEvaluations.get(generationUnitId);
        if (!evaluation) {
          throw new UnuTvError("continuity_evaluation_required", `${generationUnitId} 缺少最新 CinematicEvaluationRecord，不能进入剪辑。`, 409, { generationUnitId });
        }
        if (evaluation?.decision !== "ACCEPT") {
          throw new UnuTvError("latest_cinematic_evaluation_rejected", `${generationUnitId} 的最新审片结论不是 ACCEPT，不能进入剪辑。`, 409, {
            decision: evaluation?.decision ?? null,
            evaluationId: evaluation?.evaluationId ?? null,
            generationUnitId
          });
        }
        if (!evaluation?.takeObservation || evaluation?.canonReconciliation?.status !== "accepted") {
          throw new UnuTvError("structured_continuity_evaluation_required", `${generationUnitId} 缺少真实起止状态观察或正典对账，不能进入剪辑。`, 409, { generationUnitId });
        }
        if (entry.generationUnit.executionGates?.requireContinuityStateAudit === true && !evaluation?.actualContinuityState) {
          throw new UnuTvError("structured_continuity_state_required", `${generationUnitId} 缺少结构化实际连续性状态，不能进入剪辑。`, 409, { generationUnitId });
        }
        const preflight = await dependencies.cinematic.preflightGenerationUnit({ projectId, productionId, generationUnitId, recompile: true });
        if (!preflight.ready) throw new UnuTvError("continuity_chain_preflight_failed", `${generationUnitId} 的相邻镜连续性链在审片后失效。`, 409, preflight);
        accepted.push(evaluation);
      }
      return { reused: true, output: output(accepted.map((entry) => artifact("cinematic_evaluation", entry.evaluationId, "连续性审片", { versionId: `r${entry.revision}`, mediaId: entry.mediaId }))) };
    }
    if (task.stage === "timeline_edit") {
      const boards = await dependencies.storyboards.listStoryboards({ projectId, productionId });
      const board = boards.find((entry) => entry.shots.some((shot) => shot.videoMediaId));
      if (!board) throw new UnuTvError("storyboard_video_required", "没有可进入时间线的故事板视频版本", 409);
      const aspectRatio = resolved.configuration.aspectRatio
        || resolved.configuration.workflowManifest?.aspectRatio
        || "16:9";
      const [width, height] = aspectRatio === "9:16"
        ? [720, 1280]
        : aspectRatio === "1:1"
          ? [1080, 1080]
          : [1920, 1080];
      const receipt = await dependencies.storyboards.importStoryboardToTimeline({
        projectId,
        productionId,
        storyboardId: board.storyboardId,
        timelineId: resolved.configuration.timelineId,
        timelineTitle: `${resolved.configuration.episodeId ? "EP01 · " : ""}主时间线`,
        frameRate: 24,
        width,
        height,
        colorSpace: "Rec.709"
      });
      if (receipt.status === "failed" || receipt.status === "empty") throw new UnuTvError("timeline_import_failed", "故事板未能进入时间线", 409, receipt);
      const timelineNode = await ensureNode(projectId, {
        kind: "compose",
        title: "EP01 · 120秒主时间线",
        x: 1342,
        y: 11648,
        resourceType: "timeline",
        resourceId: receipt.timelineId,
        payload: {
          productionId,
          timelineId: receipt.timelineId,
          frameRate: 24,
          width,
          height,
          aspectRatio,
          clipCount: receipt.added,
          durationSeconds: resolved.configuration.targetDurationSeconds
            || resolved.configuration.workflowManifest?.targetDurationSeconds
            || null,
          stage: "timeline_edit",
          stageStatus: "ready"
        }
      });
      const canvas = await liveCanvas(projectId);
      const evidenceNodes = canvas.nodes.filter((node) => (
        node.payload?.resourceType === "cinematic_evaluation_evidence"
        && node.payload?.evaluationDecision === "ACCEPT"
      ));
      for (const evidenceNode of evidenceNodes) {
        await ensureEdge(projectId, evidenceNode.id, timelineNode.id, "cinematic_stage:accepted_take");
      }
      return {
        output: output([artifact("timeline", receipt.timelineId, "主时间线", { nodeId: timelineNode.id })], {
          importReceipt: receipt,
          timelineNodeId: timelineNode.id
        })
      };
    }
    if (task.stage === "candidate_render") {
      const timelines = await dependencies.timeline.listTimelines({ projectId });
      const automationTasks = await dependencies.automationTasks.listAutomationTasks({
        projectId,
        automationRunId: task.automationRunId
      });
      const timelineTask = automationTasks.find((entry) => entry.stage === "timeline_edit");
      const timelineId = resolved.configuration.timelineId
        ?? timelineTask?.output?.importReceipt?.timelineId
        ?? timelines[0]?.id;
      if (!timelineId) throw new UnuTvError("timeline_required", "候选渲染需要主时间线", 409);
      const timeline = await dependencies.timeline.getTimeline({ projectId, timelineId });
      const expectedAspectRatio = resolved.configuration.aspectRatio
        || resolved.configuration.workflowManifest?.aspectRatio
        || null;
      const actualAspectRatio = Number(timeline.width) / Number(timeline.height);
      const expectedRatio = expectedAspectRatio === "9:16"
        ? 9 / 16
        : expectedAspectRatio === "1:1"
          ? 1
          : expectedAspectRatio === "16:9"
            ? 16 / 9
            : null;
      if (expectedRatio && Math.abs(actualAspectRatio - expectedRatio) > 0.01) {
        throw new UnuTvError(
          "timeline_aspect_ratio_mismatch",
          `主时间线 ${timeline.width}×${timeline.height} 与交付画幅 ${expectedAspectRatio} 不一致。`,
          409,
          { timelineId, width: timeline.width, height: timeline.height, expectedAspectRatio }
        );
      }
      const evaluations = await dependencies.cinematic.listEvaluations({ projectId, productionId });
      const postRepairs = [...latestCinematicEvaluationsByUnit(evaluations).values()]
        .filter((entry) => entry.decision === "ACCEPT" && entry.retakeDisposition?.type === "FIX_IN_POST");
      const completedRepairs = new Set((timeline.markers ?? [])
        .filter((marker) => marker.payload?.repairStatus === "completed")
        .map((marker) => marker.payload?.evaluationId));
      const missingRepairs = postRepairs.filter((entry) => !completedRepairs.has(entry.evaluationId));
      if (missingRepairs.length) {
        throw new UnuTvError(
          "timeline_post_repairs_required",
          "存在已接受但要求后期修复的镜头，必须先在时间线完成并记录修复再渲染。",
          409,
          {
            timelineId,
            repairs: missingRepairs.map((entry) => ({
              evaluationId: entry.evaluationId,
              generationUnitId: entry.generationUnitId,
              mediaId: entry.mediaId,
              repairSuggestions: entry.repairSuggestions
            }))
          }
        );
      }
      const project = await ports.projects.open(projectId);
      const canvas = project?.rootCanvasId ? await ports.projects.openCanvas(projectId, project.rootCanvasId) : null;
      let outputNode = (canvas?.nodes ?? []).find((node) => (
        node.kind === "compose"
        && node.payload?.auditOnly !== true
        && node.payload?.productionId === productionId
        && node.payload?.stage === "candidate_render"
        && node.payload?.timelineId === timelineId
      ));
      if (!outputNode) {
        if (typeof dependencies.createNode !== "function" || !project?.rootCanvasId) {
          throw new UnuTvError("render_canvas_node_required", "候选渲染需要画布上的合成输出节点", 409);
        }
        outputNode = await dependencies.createNode({
          projectId,
          canvasId: project.rootCanvasId,
          kind: "compose",
          title: "候选母版",
          x: 2160,
          y: 120,
          payload: {
            productionId,
            stage: "candidate_render",
            resourceType: "candidate_master",
            resourceId: `${timelineId}:candidate_master`,
            generationPhase: "candidate_render",
            generationStatus: "ready",
            timelineId
          }
        });
      }
      const jobs = await dependencies.render.listRenderJobs({ projectId, timelineId });
      let job = jobs.find((entry) => entry.idempotencyKey === `${task.automationRunId}:candidate_render:v1`);
      if (!job) job = await dependencies.render.createRenderJob({ projectId, timelineId, outputNodeId: outputNode.id, preset: resolved.configuration.renderPreset ?? "h264_review", idempotencyKey: `${task.automationRunId}:candidate_render:v1` });
      if (["queued", "running"].includes(job.status)) return { waiting: true, output: output([artifact("render_job", job.id, "候选母版渲染")], { renderJobId: job.id }) };
      if (job.status !== "succeeded") throw new UnuTvError("candidate_render_failed", job.error?.message ?? "候选母版渲染失败", 409, job.error);
      return { output: output([artifact("render_job", job.id, "候选母版", { mediaId: job.outputMediaId })], { renderJobId: job.id }) };
    }
    if (task.stage === "delivery_qc") {
      const automationTasks = await dependencies.automationTasks.listAutomationTasks({
        projectId,
        automationRunId: task.automationRunId
      });
      const renderTask = automationTasks.find((entry) => entry.stage === "candidate_render");
      const renderJobId = renderTask?.output?.renderJobId;
      const jobs = await dependencies.render.listRenderJobs({ projectId });
      const job = renderJobId
        ? jobs.find((entry) => entry.id === renderJobId && entry.status === "succeeded")
        : [...jobs].sort((left, right) => Date.parse(right.createdAt || "") - Date.parse(left.createdAt || ""))
          .find((entry) => entry.status === "succeeded");
      if (!job) throw new UnuTvError("successful_render_required", "没有成功的候选母版可做交付 QC", 409);
      const manifest = await dependencies.render.createDeliveryPackage({ projectId, renderJobId: job.id, acceptWarnings: resolved.configuration.acceptQcWarnings === true });
      const deliveryNode = await ensureNode(projectId, {
        kind: "qa",
        title: "EP01 · 交付 QC 与清单",
        x: 2160,
        y: 11648,
        resourceType: "delivery_package",
        resourceId: manifest.id,
        payload: {
          productionId,
          stage: "delivery_qc",
          deliveryPackageId: manifest.id,
          renderJobId: job.id,
          mediaId: manifest.mediaId,
          checksum: manifest.checksum,
          qcStatus: manifest.qcStatus ?? manifest.technicalQc?.status ?? "passed",
          stageStatus: "succeeded"
        }
      });
      if (job.outputNodeId) await ensureEdge(projectId, job.outputNodeId, deliveryNode.id, "cinematic_stage:delivery_qc");
      return {
        output: output([
          artifact("delivery_package", manifest.id, "交付清单", {
            mediaId: manifest.mediaId,
            versionId: manifest.checksum,
            nodeId: deliveryNode.id
          })
        ], { deliveryNodeId: deliveryNode.id })
      };
    }
    throw new UnuTvError("automation_stage_unimplemented", `Automation stage is not implemented: ${task.stage}`, 500);
  }

  return { handleStage };
}
