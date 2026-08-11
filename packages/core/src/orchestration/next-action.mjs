import { buildNextAction, createId } from "@ununu/unutv-contracts";

function nestedWorkflowErrors(error, seen = new Set()) {
  if (!error || typeof error !== "object" || seen.has(error)) return [];
  seen.add(error);
  const entries = error.code ? [error] : [];
  for (const child of Array.isArray(error.details?.errors) ? error.details.errors : []) {
    entries.push(...nestedWorkflowErrors(child, seen));
  }
  for (const child of Array.isArray(error.details?.lint?.errors) ? error.details.lint.errors : []) {
    entries.push(...nestedWorkflowErrors(child, seen));
  }
  for (const child of Array.isArray(error.details?.modelPreflight?.errors) ? error.details.modelPreflight.errors : []) {
    entries.push(...nestedWorkflowErrors(child, seen));
  }
  for (const item of Array.isArray(error.details?.items) ? error.details.items : []) {
    entries.push(...nestedWorkflowErrors(item?.error, seen));
  }
  return entries;
}

function reviewTargetType(error = {}) {
  if (error.details?.targetType) return error.details.targetType;
  const targetId = error.targetId || error.details?.targetId || "";
  if (targetId.startsWith("cinematic-story:")) return "cinematic_story_revision";
  if (targetId.startsWith("cinematic-shot:")) return "cinematic_shot_revision";
  return null;
}

/**
 * Derive a machine-readable nextAction from automation tasks + session.
 */
export function deriveNextActionFromTasks({
  projectId,
  automationRunId,
  tasks = [],
  session = null,
  seriesId = null,
  episodeNumber = null,
  promptAuthority = null,
  screenplayAuthority = null,
  screenplayRevisionContract = null,
  assetReuse = null,
  authoringGaps = [],
  layoutOverlaps = [],
  generationIntegrityIssues = []
} = {}) {
  const list = Array.isArray(tasks) ? tasks : [];
  const blocked = list.find((task) => task.status === "blocked");
  const running = list.find((task) => task.status === "running" || task.status === "waiting");
  const pending = list.find((task) => ["queued", "failed"].includes(task.status));
  const allDone = list.length > 0 && list.every((task) => ["succeeded", "reused"].includes(task.status));

  const baseCommand = {
    cli: `ununu-unutv workflow cinematic-advance --project ${projectId}${automationRunId ? ` --automation-run ${automationRunId}` : ""}`,
    method: "POST",
    path: `/api/projects/${projectId}/cinematic-workflow/advance`,
    body: automationRunId ? { automationRunId } : {}
  };

  if (screenplayRevisionContract) {
    return buildNextAction({
      actionId: createId("na"),
      type: "author_episode",
      phase: "screenplay_development",
      seriesId,
      episodeNumber,
      worker: "episode-authoring",
      command: {
        cli: `ununu-unutv workflow cinematic-author --project ${projectId}${automationRunId ? ` --automation-run ${automationRunId}` : ""} --file EPISODE_PACKAGE.json`,
        method: "POST",
        path: `/api/projects/${projectId}/cinematic-workflow/author`,
        body: {
          ...(automationRunId ? { automationRunId } : {}),
          package: "EpisodeAuthoringPackageV1",
          requiredScreenplayRevisionContract: screenplayRevisionContract
        }
      },
      blocker: {
        code: "screenplay_revision_authoring_required",
        message: "Author the explicitly requested complete screenplay revision before returning to development review",
        targetType: "structured_script",
        targetId: screenplayRevisionContract.sourceNodeId,
        revision: screenplayRevisionContract.expectedRevision,
        details: { screenplayRevisionContract }
      },
      promptAuthority,
      assetReuse,
      idempotencyKey: screenplayRevisionContract.contractId,
      message: "Revise the complete screenplay and StoryPacket through cinematic-author using the exact persisted revision contract"
    });
  }

  if (Array.isArray(authoringGaps) && authoringGaps.length) {
    return buildNextAction({
      actionId: createId("na"),
      type: "author_episode",
      phase: "script_analysis",
      seriesId,
      episodeNumber,
      worker: "episode-authoring",
      command: {
        cli: `ununu-unutv workflow cinematic-author --project ${projectId}${automationRunId ? ` --automation-run ${automationRunId}` : ""} --file EPISODE_PACKAGE.json`,
        method: "POST",
        path: `/api/projects/${projectId}/cinematic-workflow/author`,
        body: automationRunId ? { automationRunId, package: "EpisodeAuthoringPackageV1" } : { package: "EpisodeAuthoringPackageV1" }
      },
      blocker: {
        code: "episode_authoring_package_required",
        message: "Create the complete structured episode package before stage execution",
        details: { missing: [...authoringGaps] }
      },
      promptAuthority,
      assetReuse,
      idempotencyKey: `${automationRunId || "run"}:author_episode:v1`,
      message: "Author and project the complete episode package through the cinematic Skill"
    });
  }

  if (Array.isArray(layoutOverlaps) && layoutOverlaps.length) {
    const productionOverlapCount = layoutOverlaps.filter((overlap) => overlap.scope !== "cross_domain").length;
    const globalOverlapCount = layoutOverlaps.length;
    return buildNextAction({
      actionId: createId("na"),
      type: "repair",
      phase: "canvas_layout",
      seriesId,
      episodeNumber,
      worker: "canvas-layout",
      command: {
        cli: `ununu-unutv workflow canvas-reflow --project ${projectId}${automationRunId ? ` --automation-run ${automationRunId}` : ""}`,
        method: "POST",
        path: `/api/projects/${projectId}/cinematic-workflow/canvas-reflow`,
        body: automationRunId ? { automationRunId } : {}
      },
      blocker: {
        code: "canvas_nodes_overlap",
        message: "Current production nodes overlap visible canvas nodes and must be reflowed before production continues",
        details: {
          overlaps: layoutOverlaps,
          productionOverlapCount,
          globalOverlapCount
        }
      },
      promptAuthority,
      assetReuse,
      idempotencyKey: `${automationRunId || "run"}:canvas-reflow:v1`,
      message: "Reflow current production nodes around fixed visible canvas obstacles"
    });
  }

  if (Array.isArray(generationIntegrityIssues) && generationIntegrityIssues.length) {
    return buildNextAction({
      actionId: createId("na"),
      type: "repair",
      phase: "video_generation",
      seriesId,
      episodeNumber,
      worker: "provider-artifact-integrity",
      command: baseCommand,
      blocker: {
        code: "cinematic_video_artifact_missing",
        message: "视频生成阶段没有为全部 GenerationUnit 留下成功 Provider run、真实视频媒体和校验谱系，必须回退到 Prompt 编译后重新执行。",
        targetType: "GenerationUnit",
        targetId: generationIntegrityIssues[0]?.generationUnitId ?? null,
        revision: generationIntegrityIssues[0]?.generationUnitRevision ?? null,
        taskId: list.find((task) => task.stage === "video_generation")?.id ?? null,
        details: { issues: generationIntegrityIssues }
      },
      promptAuthority,
      assetReuse,
      idempotencyKey: `${automationRunId || "run"}:video-generation:artifact-integrity:v1`,
      message: "Repair the formal video-generation lineage before continuity review"
    });
  }

  // Completion is only valid after the persisted authoring, canvas-layout and
  // Provider-artifact integrity gates have all passed. New delivery nodes can
  // create collisions after the final automation task succeeds.
  if (allDone || session?.state === "auto_completed") {
    return buildNextAction({
      actionId: createId("na"),
      type: "done",
      phase: list.at(-1)?.stage ?? null,
      seriesId,
      episodeNumber,
      command: null,
      promptAuthority,
      assetReuse,
      message: "Workflow complete"
    });
  }

  if (blocked) {
    const nested = nestedWorkflowErrors(blocked.error);
    const ownerCodes = new Set([
      "story_owner_acceptance_required",
      "shot_script_owner_acceptance_required",
      "story_packet_required",
      "visual_bible_required"
    ]);
    const unknownProviderOutcome = nested.find((entry) => entry.code === "paid_submission_outcome_unknown");
    if (unknownProviderOutcome) {
      const blockedItem = (blocked.error?.details?.items ?? []).find((item) => (
        nestedWorkflowErrors(item?.error).some((entry) => entry.code === "paid_submission_outcome_unknown")
      ));
      const runId = unknownProviderOutcome.details?.runId
        ?? unknownProviderOutcome.runId
        ?? blockedItem?.error?.details?.runId
        ?? null;
      return buildNextAction({
        actionId: createId("na"),
        type: "repair",
        phase: blocked.stage,
        seriesId,
        episodeNumber,
        worker: "provider-reconciliation",
        command: {
          cli: `ununu-unutv workflow provider-reconcile --project ${projectId}${automationRunId ? ` --automation-run ${automationRunId}` : ""}`,
          method: "POST",
          path: `/api/projects/${projectId}/cinematic-workflow/provider-reconcile`,
          body: automationRunId ? { automationRunId } : {}
        },
        blocker: {
          code: "paid_submission_outcome_unknown",
          message: unknownProviderOutcome.message,
          targetType: "provider_run",
          targetId: runId,
          revision: null,
          taskId: blocked.id,
          details: {
            jobId: blocked.error?.details?.jobId ?? null,
            itemId: blockedItem?.id ?? null,
            runId,
            idempotencyKey: unknownProviderOutcome.details?.idempotencyKey ?? null
          }
        },
        promptAuthority,
        assetReuse,
        idempotencyKey: `${automationRunId || "run"}:${blocked.stage}:provider-reconcile:${runId || "unknown"}`,
        message: "Reconcile the existing provider intent without blindly submitting a duplicate"
      });
    }
    const developmentReview = nested.find((entry) => entry.code === "cinematic_development_review_required");
    if (developmentReview) {
      const reviewGate = developmentReview.details ?? {};
      const targetId = reviewGate.screenplayDocumentId
        ?? screenplayAuthority?.targetId
        ?? screenplayAuthority?.sourceNodeId
        ?? null;
      const revision = Number.isInteger(reviewGate.screenplayDocumentRevision)
        ? reviewGate.screenplayDocumentRevision
        : Number.isInteger(screenplayAuthority?.revision) ? screenplayAuthority.revision : null;
      const contentChecksum = reviewGate.screenplayDocumentChecksum
        ?? screenplayAuthority?.contentChecksum
        ?? null;
      return buildNextAction({
        actionId: createId("na"),
        type: "repair",
        phase: "script_analysis",
        seriesId,
        episodeNumber,
        worker: "cinematic-development-review",
        command: baseCommand,
        blocker: {
          code: developmentReview.code,
          message: developmentReview.message,
          targetType: "screenplay_document",
          targetId,
          revision,
          taskId: blocked.id,
          details: {
            ...reviewGate,
            requiredRoles: ["script_doctor", "dialogue_editor", "platform_editor"],
            sourceScreenplayDocumentChecksum: contentChecksum,
            sourceScreenplayDocumentId: targetId,
            sourceScreenplayDocumentRevision: revision,
            sourceStoryPacketId: reviewGate.storyPacketId ?? null,
            sourceStoryPacketRevision: reviewGate.storyPacketRevision ?? null
          }
        },
        promptAuthority,
        assetReuse,
        idempotencyKey: `${automationRunId || "run"}:script-analysis:development-review:${targetId || "unknown"}:r${revision ?? "unknown"}:${contentChecksum?.slice(0, 12) || "no-checksum"}`,
        message: "Complete all three reviews against the exact current StoryPacket and screenplay revision before rebuilding shot planning"
      });
    }
    const shotFormationRepair = nested.find((entry) => entry.code === "cinematic_shot_formation_required");
    if (shotFormationRepair) {
      const targetId = screenplayAuthority?.targetId ?? screenplayAuthority?.sourceNodeId ?? null;
      const revision = Number.isInteger(screenplayAuthority?.revision) ? screenplayAuthority.revision : null;
      const contentChecksum = screenplayAuthority?.contentChecksum ?? null;
      const repairContract = {
        blockerCode: "cinematic_shot_formation_required",
        targetType: "structured_script",
        targetId,
        expectedRevision: revision,
        ...(contentChecksum ? { expectedContentChecksum: contentChecksum } : {})
      };
      return buildNextAction({
        actionId: createId("na"),
        type: "author_episode",
        phase: blocked.stage,
        seriesId,
        episodeNumber,
        worker: "episode-authoring",
        command: {
          cli: `ununu-unutv workflow cinematic-author --project ${projectId}${automationRunId ? ` --automation-run ${automationRunId}` : ""} --file EPISODE_PACKAGE.json`,
          method: "POST",
          path: `/api/projects/${projectId}/cinematic-workflow/author`,
          body: {
            ...(automationRunId ? { automationRunId } : {}),
            package: "EpisodeAuthoringPackageV1",
            requiredRepairContract: repairContract
          }
        },
        blocker: {
          code: shotFormationRepair.code,
          message: shotFormationRepair.message,
          targetType: "structured_script",
          targetId,
          revision,
          taskId: blocked.id,
          details: {
            ...(shotFormationRepair.details ?? {}),
            ...(contentChecksum ? { contentChecksum } : {}),
            repairContract
          }
        },
        promptAuthority,
        assetReuse,
        idempotencyKey: `${automationRunId || "run"}:${blocked.stage}:shot-formation:${targetId || "unknown"}:r${revision ?? "unknown"}:${contentChecksum?.slice(0, 12) || "no-checksum"}`,
        message: "Restructure the same episode authoring package into complete executable shot rows, then re-author it through the cinematic Skill"
      });
    }
    const performanceRepair = nested.find((entry) => entry.code === "shot_performance_contract_required");
    if (performanceRepair) {
      return buildNextAction({
        actionId: createId("na"),
        type: "author_episode",
        phase: blocked.stage,
        seriesId,
        episodeNumber,
        worker: "episode-authoring",
        command: {
          cli: `ununu-unutv workflow cinematic-author --project ${projectId}${automationRunId ? ` --automation-run ${automationRunId}` : ""} --file EPISODE_PACKAGE.json`,
          method: "POST",
          path: `/api/projects/${projectId}/cinematic-workflow/author`,
          body: automationRunId ? { automationRunId, package: "EpisodeAuthoringPackageV1" } : { package: "EpisodeAuthoringPackageV1" }
        },
        blocker: {
          code: performanceRepair.code,
          message: performanceRepair.message,
          targetType: reviewTargetType(performanceRepair),
          targetId: performanceRepair.targetId ?? performanceRepair.details?.targetId ?? null,
          revision: performanceRepair.revision ?? performanceRepair.details?.revision ?? null,
          taskId: blocked.id,
          details: {
            ...(performanceRepair.details ?? {}),
            shotId: performanceRepair.shotId ?? performanceRepair.details?.shotId ?? null,
            performanceErrors: performanceRepair.performanceErrors ?? performanceRepair.details?.performanceErrors ?? []
          }
        },
        promptAuthority,
        assetReuse,
        idempotencyKey: `${automationRunId || "run"}:${blocked.stage}:performance-contract`,
        message: "Repair the episode package with a continuous, visible, second-by-second performance contract, then re-author it through the cinematic Skill"
      });
    }

    const isOwnerError = (entry) => ownerCodes.has(entry?.code) || /owner|acceptance_required/i.test(entry?.code || "");
    const actionableOwner = nested.find((entry) => (
      isOwnerError(entry)
      && Boolean(entry.targetId ?? entry.details?.targetId)
    )) ?? nested.find(isOwnerError);
    const actionable = actionableOwner || blocked.error || {};
    const code = actionable.code || "automation_task_blocked";
    const firstListedTarget = Array.isArray(actionable.details?.targets)
      ? actionable.details.targets.find((entry) => (
          entry?.targetId
          || entry?.mediaId
          || entry?.generationUnitId
        ))
      : null;
    const targetId = actionable.targetId
      ?? actionable.details?.targetId
      ?? actionable.details?.generationUnitId
      ?? firstListedTarget?.targetId
      ?? firstListedTarget?.mediaId
      ?? firstListedTarget?.generationUnitId
      ?? null;
    const type = actionableOwner && targetId ? "owner_gate" : "repair";
    const targetType = reviewTargetType(actionable);
    return buildNextAction({
      actionId: createId("na"),
      type,
      phase: blocked.stage,
      seriesId,
      episodeNumber,
      worker: null,
      command: type === "repair" ? baseCommand : {
        cli: `ununu-unutv workflow owner-decide --project ${projectId} --data '{}'`,
        method: "POST",
        path: `/api/projects/${projectId}/cinematic-workflow/owner-decision`,
        body: {}
      },
      blocker: {
        code,
        message: actionable.message || "Task blocked",
        targetType,
        targetId,
        revision: actionable.revision ?? actionable.details?.revision ?? null,
        taskId: blocked.id,
        details: actionable.details ?? null
      },
      ownerGate: type === "owner_gate" ? { required: true, reviewType: targetType, targetId } : null,
      promptAuthority,
      assetReuse,
      idempotencyKey: `${automationRunId || "run"}:${blocked.stage}:blocked`,
      message: actionable.message || "Blocked"
    });
  }

  if (running) {
    const waitingProvider = /provider|run|poll|generation/i.test(running.stage || "");
    return buildNextAction({
      actionId: createId("na"),
      type: waitingProvider ? "wait_provider" : "advance",
      phase: running.stage,
      seriesId,
      episodeNumber,
      command: baseCommand,
      promptAuthority,
      assetReuse,
      idempotencyKey: `${automationRunId || "run"}:${running.stage}:running`,
      message: waitingProvider ? "Waiting for provider or in-flight work" : "Task running"
    });
  }

  if (pending || session?.state === "auto_running" || session?.state === "auto_paused") {
    return buildNextAction({
      actionId: createId("na"),
      type: "advance",
      phase: pending?.stage ?? null,
      seriesId,
      episodeNumber,
      command: baseCommand,
      promptAuthority,
      assetReuse,
      idempotencyKey: `${automationRunId || "run"}:advance`,
      message: "Advance workflow"
    });
  }

  return buildNextAction({
    actionId: createId("na"),
    type: "failed",
    seriesId,
    episodeNumber,
    command: baseCommand,
    blocker: { code: "workflow_status_unknown", message: "No runnable automation task found" },
    promptAuthority,
    assetReuse,
    message: "No runnable task"
  });
}
