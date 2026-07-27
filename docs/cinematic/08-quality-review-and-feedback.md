# 电影级质量验收与反馈

生成完成后通过已安装的 `dense-video-analysis` Skill 密集审阅完整时间线，不只看首尾缩略图。同一媒体校验和已经存在完整、通过核验的分析包时直接复用，不得因工作流重跑而重复抽帧、OCR 或 ASR。中间帧和 OCR 文件保留在分析包，不批量登记为知识来源。

`CinematicEvaluationRecord` 绑定准确 run、media、checksum、时长、帧率和音频状态，并记录：

- 计划/实际差异；
- 身份、空间、摄影、灯光、色彩、表演、物理、声音、剪辑和连续性评分；
- 内部切镜和转场；
- 可用区间和真实出口状态；
- 可继承的权威范围；
- `ACCEPT/PARTIAL/REJECT`；
- 失败责任层和修复建议；
- 可反馈知识候选。

只有接受范围可以成为下一段连续性依据。请求成功、Prompt 看起来正确或单帧漂亮都不能替代验收。

采用时序状态合同的单元还必须记录三组结构化结果：

- `takeObservation`：实际起止状态、完成/未完成/意外提前完成节拍、连续性断裂、可接受偏差、置信度与不确定项；
- `canonReconciliation`：哪些观察事实进入或拒绝进入正典、提升的已完成节拍、下一镜 `carryForwardState` 与锁定项；
- `retakeDisposition`：`ACCEPT → KEEP/FIX_IN_POST`，`PARTIAL → FIX_IN_POST/EDIT_SOURCE`，`REJECT → REROLL/REWRITE/REANCHOR`。

`REROLL` 保持原合同不变，只重抽样本；编辑来源、重写或重锚一次只能声明一个改变变量。拒绝候选绝不更新正典，下一镜也不得继承其尾帧、观察状态或看起来“更顺”的局部。意外完成的节拍若获 Owner 接受，必须进入正典并写入下一单元 `alreadyHappened`，否则下一镜会重复剧情。

反馈进入统一知识库时绑定模型、版本、模式、参考职责、参数、成片证据和专业审阅。单次成功只形成 Evidence；重复验证和 Owner 反馈后才能升级。截断 OCR、无证据“最佳 Prompt”、固定十五秒/九宫格等伪通用规则保持 LIMITED 或降权。
