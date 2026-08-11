function reviewFromRow(row, parsePayload) {
  const review = {
    id: row.id,
    targetType: row.targetType,
    targetId: row.targetId,
    state: row.state,
    note: row.note,
    revision: row.revision,
    createdAt: row.createdAt
  };
  const evidence = row.evidence_json ? parsePayload(row.evidence_json, null) : null;
  return evidence ? { ...review, evidence } : review;
}

export function attachProjectReviewMethods(prototype, emitEvent, parsePayload) {
  Object.assign(prototype, {
    createReview(projectId, review) {
      const database = this.database(projectId);
      database.prepare(`
        INSERT INTO reviews (id, target_type, target_id, state, note, evidence_json, target_revision, created_at)
        SELECT ?, ?, ?, ?, ?, ?, COALESCE(MAX(target_revision), 0) + 1, ?
        FROM reviews WHERE target_type=? AND target_id=?
      `).run(
        review.id,
        review.targetType,
        review.targetId,
        review.state,
        review.note,
        review.evidence ? JSON.stringify(review.evidence) : null,
        review.createdAt,
        review.targetType,
        review.targetId
      );
      const revision = Number(database.prepare("SELECT target_revision AS revision FROM reviews WHERE id=?")
        .get(review.id).revision);
      emitEvent(database, "review.created", review.id, {
        targetType: review.targetType,
        targetId: review.targetId,
        state: review.state,
        evidenceType: review.evidence?.evidenceType ?? null
      });
      return { ...review, revision };
    },
    listReviews(projectId) {
      return this.database(projectId).prepare(`
        SELECT id, target_type AS targetType, target_id AS targetId, state, note,
          evidence_json, target_revision AS revision, created_at AS createdAt
        FROM reviews ORDER BY created_at, rowid
      `).all().map((row) => reviewFromRow(row, parsePayload));
    }
  });
}
