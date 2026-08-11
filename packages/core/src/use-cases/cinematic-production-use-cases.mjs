import {
  CINEMATIC_PROMPT_COMPILER_VERSION,
  CINEMATIC_PRODUCTION_MODES, CINEMATIC_PROJECT_TYPES,
  UnuTvError,
  assertCinematicContract,
  compileCinematicPrompt,
  createId,
  nowIso,
  optionalText,
  requireEnum,
  requireObject,
  requireText
} from "@ununu/unutv-contracts";
import { createCinematicCompilationStalenessInspector } from "./cinematic-compilation-staleness.mjs";
import { appendCompilationSourceVersions, auditSelectedStoryboardReferences, buildExecutionGateEvidence, enforceProductionSignoffGates } from "./cinematic-compilation-context.mjs";
import { createCinematicGenerationRunUseCase } from "./cinematic-generation-run-use-case.mjs";
import { createCinematicReviewUseCases } from "./cinematic-review-use-cases.mjs";
import {
  applyCinematicCompilationAudits,
  assertCinematicSegmentDecision,
  assessCharacterIdentityMediaAuthority,
  createRequireCinematicProduction,
  getCinematicModelCapabilities,
  loadCurrentAssetMediaRecords,
  requireCinematicProductionPort,
  requireCinematicRevision
} from "./cinematic-production-use-case-helpers.mjs";
import {
  assertGenerationUnitIdentity,
  assertShotIdentityInput,
  buildGenerationUnitReferences,
  deriveGenerationUnitIdentity,
  deriveIdentityForShots,
  deriveShotIdentityForSave
} from "./cinematic-generation-reference-helpers.mjs";
import { auditGenerationUnitSceneAuthority } from "../cinematic-scene-authority-policy.mjs";
import { syncGenerationUnitLifecycleNode, syncGenerationUnitPreflightNode } from "../cinematic-generation-unit-node-policy.mjs";
import { persistCompiledPromptOnCanvas, resolveCanvasReferenceGraph } from "../cinematic-canvas-prompt-graph-policy.mjs";
import { projectSoundContributionOnCanvas } from "../cinematic-sound-canvas-projection.mjs";
export function createCinematicProductionUseCases(ports, dependencies = {}) {
  const createProductionRecord = requireCinematicProductionPort(ports, "createCinematicProduction");
  const listProductionRecords = requireCinematicProductionPort(ports, "listCinematicProductions");
  const getProductionRecord = requireCinematicProductionPort(ports, "getCinematicProduction");
  const updateProductionRecord = requireCinematicProductionPort(ports, "updateCinematicProduction");
  const saveStoryPacketRecord = requireCinematicProductionPort(ports, "saveStoryPacket");
  const getStoryPacketRecord = requireCinematicProductionPort(ports, "getStoryPacket");
  const saveVisualBibleRecord = requireCinematicProductionPort(ports, "saveVisualBible");
  const getVisualBibleRecord = requireCinematicProductionPort(ports, "getVisualBible");
  const saveShotRecord = requireCinematicProductionPort(ports, "saveCinematicShot");
  const listShotRecords = requireCinematicProductionPort(ports, "listCinematicShots");
  const getShotRecord = requireCinematicProductionPort(ports, "getCinematicShot");
  const saveUnitRecord = requireCinematicProductionPort(ports, "saveGenerationUnit");
  const listUnitRecords = requireCinematicProductionPort(ports, "listGenerationUnits");
  const getUnitRecord = requireCinematicProductionPort(ports, "getGenerationUnit");
  const saveCompilationRecord = requireCinematicProductionPort(ports, "savePromptCompilation");
  const getCompilationRecord = requireCinematicProductionPort(ports, "getPromptCompilation");
  const saveEvaluationRecord = requireCinematicProductionPort(ports, "saveCinematicEvaluation");
  const listEvaluationRecords = requireCinematicProductionPort(ports, "listCinematicEvaluations");
  const saveContributionRecord = requireCinematicProductionPort(ports, "saveProfessionalContribution");
  const listContributionRecords = requireCinematicProductionPort(ports, "listProfessionalContributions");
  const listAssetAuthorityRecords = requireCinematicProductionPort(ports, "listCinematicAssetAuthorities");
  const linkGenerationUnitRun = requireCinematicProductionPort(ports, "linkGenerationUnitRun");
  const listProviderRuns = requireCinematicProductionPort(ports, "listRuns");
  const listStoryboardRecords = requireCinematicProductionPort(ports, "listStoryboardDocuments");
  const requireProduction = createRequireCinematicProduction(getProductionRecord);
  const reviewUseCases = createCinematicReviewUseCases({ ports, requireProduction, getUnitRecord, saveEvaluationRecord, listEvaluationRecords });
  const findCompilationStaleness = createCinematicCompilationStalenessInspector({
    getProduction: getProductionRecord, getShot: getShotRecord,
    getStoryPacket: getStoryPacketRecord,
    getVisualBible: getVisualBibleRecord,
    listStoryboards: listStoryboardRecords, listReviews: ports.projects.listReviews?.bind(ports.projects), listEvaluations: listEvaluationRecords,
    listProfessionalContributions: listContributionRecords,
    listAssetAuthorities: listAssetAuthorityRecords,
    listAssets: ports.projects.listAssets?.bind(ports.projects),
    getMedia: ports.media?.open?.bind(ports.media)
  });
  const runGenerationUnit = createCinematicGenerationRunUseCase({
    budget: dependencies.budget,
    findCompilationStaleness,
    getCompilationRecord,
    getGenerationUnit,
    linkGenerationUnitRun,
    listProviderRuns,
    listAssetAuthorities: listAssetAuthorityRecords,
    pollRun: dependencies.pollRun,
    projects: ports.projects,
    runNode: dependencies.runNode,
    saveNodePrompt: dependencies.saveNodePrompt,
    updateNode: dependencies.updateNode
  });
  async function createCinematicProduction(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const timestamp = nowIso();
    const production = {
      productionId: createId("production"),
      projectType: requireEnum(input.projectType ?? "short_film", CINEMATIC_PROJECT_TYPES, "projectType"),
      productionMode: requireEnum(input.productionMode ?? "production", CINEMATIC_PRODUCTION_MODES, "productionMode"),
      storyPacketIds: [],
      visualBibleId: null,
      shotIds: [],
      generationUnitIds: [],
      assetAuthorityIds: [],
      teamManifestIds: Array.isArray(input.teamManifestIds) ? input.teamManifestIds.filter(Boolean) : [],
      reviewState: "draft",
      revision: 1,
      title: optionalText(input.title, "未命名影视制作"),
      sourceNodeId: input.sourceNodeId ? requireText(input.sourceNodeId, "sourceNodeId") : null,
      legacyExtensions: {},
      createdAt: timestamp,
      updatedAt: timestamp
    };
    assertCinematicContract("CinematicProduction", production);
    return createProductionRecord(projectId, production);
  }

  async function listCinematicProductions(input = {}) {
    return listProductionRecords(requireText(input.projectId, "projectId"));
  }

  async function getCinematicProduction(input = {}) {
    return requireProduction(requireText(input.projectId, "projectId"), requireText(input.productionId, "productionId"));
  }

  async function updateCinematicProduction(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const productionId = requireText(input.productionId, "productionId");
    const current = await requireProduction(projectId, productionId);
    const next = {
      ...current,
      ...(input.title !== undefined ? { title: requireText(input.title, "title") } : {}),
      ...(input.projectType !== undefined ? { projectType: requireEnum(input.projectType, CINEMATIC_PROJECT_TYPES, "projectType") } : {}),
      ...(input.productionMode !== undefined ? { productionMode: requireEnum(input.productionMode, CINEMATIC_PRODUCTION_MODES, "productionMode") } : {}),
      ...(input.sourceNodeId !== undefined ? { sourceNodeId: input.sourceNodeId === null ? null : requireText(input.sourceNodeId, "sourceNodeId") } : {}),
      ...(input.teamManifestIds !== undefined ? { teamManifestIds: Array.isArray(input.teamManifestIds) ? input.teamManifestIds.filter(Boolean) : [] } : {}),
      ...(input.reviewState !== undefined ? { reviewState: requireText(input.reviewState, "reviewState") } : {}),
      revision: current.revision + 1,
      updatedAt: nowIso()
    };
    assertCinematicContract("CinematicProduction", next);
    return updateProductionRecord(projectId, next, input.expectedRevision);
  }

  async function saveStoryPacket(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const productionId = requireText(input.productionId, "productionId");
    await requireProduction(projectId, productionId);
    const packet = {
      ...requireObject(input.storyPacket, "storyPacket"),
      storyPacketId: input.storyPacket?.storyPacketId || createId("story-packet"),
      revision: requireCinematicRevision(input.storyPacket?.revision),
      updatedAt: nowIso()
    };
    assertCinematicContract("StoryProductionPacket", packet);
    return saveStoryPacketRecord(projectId, productionId, packet, input.expectedRevision);
  }

  async function getStoryPacket(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const productionId = requireText(input.productionId, "productionId");
    await requireProduction(projectId, productionId);
    return getStoryPacketRecord(projectId, productionId, input.storyPacketId);
  }

  async function saveVisualBible(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const productionId = requireText(input.productionId, "productionId");
    await requireProduction(projectId, productionId);
    const bible = {
      visualMotifs: [],
      colorArc: {},
      spatialDramaturgy: {},
      propSemantics: {},
      costumeNarrative: {},
      materialAging: {},
      culturalResearchRefs: [],
      styleProhibitions: [],
      ...requireObject(input.visualBible, "visualBible"),
      visualBibleId: input.visualBible?.visualBibleId || createId("visual-bible"),
      revision: requireCinematicRevision(input.visualBible?.revision),
      updatedAt: nowIso()
    };
    assertCinematicContract("VisualBible", bible);
    return saveVisualBibleRecord(projectId, productionId, bible, input.expectedRevision);
  }

  async function getVisualBible(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const productionId = requireText(input.productionId, "productionId");
    await requireProduction(projectId, productionId);
    return getVisualBibleRecord(projectId, productionId);
  }

  async function saveShot(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const productionId = requireText(input.productionId, "productionId");
    await requireProduction(projectId, productionId);
    const shotInput = requireObject(input.shot, "shot");
    const authorities = await listAssetAuthorityRecords(projectId, productionId);
    const identity = deriveShotIdentityForSave(authorities, [shotInput]);
    assertShotIdentityInput(shotInput, identity);
    const shot = {
      ...shotInput,
      characterAuthorityIds: identity.characterAuthorityIds,
      characterIdentitySourceVersions: identity.sourceVersions,
      shotId: input.shot?.shotId || createId("shot"),
      revision: requireCinematicRevision(input.shot?.revision),
      updatedAt: nowIso()
    };
    assertCinematicContract("CinematicShotSpec", shot);
    return saveShotRecord(projectId, productionId, shot, input.expectedRevision);
  }

  async function updateShot(input = {}) {
    const current = await getShot(input);
    const merged = { ...current, ...requireObject(input.patch ?? input.shot, "patch"), shotId: current.shotId, revision: current.revision + 1 };
    delete merged.characterIdentitySourceVersions;
    delete merged.virtualPersonAssetIds;
    return saveShot({
      ...input,
      expectedRevision: input.expectedRevision ?? current.revision,
      shot: merged
    });
  }

  async function listShots(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const productionId = requireText(input.productionId, "productionId");
    await requireProduction(projectId, productionId);
    return listShotRecords(projectId, productionId, input.includeStale === true);
  }

  async function getShot(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const productionId = requireText(input.productionId, "productionId");
    await requireProduction(projectId, productionId);
    const shot = await getShotRecord(projectId, productionId, requireText(input.shotId, "shotId"), input.includeStale === true);
    if (!shot) throw new UnuTvError("cinematic_shot_not_found", `Cinematic shot not found: ${input.shotId}`, 404);
    return shot;
  }

  async function saveGenerationUnit(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const productionId = requireText(input.productionId, "productionId");
    await requireProduction(projectId, productionId);
    const unitInput = requireObject(input.generationUnit, "generationUnit");
    assertCinematicSegmentDecision(unitInput.segmentDecision);
    const productionShots = await listShotRecords(projectId, productionId);
    const authorities = await listAssetAuthorityRecords(projectId, productionId);
    const identity = deriveGenerationUnitIdentity({ authorities, productionShots, unitInput });
    const unit = {
      ...unitInput,
      characterAuthorityIds: identity.characterAuthorityIds,
      characterIdentitySourceVersions: identity.sourceVersions,
      requiredCapabilities: [...new Set([
        ...(Array.isArray(unitInput.requiredCapabilities) ? unitInput.requiredCapabilities : []),
        ...(identity.virtualPersonAssetIds.length ? ["virtual_person_asset"] : [])
      ])],
      generationParameters: {
        ...requireObject(unitInput.generationParameters, "generationUnit.generationParameters"),
        virtualPersonAssetIds: identity.virtualPersonAssetIds
      },
      generationUnitId: input.generationUnit?.generationUnitId || createId("generation-unit"),
      revision: requireCinematicRevision(input.generationUnit?.revision),
      updatedAt: nowIso()
    };
    assertCinematicContract("GenerationUnit", unit);
    const referenceBindings = Array.isArray(input.referenceBindings) ? input.referenceBindings : [];
    assertCinematicContract("ReferenceBinding", referenceBindings, { generationParameters: unit.generationParameters });
    const saved = await saveUnitRecord(projectId, productionId, unit, referenceBindings, input.expectedRevision);
    await syncGenerationUnitLifecycleNode({ generationUnit: unit, getNode: ports.projects.getNode?.bind(ports.projects), projectId, updateNode: dependencies.updateNode });
    return saved;
  }
  async function updateGenerationUnit(input = {}) {
    const current = await getGenerationUnit(input);
    const patch = requireObject(input.patch ?? input.generationUnit, "patch");
    return saveGenerationUnit({
      ...input,
      expectedRevision: input.expectedRevision ?? current.generationUnit.revision,
      generationUnit: {
        ...current.generationUnit,
        ...patch,
        generationParameters: patch.generationParameters
          ? { ...current.generationUnit.generationParameters, ...patch.generationParameters }
          : current.generationUnit.generationParameters,
        generationUnitId: current.generationUnit.generationUnitId,
        revision: current.generationUnit.revision + 1
      },
      referenceBindings: input.referenceBindings ?? current.referenceBindings
    });
  }
  async function listGenerationUnits(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const productionId = requireText(input.productionId, "productionId");
    await requireProduction(projectId, productionId);
    return listUnitRecords(projectId, productionId, input.includeStale === true);
  }
  async function getGenerationUnit(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const productionId = requireText(input.productionId, "productionId");
    await requireProduction(projectId, productionId);
    const unit = await getUnitRecord(
      projectId,
      productionId,
      requireText(input.generationUnitId, "generationUnitId"),
      input.includeStale === true
    );
    if (!unit) throw new UnuTvError("generation_unit_not_found", `Generation unit not found: ${input.generationUnitId}`, 404);
    return unit;
  }

  async function compileGenerationUnit(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const productionId = requireText(input.productionId, "productionId"); const production = await requireProduction(projectId, productionId);
    const unitRecord = await getGenerationUnit({ projectId, productionId, generationUnitId: input.generationUnitId });
    const storyPacket = await getStoryPacketRecord(projectId, productionId, input.storyPacketId); if (!storyPacket) throw new UnuTvError("story_packet_required", "A complete StoryProductionPacket is required before Prompt compilation", 409);
    const visualBible = await getVisualBibleRecord(projectId, productionId);
    if (!visualBible) throw new UnuTvError("visual_bible_required", "A complete VisualBible is required before Prompt compilation", 409);
    const shots = [];
    for (const link of unitRecord.generationUnit.shotLinks) {
      const shot = await getShotRecord(projectId, productionId, link.shotId);
      if (!shot) throw new UnuTvError("cinematic_shot_not_found", `Cinematic shot not found: ${link.shotId}`, 409);
      shots.push(shot);
    }
    const [professionalContributions, assetAuthorities, evaluations, reviews, assets] = await Promise.all([
      listContributionRecords(projectId, productionId),
      listAssetAuthorityRecords(projectId, productionId),
      listEvaluationRecords(projectId, productionId),
      ports.projects.listReviews(projectId),
      ports.projects.listAssets(projectId)
    ]);
    const identity = deriveIdentityForShots(assetAuthorities, shots);
    assertGenerationUnitIdentity({ authorities: assetAuthorities, generationUnit: unitRecord.generationUnit, identity });
    const mediaRecords = await loadCurrentAssetMediaRecords({ assets, getMedia: ports.media?.open?.bind(ports.media), projectId });
    const characterIdentityMediaAuthorityAudit = assessCharacterIdentityMediaAuthority({
      assets, assetAuthorities, characterAuthorityIds: identity.characterAuthorityIds, mediaRecords, reviews
    });
    const executionNode = unitRecord.generationUnit.executionNodeId
      ? await ports.projects.getNode(projectId, unitRecord.generationUnit.executionNodeId)
      : null;
    const liveCanvasForAuthority = executionNode
      ? await ports.projects.openCanvas(projectId, executionNode.canvasId)
      : null;
    const sceneAuthorityAudit = auditGenerationUnitSceneAuthority({
      assets,
      authorities: assetAuthorities,
      canvasNodes: liveCanvasForAuthority?.nodes ?? [],
      generationUnit: unitRecord.generationUnit,
      mediaRecords,
      reviews,
      shots
    });
    const sequenceWorkspaceAudit = unitRecord.generationUnit.sequenceWorkspaceBinding ? await dependencies.getSequenceWorkspaceEvidence({ generationUnit: unitRecord.generationUnit, productionId, projectId }) : null;
    const inheritedExpertPackIds = [...new Set(professionalContributions.map((entry) => entry.expertPackId).filter(Boolean))];
    const inheritedKnowledgeRefs = [...new Set(professionalContributions.flatMap((entry) => Array.isArray(entry.knowledgeRefs) ? entry.knowledgeRefs : []))];
    const references = await buildGenerationUnitReferences({
      generationUnit: unitRecord.generationUnit,
      listStoryboardRecords,
      productionId,
      projectId,
      referenceBindings: unitRecord.referenceBindings,
      shots
    });
    const { directorReferences, storyboardReferences } = references;
    let { combinedReferences } = references;
    const canvasGraph = await resolveCanvasReferenceGraph({ ports, projectId, generationUnit: unitRecord.generationUnit, referenceBindings: combinedReferences });
    combinedReferences = canvasGraph.referenceBindings;
    const referenceSetAudit = auditSelectedStoryboardReferences({
      generationParameters: unitRecord.generationUnit.generationParameters,
      referenceBindings: combinedReferences,
      storyboardReferences
    });
    const executionGateEvidence = buildExecutionGateEvidence(professionalContributions, assetAuthorities, {
      evaluations,
      generationUnit: unitRecord.generationUnit,
      referenceBindings: combinedReferences,
      reviews, sequenceWorkspaceAudit, shots, storyPacket,
      teamManifestIds: production.teamManifestIds,
      knowledgePort: dependencies.knowledge ?? null
    });
    const compilationUnit = {
      productionId,
      ...enforceProductionSignoffGates({
      ...unitRecord.generationUnit,
      characterAuthorityIds: identity.characterAuthorityIds,
      characterIdentitySourceVersions: identity.sourceVersions,
      requiredCapabilities: [...new Set([
        ...(unitRecord.generationUnit.requiredCapabilities || []),
        ...(identity.virtualPersonAssetIds.length ? ["virtual_person_asset"] : [])
      ])],
      executionGateEvidence,
      generationParameters: {
        ...unitRecord.generationUnit.generationParameters,
        virtualPersonAssetIds: identity.virtualPersonAssetIds,
        referenceMediaIds: combinedReferences
          .filter((binding) => binding.providerEligible !== false)
          .filter((binding) => ![unitRecord.generationUnit.generationParameters.firstFrameMediaId, unitRecord.generationUnit.generationParameters.lastFrameMediaId].includes(binding.mediaId))
          .map((binding) => binding.mediaId)
      }
      }, production)
    };
    const envelope = compileCinematicPrompt({
      generationUnit: compilationUnit,
      referenceBindings: combinedReferences,
      shots,
      storyPacket,
      visualBible,
      teamManifestIds: production.teamManifestIds,
      expertPackIds: [...new Set([...inheritedExpertPackIds, ...(Array.isArray(input.expertPackIds) ? input.expertPackIds : [])])],
      knowledgeRefs: [...new Set([...inheritedKnowledgeRefs, ...(Array.isArray(input.knowledgeRefs) ? input.knowledgeRefs : [])])],
      manualOverride: input.manualOverride === true,
      manualPrompt: input.manualPrompt
    });
    applyCinematicCompilationAudits(envelope, {
      canvasGraphAudit: canvasGraph.audit,
      characterIdentityMediaAuthorityAudit,
      sceneAuthorityAudit,
      referenceSetAudit,
      requireCanvasGraph: compilationUnit.canvasGraphPolicy === "required"
    });
    appendCompilationSourceVersions(envelope, {
      assetAuthorities,
      authoritativeTailHandoff: executionGateEvidence.authoritativeTailHandoff,
      continuityAudit: executionGateEvidence.continuityAudit, sequenceStateAudit: executionGateEvidence.sequenceStateAudit, sequenceWorkspaceAudit: executionGateEvidence.sequenceWorkspaceAudit,
      directorReferences, ownerStoryShotReview: executionGateEvidence.ownerStoryShotReview,
      production, professionalContributions, referenceBindings: combinedReferences, reviews,
      segmentSeamAudit: executionGateEvidence.segmentSeamAudit,
      storyboardReferences, referenceSetAudit
    });
    envelope.sourceVersions.canvasProductionGraph = canvasGraph.audit;
    envelope.sourceVersions.characterIdentityMediaAuthority = characterIdentityMediaAuthorityAudit.formalBindings;
    if (sceneAuthorityAudit.sourceVersion) {
      envelope.sourceVersions.sceneAuthorityMedia = sceneAuthorityAudit.sourceVersion;
    }
    const compilation = { compilationId: createId("prompt-compilation"), productionId, generationUnitId: unitRecord.generationUnit.generationUnitId, envelope, createdAt: nowIso() };
    await saveCompilationRecord(projectId, compilation);
    await persistCompiledPromptOnCanvas({ dependencies, ports, projectId, compilation, generationUnit: compilationUnit, canvasGraph });
    return compilation;
  }

  async function preflightGenerationUnit(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const productionId = requireText(input.productionId, "productionId");
    const generationUnitId = requireText(input.generationUnitId, "generationUnitId");
    let compilation = await getCompilationRecord(projectId, productionId, generationUnitId);
    if (!compilation
      || input.recompile === true
      || compilation.envelope?.compilerVersion !== CINEMATIC_PROMPT_COMPILER_VERSION) {
      compilation = await compileGenerationUnit({ ...input, projectId, productionId, generationUnitId });
    }
    const unitRecord = await getGenerationUnit({ projectId, productionId, generationUnitId });
    const staleSources = await findCompilationStaleness(projectId, productionId, unitRecord, compilation); const result = {
      compilationId: compilation.compilationId,
      continuityAudit: compilation.envelope.sourceVersions?.continuityAudit ?? null,
      envelope: compilation.envelope,
      generationUnitId,
      lint: compilation.envelope.lint,
      preflight: compilation.envelope.preflight,
      stale: staleSources.length > 0,
      staleSources,
      ready: staleSources.length === 0 && compilation.envelope.lint.ok && compilation.envelope.preflight.ok
    };
    await syncGenerationUnitPreflightNode({ generationUnit: unitRecord.generationUnit, preflightResult: result, getNode: ports.projects.getNode?.bind(ports.projects), projectId, updateNode: dependencies.updateNode }); return result;
  }

  async function addProfessionalContribution(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const productionId = requireText(input.productionId, "productionId");
    const production = await requireProduction(projectId, productionId);
    const contribution = {
      ...requireObject(input.contribution, "contribution"),
      contributionId: input.contribution?.contributionId || createId("professional-contribution"),
      revision: requireCinematicRevision(input.contribution?.revision),
      createdAt: nowIso()
    };
    assertCinematicContract("ProfessionalContribution", contribution);
    const saved = await saveContributionRecord(projectId, productionId, contribution);
    await projectSoundContributionOnCanvas({ contribution: saved, dependencies, ports, production, productionId, projectId });
    return saved;
  }

  async function listProfessionalContributions(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const productionId = requireText(input.productionId, "productionId");
    await requireProduction(projectId, productionId);
    return listContributionRecords(
      projectId,
      productionId,
      input.targetType,
      input.targetId,
      input.includeStale === true
    );
  }
  async function listAssetAuthorities(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const productionId = requireText(input.productionId, "productionId");
    await requireProduction(projectId, productionId);
    return listAssetAuthorityRecords(projectId, productionId);
  }
  return {
    ...reviewUseCases,
    addProfessionalContribution,
    compileGenerationUnit,
    createCinematicProduction,
    getCinematicProduction,
    getGenerationUnit,
    getModelCapabilities: getCinematicModelCapabilities,
    getShot,
    getStoryPacket,
    getVisualBible,
    listCinematicProductions,
    listAssetAuthorities,
    listProfessionalContributions,
    listGenerationUnits,
    listShots,
    preflightGenerationUnit,
    runGenerationUnit,
    saveGenerationUnit,
    saveShot,
    saveStoryPacket,
    saveVisualBible,
    updateGenerationUnit,
    updateShot,
    updateCinematicProduction
  }; }
