export const CINEMATIC_STORY_REVISION_REVIEW_TYPE = "cinematic_story_revision";
export const CINEMATIC_SHOT_REVISION_REVIEW_TYPE = "cinematic_shot_revision";

export function cinematicRevisionReviewTargetId(kind, artifactId, artifactRevision) {
  const prefix = kind === "story" ? "cinematic-story" : "cinematic-shot";
  const id = typeof artifactId === "string" ? artifactId.trim() : "";
  const parsedRevision = Number(artifactRevision);
  const revision = Number.isInteger(parsedRevision) && parsedRevision > 0 ? parsedRevision : "invalid";
  return `${prefix}:${id}:r${revision}`;
}
