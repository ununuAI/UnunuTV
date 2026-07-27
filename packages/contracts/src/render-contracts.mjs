export const RENDER_JOB_STATES = Object.freeze(["queued", "running", "succeeded", "failed", "cancelled"]);
export const RENDER_PRESETS = Object.freeze(["h264_review", "h265_delivery", "prores_master", "h264_vertical", "h264_square", "wav_mix"]);
export const TECHNICAL_QC_STATES = Object.freeze(["pass", "warning", "fail"]);
export const DELIVERY_PACKAGE_KINDS = Object.freeze(["review", "delivery", "master"]);
export const DELIVERY_PACKAGE_STATES = Object.freeze(["review_ready", "delivery_ready", "master_ready"]);

export function assertRenderJob(value) {
  const issues = [];
  for (const field of ["id", "projectId", "timelineId", "outputNodeId", "preset", "status", "createdAt", "updatedAt"]) if (typeof value?.[field] !== "string" || !value[field].trim()) issues.push(`${field} is required`);
  if (!RENDER_PRESETS.includes(value?.preset)) issues.push("preset is invalid");
  if (!RENDER_JOB_STATES.includes(value?.status)) issues.push("status is invalid");
  if (typeof value?.progress !== "number" || value.progress < 0 || value.progress > 1) issues.push("progress must be between zero and one");
  if (issues.length) throw Object.assign(new Error(`RenderJob validation failed: ${issues.join("; ")}`), { code: "invalid_render_job", status: 500 });
  return value;
}

export function assertExportMaster(value) {
  const issues = [];
  for (const field of ["id", "projectId", "timelineId", "renderJobId", "mediaId", "preset", "checksum", "createdAt"]) if (typeof value?.[field] !== "string" || !value[field].trim()) issues.push(`${field} is required`);
  if (issues.length) throw Object.assign(new Error(`ExportMaster validation failed: ${issues.join("; ")}`), { code: "invalid_export_master", status: 500 });
  return value;
}

export function assertTechnicalQcReport(value) {
  const issues = [];
  for (const field of ["id", "projectId", "renderJobId", "mediaId", "status", "createdAt"]) if (typeof value?.[field] !== "string" || !value[field].trim()) issues.push(`${field} is required`);
  if (!TECHNICAL_QC_STATES.includes(value?.status)) issues.push("status is invalid");
  if (!Array.isArray(value?.checks) || value.checks.some((check) => typeof check?.id !== "string" || !TECHNICAL_QC_STATES.includes(check?.status))) issues.push("checks must contain identified QC results");
  if (!value?.probe || typeof value.probe !== "object" || Array.isArray(value.probe)) issues.push("probe is required");
  if (issues.length) throw Object.assign(new Error(`TechnicalQcReport validation failed: ${issues.join("; ")}`), { code: "invalid_technical_qc_report", status: 500 });
  return value;
}

export function assertDeliveryPackageManifestV1(value) {
  const issues = [];
  if (value?.version !== "delivery_package_manifest_v1") issues.push("version is invalid");
  for (const field of ["id", "projectId", "timelineId", "renderJobId", "exportMasterId", "mediaId", "checksum", "createdAt"]) if (typeof value?.[field] !== "string" || !value[field].trim()) issues.push(`${field} is required`);
  if (!DELIVERY_PACKAGE_KINDS.includes(value?.kind)) issues.push("kind is invalid");
  if (!DELIVERY_PACKAGE_STATES.includes(value?.status)) issues.push("status is invalid");
  if (!Array.isArray(value?.deliverables) || !value.deliverables.length || value.deliverables.some((item) => typeof item?.role !== "string" || typeof item?.pathOrMediaId !== "string")) issues.push("deliverables are required");
  if (!value?.qualityControl || !TECHNICAL_QC_STATES.includes(value.qualityControl.status)) issues.push("qualityControl is invalid");
  if (!value?.lineage || typeof value.lineage !== "object" || Array.isArray(value.lineage)) issues.push("lineage is required");
  if (issues.length) throw Object.assign(new Error(`DeliveryPackageManifestV1 validation failed: ${issues.join("; ")}`), { code: "invalid_delivery_package", status: 500 });
  return value;
}
