import {
  NODE_KINDS, REVIEW_STATES, UnuTvError, WORKFLOW_LAYERS, createId, defaultNodeSize, isPromptCapableNode,
  nowIso, optionalText, requireEnum, requireNumber, requireObject, requireText
} from "@ununu/unutv-contracts";
import { compileNodeGenerationRequest } from "../image-generation-request-policy.mjs";
import { assessCinematicDialogueAudioRun } from "../cinematic-dialogue-voice-policy.mjs";
import { assertProductionNodeRunAllowed } from "../cinematic-workflow-policy.mjs";

/**
 * Core project/runtime ports shared by every UnunuTV surface.
 * Keeping these primitives outside the application facade preserves one
 * mutation path while keeping the facade an atomic composition module.
 */
export function createApplicationFoundationUseCases({ ports, saveNodePrompt } = {}) {
  async function createProject(input = {}) {
    const timestamp = nowIso();
    const project = {
      id: createId("project"),
      title: optionalText(input.title, "未命名视频项目"),
      createdAt: timestamp,
      updatedAt: timestamp
    };
    await ports.projects.create(project);
    await ports.catalog.add(project);
    const canvas = await createCanvas({ projectId: project.id, title: "主画布" });
    return { project, canvas };
  }

  async function listProjects() {
    const catalogProjects = await ports.catalog.list();
    const projects = catalogProjects.map((catalogProject) => ({
      ...catalogProject,
      ...(ports.projects.summary?.(catalogProject.id) ?? {})
    }));
    return { projects };
  }

  async function openProject(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const project = await ports.projects.open(projectId);
    if (!project) throw new UnuTvError("project_not_found", `Project not found: ${projectId}`, 404);
    return project;
  }

  async function updateProject(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const title = requireText(input.title, "title");
    const current = await ports.projects.open(projectId);
    if (!current) throw new UnuTvError("project_not_found", `Project not found: ${projectId}`, 404);
    const updatedAt = nowIso();
    const project = await ports.projects.update(projectId, { title, updatedAt });
    await ports.catalog.update({ id: projectId, title, updatedAt });
    return project;
  }

  async function createCanvas(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const project = await ports.projects.open(projectId);
    if (!project) throw new UnuTvError("project_not_found", `Project not found: ${projectId}`, 404);
    if (project.canvases?.length) throw new UnuTvError("single_canvas_project", "当前版本每个项目只允许一个画布", 409);
    const timestamp = nowIso();
    const canvas = {
      id: createId("canvas"),
      projectId,
      title: optionalText(input.title, "画布"),
      revision: 1,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    await ports.projects.createCanvas(projectId, canvas);
    return canvas;
  }

  async function openCanvas(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const canvasId = requireText(input.canvasId, "canvasId");
    const canvas = await ports.projects.openCanvas(projectId, canvasId);
    if (!canvas) throw new UnuTvError("canvas_not_found", `Canvas not found: ${canvasId}`, 404);
    return canvas;
  }

  async function createNode(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const canvasId = requireText(input.canvasId, "canvasId");
    const kind = requireEnum(input.kind, NODE_KINDS, "kind");
    const size = { ...defaultNodeSize(kind), ...requireObject(input.size, "size", {}) };
    const timestamp = nowIso();
    const node = {
      id: createId("node"), canvasId, kind, title: optionalText(input.title, kind),
      x: requireNumber(input.x, "x", 0), y: requireNumber(input.y, "y", 0),
      width: requireNumber(size.width, "size.width"), height: requireNumber(size.height, "size.height"),
      revision: 1, payload: requireObject(input.payload, "payload", {}),
      createdAt: timestamp, updatedAt: timestamp
    };
    await ports.projects.createNode(projectId, node);
    await persistNodePrompt(projectId, node);
    return node;
  }

  async function restoreNode(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const canvasId = requireText(input.canvasId, "canvasId");
    const kind = requireEnum(input.kind, NODE_KINDS, "kind");
    const size = { ...defaultNodeSize(kind), ...requireObject(input.size, "size", {}) };
    const timestamp = nowIso();
    const node = {
      id: requireText(input.id, "id"), canvasId, kind, title: optionalText(input.title, kind),
      x: requireNumber(input.x, "x", 0), y: requireNumber(input.y, "y", 0),
      width: requireNumber(size.width, "size.width"), height: requireNumber(size.height, "size.height"),
      revision: requireNumber(input.revision, "revision", 1), payload: requireObject(input.payload, "payload", {}),
      createdAt: optionalText(input.createdAt, timestamp), updatedAt: timestamp
    };
    await ports.projects.createNode(projectId, node);
    await persistNodePrompt(projectId, node);
    return node;
  }

  async function persistNodePrompt(projectId, node) {
    if (typeof node.payload.prompt !== "string" || !isPromptCapableNode(node)) return;
    await saveNodePrompt({
      projectId, nodeId: node.id, text: node.payload.prompt, provider: node.payload.provider,
      modelId: node.payload.modelId, mode: node.payload.mode, parameters: node.payload.parameters,
      referenceNodeIds: node.payload.refs, referenceMediaIds: node.payload.referenceMediaIds
    });
  }

  async function updateNode(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const nodeId = requireText(input.nodeId, "nodeId");
    const patch = {};
    if (input.title !== undefined) patch.title = optionalText(input.title, "未命名节点");
    for (const field of ["x", "y", "width", "height"]) if (input[field] !== undefined) patch[field] = requireNumber(input[field], field);
    if (input.payload !== undefined) patch.payload = requireObject(input.payload, "payload");
    const screenplayCas = input.screenplayCas === undefined
      ? undefined
      : requireObject(input.screenplayCas, "screenplayCas");
    const node = await ports.projects.updateNode(projectId, nodeId, patch, input.expectedRevision, screenplayCas);
    if (!node) throw new UnuTvError("node_not_found", `Node not found: ${nodeId}`, 404);
    return node;
  }

  async function deleteNode(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const nodeId = requireText(input.nodeId, "nodeId");
    return { deleted: await ports.projects.deleteNode(projectId, nodeId), nodeId };
  }

  async function connectEdge(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    return ports.projects.connectEdge(projectId, {
      id: createId("edge"), canvasId: requireText(input.canvasId, "canvasId"),
      fromNodeId: requireText(input.fromNodeId, "fromNodeId"), toNodeId: requireText(input.toNodeId, "toNodeId"),
      role: optionalText(input.role, "input"), createdAt: nowIso()
    });
  }

  async function disconnectEdge(input = {}) {
    return { disconnected: await ports.projects.disconnectEdge(requireText(input.projectId, "projectId"), requireText(input.edgeId, "edgeId")) };
  }

  async function createGroup(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const timestamp = nowIso();
    const group = {
      id: createId("group"), canvasId: requireText(input.canvasId, "canvasId"), title: optionalText(input.title, "分组"),
      x: requireNumber(input.x, "x", 0), y: requireNumber(input.y, "y", 0),
      width: requireNumber(input.width, "width", 960), height: requireNumber(input.height, "height", 640),
      revision: 1, createdAt: timestamp, updatedAt: timestamp
    };
    await ports.projects.createGroup(projectId, group);
    return group;
  }

  async function addGroupMember(input = {}) {
    return ports.projects.addGroupMember(requireText(input.projectId, "projectId"), requireText(input.groupId, "groupId"), requireText(input.nodeId, "nodeId"));
  }

  async function deleteGroup(input = {}) {
    return { deleted: await ports.projects.deleteGroup(requireText(input.projectId, "projectId"), requireText(input.groupId, "groupId")) };
  }

  async function getProviderSettings() { return ports.credentials.status(); }

  async function updateProviderSettings(input = {}) {
    const settings = requireObject(input, "settings");
    const allowed = new Set(["ununuApiKey", "arkApiKey", "openrouterApiKey", "arkTtsApiKey", "arkTtsVoiceId", "openspeechApiKey", "openspeechSpeakerId"]);
    for (const [field, value] of Object.entries(settings)) {
      if (!allowed.has(field)) throw new UnuTvError("invalid_provider_setting", `Unknown provider setting: ${field}`);
      if (value !== null && typeof value !== "string") throw new UnuTvError("invalid_provider_setting", `${field} must be a string or null`);
    }
    return ports.credentials.update(settings);
  }

  async function runNode(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const nodeId = requireText(input.nodeId, "nodeId");
    const node = await ports.projects.getNode(projectId, nodeId);
    if (!node) throw new UnuTvError("node_not_found", `Node not found: ${nodeId}`, 404);
    assertProductionNodeRunAllowed(node, { generationUnitId: input.generationUnitId, authorization: input.generationUnitAuthorization });
    const prompt = await ports.projects.getNodePrompt(projectId, nodeId);
    const requested = { ...(prompt?.text && input.request?.prompt === undefined ? { prompt: prompt.text } : {}), ...requireObject(input.request, "request", {}) };
    const request = compileNodeGenerationRequest(node, requested);
    const provider = optionalText(input.provider, optionalText(prompt?.provider, optionalText(node.payload?.provider, node.kind === "audio" ? "openspeech" : "openrouter")));
    if (node.kind === "audio" && node.payload?.resourceType === "cinematic_dialogue_line") {
      const productionId = requireText(node.payload?.productionId, "node.payload.productionId");
      const [authorities, canvas, reviews] = await Promise.all([
        ports.projects.listCinematicAssetAuthorities(projectId, productionId),
        ports.projects.openCanvas(projectId, requireText(node.canvasId, "node.canvasId")),
        ports.projects.listReviews(projectId)
      ]);
      const voiceGate = assessCinematicDialogueAudioRun({
        authorities,
        canvas,
        node,
        provider,
        request,
        reviews
      });
      if (!voiceGate.ok) {
        throw new UnuTvError(
          "cinematic_dialogue_voice_gate_failed",
          "正式对白必须从当前已接受的角色或逐行声音权威精确派生，并保留可见画布证据。",
          409,
          voiceGate
        );
      }
    }
    const run = await ports.projects.createRun(projectId, {
      id: createId("run"), nodeId, status: "queued",
      provider,
      request, createdAt: nowIso()
    });
    try {
      const result = await ports.provider.run({ projectId, node, run, request: run.request });
      return finishProviderResult(projectId, nodeId, run.id, result);
    } catch (error) {
      return ports.projects.finishRun(projectId, run.id, "blocked", { code: error.code ?? "provider_unavailable", message: error.message, details: error.details ?? null });
    }
  }

  async function finishProviderResult(projectId, nodeId, runId, result) {
    const materialized = [];
    for (const artifact of result.artifacts ?? []) materialized.push(await ports.media.importBytes({ projectId, nodeId, kind: artifact.kind, mimeType: artifact.mimeType, bytes: artifact.bytes, title: artifact.title }));
    return ports.projects.finishRun(projectId, runId, result.status ?? "succeeded", { ...result, artifacts: materialized });
  }

  async function pollRun(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const runId = requireText(input.runId, "runId");
    const run = await ports.projects.getRun(projectId, runId);
    if (!run) throw new UnuTvError("run_not_found", `Run not found: ${runId}`, 404);
    const recoverablePollFailure = run.status === "failed" && run.result?.task?.taskId && run.result?.code === "provider_request_failed";
    if (["succeeded", "failed", "blocked", "canceled"].includes(run.status) && !recoverablePollFailure) return run;
    if (run.status === "queued" && !run.result?.task?.taskId) return run;
    const node = await ports.projects.getNode(projectId, run.nodeId);
    if (!node) throw new UnuTvError("node_not_found", `Node not found: ${run.nodeId}`, 404);
    try {
      const result = await ports.provider.poll({ projectId, node, run });
      return finishProviderResult(projectId, node.id, run.id, result);
    } catch (error) {
      const retryable = run.result?.task?.taskId && error.code === "provider_request_failed";
      return ports.projects.finishRun(projectId, run.id, retryable ? "running" : "failed", {
        ...run.result,
        ...(retryable ? { pollError: { code: error.code, message: error.message } } : { code: error.code ?? "provider_poll_failed", message: error.message })
      });
    }
  }

  async function cancelRun(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const runId = requireText(input.runId, "runId");
    const run = await ports.projects.getRun(projectId, runId);
    if (!run) throw new UnuTvError("run_not_found", `Run not found: ${runId}`, 404);
    if (run.status === "canceled") return run;
    if (!["queued", "running"].includes(run.status)) {
      throw new UnuTvError("run_cancel_unavailable", `Only a queued or running Provider run can be canceled: ${run.status}`, 409);
    }
    if (typeof ports.provider.cancel !== "function") {
      throw new UnuTvError("provider_cancel_unsupported", `Provider cancellation is unavailable for ${run.provider}`, 409);
    }
    const node = await ports.projects.getNode(projectId, run.nodeId);
    if (!node) throw new UnuTvError("node_not_found", `Node not found: ${run.nodeId}`, 404);
    const result = await ports.provider.cancel({
      projectId,
      node,
      run,
      reason: optionalText(input.reason, "owner_canceled")
    });
    const canceled = await ports.projects.finishRun(projectId, run.id, "canceled", result);
    if (node.payload?.providerRunId === run.id) {
      await updateNode({
        projectId,
        nodeId: node.id,
        expectedRevision: node.revision,
        payload: {
          ...node.payload,
          generationStatus: "canceled",
          generationPhase: "canceled",
          generationMessage: "Provider 任务已取消",
          providerRunId: run.id
        }
      });
    }
    return canceled;
  }

  async function setWorkflowLayer(input = {}) {
    return ports.projects.setWorkflowLayer(requireText(input.projectId, "projectId"), {
      layer: requireEnum(input.layer, WORKFLOW_LAYERS, "layer"),
      reviewState: requireEnum(input.reviewState ?? "draft", REVIEW_STATES, "reviewState"),
      payload: requireObject(input.payload, "payload", {}), updatedAt: nowIso()
    });
  }

  async function getWorkflow(input = {}) { return ports.projects.getWorkflow(requireText(input.projectId, "projectId")); }

  async function saveDirectorStage(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const nodeId = requireText(input.nodeId, "nodeId");
    const node = await ports.projects.getNode(projectId, nodeId);
    if (!node || node.kind !== "director") throw new UnuTvError("director_node_required", "A director node is required", 400);
    return ports.projects.saveDirectorStage(projectId, { nodeId, canvasId: node.canvasId, stage: requireObject(input.stage, "stage"), updatedAt: nowIso() });
  }

  async function getDirectorStage(input = {}) {
    return ports.projects.getDirectorStage(
      requireText(input.projectId, "projectId"),
      requireText(input.nodeId, "nodeId"),
      input.includeStale === true
    );
  }

  async function setPanorama(input = {}) {
    return ports.projects.setPanorama(requireText(input.projectId, "projectId"), {
      nodeId: requireText(input.nodeId, "nodeId"), mediaId: requireText(input.mediaId, "mediaId"),
      metadata: requireObject(input.metadata, "metadata", {}), updatedAt: nowIso()
    });
  }

  async function getPanorama(input = {}) { return ports.projects.getPanorama(requireText(input.projectId, "projectId"), requireText(input.nodeId, "nodeId")); }
  async function listReviews(input = {}) { return ports.projects.listReviews(requireText(input.projectId, "projectId")); }
  async function listRuns(input = {}) { return ports.projects.listRuns(requireText(input.projectId, "projectId")); }

  return {
    addGroupMember, cancelRun, connectEdge, createCanvas, createGroup, createNode, createProject, deleteGroup, deleteNode,
    disconnectEdge, finishProviderResult, getDirectorStage, getPanorama, getProviderSettings, getWorkflow,
    listProjects, listReviews, listRuns, openCanvas, openProject, pollRun, restoreNode, runNode,
    saveDirectorStage, setPanorama, setWorkflowLayer, updateNode, updateProject, updateProviderSettings
  };
}
