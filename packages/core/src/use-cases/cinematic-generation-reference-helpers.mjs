import {
  UnuTvError,
  storyboardVideoReferenceSemanticControl
} from "@ununu/unutv-contracts";
import {
  assessGenerationUnitCharacterIdentityBindings,
  cinematicCharacterIdentitySourceVersions,
  deriveCinematicCharacterIdentityBindings,
  orderedCharacterAuthorityIdsForShots
} from "../cinematic-character-identity-policy.mjs";
import { selectProviderReferenceBindings } from "./cinematic-compilation-context.mjs";

function sameOrderedJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function throwIdentityPolicy(errors, fallbackCode = "character_identity_binding_invalid") {
  const first = errors[0] ?? {};
  throw new UnuTvError(
    first.code || fallbackCode,
    first.message || "角色身份 Authority 绑定未通过。",
    409,
    { errors }
  );
}

export function deriveIdentityForShots(authorities, shots) {
  const characterAuthorityIds = orderedCharacterAuthorityIdsForShots({ authorities, shots });
  const derived = deriveCinematicCharacterIdentityBindings({ authorities, characterAuthorityIds });
  if (!derived.ok) throwIdentityPolicy(derived.errors);
  return {
    ...derived,
    characterAuthorityIds,
    sourceVersions: cinematicCharacterIdentitySourceVersions(derived.bindings)
  };
}

export function deriveShotIdentityForSave(authorities, shots) {
  const characterAuthorityIds = orderedCharacterAuthorityIdsForShots({ authorities, shots });
  const authorityById = new Map(authorities.map((authority) => [authority?.authorityId, authority]));
  const errors = characterAuthorityIds
    .filter((authorityId) => authorityById.get(authorityId)?.authorityType !== "character")
    .map((authorityId) => ({
      code: "character_identity_authority_required",
      message: "Shot 出场人物必须绑定现有角色 Authority。",
      authorityId
    }));
  if (errors.length) throwIdentityPolicy(errors);
  const acceptedCharacterAuthorityIds = characterAuthorityIds.filter(
    (authorityId) => authorityById.get(authorityId)?.status === "accepted"
  );
  const derived = deriveCinematicCharacterIdentityBindings({
    authorities,
    characterAuthorityIds: acceptedCharacterAuthorityIds
  });
  if (!derived.ok) throwIdentityPolicy(derived.errors);
  return {
    ...derived,
    characterAuthorityIds,
    sourceVersions: cinematicCharacterIdentitySourceVersions(derived.bindings)
  };
}

export function assertShotIdentityInput(shotInput, identity) {
  if (
    shotInput.characterIdentitySourceVersions !== undefined
    && !sameOrderedJson(shotInput.characterIdentitySourceVersions, identity.sourceVersions)
  ) {
    throwIdentityPolicy([{
      code: "shot_character_identity_source_versions_mismatch",
      message: "Shot 的人物身份 sourceVersions 必须从当前 Authority 自动派生，禁止手填旧 revision 或不同虚拟人物 ID。",
      actualSourceVersions: shotInput.characterIdentitySourceVersions,
      expectedSourceVersions: identity.sourceVersions
    }]);
  }
  if (
    shotInput.virtualPersonAssetIds !== undefined
    && !sameOrderedJson(shotInput.virtualPersonAssetIds, identity.virtualPersonAssetIds)
  ) {
    throwIdentityPolicy([{
      code: "shot_virtual_person_binding_mismatch",
      message: "Shot 的虚拟人物 ID 必须按出场角色顺序从当前 Authority 自动派生。",
      actualVirtualPersonAssetIds: shotInput.virtualPersonAssetIds,
      expectedVirtualPersonAssetIds: identity.virtualPersonAssetIds
    }]);
  }
}

export function deriveGenerationUnitIdentity({ authorities, productionShots, unitInput }) {
  const shotsById = new Map(productionShots.map((shot) => [shot.shotId, shot]));
  const shotLinks = Array.isArray(unitInput.shotLinks) ? unitInput.shotLinks : [];
  const linkedShots = shotLinks.map((link) => shotsById.get(link.shotId)).filter(Boolean);
  const missingShot = shotLinks.find((link) => !shotsById.has(link.shotId));
  if (missingShot) {
    throw new UnuTvError(
      "cinematic_shot_not_found",
      `Generation unit references a shot outside this production: ${missingShot.shotId}`,
      400
    );
  }
  const identity = deriveIdentityForShots(authorities, linkedShots);
  const suppliedCharacterIds = unitInput.characterAuthorityIds;
  const suppliedSourceVersions = unitInput.characterIdentitySourceVersions;
  const suppliedVirtualIds = unitInput.generationParameters?.virtualPersonAssetIds;
  if (
    suppliedCharacterIds !== undefined
    && !sameOrderedJson(suppliedCharacterIds, identity.characterAuthorityIds)
  ) {
    throwIdentityPolicy([{
      code: "generation_unit_character_authority_order_mismatch",
      message: "GenerationUnit.characterAuthorityIds 必须按 linked Shot 的出场顺序自动派生。",
      actualCharacterAuthorityIds: suppliedCharacterIds,
      expectedCharacterAuthorityIds: identity.characterAuthorityIds
    }]);
  }
  if (
    suppliedSourceVersions !== undefined
    && !sameOrderedJson(suppliedSourceVersions, identity.sourceVersions)
  ) {
    throwIdentityPolicy([{
      code: "generation_unit_character_identity_source_versions_mismatch",
      message: "GenerationUnit 的人物身份 sourceVersions 与当前 Authority 不一致。",
      actualSourceVersions: suppliedSourceVersions,
      expectedSourceVersions: identity.sourceVersions
    }]);
  }
  if (
    suppliedVirtualIds !== undefined
    && !sameOrderedJson(suppliedVirtualIds, identity.virtualPersonAssetIds)
  ) {
    throwIdentityPolicy([{
      code: "generation_unit_virtual_person_binding_mismatch",
      message: "GenerationUnit 的虚拟人物 ID 必须按出场角色顺序从当前 Authority 自动派生。",
      actualVirtualPersonAssetIds: suppliedVirtualIds,
      expectedVirtualPersonAssetIds: identity.virtualPersonAssetIds
    }]);
  }
  return identity;
}

export function assertGenerationUnitIdentity({ authorities, generationUnit, identity }) {
  const audit = assessGenerationUnitCharacterIdentityBindings({
    authorities,
    characterAuthorityIds: identity.characterAuthorityIds,
    generationUnit
  });
  if (!audit.ok) throwIdentityPolicy(audit.errors);
}

export async function buildGenerationUnitReferences({
  generationUnit,
  listStoryboardRecords,
  productionId,
  projectId,
  referenceBindings,
  shots
}) {
  const unitShotIds = new Set(generationUnit.shotLinks.map((link) => link.shotId));
  const storyboardReferences = (await listStoryboardRecords(projectId, productionId))
    .flatMap((storyboard) => storyboard.shots
      .filter((shot) => (
        unitShotIds.has(shot.shotId)
        && shot.videoReference?.selected
        && shot.imageMediaId
      ))
      .map((shot) => ({
        assetId: `storyboard:${storyboard.storyboardId}:${shot.shotId}`,
        versionId: shot.imageVersionId || `storyboard-image:${shot.imageChecksum || shot.imageMediaId}`,
        mediaId: shot.imageMediaId,
        displayName: shot.title,
        role: shot.videoReference.role,
        controls: shot.videoReference.controls,
        doesNotControl: shot.videoReference.doesNotControl,
        semanticControl: storyboardVideoReferenceSemanticControl(shot.videoReference),
        required: true,
        authorityRevision: `storyboard-r${storyboard.revision}:shot-r${shot.revision}`,
        storyboardId: storyboard.storyboardId,
        storyboardRevision: storyboard.revision,
        storyboardShotId: shot.storyboardShotId,
        storyboardShotRevision: shot.revision,
        shotId: shot.shotId,
        checksum: shot.imageChecksum,
        acceptanceProof: shot.videoReference.acceptanceProof ?? null
      })));
  const directorReferences = shots
    .filter((shot) => shot.directorStageBinding?.mediaId)
    .map((shot) => {
      const binding = shot.directorStageBinding;
      return {
        assetId: `director-stage:${binding.directorNodeId}:${binding.captureId}`,
        versionId: `director-stage-v${binding.stageRevision}:${binding.mediaId}`,
        mediaId: binding.mediaId,
        displayName: `3D导演台机位 · ${binding.cameraSnapshot?.label || binding.cameraId}`,
        promptAlias: `${binding.cameraSnapshot?.label || binding.cameraId}机位`,
        role: "director_stage_blocking",
        controls: ["空间站位", "人物前后层级", "摄影机机位", "画面轴线", "视场与构图"],
        doesNotControl: ["人物身份", "最终美术风格", "最终灯光", "最终表演节奏"],
        providerEligible: false,
        required: true,
        semanticControl: {
          temporalRole: "static_state",
          preserve: ["空间站位", "人物前后层级", "摄影机机位", "画面轴线", "视场与构图"],
          replace: [],
          complete: [],
          ignore: ["代理人物造型", "最终美术风格", "最终灯光", "最终表演节奏"],
          styleOnly: []
        },
        authorityRevision: `director-stage-v${binding.stageRevision}`,
        directorNodeId: binding.directorNodeId,
        captureId: binding.captureId,
        stageRevision: binding.stageRevision,
        shotId: shot.shotId
      };
    });
  const allCandidates = [...referenceBindings, ...directorReferences, ...storyboardReferences];
  const providerCandidates = selectProviderReferenceBindings(
    generationUnit.generationParameters,
    allCandidates
  );
  const candidates = [
    ...providerCandidates,
    ...allCandidates.filter((binding) => binding.providerEligible === false)
  ];
  const combinedReferences = [];
  const seenMedia = new Set();
  for (const binding of candidates) {
    if (seenMedia.has(binding.mediaId)) continue;
    seenMedia.add(binding.mediaId);
    combinedReferences.push({ ...binding, providerIndex: combinedReferences.length + 1 });
  }
  return { combinedReferences, directorReferences, storyboardReferences };
}
