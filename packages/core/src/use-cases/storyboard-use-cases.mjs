import {
  UnuTvError,
  assertStoryboardTimelineImportReceipt,
  assertStoryboardContract,
  createId,
  defaultStoryboardVideoReference,
  nowIso,
  optionalText,
  requireEnum,
  requireObject,
  requireText,
  storyboardVideoReferenceSemanticControl,
  STORYBOARD_VIDEO_REFERENCE_ROLES
} from "@ununu/unutv-contracts";
import { applyPlannedInsertion, planStoryboardTimelineInsertion } from "../storyboard-timeline-import-policy.mjs";
import { compareStoryboardShotVersionRecords, reorderStoryboardShotList } from "../storyboard-production-policy.mjs";
import { createStoryboardBatchUseCases } from "./storyboard-batch-use-cases.mjs";

function requirePort(ports, method) {
  if (typeof ports.projects?.[method] !== "function") throw new TypeError(`Missing storyboard port: projects.${method}`);
  return ports.projects[method].bind(ports.projects);
}

function documentStatus(shots) {
  if (shots.some((shot) => shot.status === "failed")) return shots.some((shot) => ["image_ready", "video_ready"].includes(shot.status)) ? "partial" : "failed";
  if (shots.every((shot) => shot.status === "video_ready")) return "ready";
  if (shots.some((shot) => ["image_running", "video_running"].includes(shot.status))) return "generating";
  if (shots.some((shot) => ["image_ready", "video_ready"].includes(shot.status))) return "partial";
  return "planning";
}

function findUnit(units, shotId) {
  return units.find((entry) => entry.generationUnit?.shotLinks?.some((link) => link.shotId === shotId));
}

function makeStoryboardShot(storyboardId, shot, unit, order, timestamp) {
  return {
    storyboardShotId: createId("storyboard-shot"),
    storyboardId,
    shotId: shot.shotId,
    generationUnitId: unit?.generationUnit?.generationUnitId ?? null,
    order,
    title: `镜头 ${String(shot.order).padStart(2, "0")}`,
    narrativeJob: shot.narrativeJob,
    storyBeat: shot.storyBeat,
    durationSeconds: unit?.generationUnit?.generationParameters?.duration ?? null,
    dialogue: shot.dialogue ?? [],
    cinematicPlan: {
      blocking: shot.blocking,
      cinematography: shot.cinematography,
      editContinuity: shot.editContinuity,
      openingState: shot.openingState,
      actionChain: shot.actionChain,
      endingState: shot.endingState,
      performance: shot.performance,
      sound: shot.sound
    },
    requiredAssetAuthorityIds: shot.requiredAssetIds ?? [],
    shotRevision: shot.revision,
    status: "ready_for_image",
    imageMediaId: null,
    imageSourceNodeId: null,
    imageVersionId: null,
    imageChecksum: null,
    videoMediaId: null,
    videoVersionId: null,
    videoChecksum: null,
    videoReference: defaultStoryboardVideoReference(),
    error: null,
    revision: 1,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function createStoryboardUseCases(ports, dependencies = {}) {
  const saveRecord = requirePort(ports, "saveStoryboardDocument");
  const getRecord = requirePort(ports, "getStoryboardDocument");
  const listRecords = requirePort(ports, "listStoryboardDocuments");
  const getProduction = requirePort(ports, "getCinematicProduction");
  const listShots = requirePort(ports, "listCinematicShots");
  const listUnits = requirePort(ports, "listGenerationUnits");
  const getStoryPacket = requirePort(ports, "getStoryPacket");
  const getVisualBible = requirePort(ports, "getVisualBible");
  const createTimeline = requirePort(ports, "createTimeline");
  const listTimelines = requirePort(ports, "listTimelines");
  const getTimeline = requirePort(ports, "getTimeline");
  const insertStoryboardClip = requirePort(ports, "insertStoryboardTimelineClip");
  const listDocumentVersions = requirePort(ports, "listStoryboardDocumentVersions");
  const listShotVersions = requirePort(ports, "listStoryboardShotVersions");
  const saveBatchJob = requirePort(ports, "saveStoryboardBatchJob");
  const getBatchJobRecord = requirePort(ports, "getStoryboardBatchJob");
  const listBatchJobRecords = requirePort(ports, "listStoryboardBatchJobs");

  async function requireProduction(projectId, productionId) {
    const production = await getProduction(projectId, productionId);
    if (!production) throw new UnuTvError("cinematic_production_not_found", `Cinematic production not found: ${productionId}`, 404);
    return production;
  }

  async function requireStoryboard(projectId, productionId, storyboardId) {
    await requireProduction(projectId, productionId);
    const storyboard = await getRecord(projectId, productionId, storyboardId);
    if (!storyboard) throw new UnuTvError("storyboard_not_found", `Storyboard not found: ${storyboardId}`, 404);
    return storyboard;
  }

  async function createStoryboard(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const productionId = requireText(input.productionId, "productionId");
    const production = await requireProduction(projectId, productionId);
    const [storyPacket, visualBible, productionShots, units] = await Promise.all([
      getStoryPacket(projectId, productionId, input.storyPacketId),
      getVisualBible(projectId, productionId),
      listShots(projectId, productionId),
      listUnits(projectId, productionId)
    ]);
    if (!storyPacket) throw new UnuTvError("story_packet_required", "Create a complete StoryProductionPacket before building a storyboard", 409);
    if (!visualBible) throw new UnuTvError("visual_bible_required", "Create a complete VisualBible before building a storyboard", 409);
    const requestedIds = Array.isArray(input.shotIds) && input.shotIds.length ? input.shotIds : productionShots.map((shot) => shot.shotId);
    const byId = new Map(productionShots.map((shot) => [shot.shotId, shot]));
    const selectedShots = requestedIds.map((shotId) => byId.get(shotId));
    if (selectedShots.some((shot) => !shot)) throw new UnuTvError("cinematic_shot_not_found", "Storyboard contains a shot outside this production", 400);
    if (!selectedShots.length) throw new UnuTvError("storyboard_shots_required", "At least one approved cinematic shot is required", 409);
    const timestamp = nowIso();
    const storyboardId = createId("storyboard");
    const shots = selectedShots.map((shot, index) => makeStoryboardShot(storyboardId, shot, findUnit(units, shot.shotId), index + 1, timestamp));
    const storyboard = {
      storyboardId,
      projectId,
      productionId,
      nodeId: input.nodeId ? requireText(input.nodeId, "nodeId") : null,
      title: optionalText(input.title, `${production.title} · 故事板`),
      status: "planning",
      layout: input.layout ?? "storyboard_cards",
      source: {
        storyPacketId: storyPacket.storyPacketId,
        storyPacketRevision: storyPacket.revision,
        visualBibleId: visualBible.visualBibleId,
        visualBibleRevision: visualBible.revision,
        shotRevisions: Object.fromEntries(selectedShots.map((shot) => [shot.shotId, shot.revision])),
        generationUnitRevisions: Object.fromEntries(units.map((entry) => [entry.generationUnit.generationUnitId, entry.generationUnit.revision]))
      },
      shots,
      revision: 1,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    assertStoryboardContract("StoryboardDocumentV2", storyboard);
    return saveRecord(projectId, storyboard, 0);
  }

  async function listStoryboards(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const productionId = requireText(input.productionId, "productionId");
    await requireProduction(projectId, productionId);
    return listRecords(projectId, productionId, input.includeStale === true);
  }

  async function getStoryboard(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const productionId = requireText(input.productionId, "productionId");
    const storyboardId = requireText(input.storyboardId, "storyboardId");
    if (input.includeStale === true) {
      const storyboard = await getRecord(projectId, productionId, storyboardId, true);
      if (!storyboard) throw new UnuTvError("storyboard_not_found", `Storyboard not found: ${storyboardId}`, 404);
      return storyboard;
    }
    return requireStoryboard(projectId, productionId, storyboardId);
  }

  async function updateStoryboardShot(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const productionId = requireText(input.productionId, "productionId");
    const storyboardId = requireText(input.storyboardId, "storyboardId");
    const storyboard = await requireStoryboard(projectId, productionId, storyboardId);
    const storyboardShotId = requireText(input.storyboardShotId, "storyboardShotId");
    const index = storyboard.shots.findIndex((shot) => shot.storyboardShotId === storyboardShotId);
    if (index < 0) throw new UnuTvError("storyboard_shot_not_found", `Storyboard shot not found: ${storyboardShotId}`, 404);
    const patch = requireObject(input.patch, "patch", {});
    const { expectedRevision: ignoredExpectedRevision, patch: ignoredNestedPatch, ...shotPatch } = patch;
    const current = storyboard.shots[index];
    const nextRevision = current.revision + 1;
    const sourceShotRevision = shotPatch.shotRevision ?? current.shotRevision;
    if (shotPatch.imageMediaId) {
      shotPatch.imageSourceShotRevision = shotPatch.imageSourceShotRevision ?? sourceShotRevision;
    } else if (shotPatch.imageMediaId === null) {
      shotPatch.imageSourceShotRevision = null;
    }
    if (shotPatch.videoMediaId) {
      shotPatch.videoSourceShotRevision = shotPatch.videoSourceShotRevision ?? sourceShotRevision;
    } else if (shotPatch.videoMediaId === null) {
      shotPatch.videoSourceShotRevision = null;
    }
    const mergedVideoReference = shotPatch.videoReference ? { ...current.videoReference, ...shotPatch.videoReference } : current.videoReference;
    const nextShot = {
      ...current,
      ...shotPatch,
      videoReference: mergedVideoReference?.acceptanceProof
        ? { ...mergedVideoReference, acceptanceProof: { ...mergedVideoReference.acceptanceProof, shotRevision: sourceShotRevision } }
        : mergedVideoReference,
      storyboardShotId: current.storyboardShotId,
      storyboardId,
      shotId: current.shotId,
      revision: nextRevision,
      updatedAt: nowIso()
    };
    delete nextShot.expectedRevision;
    delete nextShot.patch;
    assertStoryboardContract("StoryboardShotV2", nextShot);
    const shots = storyboard.shots.map((shot, shotIndex) => shotIndex === index ? nextShot : shot);
    const next = { ...storyboard, shots, status: documentStatus(shots), revision: storyboard.revision + 1, updatedAt: nowIso() };
    assertStoryboardContract("StoryboardDocumentV2", next);
    return saveRecord(projectId, next, input.expectedRevision ?? storyboard.revision);
  }

  async function reorderStoryboardShots(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const productionId = requireText(input.productionId, "productionId");
    const storyboardId = requireText(input.storyboardId, "storyboardId");
    const storyboard = await requireStoryboard(projectId, productionId, storyboardId);
    const timestamp = nowIso();
    const shots = reorderStoryboardShotList(storyboard.shots, input.orderedStoryboardShotIds).map((shot) => ({ ...shot, revision: shot.revision + 1, updatedAt: timestamp }));
    const next = { ...storyboard, shots, revision: storyboard.revision + 1, updatedAt: timestamp };
    assertStoryboardContract("StoryboardDocumentV2", next);
    return saveRecord(projectId, next, input.expectedRevision ?? storyboard.revision);
  }

  async function listStoryboardVersions(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const productionId = requireText(input.productionId, "productionId");
    const storyboardId = requireText(input.storyboardId, "storyboardId");
    await requireStoryboard(projectId, productionId, storyboardId);
    return listDocumentVersions(projectId, productionId, storyboardId);
  }

  async function listStoryboardShotVersions(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const productionId = requireText(input.productionId, "productionId");
    const storyboardId = requireText(input.storyboardId, "storyboardId");
    const storyboardShotId = requireText(input.storyboardShotId, "storyboardShotId");
    await requireStoryboard(projectId, productionId, storyboardId);
    return listShotVersions(projectId, productionId, storyboardId, storyboardShotId);
  }

  async function compareStoryboardShotVersions(input = {}) {
    const versions = await listStoryboardShotVersions(input);
    const leftVersion = Number(input.leftVersion);
    const rightVersion = Number(input.rightVersion);
    const left = versions.find((entry) => entry.version === leftVersion);
    const right = versions.find((entry) => entry.version === rightVersion);
    if (!left || !right) throw new UnuTvError("storyboard_shot_version_not_found", "Both storyboard shot versions are required", 404);
    return { storyboardShotId: requireText(input.storyboardShotId, "storyboardShotId"), leftVersion, rightVersion, ...compareStoryboardShotVersionRecords(left.shot, right.shot) };
  }

  const {
    advanceStoryboardBatchJob,
    cancelStoryboardBatchJob,
    createStoryboardBatchJob,
    getStoryboardBatchJob,
    listStoryboardBatchJobs,
    retryStoryboardBatchItem
  } = createStoryboardBatchUseCases({
    dependencies, getBatchJobRecord, listBatchJobRecords, ports, requireProduction, requireStoryboard, saveBatchJob, setStoryboardShotMedia
  });

  async function setStoryboardShotMedia(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const patch = {};
    if (input.retakeDirective !== undefined) {
      patch.retakeDirective = input.retakeDirective === null
        ? null
        : requireObject(input.retakeDirective, "retakeDirective");
    }
    if (input.imageMediaId !== undefined) {
      patch.imageMediaId = input.imageMediaId ? requireText(input.imageMediaId, "imageMediaId") : null;
      const sourceMedia = input.imageMediaId ? await ports.media.open(projectId, patch.imageMediaId) : null;
      patch.imageSourceNodeId = input.imageMediaId ? requireText(input.imageSourceNodeId ?? sourceMedia?.nodeId, "imageSourceNodeId") : null;
      patch.imageVersionId = input.imageVersionId ?? null;
      patch.imageChecksum = input.imageChecksum ?? null;
      patch.status = input.imageMediaId ? "image_ready" : "ready_for_image";
      patch.videoReference = defaultStoryboardVideoReference();
    }
    if (input.videoMediaId !== undefined) {
      patch.videoMediaId = input.videoMediaId ? requireText(input.videoMediaId, "videoMediaId") : null;
      patch.videoVersionId = input.videoVersionId ?? null;
      patch.videoChecksum = input.videoChecksum ?? null;
      patch.status = input.videoMediaId ? "video_ready" : (patch.imageMediaId || input.currentImageMediaId ? "image_ready" : "ready_for_image");
    }
    return updateStoryboardShot({ ...input, patch });
  }

  async function selectStoryboardImageForVideo(input = {}) {
    const selected = input.selected === true;
    const role = requireEnum(input.role ?? "storyboard_composition", STORYBOARD_VIDEO_REFERENCE_ROLES, "role");
    return updateStoryboardShot({
      ...input,
      patch: {
        videoReference: {
          selected,
          role,
          ...(Array.isArray(input.controls) ? { controls: input.controls } : {}),
          ...(Array.isArray(input.doesNotControl) ? { doesNotControl: input.doesNotControl } : {}),
          acceptanceProof: input.acceptanceProof ?? null,
          selectedAt: selected ? nowIso() : null
        }
      }
    });
  }

  async function getStoryboardVideoReferences(input = {}) {
    const storyboard = await getStoryboard(input);
    return storyboard.shots
      .filter((shot) => shot.videoReference.selected)
      .map((shot, index) => ({
        assetId: `storyboard:${storyboard.storyboardId}:${shot.shotId}`,
        versionId: shot.imageVersionId || `storyboard-image:${shot.imageChecksum || shot.imageMediaId}`,
        storyboardShotId: shot.storyboardShotId,
        storyboardId: storyboard.storyboardId,
        shotId: shot.shotId,
        mediaId: shot.imageMediaId,
        sourceNodeId: shot.imageSourceNodeId,
        checksum: shot.imageChecksum,
        acceptanceProof: shot.videoReference.acceptanceProof ?? null,
        displayName: shot.title,
        providerIndex: index + 1,
        role: shot.videoReference.role,
        controls: shot.videoReference.controls,
        doesNotControl: shot.videoReference.doesNotControl,
        semanticControl: storyboardVideoReferenceSemanticControl(shot.videoReference),
        required: true,
        authorityRevision: `storyboard-r${storyboard.revision}:shot-r${shot.revision}`
      }));
  }

  async function importStoryboardToTimeline(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const productionId = requireText(input.productionId, "productionId");
    const storyboardId = requireText(input.storyboardId, "storyboardId");
    const storyboard = await requireStoryboard(projectId, productionId, storyboardId);
    const summaries = await listTimelines(projectId);
    const requestedFrameRate = Math.max(1, Math.round(Number(input.frameRate) || 30));
    const requestedWidth = Math.max(16, Math.round(Number(input.width) || 1920));
    const requestedHeight = Math.max(16, Math.round(Number(input.height) || 1080));
    const matchingTimeline = summaries.find((entry) => (
      Number(entry.frameRate) === requestedFrameRate
      && Number(entry.width) === requestedWidth
      && Number(entry.height) === requestedHeight
    ));
    let timelineId = input.timelineId
      ? requireText(input.timelineId, "timelineId")
      : matchingTimeline?.id;
    if (!timelineId) {
      const timestamp = nowIso();
      const created = await createTimeline(projectId, {
        id: createId("timeline"),
        title: optionalText(input.timelineTitle, "主时间线"),
        frameRate: requestedFrameRate,
        width: requestedWidth,
        height: requestedHeight,
        colorSpace: optionalText(input.colorSpace, "Rec.709"),
        tracks: [
          { id: createId("track"), kind: "video", name: "主视频轨", order: 0, locked: false, visible: true, muted: false, solo: false, color: "#294e98", payload: {}, createdAt: timestamp, updatedAt: timestamp },
          { id: createId("track"), kind: "audio", name: "主音频轨", order: 1, locked: false, visible: true, muted: false, solo: false, color: "#9c27b0", payload: {}, createdAt: timestamp, updatedAt: timestamp },
          { id: createId("track"), kind: "subtitle", name: "字幕轨", order: 2, locked: false, visible: true, muted: false, solo: false, color: "#795548", payload: {}, createdAt: timestamp, updatedAt: timestamp }
        ],
        createdAt: timestamp,
        updatedAt: timestamp
      });
      timelineId = created.id;
    }
    const timeline = await getTimeline(projectId, timelineId);
    const orderedShots = [...storyboard.shots]
      .filter((shot) => shot.status === "video_ready" && shot.videoMediaId)
      .sort((left, right) => left.order - right.order);
    const items = [];
    let workingClips = [...timeline.clips];
    for (const shot of orderedShots) {
      const plan = planStoryboardTimelineInsertion({ orderedShots, shot, clips: workingClips, track: 0 });
      if (plan.action === "skip") {
        items.push({ storyboardShotId: shot.storyboardShotId, shotId: shot.shotId, status: "skipped", reason: plan.reason });
        continue;
      }
      const clip = {
        id: createId("clip"),
        timelineId,
        nodeId: storyboard.nodeId,
        mediaId: shot.videoMediaId,
        track: 0,
        startMs: plan.startMs,
        durationMs: plan.durationMs,
        trimInMs: 0,
        payload: {
          storyboardId,
          storyboardShotId: shot.storyboardShotId,
          shotId: shot.shotId,
          generationUnitId: shot.generationUnitId,
          videoVersionId: shot.videoVersionId,
          videoChecksum: shot.videoChecksum,
          storyboardMediaIdentity: plan.identity
        },
        createdAt: nowIso()
      };
      try {
        await insertStoryboardClip(projectId, clip);
        workingClips = applyPlannedInsertion(workingClips, clip);
        items.push({ storyboardShotId: shot.storyboardShotId, shotId: shot.shotId, clipId: clip.id, status: "added" });
      } catch (error) {
        items.push({ storyboardShotId: shot.storyboardShotId, shotId: shot.shotId, status: "failed", reason: error?.code || error?.message || "timeline_insert_failed" });
      }
    }
    const added = items.filter((item) => item.status === "added").length;
    const skipped = items.filter((item) => item.status === "skipped").length;
    const failed = items.filter((item) => item.status === "failed").length;
    const receipt = {
      importId: createId("storyboard-import"),
      projectId,
      productionId,
      storyboardId,
      timelineId,
      status: !orderedShots.length ? "empty" : failed ? (added || skipped ? "partial" : "failed") : "completed",
      total: orderedShots.length,
      processed: items.length,
      added,
      skipped,
      failed,
      cancelled: false,
      items,
      createdAt: nowIso()
    };
    assertStoryboardTimelineImportReceipt(receipt);
    return receipt;
  }

  return {
    advanceStoryboardBatchJob,
    cancelStoryboardBatchJob,
    compareStoryboardShotVersions,
    createStoryboard,
    createStoryboardBatchJob,
    getStoryboardBatchJob,
    getStoryboard,
    getStoryboardVideoReferences,
    importStoryboardToTimeline,
    listStoryboardBatchJobs,
    listStoryboardShotVersions,
    listStoryboardVersions,
    listStoryboards,
    reorderStoryboardShots,
    retryStoryboardBatchItem,
    selectStoryboardImageForVideo,
    setStoryboardShotMedia,
    updateStoryboardShot
  };
}
