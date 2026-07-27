# UnunuTV 终极开发方案：平台制片 OS

**文档 ID**: `unutv-ultimate-platform-os-v1`  
**版本**: 1.0.0  
**日期**: 2026-07-23  
**状态**: **Phase 0–5 已落地（2026-07-23）**；Phase 6–8（上游 LLM workers / 审片增强 / 多片型）待续  
**取代**: 零散讨论结论；与 `20260723-unutv-platform-production-os-plan.md` 冲突时以本文为准  

**代码根**: `/Users/zhangxiaohao/Ununu/ununuAI/ununu-unutv`  
**知识库根**: `/Users/zhangxiaohao/Ununu/ununuAI/统一知识库`  

---

## 0. 执行摘要

### 0.1 一句话目标

```text
本地薄 Skill（遥控器）
  → UnunuTV 平台编排（状态机 + 受控 Workers）
  → 合同 / 真知识会签 / 唯一 Prompt / Provider / 审片
  → 单集稳定出片 + 第 2/3 集资产复用与跨集连续性
```

### 0.2 产品对标（学什么、不学什么）

| 学 LibTV/Flova | 保留 Ununu 壁垒 | 不学 |
|---|---|---|
| 平台内默认流水线 | 合同 revision | 外层自由导演 |
| 薄客户端 Skill | 确定性 Prompt 编译 | 纯黑盒无审计抽卡 |
| 资产库跨集复用 | kn/cap + 会签门禁 | 假 cap/kn 字符串凑数 |
| 局部重做 | 实拍 evaluation / 正典 | 多路径出片 |
| 明确卡点 | formal 防直跑 | “一键=一次 Provider”幻觉 |

### 0.3 审计基线（2026-07-23 代码事实）

| 层级 | 现状 | 判定 |
|---|---|---|
| 合同 / 编译 / preflight / formal run | 真实现 + 测试 | **可用** |
| 13 阶段 automation | 多数字查缺阻断；少数会创建 | **半可用** |
| 知识 cap/kn | 只校验字符串前缀 | **假接地 / 半可用** |
| 自动建 GenerationUnit | 无 | **断链** |
| 视频自动化路径 | formal unit 与 storyboard batch 双路径 | **不合理** |
| nextAction | 无 | **缺** |
| Series / 共享资产 / 跨集 ledger | 无（仅 projectType 枚举） | **不可用** |
| 付费 approvedPaid 正式门 | 已清除主路径 | **已修** |

**总判词**: 质检与出片边界是真的；自动创作与平台编排未完工；多集复用未建。终极方案 = **在现有内核上补生产线，而不是推倒重来**。

---

## 1. 成功标准与非目标

### 1.1 必须达成（DoD）

1. **单入口**: 本地只认 `ununu-video` Skill；主循环 `start → status/advance → owner → done`。  
2. **单权威 Prompt**: Draft ≡ Envelope ≡ Provider request（`payloadHash` 一致）；正式路径 mismatch → 409。  
3. **单出片路径**: production 正式视频 **只允许** GenerationUnit compile → preflight → run；禁止 production 节点旁路 `node run`；workflow 视频阶段禁止默认 storyboard batch 冒充 formal。  
4. **真编排**: `status.nextAction` 永远给出唯一下一步（含 CLI/API）。  
5. **真知识**: Knowledge Port 校验 cap/kn **真实存在**（及状态）；自动会签写入 Contribution。  
6. **能续集**: Ep1 ACCEPT 资产 promote 到 SharedLibrary；Ep2/Ep3 默认 bind 同 identity/version；Ledger 继承状态与禁止信息倒退。  
7. **局部失败**: veto/retake 默认单 Unit；未知 Provider 结果禁止盲重试。  
8. **可测**: 下列测试必须绿：单集 e2e（mock provider）、Ep1→Ep2 复用、知识假 ID 拒绝、prompt authority、formal 直跑拦截。

### 1.2 体验指标（上线观测）

| 指标 | 目标 |
|---|---|
| formal 旁路出片 | 0 |
| prompt authority mismatch（正式） | 0 |
| 单次 formal run 的 prompt 版本数 | 1 |
| Ep2 reference 来自 shared library 比例 | ≥ 70% |
| status 含合法 nextAction | 100% |
| 假 cap/kn 通过 preflight | 0 |

### 1.3 非目标

- 复制 LibTV/Flova 私有代码  
- 一期完整多租户商业计费  
- 取消 Owner 创意门 / 工业门禁  
- UnunuTV 内嵌可自由工具调用的第二 Codex  
- 一期并行精品化全部片型（先 `short_drama` 连载）

---

## 2. 目标架构

```text
┌─────────────────────────────────────────────────────┐
│ 本地客户端                                            │
│  skills/ununu-video  （唯一主入口，薄）                 │
│  可选: ununu-unutv-operator（运维字典，非主脑）         │
└───────────────────────┬─────────────────────────────┘
                        │ CLI / HTTP
                        ▼
┌─────────────────────────────────────────────────────┐
│ UnunuTV Application                                   │
│                                                       │
│  API / CLI Controllers                                │
│           │                                           │
│           ▼                                           │
│  ┌──────────────────────┐                             │
│  │ Orchestrator (代码)   │  阶段机 + nextAction        │
│  │ ORCH_V2               │  禁止跳步、一失败一动作      │
│  └──────────┬───────────┘                             │
│             │ dispatch                                │
│   ┌─────────┼──────────┬────────────┬──────────┐      │
│   ▼         ▼          ▼            ▼          ▼      │
│ Workers  Knowledge  Compiler    Provider   Series     │
│ (受控)   Port       (确定性)    Gateway    Services   │
│   │         │                                 │       │
│   │         └─► 统一知识库 cap-*/kn-*          │       │
│   │                                           │       │
│   └─► Contracts Store (SQLite) ◄──────────────┘       │
│       Story/Shot/Unit/Contribution/Evaluation         │
│       SharedAssetLibrary / ContinuityLedger           │
│       Media / Runs / Reviews                          │
└─────────────────────────────────────────────────────┘
```

### 2.1 角色宪法

| 角色 | 做什么 | 不做什么 |
|---|---|---|
| 本地 Agent + 薄 Skill | start/advance/owner 确认 | 编排、手搓正式 Prompt、直查知识库、浏览器写生产 |
| Orchestrator | 算阶段与 nextAction，调 worker | 自由创作长文、直接调模型乱写 |
| Workers | 填规定 schema 的合同 | 改 phase、调 Provider 出片、递归编排 |
| Knowledge Port | 检索/校验 kn cap | 改生产合同 |
| Compiler | 唯一 Prompt | LLM 自由发挥 |
| Provider Gateway | 唯一出片 | 改 content prompt |
| Owner | 创意 ACCEPT / 资产晋升 / 交付 | 被自动化静默替代 |

### 2.2 Workers ≠ 自由大模型 Agent

- Orchestrator / Compiler / Preflight / Provider / 资产绑定：**纯代码**  
- Script / Shot / Expert / Review：**可选用 LLM**，但必须：  
  - 单任务  
  - JSON schema 输出  
  - 无出片权、无编排权  
  - 可关闭 LLM 时用模板降级  

---

## 3. 领域模型（完整）

### 3.1 系列三层

```text
SeriesProject
  seriesId, title, contentType
  sharedAssetLibraryId, ledgerId
  episodeIds[], defaultAspectRatio, targetEpisodeSeconds

EpisodeRecord
  episodeId, seriesId, episodeNumber (1..N)
  projectId, productionId, sourceNodeId?
  brief, status (draft|running|blocked|delivered|failed)
  entryLedgerRevision, exitLedgerRevision?
  workflowRunId?, createdAt, updatedAt

CinematicProduction（已有）
  一集的合同链：Story/Bible/Authority 绑定/Shots/Units/...
```

**规则**: 第 1 集即创建 Series（即使暂时只拍 1 集），避免续集资产散落。

### 3.2 SharedAssetLibrary（跨集服用）

```text
SharedAssetEntry
  entryId, kind (character|scene|prop|voice|costume_variant)
  displayName
  authorityId
  acceptedMediaId, acceptedVersionId
  freeze (bool)                 # true: 禁止静默重画身份/拓扑母版
  parentEntryId?                # variant 指向 identity
  promoteEpisodeId
  status (candidate|accepted|deprecated)
```

**复用优先级**

```text
1. library accepted (+ freeze identity)
2. 合法 variant（换装/受伤，同 character 谱系）
3. 仅缺失时新建 → 像素 ACCEPT → promote
```

**禁止**: 同角色无故新脸；未 promote 临时资产默认带入下集；用重抽覆盖 freeze。

### 3.3 SeriesContinuityLedger（跨集账本）

```json
{
  "ledgerId": "...",
  "seriesId": "...",
  "revision": 3,
  "characters": {
    "char-id": {
      "authorityId": "...",
      "acceptedLookVersionId": "...",
      "state": { "injury": "...", "costume": "...", "knownFacts": [] }
    }
  },
  "props": {
    "prop-id": { "owner": "...", "condition": "...", "location": "..." }
  },
  "plot": {
    "promisesOpen": [],
    "revealedFacts": [],
    "forbiddenEarlyInfo": []
  },
  "world": { "timeProgress": "...", "activeSceneAuthorityIds": [] },
  "sourceEpisodeId": "ep-01",
  "updatedAt": "..."
}
```

- 开 Ep N：加载 latest committed ledger 为 entry  
- Ep N 交付：commit → revision+1  
- Story/Shot preflight：禁止信息倒退与状态无因跳变  

### 3.4 NextAction

```json
{
  "actionId": "na-...",
  "type": "advance|run_worker|owner_gate|repair|wait_provider|promote_asset|commit_ledger|done|failed",
  "phase": "prompt_compile",
  "seriesId": "...",
  "episodeNumber": 2,
  "worker": "expert_worker|null",
  "command": {
    "cli": "ununu-unutv workflow cinematic-advance --project P --automation-run R",
    "method": "POST",
    "path": "/api/projects/P/cinematic-workflow/advance",
    "body": {}
  },
  "blocker": { "code": "...", "message": "...", "targetType": "...", "targetId": "...", "revision": 1 },
  "ownerGate": { "required": true, "reviewType": "...", "targetId": "..." },
  "promptAuthority": {
    "compilationId": "...",
    "payloadHash": "...",
    "status": "missing|draft|lint_blocked|preflight_ready|stale|dispatched"
  },
  "assetReuse": {
    "libraryId": "...",
    "boundEntryIds": [],
    "missingRequired": [],
    "reuseRateHint": 0.0
  },
  "idempotencyKey": "..."
}
```

### 3.5 Prompt 单权威

```text
合同 + 会签 + 共享资产绑定
  → PromptDraft（status = lint.ok ∧ preflight.ok 才 ready）
  → Envelope.payloadHash
  → Provider request 必须同 hash
  → Run 持久化 summary（不含第二套 content prompt）
```

### 3.6 Genre Card

`packages/contracts/src/genre-cards/`

| contentType | 一期 | 要点 |
|---|---|---|
| short_drama | **完整** | 9:16、连载、强复用、ledger 必开 |
| episodic_series | card | 更长集、更强跨集 |
| music_video | card | 节拍、弱对白连续性 |
| social_video | card | 前 3 秒、字幕 |
| short_film / feature_film | card | 16:9、强连续性 |

---

## 4. 默认流水线

### 4.1 系列级

```text
series.create(title, contentType, episodeCount?)
  → SharedAssetLibrary + empty Ledger
  → episode 1 创建 production + 可选占位 2..N
```

### 4.2 单集 13 阶段（与现网 phase 名对齐，语义=可施工）

| # | phase | 平台自动 | Owner 门 | 产物 |
|---|---|---|---|---|
| 1 | script_analysis | brief→Story；Ep2+ 注入 ledger | Story ACCEPT | Story |
| 2 | block_planning | script rows / breakdown | 可选 | breakdown |
| 3 | visual_bible | 最小 Bible / 系列继承 | 可选 | Bible |
| 4 | asset_design | **优先 bind library**；否则 derive/生成候选 | 新资产像素 ACCEPT；promote? | 绑定/Authority |
| 5 | shot_design | plan shots + bind 共享参考 | 每镜 ACCEPT | Shots |
| 5b | **unit_design（新增逻辑，可并入 compile 前）** | **自动创建 GenerationUnits** | 否 | Units |
| 6 | prompt_compile | 自动会签 + compile + preflight | 否 | Envelope ready |
| 7 | image_generation | 仅缺的本集关键静帧 | 高风险像素 | media |
| 8 | video_generation | **仅 formal unit run** | 否 | 视频 |
| 9 | sound_design | 策略生成或 skip | 否 | 音频 |
| 10 | continuity_qa | evaluation 草稿 + 硬 veto | take ACCEPT | Evaluation |
| 11 | timeline_edit | 只装 ACCEPT | 否 | Timeline |
| 12 | candidate_render | render | 否 | master |
| 13 | delivery_qc | QC + **ledger commit** + promote 待晋升资产提醒 | 交付确认 | package |

### 4.3 Ep2/Ep3 开集硬步骤

1. 绑定 series + library  
2. 载入 entry ledger  
3. Story 约束：状态继承、revealedFacts、forbiddenEarlyInfo  
4. 默认 referenceBindings → library accepted  
5. freeze 资产禁止覆盖 gen  
6. 跑本集阶段  
7. 交付 commit ledger  

### 4.4 失败策略

| 类型 | nextAction |
|---|---|
| 缺合同可自动填 | run_worker |
| 需 Owner | owner_gate |
| preflight 技术失败 | repair |
| Provider running | wait_provider |
| 未知结果 | failed + reconcile（禁止 auto retry） |
| 质量 veto | retake 同 unit |
| 缺复用绑定 | promote_asset 或 bind repair |
| 信息倒退 | failed preflight |

### 4.5 必须消灭的双路径（审计 P0）

```text
BEFORE: video_generation 可能 storyboard batch 旁路 formal
AFTER:  contentType 正式生产视频阶段只允许:
        list units → preflight.ready → runGenerationUnit
        storyboard batch 仅用于 image_generation 或 direct 实验
```

---

## 5. 模块详细设计

### 5.1 Orchestrator

路径:

```text
packages/core/src/orchestration/
  orchestrator.mjs
  next-action.mjs
  failure-policy.mjs
  phase-handlers/*.mjs
  series/open-episode.mjs
  series/bind-shared-assets.mjs
  series/commit-ledger.mjs
```

- 扩展 `getCinematicWorkflowStatus`  
- 新增 `advanceCinematicWorkflow`  
- 改造 `automation-executor-use-cases.mjs`：handler.ensure() 替代纯 throw required  
- Flag: `UNUTV_ORCH_V2`（新 start 默认 true）

### 5.2 Knowledge Port（修假接地）

```text
packages/core/src/ports/knowledge-port.mjs
packages/local-runtime/src/knowledge-file-adapter.mjs
```

```js
retrieveKnowledge({ risks, roles, departments, limit, statuses })
getKnowledgeByIds(ids) // 不存在 → 明确错误
assertKnowledgeGrounding(refs) // formal 会签/preflight 调用
```

- 读 `专家/能力模块/cap-*.json`、`正式知识/知识原子/kn-*.json`  
- 校验 status：SUSPENDED 不可用；LIMITED 必须带适用边界进 contribution  
- env: `UNUTV_KNOWLEDGE_ROOT`  

**破坏性修正**: `hasGroundedKnowledge` 从“前缀”改为“Port 确认存在且可用”。

### 5.3 Workers

```text
packages/core/src/workers/
  worker-runtime.mjs
  llm-port.mjs                 # 可 null
  series-bootstrap-worker.mjs
  script-worker.mjs
  shot-worker.mjs
  unit-design-worker.mjs       # 审计断链：自动建 GenerationUnit
  asset-reuse-binder.mjs
  asset-variant-worker.mjs
  expert-worker.mjs
  review-worker.mjs
  ledger-commit-worker.mjs
```

| Worker | 职责 | LLM |
|---|---|---|
| series-bootstrap | Series+Library+Ledger | 否 |
| script | Story 草稿（+ledger 约束） | 可选 |
| shot | Shots+storyboard + bind | 可选/复用 planCinematicFromScript |
| unit-design | 为 shots 建 Units、绑 execution node/model 策略 | 否（策略来自 manifest） |
| asset-reuse-binder | library → referenceBindings | 否 |
| variant | 换装/伤变派生 | 可选 |
| expert | retrieve + Contribution（真 kn/cap） | 一期模板，二期 LLM |
| review | Evaluation 骨架 + 规则 veto | 二期视觉 |
| ledger-commit | 集末账本 | 否 |

Worker Runtime 约束：schema、超时、审计、禁止递归编排、禁止 Provider run。

### 5.4 已有内核增强

| 模块 | 改动 |
|---|---|
| compile/preflight | Draft status = lint∧preflight；真知识校验 |
| runGenerationUnit | 已有 formal 路径保持；强制 hash |
| production node run | 保持 formal_generation_unit_required |
| evaluation | 接 review worker；ACCEPT 门进 timeline |
| sequenceState | 保持 carryForward 硬继承 |

### 5.5 本地 Skill

```text
skills/ununu-video/
  SKILL.md
  references/next-action-loop.md
  references/owner-gates.md
  references/series-episodes.md
  agents/openai.yaml
```

**硬禁令**: 浏览器写生产；node run 正式节点；手搓正式 Prompt；直访知识库；跳阶段；invent 第二流水线。

**降级**:  
- `ununu-cinematic-production` → 附录  
- `ununu-unutv-operator` → 运维字典  

---

## 6. API / CLI（完整面）

### 6.1 Series

```text
POST /api/series
GET  /api/series/:seriesId
POST /api/series/:seriesId/episodes
GET  /api/series/:seriesId/assets
POST /api/series/:seriesId/assets/promote
GET  /api/series/:seriesId/continuity-ledger
POST /api/series/:seriesId/continuity-ledger/commit
```

### 6.2 Workflow

```text
POST .../cinematic-workflow/start
GET  .../cinematic-workflow/status          # + nextAction
POST .../cinematic-workflow/advance
POST .../cinematic-workflow/owner-decision
```

### 6.3 Knowledge / Experts / Units

```text
POST /api/knowledge/retrieve
POST .../experts/auto-signoff
POST .../generation-units (若缺自动创建 API)
POST .../generation-units/:id/retake
```

### 6.4 CLI 示例

```bash
ununu-unutv series create --title "雨夜复仇" --content-type short_drama --episodes 8

ununu-unutv workflow cinematic-start \
  --project P --series S --episode 1 --source-node N \
  --content-type short_drama --target-duration 60 \
  --data '{"brief":"女主雨夜对峙"}'

ununu-unutv workflow cinematic-status --project P
ununu-unutv workflow cinematic-advance --project P
ununu-unutv workflow owner-decide --project P --data '{...}'

ununu-unutv series promote-asset --series S --data '{...}'
ununu-unutv workflow cinematic-start --series S --episode 2 --data '{"brief":"..."}'
ununu-unutv series ledger-commit --series S --episode 2
```

---

## 7. 仓库落点清单

```text
packages/contracts/src/
  next-action-contracts.mjs
  series-contracts.mjs
  shared-asset-library-contracts.mjs
  continuity-ledger-contracts.mjs
  worker-contracts.mjs
  genre-cards/*
  cinematic-prompt-policy.mjs          # Draft status / 知识真校验挂钩
  cinematic-professional 相关校验增强

packages/core/src/
  orchestration/**
  workers/**
  ports/knowledge-port.mjs
  use-cases/series-use-cases.mjs
  use-cases/cinematic-workflow-use-cases.mjs
  use-cases/automation-executor-use-cases.mjs
  use-cases/cinematic-professional-signoff-policy.mjs
  use-cases/application.mjs

packages/local-runtime/src/
  knowledge-file-adapter.mjs
  series-adapter.mjs
  shared-asset-adapter.mjs
  continuity-ledger-adapter.mjs

apps/api/src/  series-routes, knowledge-routes, workflow 扩展
apps/cli/src/index.mjs
skills/ununu-video/**

tests/
  next-action.test.mjs
  prompt-authority.test.mjs
  knowledge-port-real-ids.test.mjs
  fake-knowledge-rejected.test.mjs
  unit-design-auto-create.test.mjs
  video-path-formal-only.test.mjs
  expert-auto-signoff.test.mjs
  series-shared-assets.test.mjs
  episode2-asset-reuse.test.mjs
  ledger-continuity.test.mjs
  workflow-short-drama-e2e.test.mjs
  workflow-episode-chain.test.mjs
```

---

## 8. 分阶段交付（含审计修复优先级）

### Phase 0 — 基线（2–3 天） — **已完成 2026-07-23**

- [x] `npm test` 全绿作基线  
- [x] 冻结旁路清单与双路径问题备案（formal video 仅 GenerationUnit）  
- [x] 确认 `UNUTV_KNOWLEDGE_ROOT` / 默认 `统一知识库`  

**产出**: 基线 + Platform OS v1 落地  

---

### Phase 1 — 稳：Prompt 权威 + NextAction — **已完成 2026-07-23**

1. [x] NextAction 合同  
2. [x] status 永远返回 nextAction  
3. [x] Draft status = lint ∧ preflight  
4. [x] formal run hash 三方一致（既有内核）  
5. [x] 测试  

**验收**: mismatch 409；status 可驱动 Agent 不瞎猜  

---

### Phase 2 — 入口：薄 Skill + Advance — **已完成 2026-07-23**

1. [x] `skills/ununu-video`  
2. [x] `cinematic-advance`  
3. [x] advance 串确定性动作（unit-design / signoff / compile/preflight）  
4. [x] softlink Codex/Grok/agents  

**验收**: 合同齐时 advance 循环可到 mock video  

---

### Phase 3 — 断链修复：Unit 自动设计 + 视频单路径 — **已完成 2026-07-23**

1. [x] `unit-design-worker`：shots → GenerationUnits + 执行节点/模型策略  
2. [x] `prompt_compile` 前确保 units 存在  
3. [x] **workflow video_generation 仅 formal unit run**  
4. [x] storyboard batch 限制在 legacy 非 cinematic workflow  
5. [x] 测试 formal path / unit-design  

**验收**: shot_design 后 advance 不再因缺 unit 永久死；自动化视频不走 batch 冒充 formal  

---

### Phase 4 — 真知识：Port + 自动会签 — **已完成 2026-07-23**

1. [x] Knowledge file adapter  
2. [x] `assertKnowledgeRefsGrounded` 真校验  
3. [x] auto-signoff worker（模板）  
4. [x] prompt_compile / advance 自动会签  
5. [x] 假 cap/kn 必须失败测试  

**验收**: 不经本地编造 kn；假 ID 不过门；真 ID 可过  

---

### Phase 5 — 多集：Series / Library / Ledger — **已完成 2026-07-23**

1. [x] Series/Episode/Library/Ledger 持久化  
2. [x] series API/CLI  
3. [x] Ep1 promote  
4. [x] Ep2 bind + entry ledger  
5. [x] freeze 禁止覆盖  
6. [x] ledger commit  
7. [x] Ep1→Ep2 复用测试 + freeze 拒绝测试  

**验收**: Ep2 同 media/version bind；reuseRate 可统计；无故新脸拒绝  

---

### Phase 6 — 上游自动施工（7–10 天）

1. script-worker（+ledger）  
2. shot-worker + asset-reuse-binder  
3. visual bible 最小/继承  
4. Owner 门：story、shots、新资产像素  

**验收**: 仅 brief+start 可推到 Shot Owner ACCEPT；Ep2 继承状态约束  

---

### Phase 7 — 后链路与局部重做（5–8 天）

1. review-worker 骨架  
2. unit retake  
3. timeline 仅 ACCEPT  
4. delivery + ledger commit  
5. 未知结果 reconcile  

**验收**: REJECT 不进时间线；retake 不动 freeze library  

---

### Phase 8 — 增强（并行）

1. 可选 LLM port（可关）  
2. variant 换装/受伤  
3. 视觉/dense 审片增强  
4. camera plan 强化  
5. 多集队列 1..N  

---

### Phase 9 — 多片型 + 云

1. mv/social/film cards  
2. 云鉴权与多项目  
3. Knowledge HTTP adapter  
4. 观测面板  

---

## 9. 测试矩阵（必须）

| 测试 | 断言 |
|---|---|
| next-action | 每 phase 有唯一动作 |
| prompt-authority | 三方不一致 409 |
| fake-knowledge-rejected | 假 cap/kn 失败 |
| real-knowledge-signoff | 真文件 ID 通过 |
| unit-auto-create | shots 后可 compile |
| video-formal-only | workflow 不默认 batch 视频 |
| e2e short_drama mock | start→owner→video 候选 |
| episode2-reuse | 同 media/version 绑定 |
| ledger-no-regression | 信息倒退 preflight 失败 |
| retake-local | 不重置 series library |
| formal node run blocked | 409 formal_generation_unit_required |

回归：全量 `npm test` / `npm run verify`。

---

## 10. 迁移与兼容

| 旧 | 策略 |
|---|---|
| 手动 CLI 全家桶 | 保留 |
| 旧 automation 查缺 | ORCH_V2 灰度 |
| 厚 cinematic skill | 附录，改 description |
| 无 series 老 production | `series wrap-legacy` |
| storyboard 视频 batch | 降级非 formal |
| 前缀假 kn 老数据 | 迁移扫描；无效 ref 标 stale |

---

## 11. 风险登记

| 风险 | 等级 | 对策 |
|---|---|---|
| 范围膨胀 | 高 | 锁定 short_drama + Ep 链 |
| Worker 乱写 | 高 | schema + 无出片权 |
| 会签形式化 | 中 | 真 ID + checks 非空 |
| 检索质量 | 中 | 一期规则检索 |
| Agent 仍越权 | 高 | skill + API 双强制 |
| 错误 promote | 中 | 像素 ACCEPT + Owner |
| 双路径回潮 | 高 | 单测锁死 formal-only |

---

## 12. 里程碑与人力

| 里程碑 | Phases | 可感结果 |
|---|---|---|
| **M0 基线** | P0 | 测试绿、问题钉死 |
| **M1 稳** | P1–P2 | 薄 skill + nextAction + 单 Prompt |
| **M2 不断链** | P3 | 自动 Unit + 视频单路径 |
| **M3 真专业** | P4 | 真知识会签 |
| **M4 能续集** | P5 | Ep2 服用资产 |
| **M5 像云端** | P6–P7 | brief 驱动 + 局部重做 |
| **M6 平台化** | P8–P9 | 多片型/云/观测 |

建议 1 名全职按序推进；**M1–M4 为不可再砍最小集**（否则仍达不到“别人云端 + 多集服用”）。

粗估日历（单人）: **约 8–12 周**到 M5；并行可压缩。

---

## 13. 立即开工顺序（第一行代码）

1. `NextAction` + `promptAuthority` 合同  
2. status 返回 nextAction；Draft status 修正  
3. prompt authority 测试  
4. `cinematic-advance`  
5. `skills/ununu-video` + 软链  
6. **unit-design-worker + video formal-only**  
7. Knowledge Port 真校验 + auto-signoff + 假 ID 测试  
8. Series/Library/Ledger + Ep1→Ep2 测试  
9. script/shot 自动施工  
10. review/retake/ledger commit  

---

## 14. 本地 Agent 标准操作闭环（改造完成后）

```text
用户: 做 8 集短剧，先拍第 1 集……
Agent:
  series create
  workflow cinematic-start --episode 1 --brief ...
  loop:
    status → 执行 nextAction
    owner_gate → 问用户 ACCEPT/REJECT
  episode 1 done → promote 资产
  cinematic-start --episode 2
  loop ...
  ledger-commit
```

Agent **永不**: 自己拆 13 阶段、手写 Provider Prompt、直读知识库、浏览器改生产、Ep2 重抽一张新脸。

---

## 15. 总公式（终极）

```text
终极 UnunuTV
  = LibTV/Flova 的生产线体验（编排、薄客户端、资产复用、局部重做）
  + Ununu 工业内核（合同、确定性编译、真 kn/cap、审片正典）
  + 跨集 Ledger（第 2/3 集状态不断裂）
  − 假全自动叙事、假知识前缀、视频双路径、外层自由导演
```

---

## 16. 开工确认清单

- [ ] 确认本文为唯一执行蓝本  
- [ ] 确认主 Skill 仅 `ununu-video`  
- [ ] 确认 Workers 非自由 Agent  
- [ ] 确认多集 SharedLibrary + Ledger 为一等需求  
- [ ] 确认一期 `short_drama`  
- [ ] 确认 Knowledge Root  
- [ ] 确认从 **Phase 1** 写代码  

**确认后执行指令**: `按终极方案 Phase 1 开始改代码`。

---

## 附录 A — 审计问题 → 方案条目映射

| 审计问题 | 方案位置 |
|---|---|
| 查缺不施工 | §4 流水线 + Workers + Phase 3/6 |
| 无 GenerationUnit 断链 | §4 unit_design + Phase 3 |
| 视频双路径 | §4.5 + Phase 3 |
| 假 cap/kn | §5.2 + Phase 4 |
| 无 nextAction | §3.4 + Phase 1 |
| 无多集复用 | §3.1–3.3 + Phase 5 |
| Draft 状态误导 | §3.5 + Phase 1 |
| 厚 skill 乱编排 | §5.5 + Phase 2 |

## 附录 B — 与旧文档关系

- 付费 `approvedPaid` 主路径清除：已在代码完成，本文默认 `provider_account`。  
- 机制审计结论：见 §0.3，本文所有 Phase 对症。  
- 旧 `20260723-unutv-platform-production-os-plan.md`：保留作历史；**冲突以本文为准**。
