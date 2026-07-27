# Skill 工作流执行合同

## 目的

Flova 类产品的“输入一次、得到短片”不是把一段长 Prompt 直接交给模型，而是把剧本、视觉圣经、资产权威、分镜、参考图职责、时序、实际成片审片和剪辑状态串成一个可恢复的状态机。UnunuTV 现在用 `UnunuCinematicWorkflowManifest` 把这条链固定下来，避免只靠聊天记忆或文档口号。

## 唯一入口

```bash
unutv workflow cinematic-start \
  --project PROJECT_ID \
  --production PRODUCTION_ID \
  --source-node SCRIPT_NODE_ID \
  --target-duration 30
```

等价 API 是 `POST /api/projects/:projectId/cinematic-workflow/start`；状态通过 `workflow cinematic-status` 或 `GET /api/projects/:projectId/cinematic-workflow/status` 查询。开始动作只持久化 manifest 和 AutomationRun，不调用 Provider。

Manifest 固定保存：

- `skillId` / `skillVersion` / `contractVersion`；
- production 与剧本源节点 ID；
- 目标总时长；
- 13 个有序阶段：剧本分析、块规划、视觉圣经、资产设计、分镜设计、Prompt 编译、生图、生视频、声音、连续性 QA、时间线剪辑、候选渲染、交付 QA；
- 语义参考与首尾帧互斥、标注冲突阻断、局部镜头必须有全景定位图等参考策略；
- `previs_accept_then_single_formal_intent` 执行边界与 `provider_account`
  计费模式；图片可在画布中多轮探索，正式视频在接受低模预演与当前精确预检后
  记录一次提交意图，不读取项目预算，也不显示第二个计费确认表单。

## “一次生成几十秒”的真实含义

一次请求可以启动整条 DAG，但 Provider 仍按其单段时长能力分段生成。长镜头通过真实接受的尾状态、`TAIL_CONTINUE` / `DUPLICATE_HANDOFF` 或有动机的剪切衔接；每段都要审片、写入实际起止状态，再决定下一段。图片阶段可多轮探索；视频阶段在当前预演与预检通过后记录精确单次提交意图，再调用 Provider。不存在项目预算或第二次计费确认表单；任何阶段失败、缺图、冲突或专业否决，都必须暂停而不是用文字假装完成。

## Agent 互操作边界

任何 AI 只要加载本 Skill 并能调用 UnunuTV CLI/API，就能读取 manifest、查询
`nextAction` 并执行唯一获准的阶段。Agent 只是执行器，不拥有另写流程、自由编写
生产 Prompt、跳过阶段或在 Codex/终端/浏览器建立旁路状态的权限。

能力全部投影在画布：Prompt 编译阶段把完整 Prompt 写进 GenerationUnit 的可见
执行节点；每个参考资产必须解析成可见源节点，并以
`cinematic_reference:<role>` 连到消费节点。缺节点、缺连线、Prompt 版本不一致或
图关系在预检后被改动，都会在 Core 层阻断 Provider。模型可以替换，合同不能被
替换：生产绑定媒体节点禁止 `node run` 直跑；必须走 GenerationUnit compile →
preflight → formal intent → Provider run → actual-take review。

## 验证

本合同由 `packages/contracts/src/cinematic-workflow-contracts.mjs`、Core workflow use-case、loopback API 和 CLI 共同实现，并由 Core、API、持久化和直跑拦截测试覆盖。没有 Provider 调用也可以验证入口、持久化、阶段顺序和自动执行边界。
