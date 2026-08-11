import {
  CINEMATIC_SEGMENT_DECISIONS,
  VIDEO_MODEL_CAPABILITIES,
  VIDEO_MODEL_REGISTRY_VERSION,
  UnuTvError
} from "@ununu/unutv-contracts";
import { assessCinematicAssetReadiness } from "../cinematic-asset-readiness-policy.mjs";

export function requireCinematicProductionPort(ports, method) {
  if (typeof ports.projects?.[method] !== "function") {
    throw new TypeError(`Missing cinematic production port: projects.${method}`);
  }
  return ports.projects[method].bind(ports.projects);
}

export function requireCinematicRevision(value, fallback = 1) {
  const revision = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(revision) || revision < 1) {
    throw new UnuTvError("invalid_payload", "revision must be a positive integer");
  }
  return revision;
}

export function assertCinematicSegmentDecision(value) {
  if (CINEMATIC_SEGMENT_DECISIONS.includes(value)) return;
  throw new UnuTvError(
    "segment_decision_required",
    `generationUnit.segmentDecision 必须显式是：${CINEMATIC_SEGMENT_DECISIONS.join("、")}；Core 不得按 strategy 静默推断。`,
    400,
    { allowed: CINEMATIC_SEGMENT_DECISIONS, path: "generationUnit.segmentDecision", value: value ?? null }
  );
}

export function createRequireCinematicProduction(getProductionRecord) {
  return async function requireProduction(projectId, productionId) {
    const production = await getProductionRecord(projectId, productionId);
    if (!production) {
      throw new UnuTvError(
        "cinematic_production_not_found",
        `Cinematic production not found: ${productionId}`,
        404
      );
    }
    return production;
  };
}

export async function getCinematicModelCapabilities() {
  return {
    registryVersion: VIDEO_MODEL_REGISTRY_VERSION,
    models: VIDEO_MODEL_CAPABILITIES
  };
}

export function assessCharacterIdentityMediaAuthority({
  assets,
  assetAuthorities,
  characterAuthorityIds,
  mediaRecords,
  reviews
}) {
  if (!characterAuthorityIds.length) {
    return { acceptedAuthorityIds: [], errors: [], formalBindings: [], ok: true };
  }
  return assessCinematicAssetReadiness({
    assets,
    authorities: assetAuthorities.filter((authority) => characterAuthorityIds.includes(authority.authorityId)),
    mediaRecords,
    reviews
  });
}

export async function loadCurrentAssetMediaRecords({ assets, getMedia, projectId }) {
  if (typeof getMedia !== "function") return [];
  const mediaIds = [...new Set((Array.isArray(assets) ? assets : []).flatMap((asset) => {
    const version = (Array.isArray(asset?.versions) ? asset.versions : [])
      .find((entry) => entry.id === asset?.currentVersionId);
    return version?.mediaId ? [version.mediaId] : [];
  }))];
  const records = await Promise.all(mediaIds.map((mediaId) => getMedia(projectId, mediaId)));
  return records.filter(Boolean);
}

export function applyCinematicCompilationAudits(envelope, {
  canvasGraphAudit,
  characterIdentityMediaAuthorityAudit,
  sceneAuthorityAudit,
  referenceSetAudit,
  requireCanvasGraph
}) {
  const baseOk = envelope.preflight?.ok !== false;
  const errors = [...(Array.isArray(envelope.preflight?.errors) ? envelope.preflight.errors : [])];
  if (!referenceSetAudit.ok) errors.push(...referenceSetAudit.errors);
  if (!characterIdentityMediaAuthorityAudit.ok) {
    errors.push({
      code: "character_identity_media_authority_required",
      message: "正式人物视频必须绑定当前 Authority revision 的真实身份媒体、checksum 与 Owner 全画面逐像素验收证据。",
      details: characterIdentityMediaAuthorityAudit.errors
    });
  }
  if (sceneAuthorityAudit && !sceneAuthorityAudit.ok) {
    errors.push({
      code: "scene_authority_topology_required",
      message: "同场后续镜头必须绑定当前场景 Authority、拓扑 revision、真实媒体/checksum 与唯一可见 typed edge。",
      details: sceneAuthorityAudit.errors
    });
  }
  if (requireCanvasGraph && !canvasGraphAudit.ok) errors.push(...canvasGraphAudit.errors);
  envelope.preflight = { ...envelope.preflight, errors, ok: baseOk && errors.length === 0 };
  if (envelope.promptDraft) {
    envelope.promptDraft.status = envelope.lint?.ok !== false && envelope.preflight.ok
      ? "preflight_ready"
      : "preflight_blocked";
  }
}
