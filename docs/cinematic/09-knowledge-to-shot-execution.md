# 从参考知识到逐镜执行

## 目的

统一知识库、用户提供的书籍/教程、优秀作品分析和外部案例只有在改变当前镜头合同并形成 revision-current 证据后，才算进入 UnunuTV 生产。检索结果、聊天总结、文档链接和 production 级泛化建议都不是付费执行资格。

## 五步编译

前置条件不是知识检索，而是审查顺序：当前 StoryPacket 最新 Owner ACCEPT → 完整有序 Shot 脚本逐镜审查 → 每个当前 Shot revision 最新 Owner ACCEPT。未完成前置审查时，专业知识只能帮助修订合同，不能授权资产、关键帧或视频正式生产。

1. **按风险检索**：先从镜头的叙事、摄影、空间、身份、动作、表演、声音和剪辑风险决定需要的角色，只检索能解决这些风险的 `cap-*` 能力与 `kn-*` 原子。`ACTIVE` 可正常使用；`LIMITED` 必须保留适用边界；`SUSPENDED` 不得进入正式贡献。
2. **由专业角色裁决**：专家说明为什么该方法适用、放弃了什么方案、哪些用户事实/权威不能改变。来源中的 Provider 宣传、秒数经验和单次案例不得升级成普遍规律。
3. **写进合同**：把知识变成 Shot/GenerationUnit 的结构化字段、资产权威、Director Stage、动作相位/覆盖、剪辑交接和硬验收项。不能只写“电影感、流畅、保持一致”。
4. **持久化当前会签**：`ProfessionalContribution` 精确绑定当前目标和 revision，并写 `teamManifestId`、`sourceStoryPacketRevision`、`sourceGenerationUnitRevision`、完整 `sourceShotRevisions`、能力 ID、知识原子 ID、硬否决和验收标准。
5. **预检与失效**：Core 只把覆盖当前镜头/生成单元 revision、同时有正式知识引用并属于当前 TeamManifest 的角色计为有效会签。任何来源 revision 或 TeamManifest 改变都会使 compilation stale；重新检索/裁决后才能付费。

## 可执行技术基线

### 运镜流畅

- 先写镜头需要新揭示的信息或情绪转折，再决定是否移动摄影机。
- 演员路径、摄影机路径和视线轴分开记录，禁止用一个“向前”混写三者。
- 运动由可见动作/视线/遮挡触发；启动有缓入，速度服务情绪，获得新信息后减速并停在可剪构图。
- 复杂运动接复杂运动时匹配方向与视觉速度；速度或方向突变必须有碰撞、遮挡、光闪、反应或声桥等动机。
- 固定机位是合法方案。演员靠近、前倾、重心/微表情变化也能产生尺度和情绪升级，不应为了“高级”强加漂浮运镜。

### 人物与场景一致

- 人物：已接受的面孔、头颅/身体比例、发型、服装层级、妆容、伤势和武器状态；身份板不控制最终构图和动作。
- 场景：场景图明确入口/出口/楼梯/柜台/墙/桌椅等拓扑；材质、动机光和固定陈设跨镜复用。
- 每镜记录 `entry state → visible cause → exit state`。没有画面内原因，角色、家具、伤势、破坏和异常解剖不得消失、复原、镜像或换区。
- 参考图逐项写 `controls/doesNotControl`，故事板只控制构图/镜序/粗空间时不能冒充身份或场景权威。

### 空间关系一致

- 冻结注意轴和带符号屏幕方向，把入口、交战区、目标和出口命名为稳定 screen zone。
- 每个主体记录位置、路径、髋肩/头部朝向、视线、leading foot、手/武器/VFX 向量、道具和接触面。
- 群体记录人数、桌席/层级、遮挡和通路；场景变化必须有先行受力或动作因果。
- 硬切用新镜头关键帧建立构图；同一连续镜头续接才使用上一条 `ACCEPT` 的真实尾帧。REJECT、未审片或文字状态不能成为连续性来源。

### 打斗流畅

- 先明确双方目标、战术和优势交换，避免站桩轮流放招。
- 每个关键动作至少包含意图/准备、接触、受力反应、恢复/新状态；逐链记录发起者→手/武器/接触点→载体→轨迹→命中→反馈。
- 群战、追逐和复杂接触先做 proxy blocking / action-phase board / motion plan，再做最终关键帧和视频。
- 以动作/反应、全身可读覆盖、接触特写和空间重建镜头组成 coverage；切在运动中时保持方向、速度、武器、伤势和疲劳连续。
- 单个高风险动作优先拆成 4–6 秒左右的局部 GenerationUnit；具体长度由动作可读性和已验证模型能力决定，不把案例秒数当绝对规律。

## 硬门禁

生产单元在付费前至少要求：

- 当前 StoryPacket revision 的 `cinematic_story_revision` 最新 review 为 `accepted`；
- 每个 linked Shot 当前 revision 的 `cinematic_shot_revision` 最新 review 为 `accepted`；
- 非空且已获 Owner 批准的 `teamManifestIds`；
- 所需角色的 current-artifact signoff；
- 每个有效会签同时含 `cap-*` 和 `kn-*`；
- 会签 `teamManifestId` 属于当前 production；
- 当前 Story/Shot/GenerationUnit revision 完整匹配；
- 知识已进入可验收字段，而不是只存在于 `knowledgeRefs`；
- 其余资产权威、Director、关键帧/尾帧、连续性、Prompt lint 和模型能力门禁同时通过。

这不是仅限视频 GenerationUnit 的门。AssetAuthority 图片与 Storyboard 图片/视频的正式 Provider 派发也必须在 Provider 能力预检前复用相同 Story/Shot revision review gate；主路径使用 Provider 账户模式，不读取项目预算。已有导入媒体不触发 Provider 派发，但后续晋升/引用仍受像素审片与当前合同约束。

失败码包括 `story_owner_acceptance_required`、`shot_script_owner_acceptance_required`、`team_manifest_required`、`professional_signoff_target_stale`、`professional_signoff_knowledge_required` 和 `professional_signoff_manifest_mismatch`。Owner review 变化还会产生 `owner_story_shot_reviews` stale source。这些错误不能由高分、手工 Prompt 或 Provider 能力成功覆盖。
