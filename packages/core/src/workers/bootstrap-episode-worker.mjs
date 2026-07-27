import { createId, UnuTvError } from "@ununu/unutv-contracts";

function text(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

/**
 * Prepare the upstream contracts for the formal cinematic pipeline.
 *
 * This is intentionally a validator/materialiser, not a creative writer:
 * it may persist a StoryPacket, VisualBible or script rows only when the
 * caller already supplied those structured records. A brief alone is not
 * enough to invent characters, dialogue, scene headings, camera movement or
 * performance; the workflow must remain blocked until those facts exist.
 */
export async function bootstrapEpisodeFromBrief({
  projectId,
  productionId,
  sourceNodeId,
  brief,
  targetDurationSeconds = 30,
  aspectRatio = "9:16",
  generationStrategies = {},
  referenceBindings = [],
  referenceMediaIds = [],
  visualAnchorPolicy = null,
  generationMode = null,
  storyPacket: suppliedStoryPacket = null,
  visualBible: suppliedVisualBible = null,
  scriptRows: suppliedScriptRows = null,
  cinematic,
  projects = null,
  createScriptRow,
  getScriptDocument,
  scriptPlanning,
  storyboards = null,
  series = null,
  seriesId = null,
  knowledge = null
} = {}) {
  if (!cinematic) throw new TypeError("bootstrap requires cinematic ports");
  const cleanBrief = text(brief);
  if (!cleanBrief) throw new UnuTvError("brief_required", "one-shot requires a non-empty brief", 400);
  const steps = [];

  let story = await cinematic.getStoryPacket({ projectId, productionId }).catch(() => null);
  if (!story && suppliedStoryPacket) {
    story = await cinematic.saveStoryPacket({ projectId, productionId, storyPacket: suppliedStoryPacket });
    steps.push({ step: "story_packet", ok: true, revision: story.revision, source: "caller_structured_input" });
  }
  if (!story) throw new UnuTvError("story_packet_required", "StoryProductionPacket is missing; a brief cannot be expanded into characters or causal events automatically", 409);
  if (story.status === "needs_story_authoring" || story.storyPacket?.status === "needs_story_authoring") {
    throw new UnuTvError("story_packet_incomplete", "Series ledger context is not a completed StoryPacket; supply authored causal events, dialogue and states before shot design", 409);
  }
  if (!story.storyPacket?.characters?.length || !story.storyPacket?.causalEventChain?.length) {
    throw new UnuTvError("story_packet_incomplete", "StoryProductionPacket must contain characters and a causal event chain before shot design", 409);
  }
  if (!steps.some((entry) => entry.step === "story_packet")) steps.push({ step: "story_packet", ok: true, reused: true, revision: story.revision });

  let bible = await cinematic.getVisualBible({ projectId, productionId }).catch(() => null);
  if (!bible && suppliedVisualBible) {
    bible = await cinematic.saveVisualBible({ projectId, productionId, visualBible: suppliedVisualBible });
    steps.push({ step: "visual_bible", ok: true, revision: bible.revision, source: "caller_structured_input" });
  }
  if (!bible) throw new UnuTvError("visual_bible_required", "VisualBible is missing; scene, character and camera rules cannot be invented silently", 409);
  if (!steps.some((entry) => entry.step === "visual_bible")) steps.push({ step: "visual_bible", ok: true, reused: true, revision: bible.revision });

  const scriptDoc = await getScriptDocument({ projectId, nodeId: sourceNodeId });
  if (!scriptDoc.rows.length) {
    const rows = Array.isArray(suppliedScriptRows) ? suppliedScriptRows : [];
    if (!rows.length) {
      throw new UnuTvError("script_rows_required", "Structured script rows are missing; the workflow will not fabricate scene headings, actions or dialogue from a brief", 409);
    }
    for (const [index, row] of rows.entries()) {
      const payload = row?.payload && typeof row.payload === "object" ? row.payload : row;
      if (!payload || typeof payload !== "object") throw new UnuTvError("script_row_invalid", `scriptRows[${index}] must be an object`, 400);
      await createScriptRow({ projectId, nodeId: sourceNodeId, orderIndex: index, shotNumber: row.shotNumber ?? index + 1, payload: { ...payload, aspectRatio: payload.aspectRatio || aspectRatio } });
    }
    steps.push({ step: "script_rows", ok: true, count: rows.length, source: "caller_structured_input" });
  } else {
    steps.push({ step: "script_rows", ok: true, reused: true, count: scriptDoc.rows.length });
  }

  let plan = null;
  if (scriptPlanning?.planCinematicFromScript) {
    plan = await scriptPlanning.planCinematicFromScript({ projectId, productionId, sourceNodeId, createStoryboard: true });
    steps.push({ step: "shot_design", ok: true, shotCount: plan.shots.length, replayed: plan.replayed === true });
  }
  const shots = plan?.shots?.length ? plan.shots : await cinematic.listShots({ projectId, productionId });
  if (!shots.length) throw new UnuTvError("cinematic_shots_required", "No shot contract was produced from the structured script", 409);
  // Never alter movement, timing, performance or owner review state here.
  // Those are authored shot facts and must be reviewed before Provider use.
  steps.push({ step: "shot_review_required", ok: true, count: shots.length });

  let assetReuse = null;
  if (seriesId && series?.bindSharedAssetsForEpisode) {
    assetReuse = await series.bindSharedAssetsForEpisode({ seriesId });
    steps.push({ step: "asset_reuse_bind", ok: true, bound: assetReuse.boundEntryIds?.length || 0 });
  }

  const { ensureGenerationUnitsForProduction } = await import("./unit-design-worker.mjs");
  const designed = await ensureGenerationUnitsForProduction({
    projectId,
    productionId,
    cinematic,
    projects,
    storyboards,
    generationStrategies: {
      ...generationStrategies,
      video_generation: {
        ...(generationStrategies.video_generation || {}),
        ...(generationMode ? { mode: generationMode } : {}),
        ...(visualAnchorPolicy ? { visualAnchorPolicy } : {})
      }
    },
    referenceBindings,
    referenceMediaIds,
    visualAnchorPolicy,
    generationMode,
    aspectRatio
  });
  steps.push({ step: "unit_design", ok: true, created: designed.created.length, updated: designed.updated?.length || 0, message: designed.message });

  if (knowledge) {
    const { autoSignoffGenerationUnit } = await import("./expert-signoff-worker.mjs");
    const refreshed = await cinematic.listGenerationUnits({ projectId, productionId });
    for (const entry of refreshed) {
      const existing = await cinematic.listProfessionalContributions({ projectId, productionId });
      const has = existing.some((item) => item.targetId === entry.generationUnit.generationUnitId
        && Array.isArray(item.knowledgeRefs) && item.knowledgeRefs.some((ref) => String(ref).startsWith("kn-")));
      if (has) continue;
      await autoSignoffGenerationUnit({ projectId, productionId, generationUnitId: entry.generationUnit.generationUnitId, roles: ["continuity", "cinematography"], cinematic, knowledge });
    }
    steps.push({ step: "expert_signoff", ok: true });
  }

  return {
    bootstrapId: createId("bootstrap"),
    steps,
    storyPacketId: story.storyPacketId,
    visualBibleId: bible.visualBibleId,
    shotCount: shots.length,
    unitCount: (await cinematic.listGenerationUnits({ projectId, productionId })).length,
    assetReuse,
    targetDurationSeconds,
    aspectRatio,
    generationStrategies
  };
}
