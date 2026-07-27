import { createId, requireObject, requireText, UnuTvError } from "@ununu/unutv-contracts";
import { assertCinematicProductionWorkflow, buildCinematicWorkflowManifest } from "../cinematic-workflow-policy.mjs";
import { deriveNextActionFromTasks } from "../orchestration/next-action.mjs";
import { ensureGenerationUnitsForProduction } from "../workers/unit-design-worker.mjs";
import { autoSignoffGenerationUnit } from "../workers/expert-signoff-worker.mjs";

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
  createScriptRow = null,
  getScriptDocument = null,
  scriptPlanning = null
}) {
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

    const nextAction = deriveNextActionFromTasks({
      projectId,
      automationRunId: run.id,
      tasks,
      session,
      seriesId,
      episodeNumber: run.configuration.episodeNumber ?? run.configuration.workflowManifest?.episodeNumber ?? null,
      promptAuthority,
      assetReuse
    });

    return {
      workflowManifest: run.configuration.workflowManifest,
      run,
      session,
      tasks,
      nextAction,
      promptAuthority,
      assetReuse
    };
  }

  /**
   * Platform advance: fill structural gaps then run automation executor once.
   */
  async function advanceCinematicWorkflow(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const statusBefore = await getCinematicWorkflowStatus(input);
    if (!statusBefore.run) throw new UnuTvError("cinematic_workflow_not_found", "No cinematic workflow run found", 404);
    const automationRunId = statusBefore.run.id;
    const productionId = statusBefore.run.configuration.productionId;
    const workerResults = [];
    const configuration = statusBefore.run.configuration || {};
    const sourceNodeId = configuration.sourceNodeId || statusBefore.workflowManifest?.sourceNodeId;

    // Full pipeline / one-shot: bootstrap missing upstream contracts before stage execution.
    if ((configuration.oneShot || configuration.fullDelivery) && configuration.brief && sourceNodeId) {
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

    // Ensure generation units exist before prompt_compile can succeed
    try {
      const units = await cinematic.listGenerationUnits({ projectId, productionId });
      const shots = await cinematic.listShots({ projectId, productionId });
      if (shots.length && !units.length) {
        const designed = await ensureGenerationUnitsForProduction({
          projectId,
          productionId,
          cinematic,
          projects: ports.projects,
          generationStrategies: statusBefore.run.configuration.generationStrategies
            || statusBefore.workflowManifest?.generationStrategies
            || {},
          referenceBindings: statusBefore.run.configuration.referenceBindings || [],
          referenceMediaIds: statusBefore.run.configuration.referenceMediaIds || [],
          visualAnchorPolicy: statusBefore.run.configuration.visualAnchorPolicy || null,
          generationMode: statusBefore.run.configuration.generationMode || null,
          storyboards,
          aspectRatio: statusBefore.workflowManifest?.contentType === "short_drama" ? "9:16" : "16:9"
        });
        workerResults.push({ worker: "unit_design", ok: true, created: designed.created.length });
      }
    } catch (error) {
      workerResults.push({ worker: "unit_design", ok: false, error: { code: error.code, message: error.message } });
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
      advanceResult = await automationExecutor.advanceAutomation({ projectId, automationRunId });
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
    const review = await reviewTarget({
      projectId,
      targetType,
      targetId,
      state,
      note: input.note || ""
    });
    const status = await getCinematicWorkflowStatus({ projectId, automationRunId: input.automationRunId });
    if (status.session && ["auto_paused", "auto_failed"].includes(status.session.state) && projectControl.resumeAutomation) {
      try {
        await projectControl.resumeAutomation({ projectId, automationRunId: status.run?.id });
      } catch {
        // ignore resume failures
      }
    }
    return { review, nextAction: (await getCinematicWorkflowStatus({ projectId, automationRunId: status.run?.id })).nextAction };
  }

  return {
    startCinematicWorkflow,
    getCinematicWorkflowStatus,
    advanceCinematicWorkflow,
    ownerDecision
  };
}
