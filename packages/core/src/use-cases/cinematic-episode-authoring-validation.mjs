import {
  assertCinematicContract,
  assertScreenplayDocumentInput,
  requireObject,
  requireText,
  screenplayContentChecksum,
  UnuTvError
} from "@ununu/unutv-contracts";
import { assessCinematicShotFormation } from "../cinematic-shot-formation-policy.mjs";

export function equalEpisodeAuthoringValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function parseEpisodeAuthoringPackage(input, status) {
  const authoringPackage = requireObject(input.package ?? input.authoringPackage, "package");
  if (authoringPackage.format !== "EpisodeAuthoringPackageV1") {
    throw new UnuTvError("episode_authoring_package_invalid", "package.format must be EpisodeAuthoringPackageV1", 400);
  }
  const storyPacket = requireObject(authoringPackage.storyPacket, "package.storyPacket");
  const visualBible = requireObject(authoringPackage.visualBible, "package.visualBible");
  const sourceDocumentInput = requireObject(authoringPackage.sourceDocument, "package.sourceDocument");
  const packageId = requireText(authoringPackage.packageId, "package.packageId");
  const scriptRows = Array.isArray(authoringPackage.scriptRows) ? authoringPackage.scriptRows : [];
  if (!scriptRows.length) {
    throw new UnuTvError("script_rows_required", "package.scriptRows must contain the complete structured episode", 400);
  }
  const duration = scriptRows.reduce(
    (sum, row) => sum + (Number(row?.payload?.durationSeconds ?? row?.durationSeconds) || 0),
    0
  );
  const targetDuration = Number(status.workflowManifest?.targetDurationSeconds) || 0;
  if (!duration || Math.abs(duration - targetDuration) > 1) {
    throw new UnuTvError(
      "episode_duration_mismatch",
      `Structured rows total ${duration}s but workflow target is ${targetDuration}s`,
      409,
      { durationSeconds: duration, targetDurationSeconds: targetDuration }
    );
  }
  return {
    authoringPackage,
    duration,
    packageId,
    scriptRows,
    sourceDocumentInput,
    storyPacket,
    targetDuration,
    visualBible
  };
}

export function validateEpisodeAuthoringAuthority({
  currentDocument,
  existingBible,
  existingStory,
  packageInput,
  sourceNode,
  sourceNodeId,
  status
}) {
  const {
    authoringPackage,
    packageId,
    scriptRows,
    sourceDocumentInput,
    storyPacket,
    targetDuration,
    visualBible
  } = packageInput;
  const orderedCurrentRows = currentDocument.rows
    .slice()
    .sort((left, right) => left.orderIndex - right.orderIndex);
  const currentRows = orderedCurrentRows.map((row) => row.payload);
  const proposedRows = scriptRows.map((row) => row.payload ?? row);
  const structuredRowsDiffer = !equalEpisodeAuthoringValue(currentRows, proposedRows);
  const samePackage = sourceNode.payload?.authoringPackageId === packageId;
  const screenplayRevisionContract = status.screenplayRevisionContract;
  const screenplayDevelopmentRevision = screenplayRevisionContract?.format === "ScreenplayRevisionContractV1";
  const shotFormationRepair = status.nextAction?.blocker?.code === "cinematic_shot_formation_required";
  const sameStructure = orderedCurrentRows.length === scriptRows.length
    && orderedCurrentRows.every((row, index) => (
      Number(row.shotNumber) === Number(scriptRows[index]?.shotNumber ?? index + 1)
    ));

  if (screenplayDevelopmentRevision) {
    const currentScreenplay = currentDocument.screenplayDocument ?? null;
    const providedContract = authoringPackage.screenplayRevisionContract;
    const legacyBootstrap = screenplayRevisionContract.legacyBootstrap === true;
    const contractMatches = (
      equalEpisodeAuthoringValue(providedContract, screenplayRevisionContract)
      && (
        legacyBootstrap
          ? !currentScreenplay
            && screenplayRevisionContract.screenplayDocumentId === sourceNodeId
            && screenplayRevisionContract.expectedRevision === 0
            && screenplayContentChecksum(sourceNode.payload?.content || "") === screenplayRevisionContract.expectedContentChecksum
          : currentScreenplay?.documentId === screenplayRevisionContract.screenplayDocumentId
            && currentScreenplay?.revision === screenplayRevisionContract.expectedRevision
            && currentScreenplay?.checksum === screenplayRevisionContract.expectedContentChecksum
      )
      && sourceDocumentInput.expectedRevision === screenplayRevisionContract.expectedRevision
      && sourceDocumentInput.checksum === screenplayContentChecksum(sourceDocumentInput.content)
      && sourceDocumentInput.checksum !== screenplayRevisionContract.expectedContentChecksum
    );
    if (!contractMatches || !samePackage || !existingStory || !existingBible) {
      throw new UnuTvError(
        "cinematic_screenplay_revision_contract_mismatch",
        "Screenplay development authoring must bind the exact active revision contract, current authority and persisted authoring package",
        409,
        {
          currentScreenplayDocumentId: currentScreenplay?.documentId ?? null,
          currentScreenplayRevision: currentScreenplay?.revision ?? null,
          currentScreenplayContentChecksum: currentScreenplay?.checksum ?? null,
          existingPackageId: sourceNode.payload?.authoringPackageId ?? null,
          proposedPackageId: packageId,
          expectedContract: screenplayRevisionContract
        }
      );
    }
    const visualBibleMatches = equalEpisodeAuthoringValue(
      { ...existingBible, visualBibleId: undefined, revision: undefined, updatedAt: undefined },
      { ...visualBible, visualBibleId: undefined, revision: undefined, updatedAt: undefined }
    );
    if (structuredRowsDiffer || !sameStructure || !visualBibleMatches) {
      throw new UnuTvError(
        "cinematic_screenplay_revision_scope_violation",
        "Screenplay development may revise only sourceDocument and StoryPacket; preserve VisualBible and structured rows until review and shot formation",
        409,
        {
          driftedResources: [
            ...(structuredRowsDiffer || !sameStructure ? ["scriptRows"] : []),
            ...(!visualBibleMatches ? ["visualBible"] : [])
          ]
        }
      );
    }
    assertScreenplayDocumentInput(sourceDocumentInput, {
      documentId: currentScreenplay?.documentId ?? sourceNodeId,
      currentRevision: currentScreenplay?.revision ?? 0
    });
    assertCinematicContract("StoryProductionPacket", {
      ...storyPacket,
      storyPacketId: existingStory.storyPacketId,
      revision: existingStory.revision + 1
    });
  } else if (
    !shotFormationRepair
    && currentDocument.screenplayDocument
    && (
      sourceDocumentInput.checksum !== currentDocument.screenplayDocument.checksum
      || screenplayContentChecksum(sourceDocumentInput.content) !== currentDocument.screenplayDocument.checksum
    )
  ) {
    throw new UnuTvError(
      "cinematic_screenplay_revision_required",
      "Changing authoritative screenplay content requires workflow cinematic-revise-screenplay and its active revision contract",
      409,
      {
        currentScreenplayDocumentId: currentDocument.screenplayDocument.documentId,
        currentScreenplayRevision: currentDocument.screenplayDocument.revision,
        currentScreenplayContentChecksum: currentDocument.screenplayDocument.checksum
      }
    );
  } else if (authoringPackage.screenplayRevisionContract) {
    throw new UnuTvError(
      "cinematic_screenplay_revision_contract_inactive",
      "The supplied screenplay revision contract is not the current persisted authoring mode",
      409
    );
  }

  if (shotFormationRepair && !samePackage) {
    throw new UnuTvError(
      "structured_script_conflict",
      "cinematic_shot_formation_required may restructure only the same persisted authoring package",
      409,
      {
        blockerCode: status.nextAction.blocker.code,
        existingPackageId: sourceNode.payload?.authoringPackageId ?? null,
        proposedPackageId: packageId,
        currentRowCount: currentRows.length,
        proposedRowCount: proposedRows.length
      }
    );
  }
  if (shotFormationRepair) {
    const currentScreenplay = currentDocument.screenplayDocument ?? null;
    const currentScreenplayRevision = Number.isInteger(currentScreenplay?.revision)
      ? currentScreenplay.revision
      : Number.isInteger(currentDocument.screenplayRevision) && currentDocument.screenplayRevision > 0
        ? currentDocument.screenplayRevision
        : currentDocument.revision;
    const currentContentChecksum = currentScreenplay?.checksum ?? null;
    const repairContract = authoringPackage.repairContract;
    const expectedRepairContract = {
      blockerCode: "cinematic_shot_formation_required",
      targetType: "structured_script",
      targetId: sourceNodeId,
      expectedRevision: currentScreenplayRevision,
      ...(currentContentChecksum ? { expectedContentChecksum: currentContentChecksum } : {})
    };
    const repairContractMatches = (
      repairContract
      && repairContract.blockerCode === expectedRepairContract.blockerCode
      && repairContract.targetType === expectedRepairContract.targetType
      && repairContract.targetId === expectedRepairContract.targetId
      && Number.isInteger(repairContract.expectedRevision)
      && repairContract.expectedRevision === expectedRepairContract.expectedRevision
      && (
        !currentContentChecksum
        || repairContract.expectedContentChecksum === currentContentChecksum
      )
      && Number.isInteger(sourceDocumentInput.expectedRevision)
      && sourceDocumentInput.expectedRevision === expectedRepairContract.expectedRevision
    );
    if (!repairContractMatches) {
      throw new UnuTvError(
        "cinematic_authoring_repair_contract_mismatch",
        "Shot-formation repair must bind the exact current screenplay node, revision and checksum before any authoring state is persisted",
        409,
        {
          actualRepairContract: repairContract ?? null,
          actualSourceDocumentExpectedRevision: sourceDocumentInput.expectedRevision ?? null,
          expectedRepairContract
        }
      );
    }
    const computedIncomingContentChecksum = screenplayContentChecksum(sourceDocumentInput.content);
    if (
      !currentContentChecksum
      || sourceDocumentInput.checksum !== currentContentChecksum
      || computedIncomingContentChecksum !== currentContentChecksum
    ) {
      throw new UnuTvError(
        "cinematic_authoring_repair_scope_violation",
        "Shot-formation repair must preserve the exact authoritative screenplay content; screenplay revision belongs to screenplay development",
        409,
        {
          currentContentChecksum,
          expectedContentChecksum: repairContract.expectedContentChecksum ?? null,
          incomingContentChecksum: sourceDocumentInput.checksum ?? null,
          computedIncomingContentChecksum,
          driftedResources: ["sourceDocument"]
        }
      );
    }
    const storyPacketDrifted = !existingStory || !equalEpisodeAuthoringValue(
      { ...existingStory, storyPacketId: undefined, revision: undefined, updatedAt: undefined },
      { ...storyPacket, storyPacketId: undefined, revision: undefined, updatedAt: undefined }
    );
    const visualBibleDrifted = !existingBible || !equalEpisodeAuthoringValue(
      { ...existingBible, visualBibleId: undefined, revision: undefined, updatedAt: undefined },
      { ...visualBible, visualBibleId: undefined, revision: undefined, updatedAt: undefined }
    );
    if (storyPacketDrifted || visualBibleDrifted) {
      throw new UnuTvError(
        "cinematic_authoring_repair_scope_violation",
        "Shot-formation repair may change only sourceDocument and scriptRows; StoryPacket and VisualBible must exactly match current server authority",
        409,
        {
          allowedFields: ["sourceDocument", "scriptRows"],
          driftedResources: [
            ...(storyPacketDrifted ? ["storyPacket"] : []),
            ...(visualBibleDrifted ? ["visualBible"] : [])
          ]
        }
      );
    }
    const formation = assessCinematicShotFormation({
      rows: scriptRows.map((row, index) => ({
        id: row.id ?? `proposed-row-${index + 1}`,
        orderIndex: row.orderIndex ?? index,
        shotNumber: row.shotNumber ?? index + 1,
        payload: row.payload ?? row
      })),
      targetDurationSeconds: targetDuration
    });
    if (!formation.ok) {
      throw new UnuTvError(
        "cinematic_shot_formation_required",
        "The repaired EpisodeAuthoringPackageV1 still does not form complete executable shots; nothing was persisted",
        409,
        formation
      );
    }
  }
  if (
    orderedCurrentRows.length > 0
    && structuredRowsDiffer
    && (!samePackage || (!sameStructure && !shotFormationRepair))
  ) {
    throw new UnuTvError(
      "structured_script_conflict",
      "Only the same authoring package may replace existing rows; row structure may change only for the persisted cinematic_shot_formation_required action",
      409,
      {
        blockerCode: status.nextAction?.blocker?.code ?? null,
        existingPackageId: sourceNode.payload?.authoringPackageId ?? null,
        proposedPackageId: packageId,
        currentRowCount: currentRows.length,
        proposedRowCount: proposedRows.length
      }
    );
  }

  return {
    orderedCurrentRows,
    proposedRows,
    screenplayDevelopmentRevision,
    structuredRowsDiffer
  };
}
