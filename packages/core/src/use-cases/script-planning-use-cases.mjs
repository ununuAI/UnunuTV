import { UnuTvError, assertStoryboardContract, createId, defaultStoryboardVideoReference, nowIso, requireText } from "@ununu/unutv-contracts";
import { compileCinematicScriptBreakdown } from "../script-breakdown-policy.mjs";

function currentStoryboardShot({ current, durationSeconds, linked, shot, timestamp }) {
  const sourceShotCurrent = current?.shotRevision === shot.revision;
  const imageSourceCurrent = sourceShotCurrent && (
    !current?.imageMediaId || current.imageSourceShotRevision === shot.revision
  );
  const videoSourceCurrent = sourceShotCurrent && (
    !current?.videoMediaId || current.videoSourceShotRevision === shot.revision
  );
  const mediaSourcesCurrent = imageSourceCurrent && videoSourceCurrent;
  return {
    storyboardShotId: current?.storyboardShotId ?? createId("storyboard-shot"),
    storyboardId: linked.storyboardId,
    shotId: shot.shotId,
    generationUnitId: sourceShotCurrent ? current?.generationUnitId ?? null : null,
    order: shot.order,
    title: current?.title ?? `镜头 ${String(shot.order).padStart(2, "0")}`,
    narrativeJob: shot.narrativeJob,
    storyBeat: shot.storyBeat,
    durationSeconds: durationSeconds ?? current?.durationSeconds ?? null,
    dialogue: shot.dialogue ?? [],
    cinematicPlan: {
      blocking: shot.blocking,
      cinematography: shot.cinematography,
      editContinuity: shot.editContinuity,
      openingState: shot.openingState,
      actionChain: shot.actionChain,
      endingState: shot.endingState,
      performance: shot.performance,
      sound: shot.sound,
      ...(shot.directorStageBinding ? { directorStageBinding: shot.directorStageBinding } : {})
    },
    requiredAssetAuthorityIds: shot.requiredAssetIds ?? [],
    shotRevision: shot.revision,
    status: mediaSourcesCurrent ? current?.status ?? "ready_for_image" : "ready_for_image",
    imageMediaId: imageSourceCurrent ? current?.imageMediaId ?? null : null,
    imageSourceNodeId: imageSourceCurrent ? current?.imageSourceNodeId ?? null : null,
    imageVersionId: imageSourceCurrent ? current?.imageVersionId ?? null : null,
    imageChecksum: imageSourceCurrent ? current?.imageChecksum ?? null : null,
    imageSourceShotRevision: imageSourceCurrent && current?.imageMediaId ? shot.revision : null,
    videoMediaId: videoSourceCurrent ? current?.videoMediaId ?? null : null,
    videoVersionId: videoSourceCurrent ? current?.videoVersionId ?? null : null,
    videoChecksum: videoSourceCurrent ? current?.videoChecksum ?? null : null,
    videoSourceShotRevision: videoSourceCurrent && current?.videoMediaId ? shot.revision : null,
    videoReference: mediaSourcesCurrent ? current?.videoReference ?? defaultStoryboardVideoReference() : defaultStoryboardVideoReference(),
    error: mediaSourcesCurrent ? current?.error ?? null : null,
    revision: sourceShotCurrent ? current?.revision ?? 1 : (current?.revision ?? 0) + 1,
    createdAt: current?.createdAt ?? timestamp,
    updatedAt: timestamp
  };
}

export function createScriptPlanningUseCases(ports, dependencies) {
  async function planCinematicFromScript(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const productionId = requireText(input.productionId, "productionId");
    const sourceNodeId = requireText(input.sourceNodeId, "sourceNodeId");
    const [document, storyPacket, visualBible, existing, existingShots, existingStoryboards] = await Promise.all([
      dependencies.getScriptDocument({ projectId, nodeId: sourceNodeId }),
      dependencies.cinematic.getStoryPacket({ projectId, productionId }),
      dependencies.cinematic.getVisualBible({ projectId, productionId }),
      ports.projects.getCinematicScriptBreakdown(projectId, productionId, sourceNodeId, true),
      dependencies.cinematic.listShots({ projectId, productionId, includeStale: true }),
      dependencies.storyboards.listStoryboards({ projectId, productionId, includeStale: true })
    ]);
    if (!storyPacket) throw new UnuTvError("story_packet_required", "Create a complete StoryProductionPacket before planning shots", 409);
    if (!visualBible) throw new UnuTvError("visual_bible_required", "Create a complete VisualBible before planning shots", 409);
    const screenplayDocument = document.screenplayDocument ?? null;
    const sourceAuthorityCurrent = screenplayDocument
      ? (
          existing?.sourceScreenplayDocumentId === screenplayDocument.documentId
          && existing?.sourceScreenplayDocumentRevision === screenplayDocument.revision
          && existing?.sourceScreenplayDocumentChecksum === screenplayDocument.checksum
        )
      : existing?.sourceDocumentRevision === document.revision;
    if (existing?.sourceDocumentRevision === document.revision && sourceAuthorityCurrent) {
      const shotMap = new Map(existingShots.map((shot) => [shot.shotId, shot]));
      const shots = existing.shotIds.map((shotId) => shotMap.get(shotId)).filter(Boolean);
      let storyboard = existingStoryboards.find((entry) => entry.source?.scriptBreakdownId === existing.breakdownId) ?? null;
      const storyboardCurrent = storyboard && shots.length === storyboard.shots.length && shots.every((shot) => (
        storyboard.source?.shotRevisions?.[shot.shotId] === shot.revision
        && storyboard.shots.find((entry) => entry.shotId === shot.shotId)?.shotRevision === shot.revision
      ));
      if (input.createStoryboard !== false && storyboard && !storyboardCurrent) {
        const timestamp = nowIso();
        const byShotId = new Map(storyboard.shots.map((entry) => [entry.shotId, entry]));
        const durationByShotId = new Map(existing.scenes.flatMap((scene) => scene.beats).map((beat) => [beat.shotId, beat.durationSeconds]));
        const next = {
          ...storyboard,
          shots: shots.map((shot) => currentStoryboardShot({
            current: byShotId.get(shot.shotId),
            durationSeconds: durationByShotId.get(shot.shotId),
            linked: storyboard,
            shot,
            timestamp
          })),
          source: {
            ...storyboard.source,
            shotRevisions: Object.fromEntries(shots.map((shot) => [shot.shotId, shot.revision])),
            scriptBreakdownRevision: existing.revision
          },
          revision: storyboard.revision + 1,
          updatedAt: timestamp
        };
        assertStoryboardContract("StoryboardDocumentV2", next);
        storyboard = await ports.projects.saveStoryboardDocument(projectId, next, storyboard.revision);
      }
      return { breakdown: existing, shots, storyboard, replayed: true };
    }
    const timestamp = nowIso();
    const compiled = compileCinematicScriptBreakdown({
      document,
      projectId,
      productionId,
      storyPacket,
      visualBible,
      timestamp,
      previousRevision: existing?.revision ?? 0
    });
    const shotMap = new Map(existingShots.map((shot) => [shot.shotId, shot]));
    const shots = [];
    for (const proposed of compiled.shots) {
      const current = shotMap.get(proposed.shotId);
      shots.push(await dependencies.cinematic.saveShot({
        projectId,
        productionId,
        expectedRevision: current?.revision ?? 0,
        shot: {
          ...proposed,
          revision: (current?.revision ?? 0) + 1
        }
      }));
    }
    const breakdown = await ports.projects.saveCinematicScriptBreakdown(projectId, compiled.breakdown, existing?.revision ?? 0);
    const durationByShotId = new Map(breakdown.scenes.flatMap((scene) => scene.beats).map((beat) => [beat.shotId, beat.durationSeconds]));
    let storyboard = null;
    if (input.createStoryboard !== false) {
      const linked = existingStoryboards.find((entry) => entry.source?.scriptBreakdownId === breakdown.breakdownId);
      if (!linked) {
        storyboard = await dependencies.storyboards.createStoryboard({
          projectId,
          productionId,
          nodeId: input.storyboardNodeId,
          title: input.storyboardTitle,
          shotIds: shots.map((shot) => shot.shotId)
        });
        storyboard = await ports.projects.saveStoryboardDocument(projectId, {
          ...storyboard,
          shots: storyboard.shots.map((shot) => ({
            ...shot,
            durationSeconds: durationByShotId.get(shot.shotId) ?? shot.durationSeconds ?? null
          })),
          source: {
            ...storyboard.source,
            scriptBreakdownId: breakdown.breakdownId,
            scriptBreakdownRevision: breakdown.revision,
            ...(screenplayDocument ? {
              screenplayDocumentId: screenplayDocument.documentId,
              screenplayDocumentRevision: screenplayDocument.revision,
              screenplayDocumentChecksum: screenplayDocument.checksum
            } : {})
          },
          revision: storyboard.revision + 1,
          updatedAt: nowIso()
        }, storyboard.revision);
      } else {
        const timestamp = nowIso();
        const byShotId = new Map(linked.shots.map((entry) => [entry.shotId, entry]));
        const storyboardShots = shots.map((shot) => currentStoryboardShot({
          current: byShotId.get(shot.shotId),
          durationSeconds: durationByShotId.get(shot.shotId),
          linked,
          shot,
          timestamp
        }));
        const next = {
          ...linked,
          shots: storyboardShots,
          source: {
            ...linked.source,
            shotRevisions: Object.fromEntries(shots.map((shot) => [shot.shotId, shot.revision])),
            scriptBreakdownRevision: breakdown.revision,
            ...(screenplayDocument ? {
              screenplayDocumentId: screenplayDocument.documentId,
              screenplayDocumentRevision: screenplayDocument.revision,
              screenplayDocumentChecksum: screenplayDocument.checksum
            } : {})
          },
          revision: linked.revision + 1,
          updatedAt: timestamp
        };
        assertStoryboardContract("StoryboardDocumentV2", next);
        storyboard = await ports.projects.saveStoryboardDocument(projectId, next, linked.revision);
      }
    }
    return { breakdown, shots, storyboard, replayed: false };
  }

  async function getScriptBreakdown(input = {}) {
    return ports.projects.getCinematicScriptBreakdown(
      requireText(input.projectId, "projectId"),
      requireText(input.productionId, "productionId"),
      requireText(input.sourceNodeId, "sourceNodeId"),
      input.includeStale === true
    );
  }

  async function listScriptBreakdowns(input = {}) {
    return ports.projects.listCinematicScriptBreakdowns(
      requireText(input.projectId, "projectId"),
      requireText(input.productionId, "productionId"),
      input.includeStale === true
    );
  }

  return { getScriptBreakdown, listScriptBreakdowns, planCinematicFromScript };
}
