# Ununu 画布交互底座设计 QA

- 路由：`http://127.0.0.1:4318/projects/4b5f89dd-9cec-4398-bb6e-c515bb032018`
- 浏览器：Codex 内置浏览器；最终固定视口 1440×900（早期专项回放保留 1651×1324 证据）。
- 状态：深色画布；单选节点；左侧素材库、工作流、素材历史分别打开测量。
- 源视觉真值：
  - `/var/folders/b1/7d0hn4cn401d2hy0rzkh8jv00000gn/T/codex-clipboard-405f3e1e-6e41-4d0b-9038-701f57f24bfb.png`
  - `/var/folders/b1/7d0hn4cn401d2hy0rzkh8jv00000gn/T/codex-clipboard-f02f0a03-f8c1-47b9-b2fb-92df7699711c.png`
  - 用户此前提供的资产库、工作流、历史面板打开态截图。
- 源码交互真值：`/Users/zhangxiaohao/Ununu/电影工业控制/video-analysis/momo-source-2026-07-20/extracted/momo-flow-index-DZBEYAr3.js` 中 `BaseNode` 的真实节点 Handle、`handle-sensor`、`handle-visual` 分层结构。
- 实现截图：
  - `design-qa-artifacts/selected-node-handle-guard.png`
  - `design-qa-artifacts/fixed-size-rail-panel.png`
  - `design-qa-artifacts/connection-handle-comparison.png`
  - `design-qa-artifacts/rail-panel-comparison.png`

## Findings

- 本轮没有遗留 P0、P1 或 P2。
- 连接按钮只在节点单选时显示。真实连线锚点仍位于节点边界，悬浮“＋”只是跟随和拉线操作层。
- “＋”的感应区固定为 38×38，仅覆盖按钮附近；浏览器实测左右感应区均完全位于节点外侧，与节点正文区域不重叠。
- 跟随位移增加硬边界：输入端横向为 -58 至 -24，输出端为 24 至 58，纵向为 -16 至 16；因此按钮在靠近节点时停止，不能进入节点内部。
- 浏览器实测节点左边界 477.78，输入感应区最右 451.78，保留 26px 外侧间隔；节点右边界 1101.78，输出感应区最左 1127.78，同样保留 26px 外侧间隔。
- 近距点击触发实测后按钮保持在节点外侧，输出按钮与节点边界仍有约 30px 可见间隔；页面边数量未增加。
- 资产库、工作流、素材历史三个入口的悬浮面板不再按内容自适应：同一视口下逐项打开实测均为 410×720；内部 section 统一占剩余高度并独立滚动。
- 画布工具仍按其短内容使用自适应高度，没有被错误套用到这三个资源型面板。

## Required fidelity surfaces

- Fonts and typography：本轮未改变既有字体、字号和层级；左侧栏与面板标题保持现有白/灰信息层级。
- Spacing and layout rhythm：三类资源面板的宽高、标题区、内容区和左侧栏间距统一；连接按钮的水平外侧间距和纵向跟随范围对称。
- Colors and visual tokens：保持中性黑灰面板和低对比灰色连接按钮；未新增抢眼描边或新的主题色。
- Image quality and asset fidelity：本轮未替换媒体资产；画布图片仍使用原始项目媒体。
- Copy and content：本轮不改业务文案；三个入口各自仍展示素材、工作流和生成历史，不互相复制。

## Comparison history

1. 早期实现问题：连接按钮感应范围过大，视觉可跟随进入节点；三个资源面板高度随内容变化。
2. 修复：感应区收窄到 38×38，增加横纵位移硬限制；把素材库、工作流、素材历史统一为同一响应式固定框架。
3. 修复后证据：`connection-handle-comparison.png` 显示按钮保持在节点外侧；`rail-panel-comparison.png` 显示左侧入口与统一大面板关系。浏览器逐项测量三个面板均为 410×720。

## Primary interactions tested

- 单选节点后左右连接按钮出现，未选中节点不显示。
- 点击连接按钮没有新增持久连线；真实已有连线数量保持不变。
- 依次打开资产库、工作流、素材历史；三个面板尺寸一致且入口选中态正确切换。
- 页面无 Next.js 错误覆盖层，核心画布、侧栏和面板均保持可操作。

## Verification

- Next.js 生产构建：通过。
- 本地服务：运行于 `127.0.0.1:4318`。
- 自动化测试：221/221 通过。
- 架构边界：通过。
- 完整 `npm run verify`：通过。

## 全自动生产流增量 QA

- 顶部“开始全自动”只负责生命周期、预算与模式；详细 13 阶段任务流由左侧胶囊的唯一“全自动生产流”入口打开，没有增加聊天窗口或全屏模态层。
- 计划态实测：按钮为 `任务流 0/13`，打开后显示 13 个正式任务，并按真实依赖计算为 11 个执行波次；并行分支在同一波次并列显示。
- 实时态使用独立本地项目和正式 CLI/core API 构造，没有直接写数据库，也没有调用 Provider。实测控制条为 `分块规划 · 2 Agent · 1/13`，项目处于“全自动运行中 / 只读观察”。
- 两个真实运行任务分别显示 38% 和 50%，文案来自持久化 `AutomationTaskActivity`，不是前端计时器或假进度。
- 点击“视觉圣经”任务后，详情显示领取和产物两条活动、一个正式产物引用及精确时间；普通用户无法在只读状态写入活动。
- 观察器是与 `影视总控` 同一默认框架的画布级非模态窗口（1536×900 视口下为 1180×800），层级 104；可关闭/重开/拖动/缩放，且始终低于层级 110 的 detached player，不影响画布、播放和时间线状态。

final result: passed

## 用户电影知识进入逐镜合同 QA

- 根因：用户提供的电影语言、镜头/剪辑语法、分镜与 AI 创作资料已经进入统一知识库，但旧编译把“production 内曾有该 role”和“引用了一个文档路径”误当当前镜头会签；`teamManifestIds` 为空也不阻断。
- 修复：Core 只认可精确覆盖当前 Shot/GenerationUnit revision 的贡献。GenerationUnit 贡献必须列出当前完整 Shot revision；`knowledgeRefs` 同时包含 `cap-*` 与 `kn-*`；贡献的 `teamManifestId` 必须属于当前 production。production 模式正式角色单元自动开启四项门禁，调用方不能漏配。
- 技巧落地：新合同文档要求运镜写触发/路径/速度/启停/信息揭示，空间写轴线/screen zone/带符号方向/朝向/视线/接触面，身份与场景写 Authority/拓扑/材质/光/不可逆状态，打斗写目标战术/动作四相/动作源链/coverage/伤势武器疲劳，剪辑写方向速度匹配/overlap/反应/声桥/下一镜入口。
- 真实数据：P01A compiler 2.7.0 compilation `prompt-compilation-531072fb-33ee-4e8e-babc-92aa5358a334` 显示五项新增 blocking signoff 错误，证明旧 production 级意见不再伪装为 r38 当前会签；原有关键帧/Authority/first-frame 阻断仍保留。
- 自动化：focused 31/31；完整 `npm run verify` 263/263，架构边界和 Next.js 生产构建通过；未调用任何付费 Provider。

final result: passed；知识到逐镜的门禁已生效，当前 P01A 诚实停在 TeamManifest/当前专业会签/资产与关键帧全部补齐之前

## 《血月客栈》P01A Owner 否决与身份像素门禁 QA（2026-07-21）

- 真实项目：`project-696a8a5c-92ea-4356-a52d-b1866b609efc` / `canvas-661df79a-014a-47ab-8f0b-7f81e86f3b8f`。所有生产状态变更经 CLI/Core/API；源码与文档经 patch；没有直接写 SQLite，没有新的付费 Provider 调用。
- 定义性事实：每名尸傀只有一张完整人脸，直接嵌在同一头颅后脑枕骨皮肤内；同一头颅正前方为连续平滑、无眼无鼻无口的无脸皮肤。禁止外露骷髅/裸骨、普通正脸、双面脸、第二头颅、面具/贴纸/伤口/浮雕或空白后脑鼓包。
- 用户可见失败复现：

  1. 打开真实项目并定位 `P01A 入店与后脑鬼脸`。
  2. 播放当前候选 `media-20de8005-c758-477a-b478-7efeb7a5bafa`。
  3. 观察最近酒客的“后脑脸”为外露骷髅；其他酒客以正常眼鼻口正脸回看入口；桌席身体朝向与后脑凝视关系也未成立。
  4. 结论：即使空间轴线和综合得分较高也必须 REJECT。最新记录为 `cinematic-evaluation-bloodmoon-p01a-owner-veto-reject-v4`，画布显示 `候选已拒绝` 与正确原因。

- Authority/KF 像素复核：旧尸傀 authority 图在多视角中不能证明同一头颅“前方无脸、后脑唯一脸”，旧 KF01 出现普通正脸/转身酒客。两者 accepted 状态已撤销或降级，accepted media/review 为空，旧像素仅保留 rejected audit，不能再进入 reference。
- 新空间底图：Director Stage revision 159 / capture `director-capture-5a02830e-061c-4a5d-b2b6-49c70d2ba993` / media `media-fa00b807-15bb-45fd-aba3-8e75866e53b1`。1280×720 像素可见三主角入口前景、八名坐姿酒客及四桌八座占位；该图只通过空间/占位 QA，不证明身份或解剖。
- 视觉证据：`design-qa-artifacts/20260721-p01a-owner-veto-v4/02-p01a-v4-reject-focused.png`、`design-qa-artifacts/20260721-p01a-owner-veto-v4/source-media/authority-corpse-crowd-r4.png`、`design-qa-artifacts/20260721-p01a-owner-veto-v4/source-media/kf01-accepted.png`、`design-qa-artifacts/20260721-p01a-owner-veto-v4/source-media/director-s01-rebuilt-table-occupancy.png`。
- 新关键帧方案：Storyboard revision 107 只绑定重建 Director 空间底图、已接受客栈空间母版和三主角身份；尸傀 revision 7 identity master 尚未验收，因此状态为 `needs_regeneration/blocked`。compiled still Prompt lint 通过，但明确“不得发起生成”。
- Provider 安全：P01A 使用 `FIRST_FRAME`，普通 reference、first frame、last frame 均为空；preflight `ready:false`。P01B continuity audit 指向 v4 REJECT 并报 `continuity_source_not_accepted`，同样 `ready:false`。
- 画布运行态：P01A/P01B 的独立 `PromptDocumentV1` 也已通过 CLI 清空；刷新后不再展开旧尸傀 authority、旧 KF01、旧 Director capture 或“普通前脸/收紧半步”的危险 Prompt。节点只保留真实 rejected 候选与拒绝原因供审计。
- 自动化证据：身份门禁 focused tests 16/16；最终 `npm run verify` 258/258、架构边界、TypeScript/Next.js 生产构建全部通过。

final result: passed for veto projection, pixel invalidation, rebuilt spatial plan and unpaid preflight; final P01A/P01B media remain intentionally blocked pending new Owner paid approval

## 《血月客栈》P01 画布视频、音轨与参考模式增量 QA

- 用户可见缺陷：拆分 P01A/P01B 时计划脚本无条件清空执行节点 `currentMediaId`，导致已经生成的视频暂时从画布消失。修复后仅 rejected/quarantined 媒体会被清空，未隔离当前媒体持续可见。
- P01A 成片回填：专业时间线 `timeline-96453f2d-7c0e-4d45-9097-e4e0c1ed2976` 截取原 P01 的 0–4.1 秒。最终 render `render-job-3e2cfa68-cfbe-4fb6-ac20-3ba10abcf61a` / media `media-20de8005-c758-477a-b478-7efeb7a5bafa` 保留 H.264 画面与 AAC 48kHz 双声道，技术 QC 全通过。
- 音轨根因：旧 Render Graph 只收集独立 audio-track clip，忽略 video-track clip 自带的音轨。Core 现在显式产生 `includeEmbeddedAudio/embeddedAudioVolume`，本地 FFmpeg adapter 先 probe 再混合内嵌音频和独立音轨；回归测试覆盖真实视频轨内嵌音频。
- Browser 回放：刷新用户当前 in-app Browser 后，画布首个可见 `<video>` 实际指向 `/media/media-20de8005-c758-477a-b478-7efeb7a5bafa`；P01A/P01B 并列且无重叠，P01B 保持独立等待区，预算 CNY 82。
- Provider 能力缺口：P01B 的首次 frame + ordinary-reference 组合被 Ark 以 `first/last frame content cannot be mixed with reference media content` 拒绝，预算预留 CNY 3 全额释放。现在 Core/adapter 会在付费提交前拦截，focused 18/18 通过。
- 第二个 P01B 候选已正式 REJECT：它没有承接 P01A 入口侧尾态，主体跳到大厅中央附近，同时三符/三火轨均压成两条；evaluation `cinematic-evaluation-bloodmoon-p01b-spatial-handoff-reject-v2` 记录零可用区间。
- 合法重编译：Core 从 P01A ACCEPT 媒体精确抽取 3.9 秒尾帧 `media-a2814e19-44c6-4299-96cf-1ad41102104e`。P01B 改为 `continuous_segment + PREVIOUS_ACCEPTED_TAIL + first_frame`；compile/preflight `ready:true`，但本轮没有再次付费。
- Browser 回放暴露并修复 Web 投影差异：旧 UI 把普通资产连线“白璃火符”误标为首帧，并会在直接提交时把工作流连线混入 frame payload。现在首项明确显示 `P01A入口尾帧 / 首帧 / 核`，火符、场景、三主角、身份、尸傀和 Director 调度底图仍可见但全部标为“未使用”；Footer 为 `首帧 · 480p · 4s · 音频 · 1个`。富 Prompt 首个原子 Token 同步变为 `P01A入口尾帧`，没有冗余“本生成单元目标”。
- 固定回放中生成按钮已按 1 个真实首帧输入恢复可用；QA 未点击，预算保持 CNY 79。页面没有 Next.js 错误覆盖层。
- 旧 rejected 视频仍可在节点内播放以供审计，但视频左上角新增暖红 `候选已拒绝` 状态和“三符/三火轨仅生成两组”的真实原因，避免把失败候选误读为正式主片。
- 最终 `npm run verify`：240/240；架构边界和 Next.js 生产构建通过。

final result: P01A passed and visible；旧 P01B rejected 且有明确可见标识；新 P01B authoritative-tail preflight passed，尚未再次付费

## KF02 v14 与 P01 付费前视觉/交互 QA

- 真实项目：`project-696a8a5c-92ea-4356-a52d-b1866b609efc`。KF02 v14 在约 189 秒后正常回写，节点处理层自动结束；三张符位于白璃右手指尖前方并沿入口→中央敌群的有符号轴线运动，短尾回指右手。桌椅、柜台、楼梯、后出口、三主角身份和尸傀异常解剖均保留。
- Prompt 信息架构：P01 只包含 0–4 秒入店揭示和 4–8 秒发令/三符开路；不再把断枪、撞墙、折腕、鬼将终局和五雷音画计划作为正向内容塞入开场。项目级 VisualBible 只保留跨段成立的摄影语法，段落特有的声音、表演、灯光与 VFX 回到对应 Shot。
- 富引用：P01 恰好 9 个 Provider 顺序引用；两张 Director capture 分别显示 `S01 入口随行过肩机位` 与 `S02 白璃发令与贴地符火机位`，不会再以同名“3D导演台机位”让模型和用户混淆。
- Browser 回放：4318 重启后，当前 in-app Browser 刷新同一项目；P01–P08、S01–S14、KF01/KF02 与顶部 CNY 88 可用预算同时可见。P01 真实运行后画布节点进入 `provider_running`，没有创建重复卡片或脱离画布的隐藏任务。
- 自动化证据：`director-cinematic-binding.test.mjs` 新增相机别名 lineage 断言；完整 `npm run verify` 为 226/226，架构边界与 Next.js 生产构建通过。

final result: passed for keyframe/preflight；P01 视频仍在生成，成片 QA 尚未完成

## 最终 1440×900 工作区验收

- QA 项目：`project-f7d44ad8-361d-4cb3-a7fb-67403549ced7`；仅通过仓库 CLI/API 与 Web 交互，未修改主项目、未直写 SQLite、未调用付费 Provider。
- World 对照：用户提供的节点参考与实现截图被合并到 `docs/evidence/screenshots/20260720-world-reference-comparison.png` 后共同审阅；最终清洁状态保存在 `20260720-final-workspace-1440x900.png`。工具栏、三层历史堆栈、333×250 预览、选中态 Prompt、`3D 世界` 输出用途和诚实阻塞文案保持同一结构；应用截图保留画布上下文，没有伪造裁剪成独立产品。
- Director 对照：`docs/evidence/screenshots/20260720-director-reference-comparison.png` 同时包含用户参考和真实实现。左场景权威/空间控制、中三维视口、右属性区及顶部机位命令保持同一工业布局；实现额外保留 Ununu 的画布胶囊和底部控制。
- 闪烁复测：三张完整 1440×900 视口图以 1.15 秒间隔采集，SHA-256 均为 `66a7ecdb66f8751456ed089e12128c2bed1f9d48c1366b4371463a195e71e4bc`。真实 Gaussian Splat 没有再次在空帧/完成帧间切换。
- 节点收起回放发现一个真实冒泡缺陷：影视总控点击“收起”后，同一 click 会继续触发 ReactFlow 的 cinematic 自动展开。`CanvasNodeCard` 现在在三个画布内大型工作区的关闭事件上停止传播；浏览器持续 1.8 秒复测后稳定保持 572×360 收起态。
- 专业时间线：Audio 已持久化到 A1，服务重启后仍为 1 个片段；点击“代理”成功生成探针/代理/真实波形，片段显示 `代理✓`。统一时钟从 0 推进到 1.15s 并可暂停。证据：`docs/evidence/screenshots/20260720-professional-timeline-1440x900.png`。
- 固定视口发现时间线命令栏原先以 `justify-content:flex-end` 产生不可滚回的负向溢出，播放按钮位于 x=-62.78。修复为从首控件开始的横向滚动后，播放按钮位于 x=136.88 且可命中，后续专业命令仍可滚动访问。
- 播放器层级：docked player 保持右侧嵌入；detached player 实测 400×300、`position:fixed`、z-index 110。全自动生产流为 z-index 104，播放器始终在上。
- 全自动默认几何策略与 `影视总控` 统一为同一精确 frame；1536×900 视口下为 1180×800，较小视口由同一边界策略同步约束。
- 最新 API 服务已重启到当前源码；`POST /media/:id/prepare` 在浏览器中实际成功，旧进程导致的 `No route` 不再出现。
- 最终 `npm run verify`：221/221、架构边界与 Next.js 生产构建全部通过。

final result: passed

## 左侧影视总控浮动工作窗增量 QA

- 左侧项目内胶囊工具栏新增唯一“影视总控”入口；入口与现有资产、工作流、历史、画布工具同属一个持续画布导航层。
- 入口解析项目现有影视总控控制记录和 `productionId`，不会创建第二套总控数据；历史 typed cinematic 记录只作为持久合同绑定存在。
- 打开结果为画布上层的大型非模态工作窗，不使用遮罩或全屏路由；`cinematic` 不再渲染为画布卡片、不再参与可见连线，也不再出现在新增菜单。左侧胶囊是唯一可见入口。
- 工作窗支持标题栏拖动、隐形右下缩放、视口边界约束、位置和尺寸本地持久化，以及一个明确的关闭按钮；再次点击左侧入口可恢复。
- 全自动只读状态下仍可打开、查看、拖动、缩放和关闭，业务编辑继续由现有后端 423 控制锁约束。
- focused entry/geometry policy：7/7 通过。
- 当前完整 `npm run verify`：221/221 测试、架构边界和 Next.js 生产构建全部通过。
- 本地服务重启后 `/api/health` 返回 200，项目路由可访问。
- 浏览器证据：已通过。Codex 内置浏览器完成 click/open/drag/resize/close/reopen 回放；该段旧的浏览器超时阻塞已解除。

## 左侧全自动生产流工作窗增量 QA

- 源视觉真值：用户提供的左侧胶囊与画布内大工作窗截图 `/var/folders/b1/7d0hn4cn401d2hy0rzkh8jv00000gn/T/codex-clipboard-b31b5a80-814b-439f-9b42-b5b9981b27fe.png`、`/var/folders/b1/7d0hn4cn401d2hy0rzkh8jv00000gn/T/codex-clipboard-457c7306-b4df-4f05-8dec-53dfc55fca53.png`。
- 实现状态：顶部任务流按钮已移除；左侧胶囊增加一个 `全自动生产流` 入口；入口打开 13 阶段计划/实时 Agent 流的大型非模态工作窗，支持关闭、恢复、拖动、缩放和项目级个人位置记忆。
- Fonts and typography：工作窗标题、摘要、Agent 卡片、阶段卡片与活动详情均按大窗重新放大，不沿用原小弹层的微型字号。
- Spacing and layout rhythm：默认 frame 与 `影视总控` 完全一致，1536×900 下为 1180×800；摘要、并行 Agent、DAG 和详情区形成四层信息结构。
- Colors and visual tokens：保持现有中性黑灰与 Ununu 暖红运行强调色，没有新增高饱和描边。
- Image quality and asset fidelity：该表面没有媒体资产；沿用现有 Lucide 图标体系，不增加伪造图片或占位插画。
- Copy and content：保留真实计划/活动/产物/费用/依赖语义，不增加聊天文案；计划态与运行态共用一套数据投影。
- 自动化证据：`automation-flow-window-policy.test.mjs` 与 `automation-flow-view-model.test.mjs` 通过；共享 frame 在 1536×900、1256×1084、1200×760 三个视口逐一断言；当前完整 `npm run verify` 为 221/221、架构检查与生产构建通过。
- 浏览器证据：已通过。Codex 内置浏览器在真实项目中验证左侧胶囊只有一个“全自动生产流”入口；打开后为大型非模态画布级窗口，并完成拖动、缩放、关闭和重新打开回放。窗口层级为 104，低于 detached player 的 110；顶部只保留生命周期、预算和模式。

final result: passed

## World / Audio 原生节点增量 QA

- QA 路由：`http://127.0.0.1:4318/projects/f7d44ad8-361d-4cb3-a7fb-67403549ced7`；项目 `project-f7d44ad8-361d-4cb3-a7fb-67403549ced7`，画布 `canvas-158502a4-e284-4c6b-a050-32157cfa6eef`。
- 源码真值：Momo bundle 的 `WorldNode` 约 141838–142590 行、`AudioNode` 约 142610–142805 行，以及默认尺寸策略约 27217–27305 行。World 历史展开坐标由源码明确给出 `(516,0)`、`(0,-266)`、`(516,-266)`；Audio 明确提供上传、打开、波形、时长、播放/暂停与拖入时间线事件。
- 隔离数据：仅通过仓库 CLI 给 World 节点新增 3 个图片 media 版本：`media-0d969a6f-d912-4e0d-8392-a3653e0c3bdd`、`media-0c55a73a-ee47-422e-9a0c-c03a15b0c54f`、`media-55450048-f31d-4953-8b03-8f3c40463946`。没有修改主项目，没有调用 Provider。
- World 尺寸：浏览器测得 ReactFlow 原始盒模型为 333×250；预览尊重内容计算尺寸，节点内容允许历史卡越界展开。
- World Prompt：有真实 World Provider 时才在单选节点后显示并使用 `3D 世界` 类型；当前未配置 Provider，因此生成 composer 整体隐藏，不再用一个不可执行的大文本框冒充世界生成。导入/连接世界与 Director 绑定仍可用。
- World 历史：三个完整尺寸历史卡的 CSS 变量与 computed position 分别为 `(516px,0px)`、`(0px,-266px)`、`(516px,-266px)`；收起后恢复源码式堆叠预览。
- Audio 尺寸与媒体：ReactFlow 原始盒模型为 444×250，内容区为 442×248 且 `overflow: hidden`；实测媒体时长 2 秒、96 条波形柱，播放按钮可切换为“暂停音频”。
- Audio 运行时修复：`use-audio-waveform.js` 现在以单一 `closeContext()` 转移并清空引用，避免 effect cleanup 与 `finally` 重复关闭同一个 `AudioContext`。刷新并再次播放后，浏览器自修复时间点后的 error/warn 日志为 0。
- 视觉证据：早期专项为 `artifacts/qa/momo-world-audio-20260720/02-world-selected-prompt-blocked.png`、`03-world-history-expanded.png`、`04-audio-selected-playback.png`；最终 1440×900 对照为 `docs/evidence/screenshots/20260720-world-reference-comparison.png`、`20260720-world-history-1440x900.png`。
- 自动化证据：focused World/Audio 与 Prompt 测试通过；当前完整 `npm run verify` 为 221/221、架构边界和生产构建通过。
- Audio 时间线：`timeline-drag-policy.test.mjs` 已锁定精确 node/media/duration 数据和 100ms 轨道吸附；Web drop 调用持久化 Timeline use case，不在 React 内伪造 clip。浏览器自动化没有模拟底层系统拖拽，但核心、Web 接线和行为测试已闭合。
- 已知外部能力：真实 World 生成 Provider 尚未配置，因此 Prompt 必须保持诚实阻塞；导入 SPZ、权威绑定、三维渲染和 Agent/用户导演控制均为真实实现。

final result: passed；真实 World 生成保持显式外部能力边界，不以伪成功计入缺口

## Gaussian World → 3D 导演台工业闭环 QA

- 真实渲染：`@sparkjsdev/spark` 的 Momo 兼容 `OldSparkRenderer` 与 `SplatMesh` 渲染官方 SPZ，而不是用封面图或 CSS 假装三维。隔离 QA 使用 `media-d07fa31f-ffa3-4a2c-aa82-f03b87c1bd81`，177,132 个 splat。
- 共享命令：用户与 Agent 均调用 revision/idempotency/actor 受控的 Director Stage 原子命令；Web 不直写数据库。Agent 已在隔离项目中加入角色 `qa-role-a`、两点路线 `qa-role-a-route` 和 `qa-butterfly-camera` 机位。
- 权威链：World 的 asset/version/media/checksum、position/rotation/scale 与活动 anchor 写入 Director environment；capture `director-capture-499811bc-ce6e-4e6d-82fd-fd82cc1f873a` 锁定 stageRevision 9，并绑定为 `shot-b7911510-b4c4-4786-b212-7ea56b64703d` 与 storyboard shot `storyboard-shot-eb1227a2-a0a3-4023-839b-74ebfee65c1f` 的控制来源。
- 视觉证据：`artifacts/qa/momo-world-audio-20260720/05-world-gaussian-director.png`、`06-agent-blocking-in-gaussian-world.png`。
- 闪烁根因：父层重渲染创建新的内联交互回调，使 `DirectorViewport` effect 在同一 canvas 上反复释放/重建 WebGL runtime；Spark 兼容 renderer 的自动 accumulator 刷新进一步放大了空帧窗口。
- 闪烁修复：交互回调改用最新值 ref，不再进入 WebGL 初始化依赖；Spark 改为 `autoUpdate: false, preUpdate: true`，只在 SPZ 完成加载、相机实际变化或场景修订后同步重建。
- 固定视口回放：修复前 50 帧中 14 组相邻帧出现整层空帧，最坏平均通道差 49.5388、58.307% 通道变化；修复后机位视角 50 帧、编辑视角 25 帧、返回机位 25 帧的最坏相邻帧平均差均为 0。

final result: passed

## 唯一工作区与规模 QA

- Web 入口只加载 `MomoCanvasWorkbench`；节点路径为 `CanvasNodeCard`，ReactFlow 类型为 `canvasNode`。Web 中不再存在 `LegacyCanvas`、`LegacyNodeCard`、`legacyNode`、旧状态/菜单/modal CSS 命名或新旧 UI 切换。
- 1000 个画布节点与 2000 个时间线 clip 全部通过正式 local-runtime use case 写入并重新打开；最终完整测试中的端到端规模门耗时 3.70s，位于本地性能预算内。
- 当前完整验证：221/221 测试、架构边界检查、Next.js 生产构建均通过。

## 项目级总控入口与 3D 新增恢复 QA

- 用户截图确认画布中的旧 `影视总控` 卡片与左侧胶囊入口重复；`canvas-entry-policy.js` 现在把 `cinematic` 定义为项目级入口记录。ReactFlow 投影与边投影都会排除它，新增菜单的 `ADD_ITEMS` 也不再包含它，但电影工业合同和既有 production 绑定没有删除或降级。
- `影视总控` 和 `全自动生产流` 使用同一 `defaultCanvasWorkWindowFrame`。两种个人几何存储键升级到 v3，清除旧版默认偏移和尺寸造成的不一致；两个窗口仍可由用户各自拖动和缩放。
- 4318 进程退出导致“添加 3D 世界 / 3D 导演台”请求失败。重启后 `/api/health` 返回 200；通过仓库 CLI/Core 临时创建并回读 World `node-328f30d1-e3d6-4867-839c-cfebaaf8440d`（333×250）和 Director `node-c3e61e00-7f06-4592-8495-0720370025eb`（572×408），随后精确删除并回读确认无残留。没有 Provider 调用。
- focused tests 20/20 通过；最终 `npm run verify` 221/221、架构边界和 Next.js 生产构建全部通过。

## Runtime / 素材拖拽 / 全景手势 / 总控字号增量 QA

- Runtime：用户报告的 `loadStoryboardBatchJobs` 500 来自拆分用例时漏传 `requireProduction`，并非数据损坏。依赖已显式注入，前端加载增加 rejection 边界；重启 4318 后，隔离项目真实 endpoint 返回 HTTP 200 与空任务列表。
- 素材拖拽：按 Momo bundle 的 `application/x-material-asset` drag contract 实现。素材卡可拖到无限画布任意落点，Web 使用 ReactFlow `screenToFlowPosition` 计算坐标并调用正式 create-node API；World 素材写入 `worldMediaId/worldMediaIds/worldProjection`，不会把 SPZ 放进图片 `currentMediaId`。
- 素材库色彩：活动 tab/filter 使用显式暖红背景、描边和前景色；hover 与 active 分离，未选项不再看起来像选中。
- 全景节点：内联全景默认不消费 pointer/wheel，长按拖拽移动节点；只在顶部工具栏显式打开 `探索` 后旋转/缩放，节点取消选择时自动退回拖动模式。独立全景工作区仍保持交互。
- 影视总控：浮动工作窗的标题、阶段导航、原始事实栏、合同标题、表单标签与字段统一降到紧凑工业字号，输入高度从通用 36px 收敛到 31px，避免截图中整块信息被放大。
- 自动化证据：`storyboard-batch-production.test.mjs`、`canvas-asset-drag-policy.test.mjs` 等 focused tests 20/20；完整 `npm run verify` 221/221、架构边界与生产构建全部通过。
- 视觉回放：已在用户当前 in-app Browser 的真实 loopback 项目刷新并完成回放；全景拖动/探索边界、总控字号和素材落点均由浏览器直接验证，不再保留“Browser 阻塞”的旧结论。

final result: passed；fresh fixed-viewport visual comparison completed

## 《血月客栈》导演台导出布局与动作调度增量 QA

- 真实项目：`project-696a8a5c-92ea-4356-a52d-b1866b609efc` / `canvas-661df79a-014a-47ab-8f0b-7f81e86f3b8f`。所有 node/media/capture 通过 CLI/Core/API 创建或更新，没有直接写数据库，没有付费 Provider 调用。
- 重叠根因：`DirectorConsolePanel` 对每个新 capture 固定使用 `selected.x + selected.width + 80, selected.y`；S01、S03、S04、S05、S06 因此持久化为完全相同坐标。
- 布局修复：`director-export-placement-policy.js` 以 camera order + capture variant 形成稳定三列网格，碰撞检测把 selected-only Prompt 的展开高度计入 559×720 占位。已有 camera/variant 重导只更新媒体并保持原位置。
- 数据修复：S01–S14 调度底图节点已使用正式 `node update` CLI 迁移到五行网格；刷新画布后同一行可同时看到独立图片卡，坐标核验无重复。S09–S14 新建时直接命中新策略，无二次人工移动。
- 动作调度：S08–S14 重导前先修复镜头局部可见性覆盖全局隐藏的优先级，并补充撞墙扼颈、扣腕、翻空刺脊、贴脸施术、跪地崩解和带伤回身的镜头局部站位/关节角。14 个 camera 的 expected-character 完整入画审计全部通过。
- 自动化证据：`director-export-placement-policy.test.mjs` 3/3；完整 `npm run verify` 221/221、架构边界与 Next.js 生产构建全部通过。
- 视觉证据：in-app Browser 刷新确认独立网格；S08–S14 每张 1280×720 capture 均逐张打开检查。旧 S08 漏失鬼将、S11 直立悬空和 S12 正面叠线均已被修正版替换。

final result: passed；本节只确认导演调度与画布布局，最终美术关键帧、付费视频、剪辑和成片仍未完成

## 《血月客栈》单帧关键帧 Prompt 与富 Token 增量 QA

- 问题根因：关键帧 Prompt 已从旧 `（参考图N）` 迁移为更短的 `参考图N「权威素材名」 = 本帧语义别名。`，但 `PromptDocumentV1` 解析器只识别旧占位符，导致正式 reference binding 在 UI 中退化成普通文字。
- Core 修复：解析器同时支持两种格式，并把完整 `参考图N「素材名」` 解析为不可拆散的 `reference` Token；等号后的语义别名继续作为普通可编辑文本。没有在 React 中用颜色或边框伪造资源标识。
- 工业 Prompt：`ununu.storyboard.keyframe.v1` 只编译一个冻结瞬间，按参考、单帧任务、视觉风格、唯一冻结时刻、空间关系、主体状态、摄影机/构图、表演、光线/色彩、连续性、禁止项分行；不写完整动作链、后续切镜、Director runtime、node/media ID。超过 5 个 GPT Image 2 输入在付费前阻塞。
- 引用权威：S01 使用 4 个不同 asset/version/media lineage：3D 导演台空间调度底图、血月客栈空间母版、三主角身份合集、由尸傀身份权威裁出的后脑鬼脸解剖特写；空间与异常解剖职责都不会被去重。
- 浏览器证据：用户当前 in-app Browser 中，节点卡有 4 个富 Token，中型展开 Prompt 窗口另有同样 4 个；DOM 共 8 个 `span[data-prompt-reference]`，唯一标题与 Provider 顺序 1–4 一致，别名按段落显示。
- 自动化证据：相关 focused tests 与状态恢复 tests 25/25；完整 `npm run verify` 221/221、架构边界和 Next.js 生产构建全部通过。

historical result: 当时通过；该结论后来被 Owner 定义纠正和最新像素 REJECT 覆盖。KF01 `media-742ccf1a-52ca-4068-a06c-d5a39e86293b` 当前不得作为 accepted 关键帧或参考。

## 外部生成状态同步与 KF01 真实付费回放 QA

- 用户可见问题：Provider 图片已经返回，节点仍覆盖“处理中”；随后一次观察者轮询还可能在同步图片提交尚未拿到异步 task id 时误报 `provider_task_missing`。
- 状态修复：画布每 2.5 秒读取持久化 run，只在真实 queued/running 或本地提交前状态存在时显示处理层；终态自动清理活动、刷新媒体并保留历史候选。Core 对同步提交的 queued/no-task 状态直接返回，不调用视频式 poll。
- 浏览器证据：KF01 成功 run `run-9729b1a8-a3ab-43df-bdf8-5a7242f8eeb9` 完成后，节点“处理中”数量自动为 0，现图仍可见；随后 KF02 通过 CLI 发起，目标节点无刷新自动显示“处理中”数量 1。
- 历史质量证据：KF01 r3 的空间与风格曾通过，review `review-33caf1ea-1291-4dbb-bda3-ca1ab0f271ed` 当时为 accepted；后续逐像素复核发现多名酒客仍用普通正脸/头肩转向入口，最新 `review-04db9509-5eee-465a-a18c-4ead0c808ed4` 已覆盖为 REJECT，当前不得继承。
- 自动化证据：focused 25/25；完整 `npm run verify` 221/221，架构边界和 Next.js 生产构建全部通过。

final result: passed；状态覆盖与误轮询均已修复；KF02 初版因桌区消失拒绝，v6 因角色身份错误拒绝，v7 因屏幕进攻方向反转拒绝，首个视频候选已隔离

## KF02 场景差分与身份输入 QA

- 初版缺陷：三符火浪出现，但中轴两侧桌凳、长凳、酒杯和桌边酒客全部消失，把狭窄客栈错误改成空旷战斗场；其 accepted 状态已撤销，媒体保留为 rejected 审计版本。
- v6 修复/失败：显式锁定左右桌区、至少六名中景酒客/尸傀、三条桌间窄缝、楼梯和后出口后，空间拓扑恢复；但 5 图输入只有 Director、场景、动作、尸傀、火符，没有三主角身份合集，导致顾沉白衣化、洛青性别/造型漂移，因此再次拒绝。
- v7 输入职责：`Director blocking + scene space + three-hero identity ensemble + action phase + creature crowd identity`。火符形制由动作板与 Prompt 约束，不再牺牲可见角色身份。
- v7 方向失败：虽然桌凳、群体和三主角身份恢复，顾沉正脸/胸口却朝向入口侧摄影机，与火轨和后出口反向，视觉上读成撤退。已撤销 `review-dd11ccfe-1bb2-44fc-89d7-3e244c8519dd` 的误验收，新增 rejected review `review-6ee92c6c-a3c2-4eb5-9b69-53a3e088c7fb`。
- v8 动作源失败：方向、身份与家具连续性已修正，但三张符和三条火轨的近端位于摄影机底边/画面中右侧，与左前景白璃的右手甩符动作断开。已撤销 `review-b8c98a58-d095-45a8-8cbd-eb4b798b95cd` 的误接受，以 `review-7b58e8a9-e2c0-4fad-9e3e-cd35c4c957fd` 拒绝。
- v8 身份状态失败：上一帧已经揭示的尸傀群在本帧无因恢复成有普通人类五官的活人酒客，遗失“正面空白/完整鬼脸只在后脑”异常解剖规则。同一 rejected 媒体得到第二条专业拒绝原因；不因动作开始就把怪物身份当作可选背景。
- 付费候选隔离：第一次 Seedance Mini 480p/8s 调用产出 `media-29c03d15-e6f7-4d29-a6fd-3b2fbeadefa7`，由于源关键帧方向不合格，以 `review-79b37780-4770-4133-8b10-fdd4c1227ef5` 隔离并从生成单元移除 KF02 v7；预检当前 `ready:false`。
- 规则固化：`ununu-cinematic-production` Skill 与 `docs/cinematic/05-prompt-compilation.md` 现同时要求环境差分、带符号的屏幕方向、动作源因果链和不可逆身份状态审计。已揭示的尸傀在没有先行可见逆转因果时不得恢复活人；人数、占位、服装和按观看方向的异常解剖均必须连续。

final result: in progress；KF02 v7/v8 与第一个视频候选已隔离，v9 batch 已取消，当前只允许 KF02 v10 免费单帧修复，未放行新付费提交

## GPT Image 长耗时与付费结果核对增量 QA

- 回归证据：旧 `ununu-web/apps/api/src/adapter/ununu-image-provider.mjs` 明确说明 GPT Image 2 多参考图编辑可能耗时数分钟，配置下限 300 秒、默认 1,800 秒。当前 UnunuTV 原先未继承这段显式合同；KF02 v11 两次约 96/101 秒收到 HTTP 502，v12 约 193 秒收到截断 JSON，旧适配器把它们错误显示成普通失败。
- 运行时修复：`packages/providers/src/ununu-image-response-adapter.mjs` 独立负责 5 分钟下限、30 分钟默认等待、完整响应读取和付费未知结果分类。网络中断、30 分钟最终超时、HTTP 5xx、空/截断 2xx JSON 都携带稳定请求号进入 `paid_submission_outcome_unknown`，不会自动重发。
- 追踪证据：v12 旧 run `run-d6ebd3a3-be8a-4888-baa1-946dbd3967df` 实际携带 batch item 幂等键 `storyboard-batch-37785774-6e9f-42d6-906a-b463dff4bdfa:storyboard-shot-50c68aad-b7e3-4abb-83e7-c54982120206:image:v1:attempt:1`，对应确定性 Gateway 请求号 `515372988895616`。该结果尚未核对，因此没有再次调用图片或视频 Provider。
- 状态回放：服务重启后，用户当前 in-app Browser 刷新真实项目；DOM 中“处理中”数量为 0，KF02 标题唯一可见并显示“待处理”，没有残留遮罩或自动重试。顶部预算显示 CNY 88 可用，与 CNY 100 grant / CNY 12 已消费一致。
- 架构：长等待和响应核对从 Provider 总路由抽成 61 行单一适配器；主路由为 452 行，重新通过 500 行原子模块门禁。
- 自动化证据：Provider/故事板付费调度 focused tests 16/16；未知结果预算保留、追踪号持久化、重试拦截与取消竞态回归测试通过；最终 `npm run verify` 为 226/226、架构边界和 Next.js 生产构建全部通过。`/api/health` 返回 200，媒体隧道已配置。

final result: passed；长耗时不再被 100 秒级本地限制截断，未知付费结果保持冻结待核对；《血月客栈》成片仍在进行中

final result: passed

final result: passed

## 跨模态状态载体与超长镜头交接 QA

- 纠偏：`TAIL_CONTINUE` 和 H0/H1 `DUPLICATE_HANDOFF` 不是新发明；本地已有正向实测。本轮修复的是它们没有被当前文字→图→视频→剪辑主路径强制执行。相关能力/知识 ID 已进入 Skill 和合同，证据边界保持 `LIMITED`。
- 图生视频载体：关键帧必须是当前 Shot revision 的真实媒体，最新 review 为 ACCEPT，checksum 相符，完成像素审阅，并覆盖身份、场景拓扑、站位、摄影构图和连续性入口五域。后写 REJECT 立即撤销旧证明并使 compilation stale。
- 重叠交接：H0/H1 必须是同一最新 ACCEPT 候选的不同帧；下一段先复演 H0→H1，再明确推进；时间线删除实际重复区，禁止固定秒数公式。TAIL 与 DUPLICATE 互斥。
- 专业接缝：合同/Prompt 同时锁定摄影机运动方向和离/入缝速度、焦段、焦点、曝光、动作相位、声音桥、trim plan，以及站位/道具/光线/动作相位/银幕方向五项守恒。
- 真实项目：P01A Shot/Unit r39 先硬性要求后脑唯一完整人脸与正前方无脸皮肤清晰保持至少 0.8 秒，再由白璃斗篷从左下向右上形成真实全画幅擦镜；第 7 条 review requirement 拒绝提前遮挡、隐藏切镜和伪遮挡。P01B r11 只允许用这个经像素 ACCEPT 的 H1 隐藏重置机位。当前没有 H1、没有 reference、来源仍是 Owner v4 REJECT，所以 `motion_handoff_frame_required` 与 `continuity_source_not_accepted` 正确阻断；未调用 Provider。
- 像素 QA：旧尸傀母版侧视方向错误且出现空白后脑鼓包；派生裁切继承错误；旧 KF01 中多名酒客以普通正脸和头肩转向入口。三者最新 media review 均为 REJECT，派生资产当前版本仅 `audit_only`；KF01 已同步为 StoryboardShot r108 / Shot r39、`needs_regeneration`，没有 accepted media/review。
- 自动化：focused 59/59；最终 273/273，架构边界和 Next.js production build 通过；合同/主 use case 均为 499 行。

final result: passed；能力已进入硬门禁和真实 P01B 方案，但 P01A/P01B 付费生成继续 blocked

## r7 身份母版与外部运行 loading QA

- 唯一批准调用：run `run-1465e751-76fe-4708-b305-35751da37b0c` / media `media-a001356f-f97b-4813-afae-9968f32e0532`，一次成功，无重试、无后续图片或视频调用。
- 像素终审：正视身体前方无脸、背视后脑有脸两格局部正确；但两张侧视都把普通眼鼻口人脸放在身体朝向的头部正前方，并在后脑形成空白鼓包/第二头块。正背格不能覆盖必需侧视失败，整张身份母版必须 REJECT。早期 `review-4bc6964d-c405-4071-a5ae-c7b6192e9296` 的 candidate 判断已由最新 `review-df5a8378-513d-4477-9494-0e0b88e01ba5` 覆盖。
- loading 回放：当前节点在 20% overview 的屏幕包围盒约 119×79px；模拟 `generationStatus=running` 后 DOM 同时出现 `节点生成中` 标题、`资产图片处理中` 覆盖层和 `node-generation-beacon` 动画，computed box-shadow 外扩约 13px。随后通过 CLI 恢复原成功 payload，画布回到新媒体且无 loading 残留。
- 状态隔离：Authority 当前 revision 8 / `rejected`；资产当前版本 `asset-version-9a3c19ac-5965-4a2c-b399-4628b29b949d` 为 `rejected_pixel_review / audit_only`，禁止作为 identity authority、state carrier、Provider reference 或 first frame。画布 Authority 节点 revision 24 显示 `authority_candidate_rejected`，新旧两个失败媒体都保留在 `rejectedMediaIds`。
- 资产卡回放：原 UI 只显示“身份母版 · 当前”，没有显示 Authority 媒体的 REJECT。修复后真实节点 DOM 同时显示“候选已拒绝”和完整侧视失败原因；切换历史板件不会继承当前媒体 verdict。
- “图生解锁”分析：截图未提供可核验模型/版本/seed/完整视频，不能支持“文生满血、图生阉割”的定理。可验证结论是自由度/连续性的约束预算；release 必须指定释放字段、时间窗、摄影路径与守恒事实，并按文生/首帧/首帧＋release/相容首尾帧做模型匹配 A/B。P01A 解剖揭示前禁止 release。
- 运行门禁：P01A compilation `prompt-compilation-e459dfc0-4f84-4cc8-a47e-062a7af3f3c7` 明确包含尸傀 r8 `rejected`，报告缺 accepted authority/KF/state carrier/first frame；P01B compilation `prompt-compilation-21b21b2b-aaba-4c7b-8ee7-148f5f532124` 还报告 `continuity_source_not_accepted`、缺 H1 与交接验证。两者 `ready:false / stale:false`、首帧和 references 为空，未调用 Provider。
- 自动化：资产拒绝显示 focused 6/6；最终完整 `npm run verify` 283/283，架构边界与 Next.js production build 通过。

final result: failed media correctly isolated；r7 身份母版与 KF01 均未进入生产引用，等待新的未付费 preflight 方案与 Owner 付费批准

## 图文混合语义控制与静态/动态分离 QA

- 核心纠偏：参考图不再被当作整张不可违背的像素真相。逐图合同分别显示必须保留、必须替换、遮挡/缺失补全、不得继承、仅风格与时间职责；现代桌→古代桌、遮挡后补尸体这类图文组合不再只能塞进模糊 `doesNotControl`。
- 模式可读性：UI 明确区分“图片语义参考 + 文字控制”和“真实首帧生成”。若一张图既是实际首帧又要求改掉可见像素，preflight 返回 `frame_pixel_override_conflict`；需要先修正关键帧或切换语义参考。
- 动态门禁：图片只证明 `S(t0)`。GenerationUnit 另行显示并验证主体轨迹、动作相位、时序/速度、摄影机轨迹、物理连续和结束状态；production 缺失时返回 `generation_control_intent_required`。高运动/大运镜/硬首帧无释放方案与纯 T2V 承诺精确外部/跨镜一致均有明确阻断码。
- 分镜 Prompt 精度：每镜必须可见地绑定主体与 screen zone、身体/脸/视线方向、接触/道具状态、动作相位、时间与速度、摄影机起点/路径/启停、焦段/焦点/曝光、动作源/VFX 轨迹、物理受力、守恒/禁止变化、结束状态和下一镜交接。图像负责初始视觉状态，Prompt 负责 `t0+1` 后的动态表达；不得用“电影感/大师运镜”等形容词替代可验收字段。
- Prompt QA：compiler 2.9.1 输出 `【参考图语义职责】` 和 `【独立动态合同】`，payload hash 同时覆盖 `controlIntent` 与 `semanticControl`，修改图文职责会使编译载荷变化；`first_frame` 面板明确显示“首帧只锁定 t0；t0+1 起由动态合同驱动”。
- 真实回放：P01A r41 mode control 为 `spatial_blocking / limited / medium`；P01B r12 为 `cross_shot_continuity / limited / medium`。两者审计通过但 paid preflight 仍 false，且 P01B继续报告 `continuity_source_not_accepted`。未点击生成、未调用 Provider。
- 自动化：原 focused 47/47、新增首帧边界 focused 34/34、资产拒绝显示 focused 6/6；最终完整 `npm run verify` 283/283，架构边界检查与 Next.js production build 均通过。

## Prompt 完整性与通用运镜控制 QA（2026-07-21）

- 场景：用户要求图生视频保持静态状态，同时用精准文字补全动态，并询问复杂旋转环绕是否需要画面线条。
- 产品结论：不是只有环绕要画线。推拉/跟移/升降/摇臂用空间路径，摇镜/俯仰用视轴弧，变焦/拉焦用时间曲线，手持用振幅包络，复合运镜组合使用；环绕再增加轴心、半径、方向和弧度。
- 安全边界：每条运镜必须绑定干净首/中/尾构图 capture，`overlayPolicy` 只能是 `editor_only`。路径线、视轴弧、镜头曲线、包络、箭头和标签进入参考图时，合同校验直接失败。
- Prompt 边界：内容 Prompt 会得到可执行的数值起终相机状态、运动几何与时间语义，但不含 Director control ID 或 capture ID；只写运镜动词而无结构化计划时，lint 和 preflight 同时阻断。
- 真实回放：P01A r42 与 P01B r13 的 20 域覆盖均通过；两者当前分别停在推进/短推与短推—下摇—跟符缺少结构化控制和干净首中尾帧，且原有资产、关键帧、H1/连续性阻断仍保留。
- 自动化：本轮聚焦测试 49/49 通过；该阶段完整 `npm run verify` 296/296，架构边界与 Next.js production build 通过。

## 分镜参考/硬帧分离与标注参考 QA（2026-07-21）

- 回归根因：批量视频派发曾把任意 selected 故事板图写入 `firstFrameMediaId`。这会把场景/人物/构图参考误当真实 `t0`，使上一段已验收尾帧失去续接权威。
- 请求门禁：普通 composition/action-phase 图只产生 `image_reference + referenceMediaIds`，请求中不得出现 `firstFrameMediaId`；硬首帧必须明确 role 且具有当前媒体/checksum/Shot revision/五域像素验收证明。三种视频输入形态互斥。
- 局部定位：完整场景母版可作为语义参考或派生标注图说明局部属于哪个区域；frame-only Provider 不能同时收普通参考时，必须通过桥接关键帧、遮挡/重叠交接或剪辑解决。
- 标注图：`provider_reference_only` 只允许进入 `image_reference`。圈选、路径、箭头、方向和时间窗与 Prompt 共用同一结构化合同；几何 ID 不符、时间越界、未绑定、role 错误或首/尾帧模式全部阻断。标注是控制符号，不得进入最终画面。
- 图文冲突：普通像素与目标不同必须显式 `replace / ignore / complete`；未声明冲突不得执行。标注与 Prompt 不允许存在可解释冲突。
- 安全：本项未调用 Provider，付费门禁保持关闭；该阶段完整 `npm run verify` 296/296，架构边界与 Next.js production build 通过。

## 逐帧时空运动与故事板可选化 QA（2026-07-21）

- 概念纠偏：故事板只证明若干空间/叙事采样点，文字时间段也只描述阶段；二者都不能证明相邻帧的路径、速度、加速度、接触和动作相位。复杂镜头用故事板审批构图/调度，用动态预演审批时间/运动。
- 合同门禁：`temporalMotionPlan` 必须从 0 秒连续覆盖 Provider 端点，阶段无空洞/重叠、依赖只能指向前序阶段；每条主体/道具/相机/环境状态轨至少包含起终状态，所有相邻状态必须有且只有一个显式过渡，必经中间态必须严格位于该过渡时间内。
- 全时间线 QA：验收策略要求逐相邻帧核对位置/朝向差分、速度/加速度连续、接触、动作相位与银幕方向，不能用几张好看的抽帧替代动画质量证明。
- 真实 P01A：r44 改为普通 `image_reference`，故事板门禁与 `firstFrameMediaId` 已移除；Director 参考只锁空间/机位，不锁代理造型。preflight `ready:false / stale:false`，明确报 `structured_camera_trajectory_required` 与 `temporal_motion_plan_required`，并保留资产/会签阻断。
- 真实 P01B：r14 仍是上一段真实 ACCEPT 尾帧硬续接；当前 Owner v4 REJECT、H1 缺失、连续性与运动计划均使其阻断。没有从 P01A 的语义参考路线继承错误像素。
- 自动化：focused 39/39；完整 `npm run verify` 300/300，架构边界与 Next.js production build 通过；两个主文件仍为 499 行，Schema 为 1 行。未调用 Provider。

final result: passed；时间顺序已成为可机检合同，真实两单元保持安全阻断

## Director World 拒绝状态闭环 QA（2026-07-21）

- 复现：画布把旧红色客栈图标为“全景环境参考（非权威）”，但中央 Director viewport 仍将其作为 active environment 渲染；P01A/P01B Shot 也保留在该环境上导出的 capture。
- 数据修复：媒体最新 REJECT 为 `review-95f128f5-3be4-4b14-aac8-c0b25fa00fe2`；Scene Authority r7 rejected；Director receipt 将 v160 清到 v161；P01A/P01B Shot r41/r36 的顶层和嵌套 binding 均为空。
- UI 验收：刷新真实项目后世界节点显示“全景参考 · 未绑定 3D”，导演台中央只显示纯3D对象/地面，不再显示红色全景；历史 capture 节点仍可审计。
- 生成验收：P01A/P01B compilation 的 `directorStageReferences=[]`，两者 `ready:false / stale:false`；错误环境不会进入 Provider payload。
- 回归门禁：未审片世界、latest REJECT 世界、未审片预览均无法绑定；latest ACCEPT 的正常世界和 Gaussian 主体+预览仍可绑定。focused 9/9，完整 `npm run verify` 302/302、架构边界与 Next.js build 通过；无 Provider 调用。

final result: passed；错误环境已从可见画布和主生产引用同时撤下，且不能被 candidate/rejected 媒体重新绑定

## 剧情 → 分镜脚本 → 视觉生产 revision 门禁 QA（2026-07-21）

- 用户缺陷：旧流程能在剧情和分镜脚本尚未被 Owner 定稿时继续生成 Authority、关键帧或视频；视觉执行再准确也只会放大上游错误。
- 机器行为：production compile 自动要求 `cinematic_story_revision / cinematic-story:<id>:r<revision>` 与每个 `cinematic_shot_revision / cinematic-shot:<id>:r<revision>` 的 latest review 为 `accepted`。错误码为 `story_owner_acceptance_required`、`shot_script_owner_acceptance_required`。
- 失效行为：Story/Shot revision 更新时旧 review target 不匹配；同 revision 后写 REJECT 会覆盖旧 ACCEPT，已有 compilation 出现 `owner_story_shot_reviews` stale。manual Prompt、专业会签、高分和 Provider capability 不可覆盖。
- API/自动化：覆盖无 review、只接受 Story、Story+Shot 全接受、Shot revision bump、同 revision later REJECT，以及导入既有视频不绕门的路径。Authority/Storyboard 还验证缺 review 时在 budget reserve 前阻断，Provider 调用与 reservation 都为 0。最终 `npm run verify` 310/310，architecture/build 通过；Skill quick validation 通过。
- 真实项目：P01A compilation `prompt-compilation-6616f8d0-132b-420f-9d80-b667e9779ca3` 明确保存 Story r2/Shot r41 的 null review lineage；P01B `prompt-compilation-fd3ab818-e7d6-4f47-9407-743da3108ba9` 保存 Story r2/Shot r36 的 null lineage，并继续报 v4 REJECT `continuity_source_not_accepted`。两者 `ready:false / stale:false`，无 Provider。
- 内容结论：Story r2 仍把酒客写成“统一转向入口”，与 Owner 锁定的身体朝桌、头前无脸、后脑唯一脸看入口冲突，因此不能接受。下一道工作是先生成 Story r3 修订建议并由 Owner审，再审完整 14 镜。

final result: passed；规则已进入 Skill、权威文档、Core、API、自动化与真实 CLI preflight，当前错误剧情没有被误标 ACCEPT

## 因果表演时间轴与 Shot Owner ACCEPT 门禁 QA（2026-07-21）

- 用户证据：高质量固定长镜头 Prompt 没有只写“女人很悲伤”，而是按“平静说话 → 对方沉默离场 → 目送 → 眼眶/嘴唇/喉头开始失控 → 强撑不落泪 → 到达阈值 → 低头撑桌 → 无声落泪与肩膀颤动”写出完整表演过程。另一份技巧图将浅景深、秒级微表情和皮肤解剖并列；QA 结论是秒级因果为核心，景深负责观众注意力，皮肤细节只负责适合景别的表面可信度，三者不可互相替代。
- 合同：每个可审批 Shot 的 `performance` 必须有 `initialState / trigger / temporalBeats / turningPoint / endState / forbiddenActing`。至少三个节拍从 0 秒无空洞、无重叠地覆盖到 Shot 结束；每段同时写 `internalState` 与 `visibleEvidence`。禁止只写“悲伤、愤怒、恐惧、激烈”或堆瞳孔/鼻翼/咬肌关键词。
- 因果：节拍顺序固定审查为刺激进入 → 视线捕捉 → 确认/决定 → 呼吸与局部肌肉改变 → 手部/重心/接触动作 → 结果读取与恢复/失控。动作或情绪在触发前提前泄露、没有阈值、没有状态保持/回收、用镜头晃动代替表演，均为否决项。
- 摄影与尺度：表演合同另行声明焦点平面、前景虚化与拉焦时机；固定机位也必须控制观众注意力。毛细血管、泪膜、眼睑和咬肌只在景别、焦点、光线可分辨时使用；中远景优先验收呼吸、肩膀、手、脚底与重心，避免无意义皮肤细节导致身份漂移。
- 产品门禁：`cinematic-performance-timeline-policy.mjs` 在 Owner Shot ACCEPT 与视觉生产复核两处执行；缺失返回 `shot_performance_contract_required`。Prompt renderer 会真实输出全局秒数下的“人物内在 + 可见证据”，不再把嵌套 `temporalBeats` 静默丢弃。
- 真实项目：Story 已通过 CLI 更新为 r3 草案；14 个当前 Shot 均拥有 4–6 个独有表演节拍并通过同一 policy。P01A Shot r42；P01B Shot r39、GenerationUnit r15、时长 5 秒、8 个 blocking reviewRequirements。P01B 现完整表达斗篷 H1 → 原桌席守恒 → 尸傀可见起身/后退 → 完整对白 → 三符 → 受击倒地 → 顾沉启动，三套时间轴一致且 `generation_time_plan_mismatch` 已消失。
- 安全状态：没有写 Story/Shot ACCEPT，没有 Provider 调用。P01A compilation `prompt-compilation-97ec4082-8e83-4393-a50b-7ef8e83cdc03` 与 P01B `prompt-compilation-061f77e5-9ed2-4330-9cba-3ba9d9689e5f` 都记录 Story r3 和当前 Shot null review；P01B 仍由 P01A v4 REJECT、缺真实 H1/连续性交接、Authority/Director、结构化相机与逐帧运动计划阻断。
- 验证：新增/受影响 focused 30/30；完整 `npm run verify` 315/315，architecture boundaries 与 Next.js production build 通过；Skill quick validation 通过。`application.mjs` 490 行、主 production use-case 499 行，未破坏原子模块上限。

final result: passed；表演从形容词升级为可编译、可审批、可逐时段验收的因果过程，真实项目仍安全停在 Owner 审查前

## 主动剿灭动机与推进方向 QA（2026-07-21）

- Owner 纠正：三人不是进入客栈后试图从前门撤退，而是为剿灭其中怪物主动进入；白璃“杀出去”意为沿入口→大堂中央→后出口纵深杀穿尸傀阵线。
- 上游合同：Story r4 删除“封闭退路”式补丁因果，写入三人任务、人物目标、对白意图和 P0 review issue；当前 revision 仍未 ACCEPT。
- 分镜合同：P01B Shot r40 将叙事任务、表演初态/触发、六段节拍、调度、摄影目的、剪辑方向、禁止项和验收标准统一为向客栈深处主动清剿，禁止面胸朝入口侧摄影机奔跑或回身向前门逃跑。
- 生成合同：P01B GenerationUnit r16 新增 blocking check `p01b-extermination-direction`，并将方向写入 `controlIntent`、`promptCoverage`、续接 H1 后新增内容和反例逃逸路径；三符与顾沉必须同轴向深处推进。
- 真实预检：P01A compilation `prompt-compilation-f161aacd-c2b6-4d1f-b8f8-47ba302d0e88` 记录 Story r4/Shot r42/Unit r44；P01B `prompt-compilation-5a14bac8-517e-4aa9-b253-ce9d608732fa` 记录 Story r4/Shot r40/Unit r16。两者 `ready:false`；P01B 首帧为 null、references 为空、连续性来源仍是 Owner v4 REJECT，且没有 `generation_time_plan_mismatch`。未调用 Provider。
- 验证：Skill quick validation 通过；完整 `npm run verify` 315/315、architecture boundaries 与 Next.js production build 通过。

final result: passed；错误“撤退”动机已从剧情、分镜、Prompt 与像素验收方向中同时移除，当前生产仍安全阻断

## Story r5 肢体占用与道具归属 QA（2026-07-22）

- 审计输入：Story r4、锁定源剧本 14 行、当前 Shot 12/13 与 P01A/P01B compilation。
- P0 发现：Story 锁定“顾沉双手持续持刀”，但终结动作写“锁住脚踝”；Shot 13 进一步写成“双手锁脚踝”，同一双手出现互斥占用。
- 修复：Story r5 锁定刀随甩飞从伤口拔出并继续由顾沉双手控制；终结限制改为双腿剪锁脚踝。同步更新人物表演弧、因果链、禁止项和 review issue。
- 可持续规则：Story/Shot 审查新增逐节拍肢体占用与道具归属检查；换手、脱手、拔出、落地、回手必须有可见过程，后续 Shot 不得改写 Story 已锁定的物理方法。
- 安全验证：P01A/P01B compilation 均读取 Story r5，且 Story Owner review 仍为 null/未接受；所有视觉生产保持 blocked。未调用 Provider。

final result: passed；物理矛盾已在 Story 层修复并成为通用门禁，未越权写入 Owner ACCEPT

## Story r7 错误对白语义 QA（2026-07-22）

- 失败：r5 仍保留“杀出去”，再用 `intent` 解释成“向后出口方向杀穿”；这没有真正落实 Owner 的“进入就是为了消灭怪物”。
- 修复：Story r7 删除该对白及锁定文本；三人确认尸傀目标后直接开始清剿，白璃三符攻击前排，顾沉与洛青接入贴身战。移动只服务于接敌、围歼、救援和搜索残余威胁。
- 通用回归规则：字面语义错误的对白不得由 metadata 洗成正确；Story 删除后，下游 Shot 的对白、表演、声音、时间槽、连续性和验收字段必须同步更新，旧 revision 不得获得 ACCEPT。
- 安全：Story r7 当前 Owner review 仍为空；视觉生产保持 blocked，没有 Provider 调用。

final result: passed；错误对白已从 Story 真相层移除，旧 Shot 残留被明确隔离为待审历史 revision

## Story r7 接受范围与 Shot 1–2 候选同步 QA（2026-07-22）

- Owner 决策范围：在明确询问 Story r7 后收到“可以”，仅写入 Story r7 ACCEPT `review-e65a5c46-94c0-4334-9d76-294af6651332`。Shot r43/r41 的 review 仍为 null；没有把一句确认扩张成分镜、资产、关键帧、GenerationUnit 或付费授权。
- 上游事实同步：脚本活动字段已删除错误对白和“后路被封”，但保留历史摘录供审计并标为 superseded。Story r7 编译 lineage 为 `accepted:true`，不再报 Story Owner gate。
- Shot 1 r43：4 秒、4 个连续表演节拍、无错误；先证明身体不转、头前无脸、唯一脸在后脑至少 0.8 秒，再使用真实斗篷 H1。下一镜不再被描述为发令。
- Shot 2 r41：5 秒、6 个连续表演节拍、无错误；1.5–2.2 秒白璃无对白地依次锁定 A/B/C 并展示恰好三符，2.2–3.1 秒三符一次离手，3.1–4.3 秒三条独立轨迹分别命中并让三名目标真实倒地，4.3 秒后顾沉才进入当前前排交战面。
- GenerationUnit r18：11 项 blocking 检查覆盖三符数量、右手动作源、A/B/C 映射、三处命中与倒地、H1 状态守恒、原席可见起身、无对白表演、顾沉进入时机、清剿目的和怪物解剖。H1 只定义 `t0`；后续动态由精准 Prompt 与时序合同负责。
- 编译验证：P01A `prompt-compilation-5e337336-6013-43ef-8692-9e265eebf9fd`、P01B `prompt-compilation-c837b822-e3a2-4cb5-bed0-9151cf68fbfd` 均 `performance.ok=true`、`promptCoverage.ok=true`。P01B 编译 JSON 对旧对白/杀穿/突围/撤退/深处推进与旧 command/advance 标签扫描为零。
- 安全状态：两个 Shot 仍未 ACCEPT；P01A/P01B 都保持 blocked，P01B 仍指向 `cinematic-evaluation-bloodmoon-p01a-owner-veto-reject-v4`，first frame 为空。未调用 Provider。
- 全量复跑：314/315；唯一未通过项为 2000 clip 写入性能阈值（5164.8ms，要求小于 5000ms）。在系统已有约 99% CPU 的长期 `bun test` 进程、load average 14.42 下单独复跑为 6311.9ms；其余功能测试全部通过。该项记录为环境负载下待复核，不标记全量通过。

final result: content and safety passed；Story 的明确接受已持久化，Shot 和付费权限没有被越权放行，前两镜候选已与新剧情完全同步；全量性能门仍待低负载复核

## Shot 1–3 Owner scope 与本镜域 QA（2026-07-22）

- 审批作用域：Shot 1 r43 与 Shot 2 r41 分别由独立 review 接受；review note 明确排除资产、关键帧、Unit 与付费权限。P01A/P01B 重编译后仍 `paidReady:false`，证明 Shot ACCEPT 没有误放行视觉生产。
- Shot 3 source 同步：当前 source row v3 / document r32 结束状态是“顾沉进入当前敌群并与左右尸傀形成贴身交战，入口与队友位置仍可追踪”；Shot r10 已与其一致，不再用“后路被封”解释行动。
- 时间连续：`performance.temporalBeats` 与 `internalTimeSlots` 使用相同六个区间 `0–0.6 / 0.6–1.3 / 1.3–2.0 / 2.0–2.7 / 2.7–4.3 / 4.3–5.0`，无空洞、无重叠、端点等于5秒。
- 动作可读：骨斧起势后才闪避；刀鞘接触下巴后才后仰；髋—肩—刀传力并接触膝线后才失衡。末端只让左右攻击线入画，不提前命中下一镜事件。
- 摄影与空间：机位留在入口侧半空间，跟肩、横移、约70°短弧、刹停四段均有时间窗；不越到敌群背后。入口、队友、三名旧倒地目标和三条焦痕保留追踪证据。
- 视觉身份：所有尸傀头部正前方为平滑无眼鼻口皮肤，唯一完整脸嵌在后脑枕骨；正常前脸、双面脸、骷髅或外露头骨一票否决。
- 污染清理：Shot 3 当前顶层 Director binding、blocking 嵌套 binding、copied camera 均为空；旧 Director node、capture、image media 和 rejected world media 的精确 ID 扫描为零。断枪、破墙、腕骨和雷击不再作为本镜正向声音/VFX。
- 安全：Shot 3 r10 尚未 Owner ACCEPT；无 GenerationUnit、无首帧/reference、无 Provider 调用。产品全量 verify 未重跑，仍保留上一轮 314/315 的高负载性能失败记录。

final result: passed as a review candidate；Shot 3 source, time, action, space, identity and rejected-lineage contracts are internally consistent, but Owner acceptance is still required

## Shot 3 ACCEPT 与 Shot 4 道具/受力 QA（2026-07-22）

- Owner scope：Shot 3 r10 由 `review-3db0740b-a6dc-4e85-b559-2b319ff5dbc5` 独立接受；review note 明确不授权资产、关键帧、Unit 或 Provider。
- 跨镜道具：镜3结束保持左手直刀、右手刀鞘；镜4 r30 使用刀鞘从刀背下交叉支撑，拒绝无过程双手持刀、刀鞘消失、换手或穿模。
- 受力因果：L利爪0.5秒后先接触直刀；R利爪1.2秒后才叠加到刀/刀鞘支点；随后才出现双臂震颤、左右脚补偿和3.2秒后的右膝触地。未接触自动下跪为否决。
- 时序：六段 performance 与六段 internal slots 同边界覆盖0–4秒；洛青枪尖仅在3.7秒后进入左耳侧安全线，命中、踩肩、腾空全部留给镜5。
- 空间连续：四名先前倒地尸傀、三条焦痕、入口、白璃、洛青及左右攻击者来源持续；机位留在入口侧左方安全区，只垂直下沉约0.55米，不横漂越轴。
- 身份与谱系：尸傀头前无脸、后脑唯一完整脸；旧 Director v86 顶层/嵌套/copied camera 为空，旧 node/capture/image/world media 精确 ID 扫描为零。
- 安全：Shot 4 r30 只是待审候选；无 GenerationUnit、无 Provider 调用。数据合同与递归扫描通过，未把文档/数据更新冒充产品全量 verify。

final result: passed as a review candidate；Shot 4 r30 preserves prop custody, force transfer, time continuity, space and monster anatomy, but still requires exact Owner acceptance

## Shot 4 ACCEPT 与 Shot 5–14 全序状态机 QA（2026-07-22）

- Owner scope：Shot 4 r30 由 `review-18e80471-ebfe-4fcf-ae78-5ab4f860b929` 单独接受；Shot 5–14、资产、Authority、Director、关键帧、Unit 与 Provider 均不在范围内。
- 上游一致性：Story r7 与结构化脚本逐行比较后，Shot 5/7/13/14 source row 升到 v3、document r36；原文保留，怪物解剖、符咒来源、终结肢体占用/法术因果和局部木板规则以 Owner normalization 明确覆盖。
- 全序 revision：S5r35、S6r9、S7r9、S8r13、S9r35、S10r35、S11r9、S12r35、S13r35、S14r35。十镜 `performance.temporalBeats` / `internalTimeSlots` 均从0连续覆盖完整 duration。
- 跨镜守恒：刀鞘、直刀、整枪/两截断枪、右腕骨折、顾沉右膝/颈/额伤、九具倒地尸傀、焦痕焦灰、左墙单洞、碎桌椅和鬼将碎片均有明确进入、变化和退出状态；同一肢体不再承担互斥动作。
- 动作源：Shot 7 三张上方雷火符按“离手→上升→口令→俯身→引爆”执行；Shot 13 按“第一句→双腿剪锁→左手断枪卡臂→第二句→掌心起雷→五道雷柱→跪地碎裂”执行。
- 引用隔离：Shot 5–14 顶层 Director binding 为 null；blocking nested binding、copied camera、旧 Director node 和 rejected world media 精确 ID 递归为零。旧像素不能作为首帧、普通参考或导演台证据。
- 安全与验收：十镜仅为待审候选，不写批量 ACCEPT；不创建付费执行权限。focused evaluation gate 6/6；完整 verify 315/315、architecture boundaries、Next.js production build 通过；Provider 调用0次、费用0。
- 下游防逃逸：旧 Unit r03–r08 逐个安全编译均为 `lint.ok=false / preflight.ok=false`；除共同 Owner/Director/keyframe/visual carrier/signoff/Manifest/Authority 门外，r04 的旧 Prompt 有 `provider_model_leak`，r05 的时长计划有 `generation_time_plan_mismatch`。它们被明确归类为待重建旧 Unit，不是可复用生产单元。

final result: passed as a consolidated review set；Shot 5–14 are internally consistent and safely blocked pending exact Owner decisions and rebuilt visual evidence

## Shot 5–14 ACCEPT、Authority 像素与 Unit 生命周期 QA（2026-07-22）

- Owner scope：十个当前 Shot revision 已各自 ACCEPT；该“接受”不包含尸傀/场景 Authority、KF、Director、Unit、Provider 或付费。
- 尸傀像素：4/4 旧媒体均失败。拒绝普通人头、身体正前方普通脸、双头块/空白鼓包、反向侧脸+卵囊；只有同一自然单头、前方无眼鼻口、后脑枕骨皮肤浅嵌唯一完整脸才可 ACCEPT。Authority r13 candidate，accepted version 为空。
- 场景像素：5/5 旧媒体均失败。主轴必须是机后前入口→大堂中央→关闭的后双木门；不得透过后门看到室外、建筑、天空或血月。Authority r8 candidate，accepted version 为空。
- 关键帧/Director：KF02 最新 `review-fcb55580-374e-4673-be5b-10b11ccd47b1` 覆盖旧局部 ACCEPT；KF01/KF02 rejected，KF03–KF14 blocked。World/Director media 为空，14 captures 全部 stale audit；不得进入 current reference 或 frame payload。
- 产品硬门禁：新增 GenerationUnit lifecycle policy/schema/type/compiler projection。缺失 lifecycle 仅为 legacy active；blocked 状态返回 `generation_unit_lifecycle_blocked`；superseded 返回 `generation_unit_superseded` 且必须带原因/替代计划。Core integration 证明即便传入付费批准，也在预算预留和 Provider 之前返回 `cinematic_preflight_failed`。
- 真实数据：P01A r45 blocked；P01B r19 继续因 v4 REJECT blocked；P02–P08 superseded。P02 compilation `prompt-compilation-4c2a75d2-f705-4b15-8fe6-87d16f1b0ab4` 与 P01A compilation `prompt-compilation-45a04bef-3811-4efa-a1e8-d7c922dd6fcd` 都 `ready:false`。
- 免费重建点：尸傀侧解剖与场景母版 compilations 分别为 `image-prompt-compilation-4d987670-5129-42d9-8ea5-5d5852ad3e2b`、`image-prompt-compilation-deee4e90-9217-4153-9cb3-82344898dc34`；均 lint 通过、Provider 未调用。
- 画布投影：Browser 真实回放确认 P02–P08 显示“旧生成单元已废弃”，14 张 Director capture 与 KF01/KF02 均无 active image 并显示“图片已隔离”；Authority REJECT 与 P01A/P01B 阻断原因仍正确可见。旧媒体未删除，只保存在 `stale*` 审计字段。
- 自动化：focused 134/134、projection focused 9/9；完整 `npm run verify` 320/320，architecture boundaries 与 Next.js production build 通过；主文件 499/499 行，Schema 1 行；Skill quick validation 通过。

final result: passed；all reviewed Shots are accepted, every invalid visual lineage is quarantined, and paid execution remains deterministically blocked before budget/Provider

## Authority 候选像素 QA（2026-07-22）

- 付费作用域：只执行两张 GPT Image 2 Authority 候选，各 CNY 2、各一个幂等键；没有盲重试、视频、自动通过或 downstream 解锁。
- 尸傀 REJECT：`media-9481e1b1-ae88-42d6-9f0b-c31aa9f60182` 的脸位于身体后方且无骷髅，但仍是突出鼻唇、独立下颌的正常反向侧脸；无脸前部是巨大扁平头囊，头颅超长且颈部不居中。该图 latest review 为 REJECT，资产版本只可审计。
- 场景 candidate：`media-28707daf-54bd-4711-acc1-7f2c2b7aef45` 为单张满幅二维背景，左柜台、右后楼梯、二层回廊和后中轴关闭双木门清晰；无人物、文字、箭头、破坏、室外景框或可见月体。请求 1536×1024，实际返回 1774×887；按 Owner 明确的上游 2K 最长边上限/常见约 1K 输出档，这是正常尺寸归一化，不是 QA 告警。Agent 像素硬检查通过，但 Owner 尚未接受，不能绑定 World/Director。
- 防复发：同一拓扑逃逸在更长、更完整 Prompt 下仍复现后，Skill 要求停止文字堆叠和付费盲重抽，先切换到结构化几何/标注语义参考并明确 preserve/replace/complete/ignore。尸傀资产节点 r37 已落地 `bloodmoon-corpse-geometry-reference-v1`，锁定单颅闭合包络、中央颈部、前无脸区、后脑浅嵌脸和禁止的正常反向颌颈区；标注必须与 Prompt 同坐标系且不得进入干净输出。
- 回归门禁：当前 P01A/P01B compilations 分别为 `prompt-compilation-45a04bef-3811-4efa-a1e8-d7c922dd6fcd`、`prompt-compilation-4883f844-5d58-49bb-8afe-cf5f1a70c881`，均 `ready:false / stale:false`；场景 candidate 没有自动晋升，尸傀 REJECT、P01A v4 REJECT 与 P01B 首帧/连续性交接阻断均保持。

final result: partial；scene candidate is review-ready, corpse authority remains blocked, and no video gate has been opened

## Scene Authority exact-media ACCEPT QA（2026-07-22）

- Owner scope：紧邻场景母版审查问题的“接受”只接受 `media-28707daf-54bd-4711-acc1-7f2c2b7aef45`，明确排除尸傀 Authority、P01A/P01B 视频、重抽与付费 Provider。
- 像素血缘：latest media review `review-4ec6b53a-8b2e-4d29-91cf-e9f53af463bb`；SHA-256 `4a1dc94894ab243d6c3f56360f0ed582e2abe3402575cd8679a42fbb179af3fd`；1774×887。尺寸符合最长边不超过 2K 的 Provider 输出策略，不是 technical warning。
- 原子晋升：accepted asset version `asset-version-c0465e41-fada-4299-ba8b-fee191c118b4` 保留 source candidate r8；Scene Authority 升为 r9 accepted；资产节点升为 r37 `authority_accepted`，四处 accepted/current ID 与 checksum 完全一致。旧五份 REJECT 继续只可审计。
- 防误放行：P01A compilation `prompt-compilation-dbfba27c-1195-4671-8a69-bc914d0da579` 仍报尸傀 r13 未接受并保持 lifecycle blocked；P01B `prompt-compilation-3278c1b5-c014-465a-a2dc-fc2e5d15d4ae` 仍缺 accepted H1/first frame，连续性来源仍为 P01A Owner v4 REJECT。
- 成本：无 Provider 调用，预算没有变化（消费 CNY 28 / 预留 0）。本轮没有源码变更，因此没有重复声明全量产品测试通过。

final result: passed；the exact scene master is durably accepted, rejected scene history and corpse blocking remain intact, and no paid/video gate was opened

## P01A 三态技术预演与前景裁切 QA（2026-07-22）

- 分层真相：Scene r9 像素只控制非度量外观；stage r179 的 20×20×8 m geometry 控制对象坐标、桌席占位、可行走通道和 camera transform。UI/文档不得把美术 plate 写成“空间测量已证明”。
- 三态可视检查：start/mid capture 保留入口三人、八名酒客、桌席与中央通道；end capture 为斗篷擦镜特写，裁切三位前景人物是有意退出态，不得误报背景实体缺失。
- 声明式例外：只有相机字段 `intentionalForegroundCropIds=[baili,guchen,luoqing]` 可豁免这三个前景主体。未声明背景、未知 ID、重复 ID 或非法字段全部 fail closed；不得从镜头景别或 Prompt 猜测。
- 时序可读性：Shot r46 的 2.4–3.3 秒硬保持让后脑唯一脸/头前无脸事实有阅读时间；3.3–3.7 秒直线快推不环绕越轴；3.7–4.0 秒由真实斗篷全幅遮挡形成 H1。Unit r47 对 camera、三位主角、八名酒客和斗篷均有相邻状态过渡。
- 像素与技术证据隔离：三份 Director capture 不能作为尸傀身份、最终关键帧或 Owner ACCEPT。尸傀 r14 清空旧媒体，几何方案仍须先证明同一单颅、中央颈部、前无脸皮肤和后脑浅嵌唯一人脸。
- 当前诚实状态：P01A preflight `ready:false / stale:false`，Shot r46 未接受、尸傀未接受、专业会签/Manifest 未完成；P01B 继续读取 v4 REJECT 且无 first frame/reference。focused 50/50 + 4/4；完整 verify 323/323、architecture/build 通过；未调用 Provider。

final result: passed as unpaid technical preflight；camera/temporal evidence is coherent, but creative pixels and current-revision Owner gates remain deliberately closed

## P01A Shot r46 ACCEPT 投影 QA（2026-07-22）

- exact scope：Owner review `review-43276f84-bdc6-4318-a979-409d6044dd78` 只接受镜头1 r46；不把技术预演当作尸傀最终像素，也不授权 Provider。
- gate isolation：新 preflight 的 Shot review 为 accepted；camera trajectory、temporal motion、mode control、Prompt coverage 均为 true；尸傀 Authority、专业知识/Manifest 与 lifecycle 仍独立阻断。
- visible state：P01A node r98 已显示“镜头1 r46已由Owner精确接受”，不再显示过期的 Shot 待审原因；P01B 仍显示旧候选被拒且缺 P01A accepted H1。
- cost/safety：`ready:false / stale:false`，Provider 0次、费用0。

final result: passed；the exact Shot gate is closed as accepted while every pixel, continuity and paid gate remains closed

## Corpse r15 paid-candidate pixel QA（2026-07-22）

- Scope：exactly one CNY 2 `side-anatomy-proof`; no retry, video, auto-accept, or downstream unlock.
- Execution：Authority r15 / compilation `image-prompt-compilation-af4b6881-7ee5-4946-b92c-578280c8a466` / run `run-a623a855-ed90-44ad-8b83-d0018375378d` / media `media-32fde63e-444f-43ac-8369-e9c553c2df00`; 1024×1536, SHA-256 `f628fe5c8408961824d2cc437c3faf9e48766db813a2f8756e48e7a8a2aef05b`, empty image references.
- Veto result：FAIL. The rear-facing skin face is still an ordinary reversed profile with projecting nose/lips, an independent jaw and a neck continuation. The faceless front becomes a giant blank ovum; the skull is too long and the neck is off-center. Absence of exposed bone does not compensate for failed topology.
- State projection：latest media review `review-3f4d43b6-d4a7-4102-9572-7cfc8b847bf6` is REJECT; audit version `asset-version-02bed4fa-6e3f-46ac-958e-2de0a1dcc23d` cannot be used for Authority, reference, or frame input. Authority r16 remains candidate and the visible node has no current media.
- Downstream：P01A Unit r48 / compilation `prompt-compilation-30264b76-b314-4792-b41b-3ab6f5b99329` remains `ready:false / stale:false`; camera/temporal/mode/prompt audits pass while accepted corpse Authority, professional signoff, TeamManifest and lifecycle gates fail. P01B remains blocked.
- Modality decision：another same-model text-only reroll is not a valid fix. Build a conflict-free structural control reference first, then request a new paid approval.

final result: rejected on exact pixels and safely quarantined；no retry and no false progress projection

## Cross-modal Skill gate QA（2026-07-22）

- Entry routing：主 Skill 在任务入口强制读取 `references/cross-modal-image-video-control.md`，触发范围覆盖 Authority、生图、故事板/关键帧、语义图参考、首/尾帧、表演、运镜和多段续接。
- Mode truthfulness：`image_reference` 不再默认等于首帧；`first_frame`/`first_last_frame` 只承担真实边界状态，三种 Provider 输入形态保持互斥并受能力注册约束。
- Conflict closure：每张图有 preserve/replace/complete/ignore 和职责边界；局部图有全局定位；图像、标注、Director 坐标和 Prompt 任一冲突即 fail closed。
- Temporal proof：故事板只证明空间/构图；动态风险必须有 phase/state tracks、相邻状态、速度/接触和 timed previs。表演使用可见因果微动作，不用情绪形容词替代时序。
- Editorial proof：15 秒分段只允许 `TAIL_CONTINUE` 或 `DUPLICATE_HANDOFF`，以真实 accepted H0/H1、动作相位、曝光、声音和 trim plan 证明无缝交接。
- Spend protection：最终 no-spend checklist 同时复核 current-revision Owner、exact-pixel review、latest-review override、hard veto、mode capability、signoff、budget 与 fresh paid approval。
- Validation：Skill quick validation 通过；本轮无 Provider 调用、无预算变化、无生产合同状态变更。

final result: passed；the recurring image-to-video, motion, acting, camera and seam lessons are now executable preflight checks

## Corpse group board + P01A r49 QA（2026-07-22）

- Rejected proof：P01A proof r2 `media-e281f501-f490-4057-a43e-c6e76bd2144f`/`review-11a89b92-17cd-43d3-8ad4-2cc2bc41462f` fails the defining anatomy gate. Rear markings are not complete faces and a normal side face remains visible; overall composition cannot compensate.
- Constraint scope：the four-pair `ensemble` board initially inherited a single-subject “no other people/crowd” rule. The new atomic scope policy removes only contradictory composition exclusions while preserving anatomy, identity, medium and topology prohibitions. Focused regression passes.
- Pixel acceptance：group media `media-711c3702-2b0a-4dcd-9689-517e50896882`, 1536×1024, checksum `1ff5d4230ff9a6cf5f306313a9f0e1bb384b20b5ddb588b5ee294f57c4e86707`, visibly contains exactly four distinct front/rear pairs. Front bodies are faceless; rear bodies expose the sole occipital face; all heads remain closed, non-skeletal and centrally necked.
- Semantic-role isolation：accepted review `review-2c501973-8aa0-4c31-9e0c-c2ec15f5e4ec` permits group identity/reference only. UI/projection must never label this board as first frame, last frame, action state, scene plate or metric blocking.
- P01A compile：Unit r49 has nine ordered references and zero first/last frames. Each reference exposes what it controls and what it does not control; the Prompt/24fps contract owns motion, timing, contact, camera travel and H1. Compilation `prompt-compilation-ccc94cf3-8426-4442-9291-eac9a68b0f27` is fresh and technically valid but remains blocked by current specialist signoff and TeamManifest.
- Downstream safety：P01B compilation `prompt-compilation-ae3092fe-be5a-4551-90b0-972447b7d133` is fresh but has zero references/first frame and still cannot inherit P01A. No video call occurred.
- Verification：focused 39/39; full `npm run verify` 326/326; architecture and production build pass. Executable modules retain the 500-line ceiling; the public JSON Schema is treated as data, not an atomic source module. Budget consumed CNY 52, reserved 0.

final result: passed for exact group identity and semantic-reference separation；video remains correctly blocked by governance and continuity gates

## P01A r3 keyframe candidate QA（2026-07-22）

- Pre-spend gate：nine references were rejected before payment by the five-reference single-keyframe ceiling. The selected five are scene appearance, Baili, Guchen, Luoqing and corpse-group identity; no reference was silently dropped after compilation.
- Lineage：compile `image-prompt-compilation-cf40ca9c-9c70-42cf-943b-2f042c0b09b6` → batch `storyboard-batch-9476c61e-2e2a-4f09-b739-39cfa8bd19a3` → run `run-748b5ee4-07d6-494b-9343-86062d1cd2ff` → media `media-06bc2416-76d7-4c8a-bbce-5ab35cdb106a` → checksum `a681750d420969cbbfb8c41ee617a94fb6c83036fb12504c1e979e3eaa0319e2`.
- Visible pass：three protagonists occupy the entrance foreground; eight corpses occupy four table groups; corpse backs/hands remain table-oriented while occipital faces look toward the heroes; closed skin skulls contain the visible features; no exposed skeleton, second head or two-faced head appears; the closed rear doors and center aisle preserve scene depth.
- Truthful limit：the faceless front surface lies on the far side of each head in this rear-looking composition. QA inherits that off-camera invariant from accepted Authority r27 and does not claim the keyframe independently shows it.
- Review state：storyboard r114 / image node r10 are Agent-pass, Owner-pending. The image is review-only and cannot act as first/last frame, video reference or continuity carrier before exact Owner ACCEPT.
- Product fix：a new storyboard candidate now resets the current verdict to candidate while retaining the old review in history, eliminating stale rejection labels. Focused 22/22 and full 326/326 verification pass; build passes. Budget is CNY 54 consumed / 0 reserved; no video call.

final result: visual hard gates pass and the candidate is correctly visible as Owner-pending；downstream execution remains blocked

## P01A r3 exact-media ACCEPT / r50 semantic-reference QA（2026-07-22）

- 精确验收：latest media review `review-8b8431e4-ca73-470c-af2d-e2ef54a7a37b` 与 `media-06bc2416-76d7-4c8a-bbce-5ab35cdb106a`、checksum `a681750d420969cbbfb8c41ee617a94fb6c83036fb12504c1e979e3eaa0319e2`、Shot r46 完全一致。
- 投影一致：Storyboard r115 的 accepted IDs、五域 proof、`storyboard_composition` 与 image node r14 的 accepted/current/review/checksum 一致；旧 r2 REJECT 只留历史。
- 模式正确：P01A r50 的首尾帧都为空。accepted 整镜只控制人物、场景、构图和空间；动态、运镜速度、表演、声音、H1 与剪辑点由时间合同控制。
- 输入分职：六个显式语义绑定加一个 compiler Director binding，共七张、未超过九张上限；不再重复送场景单图和旧 start/end 控制图。
- 免费门禁：`prompt-compilation-cbe15954-2a43-4800-af42-f9cb5cb47145` 为 `stale:false`；technical preflight true、camera/mode/lifecycle true、无 degradation。`ready:false` 仅由真实专业会签和 TeamManifest 阻断。
- 连续性安全：P01B `prompt-compilation-f0c0eb60-f6ed-4f86-bb21-490d07838b26` 保持 0 reference / 0 first frame，v4 REJECT 仍是 continuity source。
- 成本与验证：本节 Provider 0 次、费用 0；预算累计 CNY 54 / 预留 0。源码未变，不重复冒充全量测试；最近已完成基线为 326/326、Architecture 与 Next.js build。

final result: passed；the accepted image is reusable only as a semantic composition reference, with motion and downstream authority still independently gated

## P01A r47/r51 observability + provider-input QA（2026-07-22）

- 专业否决可见且不可冒充 PASS：四份 r50 contribution 的 `vetoFindings` 被新 Core gate 明确排除；current、knowledge-grounded、manifest-bound 三种资格都必须 no-veto。
- 物理可见性：入口背视构图只审核最近尸傀的后脑唯一脸、单一闭合皮肤头颅、身体朝桌和座椅/桌案接触。头部正前方不在镜头内，UI/Prompt 不再显示“同一镜头同时证明前后”；若它意外入画，平滑无眼鼻口规则仍是一票否决。
- 时序一致：Shot r47 与 Unit r51 的 camera transform 在 0 / 1 / 2.4 秒分别为 `(10,1.7,-2.4; yaw 0; pitch -3.76)`、`(10,1.68,-1.8; yaw -1; pitch -4.5)`、`(10,1.65,-1; yaw -5.4; pitch -5.58)`；2.4 / 3.3 / 3.7 / 4 秒状态完全相同。三位主角在 2.4 秒后也不再平移或整体转向。
- 表演可读：背面镜头不使用不可见眼线、正面微表情或口型。战术确认由肩颈、呼吸、重心、靠刀和握枪表达；白璃脚髋胸持续朝大厅 +Z，仅右肩背驱动斗篷，不能读成回身撤退。
- Provider 输入真值：compilation `prompt-compilation-39049321-509d-4de1-b6e7-cdf20e6fa0d6` 输出六个有 checksum 的语义 references；Director `media-0dbc640d-7817-437a-8353-3fda67b2ba5c` 只在 sourceVersions 审计中，实际 Provider refs 不含它。first/last frame 均为空。
- 画布投影：P01A 节点 revision 101 显示 Unit r51、Shot r47、Authority r27、六 references 和真实 governance blockers；`providerCalled:false`。候选 TeamManifest 明示 pending Owner，P01B 继续阻断。
- 回归：focused 18/18；328 个 tests 全过。原子架构检查先发现 use-case 501 行，修正为 499 行后 architecture 和 production build 通过。

final result: technical contracts and visible canvas state pass；Owner Shot、TeamManifest、remaining exact-revision specialist signoffs and paid video authority remain closed

## P01A r50/r53 focus-trajectory + visible gate QA（2026-07-22）

- Optical contract：焦点变化必须有结构化 `focusDistancePlan`；Shot 与 Unit 在 0/1/2.4/3.3/3.7/4 秒分别同步 9.92/9.33/8.56/8.56/3.00/0.25m。终点 0.25m 对应贴镜斗篷 H1，不再错误锁定远处尸傀。
- Motion separation：2.4–4 秒摄影机 position/yaw/pitch/roll/FOV 与三主角位置全部冻结；3.3 秒后只变化焦距面、白璃右肩背和斗篷。UI 不得把拉焦显示成摄影机冲刺、变焦或切镜。
- Reference truth：六张实际 Provider 参考都是语义参考且带 checksum；first/last 为空；两张 Director/editor-only 控制媒体排除。`storyboard_composition` 的旧 Shot r46 proof 不能自动授权 r50，画布必须显示状态载体版本阻断。
- Professional truth：director-story、cinematography、continuity-qa、screenwriter 四项 r53/r50/r7 复审均 PASS 且 `vetoFindings=[]`。它们只消除 current/knowledge signoff 问题；候选 TeamManifest 未批准，因此 Manifest gate 仍可见。
- Visible projection：P01A 节点 revision 104 显示 Unit r53、Shot r50、六点焦距面、四专业 PASS、`providerCalled:false`，并列出 Owner Shot、视觉载体适用性和 TeamManifest 阻断；P01B 保持 blocked。
- Regression：focused 60/60；完整 331/331、Architecture 与 Next.js production build 通过；Skill quick validation 通过。未调用视频 Provider。

final result: passed as a truthful no-spend preflight；the UI and contracts expose the remaining Owner gates without pretending the video is ready

## Sequence-state / canon integration QA（2026-07-22）

- This change adds no new visual surface and makes no screenshot-parity claim. Existing workbench layout, typography, colors and interaction remain unchanged.
- The public Web types now expose `sequenceState`, actual take observation, canon reconciliation and retake disposition so a future visible inspector cannot silently drop Core data.
- Production-mode preflight truthfulness changed: missing sequence state is now an explicit block, not an invisible planning convention. Prompt output contains a state-boundary section generated from the same contract/Core evidence.
- API regression proves exact nested fields survive HTTP/Core/local persistence. The official CLI regression additionally writes the complete sequence contract through `unit create` and reads the same nested values through `unit list`. No direct SQLite write, browser-only state or Provider call was used.
- External MIT Skill OS visuals/runtime were not copied. Only state-control concepts were reimplemented in Ununu's existing visual language and execution boundary; synthetic benchmark claims remain labelled LIMITED.
- Verification is complete: latest focused sequence/Core/API/CLI 28/28 and full 338/338, with architecture and production build passing. No visual QA was fabricated for a change that introduced no visual surface.

final result: no visual regression surface introduced；new production truth is available to Web and enforced below the UI

## Sequence Previs continuous-visual workspace QA（2026-07-23）

- Stage placement：`连续视觉预演` 位于 `故事板与锚点` 和 `提示词与预检` 之间，明确要求先完整观看连续画面，再决定镜头生成；不是隐藏在 Prompt 或单镜表单里的后台字段。
- Player：导演台使用真实项目图片、统一秒表、可拖动时间滑杆和按时长比例显示的镜头段。当前时刻自动选择 active Shot；空帧显示“不能用空白占位冒充连续画面”，不渲染假黑场或错误 storyboard。
- Cut readability：每个 boundary 展示切点、transition type、切镜动机、出/入相位、轴线、运动向量和声音桥；本镜 context 展示 preserve/change/motion/prohibitions 数量、三镜窗口和 reference-role 数量。
- Positive-reference safety：Web starter 只从 `selected=true + pixelReviewed=true` 的故事板图填充 Previs frame。P01B 的未选择/未验收图不会再次被自动带入。Core 仍在服务端复核真实媒体和最新 media ACCEPT。
- Review affordance：若任一镜缺 frame、缺当前 Previs revision 的 context，或 cut 数不等于相邻边界数，按钮显示 `预演尚未完整` 并禁用；即使客户端状态错误，专用 Core review 仍会 fail closed。通用 review 不能绕过。
- Real project state：当前 `sequence-previs-bloodmoon-p01a-p01b-r01` 在 P01A 显示 accepted semantic frame，在 P01B 显示真实缺帧；正确 P01B context 显示 0 个正向 reference role。真实 CLI acceptance test 被 `sequence_previs_frame_required` 拒绝，无 Provider。
- Regression：focused sequence workspace 3/3；完整 test 341/341；Architecture 和 production build 通过；Skill quick validation 通过。

final result: passed as an honest planning and review surface；the UI exposes the missing P01B visual evidence instead of letting an incomplete sequence look production-ready

## Cinematic workflow manifest QA（2026-07-23）

- 新增入口是 CLI/API 合同，不增加 UI-only 状态；manifest 与 AutomationRun 同步持久化。
- 状态查询必须显示 Skill/version、目标时长、当前阶段/task、Provider 是否已调用和下一道 Owner gate，避免“生成中”遮蔽真实阻断。
- production-bound image/video/audio 节点不能显示可直接运行的成功路径；服务端必须返回 `formal_generation_unit_required`，引导 compile/preflight。
- 本次无新增视觉表面，未冒充截图或浏览器 QA；Core/API/持久化回归验证入口与阻断规则。

## P01A 摄影机路径回放补充（2026-07-23）

- 截图中 P01A 缩略图没有摄影机线，根因是旧 Director capture 的 `routeIds` 未包含摄影机路线，而不是 Prompt 没写运镜。
- CLI 已把 `route-camera-p01a-r9` 绑定到四个 P01A camera snapshot；Director Stage revision 188 现在有 0/2.4/4 秒的橙色推进线/箭头，路线在 2.4 秒到位后保持。旧干净媒体仍保留为无标注状态，不伪装成新 capture。
- 已建立独立 `provider_reference_only` 标注派生图卡 `P01A r9 摄影机路径标注参考（线条仅语义，不是首帧）`（node `node-ace2a177-9ede-4af3-b7b9-15d20dd8028c` / media `media-61a4c032-87b0-44bf-a630-f639ec87387d`）；标注图与文字提示词共享 `controlGeometryId`，绑定角色为 `camera_motion_guide`，不进入首帧/尾帧/Authority/连续性载体。
- Shot r53 / Unit r56 compile 的 camera trajectory 和 annotation gate 全部通过；当前唯一 preflight 阻断是 `sequence_state_audit_required`。本轮 Provider 调用 0 次；预算 UI/预算审批不属于电影主工作流，生产路径使用 `provider_account` + preflight 自动派发。全量验证 347/347，Architecture 与 production build 通过。
- 随后通过官方 CLI 将 Unit 更新至 r57 并写入完整 `sequenceState`，将 Shot 的摄影/调度字段和五段时间槽补齐至 r55；Core sequence audit、camera trajectory 和 technical preflight 均为 `ok:true`。当前只剩当前 Shot Owner ACCEPT、视觉状态载体适用性、director-story/cinematography/continuity-qa 最新会签及 Owner-approved TeamManifest，未绕过这些治理门禁。

## P01A r58/r56 current start projection（2026-07-23）

- Shot r56 Owner ACCEPT、Storyboard/Unit proof、三项 current professional PASS（Story r7 / Shot r56 / Unit r58 / Director r188）均已通过 CLI/API 投影；旧 r53/r50 只保留审计，不满足当前门禁。
- Owner 最新“开始”指令已将 `team-a61f0664e7b9e9d0685f` 绑定到 production revision 6。Compilation `prompt-compilation-762186e8-45eb-4dd2-9e30-faf982de42e7` 的 `lint/preflight/ready` 全为 true，`stale=false`，P01A 进入 Provider boundary。
- 没有视频调用；这不是视频 ACCEPT。P01B 继续显示阻断，直到 P01A 真实视频的 H1、像素评审和最新 evaluation 成立。全量源码验证基线仍为 347/347，Architecture 与 Next.js build 已通过。

## P01A 预检状态投影 QA（2026-07-23）

- 修复画布与 Core 预检的状态漂移：官方 `unit preflight` 现在通过 Core policy/use-case 更新执行节点；Web 不再根据旧快照显示“等待/阻断”。
- P01A node r105 的可见真值为 `preflight_ready` / “预检通过”，对应 Unit r58、Shot r56、Story r7 和 compilation `prompt-compilation-762186e8-45eb-4dd2-9e30-faf982de42e7`；没有 blocker，也没有 Provider 调用。
- 这不是成片状态；P01B 仍正确显示阻断。focused 12/12、全量 348/348、Architecture 和 production build 均通过。

## Effective reference manifest QA（2026-07-23）

- 回归夹具：画布显示 4 个资源库卡片，但编译文本出现“参考图5/6/7”。这是 P0 数据可见性/提交一致性缺陷，不是可接受的降级 UI。
- 期望：画布必须显示最终 Provider 清单中的每张图（包括场景构图、导演台空间/机位和语义故事板图），并显示其 role、顺序、锁定状态和可追溯 mediaId；首帧/首尾帧不能与普通参考并列。
- 约束：编译 envelope、canvas payload、PromptDocument 和 Provider request 四者的 mediaId/顺序/占位符必须相同；任何缺失、错序、旧 composition、未知媒体或提示词占位符漂移均在付费调用前 fail closed。
- 现实状态：P01A 候选已生成但尚未完成 dense full-timeline evaluation；禁止把 `succeeded` 当作视觉 ACCEPT，P01B 继续 blocked。

## Skill/runtime context QA

- `workflow cinematic-start` persists `skillContext` with SHA-256 for the
  Skill and mandatory reference files.
- The run persists `agentContext` (`UnunuCinematicAgentContextV1`) with current
  artifact ids/revisions for Story, VisualBible, Authorities, Shots,
  Storyboards, GenerationUnits, Evaluations, and Timelines.
- Every automation advance refreshes the context and its explicit blockers.
- A context index never counts as creative acceptance; missing contracts and
  missing pixel review remain hard gates.

## Prompt Draft / provider-account workflow QA（2026-07-23）

- `CinematicPromptDraftV1` is persisted inside the same compilation envelope as
  the Prompt and exact reference manifest; the UI/API must never display a
  separately reconstructed prompt.
- Canonical cinematic start shows `preflight_then_auto_dispatch` and
  `provider_account`; it does not show a project budget or paid-approval step.
  Legacy budget controls are not part of this production surface.
- Formal generation blocks if Draft text, source revision, provider reference
  order, or preflight state diverges. Unknown Provider outcome remains a
  visible reconciliation state rather than a silent retry.
- The slice introduced no new visual surface. Focused regression 28/28 passed;
  final `npm run verify` passed 354/354, Architecture boundaries passed, and
  the Next.js production build passed. No Provider was called by this slice.

## 2026-07-23 生产链修复 QA 口径

- 画布/节点展示的参考图清单必须与编译 envelope、PromptDocument、Provider payload 的有序 `mediaId` 清单一致；任何“画布没有参考图 5/6/7”的情况都属于提交前 P0 阻断。
- `storyboard_composition` 是语义锚点，不是首帧；必须显示 controls/doesNotControl。只有明确的 `first_frame`/`first_last_frame` 才锁定时间边界。
- 生成单元不得把 Shot 的真实运镜覆盖成“固定机位”，不得把时长强行截成 15 秒；超出模型能力由 capability preflight 阻断并要求分段，而不是篡改合同。
- 一句 brief 不得触发自动虚构剧情、角色、对白、场景或参考图；缺少结构化输入时 UI 应显示具体 blocker。
- 视频成功回执不等于 ACCEPT。QA 必须看到真实最新评审、定义性身份/空间/时序检查及 continuity gate 通过，才能进入时间线。

本轮实现验证：`npm test` 367/367、`npm run build` 通过。未调用 Provider，未通过浏览器写入生产状态。

## 最终收口验证（2026-07-23）

手动 Unit Design 与 canonical workflow 的参考图/首帧/首尾帧互斥和 manifest 校验一致；代码已完成原子拆分。当前基线：`npm test` **367/367**，`npm run build` 通过，`npm run verify:arch` 输出 `Architecture boundaries verified.`。无 Provider 调用、无浏览器写入、无 SQLite 直写。
