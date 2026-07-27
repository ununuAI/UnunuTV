export const MEDIA_PREPARATION_STATES = Object.freeze(["pending", "succeeded", "failed"]);

export function assertMediaPreparationV1(value) {
  const issues = [];
  if (value?.version !== "media_preparation_v1") issues.push("version is invalid");
  for (const field of ["id", "projectId", "mediaId", "sourceChecksum", "status", "createdAt", "updatedAt"]) {
    if (typeof value?.[field] !== "string" || !value[field].trim()) issues.push(`${field} is required`);
  }
  if (!MEDIA_PREPARATION_STATES.includes(value?.status)) issues.push("status is invalid");
  if (value?.waveform !== null && value?.waveform !== undefined && (!Array.isArray(value.waveform) || value.waveform.some((peak) => typeof peak !== "number" || peak < 0 || peak > 1))) issues.push("waveform must contain normalized peaks");
  if (value?.probe !== null && value?.probe !== undefined && (!value.probe || typeof value.probe !== "object" || Array.isArray(value.probe))) issues.push("probe must be an object");
  if (issues.length) throw Object.assign(new Error(`MediaPreparationV1 validation failed: ${issues.join("; ")}`), { code: "invalid_media_preparation_v1", status: 500 });
  return value;
}
