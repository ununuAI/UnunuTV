import {
  STORYBOARD_BATCH_SOURCE_LINEAGE_VERSION,
  UnuTvError,
  nowIso,
  validateStoryboardBatchSourceLineage
} from "@ununu/unutv-contracts";

function comparable(lineage) {
  if (!lineage) return null;
  const { capturedAt: _capturedAt, ...rest } = lineage;
  return rest;
}

export function storyboardBatchSourceLineageMatches(expected, actual) {
  return Boolean(expected)
    && Boolean(actual)
    && validateStoryboardBatchSourceLineage(expected).ok
    && validateStoryboardBatchSourceLineage(actual).ok
    && JSON.stringify(comparable(expected)) === JSON.stringify(comparable(actual));
}

export function storyboardBatchProductionSourcesMatch(expected, actual) {
  if (!expected || !actual) return false;
  const stripOutputRevisions = (lineage) => ({
    ...comparable(lineage),
    storyboardRevision: 0,
    shots: lineage.shots.map((shot) => ({ ...shot, storyboardShotRevision: 0 }))
  });
  return JSON.stringify(stripOutputRevisions(expected)) === JSON.stringify(stripOutputRevisions(actual));
}

export async function captureStoryboardBatchSourceLineage({ ports, productionId, projectId, storyboard }) {
  const [storyPacket, visualBible, cinematicShots, sequencePrevis] = await Promise.all([
    ports.projects.getStoryPacket(projectId, productionId, storyboard.source?.storyPacketId),
    ports.projects.getVisualBible(projectId, productionId),
    ports.projects.listCinematicShots(projectId, productionId),
    ports.projects.listSequencePrevis(projectId, productionId)
  ]);
  const liveShots = new Map(cinematicShots.map((shot) => [shot.shotId, shot]));
  const currentPrevis = [...sequencePrevis].sort((left, right) => (
    String(right.updatedAt ?? "").localeCompare(String(left.updatedAt ?? ""))
    || Number(right.revision) - Number(left.revision)
  ))[0] ?? null;
  const lineage = {
    version: STORYBOARD_BATCH_SOURCE_LINEAGE_VERSION,
    storyboardId: storyboard.storyboardId,
    storyboardRevision: storyboard.revision,
    storyPacketId: storyPacket?.storyPacketId ?? "",
    storyPacketRevision: storyPacket?.revision ?? 0,
    visualBibleId: visualBible?.visualBibleId ?? "",
    visualBibleRevision: visualBible?.revision ?? 0,
    sequencePrevis: currentPrevis ? {
      sequencePrevisId: currentPrevis.sequencePrevisId,
      revision: currentPrevis.revision
    } : null,
    shots: [...storyboard.shots]
      .sort((left, right) => left.order - right.order)
      .map((shot) => ({
        storyboardShotId: shot.storyboardShotId,
        storyboardShotRevision: shot.revision,
        shotId: shot.shotId,
        shotRevision: liveShots.get(shot.shotId)?.revision ?? 0,
        order: shot.order
      })),
    capturedAt: nowIso()
  };
  const validation = validateStoryboardBatchSourceLineage(lineage);
  if (!validation.ok) throw new UnuTvError(
    "storyboard_batch_source_lineage_required",
    "故事板批次必须绑定当前 Story、VisualBible、Shot、Storyboard 与 SequencePrevis 精确版本；未发起 Provider。",
    409,
    { errors: validation.issues }
  );
  return lineage;
}

export function requireStoryboardBatchCreationLineage({ lineage, storyboard }) {
  const sourceShotRevisions = storyboard.source?.shotRevisions ?? {};
  const errors = [];
  if (storyboard.source?.storyPacketId !== lineage.storyPacketId || storyboard.source?.storyPacketRevision !== lineage.storyPacketRevision) {
    errors.push({ code: "story_packet_revision_stale", expected: storyboard.source, actual: { storyPacketId: lineage.storyPacketId, storyPacketRevision: lineage.storyPacketRevision } });
  }
  if (storyboard.source?.visualBibleId !== lineage.visualBibleId || storyboard.source?.visualBibleRevision !== lineage.visualBibleRevision) {
    errors.push({ code: "visual_bible_revision_stale", expected: storyboard.source, actual: { visualBibleId: lineage.visualBibleId, visualBibleRevision: lineage.visualBibleRevision } });
  }
  for (const shot of lineage.shots) {
    if (sourceShotRevisions[shot.shotId] !== shot.shotRevision) {
      errors.push({ code: "cinematic_shot_revision_stale", shotId: shot.shotId, expected: sourceShotRevisions[shot.shotId], actual: shot.shotRevision });
    }
  }
  if (errors.length) throw storyboardBatchSourceLineageError(lineage, lineage, errors);
  return lineage;
}

function currentStoryboardMedia(shot, kind) {
  const prefix = kind === "video" ? "video" : "image";
  return Boolean(shot?.[`${prefix}MediaId`])
    && shot?.[`${prefix}SourceShotRevision`] === shot?.shotRevision;
}

export function requireStoryboardBatchGenerationCoverage(job, storyboard) {
  if (!job?.configuration?.automationTaskId) return storyboard;
  const required = storyboard.shots
    .filter((shot) => !currentStoryboardMedia(shot, job.kind))
    .sort((left, right) => left.order - right.order)
    .map((shot) => shot.storyboardShotId);
  const incomplete = job.items
    .filter((item) => !["succeeded", "reused"].includes(item.status))
    .sort((left, right) => left.order - right.order)
    .map((item) => item.storyboardShotId);
  const requiredSet = new Set(required);
  const incompleteSet = new Set(incomplete);
  const missingStoryboardShotIds = required.filter((id) => !incompleteSet.has(id));
  const extraStoryboardShotIds = incomplete.filter((id) => !requiredSet.has(id));
  const duplicateStoryboardShotIds = incomplete.filter((id, index) => incomplete.indexOf(id) !== index);
  if (
    missingStoryboardShotIds.length
    || extraStoryboardShotIds.length
    || duplicateStoryboardShotIds.length
    || incomplete.length !== incompleteSet.size
  ) {
    throw new UnuTvError(
      "storyboard_batch_generation_coverage_stale",
      "自动化故事板批次未覆盖当前全部待生成镜头；旧批次必须取消并按当前镜头集合重建，禁止继续复用或重试。",
      409,
      {
        jobId: job.id,
        kind: job.kind,
        requiredStoryboardShotIds: required,
        incompleteItemStoryboardShotIds: incomplete,
        missingStoryboardShotIds,
        extraStoryboardShotIds,
        duplicateStoryboardShotIds: [...new Set(duplicateStoryboardShotIds)],
        cancelAndCreateNewBatchRequired: true,
        newBatchRequired: true
      }
    );
  }
  return storyboard;
}

export function storyboardBatchSourceLineageError(expected, actual, errors = []) {
  return new UnuTvError(
    "storyboard_batch_source_lineage_stale",
    "故事板批次来源版本已变化；旧批次与迟到 Provider 结果只保留为历史，不得写入当前故事板或当前节点。",
    409,
    { expected, actual, errors, newBatchRequired: true }
  );
}

export function requireStoryboardBatchSourceLineage(expected, actual) {
  if (!storyboardBatchSourceLineageMatches(expected, actual)) throw storyboardBatchSourceLineageError(expected, actual);
  return actual;
}
