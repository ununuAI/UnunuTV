function text(value) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return "";
}

function list(value) {
  if (Array.isArray(value)) return value.filter((entry) => entry !== null && entry !== undefined);
  return value === null || value === undefined || value === "" ? [] : [value];
}

function uniqueText(values) {
  return [...new Set(values.flatMap(list).map(text).filter(Boolean))];
}

function rowCharacters(row) {
  return uniqueText([row.character1, row.character2]).map((name) => ({
    name,
    goal: text(row[`${name === row.character1 ? "characterPsychology1" : "characterPsychology2"}`]),
    resistance: "",
    legacyState: text(row[`${name === row.character1 ? "characterState1" : "characterState2"}`])
  }));
}

function dialogue(row) {
  const lines = list(row.dialogue).map((entry) => text(entry)).filter(Boolean);
  const speakers = list(row.dialogueSpeaker).map((entry) => text(entry)).filter(Boolean);
  return lines.map((line, index) => ({ speaker: speakers[index] ?? speakers[0] ?? "", text: line }));
}

function shotRowMap(scriptRows) {
  return new Map(scriptRows.map((row) => [row.id, row]));
}

function legacyShotId(nodeId, oldShot, index) {
  return `cinematic-${text(oldShot.id) || `${nodeId}-${index + 1}`}`;
}

function aggregate(rows, field) {
  return uniqueText(rows.map((row) => row[field]));
}

export function mapLegacyShortDramaProductionVersion({ canvasId, document, nodeId, scriptRows = [], version }) {
  const rowsById = shotRowMap(scriptRows);
  const oldShots = Array.isArray(document.shots) ? document.shots : [];
  const joinedRows = oldShots.map((shot) => rowsById.get(shot.sourceRowId)).filter(Boolean);
  const allRows = joinedRows.length ? joinedRows : scriptRows;
  const productionId = `production-legacy-${nodeId}`;
  const storyPacketId = `story-packet-legacy-${nodeId}`;
  const visualBibleId = `visual-bible-legacy-${nodeId}`;
  const migratedAt = text(document.updatedAt) || text(document.createdAt);
  const legacyExtensions = {
    migration: {
      sourceContract: "ShortDramaProduction",
      sourceNodeId: nodeId,
      sourceCanvasId: canvasId,
      sourceVersion: version,
      needsCinematicAuthoringReview: true
    },
    originalDocument: document
  };
  const characters = [];
  const characterNames = new Set();
  for (const row of allRows) {
    for (const character of rowCharacters(row)) {
      if (!characterNames.has(character.name)) {
        characterNames.add(character.name);
        characters.push(character);
      }
    }
  }
  const storyPacket = {
    storyPacketId,
    sourceFacts: uniqueText([
      ...list(document.beats).map((beat) => beat?.label),
      ...allRows.map((row) => row.sceneDescription)
    ]),
    lockedStoryFacts: uniqueText(allRows.flatMap((row) => list(row.continuityLocks))),
    scenePurpose: text(document.title),
    characters,
    causalEventChain: uniqueText(oldShots.flatMap((shot) => list(shot.action || shot.actionChain))),
    characterRelationships: [],
    subtext: uniqueText(allRows.map((row) => row.dialogueSubtext)),
    dialogue: allRows.flatMap(dialogue),
    emotionalArc: {
      start: text(allRows[0]?.characterState1),
      change: uniqueText(allRows.map((row) => row.microExpression1)),
      end: text(allRows.at(-1)?.characterState1)
    },
    performanceIntent: uniqueText(oldShots.map((shot) => shot.psychologicalIntent)),
    entranceState: { description: text(oldShots[0]?.openingState || allRows[0]?.openingState || allRows[0]?.startState) },
    exitState: { description: text(oldShots.at(-1)?.endingState || allRows.at(-1)?.endingState || allRows.at(-1)?.endState) },
    mustNotAppearYet: uniqueText(allRows.flatMap((row) => list(row.forbiddenContent))),
    userLockedText: [],
    revision: version,
    needsAuthoringReview: true,
    legacyExtensions: { sourceScriptRows: scriptRows },
    updatedAt: migratedAt
  };
  const visualBible = {
    visualBibleId,
    cinematography: {
      grammar: aggregate(allRows, "camera"),
      shotSizes: uniqueText(oldShots.flatMap((shot) => [shot.shotSizeStart, shot.shotSizeEnd, shot.cameraMove])),
      intent: uniqueText(oldShots.map((shot) => shot.cameraIntent))
    },
    lighting: { inheritedDirections: aggregate(allRows, "lighting") },
    color: { paletteRefs: uniqueText(oldShots.map((shot) => shot.paletteRef)) },
    productionDesign: {
      scenes: uniqueText(allRows.flatMap((row) => [row.sceneKey, row.sceneDescription, row.locationBinding])),
      props: uniqueText(allRows.flatMap((row) => list(row.props)))
    },
    characterLook: {
      descriptions: uniqueText(allRows.flatMap((row) => [row.characterDescription1, row.characterDescription2]))
    },
    performance: {
      psychology: uniqueText(allRows.flatMap((row) => [row.characterPsychology1, row.characterPsychology2])),
      microExpressions: uniqueText(allRows.flatMap((row) => [row.microExpression1, row.microExpression2])),
      humanImperfection: uniqueText(allRows.flatMap((row) => [row.humanImperfection1, row.humanImperfection2]))
    },
    sound: { inheritedSound: aggregate(allRows, "sound") },
    vfx: {},
    continuityLocks: uniqueText(allRows.flatMap((row) => list(row.continuityLocks))),
    visualMotifs: [],
    colorArc: {},
    spatialDramaturgy: {},
    propSemantics: {},
    costumeNarrative: {},
    materialAging: {},
    culturalResearchRefs: [],
    styleProhibitions: [],
    revision: version,
    needsAuthoringReview: true,
    legacyExtensions: {},
    updatedAt: migratedAt
  };
  const shots = oldShots.map((oldShot, index) => {
    const row = rowsById.get(oldShot.sourceRowId) ?? {};
    const directorUnit = list(document.directorUnits).find((unit) => unit?.id === oldShot.directorUnitId) ?? {};
    return {
      shotId: legacyShotId(nodeId, oldShot, index),
      order: Number(oldShot.order ?? row.shotNumber ?? index + 1),
      narrativeJob: text(oldShot.psychologicalIntent || directorUnit.storyFunction || row.narrativeJob || row.purpose || oldShot.label),
      storyBeat: text(directorUnit.storyFunction || oldShot.label || row.purpose),
      cutReason: text(row.cutInReason || oldShot.transitionFromPrevious?.reason || directorUnit.timingIntent),
      openingState: text(oldShot.openingState || row.openingState || row.startState),
      trigger: text(row.trigger),
      actionChain: uniqueText([oldShot.action, ...list(row.actionChain), ...list(row.actionBeats)]),
      reactionTurn: text(oldShot.psychologicalIntent),
      endingState: text(oldShot.endingState || row.endingState || row.endState),
      blocking: {
        visibleCharacters: oldShot.visibleCharacters ?? uniqueText([row.character1, row.character2]),
        offscreenCharacters: oldShot.offscreenCharacters ?? [],
        characterStates: uniqueText([row.characterState1, row.characterState2]),
        props: list(row.props)
      },
      cinematography: {
        shotSizeStart: text(oldShot.shotSizeStart || row.shotSize),
        shotSizeEnd: text(oldShot.shotSizeEnd),
        cameraSetupId: text(oldShot.cameraSetupId),
        movementPath: text(oldShot.cameraMove || row.camera),
        narrativePurpose: text(oldShot.cameraIntent || directorUnit.filmLanguage)
      },
      lighting: { inheritedDesign: text(row.lighting) },
      color: { paletteRef: text(oldShot.paletteRef) },
      performance: {
        psychologicalIntent: text(oldShot.psychologicalIntent),
        profiles: oldShot.performanceProfiles ?? [],
        beats: oldShot.performanceBeats ?? row.performanceBeats ?? [],
        microExpressions: uniqueText([row.microExpression1, row.microExpression2]),
        delivery: text(row.dialogueDelivery),
        subtext: text(row.dialogueSubtext),
        pause: text(row.dialoguePause)
      },
      sound: {
        inheritedSound: text(row.sound),
        soundEvents: row.soundEvents ?? [],
        audioCueIds: list(document.audioCues).filter((cue) => list(cue?.shotIds).includes(oldShot.id)).map((cue) => cue.id)
      },
      physicsVfx: {},
      editContinuity: {
        entrance: oldShot.transitionFromPrevious ?? row.transitionFromPrevious ?? null,
        exit: oldShot.transitionToNext ?? row.transitionToNext ?? null,
        editInterface: row.editInterface ?? null,
        nextStartPolicy: oldShot.framePlan?.nextStartPolicy ?? null
      },
      dialogue: dialogue(row),
      requiredAssetIds: uniqueText([
        ...list(oldShot.resourceSlots?.characters).map((slot) => slot?.assetId),
        ...list(oldShot.resourceSlots?.props).map((slot) => slot?.assetId),
        ...list(oldShot.resourceSlots?.scene).map((slot) => slot?.assetId)
      ]),
      mustNotAppearYet: uniqueText(list(row.forbiddenContent)),
      acceptanceCriteria: [],
      legacyPromptText: text(row.videoPrompt),
      needsRecompile: Boolean(text(row.videoPrompt)),
      needsAuthoringReview: true,
      revision: version,
      legacyExtensions: {
        sourceShot: oldShot,
        sourceScriptRow: row,
        legacyStoryboardPanels: oldShot.storyboardPanels ?? [],
        legacyImagePrompt: text(row.imagePrompt)
      },
      updatedAt: migratedAt
    };
  });
  const shotIds = new Map(oldShots.map((oldShot, index) => [oldShot.id, shots[index].shotId]));
  const generationUnits = oldShots.flatMap((oldShot, shotIndex) => {
    const segments = list(oldShot.generationSegments);
    const actualSegments = segments.length ? segments : [{ id: `${oldShot.id || shotIndex + 1}-single`, order: 1 }];
    return actualSegments.map((segment, segmentIndex) => {
      const hasContinuation = actualSegments.length > 1;
      return {
        generationUnitId: `generation-unit-legacy-${text(segment.id) || `${nodeId}-${shotIndex + 1}-${segmentIndex + 1}`}`,
        strategy: hasContinuation ? "continuous_segment" : "single_shot",
        shotLinks: [{ shotId: shotIds.get(oldShot.id) ?? shots[shotIndex].shotId, order: 1, role: hasContinuation ? "provider_segment" : "artistic_shot" }],
        visualAnchorPolicy: hasContinuation && segmentIndex > 0 ? "PREVIOUS_ACCEPTED_TAIL" : "NONE",
        requiredCapabilities: hasContinuation && segmentIndex > 0 ? ["first_frame"] : [],
        generationParameters: {
          provider: "legacy-unassigned",
          model: "legacy-unassigned",
          mode: hasContinuation && segmentIndex > 0 ? "first_frame" : "text_to_video",
          duration: Number(segment.durationSec ?? oldShot.durationSec ?? 1),
          aspectRatio: "legacy-unassigned",
          resolution: "legacy-unassigned",
          count: 1,
          generateAudio: false,
          referenceMediaIds: [],
          providerOptions: {}
        },
        continuityBoundary: {
          sourceSegment: segment,
          seamStrategy: segment.seamStrategy ?? null,
          continuityHandleMs: segment.continuityHandleMs ?? null
        },
        revision: version,
        needsCapabilityAssignment: true,
        needsRecompile: true,
        legacyExtensions: { sourceSegment: segment, sourceFramePlan: oldShot.framePlan ?? null },
        updatedAt: migratedAt
      };
    });
  });
  return {
    production: {
      productionId,
      projectType: "short_drama",
      productionMode: "production",
      storyPacketIds: [storyPacketId],
      visualBibleId,
      shotIds: shots.map((shot) => shot.shotId),
      generationUnitIds: generationUnits.map((unit) => unit.generationUnitId),
      assetAuthorityIds: [],
      teamManifestIds: [],
      reviewState: "draft",
      revision: version,
      title: text(document.title) || "迁移影视制作",
      sourceNodeId: nodeId,
      legacyExtensions,
      createdAt: text(document.createdAt) || migratedAt,
      updatedAt: migratedAt
    },
    storyPacket,
    visualBible,
    shots,
    generationUnits,
    referenceBindings: []
  };
}
