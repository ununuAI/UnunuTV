# 时序状态、实际成片正典对账与返工控制

## 目的

AI 电影不能把每段视频当成互不相关的静态图片任务。每个
`GenerationUnit` 都必须同时知道：此前银幕上已经真实发生什么、本段唯一允许完成什么、
什么必须保留给后续；每次审片都必须把实际起止状态写回生产合同，下一镜从最新接受结果
编译，而不是从原计划或聊天记忆继续。

本规则控制的是文字 → 图像参考/首帧 → 动态视频 → 审片 → 剪辑/重生 → 下一镜的完整闭环，
不是一套独立 Prompt 模板，也不是另一个运行时。

## 三类权威不得混用

1. `AssetAuthority` 是角色、场景、道具的长期正典身份与设计权威。
2. 最新 `ACCEPT` 成片的 `takeObservation` / `canonReconciliation` 是当前镜头之后的短期实际状态，
   负责人物站位、动作相位、损伤、可见道具、光线、声音和世界变化。
3. 动作、摄影或风格 donor 只控制显式声明的动态/风格维度，不得覆盖身份、服装、场景拓扑或
   已接受的实际状态。

参考图、首帧、首尾帧仍按
[cross-modal-image-video-control.md](cross-modal-image-video-control.md) 执行。普通参考图可以控制
身份、场景和空间，也可以带编辑器标注；它不是默认 `t0`。真正的续接首帧必须来自最新
`ACCEPT` 成片的可验证尾部。

## GenerationUnit 必填时序合同

正式制作模式必须写 `sequenceState`：

- `sceneId`、`sequenceIndex`、`relation`：明确场景、顺序以及是首段、无缝续接、意图切镜、
  过桥、尾部修复还是漂移重锚。
- `alreadyHappened`：已在已接受成片中发生，本段禁止重演。
- `thisUnitOnly`：本段唯一允许完成的剧情/动作节拍。
- `reservedForLater`：后续保留，本段禁止提前泄露或完成。
- `plannedStartState` / `plannedEndState`：结构化入口与出口状态；后续单元的入口必须逐字段继承
  上一条接受审片的 `carryForwardState`。
- `feltIntent`：导演规划层的情绪/观看意图，不直接作为抽象形容词发送给 Provider。
- `intentCarriers.camera/lighting/performance/sound`：把观看意图翻译成摄影机、灯光、演员可见行为
  与声音的可执行承担项；编译器只发送这些具体承担项。
- `extensionDepth` / `maxExtensionDepth` / `reanchorPolicy`：记录连续使用输出结果作为源的深度；
  上限必须按模型、画面风险与镜头设计配置，达到或发现漂移就从已接受 Authority/稳定镜头重锚。

三张表必须两两互斥。任何“已经发生”又出现在“本段”，或“本段”同时出现在“后续保留”，
都在 Provider 调用前阻断。

## 审片必须写真实结果

采用 `sequenceState` 的单元，其 `CinematicEvaluationRecord` 必须同时包含：

### takeObservation

- `observedStartState`、`observedEndState`：来自完整时间线审片的实际状态；
- `completedBeats`、`incompleteBeats`、`unexpectedCompletedBeats`：计划节拍的真实完成情况；
- `continuityBreaks`、`acceptedDeviations`：断裂与 Owner 明确接受的偏差；
- `confidence`、`uncertainties`：证据置信度和无法确认的事实。

不得用原计划抄写 `observedEndState`。必须查看真实像素与时间线；无法确认就写 uncertainty，
不能虚构成片事实。

### canonReconciliation

- `accepted`：只有 Owner/质量门禁接受的观察事实进入正典；
- `pending`：尚不能供下一镜继承；
- `rejected`：拒绝候选不得改变正典，也不得成为续接父源。

记录接受/拒绝的观察事实、提升为已完成的节拍、结构化 `carryForwardState`、下一单元锁定项和理由。
意外提前完成的节拍若被接受，必须进入 `promotedCompletedBeats`，并在下一单元的
`alreadyHappened` 中出现；否则下一镜会重演。

### retakeDisposition

审片结论与处置必须兼容：

| 审片结论 | 允许处置 | 含义 |
| --- | --- | --- |
| `ACCEPT` | `KEEP` / `FIX_IN_POST` | 保留，或只做不改变正典事实的后期修复 |
| `PARTIAL` | `FIX_IN_POST` / `EDIT_SOURCE` | 保留可用区，或修一个上游来源变量 |
| `REJECT` | `REROLL` / `REWRITE` / `REANCHOR` | 同合同重抽、改单一合同变量、或从权威重锚 |

`REROLL` 不改 Prompt/参考/参数合同，只换样本；`EDIT_SOURCE`、`REWRITE`、`REANCHOR`
一次最多声明一个 `changedVariable`。多变量同时变更会破坏因果归因和经验回写，必须拆成连续版本。

## 下一镜编译硬门禁

Core 在正式制作模式自动开启 `requireSequenceState`。后续单元只有同时满足以下条件才可通过：

1. `sourceEvaluationId` 是父单元最新审片，不是旧的有利结论；
2. 该结论为 `ACCEPT`，包含真实起止观察和 `accepted` 正典对账；
3. 父单元的实际/意外完成节拍全部写入本单元 `alreadyHappened`；
4. `plannedStartState` 与父单元 `carryForwardState` 逐字段相等；
5. 已发生、本段、后续保留没有交叉；
6. 续接深度没有超过当前单元配置上限；重锚单元深度重置为 0，且绑定至少一个已接受权威；
7. 旧候选被 Owner 否决后，最新评审覆盖旧 `ACCEPT`，所有下游续接立即失效。

编译 Prompt 必须出现 `【本段剧情与实际状态边界】`，明确实际入口、不得重演、本段唯一任务、
不得提前、四类导演意图承担项和目标出口。抽象 `feltIntent` 不单独发送给 Provider。

## 工业操作顺序

1. 先审剧情合同，再审分镜脚本和时序合同。
2. 选择参考职责：身份/场景/空间普通参考，真实续接才用首帧或已接受尾部。
3. 编译并检查三段节拍边界、实际入口和具体动态承担项。
4. 经 CLI/API 在低模预演接受和 preflight 通过后，为当前精确版本记录一次正式生成意图，再派发到已配置 Provider 账户；这不是另一次计费确认。
5. 对实际成片做完整时间线审片，写 observation、canon reconciliation、retake disposition。
6. 只有最新 `ACCEPT` 可更新正典和续接父源。
7. 重新编译下一单元；不得复用上次编译结果或聊天中记住的状态。

## 外部来源与证据边界

本控制面吸收了 MIT 项目
[Emily2040/seedance-2.0](https://github.com/Emily2040/seedance-2.0) 在固定提交
`57d01dc66f93ecb03c2475be5f22dc416d9b701d` 中的可迁移结构，重点来源包括
`schemas/clip-contract.schema.json`、`schemas/take-review.schema.json`、
`references/sequence-project-state.md`、`references/retake-protocol.md` 和
`references/reference-transfer-contract.md`。只迁移合同思想并重新实现为 Ununu 原子合同/Core 门禁；
没有复制其运行时、Prompt 模板、Provider 参数或示例作品。

该项目的结构化 schema/eval 与本地 Python 测试可作为设计证据，但其
`evals/generation-benchmark.json` 和示例 run 明确标记为 synthetic fixture，不能证明真实 Provider 成片质量。
其“默认深度 2、硬上限 3”只记为 LIMITED 启发，Ununu 使用每单元可配置上限并要求真实审片证据；
不能把任何固定深度、时长或 Prompt 当作普适最佳实践。
