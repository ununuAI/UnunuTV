# AutoDL.Art MiniMax H3 直连 API 文档

> 面向第三方 AI、Agent、后端服务和自动化脚本。调用方直接请求 AutoDL.Art，不经过 UnunuTV。
>
> 核验日期：2026-08-21  
> 官方总文档：<https://autodl.art/docs/comfyui_api/>  
> H3 工作流页：<https://autodl.art/large-model/comfyui/minimax_h3_lightx2v_v5>

## 1. 调用方只需要理解三种意图

| 调用意图 | 输入 | 后台路由 |
|---|---|---|
| 文生视频 | Prompt，无参考媒体 | H3 文生视频 workflow |
| 图生视频 | Prompt＋1 张参考图 | H3 多图参考 workflow，只有 `ref_image_0` |
| 多参生视频 | Prompt＋多图，或图片＋音频 | H3 多图参考 / 多图多音频 workflow |

首尾帧是图生视频的高级控制，不需要作为第四种普通能力展示。

AutoDL.Art 页面上的多条 workflow 主要是在拆分：

- 1—10 秒与 11—15 秒；
- 无参考音频与有参考音频；
- 1080p 与非 1080p。

调用方应根据本页路由表自动选择 `workflow_id`，不要让最终用户手选 workflow。

## 2. 基础协议

### Base URL

```text
https://autodl.art
```

### 鉴权

```http
Authorization: YOUR_COMFYUI_TOKEN
Content-Type: application/json
```

注意：`Authorization` 的值直接填写 AutoDL.Art「令牌管理」中分组为 `ComfyUI` 的 Token，不加 `Bearer ` 前缀。

推荐通过环境变量传入：

```bash
export AUTODL_API_TOKEN="YOUR_COMFYUI_TOKEN"
```

### 提交任务

```http
POST /api/v1/comfyui/comfyui_workflow/{workflow_id}
```

提交成功只表示任务进入队列，返回的 `data.task_id` 用于后续查询。

### 查询任务

```http
GET /api/v1/comfyui/comfyui_workflow/result/{task_id}
```

常见状态：

```text
QUEUED   排队中
RUNNING  生成中
SUCCESS  成功
FAILED   失败
```

部分工作流响应可能使用 `completed`；调用方应将大小写不敏感的 `SUCCESS`、`SUCCEEDED`、`COMPLETED`、`COMPLETE`、`DONE` 都视为成功终态。

## 3. 自动路由表

| 意图 | 条件 | workflow_id | 时长 | 清晰度 |
|---|---|---|---|---|
| 文生视频 | 无参考媒体 | `minimax_h3_lightx2v_no_pic` | 1—15 秒 | 480p / 768p |
| 图生/多参 | 1—9 张图、无音频、≤10 秒 | `minimax_h3_lightx2v_v5` | 1—10 秒 | 480p / 768p / 1080p |
| 图生/多参 | 1—9 张图、无音频、>10 秒 | `minimax_h3_lightx2v_v5_15s` | 11—15 秒 | 480p / 768p |
| 多参 | 1—9 张图、1—3 条音频、≤10 秒 | `minimax_h3_image_audio_to_video_v2` | 1—10 秒 | 480p / 768p / 1080p |
| 多参 | 1—9 张图、1—3 条音频、>10 秒 | `minimax_h3_image_audio_to_video_v2_15s` | 11—15 秒 | 480p / 768p |
| 高级首尾帧 | 首帧＋尾帧 | `minimax_h3_lightx2v` | 1—15 秒 | 480p / 768p |

路由伪代码：

```js
function selectWorkflow({ intent, duration, audioUrls = [] }) {
  if (intent === "text") return "minimax_h3_lightx2v_no_pic";
  if (intent === "first_last") return "minimax_h3_lightx2v";

  const long = duration > 10;
  const withAudio = audioUrls.length > 0;

  if (withAudio) {
    return long
      ? "minimax_h3_image_audio_to_video_v2_15s"
      : "minimax_h3_image_audio_to_video_v2";
  }

  return long
    ? "minimax_h3_lightx2v_v5_15s"
    : "minimax_h3_lightx2v_v5";
}
```

## 4. `resolution` 官方枚举

API 不接收独立的 `aspect_ratio`。清晰度和画幅必须编译成官方中文枚举，写入 `resolution`。

### 文生视频 / 首尾帧

```text
480p横
480p竖
768p横
768p竖
```

### 图生/多参，无参考音频，≤10 秒

```text
480p横
480p竖
768p横
768p竖
1080p横
1080p竖
480p(1:1)
768p(1:1)
1080p(1:1)
```

### 图生/多参，无参考音频，11—15 秒

```text
480p横
480p竖
768p横
768p竖
480p(1:1)
768p(1:1)
```

### 多参，带参考音频，≤10 秒

```text
480p横
480p竖
768p横
768p竖
1080p横
1080p竖
```

### 多参，带参考音频，11—15 秒

```text
480p横
480p竖
768p横
768p竖
```

约束总结：

- 1080p 只用于图生/多参且时长不超过 10 秒；
- 带参考音频时不支持 `1:1`；
- 15 秒任务不支持 1080p。

## 5. 参考媒体要求

参考媒体字段只接受 AutoDL.Art 能直接下载的 URL。

不允许：

```text
/Users/name/image.png
file:///Users/name/image.png
http://127.0.0.1:4318/image.png
http://localhost/image.png
```

调用方必须先把文件上传到自己的对象存储、CDN或带签名的 HTTPS 下载地址，再把 URL 交给 API。

要求：

- URL 无需浏览器 Cookie 或额外请求头即可下载；
- 签名 URL 的有效期应覆盖排队、生成和下载时间；
- 图片支持 JPG / PNG / WebP；
- 音频支持 MP3 / WAV / MP4 / FLAC；
- 图片最多 9 张：`ref_image_0` 到 `ref_image_8`；
- 音频最多 3 条：`ref_audio_0` 到 `ref_audio_2`；
- 编号必须从 0 开始连续，不要跳号。

## 6. 文生视频

### 请求

```bash
curl -X POST \
  "https://autodl.art/api/v1/comfyui/comfyui_workflow/minimax_h3_lightx2v_no_pic" \
  -H "Authorization: ${AUTODL_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A cinematic tracking shot through a quiet indoor swimming pool.",
    "duration": 10,
    "resolution": "768p横"
  }'
```

### Body

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `prompt` | string | 是 | 视频提示词 |
| `duration` | integer | 否 | 1—15，默认 5 |
| `resolution` | string | 否 | 480p/768p 横竖枚举 |

## 7. 图生视频

图生视频直接复用多图参考 workflow，只传一张图：`ref_image_0`。

注意：这是“单图参考生视频”，不是严格锁定首帧像素的独立首帧 workflow。

### ≤10 秒，可用 1080p

```bash
curl -X POST \
  "https://autodl.art/api/v1/comfyui/comfyui_workflow/minimax_h3_lightx2v_v5" \
  -H "Authorization: ${AUTODL_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "The swimmer steps onto the starting block and looks down the lane.",
    "duration": 10,
    "resolution": "1080p横",
    "seed": 2026082101,
    "ref_image_0": "https://cdn.example.com/character.png"
  }'
```

### 11—15 秒

把 workflow 改为：

```text
minimax_h3_lightx2v_v5_15s
```

并把清晰度限制为 480p 或 768p。

## 8. 多参生视频：多图

```bash
curl -X POST \
  "https://autodl.art/api/v1/comfyui/comfyui_workflow/minimax_h3_lightx2v_v5" \
  -H "Authorization: ${AUTODL_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Subject 1 and Subject 2 stand beside the starting blocks in the pool from Picture 3.",
    "duration": 8,
    "resolution": "768p横",
    "seed": 2026082102,
    "ref_image_0": "https://cdn.example.com/subject-1.png",
    "ref_image_1": "https://cdn.example.com/subject-2.png",
    "ref_image_2": "https://cdn.example.com/pool.png"
  }'
```

`ref_image_0..8` 的顺序必须与 Prompt 中的 Picture/Subject 绑定顺序一致。

## 9. 多参生视频：图片＋音频

### ≤10 秒，可用 1080p

```bash
curl -X POST \
  "https://autodl.art/api/v1/comfyui/comfyui_workflow/minimax_h3_image_audio_to_video_v2" \
  -H "Authorization: ${AUTODL_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Subject 1 speaks in Chinese while Subject 2 listens and reacts naturally.",
    "duration": 10,
    "resolution": "1080p横",
    "seed": 2026082103,
    "ref_image_0": "https://cdn.example.com/subject-1.png",
    "ref_image_1": "https://cdn.example.com/subject-2.png",
    "ref_audio_0": "https://cdn.example.com/voice-1.wav",
    "ref_audio_1": "https://cdn.example.com/voice-2.wav"
  }'
```

### 11—15 秒

把 workflow 改为：

```text
minimax_h3_image_audio_to_video_v2_15s
```

限制：

- 只支持 480p/768p 横竖；
- 不支持 `1:1`；
- Prompt 最多 10000 字符。

## 10. 高级：首尾帧控制

```bash
curl -X POST \
  "https://autodl.art/api/v1/comfyui/comfyui_workflow/minimax_h3_lightx2v" \
  -H "Authorization: ${AUTODL_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "The camera completes a controlled push-in while preserving identity and environment continuity.",
    "duration": 10,
    "resolution": "768p横",
    "first_frame": "https://cdn.example.com/first-frame.png",
    "last_frame": "https://cdn.example.com/last-frame.png"
  }'
```

首尾帧模式只使用：

```text
first_frame
last_frame
```

不要同时传 `ref_image_*` 或 `ref_audio_*`。

## 11. 提交响应

```json
{
  "code": "Success",
  "data": {
    "task_id": "2a25da1d-39ad-495c-8dac-bae8e8f6b1a1",
    "workflow": "H3文生视频",
    "status": "QUEUED",
    "client_id": "8c93a8000ef50e05d5314014756bd62c",
    "message": "工作流任务已提交",
    "created_at": "2026-08-18T11:33:02.456421825+08:00"
  },
  "msg": "",
  "request_id": "8c93a8000ef50e05d5314014756bd62c"
}
```

必须持久化：

```text
data.task_id
request_id
提交时的 workflow_id
完整请求参数
```

## 12. 查询与成功响应

```bash
curl \
  "https://autodl.art/api/v1/comfyui/comfyui_workflow/result/${TASK_ID}" \
  -H "Authorization: ${AUTODL_API_TOKEN}"
```

成功后：

```json
{
  "code": "Success",
  "data": {
    "task_id": "2a25da1d-39ad-495c-8dac-bae8e8f6b1a1",
    "status": "SUCCESS",
    "results": [
      {
        "url": "https://temporary-download.example/video.mp4",
        "type": "video",
        "file_type": "mp4",
        "output_type": "output"
      }
    ]
  },
  "msg": "",
  "request_id": "8c93a8000ef50e05d5314014756bd62c"
}
```

`results[].url` 有效期较短。任务成功后必须立即下载并保存到自己的持久存储。

## 13. 可直接复用的 JavaScript 客户端

```js
const BASE_URL = "https://autodl.art/api/v1/comfyui/comfyui_workflow";
const SUCCESS = new Set(["SUCCESS", "SUCCEEDED", "COMPLETED", "COMPLETE", "DONE"]);
const FAILED = new Set(["FAILED", "ERROR", "CANCELLED", "CANCELED", "EXPIRED"]);

function headers(token) {
  return {
    Authorization: token,
    Accept: "application/json",
    "Content-Type": "application/json"
  };
}

async function readJson(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || (payload.code && payload.code !== "Success")) {
    throw new Error(payload.msg || payload.message || `AutoDL HTTP ${response.status}`);
  }
  return payload;
}

export async function submitH3({ token, workflowId, body }) {
  const response = await fetch(`${BASE_URL}/${workflowId}`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify(body)
  });
  const payload = await readJson(response);
  const taskId = payload?.data?.task_id;
  if (!taskId) throw new Error("AutoDL response missing data.task_id");
  return { taskId, payload };
}

export async function queryH3({ token, taskId }) {
  const response = await fetch(`${BASE_URL}/result/${encodeURIComponent(taskId)}`, {
    headers: headers(token)
  });
  return readJson(response);
}

export async function waitForH3({ token, taskId, intervalMs = 1000 }) {
  for (;;) {
    const payload = await queryH3({ token, taskId });
    const status = String(payload?.data?.status || "QUEUED").toUpperCase();
    if (FAILED.has(status)) throw new Error(payload.msg || `AutoDL task ${status}`);
    if (SUCCESS.has(status)) {
      const url = payload?.data?.results?.find((item) => item.type === "video")?.url
        || payload?.data?.results?.[0]?.url;
      if (!url) throw new Error("AutoDL task succeeded without a result URL");
      return { url, payload };
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
```

## 14. 第三方 AI 推荐输入合同

第三方 AI 可以统一输出以下结构，再由固定代码编译成具体 workflow 请求：

```json
{
  "intent": "text | image | multi | first_last",
  "prompt": "最终视频 Prompt",
  "duration": 10,
  "resolution": "1080p",
  "aspectRatio": "16:9",
  "seed": 2026082101,
  "imageUrls": ["https://cdn.example.com/reference.png"],
  "audioUrls": []
}
```

编译规则：

1. 校验 `duration` 为 1—15 的整数。
2. 根据意图、时长和音频数量选择 workflow。
3. 把 `resolution`＋`aspectRatio` 编译成官方 `resolution` 枚举。
4. 按数组顺序生成 `ref_image_0..8` / `ref_audio_0..2`。
5. 严格排除不兼容组合：15 秒＋1080p、参考音频＋1:1。
6. 提交后只保存 `task_id`，通过查询接口等待完成。
7. 成功后立即下载临时结果 URL。

## 15. 错误处理

调用方必须同时检查：

- HTTP 状态码是否为 2xx；
- JSON `code` 是否为 `Success`；
- `data.status` 是否进入失败终态；
- 成功时 `data.results` 是否包含视频 URL。

不要在网络超时后盲目重复提交付费任务。若提交响应丢失，应先通过自己的请求日志、AutoDL.Art 调用日志和 `request_id` 排查，避免重复计费。

## 16. 安全要求

- 不要把 Token 写进 Prompt、仓库、前端代码或日志；
- Token 只保存在服务端密钥管理或环境变量中；
- 不要把 Token 返回给第三方 AI 的自然语言上下文；
- 参考媒体 URL 应使用短期签名并限制可访问对象；
- 生成结果应立即转存，不能长期依赖 AutoDL 临时 URL。
