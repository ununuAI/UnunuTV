import { UnuTvError, assertStoryboardContract, createId, defaultStoryboardVideoReference, nowIso, requireText } from "@ununu/unutv-contracts";
import { compileCinematicScriptBreakdown } from "../script-breakdown-policy.mjs";

export function createScriptPlanningUseCases(ports, dependencies) {
  async function planCinematicFromScript(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const productionId = requireText(input.productionId, "productionId");
    const sourceNodeId = requireText(input.sourceNodeId, "sourceNodeId");
    const [document, storyPacket, visualBible, existing, existingShots, existingStoryboards] = await Promise.all([
      dependencies.getScriptDocument({ projectId, nodeId: sourceNodeId }),
      dependencies.cinematic.getStoryPacket({ projectId, productionId }),
      dependencies.cinematic.getVisualBible({ projectId, productionId }),
      ports.projects.getCinematicScriptBreakdown(projectId, productionId, sourceNodeId),
      dependencies.cinematic.listShots({ projectId, productionId }),
      dependencies.storyboards.listStoryboards({ projectId, productionId })
    ]);
    if (!storyPacket) throw new UnuTvError("story_packet_required", "Create a complete StoryProductionPacket before planning shots", 409);
    if (!visualBible) throw new UnuTvError("visual_bible_required", "Create a complete VisualBible before planning shots", 409);
    if (existing?.sourceDocumentRevision === document.revision) {
      const shotMap = new Map(existingShots.map((shot) => [shot.shotId, shot]));
      const shots = existing.shotIds.map((shotId) => shotMap.get(shotId)).filter(Boolean);
      return { breakdown: existing, shots, storyboard: existingStoryboards.find((entry) => entry.source?.scriptBreakdownId === existing.breakdownId) ?? null, replayed: true };
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
      const preservedDirectorBinding = current?.directorStageBinding ?? null;
      const preservedAcceptanceCriteria = (current?.acceptanceCriteria ?? []).filter((criterion) => (
        typeof criterion === "string" && criterion.includes("空间、站位与机位须匹配导演台")
      ));
      shots.push(await dependencies.cinematic.saveShot({
        projectId,
        productionId,
        expectedRevision: current?.revision ?? 0,
        shot: {
          ...proposed,
          ...(preservedDirectorBinding ? {
            directorStageBinding: preservedDirectorBinding,
            blocking: {
              ...proposed.blocking,
              directorStageBinding: current?.blocking?.directorStageBinding ?? preservedDirectorBinding
            },
            cinematography: {
              ...proposed.cinematography,
              ...(current?.cinematography?.directorStageCamera
                ? { directorStageCamera: current.cinematography.directorStageCamera }
                : {})
            }
          } : {}),
          acceptanceCriteria: [...new Set([
            ...(proposed.acceptanceCriteria ?? []),
            ...preservedAcceptanceCriteria
          ])],
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
          source: { ...storyboard.source, scriptBreakdownId: breakdown.breakdownId, scriptBreakdownRevision: breakdown.revision },
          revision: storyboard.revision + 1,
          updatedAt: nowIso()
        }, storyboard.revision);
      } else {
        const timestamp = nowIso();
        const byShotId = new Map(linked.shots.map((entry) => [entry.shotId, entry]));
        const storyboardShots = shots.map((shot, index) => {
          const current = byShotId.get(shot.shotId);
          return {
            storyboardShotId: current?.storyboardShotId ?? createId("storyboard-shot"),
            storyboardId: linked.storyboardId,
            shotId: shot.shotId,
            generationUnitId: current?.generationUnitId ?? null,
            order: index + 1,
            title: current?.title ?? `镜头 ${String(shot.order).padStart(2, "0")}`,
            narrativeJob: shot.narrativeJob,
            storyBeat: shot.storyBeat,
            durationSeconds: durationByShotId.get(shot.shotId) ?? current?.durationSeconds ?? null,
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
            status: current?.status ?? "ready_for_image",
            imageMediaId: current?.imageMediaId ?? null,
            imageVersionId: current?.imageVersionId ?? null,
            imageChecksum: current?.imageChecksum ?? null,
            videoMediaId: current?.videoMediaId ?? null,
            videoVersionId: current?.videoVersionId ?? null,
            videoChecksum: current?.videoChecksum ?? null,
            videoReference: current?.videoReference ?? defaultStoryboardVideoReference(),
            error: current?.error ?? null,
            revision: current?.revision ?? 1,
            createdAt: current?.createdAt ?? timestamp,
            updatedAt: timestamp
          };
        });
        const next = {
          ...linked,
          shots: storyboardShots,
          source: {
            ...linked.source,
            shotRevisions: Object.fromEntries(shots.map((shot) => [shot.shotId, shot.revision])),
            scriptBreakdownRevision: breakdown.revision
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
      requireText(input.sourceNodeId, "sourceNodeId")
    );
  }

  async function listScriptBreakdowns(input = {}) {
    return ports.projects.listCinematicScriptBreakdowns(requireText(input.projectId, "projectId"), requireText(input.productionId, "productionId"));
  }

  return { getScriptBreakdown, listScriptBreakdowns, planCinematicFromScript };
}
