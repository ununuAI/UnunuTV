# Director Skill、Toonflow、OpenMontage 统一吸收合同

## 目的

这些来源只提供可吸收的生产语义，不构成并列产品、并列 Skill 或并列状态机。
UnuTV Core 合同是唯一生产真相，画布是唯一可见工作区，
`ununu-cinematic-production` 是唯一控制 Skill。

## 一条合并后的流水线

```text
剧作开发
→ 完整剧本
→ 证据化诊断
→ 精确改稿并复审
→ 对白与表演审校
→ Owner 锁定
→ 导演分场/节拍/镜头形成
→ 真实资产权威
→ 可执行镜头脚本
→ 低模时序预演
→ 边界分类与参考模式决策
→ 图片证明
→ Prompt 编译/预检
→ 单次正式视频意图
→ 实际审片/正典对账
→ 下一镜
→ 时间线粗剪
→ 声音后期
→ 候选渲染
→ 交付 QC
```

上游 revision 改变必须让下游派生物失效。任何阶段的文字回复、异步任务提交或媒体
回执都不能自动代表下一阶段已完成。

唯一 Core 后期阶段后缀固定为：

```text
continuity_qa
→ timeline_edit
→ sound_design
→ candidate_render
```

`timeline_edit` 必须先从逐条 ACCEPT、完成正典对账的真实候选建立当前粗剪时间线。
`sound_design` 只接受该真实粗剪的精确 `timelineId`、revision、片段顺序、入出点、
对白/旁白位置和完整播放证据作为输入，再设计或修复对白、环境、Foley、音乐与
静默。分镜、Prompt、计划时长、单条生成视频或尚未落盘的剪辑设想都不能冒充粗剪
时间线。声音产物和 cue 必须回填当前时间线并完成整段试听，之后才允许
`candidate_render`；不得建立“先声音、后粗剪”的第二套状态机。

## 七项不可软化的生产合同

以下规则是同一条 UnuTV 流水线的门禁，不是来源项目的另一套阶段或可选建议。

### Screenplay authority

- `EpisodeAuthoringPackageV1.sourceDocument` 必须是完整
  `ScreenplayDocumentInputV1`。客户端提交精确正文、其小写 SHA-256 checksum
  和 `expectedRevision`；`documentId` 与新 revision 只能由 Core 持有和推进。
- 剧本医生、对白编辑和平台编辑的审核必须同时绑定当前精确
  `documentId`、revision、checksum。任一绑定陈旧，上游正文一字改变，旧审核都
  不再具有放行权。
- 对白审核的 `dialogueInventory` 必须逐句、按剧本原顺序覆盖当前正文，不能用
  StoryPacket 摘要、结构化镜头行或挑选后的重点台词代替完整剧本真相。
- 对应硬 blocker 是 `screenplay_authority_invalid`、`screenplay_review_stale` 和
  `dialogue_inventory_incomplete`；不得用重新接受 StoryPacket 消解剧本正文绑定
  错误。

### Shot formation repair

- 仅持久 blocker `cinematic_shot_formation_required` 允许同一 `packageId` 的
  `EpisodeAuthoringPackageV1` split、merge、reorder 或 renumber 镜头行。
- Core 必须先对整份拟议 formation 做完整校验，再持久化 StoryPacket、
  VisualBible 和任何行；修复失败时三者都不改变。该 repair-only 规则不得倒灌到
  初始 screenplay scene blocks，也不得由行级 primitive 或新 package 冒充。
- package 或结构越权返回 `structured_script_conflict`；拟议 formation 仍不完整时
  保持 `cinematic_shot_formation_required`，只能继续修同一整包，不能跳阶段。

### Production previs required

- 正式视频提交必须绑定当前 `SequencePrevis` revision 和本镜
  `VisualContextBundle`。逐镜 frame 必须是真实项目媒体、通过最新逐像素 ACCEPT，
  连续预演当前版本还必须经过 Owner ACCEPT 和 Core audit。
- Storyboard、Prompt、计划时长、聊天描述、静态构图设想或泛称的“低成本证明”
  都不能替代该 production previs binding。缺少它时以
  `sequence_previs_required` 停止，Provider 调用数保持为零。
- 真实逐镜 frame 或 Owner 当前版本验收缺失时分别保持
  `sequence_previs_frame_pixel_acceptance_required` 或
  `sequence_previs_owner_acceptance_required`；只能补足并接受精确版本，不能改成
  图片参考或放宽 preflight。

### Manual Prompt non-runnable

- 人工自由文本只能保存为 `manual_preview`、`preflight_blocked` 的不可运行预览
  草稿，并保留 `manual_prompt_not_formal_runnable`。
- 正式 run 必须以 `manual_prompt_formal_generation_forbidden` 在 Provider dispatch
  前阻断。唯一恢复路径是修改结构化字段并重新编译新的 payloadHash；不得把手写
  文本、manual override 或旧 hash 改名后提交。

### Authority-derived virtual person

- 每个出场人物必须绑定当前、已接受的 character Authority；其外部身份必须是
  `ark` 的 `virtual_person_asset`，包含合规 asset ID 和可追溯 source。
- `GenerationUnit.generationParameters.virtualPersonAssetIds` 必须按本镜出场角色的
  Authority 顺序自动派生，禁止手填、漏填、换序或夹带其他 ID；使用时还必须声明
  `virtual_person_asset` capability。
- 一个虚拟人物 ID 不得归属多个已接受 character Authorities；无已声明出场角色的
  GenerationUnit 不得携带虚拟人物 ID。
- 身份 Authority 缺失、单元绑定不匹配或 ID 跨 Authority 重用分别保持
  `character_virtual_person_authority_required`、
  `generation_unit_virtual_person_binding_mismatch`、
  `character_virtual_person_identity_reused`；恢复路径是修 Authority 与出场顺序后
  重新派生 GenerationUnit，不是直接改数组。

### 480p final delivery

- 当前 Owner 锁定的 Seedance Mini 生产和 9:16 主时间线必须保持 `480p`、
  `480×854`、`24fps`；终交只接受 H.264、AAC stereo。
- 唯一终交 preset 是 `h264_vertical`，最终 manifest 必须是
  `delivery/delivery_ready`。`h264_review`、square、H.265、ProRes、WAV 或高分辨率
  中间件仍可是审看/中间产物，但不得冒充最终交付或进入 `delivery_qc`。
- 非终交 preset 必须保持 `delivery_render_preset_required` 或
  `cinematic_delivery_render_preset_invalid`；只能用当前主时间线重新形成合规终交
  母版并通过技术 QC，不能重命名审看件或用 `acceptWarnings` 绕过。

### Audio replacement is a timeline fact

- `sound_designer` 方案本身不等于应用完成。当前粗剪的每个源视频 clip 必须记录
  当前 contribution ID/revision 的确定性时间线应用回执。
- 源音频标记为 `repaired` 时，源视频 clip 必须明确
  `includeEmbeddedAudio=false`；新 remix media 必须成为真实 audio track clip，
  并与源视频 clip 的 start、duration、trim 精确对齐。
- 缺少回执、没有禁用错误嵌入音轨、或替换媒体未实际落到时间线，都必须阻断
  `candidate_render`；画布连线、stem 文件、cue sheet 或“已回混”的文字说明不能
  代替上述时间线事实。
- 三类事实缺失分别保持 `sound_timeline_patch_receipt_required`、
  `repaired_source_embedded_audio_not_disabled`、
  `repaired_source_timeline_replacement_required`，候选渲染入口统一报
  `render_sound_timeline_preflight_failed`。只能修复当前 timeline revision 并重新
  审计，不能另造音频时间线。

## 镜头与生成段的唯一决策

先判断艺术镜头是否切换，再决定模型生成段。每个生成单元必须且只能归入以下一类：

- `new_shot`：从上一艺术镜头切到新的艺术镜头。必须给出信息、动作、视线、遮挡、
  图形、方向、速度或声音上的真实切镜原因；不能仅因模型时长用尽而创建新镜头。
  映射到当前 GenerationUnit 的 `single_shot`、`designed_multi_shot` 或
  `storyboard_action_sequence`，取决于该次请求是否包含已设计的内部切镜。
- `continuation_segment`：上一艺术镜头尚未完成，因为 Provider 时长或执行风险而
  续成下一生成段。映射为 `continuous_segment`，只能在 `TAIL_CONTINUE` 与
  `DUPLICATE_HANDOFF` 中选择一个，并继承最新仍为 ACCEPT 的真实上一段。
- `one_take_segment`：当前艺术镜头由一个不含内部剪辑的生成段完成。映射为
  `single_shot`；Prompt、模型输出和时间线都不得暗藏切镜。若同一一镜到底需要多个
  Provider 请求，首段是 `one_take_segment`，其余请求全部是
  `continuation_segment`，不能为每个 4–15 秒段伪造新艺术镜头。

Seedance Mini 的 4–15 秒只定义 Provider 请求边界，不定义时间线剪辑点。真实剪辑点
必须来自上述艺术原因和实际候选的可剪动作相位；模型恰好在第 15 秒结束不构成
`new_shot`。对 `TAIL_CONTINUE`，上一段最新 ACCEPT 的 H1/尾态就是下一段
H0/t0，即 `H1=下一段H0`，并从 H1 之后直接推进新内容。对
`DUPLICATE_HANDOFF`，上一段同源、不同的 H0/H1 作为普通参考输入，下一段先复现
H0→H1、再产生明确新内容，并在真实时间线删除重叠区；不得把这项例外改写成固定
秒数切点。

### 尾部退化、回退帧与短桥段

物理文件的最后一帧不自动等于可用尾态。若 15 秒段尾部出现人物、拓扑、道具、
机位、曝光、运动或压缩抖动，先在完整播放和逐帧证据中确定最后一段连续稳定区：

- `stable tail`：当前候选被接受范围内，最后一个身份、空间、动作相位、摄影机和
  光线都可继承的连续区间；记录起止时间、媒体 checksum、evaluation 和逐帧观察。
- `rollback frame`：从 stable tail 内选择、早于退化区的真实稳定帧。它必须通过
  Core 精确时间抽帧并投到画布，原坏尾部在真实时间线被 trim 掉；不能修图伪造、
  从 REJECT 候选取帧或只在聊天里声称“回退了几帧”。
- `bridge segment`：以 rollback frame 为 H0/t0，按当前模型允许的最短范围重生成
  同一艺术镜头的短 `continuation_segment`，在 H1 后形成明确、稳定的新尾态。它
  不是自动剪辑点，也不取得新的 `new_shot` 身份；先完成结构化预检、引用打包和
  正式意图，再遵守一次 Provider 提交边界。

桥段使用 `TAIL_CONTINUE` 时，bridge H1 直接成为下一段 H0；使用
`DUPLICATE_HANDOFF` 时，H0/H1 必须同源、不同、可复现，下一段先复演重叠动作，
时间线按实际动作相位 trim 重复区。桥段仍失败或稳定连续性根本不可证明时，停止
伪装一镜到底，改为以下一种有证据的剪辑决策：

- `deliberate_cut`：主动创建 `new_shot`，以信息、动作、视线、图形、反应或声音给出
  可见 cut reason，并重新设计新镜头起幅。
- `hidden_cut`：仅当实际像素和完整播放证明遮挡、前景 wipe、whip pan、flash、
  dark frame 或 motion blur 足以覆盖接缝时使用；记录 seam type、H0/H1、动作相位、
  摄影机速度、声音同步点和 trim。计划中的遮挡或 Prompt 文字不是隐藏切证据。

无论选择桥段、主动切还是隐藏切，`one_take_segment` 的 Provider 4–15 秒边界仍不
等于最终时间线剪辑点。剪辑点只由实际稳定区、动作相位和上述导演决定产生。

声音可以帮助接缝，但不能掩盖错误画面：`J-cut` 让下一镜声音先于画面切点进入，
`L-cut` 让上一镜声音越过画面切点继续。两者必须成为真实 timeline audio clip 的
start/duration/trim 重叠，并保留环境底、混响尾、对白/拟音同步点和完整试听证据；
`audioBridge` 文字说明本身不等于已经完成 J/L cut。

当前实现状态必须如实标记：

- **Core 已强制**：任意精确时间真实抽帧；`TAIL_CONTINUE` /
  `DUPLICATE_HANDOFF` 互斥；H0/H1 来源 ACCEPT 与 checksum 谱系；不同 H0/H1、
  overlap、`newContentAfterH1`、seam type、摄影机/声音守恒和 `trimPlan`；Sequence
  Previs 的 cut / match / audio bridge / occlusion / whip-pan 决策；时间线
  trim、split 和独立音频轨。
- **待 F 实现**：全时间线尾部稳定性审计、stable-tail 区间与 rollback receipt、
  `bridge_segment` 结构化合同、续段/主动切/隐藏切的唯一决策和 Provider 前门禁。
- **待 C 实现**：把 stable range、bridge overlap/trim、`deliberate_cut` /
  `hidden_cut` 落成真实粗剪事实；为 `J-cut` / `L-cut` 增加显式时间线语义、声音
  重叠审计、渲染前门禁和完整试听回执。
- **待 D 实现**：在每段画布节点同屏显示 stable tail、rollback frame、bridge
  segment、H0/H1、实际 trim、cut 类型/原因、J/L 声音范围及来源谱系；缺失时显示
  阻塞而不是“已无缝”。

在 F/C/D 的 Core、时间线和画布回归完成前，Skill 可要求并记录这些决策，但不得把
stable-tail 自动检测、bridge 自动修复或 J/L cut 审计宣称为当前已强制能力。

### 视觉输入的互斥选择

按下列条件只选一种 Provider 输入形态：

- `text_to_video / NONE`：新镜头没有必须由像素锁定的身份、场景、空间、起幅或端点。
- `first_frame / FIRST_FRAME`：只需精确锁定当前镜头起幅，已有当前逐像素 ACCEPT
  的干净首帧，且没有普通参考、标注图或虚拟人物 ID。
- `first_last_frame / FIRST_LAST_FRAME`：起幅和落幅都必须精确锁定，已有两张当前
  逐像素 ACCEPT 的干净载体，且没有普通参考、标注图或虚拟人物 ID。
- `first_frame / PREVIOUS_ACCEPTED_TAIL`：无虚拟人物 ID 的
  `TAIL_CONTINUE`，把上一段最新 ACCEPT 的真实 H1/尾帧作为下一段唯一 t0 输入。
- `image_reference / PREVIOUS_ACCEPTED_TAIL`：有 Authority 派生虚拟人物 ID 的续段，
  将真实 H1 作为 role=`continuity_tail` 的 ordinary continuity reference，与虚拟
  人物引用共同输入；不得使用 `first_frame` 或 `first_last_frame` 特殊模式。
- `image_reference / DUPLICATE_HANDOFF`：已验证可剪重叠区，把同一最新 ACCEPT
  来源的 H0/H1 分别作为 `handoff_h0`、`handoff_h1` 普通参考。
- `image_reference` 全能参考：需要身份、场景、空间、构图、合成 previs 或多个静态
  语义约束，或者虚拟人物 ID 与帧特殊模式冲突时使用。普通参考只约束声明过的静态
  事实，不会自动成为首帧、尾帧或完整运动轨迹。

缺失已接受载体时保持 `accepted_first_frame_required`、
`accepted_first_last_frames_required` 或 `accepted_tail_required`。虚拟人物与帧特殊
模式冲突保持 `character_temporal_frame_forbidden` / `frame_reference_conflict`，
恢复路径是改用上述 `image_reference` ordinary continuity reference 并重新编译，
不能删除角色 ID 或强塞 frame 参数。

### ≤9 的确定性参考打包

Ark 总参考容量是 9，`virtualPersonAssetIds` 与普通媒体共同计数：

1. 按出场顺序保留全部 Authority 派生角色 ID，角色身份槽位不可牺牲。
2. 普通媒体首先最多选择一张当前逐像素 ACCEPT 的合成
   `sequence_previs_composite` / `visual_context_composite`；禁止随机挑多个合成图。
3. 剩余槽位按 `continuity_tail` 或 `handoff_h0/h1` → scene → prop 的固定顺序选择。
   scene 与 prop 必须由上游按该顺序提交，packer 不得依赖数据库或画布偶然顺序。
4. 总数超过 9 且没有可承载上下文的接受合成 previs 时，以
   `composite_previs_required_for_reference_capacity` 阻断；角色已占满容量时以
   `character_ensemble_reference_capacity_exhausted` 阻断。只能拆镜或重做合成
   previs，不能随机截断、丢角色或静默丢 continuity。

Provider payload 的普通参考必须与上述打包结果逐项同序，否则保持
`visual_reference_pack_not_canonical` 并重新编译。

### 每段画布证据

每个生成段的可见 execution node 必须显示：`new_shot` /
`continuation_segment` / `one_take_segment` 分类、艺术决策原因、GenerationUnit
strategy、Provider mode、visualAnchorPolicy、4–15 秒段序号、打包后的引用及排除原因。
`new_shot` 显示 cut reason；`one_take_segment` 显示不切理由和起落状态；
`continuation_segment` 还必须显示来源 unit/evaluation/media、上一段 H1 与下一段
H0 的等值关系、选择 `TAIL_CONTINUE` 或 `DUPLICATE_HANDOFF` 的原因、H1 后新内容、
动作/摄影机/声音守恒和 trim plan。`cinematicInputDecision.rationale`、H0/H1
reference edge 与结构化 handoff 必须同屏可追溯；聊天说明或隐藏数据库记录不算
画布证据，缺任一项不得进入正式生成。

## Director Skill：专业语义最低线

吸收：

- `01/01b → 02 → 改稿 → 02复审 → 03 → 05 → 04 → 06 → 07` 的严格交接；
- 剧本诊断逐条给原文证据、优先级、修改建议、争议和不可改项；
- 对白七维审校、角色语言指纹、台词密度和可见微表演；
- 资产稳定 ID、四视图/空间母版/道具单实例、状态变体和 `@图N` 职责；
- 镜头 11 字段、4–15 秒、节奏密度、起幅/落幅和下一镜交接；
- 普通镜、强连续、续接、回场、多人首次调度、新场景的边界判断；
- Seedance 只做 Provider 适配，BGM 在后期。

不复制其品牌、版权声明或固定产品界面；不把模板文本当作 UnuTV 的运行状态。

## Toonflow：阶段权限、真实 ID 与监督逻辑

吸收：

- 决策、执行、监督职责分离；每个阶段只能调用获准工具；
- 从真实工作区读真实 ID，分镜和资产关联禁止编造 ID；
- 导演规划、衍生资产、分镜表、面板写入和生成任务的明确输入输出；
- 异步生成显示提交、轮询、成功、失败，不把“开始生成”冒充“完成”；
- 分镜监督检查剧本覆盖、台词原文、资产关联、时长、角色留痕和场景连续；
- 模型能力和参考模式是结构化生产决策。

拒绝：

- 只审核分镜表而让剧本、资产、生成和后期无门禁；
- 资产缺失时跳过问题；
- Agent 写出 XML/Markdown 就代表生产状态已完成；
- 角色/场景/道具只有名称，没有当前真实媒体与像素验收。

## OpenMontage：检查点、事件、剪辑与回放

吸收：

- 每阶段 checkpoint、revision、历史、恢复状态和事件时间；
- 生成中、失败、完成、成本、Provider 谱系与活动必须可见；
- 剧本、场景计划、资产清单、镜头卡和时间线通过真实 ID join；
- 编辑决策包含源媒体、入出点、速度、J/L Cut、字幕、环境声、Foley、音乐和转场；
- 剪辑按情绪、故事、节奏、视线、二维平面、三维空间依次判断；
- 完成生产可从 checkpoint 和事件重放，不依赖聊天记忆。

拒绝：

- 只读看板代替可操作画布；
- 平均镜头时长或“电影感”形容词代替逐镜因果；
- 媒体与当前 Shot、Authority、Prompt hash、Provider Run、Evaluation revision
  缺少强谱系。

## UnuTV 的独有上限

- 面向 AI 视频的低模预演与镜头控制台，不做简化版 Blender；
- 场景拓扑、人物站位、摄影机路线、主体跟随、弧线、多节点速度、2.5D、POV、
  起落幅和安全画幅；
- 人物、场景、道具、服化、声音、群众和状态变体的真实版本化权威；
- 普通参考、首帧、首尾帧、上一条接受尾帧与重复交接的互斥决策；
- 实际候选的完整观察、正典提升、受限返工和下一镜继承；
- 图片可多轮探索，视频在全部便宜证据通过后只形成一个正式提交意图；
- 能力全在画布，控制全在 Skill，Agent 只负责调用 Core 允许的下一动作。

## 可执行 nextAction 合同

每轮先读取 `cinematic-status`，只执行返回对象中这一条 `nextAction`。至少核对
`type`、`phase`、`command`、`blocker`、`targetId`、`revision` 和
`idempotencyKey`；聊天建议、参考模板或 Agent 自己推断的阶段都不能覆盖它。

按以下规则执行：

- `author_episode`：只运行返回的 `cinematic-author`，提交同一完整
  `EpisodeAuthoringPackageV1`；仅明确的 shot-formation repair 可改变行结构。
- `advance`：只推进返回的当前 `phase`，然后重新读取 status；不得循环猜测后续
  阶段。
- `run_worker`：只运行返回的 worker/command，并核对其输入、输出节点和当前
  phase；不得自行选择另一个 Agent 或工具。
- `owner_gate`：只把返回的精确 target/revision 投给 Owner；Agent 不代替接受。
- `wait_provider`：只等待或轮询现有 Run；不得生成新的正式意图。
- `repair`：只运行返回的修复命令。未知 Provider 结果只做
  `provider-reconcile`；不得直接重提视频/音频。
- `promote_asset`：只提升返回的已完成像素复核、精确 revision ACCEPT 的
  Authority 媒体；不得提升候选图或猜测复用对象。
- `commit_ledger`：只提交返回的当前 episode-end accepted reality 和精确 ledger
  revision；不得把计划状态写进跨集正典。
- `done`：仅在 14 阶段完成、Provider 媒体谱系完整、画布无重叠且交付证据齐全时
  接受完成结论。
- `failed`：停止并报告完整 blocker；不得降级到旧流程、浏览器或临时脚本。

若 `nextAction` 的 phase、command、目标 revision、数据投影或付费边界与本 Skill、
Core 阶段常量或当前真实状态冲突，把它视为产品契约缺陷：保存 status、blocker、
相关节点/Run/媒体 ID 和文件行号，停止生产并上报通用修复。不得绕过、直接改
SQLite、用一次性脚本改项目数据，或继续到任何 Provider 付费阶段。

## 运行门禁

以下任何一项缺失都停止，不得自动降级：

- 当前精确剧本 revision 的剧本医生、对白、平台节奏审核；
- 真实角色/场景/道具当前版本和最新 media ACCEPT；
- 镜头边界理由、导演字段、起止状态和下一镜交接；
- 低模预演的完整播放与 Owner ACCEPT；
- 参考职责、媒体 checksum、像素验收和画布连线；
- 同场上一镜的 ACCEPT、真实观察和 canon reconciliation；
- 当前 Prompt compilation/hash、正式意图和 Provider Run；
- 完整候选审片，以及先于声音设计存在的真实粗剪 timeline ID/revision、片段入出点
  和完整播放证据；
- 声音 cue、混音/修复媒体、整段试听证据和交付 QC；
- 每个主配角的声音权威、逐句声纹/表演/同步审核，以及错误源音频的
  stem 分离、单层替换、重新回混和整段试听证据。
