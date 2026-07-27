import {
  CINEMATIC_SEQUENCE_PREVIS_REVIEW_TYPE,
  CINEMATIC_SHOT_REVISION_REVIEW_TYPE,
  CINEMATIC_STORY_REVISION_REVIEW_TYPE,
  REVIEW_STATES,
  UnuTvError,
  assessCinematicPerformanceTimeline,
  createId,
  nowIso,
  optionalText,
  requireEnum,
  requireText
} from "@ununu/unutv-contracts";

function parseRevisionTarget(targetId, kind) {
  const prefix = kind === "story" ? "cinematic-story:" : "cinematic-shot:";
  const match = typeof targetId === "string" ? targetId.match(new RegExp(`^${prefix}(.+):r(\\d+)$`, "u")) : null;
  return match ? { artifactId: match[1], revision: Number(match[2]) } : null;
}

async function findCurrentStory(cinematic, projectId, target) {
  for (const production of await cinematic.listCinematicProductions({ projectId })) {
    if (!production.storyPacketIds?.includes(target.artifactId)) continue;
    const story = await cinematic.getStoryPacket({ projectId, productionId: production.productionId });
    if (story?.storyPacketId === target.artifactId) return story;
  }
  return null;
}

async function findCurrentShot(cinematic, projectId, target) {
  for (const production of await cinematic.listCinematicProductions({ projectId })) {
    if (!production.shotIds?.includes(target.artifactId)) continue;
    const shots = await cinematic.listShots({ projectId, productionId: production.productionId });
    const shot = shots.find((entry) => entry.shotId === target.artifactId);
    if (shot) return shot;
  }
  return null;
}

function requireCurrentRevision(artifact, target, kind) {
  if (!artifact || artifact.revision !== target.revision) throw new UnuTvError(
    "cinematic_review_target_stale",
    `只能审批当前 ${kind} revision；目标不存在或已被新 revision 覆盖。`,
    409,
    { target, currentRevision: artifact?.revision ?? null }
  );
}

export function createCinematicRevisionReviewUseCase(ports, cinematic) {
  return async function reviewTarget(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const targetType = optionalText(input.targetType, "node");
    const targetId = requireText(input.targetId, "targetId");
    const state = requireEnum(input.state, REVIEW_STATES, "state");
    if (targetType === CINEMATIC_SEQUENCE_PREVIS_REVIEW_TYPE) throw new UnuTvError(
      "sequence_previs_review_route_required",
      "连续预演审批必须经过专用完整性门禁，不能使用通用 review 接口绕过。",
      409
    );
    if (state === "accepted" && targetType === CINEMATIC_STORY_REVISION_REVIEW_TYPE) {
      const target = parseRevisionTarget(targetId, "story");
      if (!target) throw new UnuTvError("invalid_cinematic_review_target", "剧情审批目标必须包含明确的 story id 与 revision。", 400);
      requireCurrentRevision(await findCurrentStory(cinematic, projectId, target), target, "剧情");
    }
    if (state === "accepted" && targetType === CINEMATIC_SHOT_REVISION_REVIEW_TYPE) {
      const target = parseRevisionTarget(targetId, "shot");
      if (!target) throw new UnuTvError("invalid_cinematic_review_target", "分镜审批目标必须包含明确的 shot id 与 revision。", 400);
      const shot = await findCurrentShot(cinematic, projectId, target);
      requireCurrentRevision(shot, target, "分镜脚本");
      const audit = assessCinematicPerformanceTimeline(shot);
      if (!audit.ok) throw new UnuTvError(
        "shot_performance_contract_required",
        "当前分镜缺少连续、可见、可验收的秒级表演因果，不能写入 Owner ACCEPT。",
        409,
        audit
      );
    }
    return ports.projects.createReview(projectId, {
      id: createId("review"), targetType, targetId, state,
      note: optionalText(input.note, ""), createdAt: nowIso()
    });
  };
}
