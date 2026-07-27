import {
  auditCinematicContinuity,
  auditCinematicSequenceState,
  auditVisualStateCarriers,
  getVideoModelCapability,
  latestCinematicEvaluationForUnit,
  latestCinematicMediaReview
} from "@ununu/unutv-contracts";
import { assessProfessionalSignoffs } from "./cinematic-professional-signoff-policy.mjs";
import { assessCinematicStoryShotOwnerReviews } from "../cinematic-story-shot-owner-review-policy.mjs";

// A selected storyboard composition is the current visual source for a shot.
// Older composition/keyframe boards must not silently remain beside it: the
// Provider would otherwise receive a contradictory image set even though every
// individual media ID and checksum is internally valid.
const COMPOSITION_REFERENCE_ROLES = new Set([
  "storyboard_composition",
  "storyboard_keyframe",
  "shot_keyframe",
  "shot_frame_set",
  "action_phase_board",
  "scene_composition",
  "reference_composition"
]);

export function auditSelectedStoryboardReferences({ generationParameters = {}, referenceBindings = [], storyboardReferences = [] } = {}) {
  const selectedMediaIds = [...new Set(storyboardReferences.map((entry) => entry?.mediaId).filter(Boolean))];
  if (selectedMediaIds.length === 0) return { ok: true, errors: [], selectedMediaIds, providerMediaIds: [] };
  const providerMediaIds = referenceBindings
    .filter((binding) => binding?.providerEligible !== false)
    .filter((binding) => ![generationParameters.firstFrameMediaId, generationParameters.lastFrameMediaId].includes(binding?.mediaId))
    .map((binding) => binding.mediaId)
    .filter(Boolean);
  const selectedSet = new Set(selectedMediaIds);
  const errors = [];
  for (const mediaId of selectedMediaIds) {
    if (!providerMediaIds.includes(mediaId)) {
      errors.push({
        code: "selected_storyboard_reference_missing",
        message: `Selected storyboard composition ${mediaId} is not in the Provider reference set`,
        mediaId
      });
    }
  }
  const staleCompositionMediaIds = referenceBindings
    .filter((binding) => binding?.providerEligible !== false && COMPOSITION_REFERENCE_ROLES.has(binding?.role))
    .map((binding) => binding.mediaId)
    .filter((mediaId) => mediaId && !selectedSet.has(mediaId));
  for (const mediaId of [...new Set(staleCompositionMediaIds)]) {
    errors.push({
      code: "stale_storyboard_composition_reference",
      message: `Provider reference set contains a non-current storyboard composition ${mediaId}; remove it before dispatch`,
      mediaId
    });
  }
  return { ok: errors.length === 0, errors, selectedMediaIds, providerMediaIds, staleCompositionMediaIds: [...new Set(staleCompositionMediaIds)] };
}

export function selectProviderReferenceBindings(generationParameters, bindings) {
  const eligibleBindings = bindings.filter((binding) => binding.providerEligible !== false);
  const profile = getVideoModelCapability({
    model: generationParameters?.model,
    provider: generationParameters?.provider
  });
  const frameInputMode = ["first_frame", "first_last_frame"].includes(generationParameters?.mode);
  const frameOnly = frameInputMode && Boolean(
    profile?.forbidsReferenceImagesWithFrameInput
    || (profile?.forbidsReferenceImagesWithFirstLastFrame && generationParameters?.mode === "first_last_frame")
  );
  if (!frameOnly) return eligibleBindings;
  const frameMediaIds = new Set([
    generationParameters?.firstFrameMediaId,
    generationParameters?.lastFrameMediaId
  ].filter(Boolean));
  return eligibleBindings.filter((binding) => frameMediaIds.has(binding.mediaId));
}

export function enforceProductionSignoffGates(generationUnit, production) {
  if (production?.productionMode !== "production") return generationUnit;
  const requiresProfessionalSignoff = Array.isArray(generationUnit?.executionGates?.requiredProfessionalRoles)
    && generationUnit.executionGates.requiredProfessionalRoles.length > 0;
  const requiresVisualStateCarrier = generationUnit?.executionGates?.requireKeyframeReference === true
    || (generationUnit?.generationParameters?.mode === "image_reference"
      && !["PREVIOUS_ACCEPTED_TAIL", "DUPLICATE_HANDOFF"].includes(generationUnit?.visualAnchorPolicy));
  return {
    ...generationUnit,
    executionGates: {
      ...generationUnit.executionGates,
      requireGenerationControlIntent: true,
      requireOwnerShotReviews: true,
      requireOwnerStoryReview: true,
      requirePromptCoverage: true,
      requireSequenceState: true,
      ...(generationUnit.sequenceWorkspaceBinding ? { requireSequencePrevis: true } : {}),
      ...(generationUnit.generationParameters?.mode && generationUnit.generationParameters.mode !== "text_to_video" ? { requireReferenceSemanticControl: true } : {}),
      ...(requiresProfessionalSignoff ? {
        requireTeamManifest: true,
        requireCurrentArtifactSignoff: true,
        requireKnowledgeGroundedSignoff: true,
        requireManifestBoundSignoff: true
      } : {}),
      ...(requiresVisualStateCarrier ? { requireAcceptedVisualStateCarrier: true } : {}),
      ...(generationUnit.strategy === "continuous_segment" && generationUnit.executionGates?.requireAuthoritativeTailHandoff ? { requireMotionHandoffPlan: true } : {})
    }
  };
}

function buildAuthoritativeTailHandoff(referenceBindings, evaluations, generationUnit) {
  const mode = generationUnit?.continuationHandoff?.mode === "DUPLICATE_HANDOFF" ? "DUPLICATE_HANDOFF" : "TAIL_CONTINUE";
  const binding = referenceBindings.find((entry) => entry.role === (mode === "DUPLICATE_HANDOFF" ? "handoff_h1" : "continuity_tail"));
  if (!binding) return null;
  const boundEvaluation = evaluations.find((entry) => entry.evaluationId === binding.sourceEvaluationId);
  const evaluation = boundEvaluation?.generationUnitId
    ? latestCinematicEvaluationForUnit(evaluations, boundEvaluation.generationUnitId)
    : boundEvaluation;
  const h0 = mode === "DUPLICATE_HANDOFF" ? referenceBindings.find((entry) => entry.role === "handoff_h0") : null;
  const plan = generationUnit?.continuationHandoff;
  const h1PlanMatches = !plan || plan.h1MediaId === binding.mediaId;
  const acceptedSource = Boolean(evaluation && evaluation.evaluationId === binding.sourceEvaluationId && evaluation.decision === "ACCEPT");
  const verification = binding.handoffVerification && typeof binding.handoffVerification === "object"
    ? binding.handoffVerification
    : {};
  return {
    sourceGenerationUnitId: evaluation?.generationUnitId ?? boundEvaluation?.generationUnitId ?? null,
    sourceEvaluationId: evaluation?.evaluationId ?? binding.sourceEvaluationId ?? null,
    sourceDecision: evaluation?.decision ?? null,
    sourceMediaId: evaluation?.mediaId ?? null,
    sourceChecksum: evaluation?.checksum ?? null,
    mediaId: binding.mediaId,
    sourceMediaVerified: Boolean(
      acceptedSource
      && h1PlanMatches
      && binding.sourceMediaId === evaluation.mediaId
      && binding.sourceMediaChecksum === evaluation.checksum
    ),
    duplicateFramesVerified: Boolean(
      mode === "DUPLICATE_HANDOFF"
      && h0
      && plan?.h0MediaId === h0.mediaId
      && plan?.h1MediaId === binding.mediaId
      && h0.mediaId !== binding.mediaId
      && h0.sourceEvaluationId === binding.sourceEvaluationId
      && h0.sourceMediaId === binding.sourceMediaId
      && h0.sourceMediaChecksum === binding.sourceMediaChecksum
      && acceptedSource
    ),
    spatialContinuityVerified: verification.spatialContinuityVerified === true,
    subjectStateVerified: verification.subjectStateVerified === true,
    screenDirectionVerified: verification.screenDirectionVerified === true,
    cameraStateVerified: verification.cameraStateVerified === true,
    lensFocusExposureVerified: verification.lensFocusExposureVerified === true,
    motionPhaseVerified: verification.motionPhaseVerified === true,
    overlapHandleVerified: verification.overlapHandleVerified === true,
    ambientAudioContinuityVerified: verification.ambientAudioContinuityVerified === true
  };
}

export function buildExecutionGateEvidence(professionalContributions, assetAuthorities, options = {}) {
  const signoffs = assessProfessionalSignoffs(professionalContributions, {
    generationUnit: options.generationUnit,
    shots: options.shots,
    teamManifestIds: options.teamManifestIds,
    knowledgePort: options.knowledgePort ?? null
  });
  const professionalRoles = signoffs.professionalRoles;
  const evidence = {
    ...signoffs,
    professionalContributionIds: professionalContributions.map((entry) => entry.contributionId),
    professionalRoleStoryRevisions: Object.fromEntries(professionalRoles.map((roleId) => [
      roleId,
      signoffs.currentContributions
        .filter((entry) => entry.roleId === roleId)
        .map((entry) => Number(entry.structuredFields?.sourceStoryPacketRevision))
        .filter(Number.isInteger)
    ])),
    acceptedAuthorityIds: assetAuthorities.filter((entry) => entry.status === "accepted").map((entry) => entry.authorityId),
    authorityStates: Object.fromEntries(assetAuthorities.map((entry) => [entry.authorityId, entry.status]))
  };
  evidence.ownerStoryShotReview = assessCinematicStoryShotOwnerReviews({
    reviews: Array.isArray(options.reviews) ? options.reviews : [],
    shots: Array.isArray(options.shots) ? options.shots : [],
    storyPacket: options.storyPacket
  });
  evidence.visualStateCarrierAudit = auditVisualStateCarriers({
    referenceBindings: Array.isArray(options.referenceBindings) ? options.referenceBindings : [],
    reviews: Array.isArray(options.reviews) ? options.reviews : [],
    shots: Array.isArray(options.shots) ? options.shots : []
  });
  const authoritativeTailHandoff = buildAuthoritativeTailHandoff(
    Array.isArray(options.referenceBindings) ? options.referenceBindings : [],
    Array.isArray(options.evaluations) ? options.evaluations : [],
    options.generationUnit
  );
  if (authoritativeTailHandoff) evidence.authoritativeTailHandoff = authoritativeTailHandoff;
  const generationUnit = options.generationUnit && typeof options.generationUnit === "object" ? options.generationUnit : null;
  const shots = Array.isArray(options.shots) ? options.shots : [];
  const evaluations = Array.isArray(options.evaluations) ? options.evaluations : [];
  if (generationUnit?.sequenceState) {
    const sourceEvaluationId = generationUnit.sequenceState?.sourceEvaluationId;
    const boundSourceEvaluation = evaluations.find((entry) => entry.evaluationId === sourceEvaluationId) ?? null;
    const sourceEvaluation = boundSourceEvaluation?.generationUnitId
      ? latestCinematicEvaluationForUnit(evaluations, boundSourceEvaluation.generationUnitId)
      : boundSourceEvaluation;
    evidence.sequenceStateAudit = auditCinematicSequenceState({ generationUnit, sourceEvaluation });
  }
  if (options.sequenceWorkspaceAudit) evidence.sequenceWorkspaceAudit = options.sequenceWorkspaceAudit;
  if (generationUnit && (generationUnit.continuitySource || shots.some((shot) => shot?.continuityPlan))) {
    const sourceEvaluationId = generationUnit.continuitySource?.sourceEvaluationId;
    const boundSourceEvaluation = evaluations.find((entry) => entry.evaluationId === sourceEvaluationId) ?? null;
    const sourceEvaluation = boundSourceEvaluation?.generationUnitId
      ? latestCinematicEvaluationForUnit(evaluations, boundSourceEvaluation.generationUnitId)
      : boundSourceEvaluation;
    evidence.continuityAudit = auditCinematicContinuity({ generationUnit, shots, sourceEvaluation });
  }
  return evidence;
}

export function appendCompilationSourceVersions(envelope, {
  assetAuthorities,
  authoritativeTailHandoff,
  continuityAudit,
  directorReferences,
  ownerStoryShotReview,
  production,
  professionalContributions,
  referenceBindings,
  referenceSetAudit,
  reviews,
  storyboardReferences,
  sequenceStateAudit,
  sequenceWorkspaceAudit
}) {
  envelope.sourceVersions.productionId = production.productionId;
  envelope.sourceVersions.productionRevision = production.revision;
  envelope.sourceVersions.teamManifestIds = [...production.teamManifestIds];
  envelope.sourceVersions.storyboardReferences = storyboardReferences.map((binding) => ({
    storyboardId: binding.storyboardId, storyboardRevision: binding.storyboardRevision,
    storyboardShotId: binding.storyboardShotId, storyboardShotRevision: binding.storyboardShotRevision,
    shotId: binding.shotId, mediaId: binding.mediaId, checksum: binding.checksum
  }));
  if (referenceSetAudit) envelope.sourceVersions.referenceSetAudit = {
    ok: referenceSetAudit.ok,
    selectedMediaIds: referenceSetAudit.selectedMediaIds,
    providerMediaIds: referenceSetAudit.providerMediaIds,
    staleCompositionMediaIds: referenceSetAudit.staleCompositionMediaIds ?? [],
    errors: referenceSetAudit.errors
  };
  envelope.sourceVersions.directorStageReferences = directorReferences.map((binding) => ({
    directorNodeId: binding.directorNodeId, captureId: binding.captureId,
    stageRevision: binding.stageRevision, shotId: binding.shotId, mediaId: binding.mediaId
  }));
  envelope.sourceVersions.professionalContributions = professionalContributions.map((entry) => ({
    contributionId: entry.contributionId, revision: entry.revision,
    roleId: entry.roleId, expertPackId: entry.expertPackId,
    targetType: entry.targetType, targetId: entry.targetId,
    targetRevision: entry.structuredFields?.targetRevision ?? null,
    knowledgeRefs: Array.isArray(entry.knowledgeRefs) ? entry.knowledgeRefs : []
  }));
  envelope.sourceVersions.assetAuthorityStates = assetAuthorities.map((entry) => ({
    authorityId: entry.authorityId, revision: entry.revision, status: entry.status
  }));
  if (ownerStoryShotReview) envelope.sourceVersions.ownerStoryShotReviews = {
    story: ownerStoryShotReview.story,
    shots: ownerStoryShotReview.shots
  };
  const carrierMediaIds = [...new Set(referenceBindings.filter((entry) => entry.acceptanceProof).map((entry) => entry.mediaId))];
  envelope.sourceVersions.visualStateCarrierReviews = carrierMediaIds.map((mediaId) => {
    const review = latestCinematicMediaReview(reviews, mediaId);
    return { mediaId, reviewId: review?.id ?? null, state: review?.state ?? null, createdAt: review?.createdAt ?? null };
  });
  if (authoritativeTailHandoff) envelope.sourceVersions.authoritativeTailHandoff = authoritativeTailHandoff;
  if (continuityAudit) envelope.sourceVersions.continuityAudit = {
    boundaryType: continuityAudit.boundaryType,
    checks: continuityAudit.checks,
    errors: continuityAudit.errors,
    ok: continuityAudit.ok,
    warnings: continuityAudit.warnings
  };
  if (sequenceStateAudit) envelope.sourceVersions.sequenceStateAudit = sequenceStateAudit;
  if (sequenceWorkspaceAudit) envelope.sourceVersions.sequenceWorkspaceAudit = { errors: sequenceWorkspaceAudit.errors, ok: sequenceWorkspaceAudit.ok, review: sequenceWorkspaceAudit.review, sequencePrevisId: sequenceWorkspaceAudit.sequencePrevis?.sequencePrevisId ?? null, sequencePrevisRevision: sequenceWorkspaceAudit.sequencePrevis?.revision ?? null, visualContextBundleId: sequenceWorkspaceAudit.visualContextBundle?.visualContextBundleId ?? null };
  return envelope;
}
