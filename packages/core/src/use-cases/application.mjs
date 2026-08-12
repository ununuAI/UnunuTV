import { UnuTvError } from "@ununu/unutv-contracts";
import { createMediaUseCases } from "./media-use-cases.mjs";
import { createAssetUseCases } from "./asset-use-cases.mjs";
import { createNodePromptUseCases } from "./node-prompt-use-cases.mjs";
import { createScriptUseCases } from "./script-use-cases.mjs";
import { createCinematicProductionUseCases } from "./cinematic-production-use-cases.mjs";
import { createCinematicProductionResetUseCase } from "./cinematic-production-reset-use-case.mjs";
import { createCinematicAssetAuthorityUseCases } from "./cinematic-asset-authority-use-cases.mjs";
import { createCinematicAssetAuthorityAggregateUseCases } from "./cinematic-asset-authority-aggregate-use-cases.mjs";
import { createCharacterVoiceAuthorityUseCases } from "./character-voice-authority-use-cases.mjs";
import { createProjectControlUseCases } from "./project-control-use-cases.mjs";
import { createStoryboardUseCases } from "./storyboard-use-cases.mjs";
import { createTimelineUseCases } from "./timeline-use-cases.mjs";
import { createBudgetUseCases } from "./budget-use-cases.mjs";
import { createAutomationTaskUseCases } from "./automation-task-use-cases.mjs";
import { createRenderUseCases } from "./render-use-cases.mjs";
import { createGridUseCases } from "./grid-use-cases.mjs";
import { createImageEditUseCases } from "./image-edit-use-cases.mjs";
import { createDirectorStageUseCases } from "./director-stage-use-cases.mjs";
import { createDirectorCinematicUseCases } from "./director-cinematic-use-cases.mjs";
import { createScriptPlanningUseCases } from "./script-planning-use-cases.mjs";
import { createAutomationExecutorUseCases } from "./automation-executor-use-cases.mjs";
import { createCinematicRevisionReviewUseCase } from "./cinematic-revision-review-use-case.mjs";
import { createCinematicSequenceWorkspaceUseCases } from "./cinematic-sequence-workspace-use-cases.mjs";
import { createCinematicWorkflowUseCases } from "./cinematic-workflow-use-cases.mjs";
import { createCinematicAgentContextUseCase } from "./cinematic-agent-context-use-case.mjs";
import { createSeriesUseCases } from "./series-use-cases.mjs";
import { createOneShotUseCases } from "./one-shot-use-cases.mjs";
import { createShortDramaCanvasUseCases } from "./short-drama-canvas-use-cases.mjs";
import { createCinematicWorkflowEntryUseCases } from "./cinematic-workflow-entry-use-cases.mjs";
import { guardProjectMutations } from "../guard-project-mutations.mjs";
import { ensureGenerationUnitsForProduction } from "../workers/unit-design-worker.mjs";
import { autoSignoffGenerationUnit } from "../workers/expert-signoff-worker.mjs";
import { createApplicationFoundationUseCases } from "./application-foundation-use-cases.mjs";
function requirePorts(ports) { for (const name of ["catalog", "projects", "media", "publisher", "provider", "credentials", "render", "grid"]) {
    if (!ports?.[name]) throw new TypeError(`Missing application port: ${name}`);
  }
}
export function createApplication(ports) {
  requirePorts(ports);
  const { getNodePrompt, saveNodePrompt } = createNodePromptUseCases(ports);
  const foundation = createApplicationFoundationUseCases({ ports, saveNodePrompt });
  const {
    addGroupMember, cancelRun, connectEdge, createCanvas, createGroup, createNode, createProject, deleteGroup, deleteNode,
    disconnectEdge, getDirectorStage, getPanorama, getProviderSettings, getWorkflow, listProjects, listProviderModels, listReviews, listRuns,
    openCanvas, openProject, pollRun, restoreNode, runNode, saveDirectorStage, setPanorama, setWorkflowLayer,
    updateNode, updateProject, updateProviderSettings
  } = foundation;
  const {
    createScriptRow,
    deleteScriptRow,
    getScriptDocument,
    saveScreenplayDocument,
    updateScriptRow
  } = createScriptUseCases(ports);
  const { createVideoQaContactSheet, extractMediaFrame, getMediaPreparation, importDataMedia, importMedia, prepareMedia, publishMedia, separateMediaAudio } = createMediaUseCases(ports, {
    createNode: (input) => createNode(input),
    updateNode: (input) => updateNode(input),
    connectEdge: (input) => connectEdge(input)
  });
  const { addAssetVersion, createAsset, listAssets } = createAssetUseCases(ports);
  const budget = createBudgetUseCases(ports);
  const projectControl = createProjectControlUseCases(ports);
  const sequenceWorkspace = createCinematicSequenceWorkspaceUseCases(ports);
  const cinematicProduction = createCinematicProductionUseCases(ports, {
    budget,
    connectEdge: (input) => connectEdge(input),
    createNode: (input) => createNode(input),
    knowledge: ports.knowledge ?? null,
    pollRun: (input) => pollRun(input),
    runNode: (input) => runNode(input),
    saveNodePrompt: (input) => saveNodePrompt(input),
    updateNode: (input) => updateNode(input), getSequenceWorkspaceEvidence: sequenceWorkspace.getSequenceWorkspaceEvidence
  });
  const cinematicProductionReset = createCinematicProductionResetUseCase(ports);
  const reviewTarget = createCinematicRevisionReviewUseCase(ports, cinematicProduction);
  const cinematicAssetAuthority = createCinematicAssetAuthorityUseCases(ports, {
    addAssetVersion,
    budget,
    getMedia: (projectId, mediaId) => ports.media.open(projectId, mediaId),
    importAuthorityImage: (input) => ports.media.importBytes(input),
    listAssets,
    prepareMedia: (input) => prepareMedia(input),
    runNode: (input) => runNode(input),
    updateNode: (input) => updateNode(input)
  });
  const cinematicAssetAuthorityAggregate = createCinematicAssetAuthorityAggregateUseCases(ports, cinematicAssetAuthority);
  const characterVoiceAuthority = createCharacterVoiceAuthorityUseCases(ports, {
    connectEdge: (input) => connectEdge(input),
    createNode: (input) => createNode(input),
    updateNode: (input) => updateNode(input)
  }), storyboard = createStoryboardUseCases(ports, {
    budget,
    compileStoryboardPrompt: cinematicAssetAuthority.compileStoryboardPrompt,
    pollRun: (input) => pollRun(input),
    runNode: (input) => runNode(input)
  });
  const timeline = createTimelineUseCases(ports);
  const automationTasks = createAutomationTaskUseCases(ports, { budget });
  const agentContext = createCinematicAgentContextUseCase({ cinematic: cinematicProduction, authorities: cinematicAssetAuthority, storyboards: storyboard, timeline });
  const renderJobs = createRenderUseCases(ports);
  const grid = createGridUseCases(ports, { connectEdge, createNode, updateNode });
  const imageEdit = createImageEditUseCases(ports, { updateNode });
  const directorStage = createDirectorStageUseCases(ports, { addAssetVersion, createAsset });
  const directorCinematic = createDirectorCinematicUseCases(ports, cinematicProduction, storyboard);
  const scriptPlanning = createScriptPlanningUseCases(ports, { cinematic: cinematicProduction, getScriptDocument, storyboards: storyboard });
  const series = ports.seriesStore
    ? createSeriesUseCases({ seriesStore: ports.seriesStore, cinematic: cinematicProduction })
    : null;
  const automationExecutor = createAutomationExecutorUseCases(ports, {
    agentContext, automationTasks, authorities: cinematicAssetAuthority, budget, cinematic: cinematicProduction, getScriptDocument,
    knowledge: ports.knowledge ?? null, createNode: (input) => createNode(input),
    updateNode: (input) => updateNode(input),
    connectEdge: (input) => connectEdge(input),
    saveDirectorStage: (input) => saveDirectorStage(input),
    getDirectorStage: (input) => getDirectorStage(input),
    directorCinematic,
    sequenceWorkspace,
    composeGridNode: (input) => grid.composeGridNode(input),
    listAssets, pollRun: (input) => pollRun(input), projectControl, render: renderJobs, runNode: (input) => runNode(input), scriptPlanning, storyboards: storyboard, timeline
  });
  const cinematicWorkflow = createCinematicWorkflowUseCases(ports, {
    agentContext,
    automationExecutor,
    automationTasks,
    cinematic: cinematicProduction,
    knowledge: ports.knowledge ?? null,
    projectControl,
    reviewTarget,
    series,
    storyboards: storyboard,
    skillContext: ports.skillContext,
    runProjectTransaction: typeof ports.projects.runInTransaction === "function"
      ? (input) => ports.projects.runInTransaction(input.projectId, input.work, { operation: input.operation })
      : null,
    createScriptRow,
    deleteScriptRow,
    getScriptDocument,
    saveScreenplayDocument,
    updateScriptRow,
    scriptPlanning,
    createNode: (input) => createNode(input),
    updateNode: (input) => updateNode(input),
    connectEdge: (input) => connectEdge(input),
    sequenceWorkspace
  });
  const cinematicWorkflowEntry = createCinematicWorkflowEntryUseCases({
    createProject: (input) => createProject(input),
    createNode: (input) => createNode(input),
    createCinematicProduction: (input) => cinematicProduction.createCinematicProduction(input),
    startCinematicWorkflow: (input) => cinematicWorkflow.startCinematicWorkflow(input)
  });
  async function designGenerationUnits(input = {}) {
    return ensureGenerationUnitsForProduction({
      projectId: input.projectId,
      productionId: input.productionId,
      cinematic: cinematicProduction,
      projects: ports.projects,
      storyboards: storyboard,
      sequenceWorkspace,
      createNode: (value) => createNode(value),
      updateNode: (value) => updateNode(value),
      connectEdge: (value) => connectEdge(value),
      generationStrategies: input.generationStrategies || {},
      aspectRatio: input.aspectRatio,
      referenceBindings: input.referenceBindings || [],
      referenceMediaIds: input.referenceMediaIds || [],
      visualAnchorPolicy: input.visualAnchorPolicy || null,
      generationMode: input.generationMode || null
    });
  }
  async function autoSignoff(input = {}) {
    if (!ports.knowledge) throw new UnuTvError("knowledge_port_required", "Knowledge port is not configured", 500);
    return autoSignoffGenerationUnit({ ...input, cinematic: cinematicProduction, knowledge: ports.knowledge });
  }
  async function retrieveKnowledge(input = {}) {
    if (!ports.knowledge) throw new UnuTvError("knowledge_port_required", "Knowledge port is not configured", 500);
    return ports.knowledge.retrieveKnowledge(input);
  }

  const oneShot = createOneShotUseCases({
    createProject: (input) => createProject(input),
    createNode: (input) => createNode(input),
    createCinematicProduction: (input) => cinematicProduction.createCinematicProduction(input),
    createSeries: series ? (input) => series.createSeries(input) : null,
    createTimeline: (input) => timeline.createTimeline(input),
    cinematic: cinematicProduction,
    series,
    createScriptRow,
    getScriptDocument,
    scriptPlanning,
    reviewTarget,
    knowledge: ports.knowledge ?? null,
    media: ports.media,
    listGenerationUnits: (input) => cinematicProduction.listGenerationUnits(input),
    getGenerationUnit: (input) => cinematicProduction.getGenerationUnit(input),
    compileGenerationUnit: (input) => cinematicProduction.compileGenerationUnit(input),
    preflightGenerationUnit: (input) => cinematicProduction.preflightGenerationUnit(input),
    runGenerationUnit: (input) => cinematicProduction.runGenerationUnit(input),
    addEvaluation: (input) => cinematicProduction.addEvaluation(input),
    listStoryboards: (input) => storyboard.listStoryboards(input),
    setStoryboardShotMedia: (input) => storyboard.setStoryboardShotMedia(input),
    importStoryboardToTimeline: (input) => storyboard.importStoryboardToTimeline(input),
    createRenderJob: (input) => renderJobs.createRenderJob(input),
    getRenderJob: (input) => renderJobs.getRenderJob(input),
    listRenderJobs: (input) => renderJobs.listRenderJobs(input),
    createDeliveryPackage: (input) => renderJobs.createDeliveryPackage(input),
    listDeliveryPackages: (input) => renderJobs.listDeliveryPackages(input),
    listAutomationTasks: (input) => automationTasks.listAutomationTasks(input),
    startCinematicWorkflow: (input) => cinematicWorkflow.startCinematicWorkflow(input),
    advanceCinematicWorkflow: (input) => cinematicWorkflow.advanceCinematicWorkflow(input),
    getCinematicWorkflowStatus: (input) => cinematicWorkflow.getCinematicWorkflowStatus(input),
    promoteSeriesAsset: series ? (input) => series.promoteSeriesAsset(input) : null,
    commitSeriesLedger: series ? (input) => series.commitSeriesLedger(input) : null
  });

  const shortDramaCanvas = createShortDramaCanvasUseCases({
    createProject: (input) => createProject(input),
    createNode: (input) => createNode(input),
    connectEdge: (input) => connectEdge(input),
    openCanvas: (input) => openCanvas(input),
    updateNode: (input) => updateNode(input),
    createAsset: (input) => createAsset(input),
    addAssetVersion: (input) => addAssetVersion(input),
    listAssets: (input) => listAssets(input),
    importMedia: (input) => importMedia(input),
    importDataMedia: (input) => importDataMedia(input),
    createCinematicProduction: (input) => cinematicProduction.createCinematicProduction(input),
    createSeries: series ? (input) => series.createSeries(input) : null,
    createTimeline: (input) => timeline.createTimeline(input),
    cinematic: cinematicProduction,
    series,
    createScriptRow,
    getScriptDocument,
    scriptPlanning,
    reviewTarget,
    knowledge: ports.knowledge ?? null,
    media: ports.media,
    listGenerationUnits: (input) => cinematicProduction.listGenerationUnits(input),
    getGenerationUnit: (input) => cinematicProduction.getGenerationUnit(input),
    compileGenerationUnit: (input) => cinematicProduction.compileGenerationUnit(input),
    preflightGenerationUnit: (input) => cinematicProduction.preflightGenerationUnit(input),
    runGenerationUnit: (input) => cinematicProduction.runGenerationUnit(input),
    addEvaluation: (input) => cinematicProduction.addEvaluation(input),
    listStoryboards: (input) => storyboard.listStoryboards(input),
    setStoryboardShotMedia: (input) => storyboard.setStoryboardShotMedia(input),
    selectStoryboardImageForVideo: (input) => storyboard.selectStoryboardImageForVideo(input),
    importStoryboardToTimeline: (input) => storyboard.importStoryboardToTimeline(input),
    createStoryboardBatchJob: (input) => storyboard.createStoryboardBatchJob(input),
    createRenderJob: (input) => renderJobs.createRenderJob(input),
    getRenderJob: (input) => renderJobs.getRenderJob(input),
    createDeliveryPackage: (input) => renderJobs.createDeliveryPackage(input),
    promoteSeriesAsset: series ? (input) => series.promoteSeriesAsset(input) : null,
    commitSeriesLedger: series ? (input) => series.commitSeriesLedger(input) : null,
    createStoryboard: (input) => storyboard.createStoryboard(input),
    listShots: (input) => cinematicProduction.listShots(input),
    saveStoryPacket: (input) => cinematicProduction.saveStoryPacket(input),
    saveVisualBible: (input) => cinematicProduction.saveVisualBible(input),
    updateShot: (input) => cinematicProduction.updateShot(input),
    updateGenerationUnit: (input) => cinematicProduction.updateGenerationUnit(input),
    deriveAssetAuthoritiesFromStory: (input) => cinematicAssetAuthority.deriveAssetAuthoritiesFromStory(input),
    compileAssetAuthority: (input) => cinematicAssetAuthority.compileAssetAuthority(input),
    runAssetAuthority: (input) => cinematicAssetAuthority.runAssetAuthority(input),
    compileStoryboardPrompt: (input) => cinematicAssetAuthority.compileStoryboardPrompt(input),
    startCinematicWorkflow: (input) => cinematicWorkflow.startCinematicWorkflow(input),
    advanceCinematicWorkflow: (input) => cinematicWorkflow.advanceCinematicWorkflow(input),
    getCinematicWorkflowStatus: (input) => cinematicWorkflow.getCinematicWorkflowStatus(input),
    listAutomationTasks: (input) => automationTasks.listAutomationTasks(input)
  });

  const application = {
    ...cinematicProduction, ...characterVoiceAuthority,
    ...cinematicProductionReset,
    ...cinematicAssetAuthority,
    ...cinematicAssetAuthorityAggregate,
    ...storyboard,
    ...timeline,
    ...budget,
    ...automationTasks,
    ...renderJobs,
    ...grid,
    ...imageEdit,
    ...directorStage,
    ...directorCinematic,
    ...scriptPlanning,
    ...automationExecutor,
    ...cinematicWorkflow,
    ...cinematicWorkflowEntry,
    ...(series || {}),
    ...oneShot,
    ...shortDramaCanvas,
    designGenerationUnits,
    autoSignoff,
    retrieveKnowledge,
    knowledgeStats: () => ports.knowledge?.stats?.() ?? null,
    ...sequenceWorkspace,
    addAssetVersion,
    addGroupMember,
    cancelRun,
    connectEdge,
    createCanvas,
    createAsset,
    createGroup,
    createNode,
    restoreNode,
    separateMediaAudio,
    createProject,
    createScriptRow,
    createVideoQaContactSheet,
    deleteNode,
    deleteGroup,
    deleteScriptRow,
    disconnectEdge,
    extractMediaFrame,
    getDirectorStage,
    getMediaPreparation,
    getNodePrompt,
    getPanorama,
    getProviderSettings,
    getScriptDocument,
    getWorkflow,
    importDataMedia,
    importMedia,
    listAssets,
    listProviderModels,
    listReviews,
    listRuns,
    listProjects,
    openCanvas,
    openProject,
    pollRun,
    prepareMedia,
    publishMedia,
    reviewTarget,
    runNode,
    saveDirectorStage,
    saveNodePrompt,
    saveScreenplayDocument,
    setPanorama,
    setWorkflowLayer,
    updateNode,
    updateProject,
    updateScriptRow,
    updateProviderSettings
  };
  return guardProjectMutations({ ...application, ...projectControl }, ports); }
