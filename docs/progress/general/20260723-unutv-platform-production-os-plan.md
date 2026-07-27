# UnunuTV 平台化制片 OS —— 完整开发方案

**文档版本**: 1.0.0  
**日期**: 2026-07-23  
**状态**: 执行蓝本（替代此前零散改造讨论，作为后续实现唯一总纲）  
**范围**: `/Users/zhangxiaohao/Ununu/ununuAI/ununu-unutv` + 统一知识库接入 + 本地薄 Skill  

---

## 0. 一句话目标

```text
本地薄 Skill（遥控器）
    → 云端/本地 UnunuTV 平台编排
    → 合同 + 知识会签 + 确定性编译 + Provider
    → 单集稳定出片，多集资产复用、状态可继承
```

**不是**再给本地 Agent 一本更厚的电影百科。  
**而是**把 UnunuTV 建成类似 LibTV/Flova 的**会自己干活的制片 OS**，同时保留你们已有的工业合同与 kn/cap 优势。

---

## 1. 问题诊断

### 1.1 别人为什么“标准”

| 层 | LibTV / Flova | 作用 |
|---|---|---|
| 外层 Agent/Skill | 很薄（传话/聊天入口） | 禁止乱编排 |
| 平台编排 | 云端状态机 + Agent/Skill 手册 | 默认流水线推进 |
| 专业能力 | Skill Hub / skill.md / 模型路由 | 封装在平台内 |
| 资产 | 项目/角色库可复用 | 第 2、3 集不换脸 |
| 出片 | 平台唯一出口 | 可局部重做 |

### 1.2 我们现在为什么乱

| 已有（强） | 缺口（弱） |
|---|---|
| Story/Shot/Unit 合同与 revision | 默认流水线自动施工 |
| 确定性 Prompt 编译 | `nextAction` 机器可读编排 |
| Provider 网关与门禁 | Knowledge Port（自己取 kn/cap） |
| 会签校验（验门票） | Expert Worker（自动买票写会签） |
| 镜间 `carryForwardState` | 集间 SeriesLedger + 共享资产库 |
| 厚 cinematic skill | 薄主入口 skill |
| workflow 13 阶段骨架 | 阶段从“查缺报错”变为“能做就做” |

### 1.3 结论（方案立场）

- **整盘路线没有错**（平台化 + 合同 + 编译 + 知识）。  
- **落地形态偏了**：专业规范堆在外层 Agent，平台缺“生产线层”。  
- **多集/资产复用必须一等公民**，否则永远达不到别人云端效果。  
- **Workers ≠ 自由大模型 Agent**：编排与编译用代码；仅合同起草类工序可调 LLM 且受 schema 约束。

---

## 2. 成功标准

### 2.1 产品体验

1. 用户/本地 Agent 只需：`start → advance 循环 → Owner 门点头 → 成片或唯一 blocker`。  
2. 同一 brief 两次跑：阶段顺序稳定，正式 Prompt `payloadHash` 稳定。  
3. 禁止多版 Prompt 争权威；禁止 production 节点旁路 `node run`。  
4. 第 1 集 ACCEPT 的角色/场景进入共享库；第 2/3 集默认复用，不无故换脸换景。  
5. 失败默认**局部重做**（单 Unit/单资产），不是整剧盲抽。

### 2.2 可量化指标（上线后观测）

| 指标 | 目标（短剧 v1） |
|---|---|
| 旁路 formal 出片次数 | 0 |
| Prompt authority mismatch | 0（正式路径） |
| 单次 run 使用的 prompt 版本数 | 1 |
| Ep2 资产复用率（reference 来自 library） | ≥ 70% |
| 整剧级无差别重抽占比 | 显著下降（相对改造前基线） |
| status 含合法 nextAction 比例 | 100% |

### 2.3 非目标

- 不复制 LibTV/Flova 私有实现。  
- 不一期做完整多租户计费/商业化账号体系。  
- 不取消 kn/cap 与 Owner 创意门去换纯黑盒抽卡。  
- 不在 UnunuTV 内做可自由工具调用的“第二 Codex”。  
- 不一期并行做完所有片型精品模板（先短剧连载，再扩）。

---

## 3. 目标架构

```text
┌──────────────────────────────────────────────┐
│ 本地客户端                                    │
│  Skill: ununu-video（唯一主入口，薄）          │
│  Codex / Grok / Claude 只调 CLI 或 HTTP API   │
└────────────────────┬─────────────────────────┘
                     │ loopback / 未来云 HTTPS
                     ▼
┌──────────────────────────────────────────────┐
│ UnunuTV Application                          │
│                                              │
│  Controllers (API / CLI)                     │
│           │                                  │
│           ▼                                  │
│  ┌────────────────────┐                      │
│  │ Orchestrator       │  纯代码状态机         │
│  │ + nextAction       │  调度 phase handlers │
│  └─────────┬──────────┘                      │
│            │                                 │
│   ┌────────┼──────────┬─────────────┐        │
│   ▼        ▼          ▼             ▼        │
│ Workers  Knowledge  Compiler     Provider    │
│ (受控)   Port       (确定性)     Gateway     │
│   │        │                                 │
│   │        └──► 统一知识库 cap-*/kn-*         │
│   │                                          │
│   └──► 写合同: Story/Shot/Unit/Contribution/ │
│        Ledger/SharedAssets/Evaluation        │
│                                              │
│  SQLite + Media + Reviews（唯一生产真相）     │
└──────────────────────────────────────────────┘
```

### 3.1 组件职责表

| 组件 | 形态 | 调 LLM？ | 职责 |
|---|---|---|---|
| 本地 `ununu-video` | Skill | 否（编排权） | start/status/advance/owner |
| Orchestrator | 代码 | 否 | 阶段推进、nextAction、禁跳步 |
| Genre Card | 配置 | 否 | 短剧/电影/MV/自媒体差异 |
| Knowledge Port | 适配器 | 否 | 检索 cap/kn |
| Script/Shot/Expert/Review/Series Workers | 工序模块 | 可选 | 只填规定 schema |
| Compiler / Preflight | 已有 core | 否 | 唯一 Prompt 与门禁 |
| Provider Gateway | 已有 | 否 | 唯一出片 |
| Shared Asset Library | 新合同+存储 | 否 | 跨集复用 |
| Series Continuity Ledger | 新合同+存储 | 否 | 跨集状态/伏笔/道具 |

### 3.2 铁律（改造宪法）

1. **唯一生产真相**：UnunuTV 项目状态；聊天不算状态。  
2. **唯一 Prompt 权威**：PromptDraft → Envelope → Provider，三方一致。  
3. **唯一执行入口**：正式出片只走 Unit compile/preflight/run 或 workflow 代跑。  
4. **唯一编排入口**：workflow start + status.nextAction + advance。  
5. **本地 Skill 只做遥控器**：禁止直查知识库、禁止手搓正式 Prompt、禁止浏览器写生产。  
6. **知识必须落会签**：kn/cap 不进 `ProfessionalContribution` 不算用过。  
7. **一处失败一动作**：blocked 只给一个 nextAction。  
8. **多集资产默认可复用**：Ep2+ 优先 shared library，禁止无故新身份母版。  
9. **Worker 无编排权、无出片权**：只能被 Orchestrator 调用。  
10. **片型可扩展、内核不分裂**：换 Genre Card，不换 OS。

---

## 4. 领域模型

### 4.1 系列 / 集 / 生产（三层）

```text
SeriesProject
  seriesId
  title
  contentType          # short_drama | episodic_series | ...
  sharedAssetLibraryId
  ledgerId
  episodeIds[]
  createdAt / updatedAt

EpisodeRecord
  episodeId
  seriesId
  episodeNumber        # 1,2,3...
  productionId         # 现有 cinematic production
  title / brief
  entryLedgerRevision
  exitLedgerRevision | null
  status               # draft|running|blocked|delivered|failed
  workflowRunId | null

CinematicProduction（已有）
  一集一条生产合同链：Story/Bible/Shots/Units/...
```

**规则**：从第 1 集就创建 Series（即使只打算拍 1 集），避免续集时资产散落。

### 4.2 共享资产库 SharedAssetLibrary

```text
SharedAssetLibrary
  libraryId
  seriesId
  entries[]:
    entryId
    kind                 # character|scene|prop|voice|costume_variant
    displayName
    authorityId          # 现有 AssetAuthority
    acceptedMediaId
    acceptedVersionId
    freeze               # true=后续集禁止静默重画身份
    promoteEpisodeId     # 从哪一集晋升
    status               # candidate|accepted|deprecated
```

**复用优先级**

```text
1) library 中 accepted + freeze/identity
2) 合法 variant（换装/受伤，派生自同一 characterId）
3) 仅当不存在时新建，并在像素 ACCEPT 后 promote
```

**禁止**

- 同角色无故新脸  
- 未 promote 的临时图默认带入下一集  
- 用“重抽更美”覆盖 freeze 母版  

### 4.3 跨集账本 SeriesContinuityLedger

镜间已有 `carryForwardState`；集间需要更高层账本：

```json
{
  "ledgerId": "ledger-...",
  "seriesId": "series-...",
  "revision": 3,
  "characters": {
    "char-hero": {
      "authorityId": "auth-...",
      "acceptedLookVersionId": "ver-...",
      "state": {
        "injury": "右腕包扎",
        "costume": "红大衣",
        "knownFacts": ["已知仇人身份"]
      }
    }
  },
  "props": {
    "prop-knife": { "owner": "char-hero", "condition": "染血", "location": "scene-alley" }
  },
  "plot": {
    "promisesOpen": ["第3集揭晓信封"],
    "revealedFacts": ["男二是卧底"],
    "forbiddenEarlyInfo": ["真凶是姐姐"]
  },
  "world": {
    "timeProgress": "夜→凌晨",
    "activeSceneAuthorityIds": ["auth-scene-alley"]
  },
  "sourceEpisodeId": "ep-01",
  "updatedAt": "..."
}
```

**规则**

- 开 Ep N：`entryLedger = latest committed revision`  
- Ep N 交付且关键 takes ACCEPT：`commit` → revision+1  
- Story/Shot preflight：不得违反 `revealedFacts` / `forbiddenEarlyInfo` / 角色状态继承  

### 4.4 NextAction（机器可读）

```json
{
  "actionId": "na-...",
  "type": "advance|run_worker|owner_gate|repair|wait_provider|promote_asset|commit_ledger|done|failed",
  "phase": "shot_design",
  "episodeNumber": 2,
  "worker": "shot_worker|null",
  "command": {
    "cli": "ununu-unutv workflow cinematic-advance --project P --automation-run R",
    "method": "POST",
    "path": "/api/projects/P/cinematic-workflow/advance"
  },
  "blocker": {
    "code": "shot_owner_acceptance_required",
    "message": "...",
    "targetType": "cinematic_shot",
    "targetId": "shot-...",
    "revision": 3
  },
  "ownerGate": {
    "required": true,
    "reviewType": "cinematic_shot_revision",
    "targetId": "cinematic-shot:shot-...:r3"
  },
  "promptAuthority": {
    "compilationId": "...",
    "payloadHash": "...",
    "status": "missing|draft|preflight_ready|stale|dispatched"
  },
  "assetReuse": {
    "libraryId": "...",
    "boundEntryIds": ["..."],
    "missingRequired": []
  },
  "idempotencyKey": "..."
}
```

### 4.5 Prompt 单权威链

```text
结构化合同 (+ 会签 + 共享资产绑定)
  → PromptDraft
  → lint / preflight
  → Envelope (payloadHash)
  → Provider request（必须等于 Envelope）
  → Run 持久化
```

不一致 → `prompt_authority_mismatch`（409 fail-closed）。

### 4.6 Genre Card

路径：`packages/contracts/src/genre-cards/`

| contentType | 要点 |
|---|---|
| `short_drama` | 9:16、钩子、连载、资产强复用、ledger 必开 |
| `episodic_series` | 同短剧，集更长/更强跨集约束 |
| `music_video` | 节拍卡点、少对白、可弱化对白连续性 |
| `social_video` | 前 3 秒、字幕、快切 |
| `short_film` / `feature_film` | 16:9、强连续性、长镜头续拍 |

一期只完整实现 `short_drama`（含多集）；其它先挂 card 接口与默认值。

---

## 5. 默认流水线

### 5.1 系列级

```text
series.create
  → shared library + empty ledger
  → episode 1..N 占位（或按需创建）
```

### 5.2 单集 13 阶段（与现网 phase 名对齐，语义改为可施工）

| # | phase | 自动 | Owner 门 | 产物 |
|---|---|---|---|---|
| 1 | script_analysis | brief→Story 草稿；Ep2+ 读 ledger | Story ACCEPT | Story rN |
| 2 | block_planning | script rows / breakdown | 可选 | breakdown |
| 3 | visual_bible | 最小 Bible；系列可继承 | 可选 | Bible |
| 4 | asset_design | **优先 bind library**；缺则生成候选 | 新资产像素 ACCEPT + promote? | Authority/绑定 |
| 5 | shot_design | 规划 shots；绑定共享参考 | 每镜 ACCEPT | Shots |
| 6 | prompt_compile | 建 Unit + **自动会签** + compile/preflight | 否 | Envelope ready |
| 7 | image_generation | 仅缺的本集关键静帧 | 高风险像素 ACCEPT | media |
| 8 | video_generation | unit run（provider_account） | 否 | 视频候选 |
| 9 | sound_design | 有策略则生成，否则 skip/import | 否 | 音频 |
| 10 | continuity_qa | evaluation；硬 veto | 创意 take ACCEPT | Evaluation |
| 11 | timeline_edit | 装配已 ACCEPT 片段 | 否 | Timeline |
| 12 | candidate_render | render | 否 | master |
| 13 | delivery_qc | QC；**ledger commit** | 交付确认 | package + ledger |

### 5.3 Ep2 / Ep3 差异（关键）

开集时 Orchestrator **必须**：

1. 绑定 `seriesId` + `sharedAssetLibraryId`  
2. 载入 `entryLedgerRevision`  
3. Story 草稿注入：继承角色状态、已揭示事实、禁止提前信息  
4. 所有角色/场景 shot 默认 `referenceBindings` 指向 library accepted media  
5. `freeze` 资产禁止重新 authority image run 覆盖  
6. 仅对本集新增实体走生成  
7. 集末 `commit_ledger`  

### 5.4 失败策略

| 类型 | 策略 |
|---|---|
| 技术 preflight 失败 | repair nextAction，不调 Provider |
| Provider 未知结果 | 禁止自动重发，reconcile |
| 质量 veto（穿模/空间/身份） | 局部 retake 同 Unit |
| Owner REJECT | 停在 owner_gate，保留证据 |
| 资产复用缺失 | `reuse_binding_required`，禁止裸奔生成 |
| 跨集信息倒退 | preflight 失败 |

---

## 6. 模块设计

### 6.1 Orchestrator

```text
packages/core/src/orchestration/
  orchestrator.mjs
  next-action.mjs
  failure-policy.mjs
  phase-handlers/
    script-analysis.mjs
    block-planning.mjs
    visual-bible.mjs
    asset-design.mjs
    shot-design.mjs
    prompt-compile.mjs
    image-generation.mjs
    video-generation.mjs
    sound-design.mjs
    continuity-qa.mjs
    timeline-edit.mjs
    candidate-render.mjs
    delivery-qc.mjs
  series/
    open-episode.mjs
    bind-shared-assets.mjs
    commit-ledger.mjs
```

改造：

- `getCinematicWorkflowStatus` → 附带 `nextAction` / `promptAuthority` / `assetReuse`  
- 新增 `advanceCinematicWorkflow`  
- 重写 `automation-executor` 中纯查缺逻辑为 handler.ensure()  

Feature flag：`UNUTV_ORCH_V2=1`（新 start 默认开）。

### 6.2 Knowledge Port

```text
packages/core/src/ports/knowledge-port.mjs
packages/local-runtime/src/knowledge-file-adapter.mjs
```

```js
retrieveKnowledge({ risks, roles, departments, limit, status })
getKnowledgeByIds(ids)
```

一期：读

- `统一知识库/专家/能力模块/cap-*.json`  
- `统一知识库/正式知识/知识原子/kn-*.json`  

配置：`UNUTV_KNOWLEDGE_ROOT`  
二期：HTTP/向量检索，接口不变。

### 6.3 Workers（受控工序）

```text
packages/core/src/workers/
  worker-runtime.mjs      # schema、超时、审计、禁递归编排
  llm-port.mjs            # 可选，可 null
  script-worker.mjs
  shot-worker.mjs
  expert-worker.mjs
  review-worker.mjs
  series-bootstrap-worker.mjs
  asset-reuse-binder.mjs
  asset-variant-worker.mjs
  ledger-commit-worker.mjs
```

| Worker | 输入 | 输出 | LLM |
|---|---|---|---|
| script | brief + entryLedger | Story 草稿 | 可选 |
| shot | accepted Story | Shots + storyboard | 可选 |
| expert | unit/shots + risks | Contribution(cap+kn) + 字段补丁 | 一期模板，二期 LLM |
| review | media/run | Evaluation 草稿 + veto | 一期规则，二期视觉 |
| series-bootstrap | title/type/episodes | Series+Library+Ledger | 否 |
| asset-reuse-binder | library + shots | referenceBindings | 否 |
| variant | identity + change | 新 version，同 character | 可选 |
| ledger-commit | episode accepts | ledger revision+1 | 否 |

**Worker 禁令**：不调 Provider 出片、不改 phase、不调其他 worker 做编排、输出必须过 schema。

### 6.4 Compiler / Provider / Review（增强已有）

- 保持确定性编译。  
- formal run 校验 draft==envelope==request。  
- Canvas 只渲染 effective reference manifest。  
- retake API 只作用于指定 unit。  
- evaluation 可引用 `cap-episodic-continuity` 等。  

### 6.5 本地 Skill

```text
skills/ununu-video/
  SKILL.md                      # ≤80 行主循环
  references/next-action-loop.md
  references/owner-gates.md
  references/series-episodes.md
  agents/openai.yaml
```

主循环：

```text
1. series create / open（如需要）
2. workflow cinematic-start (--series --episode)
3. loop:
     cinematic-status → 执行 nextAction.command
     owner_gate → 停问用户
     failed → 报告 blocker，禁止换路径
4. done → 展示成片 + library/ledger 摘要
```

降级：

- `ununu-cinematic-production`：服务端/人工附录，非主入口  
- `ununu-unutv-operator`：运维命令字典  

安装软链到 `~/.codex/skills` 与 `~/.grok/skills`。

---

## 7. API 与 CLI

### 7.1 Series

```text
POST   /api/series
GET    /api/series/:seriesId
POST   /api/series/:seriesId/episodes
GET    /api/series/:seriesId/assets
POST   /api/series/:seriesId/assets/promote
GET    /api/series/:seriesId/continuity-ledger
POST   /api/series/:seriesId/continuity-ledger/commit
```

### 7.2 Workflow

```text
POST /api/projects/:projectId/cinematic-workflow/start
  { productionId?, seriesId?, episodeNumber?, sourceNodeId, contentType,
    brief, targetDurationSeconds, generationStrategies? }

GET  /api/projects/:projectId/cinematic-workflow/status
  → { workflowManifest, run, tasks, nextAction, promptAuthority, assetReuse, agentContext }

POST /api/projects/:projectId/cinematic-workflow/advance
  { automationRunId?, idempotencyKey }

POST /api/projects/:projectId/cinematic-workflow/owner-decision
  { targetType, targetId, state, note }
```

### 7.3 Knowledge / Experts / Retake

```text
POST /api/knowledge/retrieve
POST /api/projects/:projectId/cinematic-productions/:productionId/experts/auto-signoff
POST /api/projects/:projectId/cinematic-productions/:productionId/generation-units/:unitId/retake
```

### 7.4 CLI 对照

```bash
ununu-unutv series create --title "..." --content-type short_drama --episodes 8
ununu-unutv series assets --series ID
ununu-unutv series promote-asset --series ID --data '{...}'
ununu-unutv series ledger --series ID
ununu-unutv series ledger-commit --series ID --episode 2

ununu-unutv workflow cinematic-start \
  --project P --series S --episode 2 --source-node N \
  --content-type short_drama --target-duration 60 \
  --data '{"brief":"..."}'

ununu-unutv workflow cinematic-status --project P
ununu-unutv workflow cinematic-advance --project P
ununu-unutv workflow owner-decide --project P --data '{...}'

ununu-unutv knowledge retrieve --data '{"risks":["continuity"]}'
ununu-unutv contribution auto-signoff --project P --production PR --unit U --roles continuity,cinematography
ununu-unutv unit retake --project P --production PR --unit U --data '{...}'
```

---

## 8. 仓库落点

```text
packages/contracts/src/
  next-action-contracts.mjs
  series-contracts.mjs
  shared-asset-library-contracts.mjs
  continuity-ledger-contracts.mjs
  worker-contracts.mjs
  genre-cards/*.json
  schemas/*（同步）

packages/core/src/
  orchestration/**
  workers/**
  ports/knowledge-port.mjs
  use-cases/cinematic-workflow-use-cases.mjs   # 扩展
  use-cases/series-use-cases.mjs              # 新建
  use-cases/automation-executor-use-cases.mjs # 改造
  use-cases/application.mjs                   # 组装

packages/local-runtime/src/
  knowledge-file-adapter.mjs
  series-adapter.mjs
  shared-asset-adapter.mjs
  continuity-ledger-adapter.mjs
  index.mjs

apps/api/src/
  series-routes.mjs
  knowledge-routes.mjs
  cinematic-workflow-routes.mjs  # advance/owner/status 扩展

apps/cli/src/index.mjs

skills/ununu-video/**

tests/
  next-action.test.mjs
  prompt-authority.test.mjs
  knowledge-port.test.mjs
  expert-auto-signoff.test.mjs
  series-shared-assets.test.mjs
  episode2-asset-reuse.test.mjs
  ledger-continuity.test.mjs
  workflow-short-drama-e2e.test.mjs
  workflow-episode-chain.test.mjs
```

---

## 9. 分阶段交付

### Phase 0 — 基线冻结（2–3 天）

- 全量测试绿档  
- 旁路出片清单备案  
- 锁定 v1：`short_drama` + 多集  

**验收**：`npm test` 通过；本文件确认为执行蓝本。

---

### Phase 1 — Prompt 单权威 + NextAction（5–7 天）

1. NextAction / promptAuthority 合同  
2. `cinematic-status` 返回 nextAction  
3. formal run 三方一致 fail-closed  
4. 单测  

**验收**

- [ ] status 100% 含 nextAction  
- [ ] 节点手改 prompt 不影响 formal envelope 派发内容  
- [ ] mismatch → 409  

---

### Phase 2 — 薄 Skill + Advance（3–5 天）

1. `skills/ununu-video`  
2. `workflow cinematic-advance`  
3. advance 先串确定性阶段（compile/preflight/poll）  
4. owner_gate 返回  
5. softlink Codex/Grok  

**验收**

- [ ] 合同齐备时，仅 advance 循环可推进到 mock video  
- [ ] skill 禁令完整  

---

### Phase 3 — Knowledge Port + 自动会签（5–8 天）

1. file Knowledge Port  
2. `knowledge retrieve`  
3. `experts/auto-signoff`（模板，无 LLM 可过门）  
4. `prompt_compile` 阶段自动会签  
5. 接入 `cap-episodic-continuity` 等  

**验收**

- [ ] 不经本地写 kn，preflight 过 knowledge-grounded 门  
- [ ] Contribution 含真实 cap/kn ID 与 revision 绑定  

---

### Phase 4 — Series / Shared Library / Ledger（7–10 天）**【多集核心】**

1. Series / Episode / Library / Ledger 合同与持久化  
2. series API/CLI  
3. Ep1 结束 promote 资产  
4. Ep2 start 自动 bind library + entry ledger  
5. freeze 身份禁止覆盖  
6. 测试 Ep1→Ep2 同 mediaId/version  

**验收**

- [ ] Ep2 compile references 默认来自 library  
- [ ] 无故新脸被拒  
- [ ] ledger 信息倒退 preflight 失败  
- [ ] `assetReuseRate` 可统计  

---

### Phase 5 — 上游自动施工（7–10 天）

1. Script Worker（读 entry ledger）  
2. Shot Worker（复用 planCinematicFromScript + bind assets）  
3. VisualBible 最小草稿 / 系列继承  
4. Owner 门：story + shots（+ 新资产像素）  

**验收**

- [ ] 仅 brief + start，可自动推到 Shot Owner ACCEPT  
- [ ] Ep2 brief 不会丢掉 Ep1 角色状态约束  

---

### Phase 6 — 视频后链路与局部重做（5–8 天）

1. Review Worker 骨架  
2. veto → unit retake  
3. timeline 只收 ACCEPT  
4. delivery 时 ledger commit  
5. 禁止未知结果盲重试  

**验收**

- [ ] REJECT 不进入 timeline  
- [ ] retake 不重置 series library  
- [ ] Ep 交付后 ledger revision+1  

---

### Phase 7 — 增强（并行，2 周+）

1. 可选 LLM port（可关；关闭时模板降级仍可用）  
2. variant 换装/受伤派生  
3. dense-video-analysis 或规则加强穿模/空间  
4. camera plan 结构化强化  
5. 多集批量：`episodes 1..N` 队列  

---

### Phase 8 — 多片型 + 云形态（后期）

1. mv / social / film genre cards  
2. 云 API 鉴权与多项目  
3. Knowledge HTTP adapter  
4. 观测面板：跑通率、复用率、重抽次数、mismatch  

---

## 10. 测试计划

### 10.1 单测

- next-action 映射  
- prompt authority  
- knowledge 过滤  
- auto-signoff  
- library promote/bind/freeze  
- ledger inherit/commit/conflict  

### 10.2 集成

- short_drama 单集 happy path（mock provider）  
- owner reject 停门  
- preflight fail 不 run  
- provider unknown 不重发  
- **Ep1→Ep2 资产复用**  
- **Ep2 信息倒退失败**  
- retake 局部性  

### 10.3 人工剧本

1. 创建 8 集短剧系列  
2. Ep1 brief 出片，角色/场景 promote  
3. Ep2 start，确认同脸同景绑定  
4. Ep2 只生成新镜头  
5. 提交 ledger，Ep3 继承状态  

---

## 11. 迁移与兼容

| 旧能力 | 策略 |
|---|---|
| 手动全量 CLI | 保留 |
| 旧 automation 查缺 | flag 灰度替换 |
| 厚 cinematic skill | 保留为附录 |
| 无 series 的老 production | 可 `series import-legacy` 包一层 |
| provider_account 主路径 | 保持；legacy_budget 可选 |

---

## 12. 风险与对策

| 风险 | 对策 |
|---|---|
| Worker 乱写 | schema + 白名单 + 测试 |
| 自动会签形式化 | 要求 checks/fieldChanges；高风险再 LLM |
| 检索不准 | 一期规则检索；可人工 override |
| 范围膨胀 | 锁定 short_drama + Ep 链 |
| 本地 Agent 仍越权 | skill 禁令 + API formal 强制 |
| 资产错误 promote | promote 必须像素 ACCEPT + Owner |

---

## 13. 人力与里程碑

| 里程碑 | 含 Phase | 可感结果 |
|---|---|---|
| **M1 稳** | P0–P2 | 单权威 Prompt + nextAction + 薄 skill |
| **M2 专业在线** | P3 | 平台自取知识并会签 |
| **M3 能续集** | P4 | Ep2 复用脸与景 |
| **M4 像云端** | P5–P6 | brief 起步自动推进 + 局部重做 + ledger |
| **M5 平台化** | P7–P8 | 多片型/云/观测 |

建议全职 1 人顺序推进；M1+M2+M3 为不可再砍的最小云端体验集。

---

## 14. 立即开工顺序（第一行代码起）

1. contracts: `NextAction` + `promptAuthority`  
2. status API 返回 nextAction  
3. prompt authority 测试  
4. `cinematic-advance`（确定性阶段）  
5. `skills/ununu-video`  
6. Knowledge Port + auto-signoff  
7. **Series / SharedLibrary / Ledger 合同与 Ep1→Ep2 绑定测试**  
8. Script/Shot handlers 替换查缺  
9. Review/retake/ledger commit  
10. 可选 LLM 与多片型  

---

## 15. 总公式

```text
别人云端效果
  = 默认流水线
  + 平台内编排
  + 资产复用（第2/3集）
  + 薄客户端

你们的增量壁垒
  = 合同 revision
  + 确定性编译
  + kn/cap 会签
  + 实拍审片与正典
  + 跨集 Ledger
```

```text
最终
  = 别人的生产线体验
  + 你们的工业内核
  + 多集资产与连续性
```

---

## 16. 文档维护

- **本文**为执行总纲；实现偏离须先改本文再改代码。  
- 阶段完成时在本文 Phase 勾选并写 progress 子记录。  
- 相关旧讨论（付费门清除、skill 审核、LibTV/Flova 对比）以本文收敛结论为准。  

---

## 17. 审批检查表（开工前）

- [ ] 确认主入口仅为 `ununu-video`  
- [ ] 确认 Workers 非自由 Agent  
- [ ] 确认多集 SharedLibrary + Ledger 为一等需求  
- [ ] 确认一期片型 `short_drama`  
- [ ] 确认 Knowledge Root 路径  
- [ ] 确认从 Phase 1 代码开工  

**签字/确认后，下一条实现指令应为：`按 Phase 1 开始改代码`。**
