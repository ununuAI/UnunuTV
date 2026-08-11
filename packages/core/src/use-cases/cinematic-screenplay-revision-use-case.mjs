import { nowIso, requireText, screenplayContentChecksum, UnuTvError } from "@ununu/unutv-contracts";

export function createCinematicScreenplayRevisionUseCase({
  getCinematicWorkflowStatus,
  getNode,
  getScriptDocument,
  updateNode
}) {
  return async function reviseCinematicScreenplay(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const status = await getCinematicWorkflowStatus({
      projectId,
      automationRunId: requireText(input.automationRunId, "automationRunId")
    });
    if (!status.run) throw new UnuTvError("cinematic_workflow_not_found", "No cinematic workflow run found", 404);
    if (!getScriptDocument || !updateNode) {
      throw new UnuTvError("screenplay_revision_ports_required", "Screenplay revision requires script and canvas-node ports", 500);
    }
    const expectedDocumentId = requireText(input.expectedScreenplayDocumentId, "expectedScreenplayDocumentId");
    const expectedRevision = Number(input.expectedScreenplayRevision);
    const expectedContentChecksum = requireText(
      input.expectedScreenplayContentChecksum,
      "expectedScreenplayContentChecksum"
    );
    const reason = requireText(input.reason, "reason");
    if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
      throw new UnuTvError("screenplay_revision_contract_invalid", "expectedScreenplayRevision must be an integer >= 0", 400);
    }
    if (!/^[a-f0-9]{64}$/u.test(expectedContentChecksum)) {
      throw new UnuTvError("screenplay_revision_contract_invalid", "expectedScreenplayContentChecksum must be a lowercase SHA-256 hash", 400);
    }
    const sourceNodeId = status.run.configuration.sourceNodeId;
    const [document, sourceNode] = await Promise.all([
      getScriptDocument({ projectId, nodeId: sourceNodeId }),
      getNode({ projectId, nodeId: sourceNodeId })
    ]);
    const screenplayDocument = document?.screenplayDocument ?? null;
    if (!sourceNode) {
      throw new UnuTvError(
        "screenplay_revision_authority_required",
        "A visible screenplay source node is required before revision mode",
        409
      );
    }
    const legacyContent = typeof sourceNode.payload?.content === "string"
      ? sourceNode.payload.content
      : "";
    const legacyBootstrap = !screenplayDocument;
    const currentDocumentId = screenplayDocument?.documentId ?? sourceNodeId;
    const currentRevision = screenplayDocument?.revision ?? 0;
    const currentChecksum = screenplayDocument?.checksum
      ?? (legacyContent ? screenplayContentChecksum(legacyContent) : null);
    if (legacyBootstrap && !legacyContent) {
      throw new UnuTvError(
        "screenplay_revision_authority_required",
        "A legacy screenplay source must contain CAS-bound source content before its first authoritative document can be established",
        409
      );
    }
    const currentDerivedStateInvalidation = sourceNode.payload?.cinematicDerivedStateInvalidation ?? null;
    if (
      expectedDocumentId !== currentDocumentId
      || expectedDocumentId !== sourceNodeId
      || expectedRevision !== currentRevision
      || expectedContentChecksum !== currentChecksum
    ) {
      throw new UnuTvError(
        "screenplay_revision_conflict",
        "The requested screenplay revision contract is stale; reload current screenplay authority before revising",
        409,
        {
          currentScreenplayDocumentId: currentDocumentId,
          currentScreenplayRevision: currentRevision,
          currentScreenplayContentChecksum: currentChecksum,
          expectedScreenplayDocumentId: expectedDocumentId,
          expectedScreenplayRevision: expectedRevision,
          expectedScreenplayContentChecksum: expectedContentChecksum
        }
      );
    }
    const currentContract = sourceNode.payload?.authoringMode === "screenplay_development"
      ? sourceNode.payload?.screenplayRevisionContract
      : null;
    if (
      currentContract?.format === "ScreenplayRevisionContractV1"
      && currentContract.automationRunId === status.run.id
      && currentContract.screenplayDocumentId === expectedDocumentId
      && currentContract.expectedRevision === expectedRevision
      && currentContract.expectedContentChecksum === expectedContentChecksum
      && Boolean(currentContract.legacyBootstrap) === legacyBootstrap
    ) {
      return {
        format: "ScreenplayRevisionModeReceiptV1",
        reused: true,
        sourceNodeId,
        sourceNodeRevision: sourceNode.revision,
        screenplayRevisionContract: currentContract,
        cinematicDerivedStateInvalidation: currentDerivedStateInvalidation,
        nextAction: status.nextAction
      };
    }
    const activeTasks = status.tasks.filter((task) => ["running", "waiting"].includes(task.status));
    if (activeTasks.length) {
      throw new UnuTvError(
        "screenplay_revision_active_work",
        "Screenplay revision cannot begin while automation work is running or waiting",
        409,
        { taskIds: activeTasks.map((task) => task.id), stages: activeTasks.map((task) => task.stage) }
      );
    }
    const requestedAt = nowIso();
    const screenplayRevisionContract = {
      format: "ScreenplayRevisionContractV1",
      contractId: `${status.run.id}:screenplay-revision:${sourceNodeId}:r${expectedRevision}:${expectedContentChecksum.slice(0, 12)}`,
      automationRunId: status.run.id,
      sourceNodeId,
      screenplayDocumentId: expectedDocumentId,
      expectedRevision,
      expectedContentChecksum,
      legacyBootstrap,
      reason,
      requestedAt
    };
    const updatedSource = await updateNode({
      projectId,
      nodeId: sourceNodeId,
      payload: {
        ...sourceNode.payload,
        authoringMode: "screenplay_development",
        screenplayRevisionContract,
        stage: "script",
        stageStatus: "screenplay_revision_requested"
      },
      expectedRevision: sourceNode.revision,
      ...(legacyBootstrap ? {} : { screenplayCas: { expectedRevision, expectedContentChecksum } })
    });
    const next = await getCinematicWorkflowStatus({ projectId, automationRunId: status.run.id });
    return {
      format: "ScreenplayRevisionModeReceiptV1",
      reused: false,
      sourceNodeId,
      sourceNodeRevision: updatedSource.revision,
      screenplayRevisionContract,
      cinematicDerivedStateInvalidation: updatedSource.payload?.cinematicDerivedStateInvalidation ?? null,
      nextAction: next.nextAction
    };
  };
}
