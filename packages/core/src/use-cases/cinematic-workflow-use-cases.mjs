import {
  createId,
  requireObject,
  requireText,
  resolveCinematicFormatProfile,
  UnuTvError
} from "@ununu/unutv-contracts";
import { assertCinematicProductionWorkflow, buildCinematicWorkflowManifest } from "../cinematic-workflow-policy.mjs";
import {
  auditCinematicCanvasOverlaps,
  buildCinematicCanvasLayout,
  cinematicProductionNodes
} from "../cinematic-canvas-layout.mjs";
import {
  requiresStoryboardLineageRebase,
  storyboardLineageRepairJobId
} from "../cinematic-workflow-repair-policy.mjs";
import { buildStoryboardRetakeDirective } from "../storyboard-retake-directive-policy.mjs";
import { deriveNextActionFromTasks } from "../orchestration/next-action.mjs";
import { autoSignoffGenerationUnit } from "../workers/expert-signoff-worker.mjs";
import { createCinematicEpisodeAuthoringUseCase } from "./cinematic-episode-authoring-use-case.mjs";
import { createCinematicScreenplayRevisionUseCase } from "./cinematic-screenplay-revision-use-case.mjs";
import { latestSequencePrevis } from "../latest-sequence-previs-policy.mjs";

export function findReusableProviderRunForFailedIntent(runs = [], failedRunId = null) {
  const failed = runs.find((run) => run.id === failedRunId);
  if (!failed) return null;
  const request = failed.request || {};
  return runs
    .filter((run) => run.id !== failed.id)
    .filter((run) => ["queued", "running", "succeeded"].includes(run.status))
    .filter((run) => run.nodeId === failed.nodeId)
    .filter((run) => run.request?.generationUnitId === request.generationUnitId)
    .filter((run) => run.request?.cinematicPromptCompilationId === request.cinematicPromptCompilationId)
    .filter((run) => run.request?.cinematicPayloadHash === request.cinematicPayloadHash)
    .sort((left, right) => String(left.createdAt).localeCompare(String(right.createdAt)))[0] ?? null;
}

export function generationUnitRequiresVideoArtifact(entry) {
  return (entry?.generationUnit?.lifecycle ?? "active") === "active";
}

export function createCinematicWorkflowUseCases(ports, {
  cinematic,
  projectControl,
  automationTasks,
  agentContext,
  skillContext,
  automationExecutor,
  knowledge = null,
  series = null,
  reviewTarget = null,
  storyboards = null,
  runProjectTransaction = null,
  createScriptRow = null,
  deleteScriptRow = null,
  getScriptDocument = null,
  saveScreenplayDocument = null,
  updateScriptRow = null,
  scriptPlanning = null,
  createNode = null,
  updateNode = null,
  connectEdge = null,
  sequenceWorkspace = null
}) {
  function meaningfulStory(story) {
    return Boolean(
      story
      && story.status !== "needs_story_authoring"
      && story.storyPacket?.status !== "needs_story_authoring"
      && story.characters?.length
      && story.causalEventChain?.length
    );
  }

  async function startCinematicWorkflow(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const configuration = requireObject(input.configuration, "configuration", {});
    let productionId = input.productionId ?? configuration.productionId ?? null;
    let sourceNodeId = input.sourceNodeId ?? configuration.sourceNodeId ?? null;
    const seriesId = input.seriesId ?? configuration.seriesId ?? null;
    const episodeNumber = input.episodeNumber ?? configuration.episodeNumber ?? null;
    const brief = input.brief ?? configuration.brief ?? "";

    // Optional series episode open: create episode production if needed
    let episode = null;
    let assetReuse = null;
    let seriesContext = null;
    if (seriesId && series?.createEpisode) {
      const detail = await series.getSeries({ seriesId });
      seriesContext = detail;
      episode = detail.episodes.find((entry) => entry.episodeNumber === Number(episodeNumber)) || null;
      if (!episode) {
        episode = await series.createEpisode({
          seriesId,
          projectId,
          productionId,
          sourceNodeId,
          episodeNumber: episodeNumber || (detail.episodes.length + 1),
          brief,
          title: input.episodeTitle || `第${episodeNumber || detail.episodes.length + 1}集`
        });
        productionId = episode.productionId;
      } else {
        productionId = episode.productionId;
        sourceNodeId = sourceNodeId || episode.sourceNodeId;
      }
      assetReuse = await series.bindSharedAssetsForEpisode({ seriesId });
    }

    productionId = requireText(productionId, "productionId");
    const production = await cinematic.getCinematicProduction({ projectId, productionId });
    sourceNodeId = requireText(sourceNodeId ?? production.sourceNodeId, "sourceNodeId");
    const sourceNode = await ports.projects.getNode(projectId, sourceNodeId);
    const loadedSkillContext = input.skillContext ?? configuration.workflowManifest?.skillContext ?? skillContext;
    if (!loadedSkillContext) throw new UnuTvError("cinematic_skill_context_required", "The runtime must load the cinematic Skill before starting a workflow", 500);

    // A series episode may inherit ledger facts and frozen identity entries,
    // but that context is not a completed story. Persist it only as an
    // explicitly labelled authoring seed so the next stages still block until
    // a real StoryPacket/VisualBible/script is supplied.
    if (seriesContext?.ledger && cinematic.saveStoryPacket) {
      const existingStory = await cinematic.getStoryPacket({ projectId, productionId }).catch(() => null);
      if (!existingStory) {
        const inheritedCharacters = (seriesContext.library?.entries || [])
          .filter((entry) => entry.kind === "character")
          .map((entry) => ({ name: entry.displayName, goal: "待剧情编排输入", resistance: "待剧情编排输入" }));
        if (inheritedCharacters.length) {
          await cinematic.saveStoryPacket({
            projectId,
            productionId,
            storyPacket: {
              sourceFacts: [brief],
              lockedStoryFacts: seriesContext.ledger.plot?.revealedFacts || [],
              scenePurpose: brief,
              characters: inheritedCharacters,
              causalEventChain: [brief],
              dialogue: [],
              emotionalArc: { start: "待剧情编排输入", change: "待剧情编排输入", end: "待剧情编排输入" },
              entranceState: { description: "待剧情编排输入" },
              exitState: { description: "待剧情编排输入" },
              mustNotAppearYet: seriesContext.ledger.plot?.forbiddenEarlyInfo || [],
              userLockedText: [],
              status: "needs_story_authoring",
              source: "series_ledger_context_only"
            }
          });
        }
      }
    }

    const manifest = buildCinematicWorkflowManifest({
      ...configuration.workflowManifest,
      ...input.workflowManifest,
      workflowId: input.workflowId ?? configuration.workflowId ?? createId("cinematic-workflow"),
      productionId,
      sourceNodeId,
      projectType: production.projectType,
      aspectRatio: input.aspectRatio ?? configuration.aspectRatio ?? configuration.workflowManifest?.aspectRatio,
      targetDurationSeconds: input.targetDurationSeconds ?? configuration.targetDurationSeconds ?? configuration.workflowManifest?.targetDurationSeconds,
      generationStrategies: input.generationStrategies ?? configuration.generationStrategies ?? configuration.workflowManifest?.generationStrategies,
      skillContext: loadedSkillContext
    });
    assertCinematicProductionWorkflow({ production, sourceNode, manifest });
    const context = agentContext
      ? await agentContext.snapshot({
        projectId, productionId, sourceNodeId, workflowId: manifest.workflowId,
        skill: manifest.skillContext
      })
      : null;
    const persistedManifest = {
      ...(context ? { ...manifest, agentContext: context } : manifest),
      seriesId,
      episodeNumber: episode?.episodeNumber ?? episodeNumber,
      episodeId: episode?.episodeId ?? null,
      brief,
      platformOs: "v1",
      sharedAssetBindings: assetReuse?.bindings || []
    };
    const started = await projectControl.startAutomation({
      projectId,
      leaseTtlMs: input.leaseTtlMs,
      configuration: {
        ...configuration,
        productionId,
        sourceNodeId,
        aspectRatio: persistedManifest.aspectRatio,
        seriesId,
        episodeNumber: persistedManifest.episodeNumber,
        episodeId: persistedManifest.episodeId,
        brief,
        execute: input.execute === true || configuration.execute === true || configuration.fullDelivery === true || configuration.oneShot === true,
        oneShot: configuration.oneShot === true || input.oneShot === true,
        fullDelivery: configuration.fullDelivery === true || input.fullDelivery === true,
        // ACCEPT is a creative decision backed by a real evaluation record;
        // never turn a missing/unknown take into an automatic acceptance.
        autoAcceptTakes: false,
        workflowManifest: persistedManifest,
        workflowId: persistedManifest.workflowId,
        skillId: persistedManifest.skillId,
        skillVersion: persistedManifest.skillVersion,
        targetDurationSeconds: persistedManifest.targetDurationSeconds,
        deliveryMode: persistedManifest.deliveryMode,
        billingMode: persistedManifest.billingMode,
        generationStrategies: persistedManifest.generationStrategies,
        agentContext: context,
        sharedAssetBindings: persistedManifest.sharedAssetBindings
      }
    });
    if (episode && series?.linkEpisodeWorkflow) {
      try {
        episode = await series.linkEpisodeWorkflow({
          seriesId,
          episodeId: episode.episodeId,
          workflowRunId: started.run?.id ?? null,
          productionId,
          sourceNodeId,
          status: "running"
        });
      } catch {
        // best-effort episode workflow link
      }
    }
    const status = await getCinematicWorkflowStatus({ projectId, automationRunId: started.run?.id });
    return {
      ...started,
      workflowManifest: persistedManifest,
      agentContext: context,
      providerCallsIssued: false,
      nextGate: "previs_accept_then_single_formal_intent",
      nextAction: status.nextAction,
      seriesId,
      episode,
      assetReuse
    };
  }

  async function getCinematicWorkflowStatus(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const runs = await ports.projects.listAutomationRuns(projectId);
    const run = input.automationRunId
      ? await ports.projects.getAutomationRun(projectId, requireText(input.automationRunId, "automationRunId"))
      : runs.filter((candidate) => candidate.configuration?.workflowManifest)
        .sort((left, right) => String(right.updatedAt ?? right.createdAt).localeCompare(String(left.updatedAt ?? left.createdAt)))[0] ?? null;
    if (!run?.configuration?.workflowManifest) {
      return {
        workflowManifest: null,
        run: null,
        session: await projectControl.getProjectControl({ projectId }),
        tasks: [],
        nextAction: null,
        promptAuthority: null,
        screenplayAuthority: null,
        screenplayRevisionContract: null,
        assetReuse: null
      };
    }
    const session = await projectControl.getProjectControl({ projectId });
    const tasks = await automationTasks.listAutomationTasks({ projectId, automationRunId: run.id });
    const productionId = run.configuration.productionId;
    let promptAuthority = null;
    try {
      const units = await cinematic.listGenerationUnits({ projectId, productionId });
      if (units[0]) {
        const compilation = await ports.projects.getPromptCompilation?.(
          projectId,
          productionId,
          units[0].generationUnit.generationUnitId
        );
        const draft = compilation?.envelope?.promptDraft;
        promptAuthority = {
          compilationId: compilation?.compilationId ?? null,
          payloadHash: compilation?.envelope?.payloadHash ?? null,
          status: draft?.status
            || (compilation?.envelope?.lint?.ok && compilation?.envelope?.preflight?.ok ? "preflight_ready" : compilation ? "draft" : "missing"),
          generationUnitId: units[0].generationUnit.generationUnitId
        };
      } else {
        promptAuthority = { compilationId: null, payloadHash: null, status: "missing", generationUnitId: null };
      }
    } catch {
      promptAuthority = { compilationId: null, payloadHash: null, status: "missing", generationUnitId: null };
    }

    const seriesId = run.configuration.seriesId || run.configuration.workflowManifest?.seriesId || null;
    let assetReuse = null;
    if (seriesId && series?.bindSharedAssetsForEpisode) {
      try { assetReuse = await series.bindSharedAssetsForEpisode({ seriesId }); }
      catch { assetReuse = null; }
    }

    const authoringGaps = [];
    let screenplayAuthority = {
      targetType: "structured_script",
      targetId: run.configuration.sourceNodeId,
      revision: null,
      contentChecksum: null,
      scriptDocumentRevision: null
    };
    let screenplayRevisionContract = null;
    try {
      const [story, bible, document, sourceNode] = await Promise.all([
        cinematic.getStoryPacket({ projectId, productionId }),
        cinematic.getVisualBible({ projectId, productionId }),
        getScriptDocument?.({ projectId, nodeId: run.configuration.sourceNodeId }),
        ports.projects.getNode(projectId, run.configuration.sourceNodeId)
      ]);
      if (!meaningfulStory(story)) authoringGaps.push("story_packet");
      if (!bible) authoringGaps.push("visual_bible");
      if (!document?.rows?.length) authoringGaps.push("structured_script_rows");
      const screenplayDocument = document?.screenplayDocument ?? null;
      screenplayAuthority = {
        targetType: "structured_script",
        targetId: run.configuration.sourceNodeId,
        revision: Number.isInteger(screenplayDocument?.revision)
          ? screenplayDocument.revision
          : Number.isInteger(document?.screenplayRevision) && document.screenplayRevision > 0
            ? document.screenplayRevision
            : Number.isInteger(document?.revision) ? document.revision : null,
        contentChecksum: screenplayDocument?.checksum ?? null,
        scriptDocumentRevision: Number.isInteger(document?.revision) ? document.revision : null
      };
      const activeRevisionContract = sourceNode?.payload?.screenplayRevisionContract;
      if (
        sourceNode?.payload?.authoringMode === "screenplay_development"
        && activeRevisionContract?.format === "ScreenplayRevisionContractV1"
      ) {
        screenplayRevisionContract = activeRevisionContract;
      }
    } catch {
      authoringGaps.push("authoring_state_unreadable");
    }

    let layoutOverlaps = [];
    try {
      const project = await ports.projects.open(projectId);
      const canvas = await ports.projects.openCanvas(projectId, project.rootCanvasId);
      layoutOverlaps = auditCinematicCanvasOverlaps(canvas, productionId).globalOverlaps;
    } catch {
      layoutOverlaps = [];
    }

    const generationIntegrityIssues = [];
    const videoTask = tasks.find((task) => task.stage === "video_generation");
    if (videoTask && ["succeeded", "reused"].includes(videoTask.status)) {
      try {
        const [units, providerRuns] = await Promise.all([
          cinematic.listGenerationUnits({ projectId, productionId }),
          ports.projects.listRuns(projectId)
        ]);
        // Serial scene generation deliberately keeps downstream units blocked
        // until the immediately preceding take is accepted. Those units cannot
        // legally have Provider artifacts yet, so integrity audits must only
        // cover units whose lifecycle is currently executable.
        for (const entry of units.filter(generationUnitRequiresVideoArtifact)) {
          const generationUnitId = entry.generationUnit.generationUnitId;
          const matchingRuns = providerRuns.filter((candidate) => candidate.request?.generationUnitId === generationUnitId);
          const successful = matchingRuns.find((candidate) => (
            candidate.status === "succeeded"
            && candidate.result?.artifacts?.some((artifact) => artifact.kind === "video" && artifact.id)
          ));
          const artifact = successful?.result?.artifacts?.find((candidate) => candidate.kind === "video" && candidate.id);
          let materialized = false;
          if (artifact?.id) {
            try { materialized = Boolean(ports.media?.open?.(projectId, artifact.id)); }
            catch { materialized = false; }
          }
          if (!successful || !artifact || !materialized) {
            generationIntegrityIssues.push({
              generationUnitId,
              generationUnitRevision: entry.generationUnit.revision,
              executionNodeId: entry.generationUnit.executionNodeId,
              failedRunIds: matchingRuns.filter((candidate) => candidate.status === "blocked" || candidate.status === "failed").map((candidate) => candidate.id),
              successfulRunId: successful?.id ?? null,
              videoMediaId: artifact?.id ?? null
            });
          }
        }
      } catch {
        generationIntegrityIssues.push({
          generationUnitId: null,
          generationUnitRevision: null,
          executionNodeId: null,
          failedRunIds: [],
          successfulRunId: null,
          videoMediaId: null,
          code: "generation_integrity_unreadable"
        });
      }
    }

    const nextAction = deriveNextActionFromTasks({
      projectId,
      automationRunId: run.id,
      tasks,
      session,
      seriesId,
      episodeNumber: run.configuration.episodeNumber ?? run.configuration.workflowManifest?.episodeNumber ?? null,
      promptAuthority,
      screenplayAuthority,
      screenplayRevisionContract,
      assetReuse,
      authoringGaps,
      layoutOverlaps,
      generationIntegrityIssues
    });

    const workflowManifest = {
      ...run.configuration.workflowManifest,
      aspectRatio: run.configuration.aspectRatio || run.configuration.workflowManifest.aspectRatio,
      formatProfile: run.configuration.workflowManifest.formatProfile
        || (run.configuration.aspectRatio ? resolveCinematicFormatProfile({ aspectRatio: run.configuration.aspectRatio }) : null)
    };
    return {
      workflowManifest,
      run: { ...run, configuration: { ...run.configuration, workflowManifest } },
      session,
      tasks,
      nextAction,
      promptAuthority,
      screenplayAuthority,
      screenplayRevisionContract,
      assetReuse
    };
  }

  async function reflowCinematicCanvas(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const status = await getCinematicWorkflowStatus({ projectId, automationRunId: input.automationRunId });
    if (!status.run) throw new UnuTvError("cinematic_workflow_not_found", "No cinematic workflow run found", 404);
    if (status.nextAction?.blocker?.code !== "canvas_nodes_overlap") {
      throw new UnuTvError(
        "cinematic_next_action_mismatch",
        `Canvas reflow is not the current Skill action; current action is ${status.nextAction?.type || "none"}`,
        409,
        { nextAction: status.nextAction }
      );
    }
    const project = await ports.projects.open(projectId);
    let canvas = await ports.projects.openCanvas(projectId, project.rootCanvasId);
    const productionId = status.run.configuration.productionId;
    const nodes = cinematicProductionNodes(canvas, productionId);
    const productionNodeIds = new Set(nodes.map((node) => node.id));
    const obstacles = canvas.nodes.filter((node) => !productionNodeIds.has(node.id));
    const layout = buildCinematicCanvasLayout(nodes, { obstacles });
    const moved = [];
    for (const placement of layout) {
      const node = canvas.nodes.find((entry) => entry.id === placement.nodeId);
      if (!node || (node.x === placement.x && node.y === placement.y)) continue;
      const updated = typeof ports.projects.updateNodeLayout === "function"
        ? await ports.projects.updateNodeLayout(projectId, node.id, {
            x: placement.x,
            y: placement.y
          }, node.revision)
        : await updateNode({
            projectId,
            nodeId: node.id,
            x: placement.x,
            y: placement.y,
            expectedRevision: node.revision
          });
      moved.push({ nodeId: updated.id, x: updated.x, y: updated.y, revision: updated.revision });
      canvas = await ports.projects.openCanvas(projectId, project.rootCanvasId);
    }
    const overlapAudit = auditCinematicCanvasOverlaps(canvas, productionId);
    if (overlapAudit.productionOverlapCount || overlapAudit.globalOverlapCount) {
      throw new UnuTvError(
        "canvas_reflow_incomplete",
        "Collision-free canvas reflow left residual production or cross-domain overlaps",
        500,
        {
          productionOverlapCount: overlapAudit.productionOverlapCount,
          globalOverlapCount: overlapAudit.globalOverlapCount,
          productionOverlaps: overlapAudit.productionOverlaps,
          globalOverlaps: overlapAudit.globalOverlaps
        }
      );
    }
    const next = await getCinematicWorkflowStatus({ projectId, automationRunId: status.run.id });
    return {
      format: "CinematicCanvasReflowReceiptV1",
      projectId,
      productionId,
      canvasId: project.rootCanvasId,
      moved,
      overlapCount: 0,
      productionOverlapCount: 0,
      globalOverlapCount: 0,
      nextAction: next.nextAction
    };
  }

  async function reconcileProviderSubmission(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const status = await getCinematicWorkflowStatus({ projectId, automationRunId: input.automationRunId });
    if (!status.run) throw new UnuTvError("cinematic_workflow_not_found", "No cinematic workflow run found", 404);
    if (status.nextAction?.blocker?.code !== "paid_submission_outcome_unknown") {
      throw new UnuTvError(
        "cinematic_next_action_mismatch",
        `Provider reconciliation is not the current Skill action; current action is ${status.nextAction?.type || "none"}`,
        409,
        { nextAction: status.nextAction }
      );
    }
    const productionId = status.run.configuration.productionId;
    const jobId = requireText(status.nextAction.blocker.details?.jobId, "nextAction.blocker.details.jobId");
    const itemId = requireText(status.nextAction.blocker.details?.itemId, "nextAction.blocker.details.itemId");
    const job = await storyboards.getStoryboardBatchJob({ projectId, productionId, jobId });
    const item = job.items.find((entry) => entry.id === itemId);
    if (!item) throw new UnuTvError("storyboard_batch_item_not_found", `Storyboard batch item not found: ${itemId}`, 404);
    if (job.kind !== "image" || job.configuration?.billingMode !== "provider_account") {
      throw new UnuTvError(
        "provider_submission_manual_reconciliation_required",
        "Unknown paid video/audio outcomes require explicit provider-side tracing; the cinematic Skill will not abandon or duplicate them automatically",
        409,
        { jobId, itemId, runId: item.providerRunId, kind: job.kind, billingMode: job.configuration?.billingMode ?? null }
      );
    }
    const blockedTask = status.tasks.find((task) => task.id === status.nextAction.blocker.taskId)
      ?? status.tasks.find((task) => task.status === "blocked");
    const operationContext = {
      actorType: "automation",
      actorId: "cinematic-provider-reconciliation",
      automationRunId: status.run.id,
      idempotencyKey: status.nextAction.idempotencyKey
    };
    let retriedItem;
    try {
      retriedItem = await storyboards.retryStoryboardBatchItem({
        projectId,
        productionId,
        jobId,
        itemId,
        abandonUnknownSubmission: true,
        operationContext
      });
    } catch (error) {
      if (error.code !== "storyboard_batch_generation_coverage_stale") throw error;
      const cancelledJob = await storyboards.cancelStoryboardBatchJob({
        projectId,
        productionId,
        jobId,
        operationContext: {
          ...operationContext,
          idempotencyKey: `${status.nextAction.idempotencyKey}:cancel-incomplete-coverage`
        }
      });
      if (blockedTask && automationExecutor?.retryAutomationTask) {
        await automationExecutor.retryAutomationTask({
          projectId,
          automationRunId: status.run.id,
          taskId: blockedTask.id,
          note: "Cancelled the incomplete storyboard batch and re-queued image generation for the complete current shot set"
        });
      }
      const next = await getCinematicWorkflowStatus({ projectId, automationRunId: status.run.id });
      return {
        format: "ProviderReconciliationReceiptV1",
        projectId,
        productionId,
        jobId,
        itemId,
        previousRunId: item.providerRunId ?? null,
        strategy: "cancel_incomplete_coverage_and_requeue",
        cancelledJob,
        nextAction: next.nextAction
      };
    }
    if (blockedTask && automationExecutor?.retryAutomationTask) {
      await automationExecutor.retryAutomationTask({
        projectId,
        automationRunId: status.run.id,
        taskId: blockedTask.id,
        note: "Abandoned an unconfirmed zero-cost image intent and re-queued it with a new deterministic provider intent"
      });
    }
    const next = await getCinematicWorkflowStatus({ projectId, automationRunId: status.run.id });
    return {
      format: "ProviderReconciliationReceiptV1",
      projectId,
      productionId,
      jobId,
      itemId,
      previousRunId: item.providerRunId ?? null,
      strategy: "abandon_unknown_zero_cost_image",
      job: retriedItem,
      nextAction: next.nextAction
    };
  }

  /**
   * Platform advance: fill structural gaps then run automation executor once.
   */
  async function advanceCinematicWorkflow(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    let statusBefore = await getCinematicWorkflowStatus(input);
    if (!statusBefore.run) throw new UnuTvError("cinematic_workflow_not_found", "No cinematic workflow run found", 404);
    const controlLeaseExpiresAt = Date.parse(statusBefore.session?.leaseExpiresAt ?? "");
    if (
      statusBefore.session?.state === "auto_running"
      && Number.isFinite(controlLeaseExpiresAt)
      && controlLeaseExpiresAt <= Date.now()
      && projectControl.recoverAutomation
    ) {
      await projectControl.recoverAutomation({
        projectId,
        automationRunId: statusBefore.run.id
      });
      statusBefore = await getCinematicWorkflowStatus(input);
    }
    const automationRunId = statusBefore.run.id;
    const productionId = statusBefore.run.configuration.productionId;
    const workerResults = [];
    const configuration = statusBefore.run.configuration || {};
    const sourceNodeId = configuration.sourceNodeId || statusBefore.workflowManifest?.sourceNodeId;
    if (
      statusBefore.nextAction?.type === "advance"
      && ["auto_paused", "auto_failed", "manual_editable"].includes(statusBefore.session?.state)
      && projectControl.resumeAutomation
    ) {
      await projectControl.resumeAutomation({ projectId, automationRunId });
      statusBefore = await getCinematicWorkflowStatus({ projectId, automationRunId });
    }

    if (sequenceWorkspace && automationTasks?.invalidateAutomationTasks) {
      const [shots, sequencePrevis] = await Promise.all([
        cinematic.listShots({ projectId, productionId }),
        sequenceWorkspace.listSequencePrevis({ projectId, productionId })
          .then(latestSequencePrevis)
      ]);
      const shotRevisions = new Map(shots.map((shot) => [shot.shotId, shot.revision]));
      const stalePrevisShots = sequencePrevis
        ? sequencePrevis.shots.filter((shot) => shotRevisions.get(shot.shotId) !== shot.shotRevision)
        : [];
      const previsTask = statusBefore.tasks.find((task) => task.stage === "previs_design");
      if (
        sequencePrevis
        && previsTask
        && ["succeeded", "reused"].includes(previsTask.status)
        && (sequencePrevis.shots.length !== shots.length || stalePrevisShots.length)
      ) {
        const invalidation = await automationTasks.invalidateAutomationTasks({
          projectId,
          automationRunId,
          fromStage: "previs_design",
          reason: {
            code: "sequence_previs_shot_revision_stale",
            sequencePrevisId: sequencePrevis.sequencePrevisId,
            sequencePrevisRevision: sequencePrevis.revision,
            staleShots: stalePrevisShots.map((shot) => ({
              shotId: shot.shotId,
              previsShotRevision: shot.shotRevision,
              currentShotRevision: shotRevisions.get(shot.shotId) ?? null
            }))
          }
        });
        if (statusBefore.session?.state !== "auto_running") {
          await projectControl.resumeAutomation({ projectId, automationRunId });
        }
        workerResults.push({
          worker: "sequence-previs-lineage",
          ok: true,
          sequencePrevisId: sequencePrevis.sequencePrevisId,
          sequencePrevisRevision: sequencePrevis.revision,
          invalidatedStages: invalidation.affectedStages
        });
        statusBefore = await getCinematicWorkflowStatus({ projectId, automationRunId });
      }
    }

    if ([
      "cinematic_video_artifact_missing",
      "scene_authority_canvas_source_required"
    ].includes(statusBefore.nextAction?.blocker?.code)) {
      const { ensureGenerationUnitsForProduction } = await import("../workers/unit-design-worker.mjs");
      const repairedUnits = await ensureGenerationUnitsForProduction({
        projectId,
        productionId,
        cinematic,
        projects: ports.projects,
        generationStrategies: configuration.generationStrategies
          || configuration.workflowManifest?.generationStrategies
          || {},
        storyboards,
        sequenceWorkspace,
        media: ports.media,
        createNode,
        updateNode,
        connectEdge,
        referenceBindings: configuration.referenceBindings || [],
        referenceMediaIds: configuration.referenceMediaIds || [],
        visualAnchorPolicy: configuration.visualAnchorPolicy || null,
        generationMode: configuration.generationMode || null,
        aspectRatio: configuration.aspectRatio || configuration.workflowManifest?.aspectRatio || "16:9",
        preserveExistingUnitContracts: false
      });
      const rewindStages = new Set([
        "prompt_compile",
        "video_generation",
        "sound_design",
        "continuity_qa",
        "timeline_edit",
        "candidate_render",
        "delivery_qc"
      ]);
      for (const task of statusBefore.tasks.filter((candidate) => rewindStages.has(candidate.stage))) {
        await ports.projects.updateAutomationTask(projectId, {
          ...task,
          status: "queued",
          output: {},
          error: null,
          budgetReservationId: null,
          workerLeaseId: null,
          heartbeatAt: null,
          leaseExpiresAt: null,
          startedAt: null,
          completedAt: null,
          updatedAt: new Date().toISOString()
        });
      }
      if (statusBefore.session?.state !== "auto_running") {
        await projectControl.resumeAutomation({ projectId, automationRunId });
      }
      workerResults.push({
        worker: "provider-artifact-integrity",
        ok: true,
        repairedGenerationUnitIds: [
          ...(repairedUnits.updated || []).map((entry) => entry.generationUnit.generationUnitId),
          ...(repairedUnits.created || []).map((entry) => entry.generationUnit.generationUnitId)
        ],
        rewindFrom: "prompt_compile"
      });
      statusBefore = await getCinematicWorkflowStatus({ projectId, automationRunId });
    }

    if (
      statusBefore.nextAction?.blocker?.code === "provider_request_failed"
      && /input image may contain real person/iu.test(statusBefore.nextAction?.blocker?.message || "")
    ) {
      const { ensureGenerationUnitsForProduction } = await import("../workers/unit-design-worker.mjs");
      const repairedUnits = await ensureGenerationUnitsForProduction({
        projectId,
        productionId,
        cinematic,
        projects: ports.projects,
        generationStrategies: configuration.generationStrategies
          || configuration.workflowManifest?.generationStrategies
          || {},
        storyboards,
        sequenceWorkspace,
        media: ports.media,
        createNode,
        updateNode,
        connectEdge,
        referenceBindings: configuration.referenceBindings || [],
        referenceMediaIds: configuration.referenceMediaIds || [],
        visualAnchorPolicy: configuration.visualAnchorPolicy || null,
        generationMode: configuration.generationMode || null,
        aspectRatio: configuration.aspectRatio || configuration.workflowManifest?.aspectRatio || "16:9",
        preserveExistingUnitContracts: false
      });
      const rewindStages = new Set([
        "prompt_compile",
        "video_generation",
        "sound_design",
        "continuity_qa",
        "timeline_edit",
        "candidate_render",
        "delivery_qc"
      ]);
      for (const task of statusBefore.tasks.filter((candidate) => rewindStages.has(candidate.stage))) {
        await ports.projects.updateAutomationTask(projectId, {
          ...task,
          status: "queued",
          output: {},
          error: null,
          budgetReservationId: null,
          workerLeaseId: null,
          heartbeatAt: null,
          leaseExpiresAt: null,
          startedAt: null,
          completedAt: null,
          updatedAt: new Date().toISOString()
        });
      }
      if (statusBefore.session?.state !== "auto_running") {
        await projectControl.resumeAutomation({ projectId, automationRunId });
      }
      workerResults.push({
        worker: "seedance-reference-safety",
        ok: true,
        strategy: "accepted_clean_previs_plus_virtual_person_assets",
        repairedGenerationUnitIds: [
          ...(repairedUnits.updated || []).map((entry) => entry.generationUnit.generationUnitId),
          ...(repairedUnits.created || []).map((entry) => entry.generationUnit.generationUnitId)
        ],
        rewindFrom: "prompt_compile"
      });
      statusBefore = await getCinematicWorkflowStatus({ projectId, automationRunId });
    }

    if (
      statusBefore.nextAction?.blocker?.code === "provider_request_failed"
      && /image format is not supported/iu.test(statusBefore.nextAction?.blocker?.message || "")
    ) {
      const sharp = (await import("sharp")).default;
      const project = await ports.projects.open(projectId);
      let canvas = await ports.projects.openCanvas(projectId, project.rootCanvasId);
      const units = await cinematic.listGenerationUnits({ projectId, productionId });
      const rasterized = [];
      for (const entry of units) {
        const binding = entry.referenceBindings?.find((candidate) => (
          candidate.providerEligible !== false
          && candidate.role === "director_keyframe"
        ));
        if (!binding) continue;
        const sourceNode = binding.sourceNodeId
          ? await ports.projects.getNode(projectId, binding.sourceNodeId)
          : canvas.nodes.find((node) => (
            node.payload?.currentMediaId === binding.mediaId
            || node.payload?.mediaIds?.includes?.(binding.mediaId)
          ));
        if (!sourceNode) {
          throw new UnuTvError(
            "canvas_reference_node_required",
            `${binding.mediaId} 缺少可见低模预演源节点，不能生成 Provider PNG。`,
            409,
            { mediaId: binding.mediaId }
          );
        }
        const existingProviderMediaId = sourceNode.payload?.providerReferenceMediaId;
        const existingProviderMedia = existingProviderMediaId
          ? ports.media.open(projectId, existingProviderMediaId)
          : null;
        let providerMedia = existingProviderMedia;
        if (!providerMedia || providerMedia.mimeType !== "image/png") {
          const sourceMedia = ports.media.open(projectId, binding.mediaId);
          if (!sourceMedia) throw new UnuTvError("media_not_found", `低模预演媒体不存在：${binding.mediaId}`, 404);
          const pngBytes = await sharp(sourceMedia.filePath, { density: 144 })
            .resize({ width: 864, height: 1536, fit: "fill" })
            .png({ compressionLevel: 9 })
            .toBuffer();
          providerMedia = await ports.media.importBytes({
            projectId,
            nodeId: sourceNode.id,
            kind: "image",
            mimeType: "image/png",
            bytes: pngBytes,
            title: `${sourceNode.title}-provider.png`
          });
        }
        const currentNode = await ports.projects.getNode(projectId, sourceNode.id);
        const mediaIds = [...new Set([
          ...(Array.isArray(currentNode.payload?.mediaIds) ? currentNode.payload.mediaIds : []),
          binding.mediaId,
          providerMedia.id
        ])];
        await updateNode({
          projectId,
          nodeId: currentNode.id,
          expectedRevision: currentNode.revision,
          payload: {
            ...currentNode.payload,
            mediaIds,
            providerReferenceMediaId: providerMedia.id,
            providerReferenceMimeType: providerMedia.mimeType,
            providerReferenceChecksum: providerMedia.sha256,
            providerReferenceDerivedFromMediaId: binding.mediaId,
            providerEligible: true
          }
        });
        rasterized.push({
          generationUnitId: entry.generationUnit.generationUnitId,
          sourceMediaId: binding.mediaId,
          providerMediaId: providerMedia.id,
          checksum: providerMedia.sha256,
          sourceNodeId: sourceNode.id
        });
        canvas = await ports.projects.openCanvas(projectId, project.rootCanvasId);
      }
      if (!rasterized.length) {
        throw new UnuTvError(
          "provider_reference_rasterization_required",
          "没有找到可栅格化的低模预演 Provider 参考。",
          409
        );
      }
      const rewindStages = new Set([
        "prompt_compile",
        "video_generation",
        "sound_design",
        "continuity_qa",
        "timeline_edit",
        "candidate_render",
        "delivery_qc"
      ]);
      for (const task of statusBefore.tasks.filter((candidate) => rewindStages.has(candidate.stage))) {
        await ports.projects.updateAutomationTask(projectId, {
          ...task,
          status: "queued",
          output: {},
          error: null,
          budgetReservationId: null,
          workerLeaseId: null,
          heartbeatAt: null,
          leaseExpiresAt: null,
          startedAt: null,
          completedAt: null,
          updatedAt: new Date().toISOString()
        });
      }
      if (statusBefore.session?.state !== "auto_running") {
        await projectControl.resumeAutomation({ projectId, automationRunId });
      }
      workerResults.push({
        worker: "provider-reference-rasterization",
        ok: true,
        format: "image/png",
        rasterized
      });
      statusBefore = await getCinematicWorkflowStatus({ projectId, automationRunId });
    }

    if (statusBefore.nextAction?.blocker?.code === "provider_request_failed" && automationExecutor?.retryAutomationTask) {
      const providerRuns = await ports.projects.listRuns(projectId);
      const reusableRun = findReusableProviderRunForFailedIntent(
        providerRuns,
        statusBefore.nextAction?.blocker?.details?.runId
      );
      const blockedTask = statusBefore.tasks.find((task) => (
        task.id === statusBefore.nextAction.blocker.taskId
        && task.status === "blocked"
      ));
      if (reusableRun && blockedTask) {
        await automationExecutor.retryAutomationTask({
          projectId,
          automationRunId,
          taskId: blockedTask.id,
          note: `Reuse existing unresolved Provider run ${reusableRun.id}; do not submit another paid intent`
        });
        workerResults.push({
          worker: "provider-pending-intent-dedup",
          ok: true,
          failedRunId: statusBefore.nextAction.blocker.details.runId,
          reusedRunId: reusableRun.id
        });
        statusBefore = await getCinematicWorkflowStatus({ projectId, automationRunId });
      }
    }

    if (
      requiresStoryboardLineageRebase(statusBefore.nextAction?.blocker)
      && automationExecutor?.retryAutomationTask
      && scriptPlanning
      && storyboards
    ) {
      const blockedTask = statusBefore.tasks.find((task) => (
        task.id === statusBefore.nextAction.blocker.taskId && task.status === "blocked"
      ));
      const jobId = storyboardLineageRepairJobId(statusBefore.nextAction.blocker);
      if (blockedTask) {
        if (jobId) {
          const job = await storyboards.getStoryboardBatchJob({ projectId, productionId, jobId });
          if (job && !job.cancelledAt && job.status !== "cancelled") {
            await storyboards.cancelStoryboardBatchJob({
              projectId,
              productionId,
              jobId,
              operationContext: {
                actorType: "automation",
                actorId: "cinematic-storyboard-lineage-repair",
                automationRunId,
                idempotencyKey: `${statusBefore.nextAction.idempotencyKey}:cancel-stale-batch`
              }
            });
          }
        }
        await scriptPlanning.planCinematicFromScript({
          projectId,
          productionId,
          sourceNodeId,
          createStoryboard: true,
          operationContext: {
            actorType: "automation",
            actorId: "cinematic-storyboard-lineage-repair",
            automationRunId,
            idempotencyKey: `${statusBefore.nextAction.idempotencyKey}:rebase-storyboard`
          }
        });
        await automationExecutor.retryAutomationTask({
          projectId,
          automationRunId,
          taskId: blockedTask.id,
          note: "Cancelled the stale Storyboard batch, rebound the Storyboard to current Shot revisions, and queued one new lineage-bound batch"
        });
        workerResults.push({
          worker: "storyboard-batch-lineage-repair",
          ok: true,
          cancelledJobId: jobId
        });
        statusBefore = await getCinematicWorkflowStatus({ projectId, automationRunId });
      }
    }

    const runtimeRepairableBlockers = new Set([
      "cinematic_asset_readiness_required",
      "cinematic_development_review_required",
      "revision_conflict",
      "ERR_SQLITE_ERROR",
      "invalid_cinematic_contract",
      "automation_generation_unit_preflight_failed",
      "sequence_previs_frame_pixel_acceptance_required",
      "sequence_previs_owner_acceptance_required",
      "shot_script_owner_acceptance_required",
      "director_capture_not_found",
      "continuity_evaluation_required",
      "latest_cinematic_evaluation_rejected",
      "structured_continuity_evaluation_required",
      "structured_continuity_state_required",
      "timeline_post_repairs_required",
      "timeline_aspect_ratio_mismatch"
    ]);
    if (runtimeRepairableBlockers.has(statusBefore.nextAction?.blocker?.code) && automationExecutor?.retryAutomationTask) {
      if (statusBefore.session?.state === "manual_editable" && projectControl.resumeAutomation) {
        await projectControl.resumeAutomation({ projectId, automationRunId });
        statusBefore = await getCinematicWorkflowStatus({ projectId, automationRunId });
      }
      const conflictedTask = statusBefore.tasks.find((task) => (
        task.id === statusBefore.nextAction.blocker.taskId
        || (task.status === "blocked" && runtimeRepairableBlockers.has(task.error?.code))
      ));
      if (conflictedTask) {
        await automationExecutor.retryAutomationTask({
          projectId,
          automationRunId,
          taskId: conflictedTask.id,
          note: "Retry the current stage after the persisted contract/evidence repair; no Provider intent is duplicated"
        });
      }
    }

    // Full pipeline / one-shot: bootstrap missing upstream contracts before stage execution.
    if (
      !configuration.workflowManifest
      && (configuration.oneShot || configuration.fullDelivery)
      && configuration.brief
      && sourceNodeId
    ) {
      try {
        const { bootstrapEpisodeFromBrief } = await import("../workers/bootstrap-episode-worker.mjs");
        if (createScriptRow && getScriptDocument && scriptPlanning) {
          const boot = await bootstrapEpisodeFromBrief({
            projectId,
            productionId,
            sourceNodeId,
            brief: configuration.brief,
            targetDurationSeconds: configuration.targetDurationSeconds || statusBefore.workflowManifest?.targetDurationSeconds || 8,
            aspectRatio: configuration.aspectRatio || "9:16",
            generationStrategies: configuration.generationStrategies || statusBefore.workflowManifest?.generationStrategies || {},
            autoOwnerAccept: false,
            referenceBindings: configuration.referenceBindings || [],
            referenceMediaIds: configuration.referenceMediaIds || [],
            visualAnchorPolicy: configuration.visualAnchorPolicy || null,
            generationMode: configuration.generationMode || null,
            storyPacket: configuration.storyPacket || null,
            visualBible: configuration.visualBible || null,
            scriptRows: configuration.scriptRows || null,
            cinematic,
            projects: ports.projects,
            createScriptRow,
            getScriptDocument,
            scriptPlanning,
            reviewTarget,
            series,
            seriesId: configuration.seriesId || statusBefore.workflowManifest?.seriesId,
            knowledge,
            storyboards
          });
          workerResults.push({ worker: "bootstrap", ok: true, steps: boot.steps?.map((entry) => entry.step) });
        }
      } catch (error) {
        // Bootstrap is best-effort; unit-design path below still helps.
        workerResults.push({ worker: "bootstrap", ok: false, error: { code: error.code, message: error.message } });
      }
    }

    // Auto knowledge-grounded signoff when knowledge port is present and units exist
    if (knowledge) {
      try {
        const units = await cinematic.listGenerationUnits({ projectId, productionId });
        for (const entry of units) {
          const existing = await cinematic.listProfessionalContributions({ projectId, productionId });
          const hasForUnit = existing.some((item) => item.targetId === entry.generationUnit.generationUnitId
            && Array.isArray(item.knowledgeRefs) && item.knowledgeRefs.some((ref) => String(ref).startsWith("kn-")));
          if (hasForUnit) continue;
          const signed = await autoSignoffGenerationUnit({
            projectId,
            productionId,
            generationUnitId: entry.generationUnit.generationUnitId,
            roles: ["continuity", "cinematography"],
            cinematic,
            knowledge
          });
          workerResults.push({
            worker: "expert_signoff",
            ok: true,
            generationUnitId: entry.generationUnit.generationUnitId,
            contributionCount: signed.contributions.length
          });
        }
      } catch (error) {
        workerResults.push({ worker: "expert_signoff", ok: false, error: { code: error.code, message: error.message, details: error.details } });
      }
    }

    let advanceResult = null;
    if (automationExecutor?.advanceAutomation) {
      advanceResult = await automationExecutor.advanceAutomation({
        projectId,
        automationRunId,
        releaseWaitingLease: true,
        forceOneStep: true
      });
    }
    const status = await getCinematicWorkflowStatus({ projectId, automationRunId });
    return {
      ...status,
      advanceResult,
      workerResults,
      providerCallsIssued: Boolean(advanceResult?.task?.stage && /generation|sound|render/i.test(advanceResult.task.stage))
    };
  }

  async function ownerDecision(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const targetType = requireText(input.targetType, "targetType");
    const targetId = requireText(input.targetId, "targetId");
    const state = requireText(input.state, "state");
    if (!["accepted", "rejected"].includes(state)) {
      throw new UnuTvError("invalid_payload", "state must be accepted or rejected", 400);
    }
    if (typeof reviewTarget !== "function") {
      throw new UnuTvError("review_port_unavailable", "Owner decision requires reviewTarget use-case", 500);
    }
    const statusBefore = await getCinematicWorkflowStatus({ projectId, automationRunId: input.automationRunId });
    const sequencePrevisId = input.sequencePrevisId
      || statusBefore.nextAction?.blocker?.details?.sequencePrevisId
      || null;
    const sequencePrevisRevision = input.revision
      || statusBefore.nextAction?.blocker?.details?.revision
      || null;
    const review = targetType === "cinematic_sequence_previs_revision" && sequencePrevisId && sequenceWorkspace
      ? (await sequenceWorkspace.reviewSequencePrevis({
        projectId,
        productionId: statusBefore.run.configuration.productionId,
        sequencePrevisId,
        revision: sequencePrevisRevision,
        state,
        ...(input.playbackReceiptId ? { playbackReceiptId: input.playbackReceiptId } : {}),
        note: input.note || ""
      })).review
      : await reviewTarget({
        projectId,
        targetType,
        targetId,
        state,
        note: input.note || "",
        ...(input.reviewId ? { reviewId: input.reviewId } : {}),
        ...(input.evidence ? { evidence: input.evidence } : {}),
        operationContext: statusBefore.session?.automationRunId
          ? {
            actorType: "owner_gate",
            actorId: "cinematic-owner-gate",
            automationRunId: statusBefore.run.id,
            idempotencyKey: `owner-decision:${targetType}:${targetId}:${state}`
          }
          : undefined
      });
    const currentBlocker = statusBefore.nextAction?.blocker;
    const listedTargets = Array.isArray(currentBlocker?.details?.targets)
      ? currentBlocker.details.targets
      : [];
    const matchingListedTarget = listedTargets.find((entry) => (
      entry?.targetId === targetId
      || entry?.mediaId === targetId
      || entry?.generationUnitId === targetId
    )) ?? null;
    const resolvesCurrentBlocker = currentBlocker?.targetType === targetType && (
      currentBlocker?.targetId === targetId
      || Boolean(matchingListedTarget)
    );
    let rejectedStoryboardTarget = matchingListedTarget;
    if (
      state === "rejected"
      && targetType === "media"
      && !rejectedStoryboardTarget
      && storyboards?.listStoryboards
    ) {
      const boards = await storyboards.listStoryboards({
        projectId,
        productionId: statusBefore.run.configuration.productionId
      });
      for (const board of boards) {
        const shot = board.shots.find((entry) => entry.imageMediaId === targetId);
        if (!shot) continue;
        rejectedStoryboardTarget = {
          storyboardId: board.storyboardId,
          storyboardShotId: shot.storyboardShotId,
          shotId: shot.shotId,
          mediaId: targetId
        };
        break;
      }
    }
    if (
      state === "rejected"
      && targetType === "media"
      && rejectedStoryboardTarget?.storyboardId
      && rejectedStoryboardTarget?.storyboardShotId
      && storyboards?.setStoryboardShotMedia
    ) {
      await storyboards.setStoryboardShotMedia({
        projectId,
        productionId: statusBefore.run.configuration.productionId,
        storyboardId: rejectedStoryboardTarget.storyboardId,
        storyboardShotId: rejectedStoryboardTarget.storyboardShotId,
        imageMediaId: null,
        retakeDirective: buildStoryboardRetakeDirective({
          directive: input.retakeDirective,
          note: input.note,
          rejectedMediaId: targetId,
          review
        })
      });
    }
    let status = await getCinematicWorkflowStatus({ projectId, automationRunId: statusBefore.run?.id });
    const blockedTask = status.tasks.find((task) => task.status === "blocked");
    if (resolvesCurrentBlocker && blockedTask && ["auto_running", "auto_paused", "auto_failed"].includes(status.session?.state) && automationExecutor?.retryAutomationTask) {
      try {
        const staleStoryboardBatchJobId = blockedTask.error?.details?.jobId ?? null;
        if (staleStoryboardBatchJobId && storyboards?.cancelStoryboardBatchJob) {
          await storyboards.cancelStoryboardBatchJob({
            projectId,
            productionId: status.run.configuration.productionId,
            jobId: staleStoryboardBatchJobId
          });
        }
        await automationExecutor.retryAutomationTask({
          projectId,
          automationRunId: status.run.id,
          taskId: blockedTask.id,
          note: input.note || (state === "accepted"
            ? "Owner gate accepted through cinematic workflow"
            : "Owner rejected the storyboard frame; clear only that frame and regenerate it through the cinematic workflow")
        });
      } catch (error) {
        if (!["automation_task_not_blocked", "automation_retry_unavailable"].includes(error.code)) throw error;
      }
      status = await getCinematicWorkflowStatus({ projectId, automationRunId: status.run.id });
    } else if (resolvesCurrentBlocker && status.session && ["auto_paused", "auto_failed"].includes(status.session.state) && projectControl.resumeAutomation) {
      try { await projectControl.resumeAutomation({ projectId, automationRunId: status.run?.id }); }
      catch { /* keep the persisted gate if resume is not yet valid */ }
    }
    return { review, nextAction: status.nextAction };
  }

  const authorEpisode = createCinematicEpisodeAuthoringUseCase({
    ports,
    automationExecutor,
    automationTasks,
    cinematic,
    connectEdge,
    createNode,
    createScriptRow,
    deleteScriptRow,
    getCinematicWorkflowStatus,
    getScriptDocument,
    runProjectTransaction,
    saveScreenplayDocument,
    storyboards,
    updateNode,
    updateScriptRow
  });

  const reviseCinematicScreenplay = createCinematicScreenplayRevisionUseCase({
    getCinematicWorkflowStatus,
    getNode: ({ projectId, nodeId }) => ports.projects.getNode(projectId, nodeId),
    getScriptDocument,
    updateNode
  });

  return {
    startCinematicWorkflow,
    getCinematicWorkflowStatus,
    reviseCinematicScreenplay,
    advanceCinematicWorkflow,
    authorEpisode,
    reflowCinematicCanvas,
    reconcileProviderSubmission,
    ownerDecision
  };
}
