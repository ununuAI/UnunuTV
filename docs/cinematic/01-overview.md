# 影视工业制片总览

本目录是 UnunuTV 影视生产领域的唯一权威正文。Skill、API、CLI 和 UI 只引用这些规则，不复制另一套模板。

## 生产链

```text
StoryProductionPacket
→ Owner review of current Story revision
→ VisualBible + CinematicShotSpec script planning
→ Owner review of every current Shot revision
→ optional risk-routed AssetAuthority / Director / storyboard / keyframe
→ GenerationUnit
→ optional VisualAnchorPolicy
→ ProfessionalContribution
→ CinematicPromptEnvelopeV2
→ model capability preflight
→ UnunuTV run
→ CinematicEvaluationRecord
→ evidence-backed knowledge feedback
```

顶层 `ununu-cinematic-production` 负责创作、专家路由、镜头与 Prompt；`ununu-unutv-operator` 只负责实体 ID、API/CLI、SQLite、Provider、轮询、素材落盘和验证。

## 长期不变量

- 剧本不是 Prompt，Prompt 不得删减剧作事实。
- 正式生产必须先审当前剧情 revision，再审当前分镜脚本 revision，最后才进入图像/视频视觉生产；后面的视觉质量不能补救上游剧情或分镜错误。
- Story 审查 target 为 `cinematic_story_revision / cinematic-story:<storyPacketId>:r<revision>`；Shot 审查 target 为 `cinematic_shot_revision / cinematic-shot:<shotId>:r<revision>`。只认同一 target 的最新 verdict；revision 改变后旧 ACCEPT 自动失效。
- 艺术镜头、生成单元、Provider 分段是三个对象。
- 故事板是可选锚点，`NONE` 是合法路线。
- 人物、场景和道具权威按风险建立，不是所有项目的固定门禁，也不等于故事板。
- 角色/场景/道具/故事板图片 Prompt 分别由 `ununu.character.v2`、`ununu.image.v2`、`ununu.storyboard.v2` 确定性编译。
- 一个生成单元可以包含多个艺术镜头。
- 一个艺术长镜头可以拆成多个连续 Provider 分段。
- 硬切不继承上一镜真实尾帧；同一长镜头续接才可使用真实尾帧。
- Prompt 内容、模型参数和参考图绑定分别存储、显示和提交。
- 专家只提供结构化贡献，单一确定性编译器生成最终 Prompt。
- UnunuTV 是唯一生产和 Provider 执行系统；ComfyUI 工作流只能作为来源证据，不进入产品运行链。
- 请求成功不等于成片通过；必须检查完整时间线。

## 路由

`direct` 用于孤立实验；`production` 用于需要剧作、连续性、审阅或长期资产权威的正式制作。`projectType` 支持电影、短片、剧集、短剧、广告、MV、纪录片、动画、预告片和社交视频。

## 权威边界

用户硬要求、锁定剧情、原始对白和已接受资产不能被专家、知识案例或模型优化覆盖。Owner 保留团队批准、创意品味、候选通过、付费生成、资产晋升、发布和破坏性删除权。

`production` 的 GenerationUnit compile/preflight 必须同时看到当前 Story 与所有 linked Shot 的最新 Owner ACCEPT。缺失时分别返回 `story_owner_acceptance_required`、`shot_script_owner_acceptance_required`；同 revision 后写 REJECT 会使旧 compilation 变成 `owner_story_shot_reviews` stale。手工 Prompt、专家会签、高分和 Provider capability 均不得覆盖。

同一门禁还必须在 AssetAuthority 图片生成、Storyboard 图片/视频批量派发之前执行。电影工业主路径使用 `billingMode:"provider_account"`，不读取项目预算、预算预留或 UI 付费批准；导入既有媒体可用于审计与修订，但不会因此获得 Story/Shot 接受或生产权威。
