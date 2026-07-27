# nextAction 主循环

UnunuTV 是制片 OS。本地 Agent 只做遥控器。

`workflow short-drama` / `workflow one-shot` 只是启动这个循环的入口适配器。
它们不会调用旧的 `produceShortDramaOnCanvas`，也不会在本地创建分镜、参考图、
Prompt 或视频。Agent 只能提交 Owner brief、锁定事实、已验收 media ID 和决策；
其余编排由 UnunuTV 持久化执行。

## 循环

```text
cinematic-start
  → cinematic-status
  → 读 nextAction.type
  → 执行唯一动作
  → 回到 cinematic-status
  → type=done 结束 / type=failed 停并报告 blocker
```

## 类型对照

| type | 本地动作 |
|---|---|
| `advance` / `run_worker` | 跑 `command.cli` 或 `workflow cinematic-advance` |
| `wait_provider` | 短轮询 status；不另开第二路径 |
| `owner_gate` | 问 Owner，再 `workflow owner-decide` |
| `repair` | 按 `blocker` 修合同/资产后 advance |
| `promote_asset` | `series promote-asset` |
| `commit_ledger` | `series ledger-commit` |
| `done` | 汇总 media / library / ledger |
| `failed` | 报告 `blocker.code`，停止 |

## 禁止

- 忽略 nextAction 自创阶段
- 同时推进多个失败项
- 用 storyboard batch 冒充 production 正式视频
- 手写 Provider content Prompt
- 为缺失资料制造占位图、猜测角色/场景或自动 ACCEPT
- 把 image_reference 静默降级为 text_to_video
