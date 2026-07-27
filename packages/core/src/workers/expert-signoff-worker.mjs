import { assertKnowledgeRefsGrounded, createId, nowIso, UnuTvError } from "@ununu/unutv-contracts";

const ROLE_DEFAULTS = {
  continuity: { expertPackId: "expert-pack-continuity-v1", diagnosis: "连续性会签：锁定身份、空间与状态继承", risks: ["continuity"], departments: ["连续性", "导演"] },
  cinematography: { expertPackId: "expert-pack-cinematography-v1", diagnosis: "摄影会签：锁定构图、运镜与焦点可读性", risks: ["camera", "cinematography"], departments: ["摄影"] },
  director: { expertPackId: "expert-pack-director-v1", diagnosis: "导演会签：锁定叙事任务与节拍", risks: ["story", "direction"], departments: ["导演"] },
  performance: { expertPackId: "expert-pack-performance-v1", diagnosis: "表演会签：锁定可见因果表演", risks: ["performance"], departments: ["表演"] }
};

/**
 * Auto-create knowledge-grounded professional contributions for a generation unit.
 * Uses Knowledge Port for real cap/kn IDs (no fake prefix grounding).
 */
export async function autoSignoffGenerationUnit({
  projectId,
  productionId,
  generationUnitId,
  roles = ["continuity", "cinematography"],
  cinematic,
  knowledge,
  teamManifestId = null
} = {}) {
  if (!knowledge?.retrieveKnowledge || !knowledge?.getKnowledgeByIds) {
    throw new UnuTvError("knowledge_port_required", "Expert auto-signoff requires a Knowledge Port", 500);
  }
  if (!cinematic?.getGenerationUnit || !cinematic?.addProfessionalContribution || !cinematic?.getStoryPacket) {
    throw new TypeError("expert-signoff-worker requires cinematic contribution ports");
  }

  const unitRecord = await cinematic.getGenerationUnit({ projectId, productionId, generationUnitId });
  const unit = unitRecord.generationUnit;
  const story = await cinematic.getStoryPacket({ projectId, productionId });
  if (!story) throw new UnuTvError("story_packet_required", "Story packet required for auto-signoff", 409);

  const shots = [];
  for (const link of unit.shotLinks || []) {
    const shot = await cinematic.getShot({ projectId, productionId, shotId: link.shotId });
    shots.push(shot);
  }

  const production = await cinematic.getCinematicProduction({ projectId, productionId });
  const manifestId = teamManifestId
    || production.teamManifestIds?.[0]
    || null;

  // Ensure a team manifest id exists for manifest-bound gates
  let ensuredManifestId = manifestId;
  if (!ensuredManifestId) {
    ensuredManifestId = createId("team");
    await cinematic.updateCinematicProduction({
      projectId,
      productionId,
      teamManifestIds: [ensuredManifestId]
    });
  }

  const created = [];
  for (const roleId of roles) {
    const meta = ROLE_DEFAULTS[roleId] || {
      expertPackId: `expert-pack-${roleId}-v1`,
      diagnosis: `${roleId} auto signoff`,
      risks: [roleId],
      departments: []
    };
    const retrieved = knowledge.retrieveKnowledge({
      risks: meta.risks,
      roles: [roleId],
      departments: meta.departments,
      limit: 6,
      statuses: ["ACTIVE", "LIMITED"]
    });
    const capId = retrieved.capabilityIds?.[0];
    const knId = retrieved.knowledgeIds?.[0];
    if (!capId || !knId) {
      throw new UnuTvError(
        "knowledge_retrieval_empty",
        `No knowledge found for role ${roleId}; check UNUTV_KNOWLEDGE_ROOT`,
        409,
        { roleId, stats: knowledge.stats?.() }
      );
    }
    const resolved = knowledge.getKnowledgeByIds([capId, knId]);
    const grounding = assertKnowledgeRefsGrounded([capId, knId], resolved);
    if (!grounding.ok) {
      throw new UnuTvError("knowledge_grounding_failed", "Retrieved knowledge failed grounding", 409, grounding.errors);
    }

    const contribution = {
      roleId,
      expertPackId: meta.expertPackId,
      targetType: "generation_unit",
      targetId: unit.generationUnitId,
      diagnosis: meta.diagnosis,
      selectedTradeoff: "platform_auto_signoff_template_v1",
      structuredFields: {
        targetRevision: unit.revision,
        sourceStoryPacketRevision: story.revision,
        sourceGenerationUnitRevision: unit.revision,
        sourceShotRevisions: shots.map((shot) => ({ shotId: shot.shotId, revision: shot.revision })),
        teamManifestId: ensuredManifestId,
        fieldChanges: [],
        method: "knowledge_grounded_template_v1",
        acceptanceChecks: [
          "身份与空间在本镜保持可读",
          "不得违反已揭示剧情事实",
          "运镜与动作服务 narrativeJob"
        ]
      },
      hardConstraints: [
        "不得覆盖 Owner 锁定剧情与对白",
        "不得静默更换已 freeze 的共享资产身份"
      ],
      vetoFindings: [],
      knowledgeRefs: [capId, knId],
      acceptanceCriteria: [
        "本镜 narrativeJob 完成",
        "无身份/拓扑硬错误"
      ],
      revision: 1,
      createdAt: nowIso()
    };

    const saved = await cinematic.addProfessionalContribution({
      projectId,
      productionId,
      contribution
    });
    created.push(saved);
  }

  return { contributions: created, teamManifestId: ensuredManifestId };
}
