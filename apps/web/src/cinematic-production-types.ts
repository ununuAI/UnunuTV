export type CinematicProjectType = "feature_film" | "short_film" | "episodic_series" | "short_drama" | "commercial" | "music_video" | "documentary" | "animation" | "trailer" | "social_video";
export type CinematicProductionMode = "direct" | "production";
export type GenerationStrategy = "single_shot" | "designed_multi_shot" | "continuous_segment" | "storyboard_action_sequence";
export type VisualAnchorPolicy = "NONE" | "FIRST_FRAME" | "FIRST_LAST_FRAME" | "STORYBOARD_SHEET" | "SHOT_FRAME_SET" | "ACTION_PHASE_BOARD" | "PREVIOUS_ACCEPTED_TAIL" | "DUPLICATE_HANDOFF";

export interface PromptConstraintCoverage extends Record<string, unknown> {
  subjectCountRoles: string;
  coordinateFrame: string;
  topologyAttachments: string;
  geometryScale: string;
  spatialBlocking: string;
  poseGazeHandsProps: string;
  surfaceMaterialWardrobe: string;
  visibilityOcclusionCompletion: string;
  cameraFramingLensFocus: string;
  lightingColorExposure: string;
  initialState: string;
  continuityInvariants: string;
  subjectTrajectories?: string;
  actionPhases?: string;
  timingSpeed?: string;
  cameraTrajectory?: string;
  contactForcesPhysics?: string;
  performanceDialogueAudio?: string;
  endStateHandoff?: string;
  cutSeamStrategy?: string;
  escapeRoutes: string[];
  counterexampleClosures: Array<{
    observedFailure: string;
    omittedDetail: string;
    positiveConstraint: string;
    vetoCriterion: string;
  }>;
}

export interface OrbitCameraTrajectory extends Record<string, unknown> {
  movementType: "orbit";
  coordinateSpace: "subject_local" | "world";
  pivot: { targetId: string; description: string };
  startPose: { azimuthDegrees: number; elevationDegrees: number; radiusMeters: number; heightMeters: number };
  endPose: { azimuthDegrees: number; elevationDegrees: number; radiusMeters: number; heightMeters: number };
  direction: "clockwise_from_overhead" | "counterclockwise_from_overhead";
  arcDegrees: number;
  durationSeconds: number;
  speedCurve: string;
  lookAt: string;
  lensFocus: string;
  rollDegrees: number;
  framingInvariant: string;
  subjectMotionRelation: string;
  occlusionPlan: string;
  parallaxExpectation: string;
  controlRouteId: string;
  cleanCaptures: { startCaptureId: string; midCaptureId: string; endCaptureId: string };
  overlayPolicy: "editor_only" | "provider_reference_only";
  annotationReference?: CameraAnnotationReference;
}

export interface CameraTrajectoryPlan extends Record<string, unknown> {
  movementType: "arc" | "compound" | "crane" | "dolly" | "handheld" | "orbit" | "pan_tilt" | "pedestal" | "truck" | "zoom";
  guideType: "compound_guides" | "lens_curve" | "motion_envelope" | "orientation_arc" | "path_curve";
  coordinateSpace: "subject_local" | "world";
  startState: CameraTrajectoryState;
  endState: CameraTrajectoryState;
  focusDistancePlan?: Array<{ atSeconds: number; focusDistanceMeters: number; target: string; interpolation: "hold" | "linear" | "ease_in" | "ease_out" | "ease_in_out" }>;
  durationSeconds: number;
  pathDescription: string;
  directionDefinition: string;
  speedCurve: string;
  lookAt: string;
  lensFocus: string;
  framingInvariant: string;
  subjectMotionRelation: string;
  occlusionPlan: string;
  parallaxExpectation: string;
  controlGeometryId: string;
  cleanCaptures: { startCaptureId: string; midCaptureId: string; endCaptureId: string };
  overlayPolicy: "editor_only" | "provider_reference_only";
  annotationReference?: CameraAnnotationReference;
}

export interface CameraAnnotationReference {
  mediaId: string;
  sourceMediaId: string;
  sourceChecksum: string;
  controlGeometryId: string;
  annotations: Array<{ annotationId: string; kind: "direction" | "focus" | "orientation" | "path" | "region" | "timing"; meaning: string; instruction: string; startSeconds: number; endSeconds: number }>;
}

export interface CameraTrajectoryState {
  position: { x: number; y: number; z: number };
  yawDegrees: number;
  pitchDegrees: number;
  rollDegrees: number;
  fovDegrees: number;
  focusDistanceMeters: number;
}

export interface TemporalMotionPlan extends Record<string, unknown> {
  timelineId: string;
  durationSeconds: number;
  frameRate: number;
  phases: Array<{
    phaseId: string;
    phaseType: "hold" | "anticipation" | "action" | "impact" | "follow_through" | "settle" | "handoff";
    startSeconds: number;
    endSeconds: number;
    dependsOn: string[];
    description: string;
  }>;
  tracks: Array<{
    trackId: string;
    entityId: string;
    displayName: string;
    trackType: "subject" | "prop" | "camera" | "environment";
    coordinateSpace: "director_world" | "subject_local" | "screen";
    states: Array<{
      stateId: string;
      atSeconds: number;
      phaseId: string;
      position: { x: number; y: number; z: number };
      orientation: { yawDegrees: number; pitchDegrees: number; rollDegrees: number };
      focusDistanceMeters?: number;
      pose: string;
      contacts: string[];
      visibility: "visible" | "occluded" | "offscreen";
    }>;
    transitions: Array<{
      fromStateId: string;
      toStateId: string;
      path: string;
      interpolation: "hold" | "linear" | "ease_in" | "ease_out" | "ease_in_out" | "bezier";
      velocityCurve: string;
      actionPhase: string;
      contactEvolution: string;
      requiredIntermediateStates: Array<{ atSeconds: number; description: string }>;
    }>;
  }>;
  evaluationPolicy: {
    sampleEveryFrames: number;
    derivativeChecks: Array<"position_delta" | "orientation_delta" | "velocity_continuity" | "acceleration_continuity" | "contact_continuity" | "action_phase" | "screen_direction">;
  };
}

export interface CinematicProduction {
  productionId: string;
  projectType: CinematicProjectType;
  productionMode: CinematicProductionMode;
  title: string;
  sourceNodeId?: string | null;
  storyPacketIds: string[];
  visualBibleId?: string | null;
  shotIds: string[];
  generationUnitIds: string[];
  assetAuthorityIds: string[];
  teamManifestIds: string[];
  reviewState: string;
  revision: number;
  legacyExtensions?: Record<string, unknown>;
}

export interface StoryProductionPacket extends Record<string, unknown> {
  storyPacketId?: string;
  sourceFacts: string[];
  lockedStoryFacts: string[];
  scenePurpose: string;
  characters: Array<Record<string, unknown>>;
  causalEventChain: string[];
  dialogue: Array<Record<string, unknown>>;
  emotionalArc: Record<string, unknown>;
  entranceState: Record<string, unknown>;
  exitState: Record<string, unknown>;
  mustNotAppearYet: string[];
  userLockedText: string[];
  revision?: number;
}

export interface VisualBible extends Record<string, unknown> {
  visualBibleId?: string;
  cinematography: Record<string, unknown>;
  lighting: Record<string, unknown>;
  color: Record<string, unknown>;
  productionDesign: Record<string, unknown>;
  characterLook: Record<string, unknown>;
  performance: Record<string, unknown>;
  sound: Record<string, unknown>;
  vfx: Record<string, unknown>;
  continuityLocks: string[];
  visualMotifs: string[];
  colorArc: Record<string, unknown>;
  spatialDramaturgy: Record<string, unknown>;
  propSemantics: Record<string, unknown>;
  costumeNarrative: Record<string, unknown>;
  materialAging: Record<string, unknown>;
  culturalResearchRefs: string[];
  styleProhibitions: string[];
  revision?: number;
}

export type AssetAuthorityType = "character" | "scene" | "prop";

export interface CinematicAssetAuthority extends Record<string, unknown> {
  authorityId: string;
  authorityType: AssetAuthorityType;
  displayName: string;
  riskLevel: "low" | "medium" | "high" | "critical";
  status: "draft" | "candidate" | "accepted" | "rejected";
  viewSpecs: Array<Record<string, unknown>>;
  referenceAssetIds: string[];
  acceptanceCriteria: string[];
  prohibitedChanges: string[];
  boardSpecs?: Array<Record<string, unknown> & {
    pixelMode?: "clean_authority" | "annotated_control";
    annotationInstructions?: string[];
    requirePromptCoverage?: boolean;
    promptCoverage?: PromptConstraintCoverage;
  }>;
  revision: number;
}

export interface ImagePromptCompilation extends Record<string, unknown> {
  compilationId: string;
  envelope: Record<string, unknown> & {
    protocolId: string;
    compiledContentPrompt: string;
    payloadHash: string;
    lint: { ok: boolean; errors: Array<Record<string, unknown>>; warnings: Array<Record<string, unknown>>; bytes: number };
  };
}

export interface CinematicShotSpec extends Record<string, unknown> {
  shotId: string;
  order: number;
  narrativeJob: string;
  storyBeat: string;
  openingState: string;
  trigger: string;
  actionChain: string[];
  endingState: string;
  cameraTrajectoryPlan?: CameraTrajectoryPlan;
  orbitCameraTrajectory?: OrbitCameraTrajectory;
  revision: number;
}

export interface StoryboardVideoReference extends Record<string, unknown> {
  selected: boolean;
  role: "storyboard_composition" | "storyboard_action_phase" | "storyboard_first_frame";
  controls: string[];
  doesNotControl: string[];
  selectedAt?: string | null;
  acceptanceProof?: VisualStateAcceptanceProof | null;
}

export interface VisualStateAcceptanceProof {
  reviewId: string;
  mediaId: string;
  checksum: string;
  shotId: string;
  shotRevision: number;
  pixelReviewed: true;
  verifiedDomains: Array<"character_identity" | "scene_topology" | "spatial_blocking" | "camera_composition" | "continuity_state">;
}

export interface StoryboardShotV2 extends Record<string, unknown> {
  storyboardShotId: string;
  storyboardId: string;
  shotId: string;
  generationUnitId?: string | null;
  order: number;
  title: string;
  storyBeat: string;
  narrativeJob?: string;
  durationSeconds?: number | null;
  cinematicPlan?: {
    blocking?: Record<string, unknown>;
    cinematography?: Record<string, unknown>;
    editContinuity?: Record<string, unknown>;
    openingState?: string;
    actionChain?: string[];
    endingState?: string;
    directorStageBinding?: Record<string, unknown>;
  };
  requiredAssetAuthorityIds: string[];
  imageMediaId?: string | null;
  videoMediaId?: string | null;
  status: string;
  videoReference: StoryboardVideoReference;
  revision: number;
}

export interface StoryboardDocumentV2 extends Record<string, unknown> {
  storyboardId: string;
  projectId: string;
  productionId: string;
  nodeId?: string | null;
  title: string;
  status: string;
  shots: StoryboardShotV2[];
  revision: number;
}

export interface ReferenceBinding extends Record<string, unknown> {
  displayName: string;
  mediaId: string;
  providerIndex: number;
  role: string;
  controls: string[];
  doesNotControl: string[];
  semanticControl?: {
    temporalRole: "identity_only" | "static_state" | "initial_state" | "action_phase" | "endpoint" | "continuity_state" | "style_only";
    preserve: string[];
    replace: Array<{ observed: string; target: string }>;
    complete: Array<{ missing: string; target: string }>;
    ignore: string[];
    styleOnly: string[];
  };
  acceptanceProof?: VisualStateAcceptanceProof | null;
  handoffVerification?: {
    spatialContinuityVerified: boolean;
    subjectStateVerified: boolean;
    screenDirectionVerified: boolean;
    cameraStateVerified?: boolean;
    lensFocusExposureVerified?: boolean;
    motionPhaseVerified?: boolean;
    overlapHandleVerified?: boolean;
    ambientAudioContinuityVerified?: boolean;
  };
}

export interface GenerationParameters extends Record<string, unknown> {
  provider: string;
  model: string;
  mode: string;
  duration: number;
  aspectRatio: string;
  resolution: string;
  count: number;
  generateAudio: boolean;
  referenceMediaIds: string[];
  virtualPersonAssetIds?: string[];
}

export interface CinematicSequenceState extends Record<string, unknown> {
  sceneId: string;
  sequenceIndex: number;
  relation: "sequence_first" | "seamless_continuation" | "intentional_next_shot" | "bridge" | "repair_tail" | "reanchor_after_drift";
  parentGenerationUnitId?: string;
  sourceEvaluationId?: string;
  feltIntent: string;
  intentCarriers: { camera: string; lighting: string; performance: string; sound: string };
  alreadyHappened: string[];
  thisUnitOnly: string[];
  reservedForLater: string[];
  plannedStartState: Record<string, unknown>;
  plannedEndState: Record<string, unknown>;
  extensionDepth: number;
  maxExtensionDepth: number;
  reanchorPolicy: { scheduled: boolean; authorityIds: string[]; reason: string };
}

export interface GenerationUnit extends Record<string, unknown> {
  generationUnitId: string;
  lifecycle?: "active" | "blocked_by_authority" | "blocked_by_rejected_continuity_source" | "superseded";
  supersededReason?: string;
  supersededByPlan?: string;
  strategy: GenerationStrategy;
  shotLinks: Array<Record<string, unknown> & { shotId: string; order: number }>;
  visualAnchorPolicy: VisualAnchorPolicy;
  requiredCapabilities: string[];
  generationParameters: GenerationParameters;
  controlIntent?: {
    primaryConsistency: "within_clip_temporal" | "external_identity" | "cross_shot_continuity" | "spatial_blocking" | "balanced";
    cameraFreedom: "locked" | "limited" | "expansive";
    motionComplexity: "low" | "medium" | "high";
    modeRationale: string;
    invariants: string[];
    permittedChanges: string[];
    dynamicControl: {
      source: "text_motion_contract" | "action_phase_board" | "video_motion_reference" | "hybrid";
      subjectTrajectories: string;
      actionPhases: string;
      timing: string;
      cameraTrajectory: string;
      physicsContinuity: string;
      endState: string;
    };
    temporalMotionPlan?: TemporalMotionPlan;
    constraintRelease?: { mechanism: string; releases: string[]; preserves: string[] };
  };
  promptCoverage?: PromptConstraintCoverage;
  continuationHandoff?: {
    mode: "TAIL_CONTINUE" | "DUPLICATE_HANDOFF";
    seamType: "action_match" | "occlusion" | "foreground_wipe" | "whip_pan" | "flash" | "dark_frame" | "motion_blur";
    seamOpportunity: string;
    entryActionPhase: string;
    exitActionPhase: string;
    repeatedAction: string;
    newContentAfterH1: string;
    cutPointRule: string;
    trimPlan: string;
    h0MediaId?: string;
    h1MediaId?: string;
    h0ToH1Action?: string;
    camera: { movementDirection: string; exitSpeed: string; entrySpeed: string; lens: string; focus: string; exposure: string };
    audioBridge: { ambience: string; syncCue: string };
    conservationChecks: Array<"blocking" | "props" | "lighting" | "action_phase" | "screen_direction">;
  };
  reviewRequirements?: Array<{
    checkId: string;
    category: string;
    entityId: string;
    requirement: string;
    blocking: boolean;
  }>;
  sequenceState?: CinematicSequenceState;
  revision: number;
}

export interface GenerationUnitRecord {
  generationUnit: GenerationUnit;
  referenceBindings: ReferenceBinding[];
}

export interface PromptCompilation extends Record<string, unknown> {
  compilationId: string;
  envelope: Record<string, unknown> & {
    compiledContentPrompt: string;
    generationParameters: GenerationParameters;
    referenceBindings: ReferenceBinding[];
    lint: { ok: boolean; errors: Array<Record<string, unknown>>; bytes: number };
    preflight: { ok: boolean; errors: Array<Record<string, unknown>>; degradations: Array<Record<string, unknown>>; modeControl?: Record<string, unknown>; unitLifecycle?: Record<string, unknown> };
    capabilityDegradation: Array<Record<string, unknown>>;
    generationControl: Record<string, unknown> & { errors?: Array<Record<string, unknown>>; warnings?: Array<Record<string, unknown>> };
    protocolId: string;
    payloadHash: string;
    manualOverride: boolean;
  };
}

export interface CinematicEvaluation extends Record<string, unknown> {
  evaluationId: string;
  decision: "ACCEPT" | "PARTIAL" | "REJECT";
  visibleEntityChecks?: Array<{
    checkId: string;
    category: string;
    entityId: string;
    expected: string;
    observed: string;
    passed: boolean;
  }>;
  vetoFindings?: string[];
  takeObservation?: {
    observedStartState: Record<string, unknown>;
    observedEndState: Record<string, unknown>;
    completedBeats: string[];
    incompleteBeats: string[];
    unexpectedCompletedBeats: string[];
    continuityBreaks: string[];
    acceptedDeviations: string[];
    confidence: "low" | "medium" | "high";
    uncertainties: string[];
  };
  canonReconciliation?: {
    status: "accepted" | "pending" | "rejected";
    acceptedObservedFacts: string[];
    rejectedObservedFacts: string[];
    promotedCompletedBeats: string[];
    carryForwardState: Record<string, unknown>;
    nextUnitLocks: string[];
    rationale: string;
  };
  retakeDisposition?: {
    type: "KEEP" | "FIX_IN_POST" | "EDIT_SOURCE" | "REROLL" | "REWRITE" | "REANCHOR";
    primaryFailureLayer: string;
    changedVariables: string[];
    reason: string;
    nextAction: string;
  };
}

export interface ProfessionalContribution extends Record<string, unknown> {
  contributionId: string;
  roleId: string;
  targetType: string;
  targetId: string;
  diagnosis: string;
}
