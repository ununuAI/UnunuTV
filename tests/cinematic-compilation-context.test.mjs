import assert from "node:assert/strict";
import test from "node:test";
import { auditSelectedStoryboardReferences, buildExecutionGateEvidence, enforceProductionSignoffGates, selectProviderReferenceBindings } from "../packages/core/src/use-cases/cinematic-compilation-context.mjs";
import { cinematicReferenceEdgeRole } from "../packages/core/src/cinematic-canvas-prompt-graph-policy.mjs";

function tailBinding(patch = {}) {
  return {
    assetId: "evaluation:evaluation-p01a",
    versionId: "checksum-tail-frame",
    mediaId: "media-tail-frame",
    displayName: "P01A 验收尾帧",
    providerIndex: 1,
    role: "continuity_tail",
    controls: ["入口站位", "画面轴线"],
    doesNotControl: ["后续动作结果"],
    required: true,
    authorityRevision: "evaluation-p01a:ACCEPT",
    sourceEvaluationId: "evaluation-p01a",
    sourceMediaId: "media-p01a-video",
    sourceMediaChecksum: "checksum-p01a-video",
    extractedAtSeconds: 3.9,
    handoffVerification: {
      spatialContinuityVerified: true,
      subjectStateVerified: true,
      screenDirectionVerified: true
    },
    ...patch
  };
}

function acceptedEvaluation(patch = {}) {
  return {
    evaluationId: "evaluation-p01a",
    mediaId: "media-p01a-video",
    checksum: "checksum-p01a-video",
    decision: "ACCEPT",
    ...patch
  };
}

test("Core derives authoritative tail evidence from an ACCEPT evaluation and the exact bound source media", () => {
  const evidence = buildExecutionGateEvidence([], [], {
    referenceBindings: [tailBinding()],
    evaluations: [acceptedEvaluation()]
  });
  assert.deepEqual(evidence.authoritativeTailHandoff, {
    sourceEvaluationId: "evaluation-p01a",
    sourceGenerationUnitId: null,
    sourceDecision: "ACCEPT",
    sourceMediaId: "media-p01a-video",
    sourceChecksum: "checksum-p01a-video",
    mediaId: "media-tail-frame",
    sourceMediaVerified: true,
    duplicateFramesVerified: false,
    spatialContinuityVerified: true,
    subjectStateVerified: true,
    screenDirectionVerified: true,
    cameraStateVerified: false,
    lensFocusExposureVerified: false,
    motionPhaseVerified: false,
    overlapHandleVerified: false,
    ambientAudioContinuityVerified: false
  });
});

test("Core refuses to certify a tail whose declared source checksum does not match the ACCEPT record", () => {
  const evidence = buildExecutionGateEvidence([], [], {
    referenceBindings: [tailBinding({ sourceMediaChecksum: "wrong-checksum" })],
    evaluations: [acceptedEvaluation()]
  });
  assert.equal(evidence.authoritativeTailHandoff.sourceMediaVerified, false);
});

test("Ark first-frame mode keeps only the actual frame binding and suppresses ordinary Director/reference payload images", () => {
  const bindings = [
    tailBinding(),
    { ...tailBinding({ mediaId: "media-director", role: "director_stage_blocking" }), providerIndex: 2 }
  ];
  const selected = selectProviderReferenceBindings({
    provider: "ark",
    model: "doubao-seedance-2-0-mini-260615",
    mode: "first_frame",
    firstFrameMediaId: "media-tail-frame"
  }, bindings);
  assert.deepEqual(selected.map((entry) => entry.mediaId), ["media-tail-frame"]);
});

test("ordinary image-reference mode preserves Director and authority bindings", () => {
  const bindings = [tailBinding(), { ...tailBinding({ mediaId: "media-director", role: "director_stage_blocking" }), providerIndex: 2 }];
  const selected = selectProviderReferenceBindings({
    provider: "ark",
    model: "doubao-seedance-2-0-mini-260615",
    mode: "image_reference"
  }, bindings);
  assert.deepEqual(selected.map((entry) => entry.mediaId), ["media-tail-frame", "media-director"]);
});

test("canvas reference edges use canonical temporal, semantic, and continuation H0/H1 roles", () => {
  assert.equal(cinematicReferenceEdgeRole({ role: "first_frame" }), "cinematic_reference:temporal_first");
  assert.equal(cinematicReferenceEdgeRole({ role: "last_frame" }), "cinematic_reference:temporal_last");
  assert.equal(cinematicReferenceEdgeRole({ role: "shot_keyframe" }), "cinematic_reference:semantic");
  assert.equal(cinematicReferenceEdgeRole({ role: "handoff_h0" }), "cinematic_reference:continuation_h0");
  assert.equal(cinematicReferenceEdgeRole({ role: "handoff_h1" }), "cinematic_reference:continuation_h1");
  assert.equal(cinematicReferenceEdgeRole({ role: "continuity_tail" }), "cinematic_reference:continuation_h1");
});

test("editor-only Director controls never enter Provider reference bindings", () => {
  const selected = selectProviderReferenceBindings({
    provider: "ark",
    model: "doubao-seedance-2-0-mini-260615",
    mode: "image_reference"
  }, [
    tailBinding({ mediaId: "media-semantic", role: "storyboard_composition" }),
    { ...tailBinding({ mediaId: "media-director", role: "director_stage_blocking" }), providerEligible: false }
  ]);
  assert.deepEqual(selected.map((entry) => entry.mediaId), ["media-semantic"]);
});

test("a selected storyboard composition must be present and supersede older composition boards", () => {
  const current = { mediaId: "media-storyboard-r4", role: "storyboard_composition", providerEligible: true };
  const stale = { mediaId: "media-storyboard-r3", role: "storyboard_composition", providerEligible: true };
  const blocked = auditSelectedStoryboardReferences({
    generationParameters: { mode: "image_reference" },
    referenceBindings: [stale, current],
    storyboardReferences: [current]
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.errors.some((entry) => entry.code === "stale_storyboard_composition_reference" && entry.mediaId === stale.mediaId), true);
  const missing = auditSelectedStoryboardReferences({
    generationParameters: { mode: "image_reference" },
    referenceBindings: [stale],
    storyboardReferences: [current]
  });
  assert.equal(missing.errors.some((entry) => entry.code === "selected_storyboard_reference_missing"), true);
  const clean = auditSelectedStoryboardReferences({
    generationParameters: { mode: "image_reference" },
    referenceBindings: [current, { mediaId: "media-white", role: "character_identity" }],
    storyboardReferences: [current]
  });
  assert.equal(clean.ok, true, JSON.stringify(clean));
});

test("Core makes revision-current knowledge and TeamManifest gates mandatory in production mode", () => {
  const unit = enforceProductionSignoffGates({ executionGates: { requireTimePlan: true, requiredProfessionalRoles: ["cinematography"] } }, { productionMode: "production" });
  assert.equal(unit.canvasGraphPolicy, "required");
  assert.deepEqual(unit.executionGates, {
    requireTimePlan: true,
    requiredProfessionalRoles: ["cinematography"],
    requireGenerationControlIntent: true,
    requireOwnerShotReviews: true,
    requireOwnerStoryReview: true,
    requirePromptCoverage: true,
    requireSequencePrevis: true,
    requireSegmentSeamDecision: true,
    requireSequenceState: true,
    requireTeamManifest: true,
    requireCurrentArtifactSignoff: true,
    requireKnowledgeGroundedSignoff: true,
    requireManifestBoundSignoff: true
  });
  assert.deepEqual(enforceProductionSignoffGates({ executionGates: {} }, { productionMode: "direct" }), { executionGates: {} });
});

test("production image-reference generation always requires a current accepted per-shot state carrier", () => {
  const unit = enforceProductionSignoffGates({
    generationParameters: { mode: "image_reference" },
    visualAnchorPolicy: "REFERENCE_ONLY",
    executionGates: {}
  }, { productionMode: "production" });
  assert.equal(unit.executionGates.requireAcceptedVisualStateCarrier, true);
  const continuation = enforceProductionSignoffGates({
    generationParameters: { mode: "image_reference" },
    visualAnchorPolicy: "PREVIOUS_ACCEPTED_TAIL",
    executionGates: {}
  }, { productionMode: "production" });
  assert.equal(continuation.executionGates.requireAcceptedVisualStateCarrier, undefined);
});

test("Core does not treat production-wide or stale advice as current knowledge-grounded shot signoff", () => {
  const generationUnit = { generationUnitId: "unit-1", revision: 4 };
  const shots = [{ shotId: "shot-1", revision: 7 }];
  const common = {
    contributionId: "contribution-current",
    roleId: "cinematography",
    expertPackId: "pack-camera",
    targetType: "GenerationUnit",
    targetId: "unit-1",
    structuredFields: {
      targetRevision: 4,
      sourceGenerationUnitRevision: 4,
      sourceShotRevisions: { "shot-1": 7 },
      sourceStoryPacketRevision: 3,
      teamManifestId: "manifest-1"
    },
    knowledgeRefs: ["cap-camera-emotion-first", "kn-5a04ffa7ad75a5fde8c3"]
  };
  const evidence = buildExecutionGateEvidence([
    { ...common, contributionId: "contribution-production", targetType: "production", targetId: "production-1" },
    { ...common, contributionId: "contribution-stale", structuredFields: { ...common.structuredFields, targetRevision: 3, sourceGenerationUnitRevision: 3 } },
    common
  ], [], { generationUnit, shots, teamManifestIds: ["manifest-1"] });

  assert.deepEqual(evidence.currentProfessionalRoles, ["cinematography"]);
  assert.deepEqual(evidence.knowledgeGroundedProfessionalRoles, ["cinematography"]);
  assert.deepEqual(evidence.manifestBoundProfessionalRoles, ["cinematography"]);
  assert.deepEqual(evidence.currentContributionIdsByRole.cinematography, ["contribution-current"]);
  assert.deepEqual(evidence.professionalRoleStoryRevisions.cinematography, [3]);
});

test("Core requires capability and knowledge-atom refs plus the approved manifest on current signoff", () => {
  const generationUnit = { generationUnitId: "unit-1", revision: 4 };
  const shots = [{ shotId: "shot-1", revision: 7 }];
  const evidence = buildExecutionGateEvidence([{
    contributionId: "contribution-doc-only",
    roleId: "continuity-qa",
    expertPackId: "pack-continuity",
    targetType: "CinematicShotSpec",
    targetId: "shot-1",
    structuredFields: { targetRevision: 7, sourceShotRevision: 7, teamManifestId: "manifest-other" },
    knowledgeRefs: ["docs/cinematic/03-shot-contract.md"]
  }], [], { generationUnit, shots, teamManifestIds: ["manifest-1"] });

  assert.deepEqual(evidence.currentProfessionalRoles, ["continuity-qa"]);
  assert.deepEqual(evidence.knowledgeGroundedProfessionalRoles, []);
  assert.deepEqual(evidence.manifestBoundProfessionalRoles, []);
});

test("Core never counts a revision-current grounded contribution with veto findings as signoff", () => {
  const generationUnit = { generationUnitId: "unit-1", revision: 4 };
  const shots = [{ shotId: "shot-1", revision: 7 }];
  const evidence = buildExecutionGateEvidence([{
    contributionId: "contribution-vetoed",
    roleId: "cinematography",
    expertPackId: "pack-camera",
    targetType: "GenerationUnit",
    targetId: "unit-1",
    structuredFields: {
      targetRevision: 4,
      sourceGenerationUnitRevision: 4,
      sourceShotRevisions: { "shot-1": 7 },
      sourceStoryPacketRevision: 3,
      teamManifestId: "manifest-1"
    },
    vetoFindings: ["摄影轨迹合同冲突"],
    knowledgeRefs: ["cap-camera-emotion-first", "kn-5a04ffa7ad75a5fde8c3"]
  }], [], { generationUnit, shots, teamManifestIds: ["manifest-1"] });

  assert.deepEqual(evidence.currentProfessionalRoles, []);
  assert.deepEqual(evidence.knowledgeGroundedProfessionalRoles, []);
  assert.deepEqual(evidence.manifestBoundProfessionalRoles, []);
  assert.deepEqual(evidence.vetoedContributionIdsByRole.cinematography, ["contribution-vetoed"]);
});
