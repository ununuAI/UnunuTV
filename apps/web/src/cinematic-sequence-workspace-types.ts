export interface SequencePrevisShot {
  previsShotId: string;
  shotId: string;
  shotRevision: number;
  order: number;
  startSeconds: number;
  endSeconds: number;
  narrativeJob: string;
  entryPhase: string;
  exitPhase: string;
  frameMediaId?: string;
  frameSourceRole?: string;
  cameraState: Record<string, unknown>;
  performanceState: Record<string, unknown>;
  spatialState: Record<string, unknown>;
  audioCue: Record<string, unknown>;
}

export interface CutDecision {
  cutDecisionId: string;
  fromShotId: string;
  toShotId: string;
  atSeconds: number;
  transitionType: "cut" | "match_cut" | "audio_bridge" | "occlusion_cut" | "whip_pan" | "continuous_no_cut";
  motivation: string;
  outgoingPhase: string;
  incomingPhase: string;
  axisRule: string;
  gazeRelation: string;
  motionVector: string;
  audioBridge: string;
  overlapSeconds?: number;
}

export interface SequencePrevisDocument extends Record<string, unknown> {
  sequencePrevisId?: string;
  productionId?: string;
  title: string;
  status: "draft" | "candidate" | "accepted" | "rejected";
  storyPacketId: string;
  storyPacketRevision: number;
  durationSeconds: number;
  frameRate: number;
  shots: SequencePrevisShot[];
  cutDecisions: CutDecision[];
  acceptedAuthorityIds: string[];
  storyboardIds: string[];
  directorCaptureIds: string[];
  rejectedExampleEvaluationIds: string[];
  revision?: number;
}

export interface VisualContextBundle extends Record<string, unknown> {
  visualContextBundleId: string;
  sequencePrevisId: string;
  sequencePrevisRevision: number;
  shotId: string;
  phaseStrip: Array<Record<string, unknown>>;
  referenceRoles: Array<Record<string, unknown>>;
  promptFacts: { preserve: unknown[]; change: unknown[]; motion: unknown[]; prohibitions: unknown[] };
}
