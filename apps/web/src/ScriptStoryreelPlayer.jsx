"use client";

import { X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api.js";
import {
  STORYREEL_STYLES,
  compileScriptStoryreel,
  compileStoryreelSheetPrompt,
  createGroupEdition,
  storyreelImageSize,
  rasterStoryreelReferences,
  layoutStoryreelCanvasGroup,
  mergeStoryreelGroupId,
  mergeStoryreelPanel,
  mergeStoryreelSheet,
  storyreelStyleState,
  setCurrentGroupEdition,
  storyreelGrid,
  storyreelOrphanNodes,
  storyreelPanelAt,
  storyreelPanelMedia,
  storyreelSheet,
  storyreelSheetCrop
} from "./script-storyreel-policy.js";
import { formatGenerationError } from "./generation-error-message.js";
import { generationRunPayload } from "./generation-run-payload.js";
import { DEFAULT_IMAGE_MODEL_ID, listWorkbenchModels } from "./prompt-workbench-api.ts";
import { assetsUsedByGroup, isScriptGroupNode } from "./script-group-policy.js";
import { sliceStoryreelSheet } from "./slice-storyreel-sheet.js";

const FEM = /female|woman|婷婷|美佳|tingting|meijia|sinji|samantha|karen|zira|xiaoxiao|xiaoyi/i;
const MAL = /male|man|yunyang|yunxi|kangkang|daniel|alex|fred|liang|哥哥|云/i;

function mediaUrl(projectId, mediaId, ownerProjectId) {
  if (!mediaId) return "";
  return `/api/projects/${ownerProjectId || projectId}/media/${mediaId}`;
}

function moveTransform(kind, q) {
  const e = q < 0.5 ? 2 * q * q : 1 - ((-2 * q + 2) ** 2) / 2;
  if (kind === "push_in") return `scale(${1 + 0.2 * e})`;
  if (kind === "pull_out") return `scale(${1.2 - 0.2 * e})`;
  if (kind === "follow" || kind === "truck") return `scale(1.12) translateX(${3.5 - 7 * e}%)`;
  if (kind === "pan") return `scale(1.1) translateX(${3 - 6 * e}%)`;
  if (kind === "boom") return `scale(1.12) translateY(${3.5 - 7 * e}%)`;
  return "";
}

function moveArrow(kind) {
  if (kind === "push_in") return '<path class="mv" d="M8 30 L20 42 M20 42 L20 34 M20 42 L12 42"/><path class="mv" d="M82 30 L70 42 M70 42 L70 34 M70 42 L78 42"/>';
  if (kind === "pull_out") return '<path class="mv" d="M20 42 L8 30 M8 30 L8 38 M8 30 L16 30"/><path class="mv" d="M70 42 L82 30 M82 30 L82 38 M82 30 L74 30"/>';
  if (kind === "follow" || kind === "truck") return '<path class="mv" d="M16 80 H70 M70 80 L60 72 M70 80 L60 88"/>';
  if (kind === "pan") return '<path class="mv" d="M16 80 Q45 68 74 80 M74 80 L64 73 M74 80 L65 88"/>';
  if (kind === "boom") return '<path class="mv" d="M45 122 V44 M45 44 L37 54 M45 44 L53 54"/>';
  return "";
}

function pickVoice(voices, lang, gender) {
  const pool = voices.filter((voice) => voice.lang && voice.lang.toLowerCase().startsWith(lang.slice(0, 2))) || voices;
  const list = pool.length ? pool : voices;
  if (gender === "female") return list.find((voice) => FEM.test(voice.name)) || null;
  if (gender === "male") return list.find((voice) => MAL.test(voice.name) && !FEM.test(voice.name)) || list.find((voice) => !FEM.test(voice.name)) || null;
  return null;
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function mediaIdFromRun(run) {
  const artifacts = run?.result?.artifacts || run?.artifacts || [];
  const image = artifacts.find((item) => item?.id && (item.kind === "image" || !item.kind));
  return image?.id || null;
}

export function ScriptStoryreelPlayer({ actions, anchor = null, assets = [], canvas = null, canvasId = "", nodes = [], onClose, owner, projectId, rows = [], title }) {
  const [saved, setSaved] = useState(owner?.payload?.scriptDocument?.storyreel || {});
  const [editionId, setEditionId] = useState(null);
  const sourceTexts = useMemo(
    () => (canvas?.nodes || nodes).filter((item) => item.kind === "text" || item.kind === "story").map((item) => item.payload?.textDocument?.plainText || item.payload?.text || ""),
    [canvas?.nodes, nodes]
  );
  const liveReel = useMemo(
    () => compileScriptStoryreel({ assets, document: owner?.payload?.scriptDocument, rows, storyreel: saved, texts: sourceTexts, title }),
    [assets, owner?.payload?.scriptDocument, rows, saved, sourceTexts, title]
  );
  const activeEditionId = editionId || liveReel.edition?.id || "v1";
  const reel = useMemo(
    () => compileScriptStoryreel({ assets, document: owner?.payload?.scriptDocument, editionId: activeEditionId, groupNumber: liveReel.groupNumber, rows, storyreel: saved, texts: sourceTexts, title }),
    [activeEditionId, assets, liveReel.groupNumber, owner?.payload?.scriptDocument, rows, saved, sourceTexts, title]
  );
  const inferredAspect = reel.aspectRatio === "16:9" ? "16:9" : "9:16";
  const [aspectOverride, setAspectOverride] = useState(null);
  const aspectRatio = aspectOverride || inferredAspect;
  const imageSize = storyreelImageSize(aspectRatio, reel.grid);
  const [styleId, setStyleId] = useState("彩绘");
  const [playing, setPlaying] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [timeSec, setTimeSec] = useState(0);
  const [busy, setBusy] = useState("");
  const [promptDrafts, setPromptDrafts] = useState({});
  const [models, setModels] = useState([]);
  const [modelId, setModelId] = useState(DEFAULT_IMAGE_MODEL_ID);
  const [providerId, setProviderId] = useState("ununu");
  const lastRef = useRef(0);
  const firedRef = useRef(new Set());
  const voicesRef = useRef([]);
  const pinnedRef = useRef(false);

  useEffect(() => {
    const load = () => {
      try { voicesRef.current = window.speechSynthesis?.getVoices?.() || []; } catch { voicesRef.current = []; }
    };
    load();
    window.speechSynthesis?.addEventListener?.("voiceschanged", load);
    return () => window.speechSynthesis?.removeEventListener?.("voiceschanged", load);
  }, []);

  useEffect(() => {
    if (!playing) return undefined;
    lastRef.current = performance.now();
    let frame = 0;
    const tick = (now) => {
      const delta = (now - lastRef.current) / 1000;
      lastRef.current = now;
      setTimeSec((current) => {
        const next = current + delta;
        if (next >= reel.totalSec) {
          setPlaying(false);
          return reel.totalSec;
        }
        return next;
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, reel.totalSec]);

  const panel = storyreelPanelAt(reel, timeSec);
  const progress = reel.totalSec ? Math.min(1, timeSec / reel.totalSec) : 0;
  const lineIndex = panel?.lines.findIndex((line) => timeSec >= line.t && timeSec <= line.t + line.d + 0.35) ?? -1;
  const spoken = lineIndex >= 0 ? panel.lines[lineIndex] : null;
  const q = panel && panel.end_s > panel.start_s ? (timeSec - panel.start_s) / (panel.end_s - panel.start_s) : 0;
  const promptFor = (item) => promptDrafts[`${activeEditionId}:${styleId}:${item.id}`] ?? item.cell_prompt ?? item.panel_prompt;
  const sheet = storyreelSheet(saved, reel.groupNumber, activeEditionId, styleId);
  const sheetUrl = mediaUrl(projectId, sheet?.mediaId, sheet?.ownerProjectId);
  const panelIndex = Math.max(0, reel.panels.findIndex((item) => item.id === panel?.id));
  const crop = sheet ? storyreelSheetCrop(panelIndex, sheet.cols || reel.grid.cols, sheet.rows || reel.grid.rows) : null;

  useEffect(() => {
    let active = true;
    void listWorkbenchModels("image").then((catalog) => {
      if (!active) return;
      const enabled = catalog.models.filter((item) => item.enabled);
      setModels(enabled);
      const preferred = enabled.find((item) => item.id === DEFAULT_IMAGE_MODEL_ID) || enabled[0];
      if (preferred) {
        setModelId(preferred.id);
        setProviderId(preferred.providerId);
      }
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (pinnedRef.current || !projectId || busy) return;
    const live = canvas?.nodes?.length ? canvas.nodes : nodes;
    const sheetNode = live.find((entry) => entry.id === storyreelSheet(saved, reel.groupNumber, activeEditionId, styleId)?.nodeId);
    if (!sheetNode) return;
    const panelNodes = reel.panels.map((item) => live.find((entry) => entry.id === storyreelPanelMedia(saved, reel.groupNumber, activeEditionId, styleId, item.id)?.nodeId) || null);
    if (panelNodes.some((item) => !item)) return;
    pinnedRef.current = true;
    void pinStoryreelSet({
      sheetNode,
      panelNodes,
      groupId: storyreelStyleState(saved, reel.groupNumber, activeEditionId, styleId)?.groupId
    }).then((groupId) => persist(mergeStoryreelGroupId(saved, reel.groupNumber, activeEditionId, styleId, groupId)))
      .then(() => actions.refresh?.())
      .catch(() => { pinnedRef.current = false; });
  }, [activeEditionId, canvas?.nodes, nodes, projectId, reel.groupNumber, reel.panels, saved, styleId]);

  useEffect(() => {
    if (!playing || !soundOn || !panel) return;
    for (const [index, line] of panel.lines.entries()) {
      const key = `${panel.id}:${index}:${line.t.toFixed(2)}`;
      if (firedRef.current.has(key) || timeSec < line.t) continue;
      firedRef.current.add(key);
      try {
        const utterance = new SpeechSynthesisUtterance(line.text);
        utterance.lang = /[A-Za-z]/.test(line.text) && !/[\u4e00-\u9fff]/.test(line.text) ? "en-US" : "zh-CN";
        const voice = pickVoice(voicesRef.current, utterance.lang, line.gender);
        if (voice) utterance.voice = voice;
        utterance.rate = Math.max(0.6, Math.min(1.9, (line.text.length / 3.6) / Math.max(0.25, line.d)));
        utterance.pitch = Math.max(0.5, Math.min(1.6, line.pitch || 1));
        window.speechSynthesis.speak(utterance);
      } catch {
        // 浏览器未授权语音时保持画面可播
      }
    }
  }, [playing, soundOn, panel, timeSec]);

  function hush() {
    try { window.speechSynthesis?.cancel?.(); } catch { /* ignore */ }
  }

  function seek(next) {
    setPlaying(false);
    hush();
    firedRef.current = new Set();
    setTimeSec(Math.max(0, Math.min(reel.totalSec, next)));
  }

  async function persistDocument(patch) {
    if (!owner || !actions?.updatePayload) return;
    const document = owner.payload?.scriptDocument || { version: "script_document_v1", title, rows };
    await actions.updatePayload(owner, { scriptDocument: { ...document, aspectRatio, storyreel: saved, ...patch } });
  }

  async function persist(nextSaved) {
    setSaved(nextSaved);
    await persistDocument({ storyreel: nextSaved });
  }

  async function setAspect(next) {
    const nextAspect = next === "16:9" ? "16:9" : "9:16";
    setAspectOverride(nextAspect);
    await persistDocument({ aspectRatio: nextAspect });
  }

  function currentLayout() {
    return layoutStoryreelCanvasGroup({
      anchor: anchor || owner,
      aspectRatio,
      editionIndex: Math.max(0, reel.editions.findIndex((item) => item.id === activeEditionId)),
      grid: reel.grid,
      groupSlot: isScriptGroupNode(anchor) ? 1 : reel.groupNumber,
      panelCount: reel.panels.length,
      styleIndex: Math.max(0, STORYREEL_STYLES.findIndex((item) => item.id === styleId))
    });
  }

  async function pinStoryreelSet({ sheetNode, panelNodes = [], groupId = "" }) {
    const layout = currentLayout();
    const resolvedCanvasId = canvasId || canvas?.id || owner?.canvasId || nodes[0]?.canvasId;
    if (sheetNode) {
      await api.updateNode(projectId, sheetNode.id, { x: layout.sheet.x, y: layout.sheet.y, width: layout.sheet.width, height: layout.sheet.height });
    }
    for (const [index, panelNode] of panelNodes.entries()) {
      const box = layout.panels[index];
      if (!panelNode || !box) continue;
      await api.updateNode(projectId, panelNode.id, { x: box.x, y: box.y, width: box.width, height: box.height });
    }
    if (groupId) {
      try { await api.deleteGroup(projectId, groupId); } catch { /* 旧分组可能已被删 */ }
    }
    const group = await api.createGroup(projectId, {
      canvasId: resolvedCanvasId,
      title: `预演 · 生成组${reel.groupNumber} · ${styleId} · ${reel.edition?.label || "版本1"}`,
      x: layout.group.x,
      y: layout.group.y,
      width: layout.group.width,
      height: layout.group.height
    });
    if (sheetNode) await api.addGroupMember(projectId, group.id, sheetNode.id);
    for (const panelNode of panelNodes) {
      if (panelNode) await api.addGroupMember(projectId, group.id, panelNode.id);
    }
    return group.id;
  }

  async function generateStyle() {
    if (!owner || busy) return;
    const resolvedCanvasId = canvasId || canvas?.id || owner.canvasId || nodes[0]?.canvasId;
    const grid = storyreelGrid(reel.panels.length);
    const sheetPrompt = compileStoryreelSheetPrompt(reel.panels, styleId, Object.fromEntries(reel.panels.map((item) => [item.id, promptFor(item)])), aspectRatio);
    const frozenPrompts = Object.fromEntries(reel.panels.map((item) => [item.id, promptFor(item)]));
    setBusy(`正在生成整板${styleId}…`);
    try {
      if (!projectId || !resolvedCanvasId) throw new Error("找不到当前画布，无法生成分镜图");
      const liveNodes = canvas?.nodes?.length ? canvas.nodes : nodes;
      const { referenceMediaIds, referenceNodeIds: refs } = rasterStoryreelReferences(assetsUsedByGroup(rows, assets), liveNodes);
      const layout = currentLayout();
      const existingSheetId = storyreelSheet(saved, reel.groupNumber, activeEditionId, styleId)?.nodeId;
      let sheetNode = existingSheetId ? liveNodes.find((entry) => entry.id === existingSheetId) : null;
      if (!sheetNode) {
        sheetNode = await api.createNode(projectId, resolvedCanvasId, {
          kind: "image",
          title: `预演·${styleId}·整板`,
          x: layout.sheet.x,
          y: layout.sheet.y,
          size: { width: layout.sheet.width, height: layout.sheet.height },
          payload: {
            prompt: sheetPrompt,
            imageNodeType: "standard",
            storyreelSheet: true,
            reviewOnly: true,
            styleId,
            groupNumber: reel.groupNumber,
            editionId: activeEditionId
          }
        });
      } else {
        await api.updateNode(projectId, sheetNode.id, { x: layout.sheet.x, y: layout.sheet.y, width: layout.sheet.width, height: layout.sheet.height });
      }
      await api.saveNodePrompt(projectId, sheetNode.id, {
        text: sheetPrompt,
        provider: providerId,
        modelId,
        parameters: { size: imageSize, quality: "high", n: 1, outputFormat: "png", background: "opaque" },
        referenceNodeIds: refs,
        referenceMediaIds
      });
      const payload = generationRunPayload(sheetNode, {
        text: sheetPrompt,
        modelId,
        provider: providerId,
        parameters: { size: imageSize, quality: "high", n: 1, outputFormat: "png", background: "opaque" },
        referenceNodeIds: refs,
        referenceMediaIds
      }, canvas?.edges || [], liveNodes);
      let run = await api.runNode(projectId, sheetNode.id, payload);
      if (run?.status === "queued" || run?.status === "running") {
        setBusy("整板正在出图，请稍候…");
        for (let attempt = 0; attempt < 60; attempt += 1) {
          await sleep(2000);
          run = await api.pollRun(projectId, run.id);
          if (run?.status && run.status !== "queued" && run.status !== "running") break;
        }
      }
      if (run?.status === "blocked" || run?.status === "failed") {
        throw new Error(formatGenerationError(run, sheetNode));
      }
      let sheetMediaId = mediaIdFromRun(run);
      let latestSheet = null;
      for (let attempt = 0; attempt < 8 && !sheetMediaId; attempt += 1) {
        const afterSheet = await api.canvas(projectId, resolvedCanvasId);
        latestSheet = afterSheet.nodes.find((entry) => entry.id === sheetNode.id);
        sheetMediaId = latestSheet?.payload?.currentMediaId || sheetMediaId;
        if (sheetMediaId) break;
        await sleep(800);
      }
      if (!sheetMediaId) {
        throw new Error(run?.status === "running" || run?.status === "queued"
          ? "整板还在生成，请稍后再点一次生成分镜图"
          : (run?.result?.message || "整板分镜图没有写回节点，请看画布上的预演整板节点"));
      }
      const ownerProjectId = latestSheet?.payload?.mediaOwnerProjectId || projectId;
      let nextSaved = mergeStoryreelSheet(saved, reel.groupNumber, activeEditionId, styleId, {
        nodeId: sheetNode.id,
        mediaId: sheetMediaId,
        ownerProjectId,
        cols: grid.cols,
        rows: grid.rows,
        modelId,
        providerId
      }, frozenPrompts);
      setSaved(nextSaved);

      setBusy("正在把整板切成各镜单图…");
      const cuts = await sliceStoryreelSheet(mediaUrl(projectId, sheetMediaId, ownerProjectId), reel.panels.length, grid.cols, grid.rows);
      const afterSlice = await api.canvas(projectId, resolvedCanvasId);
      const liveAfter = afterSlice.nodes || liveNodes;
      const panelNodes = [];
      for (const [index, item] of reel.panels.entries()) {
        const box = layout.panels[index];
        const existingPanelId = storyreelPanelMedia(nextSaved, reel.groupNumber, activeEditionId, styleId, item.id)?.nodeId;
        let cutNode = existingPanelId ? liveAfter.find((entry) => entry.id === existingPanelId) : null;
        if (!cutNode) {
          cutNode = await api.createNode(projectId, resolvedCanvasId, {
            kind: "image",
            title: `预演·${styleId}·${item.label}`,
            x: box.x,
            y: box.y,
            size: { width: box.width, height: box.height },
            payload: {
              prompt: promptFor(item),
              imageNodeType: "standard",
              storyreelPanel: true,
              reviewOnly: true,
              styleId,
              groupNumber: reel.groupNumber,
              editionId: activeEditionId,
              shotId: item.id,
              slicedFrom: sheetNode.id
            }
          });
        } else {
          await api.updateNode(projectId, cutNode.id, { x: box.x, y: box.y, width: box.width, height: box.height });
        }
        const media = await api.importDataMedia(projectId, {
          dataUrl: cuts[index],
          kind: "image",
          nodeId: cutNode.id,
          title: `${item.label}.png`
        });
        nextSaved = mergeStoryreelPanel(nextSaved, reel.groupNumber, activeEditionId, styleId, item.id, {
          nodeId: cutNode.id,
          mediaId: media.id,
          ownerProjectId: media.ownerProjectId || projectId
        }, frozenPrompts);
        panelNodes.push(cutNode);
        setSaved(nextSaved);
      }
      const latestCanvas = await api.canvas(projectId, resolvedCanvasId);
      for (const orphan of storyreelOrphanNodes(latestCanvas.nodes, nextSaved)) {
        await api.deleteNode(projectId, orphan.id);
      }
      const nextGroupId = await pinStoryreelSet({
        sheetNode,
        panelNodes,
        groupId: storyreelStyleState(nextSaved, reel.groupNumber, activeEditionId, styleId)?.groupId
      });
      nextSaved = mergeStoryreelGroupId(nextSaved, reel.groupNumber, activeEditionId, styleId, nextGroupId);
      await persist(nextSaved);
      await actions.refresh?.();
      actions.notify?.(`${styleId}整板已生成并按组分好`, false);
    } catch (error) {
      actions.notify?.(error);
    } finally {
      setBusy("");
    }
  }

  if (!reel.shotCount) {
    return (
      <div className="script-storyreel-layer">
        <section className="script-storyreel" role="dialog" aria-label="导演预演">
          <header className="script-storyreel-head"><strong>导演预演</strong><button aria-label="关闭预演" className="script-asset-icon-btn" onClick={onClose} type="button"><X size={14} /></button></header>
          <p className="script-storyreel-empty">这一组还没有镜头，无法预演。</p>
        </section>
      </div>
    );
  }

  return (
    <div className="script-storyreel-layer">
      <section className={`script-storyreel is-page is-${aspectRatio === "16:9" ? "landscape" : "portrait"}`} role="dialog" aria-label="导演预演">
        <header className="script-storyreel-head">
          <div>
            <strong>{reel.title}</strong>
            <small>生成组 {reel.groupNumber} · {reel.shotCount} 镜 · {reel.totalSec.toFixed(1)}s · {aspectRatio === "16:9" ? "16:9 横屏" : "9:16 竖屏"} · 线稿分镜，非最终画面</small>
          </div>
          <button aria-label="关闭预演" className="script-asset-icon-btn" onClick={() => { hush(); onClose(); }} type="button"><X size={14} /></button>
        </header>

        <div className="script-storyreel-page">
          <div className="script-storyreel-col">
            <div className={`script-storyreel-frame is-${aspectRatio === "16:9" ? "landscape" : "portrait"}`} data-aspect={aspectRatio}>
              {sheetUrl
                ? <div className="script-storyreel-cell" style={{ backgroundImage: `url("${sheetUrl}")`, ...crop, transform: moveTransform(panel?.craft.move_kind, Math.max(0, Math.min(1, q))) }} />
                : <div className="script-storyreel-blank">{busy || `还没有${styleId}整板`}</div>}
              <svg aria-hidden="true" className="script-storyreel-arrow" viewBox={aspectRatio === "16:9" ? "0 0 160 90" : "0 0 90 160"} dangerouslySetInnerHTML={{ __html: moveArrow(panel?.craft.move_kind) }} />
              <div className="script-storyreel-slate"><span>{panel?.label} · {aspectRatio}</span><span>{timeSec.toFixed(1)}s</span></div>
              <div className="script-storyreel-sub">{spoken ? <><b>{spoken.speaker}</b>{spoken.text}</> : null}</div>
            </div>

            <div className="script-storyreel-bar" onClick={(event) => {
              const box = event.currentTarget.getBoundingClientRect();
              seek(((event.clientX - box.left) / box.width) * reel.totalSec);
            }}>
              <i style={{ width: `${progress * 100}%` }} />
              {reel.panels.map((item) => <u key={item.id} style={{ left: `${(item.start_s / reel.totalSec) * 100}%` }} />)}
            </div>

            <div className="script-storyreel-ctl">
              <button className="is-primary" onClick={() => {
                if (playing) { setPlaying(false); hush(); return; }
                if (timeSec >= reel.totalSec) setTimeSec(0);
                setPlaying(true);
              }} type="button">{playing ? "暂停" : "播放"}</button>
              <button onClick={() => { seek(0); setPlaying(true); }} type="button">重放</button>
              <button aria-pressed={soundOn} onClick={() => { setSoundOn((value) => !value); if (soundOn) hush(); }} type="button">{soundOn ? "声音 开" : "声音 关"}</button>
            </div>

            <div className="script-storyreel-vers">
              <span>版本</span>
              {reel.editions.map((edition) => (
                <button
                  aria-pressed={edition.id === activeEditionId}
                  key={edition.id}
                  onClick={() => {
                    const keep = timeSec;
                    setPlaying(false);
                    hush();
                    setEditionId(edition.id);
                    void persist(setCurrentGroupEdition(saved, reel.groupNumber, edition.id));
                    setTimeSec(keep);
                  }}
                  type="button"
                >
                  {edition.label}
                </button>
              ))}
              <button
                disabled={Boolean(busy)}
                onClick={() => {
                  const next = createGroupEdition(saved, reel.groupNumber, liveReel.panels);
                  const created = next.groups[String(reel.groupNumber)].editions.at(-1);
                  setEditionId(created.id);
                  void persist(next);
                }}
                type="button"
              >
                新建版本
              </button>
            </div>
            <div className="script-storyreel-vers">
              <span>画幅</span>
              <button aria-pressed={aspectRatio === "9:16"} onClick={() => void setAspect("9:16")} type="button">9:16 竖屏</button>
              <button aria-pressed={aspectRatio === "16:9"} onClick={() => void setAspect("16:9")} type="button">16:9 横屏</button>
            </div>
            <div className="script-storyreel-vers">
              <span>画风</span>
              {STORYREEL_STYLES.map((style) => (
                <button aria-pressed={style.id === styleId} key={style.id} onClick={() => setStyleId(style.id)} type="button">{style.id}</button>
              ))}
            </div>
          </div>

          <aside className="script-storyreel-now">
            <header className="script-storyreel-now-head">
              <span className="k">{reel.edition?.label || "版本1"} · {styleId} · {reel.grid.cols}×{reel.grid.rows} 整板</span>
              <label className="script-storyreel-model">
                <span>模型</span>
                <select
                  onChange={(event) => {
                    const [nextProvider, nextModel] = event.target.value.split("::");
                    setProviderId(nextProvider);
                    setModelId(nextModel);
                  }}
                  value={`${providerId}::${modelId}`}
                >
                  {(models.length ? models : [{ id: DEFAULT_IMAGE_MODEL_ID, label: "GPT Image 2", providerId: "ununu" }]).map((model) => (
                    <option key={`${model.providerId}-${model.id}`} value={`${model.providerId}::${model.id}`}>{model.label}</option>
                  ))}
                </select>
              </label>
              <button className="is-primary" disabled={Boolean(busy) || !owner} onClick={() => void generateStyle()} type="button">{busy || "生成分镜图"}</button>
            </header>
            <div className="script-storyreel-prompts">
              {reel.panels.map((item) => (
                <article className={item.id === panel?.id ? "is-current" : ""} key={item.id}>
                  <button className="script-storyreel-prompt-label" onClick={() => seek(item.start_s)} type="button">
                    {item.label}　{item.start_s.toFixed(1)}–{item.end_s.toFixed(1)}s
                  </button>
                  <textarea
                    aria-label={`${item.label} 生图提示词`}
                    onChange={(event) => setPromptDrafts((current) => ({ ...current, [`${activeEditionId}:${styleId}:${item.id}`]: event.target.value }))}
                    value={promptFor(item)}
                  />
                </article>
              ))}
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}
