function text(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function validateDirectorIntentionalForegroundCropIds(camera) {
  const value = camera?.intentionalForegroundCropIds;
  if (value === undefined) return { issues: [], ok: true };
  if (!Array.isArray(value)) {
    return {
      issues: [{ code: "invalid_type", message: "intentionalForegroundCropIds must be an array", path: "intentionalForegroundCropIds" }],
      ok: false
    };
  }
  const issues = [];
  const seen = new Set();
  value.forEach((objectId, index) => {
    if (!text(objectId)) {
      issues.push({ code: "required", message: "foreground crop object id is required", path: `intentionalForegroundCropIds[${index}]` });
      return;
    }
    if (seen.has(objectId)) issues.push({ code: "duplicate_id", message: `duplicate foreground crop object id: ${objectId}`, path: `intentionalForegroundCropIds[${index}]` });
    seen.add(objectId);
  });
  return { issues, ok: issues.length === 0 };
}

export function directorObjectRequiresFullFrame(camera, objectId) {
  const validation = validateDirectorIntentionalForegroundCropIds(camera);
  if (!validation.ok || !text(objectId)) return true;
  return !new Set(camera?.intentionalForegroundCropIds ?? []).has(objectId);
}
