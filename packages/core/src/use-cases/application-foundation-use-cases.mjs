import { randomInt } from "node:crypto";
import {
  MINIMAX_H3_MODEL_ID, NODE_KINDS, REVIEW_STATES, TEXT_NODE_MODES, UnuTvError, WORKFLOW_LAYERS, createId, defaultNodeSize, isPromptCapableNode,
  nowIso, optionalText, projectGatewayModels, requireEnum, requireNumber, requireObject, requireText, resolveTextNodeMode
} from "@ununu/unutv-contracts";
import { compileNodeGenerationRequest } from "../image-generation-request-policy.mjs";
import { assessCinematicDialogueAudioRun } from "../cinematic-dialogue-voice-policy.mjs";
import { assertProductionNodeRunAllowed } from "../cinematic-workflow-policy.mjs";
import { parseScriptModelOutput } from "../script-output-policy.mjs";
import { H3_PROMPT_COMPILER_VERSION, h3PromptCompilerSystemPrompt } from "../h3-prompt-compiler-policy.mjs";

const H3_RANDOM_SEED_LIMIT = 2_147_483_647;
let previousAutomaticH3Seed = null;

function nextAutomaticH3Seed() {
  let seed = randomInt(0, H3_RANDOM_SEED_LIMIT);
  if (seed === previousAutomaticH3Seed) seed = (seed + 1) % H3_RANDOM_SEED_LIMIT;
  previousAutomaticH3Seed = seed;
  return seed;
}

function isH3VideoRun(node, provider, request) {
  if (!["video", "videoShot", "video-clip", "compose"].includes(node.kind) || !["minimax", "autodl"].includes(provider)) return false;
  return [request.model, request.modelId, node.payload?.modelId].some((modelId) => modelId === MINIMAX_H3_MODEL_ID);
}

/**
 * Core project/runtime ports shared by every UnunuTV surface.
 * Keeping these primitives outside the application facade preserves one
 * mutation path while keeping the facade an atomic composition module.
 */
export function createApplicationFoundationUseCases({ ports, saveNodePrompt } = {}) {
  function normalizeCreatedNodePayload(kind, inputPayload) {
    const payload = requireObject(inputPayload, "payload", {});
    if (kind !== "text") return payload;
    const textMode = payload.textMode === undefined
      ? resolveTextNodeMode({ kind, payload })
      : requireEnum(payload.textMode, TEXT_NODE_MODES, "payload.textMode");
    return { ...payload, textMode };
  }
  async function getWorkspace() {
    return ports.catalog.getWorkspace();
  }

  async function initializeWorkspace(input = {}) {
    return ports.catalog.initializeWorkspace(requireText(input.rootPath, "rootPath"), nowIso());
  }

  async function setWorkspaceRoot(input = {}) {
    return ports.catalog.setWorkspaceRoot(requireText(input.rootPath, "rootPath"), nowIso());
  }

  async function createProject(input = {}) {
    const timestamp = nowIso();
    const project = {
      id: createId("project"),
      title: optionalText(input.title, "未命名视频项目"),
      createdAt: timestamp,
      updatedAt: timestamp
    };
    project.mediaRoot = await ports.catalog.projectMediaRoot(project);
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
      revision: 1, payload: normalizeCreatedNodePayload(kind, input.payload),
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
      revision: requireNumber(input.revision, "revision", 1), payload: normalizeCreatedNodePayload(kind, input.payload),
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
    if (input.payload !== undefined) {
      const payload = requireObject(input.payload, "payload");
      const current = await ports.projects.getNode(projectId, nodeId);
      if (!current) throw new UnuTvError("node_not_found", `Node not found: ${nodeId}`, 404);
      if (current.kind === "text") {
        const currentMode = resolveTextNodeMode(current);
        const requestedMode = payload.textMode === undefined
          ? currentMode
          : requireEnum(payload.textMode, TEXT_NODE_MODES, "payload.textMode");
        if (requestedMode !== currentMode) {
          throw new UnuTvError(
            "text_node_mode_immutable",
            "文本节点类型创建后不能切换，请新建对应类型的节点",
            409,
            { currentMode, requestedMode }
          );
        }
        patch.payload = { ...payload, textMode: currentMode };
      } else {
        patch.payload = payload;
      }
    }
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

  async function getProviderHealth(input = {}) {
    const providerId = requireText(input.providerId, "providerId");
    return ports.provider.checkHealth?.(providerId) ?? { configured: false, ok: false, state: "unsupported", message: "Provider health check is unavailable" };
  }

  async function getH3MotionContextCapabilities() {
    if (!ports.provider.inspectH3MotionContext) {
      throw new UnuTvError("h3_motion_context_inspection_unsupported", "H3 Motion Context inspection is unavailable", 409);
    }
    return ports.provider.inspectH3MotionContext();
  }

  async function installH3MotionContext(input = {}) {
    if (!ports.provider.installH3MotionContext) {
      throw new UnuTvError("h3_motion_context_install_unsupported", "H3 Motion Context installation is unavailable", 409);
    }
    return ports.provider.installH3MotionContext({
      sourcePath: requireText(input.sourcePath, "sourcePath"),
      expectedSourceHash: optionalText(input.expectedSourceHash, "")
    });
  }

  async function exportH3MotionContextWorkflows(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    if (!ports.provider.exportH3MotionContextWorkflows) {
      throw new UnuTvError("h3_motion_context_export_unsupported", "H3 Motion Context workflow export is unavailable", 409);
    }
    const initialRunId = requireText(input.initialRunId, "initialRunId");
    const continuationRunId = requireText(input.continuationRunId, "continuationRunId");
    const [initialRun, continuationRun] = await Promise.all([
      ports.projects.getRun(projectId, initialRunId),
      ports.projects.getRun(projectId, continuationRunId)
    ]);
    const graphFromRun = (run, phase) => {
      if (!run || run.status !== "succeeded") throw new UnuTvError("h3_motion_context_export_run_invalid", `A succeeded ${phase} run is required`, 409);
      if (run.result?.requestSummary?.h3MotionContext?.phase !== phase) {
        throw new UnuTvError("h3_motion_context_export_phase_mismatch", `Expected a ${phase} Motion Context run`, 409);
      }
      const taskId = run.result?.task?.taskId;
      const graph = run.result?.pollResponse?.[taskId]?.prompt?.[2];
      if (!graph || typeof graph !== "object" || Array.isArray(graph)) {
        throw new UnuTvError("h3_motion_context_export_graph_missing", `The ${phase} run has no persisted ComfyUI graph`, 409);
      }
      return graph;
    };
    const prefix = optionalText(input.prefix, "UnuTV-H3-MotionContext");
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(prefix)) {
      throw new UnuTvError("h3_motion_context_export_prefix_invalid", "Export prefix must use letters, digits, dots, underscores, or hyphens", 400);
    }
    const uiTemplate = requireObject(input.uiTemplate, "uiTemplate");
    if (!Array.isArray(uiTemplate.nodes) || !Array.isArray(uiTemplate.links)) {
      throw new UnuTvError("h3_motion_context_ui_template_invalid", "The ComfyUI UI template must contain nodes and links arrays", 400);
    }
    return ports.provider.exportH3MotionContextWorkflows({
      files: [
        { filename: `${prefix}-UI-Template.json`, kind: "ui", data: uiTemplate },
        { filename: `${prefix}-Initial-Executed.api.json`, kind: "api", data: graphFromRun(initialRun, "initial") },
        { filename: `${prefix}-Continue-Executed.api.json`, kind: "api", data: graphFromRun(continuationRun, "continue") }
      ]
    });
  }

  async function importH3ProviderConfig(input = {}) {
    const sourcePath = requireText(input.sourcePath, "sourcePath");
    if (!ports.credentials.importH3Config) throw new UnuTvError("h3_config_import_unsupported", "H3 config import is unavailable", 409);
    const settings = ports.credentials.importH3Config(sourcePath);
    const health = await ports.provider.checkHealth?.("minimax");
    return { settings, health };
  }
  // 模型目录来自网关,不写死在前端。网关加了模型,选择器立刻能看到。
  async function listProviderModels(input = {}) {
    const capability = ["text", "image", "video", "audio"].includes(input.capability) ? input.capability : "text";
    const result = await ports.provider.listModels?.() ?? { models: [], reason: "provider_not_configured" };
    return {
      capability,
      models: projectGatewayModels(result.models, capability),
      ...(result.reason ? { reason: result.reason } : {})
    };
  }

  async function updateProviderSettings(input = {}) {
    const settings = requireObject(input, "settings");
    const allowed = new Set(["ununuApiKey", "arkApiKey", "openrouterApiKey", "autodlApiToken", "arkTtsApiKey", "arkTtsVoiceId", "openspeechApiKey", "openspeechSpeakerId"]);
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
    if (node.kind === "image") {
      const ownPrompt = String(requested.prompt || prompt?.text || node.payload?.prompt || "").trim();
      const incomingPrompt = ownPrompt ? "" : await collectIncomingNodeText(projectId, node);
      if (ownPrompt || incomingPrompt) requested.prompt = ownPrompt || incomingPrompt;
    }
    const request = compileNodeGenerationRequest(node, requested);
    if (node.kind === "script" && !request.scriptSourceText) {
      request.scriptSourceText = await collectIncomingNodeText(projectId, node);
    }
    const provider = optionalText(input.provider, optionalText(prompt?.provider, optionalText(node.payload?.provider, node.kind === "audio" ? "openspeech" : node.kind === "text" || node.kind === "script" ? "ununu" : "openrouter")));
    if (isH3VideoRun(node, provider, request) && !Number.isSafeInteger(request.seed)) {
      request.seed = nextAutomaticH3Seed();
    }
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

  async function compileH3Prompt(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const nodeId = requireText(input.nodeId, "nodeId");
    const sourcePrompt = requireText(input.sourcePrompt, "sourcePrompt");
    const node = await ports.projects.getNode(projectId, nodeId);
    if (!node) throw new UnuTvError("node_not_found", `Node not found: ${nodeId}`, 404);
    if (!["video", "videoShot", "compose"].includes(node.kind)) {
      throw new UnuTvError("h3_video_node_required", "H3 Prompt compilation requires a video node", 400);
    }
    const request = {
      prompt: sourcePrompt,
      model: optionalText(input.modelId, "openai/gpt-5.6-sol"),
      modelId: optionalText(input.modelId, "openai/gpt-5.6-sol"),
      systemPrompt: h3PromptCompilerSystemPrompt({
        duration: input.duration,
        mode: input.mode,
        referenceCount: input.referenceCount
      }),
      temperature: 0.2,
      maxTokens: 2400
    };
    const run = { id: createId("h3-compile"), nodeId, provider: "ununu", request };
    const result = await ports.provider.run({
      projectId,
      node: { ...node, kind: "text", payload: {} },
      run,
      request
    });
    const compiledPrompt = String(result?.text || "").trim();
    if (!compiledPrompt) throw new UnuTvError("h3_prompt_compilation_empty", "H3 Prompt 编译没有返回提交稿", 502);
    return {
      compiledPrompt,
      sourcePrompt,
      compiler: `${H3_PROMPT_COMPILER_VERSION}:${request.modelId}`
    };
  }
  async function finishProviderResult(projectId, nodeId, runId, result) {
    const materialized = [];
    const targetNode = await ports.projects.getNode(projectId, nodeId);
    const preserveCurrentVideo = ["video", "videoShot", "compose", "video-clip"].includes(targetNode?.kind)
      && Boolean(targetNode?.payload?.currentMediaId);
    for (const artifact of result.artifacts ?? []) materialized.push(await ports.media.importBytes({
      projectId,
      nodeId,
      kind: artifact.kind,
      mimeType: artifact.mimeType,
      bytes: artifact.bytes,
      title: artifact.title,
      makeCurrent: !(artifact.kind === "video" && preserveCurrentVideo)
    }));
    // 文本生成的产物不是媒体二进制,直接写回节点正文,和手写落同一个字段
    if (typeof result.text === "string" && result.text.trim()) {
      await writeGeneratedNodeText(projectId, nodeId, result.text);
    }
    return ports.projects.finishRun(projectId, runId, result.status ?? "succeeded", { ...result, artifacts: materialized });
  }

  async function collectIncomingNodeText(projectId, node) {
    if (!node?.canvasId) return "";
    const canvas = await ports.projects.openCanvas(projectId, node.canvasId);
    if (!canvas) return "";
    const incoming = (canvas.edges || []).filter((edge) => edge.toNodeId === node.id);
    const texts = [];
    for (const edge of incoming) {
      const source = (canvas.nodes || []).find((item) => item.id === edge.fromNodeId);
      if (!source) continue;
      const text = source.payload?.textDocument?.plainText || source.payload?.plainText || source.payload?.text || source.payload?.content || "";
      if (!String(text).trim()) continue;
      texts.push(`【${source.title || "文本"}】\n${String(text).trim()}`);
    }
    return texts.join("\n\n");
  }

  async function writeGeneratedNodeText(projectId, nodeId, text) {
    const node = await ports.projects.getNode(projectId, nodeId);
    if (!node) return;
    const payload = node.payload || {};
    if (node.kind === "script") {
      const parsed = parseScriptModelOutput(text, nowIso());
      if (!parsed.ok) {
        throw new UnuTvError("script_rows_required", "分镜脚本模型没有返回可用镜头表", 502, { issue: parsed.issue });
      }
      const hasRows = parsed.document.rows.length > 0;
      await ports.projects.updateNode(projectId, nodeId, {
        ...(hasRows ? { width: Math.max(node.width || 0, 760), height: Math.max(node.height || 0, 360) } : {}),
        ...(node.title === "分镜脚本" || node.title === "script" ? { title: parsed.document.title } : {}),
        payload: {
          ...payload,
          text,
          scriptDocument: parsed.document,
          structuredRowCount: parsed.document.rows.length
        }
      });
      return;
    }
    await ports.projects.updateNode(projectId, nodeId, {
      payload: {
        ...payload,
        text,
        ...(payload.textDocument
          ? {
            textDocument: {
              ...payload.textDocument,
              plainText: text,
              html: text.split("\n").map((line) => `<p>${line}</p>`).join(""),
              updatedAt: nowIso()
            }
          }
          : {})
      }
    });
  }

  async function pollRun(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const runId = requireText(input.runId, "runId");
    const run = await ports.projects.getRun(projectId, runId);
    if (!run) throw new UnuTvError("run_not_found", `Run not found: ${runId}`, 404);
    const recoverablePollFailure = run.status === "failed" && run.result?.task?.taskId && ["provider_request_failed", "provider_poll_failed", "h3_remote_unavailable"].includes(run.result?.code);
    if (["succeeded", "failed", "blocked", "canceled"].includes(run.status) && !recoverablePollFailure) return run;
    if (run.status === "queued" && !run.result?.task?.taskId) return run;
    const node = await ports.projects.getNode(projectId, run.nodeId);
    if (!node) throw new UnuTvError("node_not_found", `Node not found: ${run.nodeId}`, 404);
    try {
      const result = await ports.provider.poll({ projectId, node, run });
      return finishProviderResult(projectId, node.id, run.id, result);
    } catch (error) {
      const retryable = Boolean(run.result?.task?.taskId) && ["provider_request_failed", "provider_poll_failed", "h3_remote_unavailable"].includes(error.code);
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
    addGroupMember, cancelRun, compileH3Prompt, connectEdge, createCanvas, createGroup, createNode, createProject, deleteGroup, deleteNode,
    disconnectEdge, exportH3MotionContextWorkflows, finishProviderResult, getDirectorStage, getH3MotionContextCapabilities, getPanorama, getProviderHealth, getProviderSettings, getWorkspace, getWorkflow,
    importH3ProviderConfig, initializeWorkspace, installH3MotionContext, listProjects, listProviderModels, listReviews, listRuns, openCanvas, openProject, pollRun, restoreNode, runNode,
    saveDirectorStage, setPanorama, setWorkspaceRoot, setWorkflowLayer, updateNode, updateProject, updateProviderSettings
  };
}
