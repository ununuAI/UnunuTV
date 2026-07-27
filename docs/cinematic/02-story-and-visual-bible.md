# StoryProductionPacket 与 VisualBible 合同

## StoryProductionPacket

StoryProductionPacket 是不能被 Prompt 模板吞掉的剧作真相层，至少保存：

- 来源事实、锁定剧情和用户锁定原文；
- 场景目的、人物目标、阻力和关系；
- 因果事件链、潜台词、完整对白；
- 情绪起点、变化点和终点；
- 表演意图、入口状态、出口状态；
- 不能提前出现的信息。

编译前必须校验锁定对白和关键动作仍存在。迁移来的旧文本带 `needsAuthoringReview`；旧 `videoPrompt` 只作为 `legacyPromptText`，不得直接提交。

## 剧情审查门

正式生产先审剧情，不得先做关键帧或视频再用成片倒推剧情合理性。审查至少覆盖：因果链是否闭合、人物为何行动、阻力是否真实、信息揭示顺序、入口/出口选择、对白是否推动关系或行动、不可逆状态和用户锁定事实是否相互一致。还必须审查肢体占用与道具归属：同一只手不能在同一时段既持续持刀又抓住另一目标，道具不能同时留在受击者体内又回到持有者手中；具体物理方法必须先在 Story 锁定，再由后续 Shot 原样继承。

对白的字面语义与行动任务冲突时，不得靠 `intent` 把错误台词解释成另一件事。Owner 明确否定某句对白后，必须从 `dialogue`、`userLockedText`、因果链和场景目的中删除或按 Owner 文本改写，并创建新的 Story revision；下游 Shot 的表演、声音、时间槽和验收条件不得继续保留旧句。

Owner verdict 必须持久化到 target type `cinematic_story_revision`、target ID `cinematic-story:<storyPacketId>:r<revision>`。只认该 target 的最新 review；`accepted` 后追加 `rejected` 会立即撤销授权。StoryPacket 更新为新 revision 后必须重新审，不得沿用旧 review ID。

## VisualBible

VisualBible 保存具体项目的选择：摄影语法、焦段倾向、综合色卡和场景 Palette、动机光源、肤色/高光/黑位、建筑材质、角色身份及服化版本、表演基调、声音世界、音乐原则、VFX 物理和跨镜连续性锁。

它还必须显式保存：

- `visualMotifs`：可重复出现且承担叙事意义的视觉母题；
- `colorArc`：色彩随人物、场景或章节发生的变化；
- `spatialDramaturgy`：空间如何表达权力、距离、阻碍和信息释放；
- `propSemantics`：关键道具的叙事功能与出现规则；
- `costumeNarrative`：服装、妆发变化服务什么人物状态；
- `materialAging`：材质新旧、磨损、潮湿、污迹和历史感；
- `culturalResearchRefs`：文化、时代、行业或地域研究证据；
- `styleProhibitions`：本项目明确拒绝的空泛风格、污染源和视觉捷径。

通用摄影方法、灯光判断、表演方法和声音规则进入统一知识库；本项目最终选择留在 VisualBible；LUT、色卡图、场景图和角色图进入资产库。

## 版本规则

两个对象都独立版本化。任何版本变化会使引用旧 revision 的 Prompt 编译失效。允许制作合同在早期为空，但进入分镜脚本定稿前必须形成完整、可校验版本；正式 GenerationUnit 编译还必须持有当前 StoryPacket revision 的最新 Owner ACCEPT。

机器可读 JSON Schema 位于 `packages/contracts/schemas/cinematic-production-v2.schema.json`；运行时以 contracts 包内的跨字段验证器为准。
