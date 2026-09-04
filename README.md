# UnunuTV

UnunuTV 是面向电影与多集短剧制作的单用户、本地优先 **AI 视频低模预演与镜头控制台**。
通过唯一的 `unutv` Skill 操作，所有持久化生产阶段都能在画布上查看。

当前公开版本：**[v0.1.0](https://github.com/ununuAI/UnunuTV/releases/tag/v0.1.0)**。

```text
unutv / Codex
        │
        ▼
CLI / HTTP  →  编排器 + 工作器  →  合同 / 知识端口 / 系列
        │              │
        ▼              ▼
   编译 / 预检 / 运行（生产视频只走正式 GenerationUnit）
        │
        ▼
   SQLite + 本地媒体 + Provider 端口
```

## 平台 OS（v1）

- **唯一入口**：`skills/unutv` → `workflow cinematic-start|status|advance|owner-decide`
- **唯一下一步**：每个状态都返回机器可读的 `nextAction`
- **唯一正式视频链**：已接受的低模预演 → GenerationUnit 编译/预检 → 精确正式生成意图 → 幂等运行
- **画布可见原则**：每个来源、合同、请求、候选、渲染和交付都绑定可见节点
- **真实知识**：知识端口读取`统一知识库`的 cap-*/kn-*；虚假 ID 一律阻断
- **多集生产**：Series + SharedAssetLibrary + ContinuityLedger；第 2 集起绑定已接受资产，冻结后禁止静默换脸

```bash
# 在现有系统上运行完整短剧生产链
# (角色像素 → 分镜图 → image_reference 多镜视频 → 系列 promote → 画布逐步可见)
node apps/cli/src/index.mjs workflow short-drama \
  --brief "角色：林夏。开场。冲突。钩子。" \
  --title "第1集" \
  --duration 60 \
  --dry-run

# 真实多镜正式视频（GenerationUnit 编译/预检/运行）
node apps/cli/src/index.mjs workflow short-drama \
  --brief "…" --title "第1集" --duration 60

npm run dev   # 查看渐进式画布、电影工作区与自动化
```

Next.js 在同一进程中运行浏览器界面与本地 API。SQLite 保存结构化状态；图片、视频和音频文件
保留在项目媒体目录中。

## 能力边界

本产品负责故事事实、项目视觉圣经、按风险路由的人物/场景/道具权威、电影镜头设计、
单镜或多镜生成单元、可选视觉锚、确定性 Prompt 编译、视频输入、生成、空间导演、时间线、
专业审查与导出。支持电影、短片、系列、广告、MV、纪录片、动画、预告片、社交视频和短剧。
不负责账号、团队、云项目、网站、演示文稿或通用设计能力。

支持的画布节点类型：

```text
text image audio video script storyboard video-clip director
```

分组、资产、审查、全景、工作流层和时间线属于类型化资源，不额外占用通用节点类型。

当前电影工业架构与合同见
[docs/cinematic/01-overview.md](docs/cinematic/01-overview.md)。内容 Prompt 与 Provider 参数相互分离。
故事板可选，一次生成请求可以包含多个已设计的艺术镜头。人物、场景、道具和故事板图片 Prompt
使用确定性 V2 编译器。UnunuTV 是唯一执行运行时；受支持的本地或远程 ComfyUI 只是可选执行后端。

## 版本规则

- 产品及工作区包采用 `package.json` 中的语义化版本。
- GitHub 正式版本使用不可变的 `vX.Y.Z` 标签。
- Codex 插件使用相同产品版本并追加缓存标识，例如 `0.1.0+codex.<时间戳>`，避免 Skill 更新后仍读取旧缓存。
- `main` 表示最新开发版本；需要稳定复现时应固定到 Git 标签。

## 在 Codex 中从 GitHub 安装

本仓库通过 `ununu-tv` marketplace 发布 `unutv` Skill：

```bash
codex plugin marketplace add ununuAI/UnunuTV --ref main
codex plugin add unutv@ununu-tv
```

安装后新建 Codex 任务，使 Skill 正确载入。

## 在 Windows 运行本地画布

先安装 Node.js 26+、Git、FFmpeg 和 Cloudflared，再在 PowerShell 中运行：

```powershell
$UnunuTvRoot = "$env:LOCALAPPDATA\Ununu\ununu-unutv"
git clone https://github.com/ununuAI/UnunuTV.git $UnunuTvRoot
setx UNUTV_ROOT $UnunuTvRoot
npm.cmd --prefix $UnunuTvRoot ci
npm.cmd --prefix $UnunuTvRoot run build
npm.cmd --prefix $UnunuTvRoot run dev
```

使用画布期间保持最后一条命令运行，然后访问 `http://127.0.0.1:4318`。

## 隧道

- `npm run dev` 和 `npm run start` 会自动为每台设备创建独立的 Cloudflare Quick Tunnel。
  随机地址不是配置，不得从另一台电脑复制，也不得提交到 Git。
- 隧道只传输带签名且会过期的 `/provider-media/` 文件；画布界面和 `/api/` 仍只允许本机访问。
- AutoDL H3 使用自己的 API Token；只有任务引用本地图片、视频或音频时才需要媒体隧道，不需要 SSH 隧道。
- 自托管 H3 可以使用操作者自己的 SSH 主机、端口和私钥路径建立本地端口转发。
- FLUX 默认使用本机 ComfyUI，也可使用用户自有 HTTPS 网关。公开仓库不包含任何组织专用地址、Token 或反向隧道拓扑。

## 更新

先停止 UnunuTV，再从 PowerShell 更新运行时和 Skill：

```powershell
$UnunuTvRoot = "$env:LOCALAPPDATA\Ununu\ununu-unutv"
git -C $UnunuTvRoot pull --ff-only
npm.cmd --prefix $UnunuTvRoot ci
npm.cmd --prefix $UnunuTvRoot run build
codex plugin marketplace upgrade ununu-tv
codex plugin add unutv@ununu-tv
```

如果 Git 报告本地修改或无法快进更新，应停止并审阅差异，不得直接覆盖。更新完成后重新启动
UnunuTV，并新建 Codex 任务。

插件更新不会替换本地画布状态。`.unutv`、项目媒体和凭证必须保留在 Git 之外。发布 Skill
变更前运行 `npm run plugin:sync`，确保运行时和插件副本完全一致。

## 路径

- 源码：`UNUTV_ROOT`；Windows 默认 `%LOCALAPPDATA%\Ununu\ununu-unutv`，macOS/Linux 默认 `~/.local/share/ununu-unutv`
- 默认运行数据：`~/.unutv`
- 自定义运行数据：`UNUTV_DATA_DIR=/absolute/path`

运行时目录结构：

```text
.unutv/
  catalog.sqlite
  secrets/                        # 目录权限 0700
    {ark,openrouter,openspeech}-* # 文件权限 0600
  projects/project-<uuid>/
    project.sqlite
    .unutv/project.json
    media/source/{images,videos,audio}
    media/generated/{images,videos,audio}
    media/{thumbnails,proxies}
    {temp,exports,backups}
```

## 常用命令

```bash
npm install
npm test
npm run verify
npm run dev
node apps/cli/src/index.mjs --help
```

全栈开发服务统一使用本机地址 `http://127.0.0.1:4318`。`npm run dev:api` 仅用于隔离的
HTTP API 调试。

## Ark 本地参考媒体的公网隧道

媒体不会被复制到虚构的云媒体库。UnunuTV 为本地 `/provider-media/` 地址生成带签名且会过期的
URL，再通过用户自己的 HTTPS 隧道让 Ark 或其他远程生成 Provider 读取。

常规 `npm run dev` 和 `npm run start` 命令会自动启动已安装的 Cloudflare Quick Tunnel。
系统会识别随机域名并注入当前运行的发布器，用户无需手动复制隧道名称：

```bash
npm run start
```

纯回环启动命令明确命名为 `npm run start:local-only`（或 `npm run dev:local-only`），仅用于隔离调试。

公网主机只接受带签名的 `/provider-media/` 请求。Next.js 界面和 `/api/` 项目端点仍只允许本机访问。

```bash
UNUTV_PUBLIC_MEDIA_BASE_URL="https://a-fixed-tunnel.example" npm run dev
ununu-unutv media publish --project PROJECT_ID --media MEDIA_ID --provider ark
```

签名密钥会自动创建在 `~/.unutv/runtime/provider-media.secret`，权限为 `0600`。隧道或 URL
过期不会删除本地源文件。

## 视频与声音 Provider

支持的本地适配器：

- `openrouter`：带首帧和连续性图片的 HappyHorse 视频任务；
- `ark`：使用隧道发布图片、视频和音频参考的 Seedance 视频任务；
- `openspeech`：豆包 Seed Audio 对白、旁白和声音生成；
- `ark-tts`：可选的 Ark 兼容语音端点。

凭证可从本地设置面板保存到 `~/.unutv/secrets/`。目录权限为 `0700`，每个凭证文件权限为
`0600`；API 不返回明文，项目数据库也不会保存明文。环境变量仍然受支持且优先级更高。
图片生成可以作为画布可见的探索过程自由迭代。正式视频只有在低成本证明已接受、精确预检通过，
并形成可审计的单次提交生成意图后，才会通过已配置的 Provider 账号发送。这是生产安全门，不是第二套计费界面。

```bash
OPENROUTER_API_KEY="..." npm run dev
ARK_API_KEY="..." UNUTV_PUBLIC_MEDIA_BASE_URL="https://your-tunnel.example" npm run dev
OPENSPEECH_API_KEY="..." OPENSPEECH_SPEAKER_ID="..." npm run dev

ununu-unutv node run --project PROJECT_ID --node NODE_ID \
  --request '{"prompt":"..."}'
ununu-unutv run poll --project PROJECT_ID --run RUN_ID
ununu-unutv production create --project PROJECT_ID --data '{"projectType":"short_film"}'
ununu-unutv unit compile --project PROJECT_ID --production PRODUCTION_ID --unit UNIT_ID
ununu-unutv unit preflight --project PROJECT_ID --production PRODUCTION_ID --unit UNIT_ID
ununu-unutv authority list --project PROJECT_ID --production PRODUCTION_ID
ununu-unutv authority compile --project PROJECT_ID --production PRODUCTION_ID --authority AUTHORITY_ID --data '{"generationParameters":{"provider":"ununu","model":"openai/gpt-image-2","aspectRatio":"16:9","resolution":"2048x1152","count":1,"referenceMediaIds":[]}}'
```

包含 base64 参考媒体的 Provider 请求正文只在内存中使用。SQLite 只保存媒体 ID 和精简请求摘要，
不会保存巨大的编码图片。

开发 CLI 命令为 `ununu-unutv`；它不会调用或依赖机器上其他位置预先安装的同名命令。
