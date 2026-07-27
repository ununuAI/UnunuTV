"use client";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, Ban, Check, ChevronRight, Code2, Film, GitCompare, ImagePlus, Images, ListPlus, Minimize2, Play, Plus, RotateCcw, ShieldCheck, Video, X } from "lucide-react";
import type {
  CinematicEvaluation,
  CinematicAssetAuthority,
  CinematicProduction,
  CinematicShotSpec,
  GenerationUnitRecord,
  ImagePromptCompilation,
  ProfessionalContribution,
  PromptCompilation,
  StoryboardDocumentV2,
  StoryProductionPacket,
  VisualBible
} from "./cinematic-production-types";
import { buildCinematicStages, projectTypeLabel, type CinematicStageId } from "./cinematic-production-view-model";
import { CinematicAssetAuthorityLibrary } from "./CinematicAssetAuthorityLibrary.jsx";
import { CinematicContractForm, CinematicContractSummary } from "./CinematicContractForm";
import { cinematicFieldLabel } from "./cinematic-form-policy.js";
import { CinematicSequencePrevisWorkspace } from "./CinematicSequencePrevisWorkspace";
import type { SequencePrevisDocument, VisualContextBundle } from "./cinematic-sequence-workspace-types";

interface WorkspaceActions {
  saveStoryPacket(value: StoryProductionPacket): Promise<void>;
  saveVisualBible(value: VisualBible): Promise<void>;
  saveAssetAuthority(value: Record<string, unknown>, authorityId?: string): Promise<void>;
  deriveAssetAuthorities(): Promise<Record<string, unknown>>;
  batchTransitionAssetAuthorities(authorityIds: string[], status: string): Promise<Record<string, unknown>>;
  loadAssetAuthorityVersions(authorityId: string): Promise<Record<string, unknown>>;
  loadAssetAuthorityImpact(authorityId: string): Promise<Record<string, unknown>>;
  restoreAssetAuthorityVersion(authorityId: string, version: number, expectedRevision: number): Promise<Record<string, unknown>>;
  routeAssetAuthorityRisk(): Promise<Record<string, unknown>>;
  compileAssetAuthority(authorityId: string, input: Record<string, unknown>): Promise<ImagePromptCompilation>;
  compileStoryboardPrompt(input: Record<string, unknown>): Promise<ImagePromptCompilation>;
  createStoryboard(): Promise<void>;
  reorderStoryboard(storyboardId: string, orderedStoryboardShotIds: string[], expectedRevision: number): Promise<Record<string, unknown>>;
  loadStoryboardBatchJobs(storyboardId: string): Promise<Array<Record<string, any>>>;
  createStoryboardBatchJob(storyboardId: string, kind: "image" | "video", storyboardShotIds: string[], input?: Record<string, unknown>): Promise<Record<string, any>>;
  advanceStoryboardBatchJob(storyboardId: string, jobId: string): Promise<Record<string, any>>;
  cancelStoryboardBatchJob(storyboardId: string, jobId: string): Promise<Record<string, any>>;
  retryStoryboardBatchItem(storyboardId: string, jobId: string, itemId: string, input?: Record<string, unknown>): Promise<Record<string, any>>;
  loadStoryboardShotVersions(storyboardId: string, storyboardShotId: string): Promise<Array<Record<string, any>>>;
  compareStoryboardShotVersions(storyboardId: string, storyboardShotId: string, leftVersion: number, rightVersion: number): Promise<Record<string, any>>;
  importStoryboardToTimeline(storyboardId: string): Promise<StoryboardTimelineImportReceipt>;
  setStoryboardVideoReference(storyboardId: string, storyboardShotId: string, selected: boolean): Promise<void>;
  saveShot(value: Record<string, unknown>, shotId?: string): Promise<void>;
  saveGenerationUnit(value: Record<string, unknown>, unitId?: string): Promise<void>;
  compileGenerationUnit(unitId: string, input?: Record<string, unknown>): Promise<PromptCompilation>;
  preflightGenerationUnit(unitId: string): Promise<Record<string, unknown>>;
  runGenerationUnit(unitId: string): Promise<void>;
  addEvaluation(value: Record<string, unknown>): Promise<void>;
  saveSequencePrevis(value: SequencePrevisDocument, previsId?: string): Promise<void>;
  compileVisualContext(previsId: string, shotId: string): Promise<void>;
  reviewSequencePrevis(previsId: string, revision: number, state: "accepted" | "rejected"): Promise<void>;
}

interface StoryboardTimelineImportReceipt {
  timelineId: string;
  total: number;
  processed: number;
  added: number;
  skipped: number;
  failed: number;
  status: string;
}

interface WorkspaceProps {
  production: CinematicProduction;
  storyPacket: StoryProductionPacket | null;
  visualBible: VisualBible | null;
  assetAuthorities: CinematicAssetAuthority[];
  shots: CinematicShotSpec[];
  units: GenerationUnitRecord[];
  evaluations: CinematicEvaluation[];
  contributions: ProfessionalContribution[];
  scriptRows: Array<Record<string, unknown>>;
  compilation: PromptCompilation | null;
  projectId: string;
  readOnly?: boolean;
  storyboards: StoryboardDocumentV2[];
  sequencePrevis: SequencePrevisDocument[];
  visualContextBundles: VisualContextBundle[];
  executionNodes: Array<{ id: string; kind: string; title: string }>;
  actions: WorkspaceActions;
  embedded?: boolean;
  floating?: boolean;
  initialStage?: CinematicStageId;
  onFit?(): void;
  onClose(): void;
}

const STORY_STARTER: StoryProductionPacket = {
  sourceFacts: [], lockedStoryFacts: [], scenePurpose: "", characters: [], causalEventChain: [], dialogue: [],
  emotionalArc: { start: "", change: "", end: "" }, entranceState: {}, exitState: {}, mustNotAppearYet: [], userLockedText: []
};

const BIBLE_STARTER: VisualBible = {
  cinematography: { grammar: "", lensPreference: "" }, lighting: { source: "", direction: "", softness: "", colorTemperature: "", contrast: "", negativeFill: "", exposureProtection: "" },
  color: { primary: "", secondary: "", accent: "", saturation: "", contrast: "", separation: "" }, productionDesign: {}, characterLook: {},
  performance: { baseline: "" }, sound: { world: "", musicPrinciple: "" }, vfx: {}, continuityLocks: [],
  visualMotifs: [], colorArc: {}, spatialDramaturgy: {}, propSemantics: {}, costumeNarrative: {}, materialAging: {}, culturalResearchRefs: [], styleProhibitions: []
};

const IMAGE_PARAMETERS = { provider: "ununu", model: "openai/gpt-image-2", aspectRatio: "16:9", resolution: "2048x1152", count: 1, referenceMediaIds: [] };

function authorityStarter(authorityType = "character") {
  return {
    authorityType, displayName: "", riskLevel: "medium", status: "draft", identityDescription: "", identityLocks: [], wardrobeMakeupHair: {},
    viewSpecs: [{ viewId: "front", label: "正面身份视图", framing: "半身", angle: "正面平视", description: "中性站姿和自然表情", background: "不干扰身份判断的中性背景", controls: ["人物身份"], doesNotControl: ["最终镜头场景和动作"], required: true }],
    referenceAssetIds: [], acceptanceCriteria: [], prohibitedChanges: []
  };
}

function shotStarter(order: number) {
  return {
    order, narrativeJob: "", storyBeat: "", cutReason: "", openingState: "", trigger: "", actionChain: [""], reactionTurn: "", endingState: "",
    blocking: { positions: "", paths: "", gaze: "", hands: "", props: "", contactSurface: "" },
    cinematography: { shotSize: "", cameraPosition: "", angle: "", perspective: "", composition: "", depthOfField: "", focus: "", movementPath: "", speedCurve: "", startPoint: "", stopPoint: "", narrativePurpose: "" },
    lighting: { source: "", direction: "", softness: "", colorTemperature: "", contrast: "", negativeFill: "", exposureProtection: "" },
    color: { primary: "", secondary: "", accent: "", saturation: "", contrast: "", separation: "", continuity: "" },
    performance: { objective: "", subtext: "", breathing: "", pause: "", eyeLine: "", brows: "", mouthCorner: "", jaw: "", shoulders: "", hands: "", centerOfGravity: "", microExpressionOrder: "" },
    sound: { dialogueDelivery: "", ambience: "", foley: "", distance: "", reverb: "", breathing: "", silence: "", bridge: "", music: "" },
    physicsVfx: { force: "", body: "", cloth: "", hair: "", contact: "", environment: "" }, editContinuity: { entrance: "", exit: "", axis: "", screenDirection: "" },
    dialogue: [], requiredAssetIds: [], mustNotAppearYet: [], acceptanceCriteria: [""]
  };
}

function unitStarter(shots: CinematicShotSpec[]) {
  return {
    strategy: "single_shot", narrativeTask: "", shotLinks: shots[0] ? [{ shotId: shots[0].shotId, order: 1 }] : [], visualAnchorPolicy: "NONE",
    requiredCapabilities: [], generationParameters: { provider: "ark", model: "doubao-seedance-2-0-mini-260615", mode: "text_to_video", duration: 8, aspectRatio: "16:9", resolution: "1080p", count: 1, generateAudio: true, referenceMediaIds: [], providerOptions: {} },
    controlIntent: {
      primaryConsistency: "balanced", cameraFreedom: "limited", motionComplexity: "medium", modeRationale: "",
      invariants: [""], permittedChanges: [],
      dynamicControl: { source: "text_motion_contract", subjectTrajectories: "", actionPhases: "", timing: "", cameraTrajectory: "", physicsContinuity: "", endState: "" }
    },
    continuityBoundary: {}, highRiskNegatives: [], referenceBindings: []
  };
}

function evaluationStarter() {
  return {
    runId: "", mediaId: "", checksum: "", duration: 1, frameRate: 24, hasAudio: false, planActualDiff: {},
    scores: { identity: 0, space: 0, cinematography: 0, lighting: 0, color: 0, performance: 0, physics: 0, sound: 0, edit: 0, continuity: 0 },
    internalCuts: [], usableRanges: [], actualExitState: "", authoritativeRanges: [], decision: "REJECT", failureResponsibilityLayer: "unreviewed",
    repairSuggestions: [], knowledgeFeedbackCandidates: []
  };
}

function SummaryGrid({ items }: { items: Array<[string, unknown]> }) {
  const friendlyValue = (value: unknown) => {
    if (Array.isArray(value)) return value.length ? `${value.length} 项` : "无";
    if (value && typeof value === "object") return `${Object.keys(value).length} 个设置`;
    if (typeof value === "boolean") return value ? "是" : "否";
    return String(value ?? "—");
  };
  return <dl className="cp-summary-grid">{items.map(([label, value]) => <div key={label}><dt>{cinematicFieldLabel(label)}</dt><dd>{friendlyValue(value)}</dd></div>)}</dl>;
}

function PromptDisclosure({ label, note, value }: { label: string; note?: string; value: string }) {
  return <details className="cp-technical-details"><summary><span><strong>{label}</strong>{note ? <small>{note}</small> : null}</span><ChevronRight size={15} /></summary><pre>{value}</pre></details>;
}

function IssueGroups({ groups }: { groups: Array<[string, unknown[]]> }) {
  const active = groups.filter(([, items]) => items?.length);
  if (!active.length) return null;
  return <section className="cp-issues"><header><strong>阻断与降级</strong><small>只显示需要处理的事项</small></header><div className="cp-issue-list">{active.map(([label, items]) => <article key={label}><b>{label}</b><ul>{items.map((item, index) => <li key={index}>{typeof item === "string" ? item : String((item as Record<string, unknown>)?.message ?? (item as Record<string, unknown>)?.code ?? "需要检查")}</li>)}</ul></article>)}</div></section>;
}

function authorityMeta(authority: CinematicAssetAuthority) {
  const type = authority.authorityType === "scene" ? "场景" : authority.authorityType === "prop" ? "道具" : "人物";
  const risk = ({ low: "低风险", medium: "中风险", high: "高风险", critical: "关键风险" } as Record<string, string>)[authority.riskLevel] || "待评估";
  const status = ({ draft: "草稿", candidate: "候选", accepted: "已确认", rejected: "已拒绝" } as Record<string, string>)[authority.status] || "待处理";
  return `${type} · ${risk} · ${status}`;
}

function StoryStage({ actions, scriptRows, storyPacket }: Pick<WorkspaceProps, "actions" | "scriptRows" | "storyPacket">) {
  return <div className="cp-split-stage">
    <section className="cp-source-panel"><header><strong>原始剧本事实</strong><small>生成提示词不能吞掉或替换这里的信息</small></header>
      {scriptRows.length ? scriptRows.map((row, index) => <article key={String(row.id ?? index)}><b>条目 {String(row.shotNumber ?? index + 1)}</b><p>{String(row.sceneDescription ?? row.text ?? row.dialogue ?? "未填写")}</p>{row.dialogue && <blockquote>{String(row.dialogue)}</blockquote>}</article>) : <p className="cp-empty">当前脚本节点没有结构化行。</p>}
    </section>
    <CinematicContractForm label="剧作事实与连续性" note="来源事实、因果、人物目标、完整对白、情绪变化与禁提前信息" value={(storyPacket ?? STORY_STARTER) as Record<string, unknown>} onSave={(value) => actions.saveStoryPacket(value as StoryProductionPacket)} />
  </div>;
}

function BibleStage({ actions, visualBible }: Pick<WorkspaceProps, "actions" | "visualBible">) {
  return <CinematicContractForm label="项目视觉圣经" note="具体项目选择留在这里；通用方法才进入知识库" value={(visualBible ?? BIBLE_STARTER) as Record<string, unknown>} onSave={(value) => actions.saveVisualBible(value as VisualBible)} />;
}

function AuthorityStage({ actions, assetAuthorities, production, readOnly, storyPacket, visualBible }: Pick<WorkspaceProps, "actions" | "assetAuthorities" | "production" | "readOnly" | "storyPacket" | "visualBible">) {
  const [selectedId, setSelectedId] = useState(assetAuthorities[0]?.authorityId ?? "new");
  const [authorityType, setAuthorityType] = useState("character");
  const [compilation, setCompilation] = useState<ImagePromptCompilation | null>(null);
  const [risk, setRisk] = useState<Record<string, unknown> | null>(null);
  const selected = assetAuthorities.find((authority) => authority.authorityId === selectedId);
  useEffect(() => { if (selectedId !== "new" && !selected) setSelectedId(assetAuthorities[0]?.authorityId ?? "new"); }, [assetAuthorities, selected, selectedId]);
  function createAuthority(type: string) { setAuthorityType(type); setSelectedId("new"); setCompilation(null); }
  async function compile() {
    if (!selected) return;
    setCompilation(await actions.compileAssetAuthority(selected.authorityId, { generationParameters: IMAGE_PARAMETERS, referenceBindings: [] }));
  }
  return <div className="cp-authority-stage"><CinematicAssetAuthorityLibrary assetAuthorities={assetAuthorities} onBatchTransition={actions.batchTransitionAssetAuthorities} onCreateAuthority={createAuthority} onDerive={actions.deriveAssetAuthorities} onLoadImpact={actions.loadAssetAuthorityImpact} onLoadVersions={actions.loadAssetAuthorityVersions} onRestoreVersion={actions.restoreAssetAuthorityVersion} onSelectAuthority={setSelectedId} production={production} readOnly={readOnly} storyPacket={storyPacket} visualBible={visualBible} /><div className="cp-library-stage cp-authority-editor"><aside><header><strong>权威合同编辑器</strong><button disabled={readOnly} onClick={() => createAuthority("character")} type="button"><Plus size={14} /></button></header>
    <button onClick={() => void actions.routeAssetAuthorityRisk().then(setRisk)} type="button"><span>运行风险路由</span><small>只在身份、空间或道具风险需要时建立</small></button>
    {assetAuthorities.map((authority) => <button className={selectedId === authority.authorityId ? "is-active" : ""} key={authority.authorityId} onClick={() => setSelectedId(authority.authorityId)} type="button"><span>{authority.displayName || "未命名资产"}</span><small>{authorityMeta(authority)}</small></button>)}
    {risk && <CinematicContractSummary label="风险路由建议" note="按身份、空间和关键道具风险给出建档建议" value={risk} />}</aside><div>
      <CinematicContractForm key={`${selectedId}-${authorityType}`} label={selected ? `${selected.displayName || "未命名"} · 资产权威` : `新建${authorityType === "scene" ? "场景" : authorityType === "prop" ? "道具" : "人物"}资产权威`} note="锁定身份、空间或关键道具的可验收事实；保存不会自动确认。" value={(selected ?? authorityStarter(authorityType)) as Record<string, unknown>} onSave={(value) => actions.saveAssetAuthority(value, selected?.authorityId)} />
      {selected && <section className="cp-compile-toolbar"><button onClick={() => void compile()} type="button"><Code2 size={14} />编译图片提示词</button></section>}
      {compilation && <PromptDisclosure label="查看编译后的图片提示词" note={`${compilation.envelope.lint.bytes} 字节 · 已完成一致性校验`} value={compilation.envelope.compiledContentPrompt} />}
    </div></div></div>;
}

function ShotStage({ actions, shots }: Pick<WorkspaceProps, "actions" | "shots">) {
  const [selectedId, setSelectedId] = useState(shots[0]?.shotId ?? "new");
  useEffect(() => { if (selectedId !== "new" && !shots.some((shot) => shot.shotId === selectedId)) setSelectedId(shots[0]?.shotId ?? "new"); }, [selectedId, shots]);
  const selected = shots.find((shot) => shot.shotId === selectedId);
  return <div className="cp-library-stage"><aside><header><strong>艺术镜头</strong><button onClick={() => setSelectedId("new")} type="button"><Plus size={14} /></button></header>{shots.map((shot) => <button className={selectedId === shot.shotId ? "is-active" : ""} key={shot.shotId} onClick={() => setSelectedId(shot.shotId)} type="button"><span>镜头 {shot.order}</span><small>{shot.narrativeJob || "未填写叙事任务"}</small></button>)}</aside>
    <CinematicContractForm key={selectedId} label={selected ? `镜头 ${selected.order}` : "新建艺术镜头"} note="这里定义叙事、表演和摄影，不等同于模型生成分段" value={(selected ?? shotStarter(shots.length + 1)) as Record<string, unknown>} onSave={(value) => actions.saveShot(value, selected?.shotId)} />
  </div>;
}

function UnitStage({ actions, shots, units }: Pick<WorkspaceProps, "actions" | "shots" | "units">) {
  const [selectedId, setSelectedId] = useState(units[0]?.generationUnit.generationUnitId ?? "new");
  const selected = units.find((record) => record.generationUnit.generationUnitId === selectedId);
  const value = selected ? { generationUnit: selected.generationUnit, referenceBindings: selected.referenceBindings } : unitStarter(shots);
  return <div className="cp-library-stage"><aside><header><strong>生成单元</strong><button onClick={() => setSelectedId("new")} type="button"><Plus size={14} /></button></header>{units.map((record) => <button className={selectedId === record.generationUnit.generationUnitId ? "is-active" : ""} key={record.generationUnit.generationUnitId} onClick={() => setSelectedId(record.generationUnit.generationUnitId)} type="button"><span>{record.generationUnit.strategy}</span><small>{record.generationUnit.shotLinks.length} 个艺术镜头 · {record.generationUnit.visualAnchorPolicy}</small></button>)}</aside>
    <CinematicContractForm key={selectedId} label={selected ? "生成单元与参考图职责" : "新建生成单元"} note="一次模型请求可以包含多个艺术镜头；技术参数与内容信息分别管理" value={value as Record<string, unknown>} onSave={(draft) => actions.saveGenerationUnit(draft, selected?.generationUnit.generationUnitId)} />
  </div>;
}

function AnchorStage({ actions, executionNodes, projectId, readOnly = false, shots, storyboards, units }: Pick<WorkspaceProps, "actions" | "executionNodes" | "projectId" | "readOnly" | "shots" | "storyboards" | "units">) {
  const storyboard = storyboards[0];
  const [importing, setImporting] = useState(false);
  const [importReceipt, setImportReceipt] = useState<StoryboardTimelineImportReceipt | null>(null);
  const [selectedShotIds, setSelectedShotIds] = useState<string[]>([]);
  const [batchJobs, setBatchJobs] = useState<Array<Record<string, any>>>([]);
  const [batchBusy, setBatchBusy] = useState(false);
  const [versionAudit, setVersionAudit] = useState<Record<string, any> | null>(null);
  const videoReadyCount = storyboard?.shots.filter((shot) => shot.status === "video_ready" && shot.videoMediaId).length ?? 0;
  useEffect(() => {
    setSelectedShotIds([]); setVersionAudit(null);
    if (storyboard) void actions.loadStoryboardBatchJobs(storyboard.storyboardId).then(setBatchJobs).catch(() => setBatchJobs([]));
    else setBatchJobs([]);
  }, [storyboard?.storyboardId]);
  async function importTimeline() {
    if (!storyboard) return;
    setImporting(true);
    try { setImportReceipt(await actions.importStoryboardToTimeline(storyboard.storyboardId)); }
    finally { setImporting(false); }
  }
  async function moveShot(index: number, delta: number) {
    if (!storyboard || readOnly) return;
    const target = index + delta;
    if (target < 0 || target >= storyboard.shots.length) return;
    const ids = storyboard.shots.map((shot) => shot.storyboardShotId);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    await actions.reorderStoryboard(storyboard.storyboardId, ids, storyboard.revision);
  }
  function toggleShot(id: string) { setSelectedShotIds((ids) => ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]); }
  async function createBatch(kind: "image" | "video") {
    if (!storyboard || readOnly) return;
    setBatchBusy(true);
    try {
      const requestedStoryboardShotIds = selectedShotIds.length ? selectedShotIds : storyboard.shots.map((shot) => shot.storyboardShotId);
      const sourceShotIds = storyboard.shots.filter((shot) => requestedStoryboardShotIds.includes(shot.storyboardShotId)).map((shot) => shot.shotId);
      const matchingUnit = units.find((record) => record.generationUnit.shotLinks.some((link) => sourceShotIds.includes(link.shotId))) ?? units[0];
      const generationParameters = matchingUnit?.generationUnit.generationParameters;
      const fallbackNode = executionNodes.find((node) => (kind === "image" ? ["image", "imageEdit"].includes(node.kind) : ["video", "videoShot", "video-clip"].includes(node.kind)));
      const input = {
        billingMode: "provider_account",
        provider: generationParameters?.provider,
        model: generationParameters?.model,
        configuration: {
          billingMode: "provider_account",
          executionNodeId: matchingUnit?.generationUnit.executionNodeId ?? fallbackNode?.id,
          ...(generationParameters?.aspectRatio ? { aspectRatio: generationParameters.aspectRatio } : {}),
          ...(generationParameters?.resolution ? { resolution: generationParameters.resolution } : {})
        }
      };
      await actions.createStoryboardBatchJob(storyboard.storyboardId, kind, requestedStoryboardShotIds, input);
      setBatchJobs(await actions.loadStoryboardBatchJobs(storyboard.storyboardId));
    } finally { setBatchBusy(false); }
  }
  async function advanceBatch(jobId: string) {
    if (!storyboard) return;
    setBatchBusy(true);
    try { await actions.advanceStoryboardBatchJob(storyboard.storyboardId, jobId); setBatchJobs(await actions.loadStoryboardBatchJobs(storyboard.storyboardId)); }
    finally { setBatchBusy(false); }
  }
  async function cancelBatch(jobId: string) {
    if (!storyboard) return;
    setBatchBusy(true);
    try { await actions.cancelStoryboardBatchJob(storyboard.storyboardId, jobId); setBatchJobs(await actions.loadStoryboardBatchJobs(storyboard.storyboardId)); }
    finally { setBatchBusy(false); }
  }
  async function retryBatchItem(jobId: string, itemId: string, input: Record<string, unknown> = {}) {
    if (!storyboard) return;
    setBatchBusy(true);
    try { await actions.retryStoryboardBatchItem(storyboard.storyboardId, jobId, itemId, input); setBatchJobs(await actions.loadStoryboardBatchJobs(storyboard.storyboardId)); }
    finally { setBatchBusy(false); }
  }
  async function compareVersions(storyboardShotId: string) {
    if (!storyboard) return;
    const versions = await actions.loadStoryboardShotVersions(storyboard.storyboardId, storyboardShotId);
    if (versions.length < 2) { setVersionAudit({ storyboardShotId, versions, changed: false, changes: [] }); return; }
    const comparison = await actions.compareStoryboardShotVersions(storyboard.storyboardId, storyboardShotId, versions.at(-1).version, versions[0].version);
    setVersionAudit({ storyboardShotId, versions, ...comparison });
  }
  return <div className="cp-storyboard-stage">
    <section className="cp-storyboard-head"><div><strong>电影工业故事板</strong><small>来自正式镜头和生成单元，不从脚本行直接拼接。故事板图是否进入视频请求由每个镜头单独选择。</small></div>{!storyboard ? <button disabled={!shots.length} onClick={() => void actions.createStoryboard()} type="button"><Plus size={14} />建立故事板</button> : <div className="cp-storyboard-head-actions"><span>{storyboard.shots.length} 个镜头 · 第 {storyboard.revision} 版</span><button disabled={readOnly || batchBusy} onClick={() => void createBatch("image")} type="button"><ImagePlus size={14} />批量故事板图</button><button disabled={readOnly || batchBusy} onClick={() => void createBatch("video")} type="button"><Video size={14} />批量镜头视频</button><button disabled={readOnly || importing || !videoReadyCount} onClick={() => void importTimeline()} title={videoReadyCount ? `按故事板顺序导入 ${videoReadyCount} 个已生成视频` : "需要先生成镜头视频"} type="button"><ListPlus size={14} />{importing ? "正在导入…" : "一键导入时间线"}</button></div>}</section>
    {importReceipt ? <section className={`cp-storyboard-import-receipt is-${importReceipt.status}`}><strong>时间线导入完成</strong><span>已添加 {importReceipt.added}</span><span>已跳过 {importReceipt.skipped}</span><span>失败 {importReceipt.failed}</span><small>共处理 {importReceipt.processed} / {importReceipt.total} 个镜头</small></section> : null}
    {batchJobs.length ? <section className="cp-storyboard-batches"><header><strong>批量生产任务</strong><small>导入媒体可直接复用；正式任务在编译、审查和能力预检通过后自动派发 Provider。</small></header>{batchJobs.map((job) => {
      const retryable = job.items.filter((item) => ["blocked", "failed", "cancelled"].includes(item.status));
      return <article key={job.id}><div><span>{job.kind === "image" ? "故事板图" : "镜头视频"}</span><strong>{job.status}</strong><small>{job.items.filter((item) => ["succeeded", "reused"].includes(item.status)).length} / {job.items.length} 完成 · 第 {job.revision} 版 · {job.configuration?.billingMode === "provider_account" ? "Provider 账户" : "旧任务"}</small></div><div className="cp-storyboard-batch-items">{job.items.map((item) => <span className={`is-${item.status}`} key={item.id}>#{item.order} {item.status}{item.providerRunId ? <small>run {item.providerRunId.slice(-8)}</small> : null}{item.error?.message ? <small title={item.error.message}>{item.error.message}</small> : null}{["blocked", "failed", "cancelled"].includes(item.status) && !readOnly ? <button disabled={batchBusy} onClick={() => void retryBatchItem(job.id, item.id)} title="重新执行当前预检通过的任务" type="button"><RotateCcw size={10} /></button> : null}</span>)}</div><div className="cp-storyboard-batch-actions"><button disabled={readOnly || batchBusy || !job.items.some((item) => ["queued", "running"].includes(item.status))} onClick={() => void advanceBatch(job.id)} type="button"><Play size={11} />{job.items.some((item) => item.status === "running") ? "检查运行结果" : "运行下一项"}</button><button disabled={readOnly || batchBusy || ["succeeded", "cancelled"].includes(job.status)} onClick={() => void cancelBatch(job.id)} type="button"><Ban size={11} />取消剩余</button></div>{retryable.length ? <small className="cp-batch-retry-note">预检或 Provider 失败；修正合同后点击重试，系统不会重复提交未确认的 Provider 任务。</small> : null}
      </article>;
    })}</section> : null}
    {versionAudit ? <section className="cp-storyboard-version-audit"><header><div><strong>分镜版本比较</strong><small>{versionAudit.versions.length} 个持久版本 · {versionAudit.changed ? `${versionAudit.changes.length} 处变化` : "没有可比较变化"}</small></div><button onClick={() => setVersionAudit(null)} type="button">关闭</button></header>{versionAudit.changes?.map((change) => <article key={change.field}><b>{String(change.field)}</b><span>{JSON.stringify(change.left)}</span><ChevronRight size={11} /><span>{JSON.stringify(change.right)}</span></article>)}</section> : null}
    {!storyboard ? <div className="cp-storyboard-empty"><Images size={28} /><strong>{shots.length ? "镜头已经准备好，可以建立正式故事板" : "先完成艺术镜头设计"}</strong><p>故事板不会再用旧脚本表格充当镜头合同。</p></div> : <div className="cp-storyboard-grid">{storyboard.shots.map((shot, index) => {
      const imageUrl = shot.imageMediaId ? `/api/projects/${projectId}/media/${shot.imageMediaId}` : null;
      const referenceReady = Boolean(shot.imageMediaId);
      const cinematography = shot.cinematicPlan?.cinematography || {};
      const editContinuity = shot.cinematicPlan?.editContinuity || {};
      const executionRows = [
        ["时长", shot.durationSeconds ? `${shot.durationSeconds}s` : ""],
        ["景别", cinematography.shotSize],
        ["机位", cinematography.cameraPosition],
        ["焦段", cinematography.perspective],
        ["景深", cinematography.depthOfField],
        ["焦点", cinematography.focus],
        ["运镜", cinematography.movementPath],
        ["切点", editContinuity.cutIntent || editContinuity.exit]
      ].filter((entry) => entry[1]);
      return <article className={`cp-storyboard-card${shot.videoReference.selected ? " is-video-reference" : ""}`} key={shot.storyboardShotId}>
        <header><label><input checked={selectedShotIds.includes(shot.storyboardShotId)} disabled={readOnly} onChange={() => toggleShot(shot.storyboardShotId)} type="checkbox" /><span>#{shot.order}</span></label><div><strong>{shot.title}</strong><small>{shot.durationSeconds ? `${shot.durationSeconds}s · ` : ""}{shot.status}</small></div><div className="cp-storyboard-order-actions"><button disabled={readOnly || index === 0} onClick={() => void moveShot(index, -1)} title="上移" type="button"><ArrowUp size={11} /></button><button disabled={readOnly || index === storyboard.shots.length - 1} onClick={() => void moveShot(index, 1)} title="下移" type="button"><ArrowDown size={11} /></button><button onClick={() => void compareVersions(shot.storyboardShotId)} title="比较持久版本" type="button"><GitCompare size={11} /></button></div></header>
        <div className="cp-storyboard-frame">{imageUrl ? <img alt={`${shot.title} 故事板`} src={imageUrl} /> : <><Images size={24} /><span>待生成故事板图</span></>}</div>
        <div className="cp-storyboard-copy"><strong>{shot.storyBeat}</strong><p>{shot.narrativeJob || "未填写本格叙事功能"}</p><small>{shot.generationUnitId ? `生成单元：${shot.generationUnitId}` : "尚未绑定生成单元"}</small></div>
        <dl className="cp-storyboard-shot-execution">{executionRows.map(([label, value]) => <div key={String(label)}><dt>{String(label)}</dt><dd>{String(value)}</dd></div>)}</dl>
        <label className="cp-storyboard-reference-toggle" title={referenceReady ? "普通参考只锁定人物、场景、构图和空间，不代表视频从这张图开始" : "故事板图生成后才能选择"}><input checked={shot.videoReference.selected} disabled={!referenceReady} onChange={(event) => void actions.setStoryboardVideoReference(storyboard.storyboardId, shot.storyboardShotId, event.target.checked)} type="checkbox" /><span><b>作为语义参考</b><small>{shot.videoReference.selected ? "已选择 · 不作为首帧；剧情、动作和运镜由逐时段提示词控制" : referenceReady ? "未选择 · 仅保留为故事板/规划证据" : "需要先生成故事板图"}</small></span></label>
      </article>;
    })}</div>}
    <section className="cp-anchor-reference-summary"><header><strong>Generation Unit 图文混合控制</strong><small>图片只约束声明过的静态事实；动态、替换和遮挡补全由独立文字合同控制。</small></header><div className="cp-card-grid">{units.map(({ generationUnit: unit, referenceBindings }) => {
      const intent = unit.controlIntent;
      return <article className="cp-anchor-card" key={unit.generationUnitId}><header><Images size={17} /><div><strong>{unit.generationUnitId}</strong><small>{unit.generationParameters.mode} · {unit.visualAnchorPolicy}</small></div></header>
        <div className={`cp-anchor-policy ${unit.visualAnchorPolicy === "NONE" ? "is-none" : ""}`}>{intent ? `${intent.primaryConsistency} / ${intent.motionComplexity} motion / ${intent.cameraFreedom} camera` : "缺少模式与动态合同"}</div>
        {intent ? <p>{intent.modeRationale || "尚未填写模式选择理由"}<br /><small>动态来源：{intent.dynamicControl.source}；静态图不承担完整运动轨迹。</small></p> : null}
        {referenceBindings.length ? <ol>{referenceBindings.map((binding) => {
          const semantic = binding.semanticControl;
          return <li key={`${binding.providerIndex}-${binding.mediaId}`}><b>{binding.displayName}（参考图{binding.providerIndex}）</b><span>{binding.role}</span><small>控制：{binding.controls.join("、")}；不控制：{binding.doesNotControl.join("、") || "—"}</small>{semantic ? <small>保留 {semantic.preserve.length} · 替换 {semantic.replace.length} · 补全 {semantic.complete.length} · 忽略 {semantic.ignore.length} · 仅风格 {semantic.styleOnly.length} · {semantic.temporalRole}</small> : <small>未声明逐项图文职责</small>}</li>;
        })}</ol> : <p className="cp-empty">没有资产参考绑定。</p>}
      </article>;
    })}</div></section>
  </div>;
}

function PromptStage({ actions, compilation, units }: Pick<WorkspaceProps, "actions" | "compilation" | "units">) {
  const [unitId, setUnitId] = useState(units[0]?.generationUnit.generationUnitId ?? "");
  const [result, setResult] = useState(compilation);
  const [busy, setBusy] = useState(false);
  async function compile() { setBusy(true); try { setResult(await actions.compileGenerationUnit(unitId)); } finally { setBusy(false); } }
  async function preflight() {
    setBusy(true);
    try {
      const next = await actions.preflightGenerationUnit(unitId);
      if (next?.envelope) setResult({ compilationId: next.compilationId, envelope: next.envelope });
    } finally {
      setBusy(false);
    }
  }
  const envelope = result?.envelope;
  const continuityAudit = envelope?.sourceVersions?.continuityAudit;
  const modeControl = envelope?.generationControl as Record<string, any> | undefined;
  const controlIntent = modeControl?.intent as Record<string, any> | undefined;
  return <div className="cp-prompt-stage"><section className="cp-compile-toolbar"><select value={unitId} onChange={(event) => setUnitId(event.target.value)}>{units.map((record) => <option key={record.generationUnit.generationUnitId} value={record.generationUnit.generationUnitId}>{record.generationUnit.generationUnitId}</option>)}</select><button disabled={!unitId || busy} onClick={() => void compile()} type="button"><Code2 size={14} />确定性编译</button><button disabled={!unitId || busy} onClick={() => void preflight()} type="button"><ShieldCheck size={14} />重新预检</button></section>
    {!envelope ? <p className="cp-empty">选择生成单元后执行编译。专家只填写结构化字段，最终提示词只由这里的单一编译器产生。</p> : <>
      <div className="cp-status-row"><span className={envelope.lint.ok ? "is-ok" : "is-bad"}>{envelope.lint.ok ? <Check size={14} /> : <AlertTriangle size={14} />}提示词检查 · {envelope.lint.bytes} 字节</span><span className={envelope.preflight.ok ? "is-ok" : "is-bad"}>{envelope.preflight.ok ? <Check size={14} /> : <AlertTriangle size={14} />}能力预检</span></div>
      <section className="cp-parameter-panel"><header><strong>图文混合与动态控制</strong><small>静态参考事实、动态演化和模式适配分别审计</small></header><SummaryGrid items={[["当前模式", modeControl?.selectedMode ?? envelope.generationParameters.mode], ["帧锚点职责", modeControl?.frameAnchorPolicy?.firstFrameScope ? "首帧只锁定 t0；t0+1 起由动态合同驱动" : "无首帧硬锚点"], ["一致性首要目标", controlIntent?.primaryConsistency ?? "未声明"], ["运动复杂度", controlIntent?.motionComplexity ?? "未声明"], ["运镜自由度", controlIntent?.cameraFreedom ?? "未声明"], ["模式理由", controlIntent?.modeRationale ?? "未声明"], ["动态来源", controlIntent?.dynamicControl?.source ?? "未声明"]]} /></section>
      <PromptDisclosure label="查看编译后的内容提示词" note="技术参数与内容信息已经分离" value={envelope.compiledContentPrompt} />
      <section className="cp-parameter-panel"><header><strong>生成服务参数</strong><small>仅进入模型请求，不混入内容提示词</small></header><SummaryGrid items={Object.entries(envelope.generationParameters)} /></section>
      <IssueGroups groups={[["电影连续性", continuityAudit?.errors || []], ["提示词检查", envelope.lint.errors.filter((entry: Record<string, unknown>) => entry.continuity !== true)], ["模式与动态控制", modeControl?.warnings || []], ["能力预检", envelope.preflight.errors], ["能力降级", envelope.capabilityDegradation]]} />
    </>}
  </div>;
}

function GenerateStage({ actions, units }: Pick<WorkspaceProps, "actions" | "units">) {
  const [unitId, setUnitId] = useState(units[0]?.generationUnit.generationUnitId ?? "");
  return <section className="cp-generate-gate"><Film size={34} /><h3>正式生成</h3><p>只有已编译、提示词检查与能力预检全部通过的生成单元才能提交；预检通过后由 Provider 账户自动执行。请求成功仍不代表成片通过。</p><select value={unitId} onChange={(event) => setUnitId(event.target.value)}>{units.map((record) => <option key={record.generationUnit.generationUnitId} value={record.generationUnit.generationUnitId}>{record.generationUnit.generationUnitId}</option>)}</select><button disabled={!unitId} onClick={() => void actions.runGenerationUnit(unitId)} type="button"><Play size={15} />提交预检并自动生成</button></section>;
}

function ReviewStage({ actions, contributions, evaluations }: Pick<WorkspaceProps, "actions" | "contributions" | "evaluations">) {
  return <div className="cp-review-stage"><section><header><strong>全时间线专业验收</strong><small>身份、空间、摄影、灯光、色彩、表演、物理、声音、剪辑与连续性</small></header>{evaluations.map((evaluation) => <article key={evaluation.evaluationId}><b>{evaluation.decision}</b><span>{String(evaluation.runId ?? "")}</span><small>{String(evaluation.actualExitState ?? "未记录出口状态")}</small></article>)}<CinematicContractForm label="新增专业验收记录" value={evaluationStarter()} onSave={(value) => actions.addEvaluation(value)} /></section>
    <aside><header><strong>专业团队贡献</strong><small>专家字段不会直接拼接最终提示词</small></header>{contributions.length ? contributions.map((entry) => <article key={entry.contributionId}><b>{entry.roleId}</b><span>{entry.targetType} · {entry.targetId}</span><p>{entry.diagnosis}</p></article>) : <p className="cp-empty">暂无专业贡献记录。</p>}</aside>
  </div>;
}

export function CinematicProductionWorkspace(props: WorkspaceProps) {
  const [stageId, setStageId] = useState<CinematicStageId>(props.initialStage ?? "story");
  useEffect(() => setStageId(props.initialStage ?? "story"), [props.initialStage]);
  const stages = useMemo(() => buildCinematicStages(props), [props]);
  const acceptedAuthorities = props.assetAuthorities.filter((authority) => authority.status === "accepted").length;
  const projectStates = [
    ["剧作事实", props.storyPacket ? `第${props.storyPacket.revision ?? 1}版` : "待建立", Boolean(props.storyPacket)],
    ["视觉圣经", props.visualBible ? `第${props.visualBible.revision ?? 1}版` : "待建立", Boolean(props.visualBible)],
    ["资产权威", props.assetAuthorities.length ? `${acceptedAuthorities} / ${props.assetAuthorities.length}` : "待路由", props.assetAuthorities.length > 0 && acceptedAuthorities >= props.assetAuthorities.length],
    ["镜头", props.shots.length, props.shots.length > 0],
    ["生成单元", props.units.length, props.units.length > 0],
    ["连续预演", props.sequencePrevis.length, props.sequencePrevis.length > 0],
    ["审阅", props.evaluations.length, props.evaluations.length > 0]
  ] as Array<[string, string | number, boolean]>;
  const stageContent = stageId === "story" ? <StoryStage {...props} />
    : stageId === "bible" ? <BibleStage {...props} />
      : stageId === "authorities" ? <AuthorityStage {...props} />
        : stageId === "shots" ? <ShotStage {...props} />
        : stageId === "units" ? <UnitStage {...props} />
          : stageId === "anchors" ? <AnchorStage {...props} />
            : stageId === "previs" ? <CinematicSequencePrevisWorkspace actions={props.actions} assetAuthorities={props.assetAuthorities} projectId={props.projectId} sequencePrevis={props.sequencePrevis} shots={props.shots} storyboards={props.storyboards} storyPacket={props.storyPacket} visualContextBundles={props.visualContextBundles} />
            : stageId === "prompt" ? <PromptStage {...props} />
              : stageId === "generate" ? <GenerateStage {...props} />
                : <ReviewStage {...props} />;
  return <section className={`cinematic-production-workspace${props.embedded ? " is-canvas-node" : ""}`} aria-label="影视工业制片工作区"><header className="cp-workspace-header"><div><span>UNUNUTV 影视总控</span><strong>{props.production.title}</strong><small>{projectTypeLabel(props.production.projectType)} · 制作态 · 第 {props.production.revision} 版</small></div><div className="cp-workspace-actions"><button className="nodrag nopan" onClick={props.onClose} title={props.floating ? "关闭影视总控" : props.embedded ? "收起为总览卡片" : "关闭工作区"} type="button">{props.embedded && !props.floating ? <Minimize2 size={18} /> : <X size={18} />}</button></div></header><div className={`cp-project-state-strip${props.embedded ? " nodrag nopan nowheel" : ""}`}>{projectStates.map(([label, value, ready]) => <div key={label}><span>{label}</span><strong className={ready ? "is-ready" : "is-attention"}>{ready ? <Check size={11} /> : <AlertTriangle size={11} />}{value}</strong></div>)}</div>
    <div className={`cp-stage-shell${props.embedded ? " nodrag nopan nowheel" : ""}`}><nav>{stages.map((stage, index) => <button className={stageId === stage.id ? "is-active" : ""} key={stage.id} onClick={() => setStageId(stage.id)} type="button"><i>{index + 1}</i><span><b>{stage.label}</b><small>{stage.note}</small></span><em className={`is-${stage.state}`} />{index < stages.length - 1 && <ChevronRight size={13} />}</button>)}</nav><main><fieldset className="cp-stage-readonly-boundary" disabled={props.readOnly}>{props.readOnly ? <div className="cp-readonly-ribbon">全自动运行中 · 仅查看</div> : null}{stageContent}</fieldset></main></div>
  </section>;
}
