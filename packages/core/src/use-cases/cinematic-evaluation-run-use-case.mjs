import { UnuTvError, createId, nowIso, optionalText, requireText } from "@ununu/unutv-contracts";

/** Resolve the auditable run behind an evaluation without ever calling a Provider. */
export async function ensureCinematicEvaluationRun(ports, projectId, submitted) {
  let runId = optionalText(submitted.runId, "");
  let run = runId ? await ports.projects.getRun(projectId, runId) : undefined;
  if (!run && submitted.sourceKind === "imported_media") {
    const mediaId = requireText(submitted.mediaId, "mediaId");
    const media = ports.media.open(projectId, mediaId);
    if (!media) throw new UnuTvError("evaluation_media_not_found", `Evaluation media not found: ${mediaId}`, 404);
    runId ||= createId("run-imported-media");
    run = await ports.projects.createRun(projectId, {
      id: runId,
      nodeId: requireText(submitted.sourceNodeId ?? media.nodeId, "sourceNodeId"),
      status: "queued",
      provider: "local_import",
      request: { sourceKind: "imported_media", mediaId, checksum: media.sha256 },
      createdAt: nowIso()
    });
    run = await ports.projects.finishRun(projectId, runId, "succeeded", {
      sourceKind: "imported_media",
      mediaId,
      checksum: media.sha256
    });
  }
  if (!run) throw new UnuTvError("evaluation_run_not_found", `Evaluation run not found: ${runId || "none"}`, 404);
  return { run, runId };
}
