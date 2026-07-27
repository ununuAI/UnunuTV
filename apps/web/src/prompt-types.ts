export type ModelCapability = "text" | "image" | "video" | "audio";
export type ModelReferenceKind = "text" | "image" | "video" | "audio" | "document" | "other";

export interface ModelExecutionSelection {
  modelId: string;
  parameters?: Record<string, string | number | boolean>;
  providerId: string;
}

export interface ModelReferencePacketViewModel {
  counts: Record<ModelReferenceKind, number>;
  createdAt?: string;
  sources: Array<{ mediaKinds: ModelReferenceKind[]; nodeId: string; nodeKind: string; title: string }>;
  version: "model_reference_packet_v1";
}

export interface ModelRequestManifestViewModel {
  model: { alias: string; capability: string; id: string; label: string; providerId: string; providerRoute: string };
  parameters: Record<string, string | number | boolean | undefined>;
  preflight: { acceptedReferenceKinds: ModelReferenceKind[]; issues: Array<{ code: string; message: string; referenceKind?: ModelReferenceKind }>; status: "ready" | "blocked" };
  prompt: string;
  referenceCounts: Record<ModelReferenceKind, number>;
  requestId: string;
  version: "model_request_manifest_v1";
}

export interface ModelExecutionReceiptViewModel {
  message: string;
  status: "blocked" | "simulated" | "succeeded" | "failed" | string;
}

export interface NodeAssetReference {
  assetId: string | null;
  displayName?: string;
  mediaId?: string;
  providerIndex?: number;
  role?: string;
  versionId: string | null;
  previewUrl?: string;
  lockedReference?: boolean;
}

export interface CanvasNode {
  assetReferences?: NodeAssetReference[];
  assetRole?: string;
  blockedReason?: string;
  canRun: boolean;
  cost: string;
  generationActivity?: unknown;
  id: string;
  imageNodeType?: string;
  kind: string;
  modelExecutionReceipt?: ModelExecutionReceiptViewModel;
  modelReferencePacket?: ModelReferencePacketViewModel;
  modelRequestManifest?: ModelRequestManifestViewModel;
  modelSelection?: ModelExecutionSelection;
  previewUrl?: string;
  prompt: string;
  promptDocument?: { type: "doc"; version: 1; content: Array<Record<string, unknown> & { type: "text" | "reference" | "skill" | "constraint" }> };
  outputMode?: "text" | "image" | "audio" | "video" | "world";
  referenceMediaIds?: string[];
  refs: string[];
  sourceKind?: string;
  status: string;
  summary: string;
  title: string;
}

export interface ScriptAssetVersion {
  id: string;
  kind?: ModelReferenceKind;
  mediaId?: string;
  url?: string;
}

export interface ScriptAssetItem {
  id: string;
  mediaKind?: ModelReferenceKind;
  name: string;
  role: string;
  scope: "project" | "global";
  thumbnailLabel: string;
  thumbnailUrl?: string;
  versions: ScriptAssetVersion[];
}

export interface VideoP0Actions {
  bindNodeAssetReference: (nodeId: string, assetId: string, versionId: string) => Promise<void> | void;
  deleteEdge: (fromNodeId: string, toNodeId: string) => Promise<void> | void;
  openPanel: (panel: string) => void;
  savePromptDraft: (nodeId: string, value: string, selection?: ModelExecutionSelection) => Promise<void> | void;
  savePromptDocument?: (nodeId: string, document: CanvasNode["promptDocument"], selection?: ModelExecutionSelection) => Promise<void> | void;
  setPromptOutputMode?: (nodeId: string, outputMode: "text" | "image" | "audio" | "video") => Promise<void> | void;
  sendPrompt: (nodeId: string, value: string, selection?: ModelExecutionSelection) => Promise<void> | void;
  unbindNodeAssetReference: (nodeId: string, assetId: string, versionId: string) => Promise<void> | void;
}
