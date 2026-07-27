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
- `preflight_then_auto_dispatch` 执行边界与 `provider_account` 计费模式；电影工作流不读取项目预算、不显示预算表单，也不等待付费授权。

## “一次生成几十秒”的真实含义

一次请求可以启动整条 DAG，但 Provider 仍按其单段时长能力分段生成。长镜头通过真实接受的尾状态、`TAIL_CONTINUE` / `DUPLICATE_HANDOFF` 或有动机的剪切衔接；每段都要审片、写入实际起止状态，再决定下一段。预检通过后自动调用 Provider，不存在项目预算或付费授权门槛；任何阶段失败、缺图、冲突或专业否决，都必须暂停而不是用文字假装完成。

## Agent 互操作边界

任何 AI 只要加载本 Skill 并能调用 UnunuTV CLI/API，就能读取 manifest、认领阶段、写入合同、查询状态并执行已预检任务。模型可以替换，合同不能被替换：生产绑定媒体节点禁止 `node run` 直跑；必须走 GenerationUnit compile → preflight → Provider run → actual-take review。这样保证“能一次启动”与“能保证精品成片”不被混为一谈。

## 验证

本合同由 `packages/contracts/src/cinematic-workflow-contracts.mjs`、Core workflow use-case、loopback API 和 CLI 共同实现，并由 Core、API、持久化和直跑拦截测试覆盖。没有 Provider 调用也可以验证入口、持久化、阶段顺序和自动执行边界。
