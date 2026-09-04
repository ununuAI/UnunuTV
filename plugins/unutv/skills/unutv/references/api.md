# UnuTV 操作手册（唯一入口）

所有 Agent 调 UnuTV，只读这一份。不要再写第二份 API 说明书。

```text
源码: UNUTV_ROOT；Windows 默认 %LOCALAPPDATA%\Ununu\ununu-unutv，macOS/Linux 默认 ~/.local/share/ununu-unutv
状态: UNUTV_DATA_DIR；未设置时 ~/.unutv
API:  http://127.0.0.1:4318   （仅本机 loopback）
CLI:  node apps/cli/src/index.mjs
UI:   http://127.0.0.1:4318
```

HTTP 与 CLI 做同一件事。CLI 用 `node apps/cli/src/index.mjs --help` 看当前命令。实现与本文冲突时，以正在跑的服务为准，并改这一份。

不要：写 SQLite、直调 Provider、在浏览器里改生产状态、臆造路由或字段、把密钥打进日志。

---

## 每次开工

1. `GET /api/health`
2. `GET /api/workspace`
3. 未初始化则向用户要绝对路径，`POST /api/workspace/initialize` `{"rootPath":"/abs"}`
4. `GET /api/projects`，打开项目：`GET /api/projects/:projectId`
5. 用返回的 `rootCanvasId`（或 `canvases[0].id`）读画布：  
   `GET /api/projects/:projectId/canvases/:canvasId`
6. 先看已有节点 / 边 / 时间线，再改，避免重复建。

没有 `GET /api/projects/:id/canvases` 列表路由。没有 `GET /api/projects/:id/media` 列表路由。画布快照是节点、边、媒体 ID 的权威来源。

---

## 路由

### 工作区 / 项目 / 画布

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 探活 |
| GET | `/api/workspace` | 工作区 |
| POST | `/api/workspace/initialize` | `{"rootPath"}` |
| PUT | `/api/workspace/root` | 只影响之后新建的项目 |
| GET | `/api/projects` | 项目列表 |
| POST | `/api/projects` | `{"title"}` |
| GET | `/api/projects/:projectId` | 含 canvas 列表 |
| PATCH | `/api/projects/:projectId` | 改名 |
| GET | `/api/projects/:projectId/canvases/:canvasId` | 节点+边+组 |
| POST | `/api/projects/:projectId/canvases/:canvasId/nodes` | 加节点 |
| PATCH | `/api/projects/:projectId/nodes/:nodeId` | 改位置/尺寸/payload，带 `revision` |
| DELETE | `/api/projects/:projectId/nodes/:nodeId` | 删节点 |
| POST | `/api/projects/:projectId/edges` | `{"canvasId","fromNodeId","toNodeId","role"}` |
| DELETE | `/api/projects/:projectId/edges/:edgeId` | 删边 |

`role`：生成输入用 `input`。图片节点的所有**入边**都会出现在「+ 添加」里。抽出来的尾帧图不要再把视频连进去，否则会变成错误的生成参考。

### 提示词 / 生成

| 方法 | 路径 |
|---|---|
| GET/PUT | `/api/projects/:projectId/nodes/:nodeId/prompt` |
| POST | `/api/projects/:projectId/nodes/:nodeId/run` |
| POST | `/api/projects/:projectId/runs/:runId/poll` |
| DELETE | `/api/projects/:projectId/runs/:runId` |
| GET | `/api/projects/:projectId/runs` |

### FLUX / ComfyUI

`provider: "flux"` 默认连接本机 `http://127.0.0.1:18188`，也支持用户自有的 HTTPS ComfyUI 网关。仓库不内置任何组织专用地址、Token 或反向隧道配置。远程网关的网络与鉴权由其所有者维护，不得把未鉴权的 ComfyUI 原始端口直接暴露到公网。

在目标 UnunuTV 的“项目与 Provider 设置”保存 ComfyUI API 地址；远程网关需要鉴权时再填写 Token，本机回环地址可留空。Agent 也可调用正式设置 API：

```http
PUT /api/settings/providers
Content-Type: application/json

{
  "fluxBaseUrl": "https://your-comfy-gateway.example",
  "fluxApiToken": "<用户自己的网关 Token>"
}
```

明文分别进入本机 `~/.unutv/secrets/flux-base-url` 与 `~/.unutv/secrets/flux-api-token`（文件 `0600`），读取设置 API 时不回显。保存后无需重启，必须验证：

```http
GET /api/settings/providers/flux/health
```

成功合同：`ok: true`、`state: "ready"`；`tunnel` 为本机 `loopback` 或远程 `authenticated-remote`，并返回该用户实际连接的 GPU 与队列长度。

图片合同：`provider: "flux"`，`modelId: "fluxed-up-v9-fp8"`。支持 1K `size: "768x1024" | "1024x768" | "1024x1024"` 与 2K `size: "1536x2048" | "2048x1536" | "2048x2048"`，`quality: "balanced"` 为 20 步，`"high"` 为 28 步，每次 1 张。无参考图走文生图；恰好 1 张 PNG/JPEG/WebP 参考图时，Provider 上传到 ComfyUI 并用 `LoadImage → ImageScale → VAEEncode` 进入标准 img2img。`referenceDenoise` 可选 `0.45`（强保留）、`0.65`（平衡，默认）、`0.82`（自由变化）；多于 1 张以 `flux_reference_count_unsupported` 阻断，不得静默丢图。男性预设分成两个独立参数：`malePreset: "auto" | "delicate" | "natural" | "athletic"` 控制体型，`maleRegion: "auto" | "east-asian" | "western"` 控制地域外貌；地域外貌默认东亚，体型默认自动识别，“清秀男生”会自动落到清秀纤细。`adult-male-v3` 会在 Provider 提交前编译成年男性、体型、地域外貌与男性解剖约束；清秀和自然预设不加载 MASC，健壮预设才以 0.35 加载。男性裸身使用 Male Nude Anatomy LoRA 1.0，不使用 Lustly 女性先验。原始节点 Prompt 不改写。

H3 本地 ComfyUI：`provider: "minimax"`，`modelId: "MiniMax-H3"`。默认 `h3Profile: "480p_accelerated"`。可选 `720p_accelerated` / `480p_native` / `720p_native`。必须先有确认过的 H3 提交稿。用户没点更高档位时不要改成 720p。

H3 AutoDL 托管 ComfyUI：`provider: "autodl"`，`modelId: "MiniMax-H3"`。它是独立渠道，不替换 `minimax`，也不读取本地 H3 配置。首次使用先配置 ComfyUI 分组 Token：

UnunuTV新建或尚未明确选择模型的视频节点默认使用H3 AutoDL、`768p`；已有节点中明确保存的Provider与分辨率不自动迁移。Seedance只在用户明确要求时选择或建节点。

```http
PUT /api/settings/providers
Content-Type: application/json

{"autodlApiToken":"AutoDL ComfyUI Token"}
```

也可用环境变量 `AUTODL_API_TOKEN`。状态从 `GET /api/settings/providers` 的 `providers.autodl` 读取；明文 Token 不会返回。参考图或参考音频必须能由当前 UnuTV 公网媒体隧道访问，否则 Run 会以 `public_tunnel_not_configured` / `public_tunnel_invalid` 阻塞。

AutoDL H3 已核验工作流（2026-08-21）：

用户侧只暴露生产意图，不要求选择 workflow：0 个参考是“文生视频”；1 张图是“图生视频”；多图或图片＋音频是“多参生视频”。`first_last_frame` 作为图生视频的高级控制。下面的多条 workflow 只由 UnunuTV 根据时长、参考音频和清晰度自动路由，不能原样堆给用户。

| UnuTV 模式 | 条件 | 官方清晰度 | AutoDL workflow_id |
|---|---|---|---|
| `text_to_video` | 1—15 秒 | 480p / 768p | `minimax_h3_lightx2v_no_pic` |
| `image_reference` | 1—10 秒，无音频 | 480p / 768p / 1080p | `minimax_h3_lightx2v_v5` |
| `image_reference` | 11—15 秒，无音频 | 480p / 768p | `minimax_h3_lightx2v_v5_15s` |
| `image_reference` | 1—10 秒，带 1—3 条音频 | 480p / 768p / 1080p | `minimax_h3_image_audio_to_video_v2` |
| `image_reference` | 11—15 秒，带 1—3 条音频 | 480p / 768p | `minimax_h3_image_audio_to_video_v2_15s` |
| `first_last_frame` | 1—15 秒 | 480p / 768p | `minimax_h3_lightx2v` |

提交字段严格按官方：`prompt`、整数 `duration`、官方中文枚举 `resolution`（如 `1080p横`）、可选整数 `seed`，以及顺序连续的 `ref_image_0..8` / `ref_audio_0..2`；首尾帧只使用 `first_frame` / `last_frame`。查询只读取官方 `data.task_id`、`data.status` 与 `data.results[].url`。

AutoDL 当前没有可忠实对应的纯 `first_frame` 工作流；请求会以 `autodl_h3_mode_unsupported` 阻塞，禁止暗中改成多图参考。Motion Context 只走本地 `minimax`，AutoDL 不支持。所有工作流支持 `480p` / `768p`；`1080p` 只用于 1—10 秒 `image_reference`。画幅为 `16:9` / `9:16`；`1:1` 只用于不带参考音频的 `image_reference`。图片最多 9 张，独立音频最多 3 条；带参考音频的 Prompt 最多 10000 字符。

Agent 仍只调用 UnuTV 的 Run/Poll API，不直接调用 AutoDL：

```http
POST /api/projects/:projectId/nodes/:nodeId/run
Content-Type: application/json

{
  "provider": "autodl",
  "request": {
    "model": "MiniMax-H3",
    "mode": "text_to_video",
    "prompt": "已确认的 H3 提交稿",
    "duration": 12,
    "resolution": "480p",
    "aspectRatio": "16:9"
  }
}
```

之后用 `POST /api/projects/:projectId/runs/:runId/poll` 查询。UnuTV 内部按 AutoDL 合同提交到 `POST https://autodl.art/api/v1/comfyui/comfyui_workflow/{workflow_id}`，再查询 `GET .../result/{task_id}`；鉴权头是原始 Token，不加 `Bearer`。成功后立即下载短时效结果 URL 并物化到项目媒体目录。

IndexTTS2 AutoDL 音频：`provider: "autodl"`，`modelId: "IndexTTS2"`，工作流固定为 `indextts2-v1`。这是文字＋参考音频的异步工作流，复用同一个 ComfyUI 分组 Token、Run/Poll 和短时效结果下载链；不新增凭证。当前接入已通过模拟 API 回归，真实付费生成仍须用户对具体任务明确确认。

- 第 1 条音频参考负责音色，映射为 `prompt_simple`。
- 可选第 2 条音频参考负责情绪，映射为 `emo_ref_audio`；只有 1 条时两者共用。
- 参考音频会经现有临时公网媒体隧道发送给 AutoDL；未配置有效隧道时停止，不提交。
- 当前实时 schema 只暴露 `emo_control_method: "与音色参考音频相同"`；`emo_surprised` 被注册成仅允许字符串 `"0"` 的枚举，因此 UnunuTV 要求惊讶强度为 0 并在提交体中省略该字段。其余情绪强度必须在 `0..1`。
- 官方查询成功结果使用 `data.results[].type: "audio"` 和短时效 `url`；UnuTV 立即下载并保存为音频媒体。

```http
POST /api/projects/:projectId/nodes/:nodeId/run
Content-Type: application/json

{
  "provider": "autodl",
  "request": {
    "model": "IndexTTS2",
    "text": "你好，这是一段测试文本",
    "audioReferenceMediaIds": ["音色参考媒体ID", "可选情绪参考媒体ID"],
    "emo_sad": 0,
    "emo_calm": 0.3,
    "emo_angry": 0,
    "emo_happy": 0.5,
    "emo_afraid": 0,
    "emo_random": false,
    "emo_disgusted": 0,
    "emo_melancholic": 0,
    "emo_control_method": "与音色参考音频相同"
  }
}
```

实时参数 schema：`GET https://autodl.art/api/v1/comfyui/workflows/indextts2-v1`。它与页面中的旧 `input_example` 有差异，执行时以前者为准。

H3 Motion Context（仅本地 `minimax`）：

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/settings/providers/minimax/motion-context-capabilities` | 提交前检查四个 Motion Context 节点和当前 H3 支撑链 |
| POST | `/api/settings/providers/minimax/motion-context/install` | 仅在用户明确授权且第三方源码已固定哈希、完成准入审查时安装并重启远端 ComfyUI；不是普通生成步骤 |
| POST | `/api/projects/:projectId/h3-motion-context/export` | 把成功的 Initial/Continue Run 导出为实跑API图，并把已审查的UI模板放进 ComfyUI 命名工作流目录 |

`ready: true` 才能提交。当前已验证测试档是 `480p_accelerated`：8-step、视频 shift 12、音频 shift 3。Motion Context 续窗不能带 `firstFrameMediaId` 或 `lastFrameMediaId`。

### 媒体

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/projects/:projectId/media/import` | 绝对路径导入 |
| POST | `/api/projects/:projectId/media/data` | data URL |
| GET | `/api/projects/:projectId/media/:mediaId` | 原片 |
| POST | `/api/projects/:projectId/media/:mediaId/frame` | 抽帧。**不是** `/extract-frame` |
| POST | `/api/projects/:projectId/media/:mediaId/prepare` | 代理/缩略图 |
| GET | `/api/projects/:projectId/media/:mediaId/preparation` | |
| POST | `/api/projects/:projectId/media/:mediaId/separate-audio` | 人声/背景分离 |
| POST | `/api/projects/:projectId/media/:mediaId/qa-sheet` | 三帧联系表 |

抽帧 body：`{"seconds":5.12,"nodeId":"尾帧图片节点","title":"S01 尾帧"}`  
CLI：`media extract-frame --project P --media M --seconds 5.12 --node NODE --title T`

分离 body：`{"sourceNodeId":"视频节点ID","title":"S01"}`，`nodeId` 也可。  
会在画布上建 3 个音频节点（原始混音 / 人声候选 / 背景候选），并从**视频指出去**。结果是候选，要听，不能当正式成片。

### 时间线 / 导出

| 方法 | 路径 |
|---|---|
| GET/POST | `/api/projects/:projectId/timelines` |
| GET | `/api/projects/:projectId/timelines/:timelineId` |
| POST | `.../tracks` `.../tracks/reorder` |
| PATCH/DELETE | `.../tracks/:trackId` |
| POST | `.../clips` |
| PATCH | `.../clips/:clipId` |
| POST | `.../clips/:clipId/move\|trim\|split\|ripple\|slip\|snap` |
| POST | `.../undo` `.../redo` `.../resource-undo` `.../resource-redo` |
| POST/PATCH/DELETE | `.../transitions` `.../effects` `.../markers` `.../keyframes` |
| POST | `.../render-jobs` |
| GET | `/api/projects/:projectId/render-jobs` |
| POST | `.../render-jobs/:id/cancel\|resume` |
| POST | `.../render-jobs/:id/delivery-packages` |

默认轨：`0` 视频，`1` 音频，`2` 字幕。

**没有删片段接口。** 没有独立 `/subtitles`。没有独立变速接口。

渲染 preset：`h264_review` `h265_delivery` `prores_master` `h264_vertical` `h264_square` `wav_mix`。

---

## 模式约束（必须看）

H3 / MiniMax 一次只能走一种：

| 模式 | 可传 | 不可传 |
|---|---|---|
| `first_frame` | 提示词 + **正好 1 张**首帧图 | 第二张图、参考视频、**参考音频** |
| `first_last_frame` | 提示词 + 首帧 + 尾帧 | 其它参考、音频 |
| `image_reference` | 最多 9 张参考图 | 不能同时指定首/尾帧 |
| `text_to_video` | 只有提示词 | 任何图 |

`generateAudio: true` 只表示模型自己出声，**不会上传**连上的音频节点。  
首帧模式卡片上不应出现「音色」进线；连了也不会进提交稿，UI 会标红。

画面链式续接（上一段尾帧当下一镜首帧）**不锁音色**。同一把嗓子只能：改走全能参考（图+音频，且不能再标首帧），或后期换声。

Motion Context 不是尾帧续接。它从上一窗采样器输出保存 H3 AV latent，并在下一窗加载 latent 同时继承画面运动与声音状态。只有 MP4、只有尾帧、或只有视频参考都不能替代这份 latent。

---

## 连线对不对

正确：

```text
剧本 → 分镜
首帧图 --input--> S01 视频 --(抽帧)--> S01 尾帧图 --input--> S02 视频 → …
S01 视频 --cinematic_audio:*--> 人声/背景节点   （分离结果，指出去）
```

错误：

- 视频 `--input-->` 尾帧图：尾帧会变成「再生成」的图片槽
- 人声 `--input-->` 首帧模式视频：第二格「音色」无效，模型收不到
- 视频直连视频：跳过尾帧图，别人看不出续接点

尾帧是抽出来的静帧节点，不是生成节点。

---

## 任务配方

### A. 打开或新建项目

```http
GET  /api/health
GET  /api/projects
POST /api/projects                    {"title":"项目名"}
GET  /api/projects/:projectId
GET  /api/projects/:projectId/canvases/:canvasId
```

同名目录已存在会失败。先读画布，不要重复建节点。

### B. 口播：首帧图 → 链式视频 → 尾帧图

1. 建 `image` 节点，写 prompt，连到视频节点，`run` 出首帧。
2. 建 `video` 节点。模式 `first_frame`。只连 **一张** 首帧图。H3：`minimax` / `MiniMax-H3` / `480p_accelerated`。
3. 视频完成后：再建一个 `image` 节点当尾帧（不要把视频连进这个图）。
4. `POST /media/:videoMediaId/frame` `{"seconds":5.12,"nodeId":尾帧节点,"title":"S01 尾帧"}`
5. `尾帧图 --input--> 下一镜视频`（作为下一镜唯一首帧）。
6. 重复 2–5。

### B2. H3 Motion Context：超过15秒连续镜头

这条配方只用于真正的一镜连续生成。普通切镜仍按正式窗口独立生成，不要为了“更长”强行串 latent。

#### 1. 固定会话与参考

- 两窗使用同一个 `sessionId`，只能包含字母、数字、下划线或连字符。
- `clipIndex` 从 1 递增。首窗 `initial/1`，续窗 `continue/2`，第三窗 `continue/3`。
- 两窗的身份、场景、道具参考必须保持同一含义和原有顺序；不要让 `Picture 3` 在下一窗从人物变成场景。
- 只控制初始站位的标注图可仅挂首窗。若镜头在首窗内已经演化，续窗不要再挂原始站位图把构图拉回起点。
- 标注图进入参考时，Prompt 必须明确只继承空间站位，排除轮廓、箭头、标签、文字、框线和UI标记。

#### 2. 首窗：生成视频并保存 Latent 1

```http
POST /api/projects/:projectId/nodes/:nodeId/run
Content-Type: application/json

{
  "provider": "minimax",
  "request": {
    "model": "MiniMax-H3",
    "mode": "image_reference",
    "duration": 10,
    "resolution": "480p",
    "h3Profile": "480p_accelerated",
    "aspectRatio": "16:9",
    "seed": 2026082101,
    "referenceMediaIds": ["Picture1媒体ID", "Picture2媒体ID"],
    "h3MotionContext": {
      "phase": "initial",
      "sessionId": "shot-longtake-v1",
      "clipIndex": 1,
      "contextFrames": 22,
      "audioContextFrames": 24
    }
  }
}
```

首窗图中会新增 `MiniMaxH3MotionContextSaveLatent`，固定保存到隔离命名空间：

```text
ComfyUI/output/h3_context/unutv-mc/<sessionId>/clip_00001.safetensors
```

必须轮询到 Run `succeeded`。第一窗失败、阻塞、节点报错或没有成功执行 SaveLatent 时，禁止提交第二窗。

#### 3. 续窗：加载 Latent 1，裁掉上下文重叠

```http
POST /api/projects/:projectId/nodes/:nodeId/run
Content-Type: application/json

{
  "provider": "minimax",
  "request": {
    "model": "MiniMax-H3",
    "mode": "image_reference",
    "duration": 14,
    "resolution": "480p",
    "h3Profile": "480p_accelerated",
    "aspectRatio": "16:9",
    "seed": 2026082102,
    "referenceMediaIds": ["保持原含义和顺序的基础参考媒体ID"],
    "h3MotionContext": {
      "phase": "continue",
      "sessionId": "shot-longtake-v1",
      "clipIndex": 2,
      "contextFrames": 22,
      "audioContextFrames": 24
    }
  }
}
```

续窗执行链：

```text
LoadLatent(1)
  → MotionContext(视频22帧 / 音频24帧)
  → 原H3双shift采样
  → SaveLatent(2)
  → AV Decode
  → MotionContextTrim（画面和音频一起裁）
  → 保存续窗新增内容
```

续窗不要传上一段 MP4、尾帧图、`firstFrameMediaId` 或 `lastFrameMediaId`。Prompt 描述下一段动作，但必须写清继承的镜位、姿态、视线、动作相位、光线和声场，不重复上一窗已经完成的动作。

#### 4. 合成长视频

把首窗完整视频放在时间线起点，把已经经过 `MotionContextTrim` 的续窗紧接其后。不要再手工裁一次22帧，也不要加溶解转场。

```http
POST /api/projects/:projectId/timelines
POST /api/projects/:projectId/timelines/:timelineId/clips
POST /api/projects/:projectId/timelines/:timelineId/render-jobs
```

两段都保留模型生成的嵌入音频。渲染完成后检查技术 QC，并人工对比首窗最后几帧与续窗最前几帧的镜位、人物、动作速度、光线、背景和声场。

#### 5. 保存、恢复与删除边界

- UnuTV Run 记录持久保存 Prompt、参数、Comfy `taskId`、提交图、媒体结果和 Motion Context 会话信息，可以重建图。
- ComfyUI 默认保留本次 API 图在执行历史中，但 UnuTV 不会自动把它另存为一个命名工作流 JSON。
- 清空 ComfyUI 历史不会删除 UnuTV Run 记录；但删除 `output/h3_context/unutv-mc/<sessionId>/` 下的 latent 后，就不能继续下一窗。
- 重跑同一 `clipIndex` 会覆盖该固定 latent 槽；拒绝一个续窗后可换 seed 重跑该窗，它仍加载上一索引并覆盖自己的槽。
- 不要把测试会话和正式项目共用 `sessionId`，不要清理其他项目的 latent 或输出。

#### 6. 导出到 ComfyUI

导出必须来自两个已成功的 UnuTV Run，不接受聊天里拼装或手填的图。UI模板必须是合法 ComfyUI工作流，含 `nodes` 与 `links` 数组。

```http
POST /api/projects/:projectId/h3-motion-context/export
Content-Type: application/json

{
  "initialRunId": "成功的initial Run ID",
  "continuationRunId": "成功的continue Run ID",
  "prefix": "UnuTV-H3-MotionContext-LongTake-v1",
  "uiTemplate": { "nodes": [], "links": [] }
}
```

输出位置：

```text
ComfyUI/user/default/workflows/UnuTV-H3-MotionContext/<prefix>-UI-Template.json
ComfyUI/output/h3_context/exports/<prefix>-Initial-Executed.api.json
ComfyUI/output/h3_context/exports/<prefix>-Continue-Executed.api.json
```

- UI模板会出现在 ComfyUI 的命名工作流目录，用于查看、学习和编辑。
- 两份 `.api.json` 是本次真实执行图；可通过 ComfyUI“打开文件”导入，前端会把API图转换成可视节点。
- API图比通用UI模板更能精确证明本次实际模型、Prompt、参考文件、8-step、双shift、Latent索引和Trim接线。
- 同名远端文件存在时，UnuTV先移动到 `/root/autodl-tmp/unutv-backups/h3-workflow-export-*` 再写新文件。
- 导出不删除 Comfy历史、Latent、Run记录或生成媒体，也不需要重启 ComfyUI。

### C. 入轨 / 剪头尾定格 / 字幕

```http
POST /timelines                                          没有则创建
POST /timelines/:id/clips
  视频: {"nodeId","mediaId","track":0,"startMs","durationMs","payload":{"title"}}
  字幕: {"nodeId":剧本节点,"mediaId":null,"track":2,"startMs","durationMs","payload":{"text":"台词"}}
POST /timelines/:id/clips/:clipId/trim
  {"startMs","durationMs","trimInMs"}
```

24fps 切 3 帧定格：`trimInMs=125`，`durationMs=源时长-250`，下一段 `startMs` 接上一段结尾。字幕 `startMs/durationMs` 与视频对齐。

播放器预览会叠字幕轨；导出是否烧字幕看渲染实现，不要默认已经烧进文件。

旁白视频声音使用独立音频职责轨。轨道 `payload.role` 可为 `narration`、`music`、`ambience` 或 `sfx`；片段可用同名 `payload.role` 覆盖。音乐轨用 `fadeInMs`、`fadeOutMs` 和 `ducking`，旁白轨可在 `soundMix` 设置最终归一目标：

```json
{
  "role": "music",
  "fadeInMs": 1200,
  "fadeOutMs": 1800,
  "ducking": {
    "enabled": true,
    "threshold": 0.05,
    "ratio": 8,
    "attackMs": 20,
    "releaseMs": 300
  }
}
```

```json
{
  "role": "narration",
  "soundMix": {
    "normalize": true,
    "targetLufs": -16,
    "truePeakDbtp": -1.5
  }
}
```

片段 `payload.volume` 是线性增益。渲染器会按职责分总线、让旁白触发音乐 `sidechaincompress`、应用音乐淡入淡出，再按可选 `soundMix` 归一。环境和拟音不自动 duck；需要压低时直接给各自片段音量。目标参数仍须在成片上实测，配置值不是验收结果。

### D. 人声 / 背景

```http
POST /media/:mediaId/separate-audio
{"sourceNodeId":"视频节点ID","title":"S01"}
```

听过再决定是否铺进 A 轨。不要把分离结果连回首帧模式的视频生成口。

### E. 导出

```http
POST /timelines/:id/render-jobs
{"outputNodeId":"画布上的 compose/video 节点","preset":"h264_vertical"}
```

必须有可见输出节点。

### F. 画布 + 本地视频项目

先分范围，再动手：

- `canvas_only`：用户只要一次性画布、摆节点、导入或查看。不要去建本地视频项目。
- `paired`：用户要把画布和短/长视频生产一起做，要把剧本/导演/资产/分镜放到画布上，或项目落在带 `.ununu-workspace.json` 的工作区里。

`paired` 失败即停：

1. 先由本地视频工作区用 `脚本/建项目.py` 建好或打开系列根 / 单片根 / 分集根。
2. 记下绝对路径 `localProjectRoot`。这个目录还不存在时，不要建 UnuTV 项目。
3. 再建或打开对应的 UnuTV 项目，拿到 `canvasId`。
4. 跑配对检查：

```bash
node <当前unutv-Skill目录>/scripts/unutv.mjs \
  paired-check --project ID --canvas ID --local-root ABS
```

5. 改完画布后再读一遍画布，再跑一次配对检查。

本地根不存在：停，报 `PAIRED_PROJECT_CONTEXT_REQUIRED`，不要偷偷改成纯画布项目。  
旧画布没有对应本地项目：先停写画布，修本地项目，检查通过再继续。  
配对只证明两边身份都在，不会自动把剧本或生产文件镜像进节点。

本地侧必须是其中一种；现行 AI 影视工作区优先使用 Markdown 合同，旧 JSON 合同只保留兼容读取：

- 单片/单集：`项目.md` + `判据.md` + `总分镜表.md` + `01-分镜剧本/` + `02-风格/` + `03-资产/` + `04-场次/` + `99-历史/`，且 `项目.md` 的 `生产单元` 为“单片”或“单集”
- 系列根：`系列.md` + `判据.md` + `01-分镜剧本/` + `02-风格/` + `03-资产/` + `分集/` + `99-历史/`
- 旧 Markdown 项目的 `01-剧本/` 只做兼容读取；新建或已迁移项目必须使用 `01-分镜剧本/`。

- `系列.json` + `series_ledger.json`
- `项目.json` + `production_ledger.json` + `00-制片/video_unit_context.json`

## 节点批量并发生成

多张互不依赖的图片不得靠客户端同时保持几十条长 HTTP 请求，也不得给单节点 `run` 人为设置短超时后把本地 `queued` 当成已提交。使用长驻 UnunuTV 服务中由 Core 拥有的后台批次：

```bash
POST /api/projects/:projectId/nodes/run-batch
{"nodeIds":["node-1","node-2"],"concurrency":8}
```

接口立即返回 `202`，后台在长驻服务进程中按 `concurrency` 并发执行；允许值为 `1..50`。不要从一次性 CLI 进程直接启动后台批次：CLI 退出会关闭它自己的数据库连接，实测会以 `ERR_INVALID_STATE / database is not open` 阻断。已有 `queued/running` run 或已被另一批次预留的节点会进入 `skippedNodeIds`，禁止重复付费提交。批次只解决同一阶段内互不依赖节点的并发，不得越过场景锚、用户采用或其他正式工作流门禁。

服务重启后，如果旧同步图片请求留下 `queued` 且没有远端 `taskId`，默认仍然跳过，禁止擅自重试付费请求。只有 Owner 明确接受未知结果可能造成的一次重复风险后，才可在批次正文设置 `"replaceOrphanedQueued":true`。Core 会先把旧 run 记为 `orphaned_synchronous_submission_after_restart / paidOutcomeUnknown:true`，保留历史追踪，再为同一节点创建新 run；不得直接删除或改 SQLite。

已有 run 为 `paid_submission_outcome_unknown` 时同样默认进入 `skippedNodeIds`。只有 Owner 明确放弃旧未知结果并授权承担重复风险后，才可设置 `"abandonUnknownSubmissions":true`。Core 必须先把旧 run 追加 `ownerAbandonedUnknownOutcome / supersededByBatchId / supersededAt`，保留原 Request ID，再创建新 run；这项授权不能由自动化默认开启，也不能跨批次继承。

别的 Skill 已经写好的文件，只往画布上放，不要改写。新出图不是「已有文件」：必须建 `image` 节点、写 prompt、对该节点 `run`。禁止场外生成再 import。

| 已有文件 | 节点 kind | 做法 |
|---|---|---|
| 剧本 / 故事 markdown | `text` | `node add`，正文或路径放进 `payload` |
| 分镜脚本 | `script` | `node add`，生成前不要填 `payload.scriptDocument.rows` |
| 已经存在、用户接受过的人物 / 场景 / 道具图 | `asset` 或 `image` | `media import --file ABS --node ID --kind image` |
| 新出的人物 / 场景 / 道具图 | `image` | `node add` → 写 prompt → 参考入边 → `node run` |
| 音频样本 | `audio` | `media import --file ABS --node ID --kind audio` |
| 成片 / take | `video` | `media import --file ABS --node ID --kind video` |
| 导演 / 分镜笔记 | `director` 或 `shot` | `node add`，不要另编译一份计划 |

参考连到消费者：`edge connect --from SOURCE --to CONSUMER --role input`。  
现场画布同类边没用过 `cinematic_reference:*` 时，不要自己发明这个 role。

重叠节点：`node apps/cli/src/index.mjs workflow canvas-reflow --project ID`，再打开画布确认。

配对任务的回报必须带上 `localProjectRoot`、本地类型/ID，以及最后一次成功的 `paired-check`。任一边没读回来，就不要说它存在。

---

## CLI 对照

在 `UNUTV_ROOT`（或上方平台默认源码目录）运行：

```bash
node apps/cli/src/index.mjs project list
node apps/cli/src/index.mjs project open --project ID
node apps/cli/src/index.mjs canvas open --project ID --canvas ID
node apps/cli/src/index.mjs node add --project ID --canvas ID --kind video --title "S01"
node apps/cli/src/index.mjs edge connect --project ID --canvas ID --from A --to B --role input
node apps/cli/src/index.mjs media extract-frame --project ID --media MID --seconds 5.12 --node TAIL --title "S01 尾帧"
node apps/cli/src/index.mjs media separate-audio --project ID --media MID --node VIDEO
node apps/cli/src/index.mjs timeline get --project ID --timeline TID
```

电影工业 workflow（`cinematic-start/status/advance`、Authority、审查门）读同目录 [cinematic.md](cinematic.md)。那些门禁规则不在本文展开；**所有 HTTP/CLI 怎么调，仍以本文为准。**

---

## 还没有的接口

- 删除时间线片段
- 独立 `/subtitles`（用 clip + `track` 字幕轨）
- 变速 / 倒放
- 首帧模式上传参考音频（H3 官方禁止与首帧混用）
- `GET /media` 列表（从画布节点的 `currentMediaId` 读）
- `POST /api/ai-film/projects/resolve`（当前环境可能 404，用 `GET/POST /api/projects`）
