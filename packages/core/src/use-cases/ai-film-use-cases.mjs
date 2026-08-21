import {
  UnuTvError,
  requireNumber,
  requireObject,
  requireText,
  screenplayContentChecksum
} from "@ununu/unutv-contracts";

const VISIBLE_AI_FILM_KINDS = new Set(["script", "director", "image", "video"]);
const AI_FILM_ROLES = new Set(["screenplay", "storyboard"]);

function roleOf(node) {
  return node?.payload?.aiFilmRole ?? node?.payload?.scriptRole ?? null;
}

function normalizedProjectTitle(value) {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("zh-CN");
}

const SCENE_ID_PATTERN = /^SC\d{2,}$/;

function requireScene(raw, index) {
  const scene = requireObject(raw, `scenes[${index}]`);
  const sceneId = requireText(scene.sceneId, `scenes[${index}].sceneId`).toUpperCase();
  if (!SCENE_ID_PATTERN.test(sceneId)) {
    throw new UnuTvError("ai_film_scene_id_invalid", "场次标识必须形如 SC01", 400, { sceneId });
  }
  const sceneNumber = requireNumber(scene.sceneNumber, `scenes[${index}].sceneNumber`, index + 1);
  if (!Number.isInteger(sceneNumber) || sceneNumber < 1) {
    throw new UnuTvError("ai_film_scene_number_invalid", "场次序号必须是正整数", 400, { sceneId, sceneNumber });
  }
  return {
    ...scene,
    sceneId,
    sceneNumber,
    slugline: requireText(scene.slugline, `scenes[${index}].slugline`),
    locationAssetRefs: Array.isArray(scene.locationAssetRefs) ? scene.locationAssetRefs : [],
    characterRefs: Array.isArray(scene.characterRefs) ? scene.characterRefs : [],
    sceneObjective: requireText(scene.sceneObjective, `scenes[${index}].sceneObjective`),
    entryRelationship: requireText(scene.entryRelationship, `scenes[${index}].entryRelationship`),
    pressure: requireText(scene.pressure, `scenes[${index}].pressure`),
    turn: requireText(scene.turn, `scenes[${index}].turn`),
    exitChange: requireText(scene.exitChange, `scenes[${index}].exitChange`)
  };
}

function requireExpectedRevision(value, actual, field, code) {
  if (value === undefined || value === null) {
    throw new UnuTvError(code, `更新已有作品前必须提供 ${field}`, 409, { currentRevision: actual });
  }
  const expected = requireNumber(value, field);
  if (expected !== actual) {
    throw new UnuTvError(code, `${field} 冲突：预期 ${expected}，当前 ${actual}`, 409, {
      currentRevision: actual,
      expectedRevision: expected
    });
  }
  return expected;
}

function visibleNode(node) {
  return {
    id: node.id,
    kind: node.kind,
    title: node.title,
    revision: node.revision,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    payload: node.payload
  };
}

function requireShot(raw, index, { sceneIds, strictSceneContract = false } = {}) {
  const shot = requireObject(raw, `shots[${index}]`);
  const shotId = requireText(shot.shotId, `shots[${index}].shotId`);
  const shotNumber = requireNumber(shot.shotNumber, `shots[${index}].shotNumber`, index + 1);
  if (!Number.isInteger(shotNumber) || shotNumber < 1) {
    throw new UnuTvError("ai_film_storyboard_shot_number_invalid", "分镜镜号必须是正整数", 400, { shotId, shotNumber });
  }
  const sceneId = strictSceneContract
    ? requireText(shot.sceneId, `shots[${index}].sceneId`).toUpperCase()
    : typeof shot.sceneId === "string" && shot.sceneId.trim() ? shot.sceneId.trim().toUpperCase() : "SC01";
  if (!SCENE_ID_PATTERN.test(sceneId) || (sceneIds && !sceneIds.has(sceneId))) {
    throw new UnuTvError("ai_film_storyboard_scene_reference_invalid", "分镜必须引用存在的场次", 400, { shotId, sceneId });
  }
  const sceneShotNumber = strictSceneContract
    ? requireNumber(shot.sceneShotNumber, `shots[${index}].sceneShotNumber`)
    : requireNumber(shot.sceneShotNumber, `shots[${index}].sceneShotNumber`, shotNumber);
  if (!Number.isInteger(sceneShotNumber) || sceneShotNumber < 1) {
    throw new UnuTvError("ai_film_storyboard_scene_shot_number_invalid", "场内镜号必须是正整数", 400, { shotId, sceneId, sceneShotNumber });
  }
  if (strictSceneContract) {
    const expectedShotId = `${sceneId}-SH${String(sceneShotNumber).padStart(2, "0")}`;
    if (shotId !== expectedShotId) {
      throw new UnuTvError("ai_film_storyboard_shot_id_scene_mismatch", `镜头标识应为 ${expectedShotId}`, 400, { shotId, expectedShotId });
    }
  }
  return {
    ...shot,
    shotId,
    shotNumber,
    sceneId,
    sceneShotNumber,
    dramaticBeat: typeof shot.dramaticBeat === "string" && shot.dramaticBeat.trim() ? shot.dramaticBeat.trim() : "推进",
    dialogue: Array.isArray(shot.dialogue) ? shot.dialogue : [],
    assetRefs: Array.isArray(shot.assetRefs) ? shot.assetRefs : [],
    professional: requireObject(shot.professional, `shots[${index}].professional`, {})
  };
}

function findRoleNode(canvas, requestedNodeId, role) {
  if (requestedNodeId) {
    const node = canvas.nodes.find((candidate) => candidate.id === requestedNodeId);
    if (!node) throw new UnuTvError("ai_film_work_node_not_found", `画布作品不存在：${requestedNodeId}`, 404);
    if (node.kind !== "script" || roleOf(node) !== role) {
      throw new UnuTvError("ai_film_work_role_mismatch", `节点不是 ${role} 作品`, 409, { nodeId: requestedNodeId });
    }
    return node;
  }
  const matches = canvas.nodes.filter((node) => node.kind === "script" && roleOf(node) === role);
  if (matches.length > 1) {
    throw new UnuTvError("ai_film_duplicate_visible_work", `画布存在多个 ${role} 作品，请明确 nodeId`, 409, {
      nodeIds: matches.map((node) => node.id)
    });
  }
  return matches[0] ?? null;
}

function requireTransaction(runProjectTransaction) {
  if (typeof runProjectTransaction !== "function") {
    throw new UnuTvError("ai_film_transaction_required", "影视作品写入需要项目事务支持", 500);
  }
  return runProjectTransaction;
}

export function createAiFilmUseCases(dependencies = {}) {
  const {
    listProjects,
    createProject,
    openProject,
    openCanvas,
    createNode,
    updateNode,
    connectEdge,
    getScriptDocument,
    saveScreenplayDocument,
    createScriptRow,
    updateScriptRow,
    deleteScriptRow,
    listAssets,
    listCinematicProductions,
    listTimelines,
    getDirectorStage,
    runProjectTransaction
  } = dependencies;
  const projectResolutionLocks = new Map();

  async function resolveAiFilmProject(input = {}) {
    if (typeof input.projectId === "string" && input.projectId.trim()) {
      const project = await openProject({ projectId: input.projectId.trim() });
      const canvas = await openCanvas({ projectId: project.id, canvasId: project.rootCanvasId });
      return { created: false, project, canvas };
    }

    const title = requireText(input.title, "title");
    const key = normalizedProjectTitle(title);
    const resolveByTitle = async () => {
      const { projects } = await listProjects();
      const matches = projects.filter((project) => normalizedProjectTitle(project.title) === key);
      if (matches.length > 1) {
        throw new UnuTvError(
          "ai_film_project_ambiguous",
          `发现多个同名项目“${title}”，请改用 projectId 指定`,
          409,
          { projectIds: matches.map((project) => project.id) }
        );
      }
      if (matches.length === 1) {
        const project = await openProject({ projectId: matches[0].id });
        const canvas = await openCanvas({ projectId: project.id, canvasId: project.rootCanvasId });
        return { created: false, project, canvas };
      }
      if (input.createIfMissing === false) {
        throw new UnuTvError("ai_film_project_not_found", `项目不存在：${title}`, 404);
      }
      const created = await createProject({ title: title.trim() });
      const project = await openProject({ projectId: created.project.id });
      return { created: true, project, canvas: created.canvas };
    };

    const pending = projectResolutionLocks.get(key);
    if (pending) return pending;
    const task = resolveByTitle();
    projectResolutionLocks.set(key, task);
    try {
      return await task;
    } finally {
      if (projectResolutionLocks.get(key) === task) projectResolutionLocks.delete(key);
    }
  }

  async function getAiFilmContext(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const project = await openProject({ projectId });
    const canvas = await openCanvas({ projectId, canvasId: project.rootCanvasId });
    const visible = canvas.nodes.filter((node) => VISIBLE_AI_FILM_KINDS.has(node.kind));
    const scriptNodes = visible.filter((node) => node.kind === "script" && AI_FILM_ROLES.has(roleOf(node)));
    const scriptDocuments = await Promise.all(scriptNodes.map(async (node) => ({
      node: visibleNode(node),
      role: roleOf(node),
      document: await getScriptDocument({ projectId, nodeId: node.id })
    })));
    const directorStages = await Promise.all(
      visible.filter((node) => node.kind === "director").map(async (node) => ({
        node: visibleNode(node),
        assetWorkbench: await getDirectorStage({ projectId, nodeId: node.id })
      }))
    );
    const [assets, productions, timelines] = await Promise.all([
      listAssets({ projectId, scope: "project" }),
      listCinematicProductions({ projectId }),
      listTimelines({ projectId })
    ]);
    const storyboardScript = scriptDocuments.find((entry) => entry.role === "storyboard") ?? null;
    const scenes = Array.isArray(storyboardScript?.node?.payload?.scenes)
      ? storyboardScript.node.payload.scenes
      : storyboardScript
        ? [{ sceneId: "SC01", sceneNumber: 1, slugline: "未结构化场次", locationAssetRefs: [], characterRefs: [], legacyInferred: true }]
        : [];
    return {
      project: {
        id: project.id,
        title: project.title,
        rootCanvasId: project.rootCanvasId,
        updatedAt: project.updatedAt
      },
      canvas: {
        id: canvas.id,
        revision: canvas.revision,
        edges: canvas.edges,
        screenplay: scriptDocuments.find((entry) => entry.role === "screenplay") ?? null,
        storyboardScript,
        scenes,
        assetWorkbenches: directorStages,
        images: visible.filter((node) => node.kind === "image").map(visibleNode),
        videos: visible.filter((node) => node.kind === "video").map(visibleNode)
      },
      assets,
      productions,
      timelines
    };
  }

  async function putAiFilmScreenplay(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const content = requireText(input.content, "content");
    const title = typeof input.title === "string" && input.title.trim() ? input.title.trim() : "正式剧本";
    return requireTransaction(runProjectTransaction)({
      projectId,
      operation: "ai_film_put_screenplay",
      work: async () => {
        const project = await openProject({ projectId });
        const canvas = await openCanvas({ projectId, canvasId: project.rootCanvasId });
        let node = findRoleNode(canvas, input.nodeId, "screenplay");
        if (!node) {
          if (input.expectedNodeRevision !== undefined && input.expectedNodeRevision !== null && Number(input.expectedNodeRevision) !== 0) {
            throw new UnuTvError("ai_film_screenplay_revision_conflict", "新建剧本的 expectedNodeRevision 必须为 0 或省略", 409);
          }
          node = await createNode({
            projectId,
            canvasId: project.rootCanvasId,
            kind: "script",
            title,
            x: input.x,
            y: input.y,
            payload: { aiFilmRole: "screenplay", scriptRole: "screenplay", workStatus: "draft" }
          });
        } else {
          const expectedNodeRevision = requireExpectedRevision(
            input.expectedNodeRevision,
            node.revision,
            "expectedNodeRevision",
            "ai_film_screenplay_node_revision_conflict"
          );
          node = await updateNode({
            projectId,
            nodeId: node.id,
            expectedRevision: expectedNodeRevision,
            title,
            payload: { ...node.payload, aiFilmRole: "screenplay", scriptRole: "screenplay", workStatus: "draft" }
          });
        }
        const current = await getScriptDocument({ projectId, nodeId: node.id });
        const expectedDocumentRevision = current.screenplayRevision === 0 && input.expectedDocumentRevision == null
          ? 0
          : requireExpectedRevision(
              input.expectedDocumentRevision,
              current.screenplayRevision,
              "expectedDocumentRevision",
              "ai_film_screenplay_document_revision_conflict"
            );
        const document = await saveScreenplayDocument({
          projectId,
          nodeId: node.id,
          document: {
            format: "ScreenplayDocumentInputV1",
            content,
            checksum: screenplayContentChecksum(content),
            expectedRevision: expectedDocumentRevision
          }
        });
        return { node, document };
      }
    });
  }

  async function putAiFilmStoryboardScript(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const rawShots = Array.isArray(input.shots) ? input.shots : [];
    if (!rawShots.length) throw new UnuTvError("ai_film_storyboard_shots_required", "分镜脚本至少需要一个镜头", 400);
    if (!Array.isArray(input.scenes) || input.scenes.length === 0) {
      throw new UnuTvError("ai_film_storyboard_scenes_required", "新写或修改分镜时必须提交结构化场次；旧分镜只能读取，修改时需补齐", 400);
    }
    const strictSceneContract = true;
    const scenes = input.scenes.map(requireScene);
    const sceneIds = new Set();
    const sceneNumbers = new Set();
    for (const scene of scenes) {
      if (sceneIds.has(scene.sceneId)) {
        throw new UnuTvError("ai_film_scene_duplicate", `场次标识重复：${scene.sceneId}`, 400);
      }
      if (sceneNumbers.has(scene.sceneNumber)) {
        throw new UnuTvError("ai_film_scene_number_duplicate", `场次序号重复：${scene.sceneNumber}`, 400);
      }
      sceneIds.add(scene.sceneId);
      sceneNumbers.add(scene.sceneNumber);
    }
    if (strictSceneContract && scenes.some((scene, index) => scene.sceneNumber !== index + 1)) {
      throw new UnuTvError("ai_film_scene_sequence_invalid", "场次序号必须按请求顺序从 1 连续递增", 400);
    }
    const shots = rawShots.map((shot, index) => requireShot(shot, index, { sceneIds, strictSceneContract }));
    const sceneShotNumbers = new Map();
    for (const shot of shots) {
      const numbers = sceneShotNumbers.get(shot.sceneId) ?? [];
      numbers.push(shot.sceneShotNumber);
      sceneShotNumbers.set(shot.sceneId, numbers);
    }
    for (const [sceneId, numbers] of sceneShotNumbers) {
      const expected = numbers.map((_, index) => index + 1);
      if (numbers.some((value, index) => value !== expected[index])) {
        throw new UnuTvError("ai_film_storyboard_scene_shot_sequence_invalid", "场内镜号必须按镜序从 1 连续递增", 400, { sceneId, numbers });
      }
    }
    const seen = new Set();
    for (const shot of shots) {
      if (seen.has(shot.shotId)) {
        throw new UnuTvError("ai_film_storyboard_shot_duplicate", `分镜标识重复：${shot.shotId}`, 400);
      }
      seen.add(shot.shotId);
    }
    const title = typeof input.title === "string" && input.title.trim() ? input.title.trim() : "分镜脚本";
    return requireTransaction(runProjectTransaction)({
      projectId,
      operation: "ai_film_put_storyboard_script",
      work: async () => {
        const project = await openProject({ projectId });
        let canvas = await openCanvas({ projectId, canvasId: project.rootCanvasId });
        let sourceNode = null;
        if (input.sourceScreenplayNodeId) {
          sourceNode = findRoleNode(canvas, input.sourceScreenplayNodeId, "screenplay");
        }
        let node = findRoleNode(canvas, input.nodeId, "storyboard");
        const sourceScreenplayNodeId = sourceNode?.id ?? null;
        if (!node) {
          if (input.expectedNodeRevision !== undefined && input.expectedNodeRevision !== null && Number(input.expectedNodeRevision) !== 0) {
            throw new UnuTvError("ai_film_storyboard_revision_conflict", "新建分镜脚本的 expectedNodeRevision 必须为 0 或省略", 409);
          }
          node = await createNode({
            projectId,
            canvasId: project.rootCanvasId,
            kind: "script",
            title,
            x: input.x,
            y: input.y,
            payload: {
              aiFilmRole: "storyboard",
              scriptRole: "storyboard",
              sourceScreenplayNodeId,
              sceneCount: scenes.length,
              scenes,
              shotCount: shots.length,
              storyboardStructure: "scene_shot_v1",
              workStatus: "draft"
            }
          });
        } else {
          const expectedNodeRevision = requireExpectedRevision(
            input.expectedNodeRevision,
            node.revision,
            "expectedNodeRevision",
            "ai_film_storyboard_node_revision_conflict"
          );
          node = await updateNode({
            projectId,
            nodeId: node.id,
            expectedRevision: expectedNodeRevision,
            title,
            payload: {
              ...node.payload,
              aiFilmRole: "storyboard",
              scriptRole: "storyboard",
              sourceScreenplayNodeId,
              sceneCount: scenes.length,
              scenes,
              shotCount: shots.length,
              storyboardStructure: "scene_shot_v1",
              workStatus: "draft"
            }
          });
        }

        const document = await getScriptDocument({ projectId, nodeId: node.id });
        const existingByShotId = new Map(
          document.rows
            .filter((row) => typeof row.payload?.shotId === "string")
            .map((row) => [row.payload.shotId, row])
        );
        const keptRowIds = new Set();
        for (let index = 0; index < shots.length; index += 1) {
          const shot = shots[index];
          const existing = existingByShotId.get(shot.shotId);
          if (existing) {
            keptRowIds.add(existing.id);
            await updateScriptRow({
              projectId,
              nodeId: node.id,
              rowId: existing.id,
              orderIndex: index,
              shotNumber: shot.shotNumber,
              payload: shot,
              replacePayload: true
            });
          } else {
            const created = await createScriptRow({
              projectId,
              nodeId: node.id,
              orderIndex: index,
              shotNumber: shot.shotNumber,
              payload: shot
            });
            keptRowIds.add(created.id);
          }
        }
        for (const row of document.rows) {
          if (!keptRowIds.has(row.id)) await deleteScriptRow({ projectId, nodeId: node.id, rowId: row.id });
        }

        canvas = await openCanvas({ projectId, canvasId: project.rootCanvasId });
        if (sourceNode && !canvas.edges.some((edge) => edge.fromNodeId === sourceNode.id && edge.toNodeId === node.id && edge.role === "screenplay_source")) {
          await connectEdge({
            projectId,
            canvasId: project.rootCanvasId,
            fromNodeId: sourceNode.id,
            toNodeId: node.id,
            role: "screenplay_source"
          });
        }
        return {
          node,
          document: await getScriptDocument({ projectId, nodeId: node.id })
        };
      }
    });
  }

  return { getAiFilmContext, putAiFilmScreenplay, putAiFilmStoryboardScript, resolveAiFilmProject };
}
