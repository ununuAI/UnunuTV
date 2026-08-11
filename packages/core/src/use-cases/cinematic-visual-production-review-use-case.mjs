import { UnuTvError } from "@ununu/unutv-contracts";
import { assessCinematicStoryShotOwnerReviews } from "../cinematic-story-shot-owner-review-policy.mjs";

export async function requireCinematicVisualProductionOwnerAcceptance({
  getProduction,
  getStoryPacket,
  listReviews,
  listShots,
  productionId,
  projectId,
  requireShotAcceptance = true,
  shotIds,
  storyPacketId
}) {
  const production = await getProduction(projectId, productionId);
  if (production?.productionMode !== "production") return { ok: true, story: null, shots: [], errors: [] };
  const [storyPacket, productionShots, reviews] = await Promise.all([
    getStoryPacket(projectId, productionId, storyPacketId),
    listShots(projectId, productionId),
    listReviews(projectId)
  ]);
  const requestedShotIds = Array.isArray(shotIds) ? new Set(shotIds) : null;
  const shots = requestedShotIds
    ? productionShots.filter((shot) => requestedShotIds.has(shot.shotId))
    : productionShots;
  const audit = assessCinematicStoryShotOwnerReviews({
    reviews,
    shots: requireShotAcceptance ? shots : [],
    storyPacket
  });
  const errors = [...audit.errors];
  if (requireShotAcceptance && !shots.length) errors.push({
    code: "shot_script_owner_acceptance_required",
    message: "正式视觉生产前必须先建立并接受当前分镜脚本 revision。"
  });
  if (requireShotAcceptance && requestedShotIds && shots.length !== requestedShotIds.size) errors.push({
    code: "shot_script_owner_acceptance_required",
    message: "正式视觉生产引用了不存在或已失效的当前分镜脚本。"
  });
  if (errors.length) throw new UnuTvError(errors[0].code, errors[0].message, 409, {
    errors,
    story: audit.story,
    shots: audit.shots
  });
  return audit;
}
