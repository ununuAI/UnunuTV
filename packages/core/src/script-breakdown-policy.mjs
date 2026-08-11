import { CINEMATIC_SCRIPT_BREAKDOWN_VERSION, UnuTvError, assertCinematicScriptBreakdownV1 } from "@ununu/unutv-contracts";

function text(value, fallback = "") { return typeof value === "string" && value.trim() ? value.trim() : fallback; }
function array(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function object(value, fallback = {}) { return value && typeof value === "object" && !Array.isArray(value) ? value : fallback; }
function stablePart(value) { return String(value).replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "1"; }

function normalizeDialogue(payload, storyPacket) {
  if (Array.isArray(payload.dialogue)) return payload.dialogue.filter((entry) => entry && typeof entry === "object");
  const line = text(payload.dialogue);
  if (!line) return [];
  return [{ speaker: text(payload.dialogueSpeaker, text(storyPacket.characters?.[0]?.name, "未标注角色")), text: line, intent: text(payload.dialogueIntent) }];
}

function rowDescription(row) {
  const payload = row.payload ?? {};
  return text(payload.storyBeat, text(payload.sceneDescription, text(payload.action, text(payload.text, text(payload.imagePrompt, text(payload.dialogue, `镜头 ${row.shotNumber}`))))));
}

function sceneKey(row) {
  const payload = row.payload ?? {};
  if (typeof payload.sceneId === "string" && payload.sceneId.trim()) return payload.sceneId.trim();
  if ((typeof payload.sceneNumber === "string" && payload.sceneNumber.trim()) || Number.isFinite(payload.sceneNumber)) return String(payload.sceneNumber).trim();
  return text(payload.sceneHeading, "scene-1");
}

export function compileCinematicScriptBreakdown({ document, projectId, productionId, storyPacket, visualBible, timestamp, previousRevision = 0 }) {
  if (!document?.rows?.length) throw new UnuTvError("script_rows_required", "At least one structured script row is required", 409);
  const screenplayDocument = document.screenplayDocument ?? null;
  const groups = [];
  const byKey = new Map();
  for (const row of [...document.rows].sort((left, right) => left.orderIndex - right.orderIndex)) {
    const key = sceneKey(row);
    let group = byKey.get(key);
    if (!group) {
      group = { key, rows: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.rows.push(row);
  }
  const shots = [];
  const scenes = groups.map((group, sceneIndex) => {
    const firstPayload = group.rows[0].payload ?? {};
    const resolvedSceneId = `scene-${stablePart(document.nodeId)}-${stablePart(group.key)}`;
    const beats = group.rows.map((row, beatIndex) => {
      const payload = row.payload ?? {};
      const description = rowDescription(row);
      const actionChain = array(payload.actionChain).length
        ? array(payload.actionChain).map(String)
        : [text(payload.videoPrompt, description)];
      const openingState = text(payload.openingState, beatIndex ? rowDescription(group.rows[beatIndex - 1]) : text(storyPacket.entranceState?.description, description));
      const trigger = text(payload.trigger, actionChain[0]);
      const endingState = text(payload.endingState, description);
      const durationSeconds = Number(payload.durationSeconds ?? parseFloat(payload.duration)) || null;
      const shotId = `shot-script-${stablePart(row.id)}`;
      const dialogue = normalizeDialogue(payload, storyPacket);
      const shot = {
        shotId,
        sceneId: resolvedSceneId,
        sceneOrder: sceneIndex + 1,
        beatId: `beat-${stablePart(row.id)}`,
        beatOrder: beatIndex + 1,
        order: shots.length + 1,
        // scenePurpose is the production-wide objective. A shot needs a local,
        // observable narrative job; copying the global objective into every shot
        // makes the shot contract indistinguishable from the unit objective.
        narrativeJob: text(payload.narrativeJob, description),
        storyBeat: description,
        durationSeconds,
        openingState,
        trigger,
        actionChain,
        endingState,
        blocking: object(payload.blocking, { positions: text(payload.positions, "按剧本动作关系布置") }),
        cinematography: { ...object(visualBible.cinematography), ...object(payload.cinematography), shotSize: text(payload.shotSize, text(payload.cinematography?.shotSize, "按叙事任务确定")), movementPath: text(payload.movementPath, text(payload.camera, text(payload.videoPrompt, text(payload.cinematography?.movementPath, "按剧本动作保持连续")))) },
        lighting: { ...object(visualBible.lighting), ...object(payload.lighting) },
        color: { ...object(visualBible.color), ...object(payload.color) },
        performance: { ...object(visualBible.performance), ...object(payload.performance) },
        sound: { ...object(visualBible.sound), ...object(payload.sound), ...(text(payload.audioPrompt) ? { design: text(payload.audioPrompt) } : {}) },
        physicsVfx: { ...object(visualBible.vfx), ...object(payload.physicsVfx) },
        editContinuity: {
          ...object(payload.editContinuity),
          ...(text(payload.editIntent) ? { cutIntent: text(payload.editIntent) } : {}),
          ...(text(payload.injuryContinuity) ? { injuryContinuity: text(payload.injuryContinuity) } : {}),
          ...(text(payload.continuityLock) ? { continuityLock: text(payload.continuityLock) } : {}),
          nextHandoff: text(payload.nextHandoff),
          sourceRowId: row.id
        },
        constraints: object(payload.constraints),
        nextHandoff: text(payload.nextHandoff),
        dialogue,
        requiredAssetIds: array(payload.requiredAssetIds),
        mustNotAppearYet: array(payload.mustNotAppearYet).length ? array(payload.mustNotAppearYet) : array(storyPacket.mustNotAppearYet),
        acceptanceCriteria: array(payload.acceptanceCriteria).length ? array(payload.acceptanceCriteria) : [`准确表达剧本节拍：${description}`],
        virtualPersonAssetIds: array(payload.virtualPersonAssetIds),
        generationStrategy: text(payload.generationStrategy, "designed_multi_shot"),
        sourceScript: {
          nodeId: document.nodeId,
          documentRevision: document.revision,
          rowId: row.id,
          rowVersion: row.version,
          ...(screenplayDocument ? {
            screenplayDocumentId: screenplayDocument.documentId,
            screenplayDocumentRevision: screenplayDocument.revision,
            screenplayDocumentChecksum: screenplayDocument.checksum
          } : {})
        },
        revision: 1
      };
      shots.push(shot);
      return {
        beatId: `beat-${stablePart(row.id)}`,
        order: beatIndex + 1,
        rowId: row.id,
        description,
        openingState,
        trigger,
        actionChain,
        endingState,
        dialogue,
        durationSeconds,
        shotId
      };
    });
    return {
      sceneId: resolvedSceneId,
      order: sceneIndex + 1,
      heading: text(firstPayload.sceneHeading, `场景 ${sceneIndex + 1}`),
      location: text(firstPayload.location, text(firstPayload.sceneDescription, "未标注地点")),
      timeOfDay: text(firstPayload.timeOfDay, "未标注时间"),
      purpose: text(firstPayload.scenePurpose, text(storyPacket.scenePurpose, rowDescription(group.rows[0]))),
      rowIds: group.rows.map((row) => row.id),
      beats
    };
  });
  const breakdown = {
    version: CINEMATIC_SCRIPT_BREAKDOWN_VERSION,
    breakdownId: `script-breakdown-${document.nodeId}`,
    projectId,
    productionId,
    sourceNodeId: document.nodeId,
    sourceDocumentRevision: document.revision,
    ...(screenplayDocument ? {
      sourceScreenplayDocumentId: screenplayDocument.documentId,
      sourceScreenplayDocumentRevision: screenplayDocument.revision,
      sourceScreenplayDocumentChecksum: screenplayDocument.checksum
    } : {}),
    scenes,
    shotIds: shots.map((shot) => shot.shotId),
    revision: previousRevision + 1,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  assertCinematicScriptBreakdownV1(breakdown);
  return { breakdown, shots };
}
