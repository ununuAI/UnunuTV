# 2026-07-23 Cinematic Workflow Manifest

## 本次完成

- 新增版本化 `UnunuCinematicWorkflowManifest` 合同，固定 Skill/version、production/source、目标时长、13 阶段、参考图静态职责和先预检后授权付费边界。
- 新增 Core `startCinematicWorkflow` / `getCinematicWorkflowStatus`，manifest 与 AutomationRun configuration 一起持久化，可从任务状态恢复。
- 新增官方 CLI `workflow cinematic-start|cinematic-status` 与 loopback API `/cinematic-workflow/start|status`。
- 生产绑定的 image/video/audio 节点直跑现在 fail closed，必须先走 GenerationUnit compile/preflight。
- 增加 Core/API/持久化/直跑门禁测试；本次没有 Provider 调用、没有画布或生产资源变更。

## 诚实边界

这使“一个请求启动几十秒短片的完整编排”成为真实产品能力，但不承诺一个模型一次请求就输出完美成片。最终质量仍取决于故事、分镜、参考图像素、时序合同、实际成片审片、连续性修复、Provider 能力和 Owner 付费授权。
