---
name: unutv
description: >
  Operate the local UnunuTV production system through its official loopback
  API or CLI. Use when an Agent must initialize the workspace, create or
  resume projects, inspect or edit the canvas, add or move nodes, connect
  edges, import or generate media, manage assets, run nodes, assemble
  timelines, check a canvas against a local short/long-video project, or run
  the cinematic film-production workflow (story, authority, shot, previs,
  generate, review, edit, deliver).
  Trigger: 操作画布、画布 API、UnunuTV、加节点、连线、摆节点、导入到画布、
  画布与本地项目一起、canvas API、LibTV 式画布、电影工业、低模预演、
  cinematic-start、/unutv、/ununu-canvas-operator、/ununu-cinematic-production.
---

# UnunuTV

Use UnunuTV as the durable production surface shared by the human and any
external Agent. The browser has no embedded Agent. All actors read and write
the same application state through the official API or CLI.

## Boundary

- Decide creative content with the caller or a separate screenplay/directing/asset Skill.
- Use this Skill to persist approved or candidate results as projects, canvas nodes, edges, media, assets, generations, and timeline edits.
- Never open or modify SQLite directly.
- Never create Markdown or JSON business records in a project's visible media directory.
- Never maintain a second project truth in local notes. Temporary reasoning stays ephemeral.
- Treat node payloads and media records as application contracts; do not invent database fields.
- 纯画布任务：有 UnuTV 项目就够，不要为了摆节点去建本地视频项目。
- 画布和本地短/长视频项目一起做：先有本地项目，再跑配对检查。细则只在手册。

## Start Every Operation

1. Call `GET http://127.0.0.1:4318/api/health`.
2. Call `GET http://127.0.0.1:4318/api/workspace`.
3. If the workspace is not initialized, obtain an absolute project-root path from the user and call `POST /api/workspace/initialize`.
4. List projects with `GET /api/projects`.
5. Open the selected project and its root canvas before mutating anything.
6. Inspect existing nodes, edges, media references, and current versions so a resumed Agent continues instead of duplicating work.
7. 任务同时涉及本地视频工作区时，先完成手册里的配对检查，再改画布。

If the API is unavailable, start the repository's local service or use the official CLI. Do not fall back to SQLite.

包装脚本（探活 / 配对检查 / 转发官方 CLI 或 HTTP）：

```bash
node /Users/zhangxiaohao/ununu/ununuAI/ununu-unutv/skills/unutv/scripts/unutv.mjs health
node /Users/zhangxiaohao/ununu/ununuAI/ununu-unutv/skills/unutv/scripts/unutv.mjs paired-check --project ID --canvas ID --local-root ABS
node /Users/zhangxiaohao/ununu/ununuAI/ununu-unutv/skills/unutv/scripts/unutv.mjs cli --help
node /Users/zhangxiaohao/ununu/ununuAI/ununu-unutv/skills/unutv/scripts/unutv.mjs api GET /api/projects
```

## Workspace and Storage

The catalog and per-project databases live under the UnunuTV state directory, normally `~/.unutv`. The user-selected workspace root contains only visible project media:

```text
<workspace root>/
  <project title>/
    Images/
    Videos/
    Audio/
    Worlds/
    .cache/
```

Changing the workspace root affects future projects only. Existing projects retain their registered media root.

## Mutation Rules

- Prefer one small durable mutation per call.
- After creating or updating a node, read the canvas again and verify the returned revision.
- Connect nodes only when the relationship has production meaning.
- Import bytes through media endpoints before attaching their media ID to a node or asset.
- Preserve candidates as versions; set the current version explicitly only after selection.
- Use the timeline API for assembly. Do not copy take files into an ad-hoc edit folder.
- On retry, first inspect whether the intended entity already exists.
- Report application errors verbatim, especially workspace, project-directory, provider, and media errors.
- Never guess `projectId` / `canvasId` from chat memory.
- Expanded nodes that overlap: `workflow canvas-reflow`，再读一遍画布。

## CLI

From the UnunuTV repository, the official CLI is:

```bash
node apps/cli/src/index.mjs workspace status
node apps/cli/src/index.mjs workspace init --root /absolute/project/root
node apps/cli/src/index.mjs project list
node apps/cli/src/index.mjs project create --title "项目名"
node apps/cli/src/index.mjs project open --project PROJECT_ID
node apps/cli/src/index.mjs canvas open --project PROJECT_ID --canvas CANVAS_ID
node apps/cli/src/index.mjs node add --project PROJECT_ID --canvas CANVAS_ID --kind image --title "角色定妆"
node apps/cli/src/index.mjs edge connect --project PROJECT_ID --canvas CANVAS_ID --from NODE_ID --to NODE_ID --role input
node apps/cli/src/index.mjs media import --project PROJECT_ID --file /absolute/path.png --node NODE_ID --kind image
node apps/cli/src/index.mjs run poll --project PROJECT_ID --run RUN_ID
```

All CLI results are JSON. Use `node apps/cli/src/index.mjs help` for the complete current command list.

## 唯一手册

- HTTP / CLI / 配对检查 / 口播配方：[references/api.md](references/api.md)
- 电影工业 nextAction、Authority、审查门：[references/cinematic.md](references/cinematic.md)

不要再写第二份 UnuTV API 说明。
