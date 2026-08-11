import {
  CINEMATIC_SEQUENCE_PREVIS_REVIEW_TYPE,
  CINEMATIC_SEQUENCE_PREVIS_PLAYBACK_RECEIPT_VERSION,
  CINEMATIC_SEQUENCE_PREVIS_STATES,
  UnuTvError,
  auditSequencePrevisForAcceptance,
  auditSequencePrevisForGeneration,
  auditSequencePrevisPlaybackReceipt,
  cinematicSequencePrevisReviewTargetId,
  createId,
  nowIso,
  optionalText,
  requireEnum,
  requireObject,
  requireText,
  validateCreativeDecisionTrace,
  validateSequencePrevisPlaybackReceipt,
  validateSequencePrevisDocument,
  validateVisualContextBundle,
  validateVisualTakeMemory
} from "@ununu/unutv-contracts";

function port(ports, name) {
  const method = ports.projects?.[name];
  if (typeof method !== "function") throw new TypeError(`Missing cinematic sequence workspace port: projects.${name}`);
  return method.bind(ports.projects);
}
function assertValid(label, validation) {
  if (validation.ok) return;
  const error = new UnuTvError("invalid_cinematic_contract", `${label} validation failed`, 400, validation.issues);
  throw error;
}
function revision(value, fallback = 1) {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new UnuTvError("invalid_payload", "revision must be a positive integer");
  return parsed;
}
function strings(value) { return (Array.isArray(value) ? value : []).map((entry) => typeof entry === "string" ? entry.trim() : "").filter(Boolean); }
function compactRecord(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }

export function createCinematicSequenceWorkspaceUseCases(ports) {
  const savePrevisRecord = port(ports, "saveSequencePrevis");
  const getPrevisRecord = port(ports, "getSequencePrevis");
  const listPrevisRecords = port(ports, "listSequencePrevis");
  const listPrevisVersionRecords = port(ports, "listSequencePrevisVersions");
  const savePlaybackReceiptRecord = port(ports, "saveSequencePrevisPlaybackReceipt");
  const getPlaybackReceiptRecord = port(ports, "getSequencePrevisPlaybackReceipt");
  const listPlaybackReceiptRecords = port(ports, "listSequencePrevisPlaybackReceipts");
  const saveContextRecord = port(ports, "saveVisualContextBundle");
  const getContextRecord = port(ports, "getVisualContextBundle");
  const listContextRecords = port(ports, "listVisualContextBundles");
  const saveMemoryRecord = port(ports, "saveVisualTakeMemory");
  const listMemoryRecords = port(ports, "listVisualTakeMemories");
  const saveTraceRecord = port(ports, "saveCreativeDecisionTrace");
  const listTraceRecords = port(ports, "listCreativeDecisionTraces");
  const getProduction = port(ports, "getCinematicProduction");
  const getStoryPacket = port(ports, "getStoryPacket");
  const getVisualBible = port(ports, "getVisualBible");
  const getShot = port(ports, "getCinematicShot");
  const listAuthorities = port(ports, "listCinematicAssetAuthorities");
  const listStoryboards = port(ports, "listStoryboardDocuments");
  const listAssets = port(ports, "listAssets");
  const getMedia = port(ports, "getMedia");
  const createReviewRecord = port(ports, "createReview");

  async function requireProduction(projectId, productionId) {
    const production = await getProduction(projectId, productionId);
    if (!production) throw new UnuTvError("cinematic_production_not_found", `Cinematic production not found: ${productionId}`, 404);
    return production;
  }
  async function requirePrevis(projectId, productionId, sequencePrevisId, includeStale = false) {
    const previs = await getPrevisRecord(projectId, productionId, sequencePrevisId, includeStale);
    if (!previs) throw new UnuTvError("cinematic_sequence_previs_not_found", `Sequence previs not found: ${sequencePrevisId}`, 404);
    return previs;
  }

  async function saveSequencePrevis(input = {}) {
    const projectId = requireText(input.projectId, "projectId"), productionId = requireText(input.productionId, "productionId");
    await requireProduction(projectId, productionId);
    const submitted = requireObject(input.sequencePrevis ?? input.previs, "sequencePrevis");
    const storyPacket = await getStoryPacket(projectId, productionId, submitted.storyPacketId);
    if (!storyPacket) throw new UnuTvError("story_packet_required", "Sequence Previs must bind an existing story revision", 409);
    if (Number(submitted.storyPacketRevision) !== Number(storyPacket.revision)) throw new UnuTvError("sequence_previs_story_stale", "Sequence Previs must bind the current story revision", 409);
    const authoritativeShots = [];
    for (const item of Array.isArray(submitted.shots) ? submitted.shots : []) {
      const shot = await getShot(projectId, productionId, item.shotId);
      if (!shot) throw new UnuTvError("cinematic_shot_not_found", `Sequence Previs references missing shot: ${item.shotId}`, 409);
      if (Number(item.shotRevision) !== Number(shot.revision)) throw new UnuTvError("sequence_previs_shot_stale", `Sequence Previs must bind current shot revision: ${item.shotId}`, 409);
      authoritativeShots.push(shot);
    }
    const authorityStates = new Map((await listAuthorities(projectId, productionId)).map((authority) => [authority.authorityId, authority.status]));
    const invalidAuthority = (submitted.acceptedAuthorityIds ?? []).find((authorityId) => authorityStates.get(authorityId) !== "accepted");
    if (invalidAuthority) throw new UnuTvError("sequence_previs_authority_unaccepted", `Sequence Previs authority is not accepted: ${invalidAuthority}`, 409);
    const previs = {
      ...submitted,
      sequencePrevisId: submitted.sequencePrevisId || createId("sequence-previs"),
      productionId,
      title: optionalText(submitted.title, "连续视觉预演"),
      status: requireEnum(submitted.status ?? "candidate", CINEMATIC_SEQUENCE_PREVIS_STATES, "status"),
      revision: revision(submitted.revision),
      updatedAt: nowIso()
    };
    assertValid("SequencePrevisDocument", validateSequencePrevisDocument(previs));
    const ordered = [...authoritativeShots].sort((a, b) => a.order - b.order);
    if (ordered.some((shot, index) => shot.shotId !== [...previs.shots].sort((a, b) => a.order - b.order)[index]?.shotId)) {
      throw new UnuTvError("sequence_previs_shot_order_mismatch", "Sequence Previs order must match the current artistic shot order", 409);
    }
    return savePrevisRecord(projectId, productionId, previs, input.expectedRevision);
  }

  async function updateSequencePrevis(input = {}) {
    const current = await requirePrevis(requireText(input.projectId, "projectId"), requireText(input.productionId, "productionId"), requireText(input.sequencePrevisId, "sequencePrevisId"));
    const patch = requireObject(input.patch ?? input.sequencePrevis, "patch");
    return saveSequencePrevis({ ...input, expectedRevision: input.expectedRevision ?? current.revision, sequencePrevis: { ...current, ...patch, sequencePrevisId: current.sequencePrevisId, revision: current.revision + 1 } });
  }

  async function compileVisualContextBundle(input = {}) {
    const projectId = requireText(input.projectId, "projectId"), productionId = requireText(input.productionId, "productionId");
    await requireProduction(projectId, productionId);
    const previs = await requirePrevis(projectId, productionId, requireText(input.sequencePrevisId, "sequencePrevisId"));
    const shotId = requireText(input.shotId, "shotId"), shot = await getShot(projectId, productionId, shotId);
    if (!shot) throw new UnuTvError("cinematic_shot_not_found", `Cinematic shot not found: ${shotId}`, 404);
    const ordered = [...previs.shots].sort((a, b) => a.order - b.order), index = ordered.findIndex((entry) => entry.shotId === shotId);
    if (index < 0) throw new UnuTvError("sequence_previs_shot_missing", "Shot is not part of the selected Sequence Previs", 409);
    const [authorities, storyboards, visualBible, assets] = await Promise.all([listAuthorities(projectId, productionId), listStoryboards(projectId, productionId), getVisualBible(projectId, productionId), listAssets(projectId)]);
    const boundAuthorities = authorities.filter((entry) => previs.acceptedAuthorityIds.includes(entry.authorityId) && entry.status === "accepted");
    const storyboardFrames = storyboards.flatMap((board) => board.shots ?? []).filter((entry) => entry.shotId === shotId && entry.imageMediaId && entry.videoReference?.selected === true && entry.videoReference?.acceptanceProof?.pixelReviewed === true);
    const assetById = new Map(assets.map((asset) => [asset.id, asset]));
    const acceptedAuthorityMedia = (authority) => [...new Set([
      authority.acceptedMediaId,
      ...(authority.referenceAssetIds ?? []).flatMap((assetId) => {
        const asset = assetById.get(assetId), version = asset?.versions?.find((entry) => entry.id === asset.currentVersionId);
        return version?.payload?.reviewState === "accepted" ? [version.mediaId] : [];
      })
    ].filter(Boolean))];
    const current = ordered[index], previous = ordered[index - 1] ?? null, next = ordered[index + 1] ?? null;
    const bundle = {
      visualContextBundleId: createId("visual-context-bundle"), productionId,
      sequencePrevisId: previs.sequencePrevisId, sequencePrevisRevision: previs.revision,
      shotId, shotRevision: shot.revision,
      contextWindow: { previousShotId: previous?.shotId ?? null, currentShotId: shotId, nextShotId: next?.shotId ?? null },
      sceneLocator: { blocking: compactRecord(shot.blocking), directorStageBinding: shot.directorStageBinding ?? null, openingState: shot.openingState, endingState: shot.endingState },
      authorityBindings: boundAuthorities.map((entry) => ({ authorityId: entry.authorityId, revision: entry.revision, authorityType: entry.authorityType, acceptedMediaIds: acceptedAuthorityMedia(entry) })),
      phaseStrip: [previous, current, next].filter(Boolean).map((entry) => ({ shotId: entry.shotId, startSeconds: entry.startSeconds, endSeconds: entry.endSeconds, entryPhase: entry.entryPhase, exitPhase: entry.exitPhase, frameMediaId: entry.frameMediaId })),
      rejectedExamples: (previs.rejectedExampleEvaluationIds ?? []).map((evaluationId) => ({ evaluationId, instruction: "只用于关闭失败路径，不得作为正向视觉参考。" })),
      referenceRoles: [
        ...storyboardFrames.map((entry) => ({ mediaId: entry.imageMediaId, role: "semantic_scene_identity_reference", controls: ["人物一致", "场景一致", "空间拓扑"], doesNotControl: ["起始帧", "动作轨迹", "表演时序"] })),
        ...(current.frameMediaId ? [{ mediaId: current.frameMediaId, role: current.frameSourceRole, controls: ["当前镜头构图", "空间定位"], doesNotControl: ["未声明的动态演化"] }] : [])
      ],
      promptFacts: {
        preserve: [...strings(visualBible?.continuityLocks), current.spatialState?.description, shot.openingState].filter(Boolean),
        change: [...strings(shot.actionChain), shot.endingState].filter(Boolean),
        motion: [current.entryPhase, current.performanceState?.description, current.cameraState?.movement, current.exitPhase].filter(Boolean),
        prohibitions: [...strings(shot.mustNotAppearYet), ...boundAuthorities.flatMap((entry) => strings(entry.prohibitedChanges))]
      },
      createdAt: nowIso()
    };
    assertValid("VisualContextBundle", validateVisualContextBundle(bundle));
    return saveContextRecord(projectId, bundle);
  }

  async function addVisualTakeMemory(input = {}) {
    const projectId = requireText(input.projectId, "projectId"), productionId = requireText(input.productionId, "productionId");
    await requireProduction(projectId, productionId);
    const submitted = requireObject(input.visualTakeMemory ?? input.memory, "visualTakeMemory");
    const memory = { ...submitted, visualTakeMemoryId: submitted.visualTakeMemoryId || createId("visual-take-memory"), productionId, createdAt: nowIso() };
    assertValid("VisualTakeMemory", validateVisualTakeMemory(memory));
    return saveMemoryRecord(projectId, memory);
  }

  async function addCreativeDecisionTrace(input = {}) {
    const projectId = requireText(input.projectId, "projectId"), productionId = requireText(input.productionId, "productionId");
    await requireProduction(projectId, productionId);
    const submitted = requireObject(input.creativeDecisionTrace ?? input.trace, "creativeDecisionTrace");
    const trace = { ...submitted, creativeDecisionTraceId: submitted.creativeDecisionTraceId || createId("creative-decision-trace"), productionId, createdAt: nowIso() };
    assertValid("CreativeDecisionTrace", validateCreativeDecisionTrace(trace));
    return saveTraceRecord(projectId, trace);
  }

  async function recordSequencePrevisPlayback(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const productionId = requireText(input.productionId, "productionId");
    await requireProduction(projectId, productionId);
    const sequencePrevis = await requirePrevis(
      projectId,
      productionId,
      requireText(input.sequencePrevisId, "sequencePrevisId"),
    );
    const submitted = requireObject(input.playback ?? input.playbackReceipt, "playback");
    const receipt = {
      ...submitted,
      version: CINEMATIC_SEQUENCE_PREVIS_PLAYBACK_RECEIPT_VERSION,
      playbackReceiptId: createId("sequence-playback"),
      productionId,
      sequencePrevisId: sequencePrevis.sequencePrevisId,
      sequencePrevisRevision: sequencePrevis.revision,
      durationSeconds: sequencePrevis.durationSeconds,
      frameRate: sequencePrevis.frameRate,
      createdAt: nowIso(),
    };
    assertValid("SequencePrevisPlaybackReceipt", validateSequencePrevisPlaybackReceipt(receipt));
    const audit = auditSequencePrevisPlaybackReceipt(receipt, sequencePrevis);
    if (!audit.ok) {
      throw new UnuTvError(
        "sequence_previs_playback_incomplete",
        "Sequence Previs 必须从 0 到 duration 连续播放且无跳段，才能生成验收回执。",
        409,
        audit,
      );
    }
    return savePlaybackReceiptRecord(projectId, receipt);
  }

  async function reviewSequencePrevis(input = {}) {
    const projectId = requireText(input.projectId, "projectId"), productionId = requireText(input.productionId, "productionId");
    await requireProduction(projectId, productionId);
    const sequencePrevis = await requirePrevis(projectId, productionId, requireText(input.sequencePrevisId, "sequencePrevisId"));
    const reviewedRevision = revision(input.revision, sequencePrevis.revision);
    if (reviewedRevision !== sequencePrevis.revision) throw new UnuTvError("cinematic_review_target_stale", "只能审批连续预演的当前 revision。", 409, { currentRevision: sequencePrevis.revision, reviewedRevision });
    const state = requireEnum(input.state, ["accepted", "rejected"], "state");
    let audit = null;
    if (state === "accepted") {
      const playbackReceiptId = requireText(input.playbackReceiptId, "playbackReceiptId");
      const [visualContextBundles, reviews, mediaRecords, playbackReceipt] = await Promise.all([
        listContextRecords(projectId, productionId),
        ports.projects.listReviews(projectId),
        Promise.all((sequencePrevis.shots ?? []).map((shot) => shot.frameMediaId ? getMedia(projectId, shot.frameMediaId) : null)),
        getPlaybackReceiptRecord(projectId, productionId, playbackReceiptId),
      ]);
      audit = auditSequencePrevisForAcceptance({ mediaRecords, playbackReceipt, reviews, sequencePrevis, visualContextBundles });
      if (!audit.ok) throw new UnuTvError("sequence_previs_acceptance_blocked", "连续预演仍缺少完整播放回执、真实帧、像素验收、视觉上下文或有效切镜，不能写入 Owner ACCEPT。", 409, audit);
    }
    const review = await createReviewRecord(projectId, {
      id: createId("review"), targetType: CINEMATIC_SEQUENCE_PREVIS_REVIEW_TYPE,
      targetId: cinematicSequencePrevisReviewTargetId(sequencePrevis.sequencePrevisId, reviewedRevision), state,
      note: optionalText(input.note, state === "accepted" ? "Owner 已完整播放并接受当前连续视觉预演与切镜决策" : "Owner 拒绝当前连续视觉预演"), createdAt: nowIso()
    });
    return { audit, review };
  }

  async function getSequenceWorkspaceEvidence({ generationUnit, productionId, projectId }) {
    const binding = generationUnit?.sequenceWorkspaceBinding;
    if (!binding) return auditSequencePrevisForGeneration({ generationUnit });
    const [sequencePrevis, visualContextBundle, reviews] = await Promise.all([
      getPrevisRecord(projectId, productionId, binding.sequencePrevisId),
      getContextRecord(projectId, productionId, binding.visualContextBundleId),
      ports.projects.listReviews(projectId)
    ]);
    const mediaRecords = await Promise.all((sequencePrevis?.shots ?? []).map((shot) => shot.frameMediaId ? getMedia(projectId, shot.frameMediaId) : null));
    return { ...auditSequencePrevisForGeneration({ generationUnit, mediaRecords, sequencePrevis, reviews, visualContextBundle }), sequencePrevis, visualContextBundle };
  }

  return {
    addCreativeDecisionTrace, addVisualTakeMemory, compileVisualContextBundle,
    getSequencePrevis: async (input = {}) => requirePrevis(
      requireText(input.projectId, "projectId"),
      requireText(input.productionId, "productionId"),
      requireText(input.sequencePrevisId, "sequencePrevisId"),
      input.includeStale === true
    ),
    getSequenceWorkspaceEvidence,
    listSequencePrevisPlaybackReceipts: async (input = {}) => listPlaybackReceiptRecords(
      requireText(input.projectId, "projectId"),
      requireText(input.productionId, "productionId"),
      requireText(input.sequencePrevisId, "sequencePrevisId"),
    ),
    listCreativeDecisionTraces: async (input = {}) => listTraceRecords(requireText(input.projectId, "projectId"), requireText(input.productionId, "productionId"), input.targetType, input.targetId),
    listSequencePrevis: async (input = {}) => listPrevisRecords(
      requireText(input.projectId, "projectId"),
      requireText(input.productionId, "productionId"),
      input.includeStale === true
    ),
    listSequencePrevisVersions: async (input = {}) => listPrevisVersionRecords(requireText(input.projectId, "projectId"), requireText(input.productionId, "productionId"), requireText(input.sequencePrevisId, "sequencePrevisId")),
    listVisualContextBundles: async (input = {}) => listContextRecords(
      requireText(input.projectId, "projectId"),
      requireText(input.productionId, "productionId"),
      input.shotId,
      input.includeStale === true
    ),
    listVisualTakeMemories: async (input = {}) => listMemoryRecords(
      requireText(input.projectId, "projectId"),
      requireText(input.productionId, "productionId"),
      input.generationUnitId,
      input.includeStale === true
    ),
    recordSequencePrevisPlayback, reviewSequencePrevis, saveSequencePrevis, updateSequencePrevis
  };
}
