import { buildNextAction, createId } from "@ununu/unutv-contracts";

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
  assetReuse = null
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
    const code = blocked.error?.code || "automation_task_blocked";
    const ownerCodes = new Set([
      "story_owner_acceptance_required",
      "shot_script_owner_acceptance_required",
      "story_packet_required",
      "visual_bible_required"
    ]);
    const type = ownerCodes.has(code) || /owner|acceptance_required/i.test(code) ? "owner_gate" : "repair";
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
        message: blocked.error?.message || "Task blocked",
        targetType: blocked.error?.details?.targetType ?? null,
        targetId: blocked.error?.details?.targetId ?? blocked.error?.details?.generationUnitId ?? null,
        revision: blocked.error?.details?.revision ?? null,
        taskId: blocked.id,
        details: blocked.error?.details ?? null
      },
      ownerGate: type === "owner_gate" ? { required: true, reviewType: null, targetId: null } : null,
      promptAuthority,
      assetReuse,
      idempotencyKey: `${automationRunId || "run"}:${blocked.stage}:blocked`,
      message: blocked.error?.message || "Blocked"
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
