import { requireText, UnuTvError } from "@ununu/unutv-contracts";
import { assessCinematicDevelopmentReviews } from "../cinematic-development-review-policy.mjs";
import {
  equalEpisodeAuthoringValue,
  parseEpisodeAuthoringPackage,
  validateEpisodeAuthoringAuthority
} from "./cinematic-episode-authoring-validation.mjs";
export function createCinematicEpisodeAuthoringUseCase({
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
}) {
  async function ensureProjectionNode({
    projectId,
    canvas,
    kind,
    title,
    x,
    y,
    resourceType,
    resourceId,
    payload
  }) {
    const current = canvas.nodes.find((node) => (
      node.payload?.resourceType === resourceType
      && node.payload?.resourceId === resourceId
    ));
    if (current) {
      return updateNode({
        projectId,
        nodeId: current.id,
        title,
        x,
        y,
        payload: { ...current.payload, ...payload, resourceType, resourceId },
        expectedRevision: current.revision
      });
    }
    return createNode({
      projectId,
      canvasId: canvas.id,
      kind,
      title,
      x,
      y,
      payload: { ...payload, resourceType, resourceId }
    });
  }
  async function ensureProjectionEdge({ projectId, canvas, fromNodeId, toNodeId, role }) {
    const current = canvas.edges.find((edge) => (
      edge.fromNodeId === fromNodeId
      && edge.toNodeId === toNodeId
      && edge.role === role
    ));
    if (current) return current;
    return connectEdge({ projectId, canvasId: canvas.id, fromNodeId, toNodeId, role });
  }
  return async function authorEpisode(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const status = await getCinematicWorkflowStatus({
      projectId,
      automationRunId: input.automationRunId
    });
    if (!status.run) {
      throw new UnuTvError("cinematic_workflow_not_found", "No cinematic workflow run found", 404);
    }
    const authoringRepair = (
      status.nextAction?.type === "repair"
      && [
        "cinematic_development_review_required",
        "cinematic_shot_formation_required",
        "shot_performance_contract_required"
      ].includes(status.nextAction?.blocker?.code)
    );
    if (status.nextAction?.type !== "author_episode" && !authoringRepair) {
      throw new UnuTvError(
        "cinematic_next_action_mismatch",
        `Episode authoring is not the current Skill action; current action is ${status.nextAction?.type || "none"}`,
        409,
        { nextAction: status.nextAction }
      );
    }
    if (
      !runProjectTransaction
      || !createNode
      || !updateNode
      || !connectEdge
      || !createScriptRow
      || !deleteScriptRow
      || !getScriptDocument
      || !saveScreenplayDocument
      || !updateScriptRow
    ) {
      throw new UnuTvError(
        "episode_authoring_ports_required",
        "Episode authoring requires canvas and structured-script ports",
        500
      );
    }
    const productionId = status.run.configuration.productionId;
    const sourceNodeId = status.run.configuration.sourceNodeId;
    const packageInput = parseEpisodeAuthoringPackage(input, status);
    const {
      authoringPackage,
      duration,
      packageId,
      scriptRows,
      sourceDocumentInput,
      storyPacket,
      visualBible
    } = packageInput;
    const [existingStory, existingBible, sourceNode, currentDocument, project] = await Promise.all([
      cinematic.getStoryPacket({ projectId, productionId }),
      cinematic.getVisualBible({ projectId, productionId }),
      ports.projects.getNode(projectId, sourceNodeId),
      getScriptDocument({ projectId, nodeId: sourceNodeId }),
      ports.projects.open(projectId)
    ]);
    if (!sourceNode || !project?.rootCanvasId) {
      throw new UnuTvError("episode_canvas_source_required", "Episode source and root canvas are required", 409);
    }
    const {
      orderedCurrentRows,
      proposedRows,
      screenplayDevelopmentRevision,
      structuredRowsDiffer
    } = validateEpisodeAuthoringAuthority({
      currentDocument,
      existingBible,
      existingStory,
      packageInput,
      sourceNode,
      sourceNodeId,
      status
    });
    const persistEpisodeAuthoring = async (unitOfWork) => {
      const savedScreenplayResult = await saveScreenplayDocument({
        projectId,
        nodeId: sourceNodeId,
        document: sourceDocumentInput
      });
      const {
        cinematicDerivedStateInvalidations = [],
        ...savedScreenplay
      } = savedScreenplayResult;
      const persistedInvalidation = cinematicDerivedStateInvalidations.find(
        (receipt) => receipt.productionId === productionId
      ) ?? null;
      const cinematicDerivedStateInvalidation = persistedInvalidation ? {
        format: persistedInvalidation.format,
        receiptId: persistedInvalidation.receiptId,
        invalidatedCounts: persistedInvalidation.invalidatedCounts
      } : null;
      await unitOfWork.checkpoint("screenplay", {
        documentId: savedScreenplay.documentId,
        revision: savedScreenplay.revision
      });
      const previousScreenplayRevision = currentDocument.screenplayDocument?.revision
        ?? currentDocument.screenplayRevision
        ?? 0;
      const screenplayRevisionChanged = (
        previousScreenplayRevision > 0
        && savedScreenplay.revision !== previousScreenplayRevision
      ) || (
        screenplayDevelopmentRevision
        && previousScreenplayRevision === 0
        && savedScreenplay.revision === 1
      );
      let savedStory = existingStory;
      if (!existingStory || !equalEpisodeAuthoringValue(
        { ...existingStory, storyPacketId: undefined, revision: undefined, updatedAt: undefined },
        { ...storyPacket, storyPacketId: undefined, revision: undefined, updatedAt: undefined }
      )) {
        savedStory = await cinematic.saveStoryPacket({
          projectId,
          productionId,
          expectedRevision: existingStory?.revision ?? 0,
          storyPacket: {
            ...storyPacket,
            ...(existingStory?.storyPacketId ? { storyPacketId: existingStory.storyPacketId } : {}),
            revision: (existingStory?.revision ?? 0) + 1
          }
        });
      }
      await unitOfWork.checkpoint("story", {
        storyPacketId: savedStory.storyPacketId,
        revision: savedStory.revision
      });

      let savedBible = existingBible;
      if (!existingBible || !equalEpisodeAuthoringValue(
        { ...existingBible, visualBibleId: undefined, revision: undefined, updatedAt: undefined },
        { ...visualBible, visualBibleId: undefined, revision: undefined, updatedAt: undefined }
      )) {
        savedBible = await cinematic.saveVisualBible({
          projectId,
          productionId,
          expectedRevision: existingBible?.revision ?? 0,
          visualBible: {
            ...visualBible,
            ...(existingBible?.visualBibleId ? { visualBibleId: existingBible.visualBibleId } : {}),
            revision: (existingBible?.revision ?? 0) + 1
          }
        });
      }
      await unitOfWork.checkpoint("bible", {
        visualBibleId: savedBible.visualBibleId,
        revision: savedBible.revision
      });

      if (currentDocument.rows.length) {
        if (structuredRowsDiffer) {
          const sharedRowCount = Math.min(orderedCurrentRows.length, scriptRows.length);
          for (let index = 0; index < sharedRowCount; index += 1) {
            const row = orderedCurrentRows[index];
            await updateScriptRow({
              projectId,
              nodeId: sourceNodeId,
              rowId: row.id,
              orderIndex: index,
              shotNumber: scriptRows[index]?.shotNumber ?? index + 1,
              payload: proposedRows[index],
              replacePayload: true
            });
            await unitOfWork.checkpoint("row_update", { rowId: row.id, orderIndex: index });
          }
          for (let index = sharedRowCount; index < scriptRows.length; index += 1) {
            await createScriptRow({
              projectId,
              nodeId: sourceNodeId,
              orderIndex: index,
              shotNumber: scriptRows[index]?.shotNumber ?? index + 1,
              payload: proposedRows[index]
            });
            await unitOfWork.checkpoint("row_create", { orderIndex: index });
          }
          for (let index = sharedRowCount; index < orderedCurrentRows.length; index += 1) {
            await deleteScriptRow({
              projectId,
              nodeId: sourceNodeId,
              rowId: orderedCurrentRows[index].id
            });
            await unitOfWork.checkpoint("row_delete", {
              rowId: orderedCurrentRows[index].id,
              orderIndex: index
            });
          }
        }
      } else {
        for (const [index, row] of scriptRows.entries()) {
          await createScriptRow({
            projectId,
            nodeId: sourceNodeId,
            orderIndex: index,
            shotNumber: row.shotNumber ?? index + 1,
            payload: row.payload ?? row
          });
          await unitOfWork.checkpoint("row_create", { orderIndex: index });
        }
      }

      const revisedShots = [];
      const sourceProjection = await updateNode({
        projectId,
        nodeId: sourceNodeId,
        title: authoringPackage.title || sourceNode.title,
        payload: {
          ...sourceNode.payload,
          content: savedScreenplay.content,
          screenplayDocument: savedScreenplay,
          authoringPackageId: packageId,
          productionId,
          structuredRowCount: scriptRows.length,
          structuredDurationSeconds: duration,
          stage: "script",
          stageStatus: screenplayDevelopmentRevision ? "screenplay_review_required" : "authored",
          ...(screenplayDevelopmentRevision
            ? { authoringMode: "screenplay_review_required", screenplayRevisionContract: null }
            : {}),
          ...(cinematicDerivedStateInvalidation
            ? { cinematicDerivedStateInvalidation }
            : {})
        },
        expectedRevision: sourceNode.revision
      });
      await unitOfWork.checkpoint("node_projection", {
        nodeId: sourceProjection.id,
        resourceType: "structured_script"
      });
      let canvas = await ports.projects.openCanvas(projectId, project.rootCanvasId);
      const storyNode = await ensureProjectionNode({
        projectId,
        canvas,
        kind: "story",
        title: "EP01 故事锁与因果链",
        x: sourceProjection.x + 560,
        y: sourceProjection.y,
        resourceType: "story_packet",
        resourceId: savedStory.storyPacketId,
        payload: {
          productionId,
          revision: savedStory.revision,
          packageId,
          storyPacket: savedStory,
          stage: "script_analysis",
          stageStatus: "ready"
        }
      });
      await unitOfWork.checkpoint("node_projection", {
        nodeId: storyNode.id,
        resourceType: "story_packet"
      });
      canvas = await ports.projects.openCanvas(projectId, project.rootCanvasId);
      const bibleNode = await ensureProjectionNode({
        projectId,
        canvas,
        kind: "cinematic",
        title: "EP01 视觉与声音圣经",
        x: sourceProjection.x + 1248,
        y: sourceProjection.y,
        resourceType: "visual_bible",
        resourceId: savedBible.visualBibleId,
        payload: {
          productionId,
          revision: savedBible.revision,
          packageId,
          visualBible: savedBible,
          stage: "visual_bible",
          stageStatus: "ready"
        }
      });
      await unitOfWork.checkpoint("node_projection", {
        nodeId: bibleNode.id,
        resourceType: "visual_bible"
      });
      canvas = await ports.projects.openCanvas(projectId, project.rootCanvasId);
      await ensureProjectionEdge({
        projectId,
        canvas,
        fromNodeId: sourceNodeId,
        toNodeId: storyNode.id,
        role: "cinematic_stage:story_packet"
      });
      await unitOfWork.checkpoint("edge", { role: "cinematic_stage:story_packet" });
      canvas = await ports.projects.openCanvas(projectId, project.rootCanvasId);
      await ensureProjectionEdge({
        projectId,
        canvas,
        fromNodeId: storyNode.id,
        toNodeId: bibleNode.id,
        role: "cinematic_stage:visual_bible"
      });
      await unitOfWork.checkpoint("edge", { role: "cinematic_stage:visual_bible" });

      let screenplayReviewGate = null;
      let invalidatedStages = [];
      if (screenplayRevisionChanged) {
        const contributions = await cinematic.listProfessionalContributions({ projectId, productionId });
        screenplayReviewGate = assessCinematicDevelopmentReviews({
          contributions,
          screenplayDocument: savedScreenplay,
          storyPacket: savedStory
        });
        const invalidation = await automationTasks.invalidateAutomationTasks({
          projectId,
          automationRunId: status.run.id,
          fromStage: "script_analysis",
          reason: {
            code: "screenplay_authority_revision_changed",
            previousScreenplayDocumentRevision: previousScreenplayRevision,
            screenplayDocumentChecksum: savedScreenplay.checksum,
            screenplayDocumentId: savedScreenplay.documentId,
            screenplayDocumentRevision: savedScreenplay.revision
          },
          rootBlocker: screenplayReviewGate.ok ? null : {
            code: "cinematic_development_review_required",
            message: "完整剧本正文 revision 已变化；script_doctor、dialogue_editor、platform_editor 必须重新精确绑定当前 StoryPacket 与 screenplay id/revision/hash。",
            details: screenplayReviewGate
          }
        });
        invalidatedStages = invalidation.affectedStages;
        await unitOfWork.checkpoint("workflow_task_requeue", {
          action: "invalidate",
          taskId: invalidation.rootTaskId
        });
      } else if (structuredRowsDiffer) {
        const invalidation = await automationTasks.invalidateAutomationTasks({
          projectId,
          automationRunId: status.run.id,
          fromStage: "shot_design",
          reason: {
            code: "structured_shot_contract_revision_changed",
            sourceNodeId,
            sourceDocumentRevision: savedScreenplay.revision,
            sourceDocumentChecksum: savedScreenplay.checksum,
            structuredScriptRevision: sourceProjection.revision
          }
        });
        invalidatedStages = invalidation.affectedStages;
        await unitOfWork.checkpoint("workflow_task_requeue", {
          action: "invalidate",
          taskId: invalidation.rootTaskId
        });
      }

      let next = await getCinematicWorkflowStatus({ projectId, automationRunId: status.run.id });
      const blockedAuthoringTask = next.tasks.find((task) => task.status === "blocked" && (
        [
          "story_packet_required",
          "visual_bible_required",
          "cinematic_development_review_required",
          "cinematic_shot_formation_required"
        ].includes(task.error?.code)
        || [
          "cinematic_shot_formation_required",
          "shot_performance_contract_required"
        ].includes(next.nextAction?.blocker?.code)
      ));
      if (
        blockedAuthoringTask?.error?.code === "cinematic_development_review_required"
        && screenplayReviewGate === null
      ) {
        const contributions = await cinematic.listProfessionalContributions({ projectId, productionId });
        screenplayReviewGate = assessCinematicDevelopmentReviews({
          contributions,
          screenplayDocument: savedScreenplay,
          storyPacket: savedStory
        });
      }
      const developmentReviewCurrent = (
        blockedAuthoringTask?.error?.code !== "cinematic_development_review_required"
        || screenplayReviewGate?.ok === true
      );
      if (blockedAuthoringTask && developmentReviewCurrent && automationExecutor?.retryAutomationTask) {
        const staleStoryboardBatchJobId = blockedAuthoringTask.error?.details?.jobId ?? null;
        if (staleStoryboardBatchJobId && storyboards?.cancelStoryboardBatchJob) {
          await storyboards.cancelStoryboardBatchJob({
            projectId,
            productionId,
            jobId: staleStoryboardBatchJobId
          });
          await unitOfWork.checkpoint("workflow_task_requeue", {
            action: "cancel_stale_storyboard",
            jobId: staleStoryboardBatchJobId
          });
        }
        await automationExecutor.retryAutomationTask({
          projectId,
          automationRunId: status.run.id,
          taskId: blockedAuthoringTask.id,
          note: "EpisodeAuthoringPackageV1 atomically resolved the authoring, shot-formation or performance-contract gate"
        });
        await unitOfWork.checkpoint("workflow_task_requeue", {
          action: "retry",
          taskId: blockedAuthoringTask.id
        });
        next = await getCinematicWorkflowStatus({ projectId, automationRunId: status.run.id });
      }
      return {
        format: "EpisodeAuthoringReceiptV1",
        packageId,
        productionId,
        sourceNodeId,
        screenplayDocumentId: savedScreenplay.documentId,
        screenplayDocumentRevision: savedScreenplay.revision,
        screenplayDocumentChecksum: savedScreenplay.checksum,
        storyPacketId: savedStory.storyPacketId,
        storyRevision: savedStory.revision,
        visualBibleId: savedBible.visualBibleId,
        visualBibleRevision: savedBible.revision,
        structuredRowCount: scriptRows.length,
        durationSeconds: duration,
        screenplayRevisionChanged,
        invalidatedStages,
        cinematicDerivedStateInvalidation,
        canvasNodeIds: [sourceNodeId, storyNode.id, bibleNode.id],
        revisedShotIds: revisedShots.map((shot) => shot.shotId),
        nextAction: next.nextAction
      };
    };
    return runProjectTransaction({
      projectId,
      operation: "author_episode",
      work: persistEpisodeAuthoring
    });
  };
}
