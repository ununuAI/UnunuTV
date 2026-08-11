import {
  CINEMATIC_ASSET_AUTHORITY_TYPES,
  CINEMATIC_ASSET_AUTHORITY_STATES,
  UnuTvError,
  assertCinematicContract,
  compileCharacterAuthorityPrompt,
  compilePropAuthorityPrompt,
  compileSceneAuthorityPrompt,
  compileStoryboardPrompt as compileStoryboardEnvelope,
  createId,
  nowIso,
  requireEnum,
  requireObject,
  requireText,
  routeAssetAuthorityRisk
} from "@ununu/unutv-contracts";
import { deriveAssetAuthorityCandidates, searchAssetAuthorityPage } from "../asset-authority-operation-policy.mjs";
import { cinematicAssetNodeMetadata } from "../cinematic-asset-node-metadata-policy.mjs";
import {
  cinematicAssetAuthorityBoardId as assetAuthorityBoardId,
  cinematicAssetAuthorityCompilationTargetId as authorityCompilationTargetId,
  cinematicCharacterAppearanceProvenance,
  prepareCinematicAuthorityImageArtifact,
  requireCinematicAssetAuthorityExecutionDependencies,
  requireCinematicAssetAuthorityPort as port,
  requireCinematicAssetAuthorityRevision as revision,
  requireCurrentCinematicAuthorityImageCompilation,
  resolveCinematicAssetAuthorityExecutionTarget
} from "./cinematic-asset-authority-use-case-helpers.mjs";
import { requireCinematicVisualProductionOwnerAcceptance } from "./cinematic-visual-production-review-use-case.mjs";
export function createCinematicAssetAuthorityUseCases(ports, dependencies = {}) {
  const getProduction = port(ports, "getCinematicProduction");
  const saveRecord = port(ports, "saveCinematicAssetAuthority");
  const getRecord = port(ports, "getCinematicAssetAuthority");
  const listRecords = port(ports, "listCinematicAssetAuthorities");
  const listVersions = port(ports, "listCinematicAssetAuthorityVersions");
  const batchSaveRecords = port(ports, "batchSaveCinematicAssetAuthorities");
  const saveCompilation = port(ports, "saveCinematicImagePromptCompilation");
  const getCompilation = port(ports, "getCinematicImagePromptCompilation");
  const getShot = port(ports, "getCinematicShot");
  const getVisualBible = port(ports, "getVisualBible");
  const getStoryPacket = port(ports, "getStoryPacket");
  const listShots = port(ports, "listCinematicShots");
  const listStoryboards = port(ports, "listStoryboardDocuments");
  const listUnits = port(ports, "listGenerationUnits");
  const getNode = port(ports, "getNode");
  const listProviderRuns = port(ports, "listRuns");
  const listReviews = port(ports, "listReviews");

  async function requireProduction(projectId, productionId) {
    const production = await getProduction(projectId, productionId);
    if (!production) throw new UnuTvError("cinematic_production_not_found", `Cinematic production not found: ${productionId}`, 404);
    return production;
  }

  async function saveAssetAuthority(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const productionId = requireText(input.productionId, "productionId");
    await requireProduction(projectId, productionId);
    const draft = requireObject(input.authority, "authority");
    const authorityType = requireEnum(draft.authorityType, CINEMATIC_ASSET_AUTHORITY_TYPES, "authority.authorityType");
    const authority = { ...draft, authorityType, authorityId: draft.authorityId || createId(`${authorityType}-authority`), revision: revision(draft.revision), updatedAt: nowIso() };
    const contract = authorityType === "character" ? "CharacterAuthoritySet" : authorityType === "scene" ? "SceneAuthoritySet" : "PropAuthoritySpec";
    assertCinematicContract(contract, authority);
    return saveRecord(projectId, productionId, authority, input.expectedRevision);
  }

  async function updateAssetAuthority(input = {}) {
    const current = await getAssetAuthority(input);
    const patch = requireObject(input.patch ?? input.authority, "patch");
    return saveAssetAuthority({ ...input, expectedRevision: input.expectedRevision ?? current.revision, authority: { ...current, ...patch, authorityId: current.authorityId, authorityType: current.authorityType, revision: current.revision + 1 } });
  }

  async function getAssetAuthority(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const productionId = requireText(input.productionId, "productionId");
    await requireProduction(projectId, productionId);
    const authorityId = requireText(input.authorityId, "authorityId");
    const authority = await getRecord(projectId, productionId, authorityId);
    if (!authority) throw new UnuTvError("asset_authority_not_found", `Cinematic asset authority not found: ${authorityId}`, 404);
    return authority;
  }
  async function listAssetAuthorities(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const productionId = requireText(input.productionId, "productionId");
    await requireProduction(projectId, productionId);
    return listRecords(projectId, productionId);
  }

  async function searchAssetAuthorities(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const productionId = requireText(input.productionId, "productionId");
    await requireProduction(projectId, productionId);
    return searchAssetAuthorityPage(await listRecords(projectId, productionId), input);
  }

  async function listAssetAuthorityVersions(input = {}) {
    const current = await getAssetAuthority(input);
    const versions = await listVersions(requireText(input.projectId, "projectId"), requireText(input.productionId, "productionId"), current.authorityId);
    const page = Math.max(1, Number.parseInt(input.page ?? 1, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(input.pageSize ?? 20, 10) || 20));
    const offset = (page - 1) * pageSize;
    return { items: versions.slice(offset, offset + pageSize), page, pageSize, pageCount: Math.max(1, Math.ceil(versions.length / pageSize)), total: versions.length };
  }

  async function batchTransitionAssetAuthorities(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const productionId = requireText(input.productionId, "productionId");
    await requireProduction(projectId, productionId);
    const authorityIds = [...new Set(Array.isArray(input.authorityIds) ? input.authorityIds.map((item) => requireText(item, "authorityIds[]")) : [])];
    if (!authorityIds.length) throw new UnuTvError("asset_authority_selection_required", "Select at least one asset authority", 400);
    const status = requireEnum(input.status, CINEMATIC_ASSET_AUTHORITY_STATES, "status");
    const expectedRevisions = requireObject(input.expectedRevisions, "expectedRevisions", {});
    const updatedAt = nowIso();
    const authorities = [];
    for (const authorityId of authorityIds) {
      const current = await getAssetAuthority({ projectId, productionId, authorityId });
      if (expectedRevisions[authorityId] !== undefined && Number(expectedRevisions[authorityId]) !== current.revision) {
        throw new UnuTvError("asset_authority_revision_conflict", `Asset authority changed: ${authorityId}`, 409, { authorityId, expected: expectedRevisions[authorityId], actual: current.revision });
      }
      const next = { ...current, status, revision: current.revision + 1, updatedAt };
      const contract = next.authorityType === "character" ? "CharacterAuthoritySet" : next.authorityType === "scene" ? "SceneAuthoritySet" : "PropAuthoritySpec";
      assertCinematicContract(contract, next);
      authorities.push(next);
    }
    return {
      authorities: await batchSaveRecords(projectId, productionId, authorities, expectedRevisions),
      status,
      updatedAt
    };
  }

  async function restoreAssetAuthorityVersion(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const productionId = requireText(input.productionId, "productionId");
    const current = await getAssetAuthority(input);
    const version = Number(input.version);
    if (!Number.isInteger(version) || version < 1) throw new UnuTvError("invalid_payload", "version must be a positive integer", 400);
    const versions = await listVersions(projectId, productionId, current.authorityId);
    const historical = versions.find((entry) => entry.version === version)?.authority;
    if (!historical) throw new UnuTvError("asset_authority_version_not_found", `Asset authority version not found: ${version}`, 404);
    return saveAssetAuthority({
      projectId,
      productionId,
      expectedRevision: input.expectedRevision ?? current.revision,
      authority: { ...historical, authorityId: current.authorityId, authorityType: current.authorityType, revision: current.revision + 1 }
    });
  }

  async function deriveAssetAuthoritiesFromStory(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const productionId = requireText(input.productionId, "productionId");
    await requireProduction(projectId, productionId);
    const [storyPacket, visualBible, shots, existingAuthorities] = await Promise.all([
      getStoryPacket(projectId, productionId, input.storyPacketId),
      getVisualBible(projectId, productionId),
      listShots(projectId, productionId),
      listRecords(projectId, productionId)
    ]);
    const requirements = routeAssetAuthorityRisk({ storyPacket, shots });
    const timestamp = nowIso();
    const candidates = deriveAssetAuthorityCandidates({ storyPacket, visualBible, shots, existingAuthorities, requirements }).map((authority) => ({
      ...authority,
      authorityId: createId(`${authority.authorityType}-authority`),
      revision: 1,
      updatedAt: timestamp
    }));
    for (const authority of candidates) {
      const contract = authority.authorityType === "character" ? "CharacterAuthoritySet" : authority.authorityType === "scene" ? "SceneAuthoritySet" : "PropAuthoritySpec";
      assertCinematicContract(contract, authority);
    }
    if (input.persist !== true || !candidates.length) return { candidates, persisted: false, requirements };
    const authorities = await batchSaveRecords(projectId, productionId, candidates, {});
    return { candidates: authorities, persisted: true, requirements };
  }

  async function getAssetAuthorityImpact(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const productionId = requireText(input.productionId, "productionId");
    const authority = await getAssetAuthority(input);
    const [shots, storyboards, units] = await Promise.all([
      listShots(projectId, productionId),
      listStoryboards(projectId, productionId),
      listUnits(projectId, productionId)
    ]);
    const impactedShots = shots.filter((shot) => (shot.requiredAssetIds ?? []).includes(authority.authorityId));
    const shotIds = new Set(impactedShots.map((shot) => shot.shotId));
    const impactedStoryboards = storyboards.flatMap((storyboard) => {
      const storyboardShots = storyboard.shots.filter((shot) => (shot.requiredAssetAuthorityIds ?? []).includes(authority.authorityId) || shotIds.has(shot.shotId));
      return storyboardShots.length ? [{ storyboardId: storyboard.storyboardId, title: storyboard.title, shots: storyboardShots.map((shot) => ({ storyboardShotId: shot.storyboardShotId, shotId: shot.shotId, order: shot.order, status: shot.status })) }] : [];
    });
    const impactedUnits = units.filter((entry) => entry.generationUnit?.shotLinks?.some((link) => shotIds.has(link.shotId)) || JSON.stringify(entry).includes(authority.authorityId));
    return {
      authority: { authorityId: authority.authorityId, displayName: authority.displayName, revision: authority.revision, status: authority.status },
      counts: { shots: impactedShots.length, storyboardShots: impactedStoryboards.reduce((sum, item) => sum + item.shots.length, 0), generationUnits: impactedUnits.length },
      shots: impactedShots.map((shot) => ({ shotId: shot.shotId, order: shot.order, storyBeat: shot.storyBeat, revision: shot.revision })),
      storyboards: impactedStoryboards,
      generationUnits: impactedUnits.map((entry) => ({ generationUnitId: entry.generationUnit.generationUnitId, strategy: entry.generationUnit.strategy, revision: entry.generationUnit.revision }))
    };
  }

  async function routeAssetAuthorityRequirements(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const productionId = requireText(input.productionId, "productionId");
    await requireProduction(projectId, productionId);
    const storyPacket = await getStoryPacket(projectId, productionId, input.storyPacketId);
    const shots = [];
    for (const shotId of Array.isArray(input.shotIds) ? input.shotIds : []) {
      const shot = await getShot(projectId, productionId, shotId);
      if (shot) shots.push(shot);
    }
    return { requirements: routeAssetAuthorityRisk({ storyPacket, shots }) };
  }

  async function compileAssetAuthority(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const productionId = requireText(input.productionId, "productionId");
    const [authority, visualBible] = await Promise.all([
      getAssetAuthority({ projectId, productionId, authorityId: input.authorityId }),
      getVisualBible(projectId, productionId)
    ]);
    const compile = authority.authorityType === "character" ? compileCharacterAuthorityPrompt : authority.authorityType === "scene" ? compileSceneAuthorityPrompt : compilePropAuthorityPrompt;
    const boardId = assetAuthorityBoardId(authority, input.boardId);
    const envelope = compile({
      authority,
      visualBible,
      ...(boardId ? { boardId } : {}),
      generationParameters: requireObject(input.generationParameters, "generationParameters"),
      referenceBindings: Array.isArray(input.referenceBindings) ? input.referenceBindings : [],
      manualOverride: input.manualOverride === true,
      manualPrompt: input.manualPrompt
    });
    const compilation = { compilationId: createId("image-prompt-compilation"), productionId, targetType: authority.authorityType, targetId: authorityCompilationTargetId(authority, boardId), envelope, createdAt: nowIso() };
    await saveCompilation(projectId, compilation);
    if (input.assetNodeId) {
      if (typeof dependencies.updateNode !== "function") throw new TypeError("Missing asset authority canvas synchronization dependency");
      const assetNode = await getNode(projectId, requireText(input.assetNodeId, "assetNodeId"));
      if (!assetNode || assetNode.kind !== "asset" || assetNode.payload?.authorityId !== authority.authorityId) throw new UnuTvError("authority_asset_node_invalid", "Compiled authority Prompt must sync to its matching visible asset node", 409);
      await dependencies.updateNode({
        projectId,
        nodeId: assetNode.id,
        expectedRevision: assetNode.revision,
        payload: {
          ...assetNode.payload,
          prompt: envelope.compiledContentPrompt,
          provider: envelope.generationParameters.provider,
          modelId: envelope.generationParameters.model,
          cinematicImageCompilationId: compilation.compilationId,
          cinematicAbstractIntentResolution: envelope.abstractIntentResolution,
          ...(boardId ? { activeAuthorityBoardId: boardId } : {})
        }
      });
    }
    return compilation;
  }

  async function compileStoryboardPrompt(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const productionId = requireText(input.productionId, "productionId");
    await requireProduction(projectId, productionId);
    const storyboard = { ...requireObject(input.storyboard, "storyboard"), storyboardId: input.storyboard?.storyboardId || createId("storyboard"), revision: revision(input.storyboard?.revision) };
    const visualBible = await getVisualBible(projectId, productionId);
    if (!visualBible) throw new UnuTvError("visual_bible_required", "A complete VisualBible is required before storyboard Prompt compilation", 409);
    const shots = [];
    for (const shotId of storyboard.shotIds ?? []) {
      const shot = await getShot(projectId, productionId, shotId);
      if (!shot) throw new UnuTvError("cinematic_shot_not_found", `Cinematic shot not found: ${shotId}`, 409);
      shots.push(shot);
    }
    const envelope = compileStoryboardEnvelope({ storyboard, shots, visualBible, generationParameters: requireObject(input.generationParameters, "generationParameters"), referenceBindings: Array.isArray(input.referenceBindings) ? input.referenceBindings : [], manualOverride: input.manualOverride === true, manualPrompt: input.manualPrompt });
    const compilation = { compilationId: createId("image-prompt-compilation"), productionId, targetType: "storyboard", targetId: storyboard.storyboardId, envelope, createdAt: nowIso() };
    await saveCompilation(projectId, compilation);
    return compilation;
  }

  async function getImagePromptCompilation(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const productionId = requireText(input.productionId, "productionId");
    await requireProduction(projectId, productionId);
    return getCompilation(projectId, productionId, requireText(input.targetType, "targetType"), requireText(input.targetId, "targetId"));
  }
  async function runAssetAuthority(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const productionId = requireText(input.productionId, "productionId");
    const billingMode = input.billingMode ?? "provider_account";
    const budgetless = billingMode !== "legacy_budget";
    await requireCinematicVisualProductionOwnerAcceptance({
      getProduction, getStoryPacket, listReviews, listShots, productionId, projectId,
      requireShotAcceptance: false,
      storyPacketId: input.storyPacketId
    });
    requireCinematicAssetAuthorityExecutionDependencies(dependencies);
    if (!budgetless && typeof dependencies.budget?.reserveBudget !== "function") {
      throw new TypeError("Missing asset authority legacy budget dependency");
    }
    const [authority, visualBible] = await Promise.all([
      getAssetAuthority({ projectId, productionId, authorityId: input.authorityId }),
      getVisualBible(projectId, productionId)
    ]);
    const boardId = assetAuthorityBoardId(authority, input.boardId);
    const compilationTargetId = authorityCompilationTargetId(authority, boardId);
    const compilation = await getCompilation(projectId, productionId, authority.authorityType, compilationTargetId);
    const envelope = requireCurrentCinematicAuthorityImageCompilation({ authority, compilation, visualBible });
    const assetNodeId = requireText(input.assetNodeId ?? input.executionNodeId, "assetNodeId");
    const { asset, assetId } = await resolveCinematicAssetAuthorityExecutionTarget({
      authority, assetNodeId, getNode, inputAssetId: input.assetId,
      listAssets: dependencies.listAssets, projectId
    });
    const parameters = envelope.generationParameters;
    const provider = requireText(parameters.provider, "generationParameters.provider");
    const model = requireText(parameters.model, "generationParameters.model");
    const idempotencyKey = requireText(input.idempotencyKey, "idempotencyKey");
    let reservation = null;
    if (!budgetless) {
      const amount = Number(input.amount);
      if (!(amount > 0) || !Number.isFinite(amount)) throw new UnuTvError("invalid_payload", "amount must be greater than zero for legacy_budget", 400);
      reservation = await dependencies.budget.reserveBudget({
        projectId,
        provider,
        model,
        taskType: "image",
        amount,
        currency: input.currency,
        idempotencyKey: `${idempotencyKey}:budget:v1`
      });
    }
    const generatingNode = await getNode(projectId, assetNodeId);
    const assetNodeMetadata = cinematicAssetNodeMetadata(authority);
    await dependencies.updateNode({
      projectId,
      nodeId: assetNodeId,
      expectedRevision: generatingNode.revision,
      payload: {
        ...generatingNode.payload,
        ...assetNodeMetadata,
        prompt: envelope.compiledContentPrompt,
        generationStatus: "running",
        generationPhase: "requesting",
        generationMessage: `正在生成${envelope.authorityBoard?.label || authority.displayName}…`,
        generationRequestId: idempotencyKey,
        generationRunId: null,
        providerRunId: null,
        generationProvider: provider,
        generationModel: model,
        generationResolution: parameters.resolution,
        generationCount: parameters.count,
        generationBackground: parameters.background || null,
        cinematicImageCompilationId: compilation.compilationId,
        ...(boardId ? { activeAuthorityBoardId: boardId } : {})
      }
    });
    const runs = await listProviderRuns(projectId);
    let run = runs.find((entry) => entry.nodeId === assetNodeId && entry.request?.idempotencyKey === idempotencyKey && entry.request?.cinematicImageCompilationId === compilation.compilationId) ?? null;
    if (!run) {
      run = await dependencies.runNode({
        projectId,
        nodeId: assetNodeId,
        provider,
        request: {
          prompt: envelope.compiledContentPrompt,
          model,
          size: parameters.resolution,
          n: parameters.count,
          ...(parameters.quality ? { quality: parameters.quality } : {}),
          ...(parameters.background ? { background: parameters.background } : {}),
          referenceMediaIds: parameters.referenceMediaIds,
          billingMode,
          idempotencyKey,
          cinematicImageCompilationId: compilation.compilationId,
          cinematicImagePayloadHash: envelope.payloadHash,
          authorityId: authority.authorityId,
          ...(boardId ? { authorityBoardId: boardId } : {}),
          authorityRevision: authority.revision,
          assetId
        }
      });
    }
    if (run.status !== "succeeded") {
      const outcomeUnknown = run.result?.code === "paid_submission_outcome_unknown" || run.result?.code === "provider_unavailable";
      let settledReservation = reservation;
      if (!outcomeUnknown && reservation?.status === "reserved") settledReservation = await dependencies.budget.releaseBudgetReservation({ projectId, reservationId: reservation.id });
      const failedNode = await getNode(projectId, assetNodeId);
      await dependencies.updateNode({
        projectId,
        nodeId: assetNodeId,
        expectedRevision: failedNode.revision,
        payload: {
          ...failedNode.payload,
          generationStatus: outcomeUnknown ? "running" : "failed",
          generationPhase: outcomeUnknown ? "outcome_unknown" : "failed",
          generationMessage: outcomeUnknown ? "Provider 结果待确认，未重复提交" : (run.result?.message || "资产图片生成失败")
        }
      });
      return { authority, compilation, reservation: settledReservation, run, assetVersion: null, reused: runs.some((entry) => entry.id === run.id), outcomeUnknown };
    }
    let assetVersion = asset.versions?.find((entry) => entry.payload?.authorityExecutionKey === idempotencyKey) ?? null;
    const artifact = assetVersion
      ? await ports.projects.getMedia(projectId, assetVersion.mediaId)
      : await prepareCinematicAuthorityImageArtifact({
          actualAmount: input.actualAmount, assetNodeId,
          dependencies, expectedResolution: parameters.resolution,
          fallbackMediaId: generatingNode.payload?.currentMediaId ?? null, getNode, projectId, reservation, run
        });
    const appearanceProvenance = cinematicCharacterAppearanceProvenance({
      authority,
      media: await ports.projects.getMedia(projectId, artifact.id),
      verificationReviewId: input.verificationReviewId
    });
    const artifactMedia = await ports.projects.getMedia(projectId, artifact.id);
    if (!assetVersion) assetVersion = await dependencies.addAssetVersion({
      projectId,
      assetId,
      mediaId: artifact.id,
      payload: {
        authorityExecutionKey: idempotencyKey,
        authorityId: authority.authorityId,
        ...(boardId ? { authorityBoardId: boardId } : {}),
        authorityRevision: authority.revision,
        compilationId: compilation.compilationId,
        payloadHash: envelope.payloadHash,
        providerRunId: run.id,
        outputSpec: {
          aspectRatio: parameters.aspectRatio,
          backgroundMode: parameters.background,
          requestedBackgroundColor: authority.authorityType === "character" || authority.authorityType === "prop" ? "#D2D2CE" : null,
          resolution: parameters.resolution
        },
        reviewState: "candidate",
        ...(appearanceProvenance ? { appearanceProvenance } : {})
      }
    });
    const currentAssetNode = await getNode(projectId, assetNodeId);
    const authorityMediaVersion = {
      assetVersionId: assetVersion.id,
      authorityRevision: authority.revision,
      boardId: boardId || null,
      label: envelope.authorityBoard?.label || authority.displayName,
      mediaId: artifact.id,
      reviewState: "candidate"
    };
    const authorityMediaVersions = [
      ...(Array.isArray(currentAssetNode.payload?.authorityMediaVersions) ? currentAssetNode.payload.authorityMediaVersions : []),
      authorityMediaVersion
    ].filter((entry, index, values) => values.findIndex((candidate) => candidate?.mediaId === entry?.mediaId) === index);
    const canvasNode = await dependencies.updateNode({
      projectId,
      nodeId: assetNodeId,
      expectedRevision: currentAssetNode.revision,
      payload: {
        ...currentAssetNode.payload,
        ...assetNodeMetadata,
        currentMediaId: artifact.id,
        currentMediaChecksum: artifactMedia?.sha256 ?? null,
        generationStatus: "succeeded",
        generationPhase: "complete",
        generationMessage: `${envelope.authorityBoard?.label || authority.displayName}候选图已生成`,
        authorityReviewStatus: "candidate",
        authorityRejectionReason: null,
        candidateReviewStatus: "candidate",
        candidateRejectionReason: null,
        status: "authority_candidate_generated",
        authorityId: authority.authorityId,
        ...(boardId ? { authorityBoardId: boardId } : {}),
        authorityRevision: authority.revision,
        ...(authority.authorityType === "scene" ? {
          sceneTopologyRevision: authority.spatialLogic?.topologyRevision
            ?? authority.spatialLogic?.topologyId
            ?? authority.topologyRevision
            ?? null
        } : {}),
        assetId,
        assetVersionId: assetVersion.id,
        authorityMediaVersions,
        cinematicImageCompilationId: compilation.compilationId,
        providerRunId: run.id,
        ...(appearanceProvenance ? {
          appearanceProvenance,
          currentAppearanceProvenance: appearanceProvenance,
          faceIdentityDuty: "external_virtual_person_asset"
        } : {})
      }
    });
    let settledReservation = reservation;
    if (reservation?.status === "reserved") settledReservation = await dependencies.budget.consumeBudgetReservation({ projectId, reservationId: reservation.id, ...(input.actualAmount !== undefined ? { actualAmount: input.actualAmount } : {}) });
    return { authority, assetNode: canvasNode, compilation, reservation: settledReservation, run, assetVersion, canvasNode, reused: runs.some((entry) => entry.id === run.id), outcomeUnknown: false };
  }
  return {
    batchTransitionAssetAuthorities,
    compileAssetAuthority,
    compileStoryboardPrompt,
    deriveAssetAuthoritiesFromStory,
    getAssetAuthority,
    getAssetAuthorityImpact,
    getImagePromptCompilation,
    listAssetAuthorities,
    listAssetAuthorityVersions,
    restoreAssetAuthorityVersion,
    routeAssetAuthorityRequirements,
    runAssetAuthority,
    saveAssetAuthority,
    searchAssetAuthorities,
    updateAssetAuthority
  };
}
