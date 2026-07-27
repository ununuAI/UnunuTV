import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createLocalRuntime } from "@ununu/unutv-local-runtime";
import { NODE_KINDS } from "@ununu/unutv-contracts";

const sourceOrigin = process.env.UNUNU_WEB_API_ORIGIN || "http://127.0.0.1:3007";
const runtime = createLocalRuntime();

async function post(pathname, input = {}) {
  const response = await fetch(`${sourceOrigin}${pathname}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
  const envelope = await response.json();
  if (!response.ok || !envelope.ok) throw new Error(envelope.error?.message || `Legacy request failed: ${pathname}`);
  return envelope.data;
}

function mediaKind(mime = "") {
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "image";
}

function replacement(value, nodeMap, mediaMap, projectId) {
  if (Array.isArray(value)) return value.map((item) => replacement(item, nodeMap, mediaMap, projectId));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replacement(item, nodeMap, mediaMap, projectId)]));
  if (typeof value !== "string") return value;
  if (nodeMap.has(value)) return nodeMap.get(value);
  if (mediaMap.has(value)) return mediaMap.get(value);
  for (const [oldId, newId] of mediaMap) {
    if (value === `/media/${oldId}` || value.endsWith(`/media/${oldId}`)) return `/api/projects/${projectId}/media/${newId}`;
  }
  return value;
}

function referencedNodeId(mediaId, nodes) {
  for (const node of nodes) {
    if (JSON.stringify(node).includes(mediaId)) return node.id;
  }
  return undefined;
}

async function migrateProject(summary, index, total) {
  const markerRoot = path.join(runtime.dataRoot, "projects");
  if (existsSync(markerRoot)) {
    for (const directory of await (await import("node:fs/promises")).readdir(markerRoot).catch(() => [])) {
      const markerPath = path.join(markerRoot, directory, ".unutv", "legacy-source.json");
      if (!existsSync(markerPath)) continue;
      const marker = JSON.parse(await readFile(markerPath, "utf8"));
      if (marker.projectId === summary.id) {
        process.stdout.write(`[${index}/${total}] skip ${summary.title} (already imported)\n`);
        return;
      }
    }
  }

  process.stdout.write(`[${index}/${total}] open ${summary.title}\n`);
  const [{ project: legacy }, assetResult] = await Promise.all([
    post("/api/projects/open", { projectId: summary.id }),
    post("/api/assets/list", { projectId: summary.id, scope: "project" })
  ]);
  const created = await runtime.app.createProject({ title: legacy.title });
  const projectId = created.project.id;
  const canvasMap = new Map([[legacy.rootCanvasId, created.canvas.id]]);
  for (const sourceCanvas of legacy.canvases) {
    if (sourceCanvas.id === legacy.rootCanvasId) continue;
    const targetCanvas = await runtime.app.createCanvas({ projectId, title: sourceCanvas.label || "画布" });
    canvasMap.set(sourceCanvas.id, targetCanvas.id);
  }

  const nodeMap = new Map();
  const nodeRecords = [];
  for (const sourceCanvas of legacy.canvases) {
    for (const sourceNode of sourceCanvas.nodes) {
      const kind = NODE_KINDS.includes(sourceNode.kind) ? sourceNode.kind : "text";
      const payload = {
        ...(sourceNode.data || {}),
        prompt: sourceNode.prompt || sourceNode.data?.prompt || "",
        legacyStatus: sourceNode.status,
        refs: sourceNode.refs || [],
        mediaRefs: sourceNode.mediaRefs || [],
        legacyNodeId: sourceNode.id,
        legacyKind: sourceNode.kind
      };
      const target = await runtime.app.createNode({
        projectId,
        canvasId: canvasMap.get(sourceCanvas.id),
        kind,
        title: sourceNode.title || sourceNode.kind,
        x: sourceNode.position?.x || 0,
        y: sourceNode.position?.y || 0,
        size: sourceNode.size || undefined,
        payload
      });
      nodeMap.set(sourceNode.id, target.id);
      nodeRecords.push({ source: sourceNode, target });
    }
  }

  for (const sourceCanvas of legacy.canvases) {
    for (const edge of sourceCanvas.edges || []) {
      const fromNodeId = nodeMap.get(edge.from);
      const toNodeId = nodeMap.get(edge.to);
      if (fromNodeId && toNodeId) await runtime.app.connectEdge({ projectId, canvasId: canvasMap.get(sourceCanvas.id), fromNodeId, toNodeId, role: edge.kind || edge.label || "input" });
    }
  }

  const allSourceNodes = legacy.canvases.flatMap((canvas) => canvas.nodes);
  const mediaMap = new Map();
  const mediaIds = legacy.mediaIds || [];
  let mediaCursor = 0;
  const workers = Array.from({ length: Math.min(6, Math.max(1, mediaIds.length)) }, async () => {
    while (mediaCursor < mediaIds.length) {
      const oldMediaId = mediaIds[mediaCursor++];
      const response = await fetch(`${sourceOrigin}/media/${encodeURIComponent(oldMediaId)}`);
      if (!response.ok) continue;
      const mimeType = (response.headers.get("content-type") || "application/octet-stream").split(";", 1)[0];
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.length) continue;
      const owner = referencedNodeId(oldMediaId, allSourceNodes);
      const imported = await runtime.media.importBytes({ projectId, nodeId: owner ? nodeMap.get(owner) : null, kind: mediaKind(mimeType), mimeType, bytes, title: oldMediaId });
      mediaMap.set(oldMediaId, imported.id);
      if (mediaMap.size % 50 === 0) process.stdout.write(`  media ${mediaMap.size}/${mediaIds.length}\n`);
    }
  });
  await Promise.all(workers);

  for (const { source, target } of nodeRecords) {
    const current = runtime.projects.getNode(projectId, target.id);
    const migratedPayload = replacement({ ...current.payload, ...(source.data || {}), prompt: source.prompt || current.payload.prompt, refs: source.refs || [], mediaRefs: source.mediaRefs || [] }, nodeMap, mediaMap, projectId);
    await runtime.app.updateNode({ projectId, nodeId: target.id, payload: migratedPayload });
    if (target.kind === "director" && migratedPayload.directorStage) {
      await runtime.app.saveDirectorStage({ projectId, nodeId: target.id, stage: migratedPayload.directorStage });
    }
  }

  for (const sourceAsset of assetResult.assets || []) {
    const targetAsset = await runtime.app.createAsset({ projectId, role: sourceAsset.role, title: sourceAsset.name });
    for (const version of sourceAsset.versions || []) {
      const mediaId = mediaMap.get(version.mediaId);
      if (!mediaId) continue;
      await runtime.app.addAssetVersion({ projectId, assetId: targetAsset.id, mediaId, payload: replacement({ ...version, sourceAssetId: sourceAsset.id, prompt: sourceAsset.prompt, scope: sourceAsset.scope }, nodeMap, mediaMap, projectId) });
    }
  }

  const markerPath = path.join(runtime.dataRoot, "projects", projectId, ".unutv", "legacy-source.json");
  await writeFile(markerPath, `${JSON.stringify({ projectId: summary.id, sourceOrigin, importedAt: new Date().toISOString() }, null, 2)}\n`, "utf8");
  process.stdout.write(`  done ${nodeMap.size} nodes, ${mediaMap.size}/${mediaIds.length} media, ${(assetResult.assets || []).length} assets\n`);
}

async function importedProjectMap() {
  const result = new Map();
  const markerRoot = path.join(runtime.dataRoot, "projects");
  for (const directory of await (await import("node:fs/promises")).readdir(markerRoot).catch(() => [])) {
    const markerPath = path.join(markerRoot, directory, ".unutv", "legacy-source.json");
    if (!existsSync(markerPath)) continue;
    const marker = JSON.parse(await readFile(markerPath, "utf8"));
    if (marker.projectId) result.set(marker.projectId, directory);
  }
  return result;
}

async function migrateGlobalAssets(legacyProjectId) {
  const projectMap = await importedProjectMap();
  const ownerProjectId = projectMap.get(legacyProjectId) || projectMap.values().next().value;
  if (!ownerProjectId) return;
  const assetResult = await post("/api/assets/list", { projectId: legacyProjectId, scope: "global" });
  const existing = await runtime.app.listAssets({ projectId: ownerProjectId, scope: "global" });
  const existingSourceIds = new Set(existing.flatMap((asset) => asset.versions || []).map((version) => version.payload?.sourceAssetId).filter(Boolean));
  for (const sourceAsset of assetResult.assets || []) {
    if (existingSourceIds.has(sourceAsset.id)) continue;
    const targetAsset = await runtime.app.createAsset({ projectId: ownerProjectId, scope: "global", role: sourceAsset.role, title: sourceAsset.name });
    for (const version of sourceAsset.versions || []) {
      const response = await fetch(`${sourceOrigin}/media/${encodeURIComponent(version.mediaId)}`);
      if (!response.ok) continue;
      const mimeType = (response.headers.get("content-type") || version.mime || "application/octet-stream").split(";", 1)[0];
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.length) continue;
      const media = await runtime.media.importBytes({ projectId: ownerProjectId, nodeId: null, kind: mediaKind(mimeType), mimeType, bytes, title: sourceAsset.name });
      await runtime.app.addAssetVersion({
        projectId: ownerProjectId,
        assetId: targetAsset.id,
        mediaId: media.id,
        payload: { ...version, sourceAssetId: sourceAsset.id, prompt: sourceAsset.prompt, scope: "global" }
      });
    }
    process.stdout.write(`global asset ${sourceAsset.name}\n`);
  }
}

async function archiveGeneratedDemo() {
  const catalogPath = path.join(runtime.dataRoot, "catalog.sqlite");
  const catalog = new DatabaseSync(catalogPath);
  const demos = catalog.prepare("SELECT id, title, directory FROM projects WHERE title LIKE '视频项目 %'").all();
  for (const demo of demos) {
    const directory = path.join(runtime.dataRoot, demo.directory);
    const marker = path.join(directory, ".unutv", "legacy-source.json");
    if (existsSync(marker) || !existsSync(directory)) continue;
    const backupRoot = path.join(runtime.dataRoot, "backups");
    await mkdir(backupRoot, { recursive: true });
    const target = path.join(backupRoot, `${demo.id}-${Date.now()}`);
    await rename(directory, target);
    catalog.prepare("DELETE FROM projects WHERE id=?").run(demo.id);
    process.stdout.write(`archived generated demo ${demo.title} -> ${target}\n`);
  }
  catalog.close();
}

try {
  const { projects } = await post("/api/projects/list");
  for (let index = 0; index < projects.length; index += 1) await migrateProject(projects[index], index + 1, projects.length);
  if (projects[0]) await migrateGlobalAssets(projects[0].id);
  runtime.close();
  await archiveGeneratedDemo();
} catch (error) {
  runtime.close();
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
}
