# 专家路由与冲突解决

TaskContract 先做复杂度与风险分析，再生成 TeamManifest 候选，由宿主主 Agent/Owner 批准。基础团队覆盖影视制片统筹、导演、Prompt 编译和连续性监督。

按风险增加：

- 对白/微表情：表演导演、声音设计；
- 复杂摄影：摄影指导、灯光、色彩；
- 多镜头请求：剪辑、连续性；
- 打斗追逐：动作指导、物理/VFX；
- 古装/复杂世界：美术、服装妆发、世界观；
- 广告：广告创意和产品证明；
- MV：音乐与节奏剪辑；
- 纪录片：事实边界、观察摄影和真实声音。

专家只提交 `ProfessionalContribution`：角色/ExpertPack、目标、诊断、选定权衡、结构化字段、硬约束、否决、知识引用、验收标准和 revision。专家无权调用付费 Provider，也不能携带 `finalPrompt`。

## 知识进入生产的硬条件

“读过资料”“引用 Skill/文档路径”或“该角色以前对整个 production 提过意见”都不等于当前镜头会签。每份正式贡献必须同时满足：

1. `knowledgeRefs` 至少包含一个适用的 `cap-*` 能力 ID 和一个有来源证据的 `kn-*` 知识原子；文档路径只能补充 lineage，不能替代正式知识引用。
2. `targetType/targetId/structuredFields.targetRevision` 精确指向当前 `CinematicShotSpec` 或 `GenerationUnit`；GenerationUnit 贡献还必须写当前 `sourceGenerationUnitRevision` 和完整 `sourceShotRevisions`。
3. 写明 `sourceStoryPacketRevision` 与 Owner 已批准的 `teamManifestId`。
4. 贡献必须把方法转成镜头合同字段、权威绑定、动作/空间状态、剪辑边界或像素/全时间线验收项，不能只留下审美形容词和泛化建议。
5. 任一覆盖对象或 TeamManifest 更新后，旧贡献立即 stale；production 级意见只能做规划背景，不能满足付费逐镜门禁。

正式 GenerationUnit 必须打开 `requireTeamManifest`、`requireCurrentArtifactSignoff`、`requireKnowledgeGroundedSignoff`、`requireManifestBoundSignoff`。缺失、过期、只引文档或未绑定 Manifest 时，预检必须失败。详见 `09-knowledge-to-shot-execution.md`。

## Think 会审与专业 Agent 的阶段门

`think`/Deep MoA 是外部多模型会审器，不是制片执行器。只在产物已经形成、需要跨专业找错或比较权衡时调用：

1. `StoryProductionPacket` 与 `VisualBible` 已锁定故事事实之后；
2. 镜头、动作、锚点、`GenerationUnit` 与 Provider 能力计划完成、自动派发之前；
3. 第一批真实候选或粗剪完成，需要复核表演、连续性、摄影、声音或剪辑问题时；
4. 最终交付前需要跨专业挑战审查时。

低风险 direct 任务可以跳过；输入产物没有 revision 变化时不得重复调用。Think 只能诊断、质疑和提出权衡，不能直接持久化生产数据、批准资产权威、编写或替换最终 Prompt、调用 Provider、操作时间线、渲染或发布。电影主路径不以预算或付费批准作为专家门槛。

主 Agent 必须按冲突优先级逐条裁决会审意见。采纳项通过 UnunuTV Core/API/CLI 写成关联目标 revision 的 `ProfessionalContribution`；会改变锁定事实、权威、预算或发布状态的意见必须交 Owner；重要拒绝项记录原因。随后由对应的编剧/导演/动作/摄影/表演/连续性/声音/剪辑/预算/Prompt 编译专业 Agent 继续创建合同和生产产物。聊天里的会审文字本身不是正式生产证据。

专业 Agent 贯穿制片执行，但都复用同一套核心用例和合同；外部会审不是隐藏必经阶段，也不能替代任何专业职责。付费 Provider、轮询、媒体物化、时间线与渲染仍只通过 UnunuTV 正式执行边界完成。

冲突优先级：用户硬要求 > 锁定剧情/原始对白 > 已接受权威 > 已批准镜头 > VisualBible > 专家建议 > 知识方法/案例 > 模型优化。
