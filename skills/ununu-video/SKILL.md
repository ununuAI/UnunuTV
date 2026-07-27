---
name: ununu-video
description: >
  Thin remote control for UnunuTV short-drama production using ONLY the existing
  UnunuTV CLI/API stack (project, node, production, story, bible, plan-script,
  authority, unit, storyboard, workflow cinematic-*). Do not call Provider APIs
  directly. Do not invent a second pipeline or call the legacy
  `produceShortDramaOnCanvas` use-case. Source of truth:
  /Users/zhangxiaohao/Ununu/ununuAI/ununu-unutv
---

# Ununu Video（只驱动已接好的 UnunuTV）

UnunuTV 已经接好画布、合同、分镜、GenerationUnit、automation、时间线。  
本 Skill **只把创作输入交给 UnunuTV 的 canonical cinematic workflow**，不在
Agent 侧重新编排、不生成第二套 Prompt/资产管线。

配对：

- 创意/合同：`ununu-cinematic-production`
- 执行/CLI：`ununu-unutv-operator`（或本 skill 直接打 CLI）

## Hard rules

1. 所有持久化变更走 `node apps/cli/src/index.mjs` 或 `http://127.0.0.1:4318`
2. 浏览器只读核对画布
3. 正式视频只走 `unit compile → preflight → run`（`billingMode: provider_account`）
4. 禁止手搓正式 Provider content prompt
5. 短剧 = 多镜 + 画布节点 + 合同；不是单次 5 秒 API
6. `workflow short-drama` / `workflow one-shot` 只能进入
   `startCinematicWorkflow → status.nextAction → advance`；禁止调用
   `produceShortDramaOnCanvas`、`node run` 或任何外部 Provider 脚本
7. Agent 只提交 brief、已批准资产/参考、Owner 决策和结构化参数；剧情、分镜、Prompt、
   参考绑定、Preflight、Provider、连续性、剪辑、渲染由 UnunuTV 持久化工作流负责
8. 缺少真实资产、参考图、合同或审核证据时必须返回 blocker；禁止占位图、猜角色、猜场景、
   自动 ACCEPT 或把图像参考静默降级成文生视频

## 两种合法输入模式

- **带资料**：通过 UnunuTV CLI/API 导入用户提供的角色、场景、道具媒体，建立精确
  `ReferenceBinding`（asset/version/media/checksum/controls/doesNotControl），再选择到对应故事板镜头。
- **无资料**：先由 UnunuTV 的结构化 StoryPacket、VisualBible、Shot 和 image_generation
  阶段生成故事板锚点，写回画布并显式选择 `storyboard_composition`，随后才进入视频 Prompt 编译。

两者都不是把参考图当首帧。普通语义参考只锁定身份、场景、拓扑、站位和材质；动作、时序、表演、
运镜、焦点、物理和剪辑由 Shot/GenerationUnit 合同负责。只有明确 `first_frame` 或
`first_last_frame` 才锁定时间边界，且按模型能力与合同禁止混用普通参考。缺少完整结构化剧情、
分镜或绑定时，canonical workflow 必须持久化 blocker；不得从 brief 自动写“主角/固定机位/占位对白”。

图像 Provider 回执也只是候选图，必须通过画布故事板选择与像素评审后才可作为视频语义锚点；视频回执
只能是 candidate，真实最新 `CinematicEvaluationRecord` 之前不得进入连续性、时间线、渲染或交付。

## 推荐入口（已接好栈的薄编排）

```bash
cd /Users/zhangxiaohao/Ununu/ununuAI/ununu-unutv

# 创建项目/剧本源节点并启动 UnunuTV canonical workflow；只推进到可验证门禁
node apps/cli/src/index.mjs workflow short-drama \
  --brief "开场。冲突。钩子。" \
  --title "第1集" \
  --duration 60 \
  --dry-run

# 正式运行仍由 UnunuTV automation 的 nextAction 循环推进
node apps/cli/src/index.mjs workflow short-drama \
  --brief "…" --title "…" --duration 60

# 读取并执行唯一的工作流动作；不要自行猜下一步
node apps/cli/src/index.mjs workflow cinematic-status --project P
node apps/cli/src/index.mjs workflow cinematic-advance --project P
```

以上入口内部由 UnunuTV **只调用**已有能力（见返回字段 `uses[]` + `productChecklist`）：

```text
createProject / createNode / connectEdge / updateNode
createAsset / addAssetVersion / importMedia          # 角色像素资产
createCinematicProduction / createScriptRow
saveStoryPacket / saveVisualBible
planCinematicFromScript / reviewTarget
deriveAssetAuthoritiesFromStory
setStoryboardShotMedia / selectStoryboardImageForVideo  # 分镜图 → i2v 参考
ensureGenerationUnits / updateGenerationUnit(image_reference)
autoSignoffGenerationUnit
compileGenerationUnit / preflightGenerationUnit / runGenerationUnit
importStoryboardToTimeline / createRenderJob / createDeliveryPackage
createSeries / promoteSeriesAsset / bindSharedAssetsForEpisode  # 多集复用
startCinematicWorkflow / getCinematicWorkflowStatus / advanceCinematicWorkflow
```

画布逐步展开（LibTV 风格列）：剧本 → 剧情/圣经 → 角色资产 → 分镜表 → 分镜图×N → 视频×N → 合成 → 交付。

`productChecklist`：characterPixels / storyboardFrames / imageReferenceVideo / multiShot / canvasProgressive / seriesPromote

`workflow one-shot` 仅作兼容别名，内部改道 canonical cinematic workflow；
它不再进入旧的短剧画布管线。`produceShortDramaOnCanvas` 是已封存的内部旧实现，
Agent、CLI、API 都不得调用；`oneShotCinematicEpisode` 仍返回 410。

## 手搓现成 CLI 路径（与上面等价）

```bash
# 1 画布
node apps/cli/src/index.mjs project create --title "短剧"
node apps/cli/src/index.mjs node add --project P --canvas C --kind script --title 剧本 --x 80 --y 120
node apps/cli/src/index.mjs node add --project P --canvas C --kind videoShot --title 镜01 --x 720 --y 120 --payload '{"generationStatus":"ready"}'

# 2 制片
node apps/cli/src/index.mjs production create --project P --source-node SCRIPT --data '{"title":"第1集","projectType":"short_drama"}'

# 3 合同
node apps/cli/src/index.mjs story save --project P --production PR --data '{...StoryProductionPacket}'
node apps/cli/src/index.mjs bible save --project P --production PR --data '{...VisualBible}'

# 4 剧本行 → 分镜
# createScriptRow via script document / or:
node apps/cli/src/index.mjs production plan-script --project P --production PR --source-node SCRIPT

# 5 资产权威
node apps/cli/src/index.mjs authority derive --project P --production PR

# 6 Owner 验收 story/shot revision（正式 preflight 需要）
node apps/cli/src/index.mjs workflow owner-decide --project P --data '{"targetType":"cinematic_story_revision","targetId":"...","state":"accepted"}'

# 7 Unit
node apps/cli/src/index.mjs unit design --project P --production PR --data '{"generationStrategies":{"video_generation":{"provider":"ark","model":"doubao-seedance-2-0-mini-260615","executionNodeId":"VIDEO"}}}'
node apps/cli/src/index.mjs unit auto-signoff --project P --production PR --unit U
node apps/cli/src/index.mjs unit compile --project P --production PR --unit U
node apps/cli/src/index.mjs unit preflight --project P --production PR --unit U
node apps/cli/src/index.mjs unit run --project P --production PR --unit U

# 8 工作流状态机（画布 automation 面板）
node apps/cli/src/index.mjs workflow cinematic-start --project P --production PR --source-node SCRIPT --target-duration 60
node apps/cli/src/index.mjs workflow cinematic-status --project P
node apps/cli/src/index.mjs workflow cinematic-advance --project P
```

## UI

```bash
npm run dev   # http://127.0.0.1:4318
```

看：主画布节点、Cinematic 工作区合同、Automation 13 阶段任务流、时间线。

## Done report

projectId, canvasId, productionId, shotCount, unit ids, mediaIds on video nodes, automationRunId, nextAction, blockers.  
说明：用的是 **UnunuTV 现成栈**，不是外挂生视频 API。
