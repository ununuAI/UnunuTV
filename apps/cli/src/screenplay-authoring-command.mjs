import { readFileSync } from "node:fs";
import { screenplayContentChecksum, UnuTvError } from "@ununu/unutv-contracts";

function requireText(value, flag) {
  if (typeof value !== "string" || !value.trim()) {
    throw new UnuTvError("missing_flag", `--${flag} is required`);
  }
  return value;
}

function requireScreenplayRevisionStatus(status) {
  const contract = status?.screenplayRevisionContract;
  if (
    status?.nextAction?.type !== "author_episode"
    || status?.nextAction?.phase !== "screenplay_development"
    || contract?.format !== "ScreenplayRevisionContractV1"
  ) {
    throw new UnuTvError(
      "screenplay_revision_authoring_not_current",
      "The current persisted nextAction is not screenplay revision authoring",
      409
    );
  }
  return contract;
}

export async function executeScreenplayAuthoringCommand(app, flags) {
  const projectId = requireText(flags.project, "project");
  const automationRunId = requireText(flags["automation-run"], "automation-run");
  const screenplayFile = requireText(flags["screenplay-file"], "screenplay-file");
  const status = await app.getCinematicWorkflowStatus({ projectId, automationRunId });
  const screenplayRevisionContract = requireScreenplayRevisionStatus(status);
  const productionId = requireText(status.run?.configuration?.productionId, "production");
  const sourceNodeId = requireText(status.run?.configuration?.sourceNodeId, "source-node");
  const project = await app.openProject({ projectId });
  const canvas = await app.openCanvas({ projectId, canvasId: project.rootCanvasId });
  const sourceNode = canvas.nodes.find((node) => node.id === sourceNodeId);
  if (!sourceNode) {
    throw new UnuTvError("source_node_not_found", `Source node ${sourceNodeId} is not visible on the root canvas`, 404);
  }

  const [document, storyPacket, visualBible] = await Promise.all([
    app.getScriptDocument({ projectId, nodeId: sourceNodeId }),
    app.getStoryPacket({ projectId, productionId }),
    app.getVisualBible({ projectId, productionId })
  ]);
  const content = readFileSync(screenplayFile, "utf8");
  const checksum = screenplayContentChecksum(content);
  const packageId = sourceNode.payload?.authoringPackageId;
  if (!packageId) {
    throw new UnuTvError("episode_authoring_package_required", "The visible source node has no persisted authoringPackageId", 409);
  }

  const authoringPackage = {
    format: "EpisodeAuthoringPackageV1",
    packageId,
    title: `${project.title} screenplay revision`,
    sourceDocument: {
      format: "ScreenplayDocumentInputV1",
      content,
      checksum,
      expectedRevision: screenplayRevisionContract.expectedRevision
    },
    storyPacket,
    visualBible,
    scriptRows: document.rows
      .slice()
      .sort((left, right) => left.orderIndex - right.orderIndex)
      .map((row) => ({ shotNumber: row.shotNumber, payload: row.payload })),
    screenplayRevisionContract
  };
  const receipt = await app.authorEpisode({ projectId, automationRunId, package: authoringPackage });
  return {
    ...receipt,
    screenplayFile,
    screenplayChecksum: checksum,
    preservedScriptRowIds: document.rows.map((row) => row.id),
    preservedVisualBibleId: visualBible.visualBibleId,
    sourceNodeId
  };
}
