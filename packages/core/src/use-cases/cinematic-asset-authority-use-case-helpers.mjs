import { UnuTvError, requireText } from "@ununu/unutv-contracts";

export function requireCinematicAssetAuthorityPort(ports, name) {
  if (typeof ports.projects?.[name] !== "function") {
    throw new TypeError(`Missing cinematic asset authority port: projects.${name}`);
  }
  return ports.projects[name].bind(ports.projects);
}

export function requireCinematicAssetAuthorityExecutionDependencies(dependencies) {
  for (const name of [
    "addAssetVersion", "listAssets", "prepareMedia", "runNode", "updateNode"
  ]) {
    if (typeof dependencies?.[name] !== "function") {
      throw new TypeError(`Missing asset authority execution dependency: ${name}`);
    }
  }
  return dependencies;
}

export async function resolveCinematicAssetAuthorityExecutionTarget({
  authority,
  assetNodeId,
  getNode,
  inputAssetId,
  listAssets,
  projectId
}) {
  const assetId = requireText(inputAssetId ?? authority.referenceAssetIds?.[0], "assetId");
  if (!(authority.referenceAssetIds ?? []).includes(assetId)) {
    throw new UnuTvError("authority_asset_mismatch", "Target asset must be registered on the asset authority", 409);
  }
  const assetNode = await getNode(projectId, requireText(assetNodeId, "assetNodeId"));
  if (
    !assetNode
    || assetNode.kind !== "asset"
    || assetNode.payload?.assetId !== assetId
    || assetNode.payload?.authorityId !== authority.authorityId
  ) {
    throw new UnuTvError("authority_asset_node_invalid", "Asset authority generation must run on the matching visible asset node", 409);
  }
  const asset = (await listAssets({ projectId, scope: "all" })).find((entry) => entry.id === assetId);
  if (!asset) throw new UnuTvError("asset_not_found", `Asset not found: ${assetId}`, 404);
  return { asset, assetId, assetNode };
}

export function requireCurrentCinematicAuthorityImageCompilation({ authority, compilation, visualBible }) {
  if (!compilation) {
    throw new UnuTvError("image_prompt_compilation_required", "Compile the current asset authority before Provider execution", 409);
  }
  const envelope = compilation.envelope;
  if (Number(envelope?.sourceVersions?.targetRevision) !== authority.revision) {
    throw new UnuTvError("stale_image_prompt_compilation", "Asset authority changed after image Prompt compilation", 409, {
      authorityRevision: authority.revision,
      compiledRevision: envelope?.sourceVersions?.targetRevision
    });
  }
  if (
    envelope?.sourceVersions?.visualBibleRevision !== undefined
    && Number(envelope.sourceVersions.visualBibleRevision) !== Number(visualBible?.revision)
  ) {
    throw new UnuTvError("stale_image_prompt_compilation", "VisualBible changed after image Prompt compilation", 409, {
      visualBibleRevision: visualBible?.revision ?? null,
      compiledVisualBibleRevision: envelope.sourceVersions.visualBibleRevision
    });
  }
  if (envelope?.lint?.ok !== true || envelope?.requiresPreflight === true) {
    throw new UnuTvError(
      "image_prompt_preflight_failed",
      "Asset authority image Prompt must pass lint and preflight before Provider execution",
      409,
      { lint: envelope?.lint ?? null }
    );
  }
  return envelope;
}

export function requireCinematicAssetAuthorityRevision(value, fallback = 1) {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new UnuTvError("invalid_payload", "revision must be a positive integer");
  }
  return parsed;
}

export function cinematicAssetAuthorityCompilationTargetId(authority, boardId) {
  if (!boardId || (authority.authorityType === "character" && boardId === "identity-master")) return authority.authorityId;
  return `${authority.authorityId}::${boardId}`;
}

export function cinematicAssetAuthorityBoardId(authority, requestedBoardId) {
  if (authority.authorityType === "character") return requestedBoardId || "identity-master";
  if (authority.authorityType === "scene") return requestedBoardId || (authority.boardSpecs?.some((entry) => entry.boardId === "space-master") ? "space-master" : null);
  return null;
}

export function cinematicCharacterAppearanceProvenance({ authority, media, verificationReviewId } = {}) {
  if (authority?.authorityType !== "character" || authority?.status !== "accepted") return null;
  const identity = authority.externalProviderIdentity;
  if (
    identity?.provider !== "ark"
    || identity?.capability !== "virtual_person_asset"
    || !identity?.assetId
  ) {
    throw new UnuTvError(
      "character_virtual_person_authority_required",
      "Accepted Character Authority generation requires its current Owner-locked Ark virtual person identity.",
      409,
      { authorityId: authority?.authorityId ?? null }
    );
  }
  return {
    role: "appearance_authority",
    sourceType: "deterministic_appearance_generation",
    faceIdentityDuty: "external_virtual_person_asset",
    characterAuthorityId: requireText(authority.authorityId, "authority.authorityId"),
    authorityRevision: requireCinematicAssetAuthorityRevision(authority.revision),
    virtualPersonAssetId: requireText(identity.assetId, "authority.externalProviderIdentity.assetId"),
    verificationReviewId: requireText(verificationReviewId, "verificationReviewId"),
    mediaChecksum: requireText(media?.sha256, "media.sha256")
  };
}

function expectedImageDimensions(resolution) {
  const match = /^(\d+)x(\d+)$/u.exec(typeof resolution === "string" ? resolution.trim() : "");
  return match ? { height: Number(match[2]), width: Number(match[1]) } : null;
}

function preparedImageDimensions(preparation) {
  const stream = preparation?.probe?.streams?.find((entry) => (
    entry?.codec_type === "video"
    || (Number.isInteger(Number(entry?.width)) && Number.isInteger(Number(entry?.height)))
  ));
  return stream ? { height: Number(stream.height), width: Number(stream.width) } : null;
}

async function rejectCinematicAuthorityImageOutput({
  actual,
  artifact,
  assetNodeId,
  expected,
  fallbackMediaId,
  getNode,
  message,
  projectId,
  reason,
  updateNode
}) {
  const node = await getNode(projectId, assetNodeId);
  const rejectedMediaIds = [...new Set([
    ...(Array.isArray(node?.payload?.rejectedMediaIds) ? node.payload.rejectedMediaIds : []),
    artifact.id
  ])];
  if (node) {
    await updateNode({
      projectId,
      nodeId: node.id,
      expectedRevision: node.revision,
      payload: {
        ...node.payload,
        currentMediaId: fallbackMediaId,
        generationStatus: "failed",
        generationPhase: "output_spec_rejected",
        generationMessage: message,
        authorityReviewStatus: "rejected",
        candidateReviewStatus: "rejected",
        candidateRejectionReason: reason,
        rejectedMediaIds,
        status: "authority_candidate_rejected"
      }
    });
  }
  return { actual, expected, mediaId: artifact.id };
}

export async function requireCinematicAuthorityImageOutput({
  artifact,
  assetNodeId,
  expectedResolution,
  fallbackMediaId = null,
  getNode,
  prepareMedia,
  projectId,
  updateNode
} = {}) {
  if (typeof prepareMedia !== "function") throw new TypeError("Missing asset authority media preparation dependency");
  const expected = expectedImageDimensions(expectedResolution);
  if (!expected) {
    throw new UnuTvError("authority_image_resolution_invalid", "Authority image resolution must use WIDTHxHEIGHT.", 409, {
      resolution: expectedResolution ?? null
    });
  }
  const preparation = await prepareMedia({ projectId, mediaId: artifact.id });
  const actual = preparedImageDimensions(preparation);
  if (actual?.width === expected.width && actual?.height === expected.height) {
    return { actual, expected, preparation };
  }
  const details = await rejectCinematicAuthorityImageOutput({
    actual, artifact, assetNodeId, expected, fallbackMediaId, getNode,
    message: `返回图片规格不符：要求 ${expected.width}×${expected.height}，实际 ${actual ? `${actual.width}×${actual.height}` : "无法识别"}`,
    projectId,
    reason: "Provider 返回图片尺寸与固定角色权威规格不一致",
    updateNode
  });
  throw new UnuTvError(
    "authority_image_output_spec_mismatch",
    "Provider returned an Authority image that does not match the requested fixed output dimensions.",
    409,
    details
  );
}

export async function prepareCinematicAuthorityImageArtifact({
  actualAmount,
  assetNodeId,
  dependencies,
  expectedResolution,
  fallbackMediaId,
  getNode,
  projectId,
  reservation,
  run
} = {}) {
  const artifact = run?.result?.artifacts?.find((entry) => entry.kind === "image" && entry.id);
  const consumeReservation = async () => {
    if (reservation?.status !== "reserved") return;
    await dependencies.budget.consumeBudgetReservation({
      projectId,
      reservationId: reservation.id,
      ...(actualAmount !== undefined ? { actualAmount } : {})
    });
  };
  if (!artifact) {
    await consumeReservation();
    throw new UnuTvError(
      "cinematic_image_artifact_missing",
      "Image run succeeded without a materialized image artifact",
      502,
      { runId: run?.id ?? null }
    );
  }
  try {
    await requireCinematicAuthorityImageOutput({
      artifact,
      assetNodeId,
      expectedResolution,
      fallbackMediaId,
      getNode,
      prepareMedia: dependencies.prepareMedia,
      projectId,
      updateNode: dependencies.updateNode
    });
  } catch (error) {
    await consumeReservation();
    throw error;
  }
  return artifact;
}
