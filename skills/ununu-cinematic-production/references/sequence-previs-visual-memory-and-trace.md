# Sequence Previs、连续视觉上下文与成片记忆

## 目的

电影生产不能依赖 Agent “想象自己记得画面”。在正式生成前，把整个段落变成可播放、可逐秒检查、
可追溯的外部视觉记忆；生成后再用真实成片覆盖计划记忆。静态故事板、单镜 Prompt、首帧和聊天摘要
都不能单独承担这个职责。

本规则把连续画面拆成四种一等生产资源：

1. `SequencePrevisDocument`：当前段落的可播放时序、镜头相位和切镜决策；
2. `VisualContextBundle`：某一 Shot 在“上一镜—本镜—下一镜”中的局部多模态环境；
3. `VisualTakeMemory`：实际生成视频经过完整时间线检查后的可见状态记忆；
4. `CreativeDecisionTrace`：为什么切、为什么续、为什么换参考或只改一个变量的可审计理由。

## 先建立连续预演，不从孤立单帧决定电影

在正式视频生成前，为一段连续 Shot 建立 `SequencePrevisDocument`。它必须绑定当前已接受
Story revision 和当前 Shot revisions，并包含：

- 一条统一时间轴、FPS、总时长；
- 按艺术顺序排列、序号连续的 `shots`；
- 每镜的 `startSeconds` / `endSeconds`，相邻镜无空洞或重叠；
- `narrativeJob`、`entryPhase`、`exitPhase`；
- 摄影、表演、空间、音频状态；
- 真实 `frameMediaId` 与明确 `frameSourceRole`；
- 每个相邻边界恰好一个 `CutDecision`；
- 当前已接受 Authority、故事板、Director capture 与失败反例的谱系。

候选预演可以保存空白帧，便于诚实呈现尚未完成的工作；空白不得冒充黑场、占位图、上一镜尾帧、
错误故事板或“以后会生成”的事实。任何空白帧都会阻止 Owner ACCEPT 和正式生成。

导演台必须连续播放整条时间线，并允许拖动时间查看当前 Shot、上一/下一相位和切点。仅展示卡片列表
不构成时序预演。

## 为每个边界写 CutDecision

`CutDecision` 必须说明：

- `fromShotId`、`toShotId`、精确切点；
- 是硬切、匹配切、声桥、遮挡切、甩镜还是连续不切；
- 叙事/表演/空间/动作上的切镜动机；
- 切前和切后动作相位；
- 轴线、视线、运动向量与音频桥；
- 若有重叠，实际重叠范围和剪除规则。

切点必须位于真实相邻镜边界。一个计数正确但指向错误 Shot、错误时间或重复边界的列表仍然失败。
没有叙事或可读性动机的炫技运镜不能替代切镜设计。

对于 15 秒上限或更长的连续镜头，先设计可验证的 Provider 段落，再选择：

- 从最新接受尾帧直接续接；
- 以同一接受 take 的 H0/H1 重叠交接并在剪辑中删除重复动作；
- 在实际出现的前景遮挡、甩镜、暗场、闪光或运动模糊处隐藏机位重置；
- 以明确叙事动机切到新的已接受构图。

不得从计划中的遮挡、固定秒数或未接受像素声称“无缝”。

## 编译 VisualContextBundle

每个 Shot 在当前 Previs revision 下编译一个不可变 `VisualContextBundle`。它必须包含：

- `contextWindow`：上一镜、本镜、下一镜 ID；
- `phaseStrip`：三镜的入口/出口相位、时间与真实帧；
- `sceneLocator`：全景拓扑、区域、站位、路径、视线、手、道具和接触面；
- `authorityBindings`：当前 accepted Authority revision 与真实 accepted media；
- `referenceRoles`：进入正向语境的 exact media 及职责边界；
- `promptFacts.preserve/change/motion/prohibitions`；
- `rejectedExamples`：只用于关闭失败路径的评审 ID，不能作为正向参考。

只允许以下像素进入正向 `referenceRoles`：

1. 项目内真实媒体；
2. 当前职责明确；
3. 最新 media review 为 `accepted`；
4. 故事板还必须 `videoReference.selected === true` 且
   `acceptanceProof.pixelReviewed === true`；
5. Authority media 必须来自 Authority 显式 accepted media，或当前 asset version 的
   `reviewState === accepted`。

未选择、未像素复核、后来 REJECT、仅文字 accepted、被旧版本引用或来自错误 World 的媒体只能留在
审计历史。新上下文是 append-only；发现旧上下文污染时不要删库，编译正确的新上下文，并用
`CreativeDecisionTrace` 明确 `fromVisualContextBundleId`、`toVisualContextBundleId`、污染事实和替代决定。

一个局部镜头不能只拿局部图自证位置。把 accepted 全景、Director 坐标或带稳定区域 ID 的语义参考
放入 `sceneLocator`；局部图控制纹理/局部状态，整体图控制它属于哪个空间或身体区域。

## 让图片、提示词和动态各自承担正确职责

预演帧不自动成为 Provider 首帧。`frameSourceRole` 必须区分：

- `semantic_scene_identity_reference`：保持人物、场景、空间或构图语义，不声明从此像素开始；
- `initial_state`：当前 Shot literal `t0`；
- `continuity_state`：上一条最新 ACCEPT take 的真实尾态；
- `action_phase`：只控制某个动作相位；
- `endpoint`：首尾帧模式的真实终点；
- `editor_only`：只供规划/审计，禁止 Provider 使用。

普通参考图可以有现代桌、被遮挡实体或不属于输出的控制线，但必须在结构化职责和 Prompt 中逐项写出
`preserve/replace/complete/ignore`，并保证图中标注与文字的区域、方向、时窗完全一致。首帧是 literal
`t0`，不能同时要求把可见桌、脸、道具或构图替换掉。

图片负责静态可见状态；精确 Shot Prompt 负责动态事实。Prompt 必须覆盖：谁在何区、朝向/视线/手/接触、
谁先动、每段时间、路径与速度、摄影机的起点/轨迹/停止、镜头焦点/曝光、动作来源/载体/轨迹/碰撞、
表演刺激/判断/克制/控制破裂、声音、结束状态、交接和禁止解释。没有写出的关键动态事实不是由图片自动补全。

## Owner ACCEPT 是专用硬门禁

连续预演只能通过专用 `sequence-previs review` Core/API/CLI 路径审批。通用 review 接口不得为
`cinematic_sequence_previs_revision` 写 ACCEPT，以免绕过完整性检查。

写入 ACCEPT 前必须同时通过：

1. Story 和 Shot revisions 仍是当前版本；
2. 时间轴连续、总时长相等、顺序连续；
3. 每个相邻边界有且只有一个正确 CutDecision；
4. 每镜 `frameMediaId` 是项目内真实 image；
5. 每镜帧的最新 media review 为 `accepted`；
6. 每镜存在匹配当前 Previs/Shot revision 的 VisualContextBundle；
7. 所有 Authority 仍为 accepted；
8. 最新 Owner verdict 是当前 revision 的 ACCEPT。

任一项失败时只保留 candidate/rejected，不可用高分、旧 ACCEPT、占位图或聊天授权替代。Revision 更新后
旧 Owner ACCEPT 自动成为历史。

每个正式 `GenerationUnit` 必须绑定：

- `sequencePrevisId`；
- `sequencePrevisRevision`；
- 当前 Shot 的 `visualContextBundleId`；
- 可选但可核对的 `reviewId`。

编译和预检把 `sequenceWorkspaceAudit` 写入 source versions。缺绑定、版本过期、帧后来 REJECT、最新
Previs verdict 非 ACCEPT、上下文 ID 不匹配时，Provider dispatch 必须失败。

## 用 VisualTakeMemory 把实际视频变成新的画面记忆

预演是计划，不是成片事实。每次真实生成后，对完整视频做 dense timeline 检查并写
`VisualTakeMemory`：

- generation unit、run、media、checksum、实际时长；
- t0、关键相位、切点前后、tEnd 的 `phaseSamples`；
- 人物/场景/空间/动作/表演/摄影/光声的实际观察；
- planned-versus-actual 差异；
- 内部切镜、漂移、身份/拓扑/数量/接触/轴线失败；
- 可用区间、实际入口和实际出口状态；
- 置信度与无法确认项。

不要从计划字段抄写观察。没有看见就记为未知；被拒绝 take 不得改变 canon 或成为下一镜参考。
只有最新 ACCEPT 的实际尾态可以形成 continuation first frame、H0/H1 或 carry-forward state。

## 用 CreativeDecisionTrace 保留创作因果

对以下决定写 trace：选择切点、改为长镜/切镜、选择参考模式、替换污染上下文、调整镜头轨迹、
重写一个 Prompt 变量、重抽、重锚、回收可用区间、接受偏差或否决候选。

每条 trace 至少记录：

- 目标类型/ID、动作；
- 实际观察输入；
- 最终决定和理由；
- 被否决的替代方案；
- 唯一改动变量（若有）；
- 真实结果或待验证结果。

失败后一次只改变一个可归因变量。不要把 Prompt、参考图、模式、模型、时长和机位同时改变后宣称学到
某个技巧。

## 官方操作顺序

1. 经 CLI/API 保存 candidate Sequence Previs。
2. 为每个 Shot 编译 VisualContextBundle；并发遇到数据库锁时顺序重试，不绕过 API。
3. 在导演台完整播放，逐帧/逐边界审核。
4. 只经专用命令写 Owner ACCEPT；门禁失败就修帧、上下文或切镜。
5. 把 accepted Previs/context 绑定到 GenerationUnit，执行 compile 和 preflight。
6. preflight ready 后经 CLI/API 自动派发到已配置 Provider 账户；不存在另一次花钱批准。
7. 对真实 take 写 VisualTakeMemory、Evaluation 和 canon reconciliation。
8. 写 CreativeDecisionTrace，重新编译下一镜或返工单元。

禁止直接写 SQLite。禁止把空白、错误、未验收、已否决或仅计划中的画面伪装成连续视觉证据。
