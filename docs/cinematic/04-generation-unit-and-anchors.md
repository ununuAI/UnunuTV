# GenerationUnit 与视觉锚点

GenerationUnit 表示一次模型请求。它可以关联一个镜头、多个有设计切镜的镜头，或长镜头的一个 Provider 分段。

## 策略

- `single_shot`：一个艺术镜头，无内部切镜。
- `designed_multi_shot`：一个请求生成多个有序艺术镜头；每个边界必须有切镜原因。
- `continuous_segment`：同一个艺术长镜头的某个 Provider 分段。
- `storyboard_action_sequence`：复杂动作相位或故事板动作序列。

## 视觉锚点

视觉锚点发生在生成单元层；人物/场景/道具权威发生在资产层。已有角色权威并不意味着必须制作故事板，选择故事板也不代表它取得人物或场景权威。

- `NONE`：不需要故事板/首尾帧锚点；人物身份参考仍可单独存在。
- `FIRST_FRAME` / `FIRST_LAST_FRAME`：锁定开场或开闭状态。
- `STORYBOARD_SHEET` / `SHOT_FRAME_SET`：多镜头设计参考。
- `ACTION_PHASE_BOARD`：动作、舞蹈、打斗和复杂接触。
- `PREVIOUS_ACCEPTED_TAIL`：仅用于同一长镜头续接。
- `DUPLICATE_HANDOFF`：实际动作重复区提供可剪交接。

`PREVIOUS_ACCEPTED_TAIL` 对应 `TAIL_CONTINUE`，与 `DUPLICATE_HANDOFF` 严格互斥。两者都必须声明结构化 `continuationHandoff`，但在来源片段还没有新的 ACCEPT 以前允许只完成方案而不伪造 H0/H1；此时预检必须以缺真实 H1、缺来源验收和缺交接验证继续阻断。

## 已测试的续接与重叠交接

`TAIL_CONTINUE` 使用上一条最新且仍有效的 ACCEPT 候选 H1/尾帧作为下一段真实首帧，从 H1 之后直接推进，不复演 H0→H1，也不产生供删除的动作重复区。

`DUPLICATE_HANDOFF` 必须从同一条最新且仍有效的 ACCEPT 候选抽取不同的 H0/H1。下一段先复现 H0→H1，再在 H1 后产生一眼可辨的新内容；剪辑删除下一段开头的重复区。切点取决于实际动作相位和重复边界，不存在固定通用秒数。必须逐项守恒：

1. 人物站位与接触面；
2. 道具数量、持有者与状态；
3. 光位、亮度与色温；
4. 动作的 prepare/contact/reaction/recovery 相位；
5. 银幕方向与摄影机运动方向。

两种方法都要记录摄影机方向、出口/入口速度、焦段、焦点、曝光、环境底、同步声点、接缝机会、裁切规则和 trim plan。只有验收像素真实包含遮挡、前景 wipe、甩镜、闪白、暗帧或运动模糊时，才能把它当作隐藏接缝。

本能力已有受控正向实测，对应 `cap-overlap-handoff`、`cap-multi-video-overlap-handoff-rule`、`kn-069083632f33958d2288`、`kn-e96ba5c04cd576e5020a`、`kn-f691b8cac671f335525f`。当前证据能证明相同条件下产生可剪重复区并继续新内容，尚不能证明跨模型的自动触发隔离和所有互斥压力场景，因此保持 `LIMITED`，不得包装成万能长镜头公式。

完整跨模态流程见 [10-text-image-video-edit-pipeline.md](10-text-image-video-edit-pipeline.md)。

## ReferenceBinding

编号以最终 payload 图片顺序为准。每项记录资产/版本/media、显示名、providerIndex、职责、非职责、是否必须和权威 revision。编译成 `人物名（参考图N）`；正文继续使用人物名。没有真实图片不得产生编号。

作为图生视频逐镜状态载体的 binding 还必须带 `acceptanceProof`：最新 media ACCEPT review、精确媒体/checksum、当前 Shot revision、逐像素审阅，以及人物身份、场景拓扑、空间站位、摄影构图、连续性入口五个验证域。任一后写 REJECT 都撤销旧证明并使 compilation stale。

硬切后的新镜头不强制使用上镜尾帧。复杂动作如果模型不支持故事板，必须阻断或记录明确降级，不能假装支持。

## 时序状态与正典入口

正式制作模式的每个 GenerationUnit 还必须带 `sequenceState`，把同一场景的时间顺序变成机器可验证合同：

- `alreadyHappened`：已在最新接受成片中发生，本段不得重演；
- `thisUnitOnly`：本段唯一允许完成的节拍；
- `reservedForLater`：必须留给后续，本段不得偷跑；
- `plannedStartState/plannedEndState`：结构化入口/出口；后续镜入口必须等于父单元最新 ACCEPT 审片的 `carryForwardState`；
- `feltIntent` 只用于导演规划，编译发送的是 `intentCarriers` 中的摄影机、灯光、表演和声音执行项；
- `extensionDepth/maxExtensionDepth/reanchorPolicy`：按模型和镜头风险配置续接深度，达到上限或提前出现漂移就从已接受 Authority 重锚，不能把固定“2/3 次”包装成普适定律。

三张节拍表两两交叉、父审片不是最新 ACCEPT、实际完成节拍没有写回、入口状态与真实出口不一致，都会在 Provider 调用前阻断。详见 Skill 参考
[`sequence-state-canon-retake-control.md`](../../skills/ununu-cinematic-production/references/sequence-state-canon-retake-control.md)。
