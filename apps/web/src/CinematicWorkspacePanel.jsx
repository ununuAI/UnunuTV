"use client";
import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import { api } from "./api.js";
import { CinematicProductionWorkspace } from "./CinematicProductionWorkspace.tsx";

const STAGE_BY_KIND = Object.freeze({ storyboard: "anchors", shot: "shots", generationUnit: "units", qa: "review" });

export function CinematicWorkspacePanel({ embedded = false, floating = false, onFit, projectId, readOnly = false, selected, notify, onClose }) {
  const [production, setProduction] = useState(null);
  const [storyPacket, setStoryPacket] = useState(null);
  const [visualBible, setVisualBible] = useState(null);
  const [assetAuthorities, setAssetAuthorities] = useState([]);
  const [shots, setShots] = useState([]);
  const [units, setUnits] = useState([]);
  const [evaluations, setEvaluations] = useState([]);
  const [contributions, setContributions] = useState([]);
  const [compilation, setCompilation] = useState(null);
  const [rows, setRows] = useState([]);
  const [storyboards, setStoryboards] = useState([]);
  const [executionNodes, setExecutionNodes] = useState([]);
  const [sequencePrevis, setSequencePrevis] = useState([]);
  const [visualContextBundles, setVisualContextBundles] = useState([]);

  const load = useCallback(async () => {
    if (selected.canvasId) {
      const canvas = await api.canvas(projectId, selected.canvasId);
      setExecutionNodes((canvas.nodes || []).filter((node) => ["image", "imageEdit", "video", "videoShot", "video-clip"].includes(node.kind)).map((node) => ({ id: node.id, kind: node.kind, title: node.title })));
    } else setExecutionNodes([]);
    const productionResult = selected.payload?.productionId
      ? await api.cinematicProduction(projectId, selected.payload.productionId)
      : await api.cinematicProductions(projectId);
    const selectedProduction = selected.payload?.productionId
      ? productionResult.production || productionResult
      : productionResult.productions.find((item) => item.sourceNodeId === selected.id || item.sourceNodeId === selected.payload?.sourceNodeId) || (productionResult.productions.length === 1 ? productionResult.productions[0] : null);
    setProduction(selectedProduction);
    if (!selectedProduction) {
      setStoryPacket(null);
      setVisualBible(null);
      setAssetAuthorities([]);
      setShots([]);
      setUnits([]);
      setEvaluations([]);
      setContributions([]);
      setCompilation(null);
      setStoryboards([]);
      setSequencePrevis([]); setVisualContextBundles([]);
      return;
    }
    let scriptResult = { script: { rows: [] } };
    if (selectedProduction.sourceNodeId) {
      try { scriptResult = await api.script(projectId, selectedProduction.sourceNodeId); } catch { /* A text source is valid and has no ScriptV2 rows. */ }
    }
    setRows((scriptResult.script?.rows || []).map((row) => ({ ...row.payload, id: row.id, shotNumber: row.shotNumber })));
    const productionId = selectedProduction.productionId;
    const [storyResult, bibleResult, authorityResult, shotResult, unitResult, evaluationResult, contributionResult, storyboardResult, previsResult, contextResult] = await Promise.all([
      api.storyPacket(projectId, productionId),
      api.visualBible(projectId, productionId),
      api.assetAuthorities(projectId, productionId),
      api.cinematicShots(projectId, productionId),
      api.generationUnits(projectId, productionId),
      api.cinematicEvaluations(projectId, productionId),
      api.professionalContributions(projectId, productionId),
      api.storyboards(projectId, productionId), api.sequencePrevis(projectId, productionId), api.visualContextBundles(projectId, productionId)
    ]);
    setStoryPacket(storyResult.storyPacket || null);
    setVisualBible(bibleResult.visualBible || null);
    setAssetAuthorities(authorityResult.assetAuthorities || []);
    setShots(shotResult.shots || []);
    setUnits(unitResult.generationUnits || []);
    setEvaluations(evaluationResult.evaluations || []);
    setContributions(contributionResult.contributions || []);
    setStoryboards(storyboardResult.storyboards || []);
    setSequencePrevis(previsResult.sequencePrevis || []); setVisualContextBundles(contextResult.visualContextBundles || []);
  }, [projectId, selected.canvasId, selected.id, selected.payload?.productionId, selected.payload?.sourceNodeId]);

  useEffect(() => { load().catch(notify); }, [load, notify]);

  async function createProduction() {
    try {
      await api.createCinematicProduction(projectId, { title: selected.title, sourceNodeId: selected.payload?.sourceNodeId || selected.id, projectType: selected.payload?.projectType || "short_film", productionMode: "production" });
      await load();
      notify("影视制作合同已创建", false);
    } catch (error) { notify(error); }
  }

  if (!production) return <section className={embedded ? "cinematic-production-workspace is-canvas-node" : "expanded-node-workspace"}><header className={embedded ? "cp-workspace-header" : undefined}><div><span className="surface-eyebrow">UNUNUTV 影视总控</span><strong>{selected.title}</strong><small>通用影视工业制片合同</small></div><button className="nodrag nopan" onClick={onClose} title={floating ? "关闭影视总控" : embedded ? "收起为总览卡片" : "关闭工作区"} type="button"><X size={17} /></button></header><main className="cp-empty-production nodrag nopan nowheel"><div className="empty-panel"><p>这里还没有影视制作合同。创建后可依次完成剧作事实、视觉圣经、镜头、生成单元、提示词、生成和验收。</p><button disabled={readOnly} onClick={() => void createProduction()} type="button">创建影视制作</button></div></main></section>;

  const actions = {
    saveStoryPacket: async (value) => {
      await api.saveStoryPacket(projectId, production.productionId, value);
      await load();
      notify("剧作事实新版本已保存", false);
    },
    saveVisualBible: async (value) => {
      await api.saveVisualBible(projectId, production.productionId, value);
      await load();
      notify("视觉圣经新版本已保存", false);
    },
    saveAssetAuthority: async (value, authorityId) => {
      if (authorityId) await api.updateAssetAuthority(projectId, production.productionId, authorityId, value);
      else await api.createAssetAuthority(projectId, production.productionId, value);
      await load();
      notify("资产权威新版本已保存", false);
    },
    deriveAssetAuthorities: async () => {
      const result = await api.deriveAssetAuthorities(projectId, production.productionId, { persist: true });
      await load();
      notify(result.candidates.length ? `已从剧作事实派生 ${result.candidates.length} 条候选权威` : "没有新的可派生资产权威", false);
      return result;
    },
    batchTransitionAssetAuthorities: async (authorityIds, status) => {
      const expectedRevisions = Object.fromEntries(assetAuthorities.filter((authority) => authorityIds.includes(authority.authorityId)).map((authority) => [authority.authorityId, authority.revision]));
      const result = await api.batchTransitionAssetAuthorities(projectId, production.productionId, { authorityIds, status, expectedRevisions });
      await load();
      notify(`已将 ${result.authorities.length} 条资产权威更新为${status === "accepted" ? "已确认" : status === "rejected" ? "已拒绝" : "候选"}`, false);
      return result;
    },
    loadAssetAuthorityVersions: (authorityId) => api.assetAuthorityVersions(projectId, production.productionId, authorityId),
    loadAssetAuthorityImpact: (authorityId) => api.assetAuthorityImpact(projectId, production.productionId, authorityId),
    restoreAssetAuthorityVersion: async (authorityId, version, expectedRevision) => {
      const result = await api.restoreAssetAuthorityVersion(projectId, production.productionId, authorityId, { version, expectedRevision });
      await load();
      notify(`已将第 ${version} 版恢复为新的第 ${result.revision} 版`, false);
      return result;
    },
    routeAssetAuthorityRisk: async () => {
      const result = await api.routeAssetAuthorityRisk(projectId, production.productionId, { shotIds: shots.map((shot) => shot.shotId) });
      notify(result.requirements.length ? `建议建立 ${result.requirements.length} 类资产权威` : "当前没有必须建立的资产权威", false);
      return result;
    },
    compileAssetAuthority: (authorityId, input) => api.compileAssetAuthority(projectId, production.productionId, authorityId, input),
    compileStoryboardPrompt: (input) => api.compileStoryboardPrompt(projectId, production.productionId, input),
    createStoryboard: async () => {
      await api.createStoryboard(projectId, production.productionId, { nodeId: selected.id });
      await load();
      notify("正式故事板已建立", false);
    },
    reorderStoryboard: async (storyboardId, orderedStoryboardShotIds, expectedRevision) => {
      const result = await api.reorderStoryboard(projectId, production.productionId, storyboardId, { orderedStoryboardShotIds, expectedRevision });
      await load();
      notify("故事板顺序已保存", false);
      return result;
    },
    loadStoryboardBatchJobs: async (storyboardId) => (await api.storyboardBatchJobs(projectId, production.productionId, storyboardId)).jobs || [],
    createStoryboardBatchJob: async (storyboardId, kind, storyboardShotIds, input = {}) => {
      const result = await api.createStoryboardBatchJob(projectId, production.productionId, storyboardId, { kind, storyboardShotIds, ...input, billingMode: "provider_account" });
      notify(`${kind === "image" ? "故事板图" : "镜头视频"}批量任务已建立；预检通过后自动派发 Provider`, false);
      return result;
    },
    advanceStoryboardBatchJob: async (storyboardId, jobId) => {
      const result = await api.advanceStoryboardBatchJob(projectId, production.productionId, storyboardId, jobId);
      await load();
      return result;
    },
    cancelStoryboardBatchJob: (storyboardId, jobId) => api.cancelStoryboardBatchJob(projectId, production.productionId, storyboardId, jobId),
    retryStoryboardBatchItem: (storyboardId, jobId, itemId, input = {}) => api.retryStoryboardBatchItem(projectId, production.productionId, storyboardId, jobId, itemId, input),
    loadStoryboardShotVersions: async (storyboardId, storyboardShotId) => (await api.storyboardShotVersions(projectId, production.productionId, storyboardId, storyboardShotId)).versions || [],
    compareStoryboardShotVersions: (storyboardId, storyboardShotId, leftVersion, rightVersion) => api.compareStoryboardShotVersions(projectId, production.productionId, storyboardId, storyboardShotId, { leftVersion, rightVersion }),
    setStoryboardVideoReference: async (storyboardId, storyboardShotId, value) => {
      await api.setStoryboardVideoReference(projectId, production.productionId, storyboardId, storyboardShotId, { selected: value });
      await load();
      notify(value ? "该故事板图仅作为人物、场景与空间语义参考，不会自动成为首帧" : "该故事板图仅保留为故事板/规划证据", false);
    },
    importStoryboardToTimeline: async (storyboardId) => {
      const receipt = await api.importStoryboardToTimeline(projectId, production.productionId, storyboardId);
      window.dispatchEvent(new CustomEvent("unutv:open-timeline", { detail: { timelineId: receipt.timelineId } }));
      notify(`故事板已导入时间线：新增 ${receipt.added}，跳过 ${receipt.skipped}，失败 ${receipt.failed}`, receipt.failed > 0);
      return receipt;
    },
    saveShot: async (value, shotId) => {
      if (shotId) await api.updateCinematicShot(projectId, production.productionId, shotId, value);
      else await api.createCinematicShot(projectId, production.productionId, value);
      await load();
      notify("镜头设计新版本已保存", false);
    },
    saveGenerationUnit: async (value, unitId) => {
      const input = value.generationUnit ? value : { generationUnit: value, referenceBindings: value.referenceBindings || [] };
      if (unitId) await api.updateGenerationUnit(projectId, production.productionId, unitId, input);
      else await api.createGenerationUnit(projectId, production.productionId, input);
      await load();
      notify("生成单元新版本已保存", false);
    },
    compileGenerationUnit: async (unitId, input = {}) => {
      const next = await api.compileGenerationUnit(projectId, production.productionId, unitId, input);
      setCompilation(next);
      return next;
    },
    preflightGenerationUnit: async (unitId) => {
      const result = await api.preflightGenerationUnit(projectId, production.productionId, unitId);
      notify(result.ready ? "模型能力预检通过" : "预检存在阻断项", !result.ready);
      return result;
    },
    runGenerationUnit: async (unitId) => {
      const result = await api.runGenerationUnit(projectId, production.productionId, unitId);
      notify("正式生成状态：" + result.status, result.status === "blocked");
    },
    addEvaluation: async (value) => {
      await api.addCinematicEvaluation(projectId, production.productionId, value);
      await load();
      notify("全时间线验收记录已保存", false);
    },
    saveSequencePrevis: async (value, previsId) => {
      if (previsId) await api.updateSequencePrevis(projectId, production.productionId, previsId, { patch: value });
      else await api.saveSequencePrevis(projectId, production.productionId, { sequencePrevis: value });
      await load(); notify("连续视觉预演新版本已保存", false);
    },
    compileVisualContext: async (previsId, shotId) => {
      await api.compileVisualContext(projectId, production.productionId, previsId, { shotId });
      await load(); notify("当前镜头视觉上下文已冻结", false);
    },
    reviewSequencePrevis: async (previsId, revision, state) => {
      await api.reviewSequencePrevis(projectId, production.productionId, previsId, { revision, state, note: state === "accepted" ? "Owner 已完整播放并接受当前连续视觉预演与切镜决策" : "Owner 拒绝当前连续视觉预演" });
      await load(); notify(state === "accepted" ? "当前连续预演已获得 Owner ACCEPT" : "当前连续预演已拒绝", state === "rejected");
    }
  };

  return <CinematicProductionWorkspace actions={actions} assetAuthorities={assetAuthorities} compilation={compilation} contributions={contributions} embedded={embedded} evaluations={evaluations} executionNodes={executionNodes} floating={floating} initialStage={STAGE_BY_KIND[selected.kind] || "story"} onClose={onClose} onFit={onFit} production={production} projectId={projectId} readOnly={readOnly} scriptRows={rows} sequencePrevis={sequencePrevis} shots={shots} storyboards={storyboards} storyPacket={storyPacket} units={units} visualBible={visualBible} visualContextBundles={visualContextBundles} />;
}
