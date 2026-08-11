import {
  OWNER_CHARACTER_APPEARANCE_CHECKS,
  OWNER_PIXEL_IDENTITY_CHECKS,
  VIRTUAL_PERSON_ASSET_ID_PATTERN,
  validateOwnerCharacterAppearanceReviewEvidence,
  validateOwnerPixelReviewEvidence
} from "@ununu/unutv-contracts";

const IDENTITY_PROVENANCE_SOURCES = new Set([
  "owner_uploaded_identity",
  "owner_virtual_person_asset",
  "verified_identity_derivative"
]);
const APPEARANCE_PROVENANCE_SOURCES = new Set([
  "deterministic_appearance_generation",
  "owner_uploaded_appearance",
  "verified_appearance_derivative"
]);

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function integer(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function push(errors, code, message, details = {}) {
  errors.push({ code, message, ...details });
}

function externalIdentity(authority) {
  const value = authority?.externalProviderIdentity;
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function sameOrderedValues(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function cinematicCharacterIdentitySourceVersions(bindings = []) {
  return list(bindings).map((binding) => ({
    authorityId: text(binding?.authorityId),
    authorityRevision: integer(binding?.authorityRevision),
    provider: text(binding?.provider),
    source: text(binding?.source),
    virtualPersonAssetId: text(binding?.virtualPersonAssetId)
  }));
}

export function orderedCharacterAuthorityIdsForShots({
  authorities = [],
  shots = []
} = {}) {
  const characterAuthorities = list(authorities)
    .filter((authority) => authority?.authorityType === "character")
    .filter((authority) => text(authority?.authorityId));
  const characterIds = new Set(characterAuthorities.map((authority) => text(authority.authorityId)));
  const ordered = [];
  for (const shot of list(shots)) {
    let declared = Array.isArray(shot?.characterAuthorityIds) && shot.characterAuthorityIds.length
      ? shot.characterAuthorityIds
      : list(shot?.requiredAssetIds).filter((authorityId) => characterIds.has(text(authorityId)));
    if (!declared.length) {
      const shotText = JSON.stringify(shot ?? {});
      const named = characterAuthorities
        .map((authority, authorityOrder) => ({
          authorityId: text(authority.authorityId),
          authorityOrder,
          index: shotText.indexOf(text(authority.displayName))
        }))
        .filter((entry) => entry.index >= 0)
        .sort((left, right) => left.index - right.index || left.authorityOrder - right.authorityOrder);
      const collectiveCast = /八人|所有人|众人|其余[一二三四五六七八九十\d]+人/u.test(shotText);
      declared = [
        ...named.map((entry) => entry.authorityId),
        ...(collectiveCast
          ? characterAuthorities
              .map((authority) => text(authority.authorityId))
              .filter((authorityId) => !named.some((entry) => entry.authorityId === authorityId))
          : [])
      ];
    }
    for (const authorityId of declared.map(text).filter(Boolean)) {
      if (!ordered.includes(authorityId)) ordered.push(authorityId);
    }
  }
  return ordered;
}

function validateAuthorityIdentity(authority, errors, details = {}) {
  const authorityId = text(authority?.authorityId);
  if (!authority || authority.authorityType !== "character") {
    push(errors, "character_identity_authority_required", "出场人物必须绑定角色 Authority。", details);
    return null;
  }
  if (authority.status !== "accepted") {
    push(errors, "character_identity_authority_not_accepted", `${authority.displayName || authorityId} 的角色 Authority 尚未接受。`, {
      ...details,
      authorityId
    });
  }
  if (!integer(authority.revision)) {
    push(errors, "character_identity_authority_revision_required", `${authority.displayName || authorityId} 缺少有效 Authority revision。`, {
      ...details,
      authorityId
    });
  }
  const identity = externalIdentity(authority);
  const virtualPersonAssetId = text(identity?.assetId);
  if (
    !identity
    || text(identity.provider) !== "ark"
    || text(identity.capability) !== "virtual_person_asset"
    || !VIRTUAL_PERSON_ASSET_ID_PATTERN.test(virtualPersonAssetId)
    || !text(identity.source)
  ) {
    push(errors, "character_virtual_person_authority_required", `${authority.displayName || authorityId} 缺少完整、可追溯的虚拟人物身份绑定。`, {
      ...details,
      authorityId
    });
    return null;
  }
  return {
    authorityId,
    authorityRevision: integer(authority.revision),
    displayName: text(authority.displayName),
    provider: "ark",
    source: text(identity.source),
    virtualPersonAssetId
  };
}

export function deriveCinematicCharacterIdentityBindings({
  authorities = [],
  characterAuthorityIds = []
} = {}) {
  const errors = [];
  const requestedIds = list(characterAuthorityIds).map(text).filter(Boolean);
  const authorityById = new Map(list(authorities).map((authority) => [text(authority?.authorityId), authority]));
  const duplicateRequested = requestedIds.filter((authorityId, index) => requestedIds.indexOf(authorityId) !== index);
  for (const authorityId of [...new Set(duplicateRequested)]) {
    push(errors, "character_appearance_duplicate", "同一镜头的出场角色 Authority 只能声明一次。", { authorityId });
  }

  const acceptedIdentityOwners = new Map();
  for (const authority of list(authorities).filter((entry) => entry?.authorityType === "character" && entry?.status === "accepted")) {
    const virtualPersonAssetId = text(externalIdentity(authority)?.assetId);
    if (!virtualPersonAssetId) continue;
    const owner = acceptedIdentityOwners.get(virtualPersonAssetId);
    if (owner && owner !== authority.authorityId) {
      push(errors, "character_virtual_person_identity_reused", "一个虚拟人物 ID 不能同时绑定多个已接受角色 Authority。", {
        authorityIds: [owner, authority.authorityId],
        virtualPersonAssetId
      });
    } else {
      acceptedIdentityOwners.set(virtualPersonAssetId, authority.authorityId);
    }
  }

  const bindings = [];
  for (const [appearanceIndex, authorityId] of requestedIds.entries()) {
    const authority = authorityById.get(authorityId);
    const binding = validateAuthorityIdentity(authority, errors, { appearanceIndex, authorityId });
    if (binding) bindings.push(binding);
  }
  return {
    bindings,
    errors,
    ok: errors.length === 0,
    virtualPersonAssetIds: bindings.map((binding) => binding.virtualPersonAssetId)
  };
}

export function assessGenerationUnitCharacterIdentityBindings({
  authorities = [],
  characterAuthorityIds = [],
  generationUnit
} = {}) {
  const derived = deriveCinematicCharacterIdentityBindings({ authorities, characterAuthorityIds });
  const errors = [...derived.errors];
  const actualCharacterAuthorityIds = list(generationUnit?.characterAuthorityIds).map(text).filter(Boolean);
  const expectedCharacterAuthorityIds = list(characterAuthorityIds).map(text).filter(Boolean);
  if (!sameOrderedValues(actualCharacterAuthorityIds, expectedCharacterAuthorityIds)) {
    push(errors, "generation_unit_character_authority_order_mismatch", "GenerationUnit.characterAuthorityIds 必须按镜头出场顺序从 Shot 自动派生，禁止漏填、换序或夹带其他 Authority。", {
      actualCharacterAuthorityIds,
      expectedCharacterAuthorityIds
    });
  }
  const actual = list(generationUnit?.generationParameters?.virtualPersonAssetIds).map(text).filter(Boolean);
  const expected = derived.virtualPersonAssetIds;
  if (actual.length !== expected.length || actual.some((assetId, index) => assetId !== expected[index])) {
    push(errors, "generation_unit_virtual_person_binding_mismatch", "GenerationUnit 的虚拟人物 ID 必须按出场角色顺序从当前 Authority 自动派生，禁止手填、漏填、换序或夹带其他 ID。", {
      actualVirtualPersonAssetIds: actual,
      expectedVirtualPersonAssetIds: expected
    });
  }
  const requiresCapability = list(generationUnit?.requiredCapabilities).includes("virtual_person_asset");
  if (expected.length && !requiresCapability) {
    push(errors, "generation_unit_virtual_person_capability_required", "包含已绑定虚拟人物的镜头必须声明 virtual_person_asset 能力。");
  }
  if (!expected.length && actual.length) {
    push(errors, "generation_unit_virtual_person_binding_unexpected", "没有已声明出场角色的 GenerationUnit 不得携带虚拟人物 ID。", {
      actualVirtualPersonAssetIds: actual
    });
  }
  const actualSourceVersions = cinematicCharacterIdentitySourceVersions(generationUnit?.characterIdentitySourceVersions);
  const expectedSourceVersions = cinematicCharacterIdentitySourceVersions(derived.bindings);
  if (JSON.stringify(actualSourceVersions) !== JSON.stringify(expectedSourceVersions)) {
    push(errors, "generation_unit_character_identity_source_versions_mismatch", "GenerationUnit 的人物身份 sourceVersions 必须与当前 Authority revision 和虚拟人物 ID 精确一致。", {
      actualSourceVersions,
      expectedSourceVersions
    });
  }
  return {
    bindings: derived.bindings,
    errors,
    ok: errors.length === 0,
    sourceVersions: expectedSourceVersions,
    virtualPersonAssetIds: expected
  };
}

export function assessCharacterIdentityAuthorityMedia({
  asset,
  authority,
  media,
  review
} = {}) {
  const errors = [];
  const authorityId = text(authority?.authorityId);
  const currentVersion = list(asset?.versions).find((entry) => text(entry?.id) === text(asset?.currentVersionId)) ?? null;
  const provenance = currentVersion?.payload?.identityProvenance;
  const identity = validateAuthorityIdentity(authority, errors, { authorityId });
  if (!currentVersion?.mediaId) {
    push(errors, "character_identity_media_required", "角色身份权威必须指向当前真实媒体。", {
      assetId: asset?.id ?? null,
      authorityId
    });
  }
  if (!provenance || typeof provenance !== "object" || Array.isArray(provenance)) {
    push(errors, "character_identity_provenance_required", "没有 identityProvenance 的角色图只能作为未放行 look-dev，不能作为身份权威或正式视频一致性证据。", {
      assetId: asset?.id ?? null,
      authorityId,
      classification: "look_development"
    });
  } else {
    if (text(provenance.role) !== "identity_authority") {
      push(errors, "character_identity_provenance_role_invalid", "角色身份媒体必须声明 role=identity_authority。", {
        assetId: asset?.id ?? null,
        authorityId
      });
    }
    if (!IDENTITY_PROVENANCE_SOURCES.has(provenance.sourceType)) {
      push(errors, "character_identity_provenance_source_invalid", "角色身份媒体来源必须是 Owner 身份源或已验证的身份派生。", {
        assetId: asset?.id ?? null,
        authorityId
      });
    }
    if (text(provenance.characterAuthorityId) !== authorityId) {
      push(errors, "character_identity_provenance_authority_mismatch", "角色身份媒体绑定了错误的角色 Authority。", {
        assetId: asset?.id ?? null,
        authorityId
      });
    }
    if (integer(provenance.authorityRevision) !== integer(authority?.revision)) {
      push(errors, "character_identity_provenance_revision_stale", "角色身份媒体没有绑定当前角色 Authority revision。", {
        actualAuthorityRevision: integer(provenance.authorityRevision),
        assetId: asset?.id ?? null,
        authorityId,
        expectedAuthorityRevision: integer(authority?.revision)
      });
    }
    if (identity && text(provenance.virtualPersonAssetId) !== identity.virtualPersonAssetId) {
      push(errors, "character_identity_provenance_virtual_person_mismatch", "角色身份媒体的虚拟人物来源与当前 Authority 不一致。", {
        actualVirtualPersonAssetId: text(provenance.virtualPersonAssetId),
        assetId: asset?.id ?? null,
        authorityId,
        expectedVirtualPersonAssetId: identity.virtualPersonAssetId
      });
    }
    if (!text(provenance.verificationReviewId) || text(provenance.verificationReviewId) !== text(review?.id)) {
      push(errors, "character_identity_provenance_review_mismatch", "角色身份来源必须绑定当前逐像素接受记录。", {
        assetId: asset?.id ?? null,
        authorityId,
        expectedReviewId: review?.id ?? null
      });
    }
    if (!text(provenance.mediaChecksum)) {
      push(errors, "character_identity_provenance_checksum_required", "角色身份来源必须绑定当前媒体 checksum。", {
        assetId: asset?.id ?? null,
        authorityId
      });
    }
  }
  if (review?.state !== "accepted") {
    push(errors, "character_identity_owner_pixel_acceptance_required", "角色身份媒体必须由最新 Owner 结构化逐像素 ACCEPT。", {
      assetId: asset?.id ?? null,
      authorityId,
      reviewState: review?.state ?? null
    });
  }
  const evidenceAudit = validateOwnerPixelReviewEvidence(review?.evidence, { state: review?.state });
  if (!evidenceAudit.ok) {
    push(errors, "character_identity_owner_pixel_evidence_invalid", "角色身份媒体缺少完整的 Owner 全画面逐像素结构化证据。", {
      assetId: asset?.id ?? null,
      authorityId,
      issues: evidenceAudit.issues
    });
  } else {
    const evidence = review.evidence;
    const expectedChecksum = text(media?.sha256) || text(provenance?.mediaChecksum);
    const mismatches = [];
    if (review?.targetType !== "media" || text(review?.targetId) !== text(currentVersion?.mediaId)) mismatches.push("review_target");
    if (text(evidence.targetMediaId) !== text(currentVersion?.mediaId)) mismatches.push("target_media_id");
    if (!expectedChecksum || text(evidence.targetMediaChecksum) !== expectedChecksum) mismatches.push("target_media_checksum");
    if (text(provenance?.mediaChecksum) !== text(evidence.targetMediaChecksum)) mismatches.push("provenance_media_checksum");
    if (text(evidence.assetId) !== text(asset?.id)) mismatches.push("asset_id");
    if (text(evidence.mediaRevisionId) !== text(currentVersion?.id)) mismatches.push("media_revision_id");
    if (text(evidence.characterAuthorityId) !== authorityId) mismatches.push("character_authority_id");
    if (integer(evidence.authorityRevision) !== integer(authority?.revision)) mismatches.push("authority_revision");
    if (OWNER_PIXEL_IDENTITY_CHECKS.some((check) => evidence.checks?.[check] !== "pass")) mismatches.push("pixel_checks");
    if (mismatches.length) {
      push(errors, "character_identity_owner_pixel_evidence_mismatch", "Owner 逐像素证据与当前 Authority、资产版本或媒体 checksum 不一致。", {
        assetId: asset?.id ?? null,
        authorityId,
        mismatches
      });
    }
  }
  return {
    classification: errors.length ? "look_development" : "identity_authority",
    errors,
    mediaId: currentVersion?.mediaId ?? null,
    ok: errors.length === 0,
    usableForFormalVideoContinuity: errors.length === 0
  };
}

export function assessCharacterAppearanceAuthorityMedia({
  asset,
  authority,
  media,
  review
} = {}) {
  const errors = [];
  const authorityId = text(authority?.authorityId);
  const currentVersion = list(asset?.versions).find((entry) => text(entry?.id) === text(asset?.currentVersionId)) ?? null;
  const provenance = currentVersion?.payload?.appearanceProvenance;
  const identity = validateAuthorityIdentity(authority, errors, { authorityId });
  if (!currentVersion?.mediaId) {
    push(errors, "character_appearance_media_required", "角色造型权威必须指向当前真实媒体。", {
      assetId: asset?.id ?? null,
      authorityId
    });
  }
  if (!provenance || typeof provenance !== "object" || Array.isArray(provenance)) {
    push(errors, "character_appearance_provenance_required", "外部虚拟人物身份必须搭配有真实来源的当前造型板；普通旧图不能自动升级。", {
      assetId: asset?.id ?? null,
      authorityId,
      classification: "look_development"
    });
  } else {
    if (text(provenance.role) !== "appearance_authority") {
      push(errors, "character_appearance_provenance_role_invalid", "角色造型媒体必须声明 role=appearance_authority。", {
        assetId: asset?.id ?? null,
        authorityId
      });
    }
    if (!APPEARANCE_PROVENANCE_SOURCES.has(provenance.sourceType)) {
      push(errors, "character_appearance_provenance_source_invalid", "角色造型媒体必须声明真实生成、上传或已验证派生来源。", {
        assetId: asset?.id ?? null,
        authorityId
      });
    }
    if (text(provenance.faceIdentityDuty) !== "external_virtual_person_asset") {
      push(errors, "character_appearance_face_duty_invalid", "造型板不得冒充脸部身份；面孔职责必须交给 external_virtual_person_asset。", {
        assetId: asset?.id ?? null,
        authorityId
      });
    }
    if (text(provenance.characterAuthorityId) !== authorityId) {
      push(errors, "character_appearance_provenance_authority_mismatch", "角色造型媒体绑定了错误的角色 Authority。", {
        assetId: asset?.id ?? null,
        authorityId
      });
    }
    if (integer(provenance.authorityRevision) !== integer(authority?.revision)) {
      push(errors, "character_appearance_provenance_revision_stale", "角色造型媒体没有绑定当前角色 Authority revision。", {
        actualAuthorityRevision: integer(provenance.authorityRevision),
        assetId: asset?.id ?? null,
        authorityId,
        expectedAuthorityRevision: integer(authority?.revision)
      });
    }
    if (identity && text(provenance.virtualPersonAssetId) !== identity.virtualPersonAssetId) {
      push(errors, "character_appearance_virtual_person_mismatch", "造型板声明的脸部身份职责与当前虚拟人物 Authority 不一致。", {
        actualVirtualPersonAssetId: text(provenance.virtualPersonAssetId),
        assetId: asset?.id ?? null,
        authorityId,
        expectedVirtualPersonAssetId: identity.virtualPersonAssetId
      });
    }
    if (!text(provenance.verificationReviewId) || text(provenance.verificationReviewId) !== text(review?.id)) {
      push(errors, "character_appearance_provenance_review_mismatch", "角色造型来源必须绑定当前 Owner 全画面接受记录。", {
        assetId: asset?.id ?? null,
        authorityId,
        expectedReviewId: review?.id ?? null
      });
    }
    if (!text(provenance.mediaChecksum)) {
      push(errors, "character_appearance_provenance_checksum_required", "角色造型来源必须绑定当前媒体 checksum。", {
        assetId: asset?.id ?? null,
        authorityId
      });
    }
  }
  if (review?.state !== "accepted") {
    push(errors, "character_appearance_owner_pixel_acceptance_required", "角色造型板必须由最新 Owner 结构化全画面 ACCEPT。", {
      assetId: asset?.id ?? null,
      authorityId,
      reviewState: review?.state ?? null
    });
  }
  const evidenceAudit = validateOwnerCharacterAppearanceReviewEvidence(review?.evidence, { state: review?.state });
  if (!evidenceAudit.ok) {
    push(errors, "character_appearance_owner_pixel_evidence_invalid", "角色造型板缺少完整的 Owner 全画面结构化证据。", {
      assetId: asset?.id ?? null,
      authorityId,
      issues: evidenceAudit.issues
    });
  } else {
    const evidence = review.evidence;
    const expectedChecksum = text(media?.sha256) || text(provenance?.mediaChecksum);
    const mismatches = [];
    if (review?.targetType !== "media" || text(review?.targetId) !== text(currentVersion?.mediaId)) mismatches.push("review_target");
    if (text(evidence.targetMediaId) !== text(currentVersion?.mediaId)) mismatches.push("target_media_id");
    if (!expectedChecksum || text(evidence.targetMediaChecksum) !== expectedChecksum) mismatches.push("target_media_checksum");
    if (text(provenance?.mediaChecksum) !== text(evidence.targetMediaChecksum)) mismatches.push("provenance_media_checksum");
    if (text(evidence.assetId) !== text(asset?.id)) mismatches.push("asset_id");
    if (text(evidence.mediaRevisionId) !== text(currentVersion?.id)) mismatches.push("media_revision_id");
    if (text(evidence.characterAuthorityId) !== authorityId) mismatches.push("character_authority_id");
    if (integer(evidence.authorityRevision) !== integer(authority?.revision)) mismatches.push("authority_revision");
    if (text(evidence.virtualPersonAssetId) !== identity?.virtualPersonAssetId) mismatches.push("virtual_person_asset_id");
    if (OWNER_CHARACTER_APPEARANCE_CHECKS.some((check) => evidence.checks?.[check] !== "pass")) mismatches.push("appearance_checks");
    if (mismatches.length) {
      push(errors, "character_appearance_owner_pixel_evidence_mismatch", "Owner 造型证据与当前 Authority、资产版本、媒体 checksum 或虚拟人物职责不一致。", {
        assetId: asset?.id ?? null,
        authorityId,
        mismatches
      });
    }
  }
  return {
    appearanceMediaId: currentVersion?.mediaId ?? null,
    classification: errors.length ? "look_development" : "appearance_authority_with_external_identity",
    errors,
    identityBinding: identity,
    mediaId: currentVersion?.mediaId ?? null,
    ok: errors.length === 0,
    usableForFormalVideoContinuity: errors.length === 0
  };
}

export function assessCharacterFormalAuthorityMedia(input = {}) {
  const currentVersion = list(input.asset?.versions)
    .find((entry) => text(entry?.id) === text(input.asset?.currentVersionId)) ?? null;
  if (currentVersion?.payload?.appearanceProvenance) {
    return assessCharacterAppearanceAuthorityMedia(input);
  }
  return assessCharacterIdentityAuthorityMedia(input);
}
