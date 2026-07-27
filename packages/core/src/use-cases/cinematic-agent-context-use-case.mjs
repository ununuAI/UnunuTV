import { CINEMATIC_AGENT_CONTEXT_VERSION, assertCinematicAgentContext, nowIso, requireText } from "@ununu/unutv-contracts";

function indexed(id, kind, revision = null, extra = {}) {
  return { id, kind, revision: Number.isInteger(revision) ? revision : null, ...extra };
}

export function createCinematicAgentContextUseCase({ cinematic, authorities, storyboards, timeline }) {
  async function snapshot(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const productionId = requireText(input.productionId, "productionId");
    const workflowId = requireText(input.workflowId, "workflowId");
    const sourceNodeId = requireText(input.sourceNodeId, "sourceNodeId");
    const [story, visualBible, authoritiesList, shots, storyboardsList, units, evaluations, timelines] = await Promise.all([
      cinematic.getStoryPacket({ projectId, productionId }),
      cinematic.getVisualBible({ projectId, productionId }),
      authorities.listAssetAuthorities({ projectId, productionId }),
      cinematic.listShots({ projectId, productionId }),
      storyboards.listStoryboards({ projectId, productionId }),
      cinematic.listGenerationUnits({ projectId, productionId }),
      cinematic.listEvaluations({ projectId, productionId }),
      timeline.listTimelines({ projectId })
    ]);
    const completedStages = [];
    if (story) completedStages.push("script_analysis");
    if (story && visualBible) completedStages.push("visual_bible");
    if (authoritiesList.length) completedStages.push("asset_design");
    if (shots.length && storyboardsList.length) completedStages.push("shot_design");
    if (units.length) completedStages.push("generation_unit_design");
    if (evaluations.some((entry) => entry.decision === "ACCEPT")) completedStages.push("continuity_qa");
    if (timelines.some((entry) => entry.clipCount > 0 || entry.durationSeconds > 0)) completedStages.push("timeline_edit");
    const blockers = [];
    if (!story) blockers.push("story_packet_required");
    if (!visualBible) blockers.push("visual_bible_required");
    if (!shots.length) blockers.push("shots_required");
    if (!units.length) blockers.push("generation_units_required");
    const context = {
      format: "UnunuCinematicAgentContextV1",
      contextVersion: CINEMATIC_AGENT_CONTEXT_VERSION,
      workflowId,
      productionId,
      sourceNodeId,
      createdAt: nowIso(),
      skill: input.skill,
      index: {
        story: story ? indexed(story.storyPacketId, "StoryProductionPacket", story.revision) : null,
        visualBible: visualBible ? indexed(visualBible.visualBibleId, "VisualBible", visualBible.revision) : null,
        authorities: authoritiesList.map((entry) => indexed(entry.authorityId, "AssetAuthority", entry.revision, { authorityType: entry.authorityType })),
        shots: shots.map((entry) => indexed(entry.shotId, "CinematicShotSpec", entry.revision, { order: entry.order })),
        storyboards: storyboardsList.map((entry) => indexed(entry.storyboardId, "StoryboardDocument", entry.revision, { shotCount: entry.shots?.length ?? 0 })),
        generationUnits: units.map((entry) => indexed(entry.generationUnit.generationUnitId, "GenerationUnit", entry.generationUnit.revision, { shotIds: entry.generationUnit.shotLinks?.map((link) => link.shotId) ?? [] })),
        evaluations: evaluations.map((entry) => indexed(entry.evaluationId, "CinematicEvaluationRecord", entry.revision, { decision: entry.decision, generationUnitId: entry.generationUnitId })),
        timelines: timelines.map((entry) => indexed(entry.id, "Timeline", entry.revision ?? null, { clipCount: entry.clipCount ?? 0, durationSeconds: entry.durationSeconds ?? 0 }))
      },
      gates: {
        blockers,
        completedStages,
        nextStage: blockers[0] ? "authoring_required" : "prompt_compile"
      }
    };
    return assertCinematicAgentContext(context);
  }

  return { snapshot };
}
