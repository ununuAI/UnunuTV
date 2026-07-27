import {
  CINEMATIC_PRODUCTION_MODES, CINEMATIC_PROJECT_TYPES,
  VIDEO_MODEL_CAPABILITIES, VIDEO_MODEL_REGISTRY_VERSION,
  UnuTvError,
  assertCinematicContract,
  compileCinematicPrompt, storyboardVideoReferenceSemanticControl,
  createId,
  nowIso,
  optionalText,
  requireEnum,
  requireObject,
  requireText
} from "@ununu/unutv-contracts";
import { createCinematicCompilationStalenessInspector } from "./cinematic-compilation-staleness.mjs";
import { appendCompilationSourceVersions, auditSelectedStoryboardReferences, buildExecutionGateEvidence, enforceProductionSignoffGates, selectProviderReferenceBindings } from "./cinematic-compilation-context.mjs";
import { createCinematicGenerationRunUseCase } from "./cinematic-generation-run-use-case.mjs";
import { createCinematicReviewUseCases } from "./cinematic-review-use-cases.mjs";
import { syncGenerationUnitLifecycleNode, syncGenerationUnitPreflightNode } from "../cinematic-generation-unit-node-policy.mjs";
import { persistCompiledPromptOnCanvas, resolveCanvasReferenceGraph } from "../cinematic-canvas-prompt-graph-policy.mjs";

function requireProductionPort(ports, method) {
  if (typeof ports.projects?.[method] !== "function") throw new TypeError(`Missing cinematic production port: projects.${method}`);
  return ports.projects[method].bind(ports.projects); }
function requireRevision(value, fallback = 1) {
  const revision = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(revision) || revision < 1) throw new UnuTvError("invalid_payload", "revision must be a positive integer");
  return revision; }
export function createCinematicProductionUseCases(ports, dependencies = {}) {
  const createProductionRecord = requireProductionPort(ports, "createCinematicProduction");
  const listProductionRecords = requireProductionPort(ports, "listCinematicProductions");
  const getProductionRecord = requireProductionPort(ports, "getCinematicProduction");
  const updateProductionRecord = requireProductionPort(ports, "updateCinematicProduction");
  const saveStoryPacketRecord = requireProductionPort(ports, "saveStoryPacket");
  const getStoryPacketRecord = requireProductionPort(ports, "getStoryPacket");
  const saveVisualBibleRecord = requireProductionPort(ports, "saveVisualBible");
  const getVisualBibleRecord = requireProductionPort(ports, "getVisualBible");
  const saveShotRecord = requireProductionPort(ports, "saveCinematicShot");
  const listShotRecords = requireProductionPort(ports, "listCinematicShots");
  const getShotRecord = requireProductionPort(ports, "getCinematicShot");
  const saveUnitRecord = requireProductionPort(ports, "saveGenerationUnit");
  const listUnitRecords = requireProductionPort(ports, "listGenerationUnits");
  const getUnitRecord = requireProductionPort(ports, "getGenerationUnit");
  const saveCompilationRecord = requireProductionPort(ports, "savePromptCompilation");
  const getCompilationRecord = requireProductionPort(ports, "getPromptCompilation");
  const saveEvaluationRecord = requireProductionPort(ports, "saveCinematicEvaluation");
  const listEvaluationRecords = requireProductionPort(ports, "listCinematicEvaluations");
  const saveContributionRecord = requireProductionPort(ports, "saveProfessionalContribution");
  const listContributionRecords = requireProductionPort(ports, "listProfessionalContributions");
  const listAssetAuthorityRecords = requireProductionPort(ports, "listCinematicAssetAuthorities");
  const linkGenerationUnitRun = requireProductionPort(ports, "linkGenerationUnitRun");
  const listProviderRuns = requireProductionPort(ports, "listRuns");
  const listStoryboardRecords = requireProductionPort(ports, "listStoryboardDocuments");
  const reviewUseCases = createCinematicReviewUseCases({ ports, requireProduction, getUnitRecord, saveEvaluationRecord, listEvaluationRecords });
  const findCompilationStaleness = createCinematicCompilationStalenessInspector({
    getProduction: getProductionRecord, getShot: getShotRecord,
    getStoryPacket: getStoryPacketRecord,
    getVisualBible: getVisualBibleRecord,
    listStoryboards: listStoryboardRecords, listReviews: ports.projects.listReviews?.bind(ports.projects), listEvaluations: listEvaluationRecords,
    listProfessionalContributions: listContributionRecords,
    listAssetAuthorities: listAssetAuthorityRecords
  });
  const runGenerationUnit = createCinematicGenerationRunUseCase({
    budget: dependencies.budget,
    findCompilationStaleness,
    getCompilationRecord,
    getGenerationUnit,
    linkGenerationUnitRun,
    listProviderRuns,
    pollRun: dependencies.pollRun,
    projects: ports.projects,
    runNode: dependencies.runNode,
    saveNodePrompt: dependencies.saveNodePrompt,
    updateNode: dependencies.updateNode
  });
  async function requireProduction(projectId, productionId) {
    const production = await getProductionRecord(projectId, productionId);
    if (!production) throw new UnuTvError("cinematic_production_not_found", `Cinematic production not found: ${productionId}`, 404);
    return production;
  }

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
      revision: requireRevision(input.storyPacket?.revision),
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
      revision: requireRevision(input.visualBible?.revision),
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
    const shot = {
      ...requireObject(input.shot, "shot"),
      shotId: input.shot?.shotId || createId("shot"),
      revision: requireRevision(input.shot?.revision),
      updatedAt: nowIso()
    };
    assertCinematicContract("CinematicShotSpec", shot);
    return saveShotRecord(projectId, productionId, shot, input.expectedRevision);
  }

  async function updateShot(input = {}) {
    const current = await getShot(input);
    return saveShot({
      ...input,
      expectedRevision: input.expectedRevision ?? current.revision,
      shot: { ...current, ...requireObject(input.patch ?? input.shot, "patch"), shotId: current.shotId, revision: current.revision + 1 }
    });
  }

  async function listShots(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const productionId = requireText(input.productionId, "productionId");
    await requireProduction(projectId, productionId);
    return listShotRecords(projectId, productionId);
  }

  async function getShot(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const productionId = requireText(input.productionId, "productionId");
    await requireProduction(projectId, productionId);
    const shot = await getShotRecord(projectId, productionId, requireText(input.shotId, "shotId"));
    if (!shot) throw new UnuTvError("cinematic_shot_not_found", `Cinematic shot not found: ${input.shotId}`, 404);
    return shot;
  }

  async function saveGenerationUnit(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const productionId = requireText(input.productionId, "productionId");
    await requireProduction(projectId, productionId);
    const unit = {
      ...requireObject(input.generationUnit, "generationUnit"),
      generationUnitId: input.generationUnit?.generationUnitId || createId("generation-unit"),
      revision: requireRevision(input.generationUnit?.revision),
      updatedAt: nowIso()
    };
    assertCinematicContract("GenerationUnit", unit);
    const productionShots = new Set((await listShotRecords(projectId, productionId)).map((shot) => shot.shotId));
    const missingShot = unit.shotLinks.find((link) => !productionShots.has(link.shotId));
    if (missingShot) throw new UnuTvError("cinematic_shot_not_found", `Generation unit references a shot outside this production: ${missingShot.shotId}`, 400);
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
    return listUnitRecords(projectId, productionId);
  }
  async function getGenerationUnit(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const productionId = requireText(input.productionId, "productionId");
    await requireProduction(projectId, productionId);
    const unit = await getUnitRecord(projectId, productionId, requireText(input.generationUnitId, "generationUnitId"));
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
    const [professionalContributions, assetAuthorities, evaluations, reviews] = await Promise.all([
      listContributionRecords(projectId, productionId),
      listAssetAuthorityRecords(projectId, productionId),
      listEvaluationRecords(projectId, productionId), ports.projects.listReviews(projectId)
    ]);
    const sequenceWorkspaceAudit = unitRecord.generationUnit.sequenceWorkspaceBinding ? await dependencies.getSequenceWorkspaceEvidence({ generationUnit: unitRecord.generationUnit, productionId, projectId }) : null;
    const inheritedExpertPackIds = [...new Set(professionalContributions.map((entry) => entry.expertPackId).filter(Boolean))];
    const inheritedKnowledgeRefs = [...new Set(professionalContributions.flatMap((entry) => Array.isArray(entry.knowledgeRefs) ? entry.knowledgeRefs : []))];
    const unitShotIds = new Set(unitRecord.generationUnit.shotLinks.map((link) => link.shotId));
    const storyboardReferences = (await listStoryboardRecords(projectId, productionId))
      .flatMap((storyboard) => storyboard.shots
        .filter((shot) => unitShotIds.has(shot.shotId) && shot.videoReference?.selected && shot.imageMediaId)
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
          shotId: shot.shotId, checksum: shot.imageChecksum,
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
          providerEligible: shot.cameraTrajectoryPlan?.overlayPolicy !== "editor_only",
          required: true, semanticControl: { temporalRole: "static_state", preserve: ["空间站位", "人物前后层级", "摄影机机位", "画面轴线", "视场与构图"], replace: [], complete: [], ignore: ["代理人物造型", "最终美术风格", "最终灯光", "最终表演节奏"], styleOnly: [] },
          authorityRevision: `director-stage-v${binding.stageRevision}`,
          directorNodeId: binding.directorNodeId,
          captureId: binding.captureId,
          stageRevision: binding.stageRevision,
          shotId: shot.shotId
        };
      });
    const providerReferenceCandidates = selectProviderReferenceBindings(
      unitRecord.generationUnit.generationParameters,
      [...unitRecord.referenceBindings, ...directorReferences, ...storyboardReferences]
    );
    let combinedReferences = [];
    const seenMedia = new Set();
    for (const binding of providerReferenceCandidates) {
      if (seenMedia.has(binding.mediaId)) continue;
      seenMedia.add(binding.mediaId);
      combinedReferences.push({ ...binding, providerIndex: combinedReferences.length + 1 });
    }
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
      executionGateEvidence,
      generationParameters: {
        ...unitRecord.generationUnit.generationParameters,
        referenceMediaIds: combinedReferences
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
    if (!referenceSetAudit.ok) {
      envelope.preflight = {
        ...envelope.preflight,
        ok: false,
        errors: [...(Array.isArray(envelope.preflight?.errors) ? envelope.preflight.errors : []), ...referenceSetAudit.errors]
      };
    }
    if (unitRecord.generationUnit.canvasGraphPolicy === "required" && !canvasGraph.audit.ok) {
      envelope.preflight = {
        ...envelope.preflight,
        ok: false,
        errors: [...(Array.isArray(envelope.preflight?.errors) ? envelope.preflight.errors : []), ...canvasGraph.audit.errors]
      };
    }
    if (envelope.promptDraft) {
      envelope.promptDraft.status = (envelope.lint?.ok !== false && envelope.preflight?.ok)
        ? "preflight_ready"
        : "preflight_blocked";
    }
    appendCompilationSourceVersions(envelope, {
      assetAuthorities,
      authoritativeTailHandoff: executionGateEvidence.authoritativeTailHandoff,
      continuityAudit: executionGateEvidence.continuityAudit, sequenceStateAudit: executionGateEvidence.sequenceStateAudit, sequenceWorkspaceAudit: executionGateEvidence.sequenceWorkspaceAudit,
      directorReferences, ownerStoryShotReview: executionGateEvidence.ownerStoryShotReview,
      production, professionalContributions, referenceBindings: combinedReferences, reviews,
      storyboardReferences, referenceSetAudit
    });
    envelope.sourceVersions.canvasProductionGraph = canvasGraph.audit;
    const compilation = { compilationId: createId("prompt-compilation"), productionId, generationUnitId: unitRecord.generationUnit.generationUnitId, envelope, createdAt: nowIso() };
    await saveCompilationRecord(projectId, compilation);
    await persistCompiledPromptOnCanvas({ dependencies, ports, projectId, compilation, generationUnit: unitRecord.generationUnit, canvasGraph });
    return compilation;
  }

  async function preflightGenerationUnit(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const productionId = requireText(input.productionId, "productionId");
    const generationUnitId = requireText(input.generationUnitId, "generationUnitId");
    let compilation = await getCompilationRecord(projectId, productionId, generationUnitId);
    if (!compilation || input.recompile === true) compilation = await compileGenerationUnit({ ...input, projectId, productionId, generationUnitId });
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
    await requireProduction(projectId, productionId);
    const contribution = {
      ...requireObject(input.contribution, "contribution"),
      contributionId: input.contribution?.contributionId || createId("professional-contribution"),
      revision: requireRevision(input.contribution?.revision),
      createdAt: nowIso()
    };
    assertCinematicContract("ProfessionalContribution", contribution);
    return saveContributionRecord(projectId, productionId, contribution);
  }

  async function listProfessionalContributions(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const productionId = requireText(input.productionId, "productionId");
    await requireProduction(projectId, productionId);
    return listContributionRecords(projectId, productionId, input.targetType, input.targetId);
  }
  async function getModelCapabilities() {
    return { registryVersion: VIDEO_MODEL_REGISTRY_VERSION, models: VIDEO_MODEL_CAPABILITIES };
  }
  return {
    ...reviewUseCases,
    addProfessionalContribution,
    compileGenerationUnit,
    createCinematicProduction,
    getCinematicProduction,
    getGenerationUnit,
    getModelCapabilities,
    getShot,
    getStoryPacket,
    getVisualBible,
    listCinematicProductions,
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
