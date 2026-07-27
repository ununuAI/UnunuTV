# V1 一次性硬切迁移记录

迁移 ID：`20260719-cinematic-production-v2-hard-cut`。

## 顺序

1. 对运行目录执行带校验和的全量可恢复备份。
2. 每个含旧生产版本的 project SQLite 在项目 `backups/` 下执行在线 `VACUUM INTO` 备份并记录 SHA-256。
3. 读取所有旧生产版本和对应脚本行版本。
4. 映射 production、story、bible、shot、generation unit；原始旧 document 完整进入只读 `legacyExtensions`。
5. 旧 `videoPrompt` 进入 `legacyPromptText` 且 `needsRecompile=true`；不创建 PromptCompilation。
6. 核对生产版本计数；任何 JSON 或写入失败均回滚整个项目，旧表保留。
7. 全部通过后删除旧表，写入 migration audit。再次运行不重复迁移。

活动代码不提供旧 API 或旧 UI；旧路径返回 404。备份保留至人工抽查完成。当前任务的全量运行目录备份位于 `/Users/zhangxiaohao/.unutv-backups/cinematic-hard-cut-20260719`，SQLite 校验和清单位于其中的 `sqlite-sha256.txt`。
