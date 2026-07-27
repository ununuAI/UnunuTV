# Momo interaction base + Ununu cinematic core rebuild

task_id: 20260720-momo-cinematic-workbench-rebuild
goal: Replace the legacy UnunuTV workbench with a source-verified Momo interaction shell while preserving and extending the Ununu cinematic production contracts.
done_when: The source-parity ledger is complete; automation control is enforced by Core/API; the Momo-style canvas, player, storyboard and timeline flows are functional; full-auto mode is globally read-only; cinematic production, rendering and recovery paths pass behavior, architecture and visual QA gates.
scope: packages/contracts, packages/core, packages/local-runtime, apps/api, apps/cli, apps/web, tests, docs/evidence and docs/progress. No unapproved paid Provider call, destructive archival, team/cloud feature or plaintext secret handling.
verify: `npm run verify`; loopback API behavior probes; repository CLI persistence/restart probes; in-app Browser interaction and fixed-viewport visual comparison against local Momo/source evidence.
status: complete for the authorized local/product scope; the only unavailable external capability is text/image-to-SPZ generation because no approved 3D World Provider adapter is configured.

## 2026-07-22 Actual-take sequence control integration

- External MIT source `Emily2040/seedance-2.0@57d01dc…` was audited as design evidence, not installed as a competing Skill/runtime. Its synthetic benchmark is explicitly excluded from real-quality claims.
- Production `GenerationUnit` now has a validated `sequenceState`: already happened, this unit only, reserved for later, actual/planned start/end, concrete intent carriers, configurable extension depth and re-anchor policy.
- Sequence-aware reviews persist `takeObservation`, `canonReconciliation` and a verdict-compatible `retakeDisposition` through the existing Core/API/CLI JSON path. The HTTP integration test round-trips exact observed state, rejected canon and REWRITE disposition; the official CLI regression independently round-trips the complete `sequenceState` through `unit create` and `unit list`.
- Core production compilation now requires sequence-state audit. A successor must use the parent unit's latest ACCEPT observation/canon carry-forward; stale/rejected sources, replayed beats, leaked future beats, mismatched start state and over-depth chains block before Provider dispatch.
- Prompt compiler 3.4.0 renders the concrete state boundary and director-intent carriers. The abstract felt-intent label remains planning context and is not sent as a substitute for camera/light/performance/sound instructions.
- Skill and cinematic docs now make this loop mandatory. No project data, Provider call or budget was changed in this integration.
- Verification: Skill quick validation, latest focused sequence/Core/API/CLI regression 28/28, full `npm run verify` 338/338, architecture boundary check and Next.js production build all pass; both 500-line-sensitive core files remain at 499 lines.

## Completion result

- Product baseline `npm run verify` passes **240/240** tests, architecture boundaries and the Next.js production build, including the live P01B authoritative-tail, frame/reference compatibility, canvas Provider-projection and rejected-candidate presentation gates.
- The Web now has one workspace path: `MomoCanvasWorkbench` + `CanvasNodeCard`; there is no legacy/new switch or alternate production workspace.
- The existing film contracts remain the common core: `StoryProductionPacket`, `VisualBible`, `AssetAuthority`, `CinematicShotSpec`, `GenerationUnit`, `ProfessionalContribution`, `CinematicPromptEnvelopeV2` and `CinematicEvaluationRecord`.
- The story chain is durable and deterministic: script breakdown → scenes → beats → shots → one evolving storyboard. Replan/restart reuses stable identities.
- Asset authority supports scoped search, derive, batch creation/approval, version history, restore, impact analysis and compilation through shared Core/API/CLI use cases.
- Storyboard batches support ordered work, retry/cancel/version compare and safe Provider dispatch. Paid dispatch requires explicit owner approval, a matching execution node and budget reservation; asynchronous run identity and unknown outcomes are persisted so a retry cannot pay twice.
- The professional timeline persists track administration, add/move/trim/split/ripple/slip/snap, transitions, effects, markers, keyframes, undo/redo and resource undo/redo. Audio canvas media enters the same durable timeline contract.
- Local media preparation creates FFprobe metadata, thumbnail/proxy files and normalized real waveform data. The shared player and timeline use one playback clock with frame stepping and proxy-aware preview.
- Render/delivery supports H.264, H.265, ProRes 422 HQ, 9:16, 1:1 and 48kHz/24-bit WAV; transitions/effects/keyframes/subtitles/stems, EDL, FCPXML, QC, checksums, delivery manifests and downloads are durable.
- Full-auto uses the canonical 13-stage DAG with control/worker heartbeats, stale-lease recovery, checkpoint restore, idempotent task reuse, task-linked budget reservation/consumption and restart recovery. Image/video/storyboard/sound paid work pauses without approval; the tested sound path submits once, polls once and consumes one reservation.
- Imported SPZ is a real versioned 3D World authority. World → Director binding persists media/checksum/transform, and Agent/user commands share revisioned/idempotent Director Stage use cases for blocking, routes, cameras and captures. A capture binds the exact stage revision before becoming shot/storyboard lineage.
- `影视总控` is now a project-level controller entered only from the left capsule. Legacy `cinematic` records remain available as durable contract bindings but are filtered from canvas presentation and edges, and the add-node menu cannot create another controller card.

## Final browser acceptance

- Isolated QA project: `project-f7d44ad8-361d-4cb3-a7fb-67403549ced7`; no main-project data was mutated and no Provider was called.
- At 1440×900, World is 333×250, Audio is 444×250, and Audio exposes 96 waveform bars and `00:00 / 00:02`. With no verified World Provider, the World generation Prompt is hidden instead of presenting a fake executable surface; imported World authority and Director binding remain available.
- World history cards expand at the source-confirmed positions `(516,0)`, `(0,-266)`, `(516,-266)` and retain the full inner content size.
- The real Gaussian Director stayed pixel-identical across three full-viewport captures spaced 1.15 seconds apart; the former alternating empty/completed Spark frame no longer occurs.
- Audio was added to A1, persisted across service restart, prepared through the current media API and rendered with its timeline waveform. The unified playback clock advanced to 1.15s and paused normally.
- The timeline fixed-viewport overflow defect was fixed: primary playback/edit controls remain hittable while later professional commands remain horizontally scrollable.
- The large-node collapse event no longer bubbles into ReactFlow and immediately reopens the cinematic workspace.
- Detached player computes to z-index 110; the full-auto window remains z-index 104. Automation and `影视总控` now share the exact default frame policy (1180×800 at 1536×900, then identically clamped in smaller viewports), including origin, width and height.
- After the local 4318 process had exited, the service was restarted and `/api/health` returned 200. Repository CLI/Core probes then created and reread one 333×250 World and one 572×408 Director node before deleting both temporary QA records, proving the add failure was process availability rather than a broken node contract.
- A later storyboard-batch 500 was traced to a missing `requireProduction` dependency after use-case extraction. The dependency is now explicit, the Web effect cannot raise an unhandled rejection, the service was restarted, and the real isolated-project batch endpoint returns `200 {"jobs":[]}`.
- Asset cards now use Momo's source-confirmed `application/x-material-asset` drag contract. The canvas converts exact client coordinates through `screenToFlowPosition` and persists a typed node through Core/API; World drops bind `worldMediaId`/authority instead of misreading SPZ as an image. Inline panorama nodes default to node-drag mode and require the explicit `探索` toggle before consuming pointer/wheel input.
- Evidence: `docs/evidence/screenshots/20260720-world-reference-comparison.png`, `20260720-director-reference-comparison.png`, `20260720-professional-timeline-1440x900.png`.

## Safety boundary

The original product-rebuild acceptance used no paid Provider request. The later, separately authorized `《血月客栈》` production now executes real GPT Image requests under the owner's CNY 100 grant, with explicit approval, zero-accounted image cost, durable idempotency and review records. A real text/image-to-SPZ request still cannot be truthfully enabled until an owner approves and configures a verified World Provider. Imported SPZ authority, real rendering and complete Agent/user Director control are already operational.

next: No implementation gate remains inside the authorized local scope. A future real World-generation activation is an external capability/owner-approval event, not a hidden Web fallback; it must reuse the existing Core/API budget and recovery path.

## 《血月客栈》实战流程固化（进行中）

- Momo 交互底座的本地产品重建仍保持完成；当前另有一条真实付费电影工业实战正在项目 `project-696a8a5c-92ea-4356-a52d-b1866b609efc` 中继续，不能把产品底座完成误报为成片已完成。
- `ununu-cinematic-production` Skill 与 `docs/cinematic/06-expert-routing.md` 已固化职责边界：Think/Deep MoA 只在故事事实、付费前计划、首批候选/粗剪和最终交付等 revision 阶段门做外部会审；它不能持久化、批准权威、替换最终 Prompt、调用 Provider、消费预算、剪辑、渲染或发布。
- 会审采纳项必须进入同一 UnunuTV 核心合同，成为关联 revision 的 `ProfessionalContribution`；聊天文字不算生产产物。未采纳且会改变锁定剧情、资产权威或预算的建议不得渗入后续 Prompt。
- 本次《血月客栈》已完成一次 8/8 外部会审，仅使用 DeepSeek 与 MiMo；10 类已筛选专业贡献已通过仓库 CLI/Core 持久化，覆盖导演故事、动作、摄影、表演、剪辑、声音、VFX/物理、资产连续性、预算与 Prompt 编译。
- 当前 9 个 `GenerationUnit` 已完成确定性编译和对白隔离；真实权威图、动作阶段锚点、付费视频、声音、专业时间线、渲染与完整成片验收仍在执行链中，尚未宣称完成。
- `3D导演台` 已为 S01–S14 建立逐镜头 camera/object-state 调度；S05–S14 使用镜头局部 pose/jointAngles 表达踩肩、横斩、越顶雷火、鬼将坠地、撞墙扼颈、扣腕、翻空刺脊、贴脸施术、协同终结与带伤回身。角色完整入画审计 14/14 通过，但调度底图仍只承担空间/动作控制，不冒充最终美术关键帧。
- 导演台连续导出的图片节点不再复用同一坐标。新节点按机位顺序进入三列网格，按展开 Prompt 的 720px 高度计算占位并在创建前做碰撞检测；同一机位重导只更新媒体、保留用户位置。当前 S01–S14 的真实节点已通过 CLI 迁移为互不重叠的 3×N 网格。
- S08 旧图的鬼将漏显来自全局 `visible:false` 抢先覆盖镜头局部 `objectState.visible:true`；渲染、选择与画幅门禁现统一采用镜头局部有效可见性，修正版 capture 已重导。
- 最终关键帧已切换到 `ununu.storyboard.keyframe.v1`：每次只描述一个冻结瞬间，不再把完整动作链、后续镜头、Director 内部记录、节点/媒体 ID 或运行时快照塞进静帧 Prompt；GPT Image 2 的引用在付费前硬限制为最多 5 个。
- `参考图N「权威素材名」 = 本帧语义别名。` 已成为统一映射格式。`PromptDocumentV1` Core 解析器同时支持此格式与旧 `（参考图N）`，因此画布和中型展开窗都显示真实原子富 Token，而不是纯文字装饰。
- S01 关键帧现绑定 4 个互不混淆的正式权威：Director 空间调度底图、血月客栈空间母版、三主角身份合集、由尸傀身份权威裁出的后脑鬼脸解剖特写。Director capture 与解剖特写均拥有独立 asset/version/media lineage，不再因 UI/Provider 去重丢失控制职责。
- 真实 in-app Browser 回放确认节点内 4 个、展开窗内 4 个富 Token，并逐行保留 `= S01空间调度 / 血月客栈 / 白璃、顾沉、洛青 / 后脑鬼脸解剖` 别名。
- KF01 前两版因把异常规则画成普通转头被正式拒绝；第三版 `media-742ccf1a-52ca-4068-a06c-d5a39e86293b` 曾由早期 `review-33caf1ea-1291-4dbb-bda3-ca1ab0f271ed` 接受并写入画布。后续 Owner 定义与真实像素复核确认它仍让多名酒客以普通正脸/头肩转向入口，最新 `review-04db9509-5eee-465a-a18c-4ead0c808ed4` 已覆盖为 REJECT，accepted 字段已清空；本句只保留历史审计，不代表当前结论。
- KF02 初版因桌区被清空拒绝；v6 因三主角身份错误拒绝；v7 因屏幕攻击轴反向撤销接受，并隔离基于 v7 的首次 ¥8 视频候选。v8 修正轴线、三主角身份和家具，但三符/火轨从画面底边凭空出现，与白璃右手出手点断开，以 `review-7b58e8a9-e2c0-4fad-9e3e-cd35c4c957fd` 拒绝；同时它把上一帧已揭示的尸傀群又画成普通活人酒客。v10 恢复身份、家具和三符数量，但三张符被错误分散到整片地面；已拒绝。v11 两次在约 96/101 秒收到 Gate HTTP 502，v12 局部编辑在约 193 秒收到截断 JSON；在结果核对前不再提交付费图像或视频。
- UnunuTV 已恢复旧 `ununu-web` 的长耗时图片合同：配置不得低于 5 分钟，默认等待 30 分钟。连接中断、HTTP 5xx 和 2xx 截断 JSON 均持久化为 `paid_submission_outcome_unknown` 并保留稳定 `x-request-id`，禁止自动重发；v12 的旧请求号按实际 batch item 幂等键和 `attempt:1` 还原为 `515372988895616`。取消中的 Provider 晚到结果也只进入审计隔离，不会重新绑定故事板镜头。
- 外部 CLI/API 运行现在每 2.5 秒与画布活动状态对账：真实 run 终态会撤掉“处理中”并刷新媒体，局部提交前状态不会被误删；同步图像提交在尚无异步 task id 的 `queued` 阶段也不会被观察者轮询误判失败。最新完整 `npm run verify` 240/240、架构边界和 Next.js 生产构建通过；4318 重启后 Browser 刷新测得全页“处理中”数量为 0，KF02 为“待处理”。
- KF02 v13 在约 98 秒完成并恢复三主角、尸傀异常解剖、桌椅/柜台/楼梯与三符数量，但三符位于白璃手后方，因此以 `review-ee7d2f0a-6a0b-43ed-a74a-59785e92d07d` 拒绝。v14 在约 189 秒完成，三张实体符纸从白璃右手指尖前方沿中轴射向敌群、短尾回指发起手，场景与身份连续性通过；媒体 `media-b20660b5-c3e3-480b-ad38-eacb58d6c465` 以 `review-c4b43b88-98fe-4855-80b7-8ee28298f58d` 接受。该 189 秒成功回写也实证 100 秒回归已解除。
- P01 已重新编译为严格局部的双镜头 8 秒单元：0–4 秒入店/脑后鬼脸揭示，4–8 秒白璃发令/三符开路。Core 为每张 Director capture 生成唯一的机位 Prompt alias，VisualBible 只保留项目级摄影语法，断枪、撞墙、折腕、鬼将与五雷等未来动作不再进入开场正向描述。两张已接受关键帧、两张逐镜 Director capture 和五张权威参考共 9 图，Seedance Mini 480p/原生音频预检 `ready:true`。
- 首个修正版 P01 已在 owner 的既有 CNY 100 授权内真实提交：run `run-1e6e8824-d82b-4b71-af99-8476e8958135`、Ark task `cgt-20260721151617-t4gwn`。返回媒体 `media-22ed6099-b8d3-4bcd-8829-193fad7ece32` 经全时段稠密抽帧确认：0–4.1 秒入店、轴线、酒客包围和后脑鬼脸揭示可用；4.2 秒后白璃三符动作把三张符压成两张，整条 8 秒候选正式拒绝。
- P01 已按失效边界拆为 P01A/P01B。P01A 只通过 UnunuTV 专业时间线截取原媒体 0–4.1 秒并重新渲染；首次渲染暴露“视频轨内嵌音频被丢弃”缺口，Render Graph/FFmpeg adapter 现会探测、混合和保留视频 clip 的内嵌音轨。第二次输出 `media-20de8005-c758-477a-b478-7efeb7a5bafa` 为 4.125 秒、864×496、24fps、H.264 + AAC 48kHz 双声道，技术 QC 全通过并以 `cinematic-evaluation-bloodmoon-p01a-salvage-accept-v1` 接受；画布 P01A 实际绑定该有声版本。
- 生产计划脚本不再在重放时清除一个未隔离的 `currentMediaId`；只清除 rejected/quarantined 当前媒体。in-app Browser 刷新后第一个可见 video 的 src 为 `media-20de8005-c758-477a-b478-7efeb7a5bafa`，P01A/P01B 节点互不重叠，预算显示 CNY 82。
- P01B 首次尝试暴露真实 Ark 能力边界：Seedance 拒绝把 first/last-frame content 与普通 reference media content 混在同一请求。run `run-2d1a5ebe-82f5-41cd-ae43-c90a57f56226` 在 Provider 参数校验阶段 blocked，CNY 3 预留全额释放。Core capability preflight 与 Ark adapter 现都在付费提交前拦截该组合，模型能力注册版本更新为 `2026-07-21`。
- P01B 的第二个 `image_reference` 候选 run `run-705e2d63-f17e-414c-a3a8-50cbaeaee525` / media `media-267cde67-f456-4298-bda7-dd33662ef5b3` 已正式拒绝：它没有承接 P01A 入口侧尾态，主体跳到大厅中央附近重新起步，同时三张火符和三条火轨都压成两条。新 evaluation `cinematic-evaluation-bloodmoon-p01b-spatial-handoff-reject-v2` 将两个失败一起持久化，零可用区间；不能再把“屏幕方向大致正确”误当空间连续通过。
- P01A ACCEPT 媒体现在通过 Core 在 3.9 秒抽出持久尾帧 `media-a2814e19-44c6-4299-96cf-1ad41102104e`。P01B 已改为 `continuous_segment + PREVIOUS_ACCEPTED_TAIL + first_frame`；绑定包含 ACCEPT evaluation、源媒体 ID/checksum、抽帧秒数和空间/主体/屏幕方向签核。Core 会核对同一 ACCEPT 记录，不接受 Web 自报。
- 编译层新增模型感知的 Provider 引用筛选：Ark first-frame 模式只发送权威尾帧，Director/Storyboard/资产参考继续保留在 `sourceVersions` 供镜头设计和审计，但不再混进 Provider payload。最新 compilation `prompt-compilation-172a9805-a22b-4fa9-a123-dffe4189f121` 为 1 张尾帧、普通 referenceMediaIds 为空、lint/preflight `ready:true`；画布 Prompt v10 已同步去掉冗余“本生成单元目标”。本轮没有再次付费，预算保持 CNY 79。
- Browser 回放随后发现 Web 仍把第一条普通资产连线“白璃火符”显示成首帧，并会在直接运行时把所有工作流连线重新拼入请求。现在 Web 与 `generationRunPayload` 都按模式投影实际 Provider 输入：`first_frame` 只认 Core 指定的 `firstFrameMediaId`；Director/资产连线继续显示但标记“未使用”。画布实测第 1 项为 `P01A入口尾帧 / 首帧 / 核`，其余 6 项为未使用，生成按钮仅对应 1 个真实首帧输入；没有点击或产生新付费调用。
- 被拒绝的旧 P01B 媒体继续留在画布供逐帧审计，但不再伪装成可用主片：视频左上角显示暖红 `候选已拒绝` 与真实拒绝原因；它不会进入正式时间线，也不改变新 P01B 的 first-frame preflight。
- Momo 的整个编排已按源码拆成 Agent 决策控制面、确定性节点 DAG、图片/视频批处理、富引用编译与故事板入时间线五层；`/Users/zhangxiaohao/Ununu/external/` 的 13 个候选仓库也已逐项审计。结论与源码证据固化在 `docs/evidence/momo-and-external-cinematic-orchestration-audit-20260721.md`，并明确哪些能力应吸收、哪些只是 Prompt/README 或假导出。

## 2026-07-21 P01A Owner veto 与无付费重建进度（覆盖旧 ACCEPT/ready 结论）

- Owner 对 P01A 像素明确否决：后脑唯一完整人脸被做成外露骷髅，其他酒客出现普通正脸回望入口。最新 evaluation `cinematic-evaluation-bloodmoon-p01a-owner-veto-reject-v4` 覆盖旧 ACCEPT；P01B continuity source 已指向该 REJECT，首帧和 references 清空。
- 新硬门禁已进入 contracts/Core/API：`reviewRequirements + visibleEntityChecks` 逐项校验；高总分不能覆盖定义性身份/解剖失败；任何 `vetoFindings` 禁止 ACCEPT；同一 GenerationUnit 只认最新 evaluation。HTTP 集成测试证明非法高分 ACCEPT 返回 409，而带失败证据的 REJECT 可持久化。
- 尸傀 authority 与 KF01 已重新做真实像素核验。旧 authority 多视角与旧 KF01 均违反前方无脸/后脑唯一脸，已用 CLI 降级或拒绝并从引用链移除。随后生成的 r7 单体解剖 identity master 也因两张侧视恢复普通前脸并生成空白后脑鼓包而被拒绝；Authority 当前 revision 8 / `rejected`，不得扩展群体板或战斗板。
- P01A shot revision 38 已清除“普通前脸仍在”“前排收紧半步”和颈骨转动声；酒客身体、头颅正前方、双手、桌案、座椅全程保持原朝向和接触，只有后脑唯一人脸睁眼凝视入口。
- Director Stage revision 159 新增四桌八座并锁八名酒客坐姿，capture `media-fa00b807-15bb-45fd-aba3-8e75866e53b1` 只作为空间/机位底图。Storyboard revision 107 只保留该新 control reference，旧 KF01 作为 rejected audit；本地关键帧 compilation `image-prompt-compilation-f96a8646-7f52-4a8f-b2db-6525f846bf7a` lint 通过但不触发生成。
- P01A unit revision 38 为 `FIRST_FRAME`，首帧/尾帧/普通 reference 全为空；preflight 以未验收 authority、缺 accepted KF 和缺 first frame 三项阻断。P01B compilation 明确报 v4 `continuity_source_not_accepted` 并保持阻断。
- 没有新的付费 Provider 调用。focused 门禁 tests 16/16；最终 `npm run verify` 258/258、架构边界和 Next.js build 全部通过。下一次付费只能在 Owner 新批准后，且顺序必须是尸傀单体 identity master 像素验收 → 新 KF01 像素验收 → P01A preflight 通过 → 才可生成视频；P01B 仍需等待新的 P01A ACCEPT 尾态。

## 2026-07-21 用户电影知识逐镜落地门禁

- 重新审计用户目录后确认不是“缺技巧”：统一知识库已把 221 条来源记录、16,242 条观察精炼成 452 条知识原子，覆盖运镜、轴线、动作连续、身份/场景一致、动作相位、coverage 与剪辑语法。缺陷是旧 Core 只看 production 内是否存在某个 role，没验证贡献是否覆盖当前镜头/生成单元 revision，也没区分正式 `cap/kn` 与普通文档路径。
- 新增原子政策 `cinematic-professional-signoff-policy.mjs`：production 级或旧 revision 贡献不能满足当前会签；GenerationUnit 会签必须携带本单元和全部 Shot revision；正式知识贡献至少引用一个 `cap-*` 和一个 `kn-*`；TeamManifest 必须匹配。
- production 模式、声明 `requiredProfessionalRoles` 的单元自动启用四项门禁，不依赖手工记忆：TeamManifest、current target、knowledge grounded、manifest bound。production/TeamManifest/贡献变化均进入 compilation sourceVersions/staleness。
- `ununu-cinematic-production` Skill、`03-shot-contract.md`、`06-expert-routing.md` 与新增 `09-knowledge-to-shot-execution.md` 已同步，明确把运镜、空间、身份/场景、打斗和剪辑知识转成可执行字段和像素/全时间线验收。
- 真实 P01A 已用 CLI 生成 compiler 2.7.0 compilation `prompt-compilation-531072fb-33ee-4e8e-babc-92aa5358a334`，现在会把旧 production 级意见、doc-only refs、空 TeamManifest 和旧 story signoff 全部列为 blocking。没有伪造专业 Agent 签核，也没有调用付费 Provider。
- focused 31/31；完整 `npm run verify` 263/263、架构门禁与 Next.js build 通过。

## 2026-07-21 文字→图→视频→剪辑与重叠交接门禁

- 用户纠正了能力定位：续接和 H0/H1 重叠交接已经实测，缺陷是它们没有进入当前 I2V 主生产合同。本轮沿用现有 dirty state，把能力正式接到 GenerationUnit、Core evidence、Prompt compiler、staleness、Schema、Web 类型和 API；没有从头重做。
- 新视觉状态载体门禁要求最新 media ACCEPT、当前 Shot revision、精确 checksum、逐像素审阅和 `character_identity / scene_topology / spatial_blocking / camera_composition / continuity_state` 五域。后写 REJECT 会使旧 compilation stale。
- `TAIL_CONTINUE` 与 `DUPLICATE_HANDOFF` 互斥。重叠方案必须证明 H0/H1 是同一条最新 ACCEPT 视频的不同帧，下一段复演 H0→H1 后继续新内容，剪辑删除重复区；不存在固定通用切点秒数。
- 交接计划新增摄影机方向与速度、焦段/焦点/曝光、动作相位、seam opportunity、声音桥、cut/trim plan 和站位/道具/光线/动作相位/银幕方向五项守恒。Prompt compiler 升到 2.8.0 并输出 `【续镜交接】`。
- Skill 与 `04-generation-unit-and-anchors.md`、`05-prompt-compilation.md`、新增 `10-text-image-video-edit-pipeline.md` 已同步。统一知识中的 `cap-overlap-handoff`、`cap-multi-video-overlap-handoff-rule` 和三个 `kn-*` 被明确引用；正向实测成立但能力保持 `LIMITED`。
- 真实 P01B 通过 CLI 更新到 revision 11：只在新版 P01A H1 真实形成白璃斗篷/门框全遮挡时，允许 `foreground_wipe` 隐藏后方机位到白璃前侧 30° 的重置。没有伪造 H1，reference 仍为空，Owner v4 REJECT 仍是 continuity source，compilation `prompt-compilation-385ef5bb-abe1-43e9-9648-f02c12b15983` 保持 blocked。
- P01A Shot/GenerationUnit 已通过 CLI 更新到 revision 39：先把后脑唯一完整人脸与头部正前方无脸皮肤清楚展示并保持至少 0.8 秒，随后白璃月白斗篷从左下向右上形成真实全画幅擦镜 H1；第 7 条 review requirement 拒绝提前遮挡、隐藏切镜、烟雾/闪光替代和覆盖不完整。
- P01A r39 compilation `prompt-compilation-a58c0bbf-8e56-496e-b152-e07ad350ab64` 已编入该真实接缝，并以 `accepted_keyframe_required`、`visual_state_carrier_required`、权威/首帧和专业会签门禁继续阻断。两单元均 `ready:false / stale:false`，没有新的付费 Provider 调用。
- 真实像素复核确认旧尸傀母版的侧视把正常脸放在身体朝向侧并制造空白后脑鼓包，旧 KF01 又让多名酒客以普通正脸/头肩转向入口。已分别追加媒体 REJECT：`review-dc239fad-a0e1-4b35-b073-5ba8cd87444c`、`review-9393c32c-e014-4501-87b0-a5c53a02f20e`、`review-04db9509-5eee-465a-a18c-4ead0c808ed4`；最后一条覆盖旧 KF01 的两个 ACCEPT。
- 派生解剖资产以 `asset-version-ec626357-55fe-4965-9d69-679818f0caff` 降为 `rejected_pixel_review / audit_only`，禁止进入 authority、visual-state carrier、Provider reference 或 first frame。KF01 同步到 StoryboardShot revision 108 / Shot revision 39，保持 `acceptedMediaId=null`、`acceptedReviewId=null`、`needs_regeneration`。
- focused 59/59；完整 `npm run verify` 273/273、架构门禁与 Next.js build 通过。两个主文件均 499 行，保持 500 行上限。

## 2026-07-21 r7 身份母版、overview loading 与约束释放分析

- Owner 的“开始”只授权一次 r7 单体身份母版。CLI 调用 run `run-1465e751-76fe-4708-b305-35751da37b0c` 成功生成 media `media-a001356f-f97b-4813-afae-9968f32e0532`；没有重试、没有 KF01、没有 P01A/P01B 视频调用。
- 初次技术预审只因正视无脸、背视后脑有脸而把 r7 保留为 `candidate`，这是被后续原始分辨率逐格复核纠正的历史结论。两张侧视实际都把正常眼鼻口放在身体朝向的头部正前方，并在后脑形成空白鼓包/第二头块；最新 review `review-df5a8378-513d-4477-9494-0e0b88e01ba5` 为 REJECT。
- 外部 CLI 运行态本可刷新，但 20% overview 下原资产 loading 只在缩略图内部，视觉上约 6px。现在运行节点有外圈脉冲、标题“生成中”和内部消息；真实节点用 CLI 短暂模拟 running 后 Browser DOM 三层状态全部可见，随后完整恢复成功媒体。
- authority 完成态仍会让新媒体先进入独立 `candidate` 并保留旧 `rejectedMediaIds`；本次 r7 在后续像素复核后已同步为节点 revision 24 / `authority_candidate_rejected`，当前媒体也加入 `rejectedMediaIds`。这证明候选隔离和后写 REJECT 可以连续生效。
- 用户“文生满血/图生阉割、改变角度/景别让模型逃逸”的参考被降噪为约束预算与模型特定 release hypothesis。P01A 在怪物解剖清楚证明前禁止释放身份/拓扑/站位约束；需要换机位时只使用真实斗篷全遮挡接缝。Skill 与 `10-text-image-video-edit-pipeline.md` 已同步四组 A/B 和全时间线验收要求。
- 验证：focused 8/8；最终 `npm run verify` 273/273、架构边界和 Next.js production build 全部通过。当前预算 CNY 100 / 已消费 23 / 预留 0。P01A/P01B preflight 均继续 `ready:false / stale:false`，仍被未验收尸傀 authority、缺 accepted keyframe/first frame、当前专业会签等门禁阻断。
- r7 复核后的正式状态：Authority r8=`rejected`；资产当前版本 `asset-version-9a3c19ac-5965-4a2c-b399-4628b29b949d` 为 `rejected_pixel_review / audit_only`，禁止 authority、state carrier、Provider reference 与 first frame。P01A/P01B 最新 compilation 分别为 `prompt-compilation-e459dfc0-4f84-4cc8-a47e-062a7af3f3c7`、`prompt-compilation-21b21b2b-aaba-4c7b-8ee7-148f5f532124`，均 `ready:false / stale:false`；P01B 继续由 Owner v4 REJECT 阻断。没有新付费调用。
- 真实 UI 回放补齐 Authority 拒绝显示：尸傀资产卡现在显示“候选已拒绝”和两张侧视失败的完整原因；历史板件预览不继承当前候选 verdict。最终 `npm run verify` 283/283、架构边界与 Next.js production build 通过。

## 2026-07-21 图文混合语义与动态合同进入生产主路径

- 用户明确指出参考图不是整张真相：正确人物/构图/站位要保留，现代桌要由文字替换成古代桌，被遮挡区域要补全更多尸体；同时图片只有静态 `S(t0)`，不包含人物/摄影机轨迹、速度、动作相位、受力或结束状态。
- 新增原子政策 `cinematic-generation-control-policy.mjs`。`GenerationUnit.controlIntent` 分开片内时间、外部身份、跨镜连续和空间站位四个目标，并记录模式理由、运动复杂度、运镜自由度、守恒/允许变化、动态合同与 constraint release。
- `ReferenceBinding.semanticControl` 逐图声明 `preserve / replace / complete / ignore / styleOnly / temporalRole`。compiler 2.9.1 把它们和独立动态合同写入最终 Prompt；真实首帧若又要求替换可见像素会被判为合同冲突。首帧只拥有 `t0_boundary_only`，`t0+1` 起必须由动态合同继续演化；续接首帧必须标记为 `continuity_state`。
- production preflight 自动要求控制意图；带图模式要求参考图语义职责。高复杂运动 + 大幅运镜 + 硬帧无 release、纯 T2V 承诺外部/跨镜像素一致、静态图缺少动态合同都会阻断。
- Owner 明确把图生视频定位为基础视觉状态载体，把逐镜精准 Prompt 定位为动态导演合同。Skill 已要求每镜写清主体与 screen zone、身体/脸/视线方向、接触/道具、动作相位、时间/速度、摄影机起点/路径/启停、焦段/焦点/曝光、动作源/VFX 轨迹、物理受力、守恒/禁止变化、结束状态和下一镜交接；“细”指可见、因果、无矛盾，而不是形容词堆叠或整部故事泄漏。
- Web 生成单元/锚点/Prompt 区新增模式、首要一致性目标、运动复杂度、运镜自由度、模式理由、动态来源及每图五类语义职责数量；表单中文标签和模式文案同步区分语义参考与真实首帧。
- 真实 P01A 通过 CLI 更新为 r41，选择空间站位优先、有限运镜、中等运动；P01B 更新为 r12，选择跨镜连续优先、有限运镜、中等运动。r7 身份母版像素否决后两者 compiler 2.9.1 最新 compilation 分别为 `prompt-compilation-e459dfc0-4f84-4cc8-a47e-062a7af3f3c7` 与 `prompt-compilation-21b21b2b-aaba-4c7b-8ee7-148f5f532124`，mode-control audit 均通过，但总体仍 `ready:false / stale:false`：P01A 缺 accepted authority/KF/first frame；P01B 还被 Owner v4 REJECT、无 H1 和连续性证据阻断。没有新 Provider 调用。
- 原 focused 47/47、新增首帧边界 focused 34/34 与资产拒绝显示 focused 6/6 均通过；最终完整 `npm run verify` 283/283，架构边界检查与 Next.js production build 均通过。

## 2026-07-21 Prompt 覆盖与精确环绕轨迹

- 真实尸傀 r9 失败证明：Prompt 中已写的方向/材质规则成功，遗漏的单头包络、颈部连接、后脑脸嵌入深度和耳部归属被模型自由补全成错误拓扑。逐域覆盖与 counterexample closure 现已进入图片/视频正式 preflight。
- 新增原子相机轨迹政策，不扩张 499 行主 use case。推拉/跟移/升降/摇臂用路径曲线，摇镜/俯仰用视轴弧，变焦/拉焦用镜头曲线，手持用振幅包络，复合运镜绑定组合控制；环绕只是其中带轴心/半径/弧度的特例。
- Director 控制图形、箭头和标签只能留在编辑控制层；Prompt 编译输出相机状态演化语义，不输出内部 ID，干净构图帧不得携带控制标记。
- P01A r42、P01B r13 已完成 20 域 Prompt 覆盖，compiler 3.2.0 的 coverage audit 均通过；两者因真实推进/下摇/跟随尚无结构化控制几何与干净首中尾 capture，被新的 `structured_camera_trajectory_required` 正确阻断。未调用 Provider。
- 本增量没有新增 Provider 调用；聚焦测试 49/49，完整 `npm run verify` 296/296、架构边界与 Next.js production build 通过。

## 2026-07-21 分镜参考角色与可标注图参考纠偏

- Owner 指出真实失败根因：故事板图常用于人物、场景、空间和局部定位，却被产品自动当成当前首帧/剧情状态，导致上一视频尾帧无法丝滑承接。Core 中已找到并移除“任意 selected story frame → `firstFrameMediaId`”的自动提升。
- `storyboard_composition` 和 `storyboard_action_phase` 现在分别导出 `static_state` 与 `action_phase` 语义，只进入 `image_reference`；`storyboard_first_frame` 才映射 `initial_state`，且缺当前五域像素验收证明时无法保存或派发。
- 普通图参考、首帧和首尾帧是互斥 Provider 形态。局部镜头可用完整空间母版建立区域坐标；若首帧模式禁止附加母版，则采用桥接关键帧、真实遮挡/重叠交接或剪辑，不伪造同时输入。
- 运镜标注规则从“一律 editor_only”修正为模式感知：`provider_reference_only` 可把圈选、路径线和箭头作为独立派生图送入 `image_reference`，但图与 Prompt 必须共享几何 ID、标注 ID、含义和时间窗。带标注图不得作为首/尾帧、Authority 或干净状态载体。
- 所有操作仅为合同、Core、UI 文案、测试和文档更新，没有调用任何 Provider；该阶段完整 `npm run verify` 296/296、架构边界与 Next.js production build 通过。

## 2026-07-21 故事板可选化与逐帧时空运动合同

- Owner 指出静态故事板与文字时段都不能让系统真正理解“两帧连起来怎样运动”。生产路径现明确分工：Authority/语义参考图管身份、场景和空间事实；故事板按复杂构图/调度/局部定位/VFX/切镜风险选用；动态预演（animatic/Director previs）与 `temporalMotionPlan` 管时间、速度、接触和相邻帧演化。
- 新增 233 行原子政策 `cinematic-temporal-motion-policy.mjs`，不扩张两个 499 行主文件。计划要求统一 fps/总时长、无间隙/重叠且因果有序的阶段、每个运动主体/道具/摄影机/环境元素从 t0 到端点的状态轨，以及每对相邻状态的路径、插值、速度曲线、动作相位、接触变化和必经中间态。
- 生成后验收不再只抽若干关键帧；`evaluationPolicy` 必须逐相邻帧检查位置/朝向差分、速度/加速度连续、接触、动作相位和银幕方向。编译器 3.3.0 将结构化运动计划写入 `【逐帧时空运动】` 并纳入 payload hash。
- P01A 通过官方 CLI 更新到 r44：`image_reference + NONE`，不再要求故事板/关键帧成为首帧；当前唯一 Provider reference 是 Director capture `media-fa00b807-15bb-45fd-aba3-8e75866e53b1`，只保留站位、前后层级、机位、轴线与构图，忽略代理造型/最终风格/灯光/表演。compilation `prompt-compilation-5f27e5e4-8bbb-475e-b7c4-a88dfe2b2e1a` 为 `ready:false / stale:false`，正确阻断于未验收资产、当前专业会签、结构化相机轨迹和 `temporal_motion_plan_required`。
- P01B 通过 CLI 更新到 r14，仍为 `PREVIOUS_ACCEPTED_TAIL + first_frame`。compilation `prompt-compilation-8b460aa7-586c-4c08-862d-c964245a6f0d` 没有首帧/reference，继续由 Owner v4 REJECT、H1/连续性交接、结构化相机轨迹和逐帧运动计划阻断；未削弱任何续接门禁。
- focused API/Prompt/temporal tests 39/39；最终完整 `npm run verify` 300/300，架构边界与 Next.js production build 全部通过。没有调用 Provider、没有产生新费用。

## 2026-07-21 Director World latest-review 闭环

- Owner 发现旧红色客栈全景仍在导演台，定位为环境绑定与生成候选审片彼此脱节。通过正式 CLI 将 `media-03908f19-b2a9-40e4-ac76-794197fa38e3` 最新审片改为 REJECT、场景 Authority 降为 r7 rejected，并以可审计 `clear_environment` 命令把 Director 推进到 v161。
- P01A/P01B 的旧 capture 顶层和嵌套引用已撤下，Shot 为 r41/r36；重新编译后 `directorStageReferences=[]`、`ready:false`。历史媒体、capture、机位、路线与29个对象都保留为审计/重建输入，没有删除。
- 新独立 policy 要求世界主体媒体和预览媒体各自 latest ACCEPT，覆盖 `bind-world` 与直接 `set_environment` 两条入口；后写 REJECT 阻止重新绑定。focused 9/9、完整 302/302、architecture/build 通过；画布已刷新验证错误全景消失，无付费调用。

## 2026-07-21 剧情与分镜脚本 Owner revision 硬门禁

- 修复旧生产顺序：不再先做 Authority/故事板/关键帧再回头发现剧情错误。正式顺序固定为 Story 当前 revision 审查并接受 → VisualBible/完整 Shot 脚本 → 每个 Shot 当前 revision 审查并接受 → GenerationUnit/视觉生产。
- 新增公共 target contract 与 Core 原子 policy；production GenerationUnit 自动启用 `requireOwnerStoryReview/requireOwnerShotReviews`，review lineage 写入 sourceVersions。revision bump 使旧接受无效；同 target 后写 REJECT 覆盖旧 ACCEPT，并使 compilation stale。
- gate 同步接入 AssetAuthority 付费图片与 Storyboard 付费图片/视频入口，均在 budget reserve/Provider submit 前执行；focused 与 API/automation/Authority/Storyboard 回归补齐。完整 `npm run verify` 310/310、架构边界、Next.js build 和 Skill quick validation 均通过；三个 use-case 保持 499/494/469 行。
- 真实 P01A/P01B 通过官方 CLI 重编译为 `prompt-compilation-6616f8d0-132b-420f-9d80-b667e9779ca3` / `prompt-compilation-fd3ab818-e7d6-4f47-9407-743da3108ba9`，均因 Story r2 与各自 Shot 当前 revision 无 Owner ACCEPT 保持 blocked；P01B 的 v4 REJECT 连续性阻断未削弱，无 Provider 调用。
- 现场剧情审计已经定位上游 P0：Story r2 的“酒客统一转向入口主角”仍与身体朝桌、头部正前方无脸、后脑唯一完整脸朝入口的真实规则冲突，因此未写 ACCEPT。待先修 Story，再逐镜审 14 镜。

## 2026-07-21 剧情 r3、14 镜因果表演与 P01B 续接修订

- Story 已通过官方 CLI 升为 r3 草案：纠正酒客身体/头部正前方保持朝桌、头前平滑无脸、唯一完整脸嵌在后脑枕骨；P01A 先完成至少 0.8 秒解剖证明，斗篷遮幅后 P01B 才允许尸傀从原桌席起身。同步修复无铺垫上方符、顾沉刺脊后刀的去向，以及局部木板而非整景血肉换材质。
- 逐镜审计不再复用“日式动画电影式克制表演”套话。14 个当前 Shot 都写入独有 `initialState / trigger / temporalBeats / turningPoint / endState / forbiddenActing`，每镜 4–6 个连续节拍，包含角色内在判断和可见证据。动作、疼痛、互救、对白、眼线、呼吸、接触与恢复均按秒有序。
- P01B Shot 最终为 r39/5秒：0–0.4 秒斗篷离幅；0.4–1.5 秒原桌席证明与尸傀可见起身；1.5–2.2 秒白璃观察并完整说“杀出去”；2.2–3.1 秒三符从右手起势离手；3.1–4.3 秒命中与前排倒地；4.3–5 秒顾沉启动。Shot `internalTimeSlots`、performance、Unit dynamicControl 和 promptCoverage 已统一，旧 `generation_time_plan_mismatch` 消失。
- P01B GenerationUnit r15 保持 `PREVIOUS_ACCEPTED_TAIL`、无 first frame、无 reference，时长改为5秒；reviewRequirements 从4项增到8项，新增H1后第一状态守恒、原席可见起身、对白完成后才出符、通道形成后顾沉才启动。continuitySource 仍指向 P01A Owner v4 REJECT，故不能误启动。
- 新 `cinematic-performance-timeline-policy.mjs` 将表演结构变为可机检合同；新 revision review use-case 在 Owner ACCEPT 写入前校验 current revision 和完整时间轴，返回 `shot_performance_contract_required`。现有视觉生产 gate 也复核该合同。Prompt renderer 会输出每段全局秒数、人物内在与可见证据。
- 当前编译：P01A `prompt-compilation-97ec4082-8e83-4393-a50b-7ef8e83cdc03` 记录 Story r3/Shot r42；P01B `prompt-compilation-061f77e5-9ed2-4330-9cba-3ba9d9689e5f` 记录 Story r3/Shot r39。两者 Story/Shot review 都为 null；P01B 继续缺真实 H1，并被 v4 REJECT、Authority/Director、相机轨迹与逐帧运动计划阻断。没有 Provider 调用。
- 验证：focused 30/30；完整 `npm run verify` 315/315，architecture boundaries、Next.js production build 与 Skill quick validation 通过。`application.mjs` 490 行、主 production use-case 499 行。

下一步仍不是生成：先由 Owner 审 Story r3，再逐镜审 14 Shot 当前 revision。获得明确 ACCEPT 后，才重建场景/尸傀资产、P01A 关键帧/导演台、结构化相机与逐帧运动 preflight；付费调用仍需新的明确批准。

## 2026-07-21 主动剿灭动机与 P01B 纵深方向修订

- Owner 纠正三人行动动机：他们从前门主动进入就是为了消灭客栈怪物，因此不存在“遇敌后从前门撤退”的目标；白璃“杀出去”表示沿客栈中轴向深处杀穿。
- 官方 CLI 已把 Story 升为 r4：删除“封闭退路”补丁，更新三人目标、因果链、对白意图、入口状态与 P0 审查问题，未写 Owner ACCEPT。
- P01B Shot 升为 r40：完整六段时间轴、blocking、cinematography、edit continuity、forbidden acting 与 acceptance criteria 都要求入口→中央→后出口纵深主动推进，禁止回身朝前门或面胸朝入口侧摄影机奔跑。
- P01B GenerationUnit 升为 r16，增加第 9 项 blocking review requirement `p01b-extermination-direction`，同步更新续接 H1 后新内容、controlIntent、Prompt 覆盖和反例逃逸路径。
- 重新编译后 P01A 为 `prompt-compilation-f161aacd-c2b6-4d1f-b8f8-47ba302d0e88`（Story r4/Shot r42/Unit r44），P01B 为 `prompt-compilation-5a14bac8-517e-4aa9-b253-ce9d608732fa`（Story r4/Shot r40/Unit r16）。两者 `ready:false`；P01B 仍引用 `cinematic-evaluation-bloodmoon-p01a-owner-veto-reject-v4`，first frame=null、references=[]、`generation_time_plan_mismatch=false`，没有 Provider 调用。
- `ununu-cinematic-production` Skill 已固化“先判定运动动机、再设计站位/摄影方向；任务已解释推进时不得虚构封门；命令必须绑定命名轴、目标和向量”的可复用规则。
- 验证：Skill quick validation 通过；完整 `npm run verify` 315/315、architecture boundaries 与 Next.js production build 通过。

下一步仍是 Owner 审查 Story r4，而不是生成；通过后再按完整顺序审当前 Shot revisions。付费视觉重建继续需要新的明确批准。

## 2026-07-22 Story r5 肢体占用与道具归属审计

- Story r4 的大方向、动机、怪物解剖、五句锁定对白和 14 段因果链均成立，但审计发现新的 P0 物理矛盾：顾沉被锁定为双手持续持刀，后续终结配合却写成“抓住鬼将脚踝”；当前 Shot 13 还把该矛盾展开为“双手锁脚踝”。
- 通过官方 CLI 把 Story 修订为 r5：鬼将甩飞顾沉时，直刀随伤口拔出并继续由顾沉双手控制；顾沉倒地后以双腿剪锁鬼将脚踝，禁止松刀改用双手抓脚、刀无因消失或留在鬼将背部后凭空回手。人物表演弧、因果链、禁止项和 P0 review issue 同步修正。
- P01A/P01B 已重新编译并绑定 Story r5。两者都明确记录当前 Story review 为 null / `accepted:false`；P01A/P01B 继续被 `story_owner_acceptance_required` 与后续 Shot/资产/运镜/逐帧运动门禁阻断，P01B 还保留旧 P01A Owner REJECT 与缺 H1 连续性阻断。
- 该失败已上升为通用 Skill/剧情/分镜合同：每个因果节拍都要审肢体占用和道具归属，同一肢体不得同时承担互斥接触，道具换手、脱手、拔出和回手必须有可见过程。未写 Story ACCEPT，也未调用 Provider。

下一步仍是 Owner 明确审查 Story r5；只有当前 revision 获得 ACCEPT 后，才按顺序审 14 个 Shot。

## 2026-07-22 Story r7 删除错误“杀出去”语义

- Owner 再次纠正：三人就是进入客栈消灭怪物，不存在“杀出去”、突围、杀穿到后出口或从前门撤退的剧情问题。r5 用 `intent` 把“杀出去”解释成向深处进攻，仍然保留了错误前提。
- 通过官方 CLI 将 Story 修订到 r7：删除对白和 `userLockedText` 中的“杀出去”；战斗改为三人确认尸傀目标后，白璃直接以三张贴地火符攻击前排，顾沉与洛青接入贴身战。人物目标、场景目的、因果链、表演弧和入口状态全部改为逐一消灭怪物。
- Story 明确锁定：人物没有赶往任何出口的移动任务，每次位移只能由当前敌人位置、队友救援、围歼或搜索残余威胁触发。后出口仍可作为场景坐标和终极威胁所在位置，但不再是行动目的地。
- Skill、Story 合同与 Shot 合同新增通用规则：不能用 `intent` 重新解释字面错误的对白；Owner 删除对白后，因果链、锁定文本以及下游 Shot 的表演、声音、时间槽和验收条件必须全部同步失效。未写 Owner ACCEPT，未调用 Provider。

下一步是 Owner 审查 Story r7；当前旧 Shot 中残留的“杀出去”仍是待修、未接受且被门禁阻断的历史 revision，Story r7 ACCEPT 后必须首先清理这些 Shot，再进行完整顺序审片。

## 2026-07-22 Story r7 Owner ACCEPT 与前两镜候选清理

- Owner 在明确的 Story r7 审查问题后回复“可以”。该决定已通过官方 CLI 精确写入 `cinematic-story:story-packet-23f9b33c-ad16-499f-bd1d-cf7796446753:r7`，review 为 `review-e65a5c46-94c0-4334-9d76-294af6651332`；接受范围只覆盖 Story r7，不包含任何 Shot、资产、关键帧、GenerationUnit 或付费调用。
- 源剧本第 1–3 行的活动规划字段已通过正式脚本 API 对齐 Owner 修订：第 1 行锁定身体/头部正前方朝桌、正前方无脸、唯一脸在后脑；第 2 行删除对白并改为白璃直接三符清剿；第 3 行删除“后路被封”式结束状态。历史 `sourceExcerpt` 保留并标记为已被 Owner 修订覆盖。
- P01A Shot 升为 r43：4 秒因果表演时间轴通过，怪物解剖先保持至少 0.8 秒，再由白璃真实斗篷形成 H1；声音字段明确下一镜无口令、直接出手。P01B Shot 升为 r41：5 秒六段时间轴改为 H1 离幅 → 原席守恒 → 可见起身 → 白璃无对白眼线锁定 A/B/C → 右手恰好三符一次离手 → 三轨分别命中三目标 → 三名目标倒地 → 顾沉进入当前前排交战面。
- P01B GenerationUnit 升为 r18，完整移除旧对白、出口任务和“向深处杀穿”语义。H1 被明确限制为 `t0` 时序边界；`t0+1` 后的起身、三次眼线、三符、三轨、三命中、三倒地和顾沉进入全部由动态合同驱动。blocking review requirements 从 9 项更新为 11 项，新增 A/B/C 目标映射、无对白锁定、三名目标倒地后顾沉才进入，以及怪物解剖全程守恒。
- 新编译 P01A 为 `prompt-compilation-5e337336-6013-43ef-8692-9e265eebf9fd`（Story r7 ACCEPT / Shot r43 未接受 / Unit r44），P01B 为 `prompt-compilation-c837b822-e3a2-4cb5-bed0-9151cf68fbfd`（Story r7 ACCEPT / Shot r41 未接受 / Unit r18）。两镜表演合同和 Prompt 20 域均通过；两镜仍由当前 Shot Owner ACCEPT、未验收尸傀/场景 Authority、Director/结构化相机/逐帧运动等门禁阻断，P01B 还继续由 P01A Owner v4 REJECT 与缺真实 H1 阻断。
- P01B 当前 Shot、Unit 与编译 Prompt 已递归检查，不再包含旧对白、杀穿、突围、撤退、深处推进或旧 command/advance 状态标签。未调用 Provider，未产生费用。
- 本次全量 `npm run verify` 复跑得到 314/315；唯一失败是既有工作区规模性能门，2000 次 clip 写入为 5164.8ms，略超 5000ms。单测复跑在外部长期 `bun test` 占用约 99% CPU、系统 load average 14.42 时为 6311.9ms，仍只失败同一时间阈值；其余 314 项功能测试通过。上一轮 315/315 仍是最近干净全量基线，本轮不能虚报全绿。

下一步是把 Shot r43 与 Shot r41 的完整候选逐镜呈现给 Owner 审查；没有各自明确 ACCEPT，不能进入资产和视觉生成链。

## 2026-07-22 Shot 1–2 接受与 Shot 3 r10 候选

- Owner 的“可以”只接受刚刚明确展示的 Shot 1 r43 与 Shot 2 r41。正式 review 为 `review-0eae0b11-07b1-4c0a-85e9-5a3a40aa3489`、`review-ab974302-781d-47ac-9e41-f310018e4f67`；没有扩张到资产、关键帧、GenerationUnit 或付费。
- 重新编译 P01A/P01B 为 `prompt-compilation-74adfa84-2af3-48b8-ab6b-3da1d3fdb523`、`prompt-compilation-77f55305-f701-4f4a-a12b-7d1aabd95d47`。Story 与当前 Shot review 已通过，但两者仍保持安全阻断；P01B 继续读取 P01A v4 REJECT。
- Shot 3 的活动 source row 已修为“进入当前敌群接敌”，旧 Shot r8 却仍写“深入尸群、后路被封”，并携带已拒绝 Director v82/capture 和全项目未来音效。现已通过 CLI 更新为 r10 待审候选。
- r10 用六个连续时隙完整覆盖 0–5 秒：进入当前交战面、读骨斧起势、短距侧身、刀鞘顶颌、旋身斩膝、收刀回防与左右攻击线入画。每个动作都绑定眼线、脚底、接触面、受力和恢复；约 70° 短弧保持入口侧不越轴。
- 三名先前倒地尸傀、三条焦痕、入口、白璃和洛青均为跨镜守恒；尸傀头前无脸、后脑唯一完整脸继续是一票否决。旧 Director 顶层/嵌套/camera snapshot 和四个拒绝 ID 已清零。
- Skill 已补强“拒绝环境后递归清除 Shot 所有当前绑定”的规则；四份进度/证据/QA 文档同步记录。本轮没有 Provider 调用，也没有把 Shot 3 自动 ACCEPT。

final result: Shot 1–2 accepted within exact scope；Shot 3 r10 is a corrected review candidate；visual production and paid dispatch remain blocked

## 2026-07-22 Shot 3 接受与 Shot 4 r30 候选

- Owner 在紧邻 Shot 3 r10 审查问题后回复“继续”。正式 CLI review `review-3db0740b-a6dc-4e85-b559-2b319ff5dbc5` 只接受 `cinematic-shot:shot-script-script-row-4e557ba4-f62c-4040-8c4d-794762c8410f:r10`；note 明确排除资产、Authority、Director、关键帧、GenerationUnit、评估和 Provider 权限。
- Shot 4 旧 r29 存在三项跨镜硬错误：镜3结束时顾沉左手直刀/右手刀鞘，镜4却无过程变成双手持刀；四段 `internalTimeSlots` 与五段表演节拍不同步；已拒绝 Director v86/capture/world 以及项目级未来声音/VFX 仍在当前镜。
- Shot 4 已通过 CLI 修为 r30 待审：0–4秒六段连续覆盖 L先压刀、R晚半拍叠力、双臂震颤/脚底补偿、右膝触地与洛青枪尖进入左耳侧安全线。顾沉全镜保持左手直刀、右手刀鞘从刀背下交叉支撑，命中、踩肩与腾空留到镜5。
- 当前 r30 继承四名先前倒地尸傀、三条焦痕、入口、白璃和洛青；尸傀头前无脸/后脑唯一脸继续是一票否决。顶层 Director binding、blocking 嵌套 binding、copied camera 均为空，旧 Director/capture/image/world 四个精确 ID 递归扫描为零。
- CLI 回读证明六个 `performance.temporalBeats` 与六个 `internalTimeSlots` 使用相同边界 `0 / 0.5 / 1.2 / 2.0 / 3.2 / 3.7 / 4.0`，无空洞/重叠。Shot 4 尚未 ACCEPT；无 GenerationUnit、无 Provider 调用。

final result: Shot 3 r10 accepted within exact scope；Shot 4 r30 is a prop-safe, time-contiguous review candidate；paid production remains blocked

## 2026-07-22 Shot 4 接受与 Shot 5–14 一次性到底审核

- Shot 4 r30 已由 `review-18e80471-ebfe-4fcf-ae78-5ab4f860b929` 精确接受；该决定不覆盖后续 Shot 或任何视觉/付费工件。
- 全序审核先修复上游 source rows：Shot 5、7、13、14 均升到 row v3，脚本文档为 r36，分别关闭眉心正脸、无来源上方符、双手抓脚踝/抛枪/无因雷柱和地板肉化冲突。
- Shot 5–14 当前 revision 为 `35 / 9 / 9 / 13 / 35 / 35 / 9 / 35 / 35 / 35`。每镜时间槽覆盖完整 duration；对白、动作源、接触、受力、恢复和下一镜 handoff 顺序明确。
- 关键连续性已闭合：镜4左刀右鞘→镜5可见挂鞘再双手刀；六具→九具倒地尸傀；镜7三符可数且从白璃手中放出；镜9两截枪分离并保留落点；镜10右腕骨折后左手接管；镜11–13顾沉双手刀不丢、随甩飞拔出并以双腿锁脚；镜14可见换为右手刀后才用左掌确认局部木纹。
- Shot 5–14 的旧 Director top/nested/copied camera 与 rejected world 精确引用已递归清零。十镜仍需在合格 Authority 像素上重建导演台、参考图和关键帧，当前没有 GenerationUnit/Provider 放行。
- Shot 5–14 尚未 Owner ACCEPT；本轮未调用 Provider、费用为零。focused 6/6；完整 `npm run verify` 315/315，architecture 和 Next.js build 通过。
- 旧 Unit r03–r08 的安全 compile 全部 `lint/preflight=false`，共同命中 Shot Owner、Director、keyframe/visual carrier、专业会签/Manifest 与 rejected Authority 门；r04 还有旧 `provider_model_leak`，r05 有旧 `generation_time_plan_mismatch`。因此后续不是复用旧 Unit，而是在 Shot 接受后按新状态机重建。

final result: ordered Shot 5–14 audit complete；all ten revisions are review candidates, not accepted production authority

## 2026-07-22 Shot 5–14 接受与视觉主链彻底清场

- Owner 接受了完整呈现的 Shot 5–14 当前 revisions；十个精确 review 已写入，未扩张到资产、Authority、关键帧、Director、GenerationUnit 或付费。
- 逐像素复核推翻所有旧视觉捷径：尸傀 Authority 四份媒体全部失败，场景 Authority 五份媒体全部失败；KF02 的旧三符 ACCEPT 被最新身份/拓扑 REJECT 覆盖。尸傀 r13、场景 r8 都只处于 `candidate`，accepted version 为空。
- 新的未付费重建入口已经就绪：单头侧解剖 compilation `image-prompt-compilation-4d987670-5129-42d9-8ea5-5d5852ad3e2b`，关闭后双木门的空间母版 compilation `image-prompt-compilation-deee4e90-9217-4153-9cb3-82344898dc34`。两份均 lint 通过，但没有 Provider 调用。
- World/Director active environment 已清空，14 个旧 capture 仅作 stale audit；KF01/KF02 rejected，KF03–KF14 blocked。后续必须先得到两份 Authority 像素 ACCEPT，再重绑 World、复用仅作为坐标草稿的 3D 几何并重新 capture，之后才生成逐镜 keyframe/semantic reference。
- GenerationUnit 生命周期已成为正式合同：P01A r45 `blocked_by_authority`、P01B r19 `blocked_by_rejected_continuity_source`、P02–P08 `superseded`。真实 compile/preflight 分别命中 `generation_unit_lifecycle_blocked` 与 `generation_unit_superseded`；run 在 budget/Provider 前终止。
- 生命周期已同步到真实执行节点：P02–P08 不再伪装成“等待视频生成”；14 张旧 Director capture 与 KF01/KF02 已清除 active media，旧 ID 仅存 `stale*` 审计字段，画布显示“图片已隔离”。
- 验证为 focused 134/134、projection focused 9/9；完整 `npm run verify` 320/320，architecture 与 production build 通过，Skill quick validation 通过。源码主文件仍各 499 行，Schema 1 行；Provider 调用和费用均为 0。

下一步只是在新的明确付费批准后依次生成并像素验收“尸傀单头侧解剖母版”和“封闭后门客栈空间母版”。在两者 ACCEPT 前，不重建 P01A 视频，不解除 P01B。

## 2026-07-22 两份 Authority 首轮付费候选

- Owner 紧接“这两份生成会付费且需明确批准”的说明回复“开始”。批准严格限定为尸傀侧解剖和客栈空间母版各一次 GPT Image 2 请求；不包含重抽、视频、自动 ACCEPT、资产晋升或解除 P01A/P01B。
- 尸傀请求 `run-5ed07475-6cf3-4788-ad63-d839a51349e3` 生成 `media-9481e1b1-ae88-42d6-9f0b-c31aa9f60182`，SHA-256 `b7a6b8074016c70dd566f5dcfc7811d6f8ab1b32b6ca182e87ba3c1ff6635328`，预算 CNY 2 已结算。原始 1024×1536 像素仍是正常反向侧脸、独立下颌、巨大无脸头囊和偏置颈部；`review-6b77e112-aef4-4b51-860a-0e4963279eb0` 已 REJECT，`asset-version-e182b24a-25d6-408e-94a5-3236e7e03c96` 仅 `audit_only`。没有自动重试。
- 场景请求 `run-37ae19e8-90cc-469e-a52b-68d1fcf69526` 生成 `media-28707daf-54bd-4711-acc1-7f2c2b7aef45`，SHA-256 `4a1dc94894ab243d6c3f56360f0ed582e2abe3402575cd8679a42fbb179af3fd`，预算 CNY 2 已结算。请求规格为 1536×1024，Provider 实际回传 1774×887；Owner 纠正上游最长边不能超过 2K、常见落在约 1K 档，因此这是正常 Provider 尺寸归一化，不是技术告警。原始像素满足单张满幅、无人、左柜台、右后楼梯、二层回廊、后中轴关闭双木门、门后无室外/月体和二维动画背景硬门禁；仍保持 `candidate`，只等待 Owner 对 exact media 的内容与审美 ACCEPT。
- 尸傀重复逃逸已固化为 Skill 升级规则：相同拓扑错误在更完整文本 Prompt 下复现时停止堆叠文字/盲重抽，下一版改为干净几何构造或带结构化 `preserve/replace/complete/ignore` 的标注语义参考；被拒像素只能作 replace/ignore 反例，不能成为 Authority 或帧锚点。画布节点 r37 已写入 `bloodmoon-corpse-geometry-reference-v1`：必须显式画出单一闭合颅骨包络、颈部中央连接、前部无脸皮肤区、枕骨内浅浮雕脸和禁止的正常反向下颌/颈部区域；控制线不得残留在干净输出中，且该控制图本身永不等于 Authority。

下一步先等待 Owner 审核场景 exact candidate；尸傀必须先免费重建几何参考方案，再另行请求新的单次付费批准。P01A/P01B 继续硬阻断。

- 付费候选落地后重新执行免费编译/预检：P01A 为 `prompt-compilation-45a04bef-3811-4efa-a1e8-d7c922dd6fcd`，P01B 为 `prompt-compilation-4883f844-5d58-49bb-8afe-cf5f1a70c881`；两者均 `ready:false / stale:false`。P01A 仍被 lifecycle、结构化相机、逐帧运动、Director、当前专业会签/TeamManifest 与未验收 Authority 阻断；P01B 还被缺关键帧/首帧/权威 H1、P01A v4 REJECT 连续性来源和交接验证阻断。当前预算累计消费 CNY 28、预留 0。

## 2026-07-22 场景母版精确接受

- Owner 的“接受”严格绑定刚刚命名的场景母版 exact media：`media-28707daf-54bd-4711-acc1-7f2c2b7aef45`。媒体 review `review-4ec6b53a-8b2e-4d29-91cf-e9f53af463bb`、接受资产版本 `asset-version-c0465e41-fada-4299-ba8b-fee191c118b4`、Scene Authority r9 accepted 与画布节点 r37 已形成同一 checksum 血缘。
- 旧五份场景失败媒体继续 `audit_only`；尸傀 `character-authority-3e1e8177-5413-41d3-83ab-a049297c0a3b` 仍为 r13 candidate，未被这次短确认误接受。
- 1774×887 按上游最长边不超过 2K、常见约 1K 的输出策略归类为正常尺寸归一化，不再作为技术告警。
- 免费回编译：P01A `prompt-compilation-dbfba27c-1195-4671-8a69-bc914d0da579`；P01B `prompt-compilation-3278c1b5-c014-465a-a2dc-fc2e5d15d4ae`。两者均读取场景 r9 accepted，但仍 `ready:false / stale:false`；尸傀、相机/逐帧运动、Director/会签和 P01A v4 REJECT/H1 交接门禁保持。
- Provider 调用 0，新增费用 0；预算仍为累计消费 CNY 28、预留 0。本轮无源码改动，未重复运行全量 verify。

## 2026-07-22 P01A 免费三态预演与单颅几何门禁

- Scene Authority r9 的 accepted media 被明确限定为非度量 appearance plate；20×20×8 m Director Stage revision 179 继续作为站位、桌席占位、通道和摄影机变换的唯一 metric source。
- P01A 三个 Director camera/capture 已真实落地：start `director-capture-15e3ea91-a237-4401-aef8-571e9f709e27`、mid `director-capture-e1f3b432-6b8f-4ebd-9de0-ea48c85649f7`、end `director-capture-d36050bd-9bb6-4ec8-aadc-7ca0152c2f3c`。它们只证明构图与空间，不是最终美术、怪物身份或首帧。
- 产品补上 `intentionalForegroundCropIds` 合同与 fail-closed policy：P01A 可以声明三位入口前景人物被 OTS/斗篷裁切，但八名背景酒客、桌席及任何未声明实体仍受全框门禁；HTTP API 对重复声明返回 `invalid_director_command`。
- Shot r46 以 0–2.4/2.4–3.3/3.3–3.7/3.7–4.0 秒完成证明、硬保持、直线快推和 H1 斗篷擦镜；Unit r47 以 24fps、5 phases、13 tracks 写入逐相邻状态的 path/velocity/contact/intermediate-state 合同。
- fresh compilation `prompt-compilation-445e639c-61d5-47b1-ac01-fe41fab8d133` 的相机轨迹、逐帧运动、20 域 Prompt 覆盖和模式控制全部通过，且 `stale:false`。它仍正确阻断于当前 Shot r46 Owner ACCEPT、专业知识/Manifest 会签、尸傀 Authority 和 lifecycle。
- 尸傀 Authority r14 已清除全部失败 reference；下一候选方案升级为 `bloodmoon-corpse-occipital-geometry-v2`，要求唯一闭合单颅、中央颈部、头前平滑无脸皮肤、后脑枕骨皮肤内浅嵌唯一完整人脸，禁止骷髅、普通正脸、双面脸、第二头和独立后脑颌颈结构。当前 `providerCalled:false`。
- P01A 节点 r97、Director 节点 r30、尸傀节点 r39 已同步；P01B 保持 v4 REJECT 连续性阻断，first frame/reference 为空。focused 回归为 50/50 + 4/4；完整 `npm run verify` 为 323/323，architecture boundaries 与 Next.js production build 通过，主 Core use-case 保持 499 行。没有 Provider 调用或新增费用。

## 2026-07-22 P01A 镜头1 r46 接受

- Owner 的“就过吧”已严格落在当前 Shot r46；review `review-43276f84-bdc6-4318-a979-409d6044dd78` 不包含尸傀资产、关键帧、Unit、媒体或付费权限。
- 新 compilation `prompt-compilation-c4a185d8-3c5c-43b0-bdf8-2a811a068da7` 读取 Story r7 ACCEPT 与 Shot r46 ACCEPT。相机轨迹、24fps逐实体时序、模式控制和 Prompt 覆盖仍全通过，`stale:false`。
- P01A 节点升为 r98，Owner Shot 阻断文案已移除；当前只等待尸傀 r14 像素 ACCEPT、当前专业知识/Manifest 会签和 lifecycle 解除。P01B 继续由 v4 REJECT/缺 accepted H1 阻断。
- 本轮为 CLI review/compile/preflight/node projection 和证据记录；没有 Provider 调用或新增费用。源码未再修改，因此沿用前一轮已完成的 323/323、architecture/build 结果，不冒充新的全量运行。

## 2026-07-22 尸傀 r15 单次生成、像素拒绝与 P01A 再阻断

- 按 Owner 单次授权，以 r15 `side-anatomy-proof`、空参考绑定和 GPT Image 2 生成一张 1024×1536 候选；run `run-a623a855-ed90-44ad-8b83-d0018375378d`、media `media-32fde63e-444f-43ac-8369-e9c553c2df00`、checksum `f628fe5c8408961824d2cc437c3faf9e48766db813a2f8756e48e7a8a2aef05b`，CNY 2 已结算，累计消费 CNY 30 / 预留 0。
- 原像素仍为普通反向侧脸＋独立下颌颈部＋巨大空白头囊＋偏置颈部。media review `review-3f4d43b6-d4a7-4102-9572-7cfc8b847bf6` 已 REJECT；审计 asset version `asset-version-02bed4fa-6e3f-46ac-958e-2de0a1dcc23d` 禁止身份权威、状态载体、Provider reference 和首尾帧。
- Authority r16 与尸傀可见资产节点都记录 `r15_pixel_rejected_no_retry_paid_approval_required`；当前 media 清空，旧/新失败图仅在审计历史。没有第二次提交，也没有自动 ACCEPT。
- P01A Unit r48 免费回编译为 `prompt-compilation-30264b76-b314-4792-b41b-3ab6f5b99329`，`ready:false / stale:false`。Shot r46、相机轨迹、24fps 时序和 Prompt coverage 没有倒退，但 accepted corpse Authority、专业会签、TeamManifest 与 lifecycle 继续 fail closed；P01A 视频 Provider 未调用，P01B 继续阻断。
- 下一步不再使用同一 text-only 配置盲抽。必须先把异常解剖转成模型可见的结构控制证据（标注语义图、区域/连接图或可控几何渲染），再经过像素预审和新的付费批准。

final result: one authorized candidate was generated and rejected without retry；the workflow stopped at a truthful blocked preflight

## 2026-07-22 跨模态图像—视频生产规则固化

- `ununu-cinematic-production` 主 Skill 新增强制路由：凡 Authority、生图、故事板/关键帧、图参考视频、首尾帧视频、运镜、表演或多段续接，都必须先执行 `references/cross-modal-image-video-control.md`，不再依赖本次对话记忆。
- 新门禁把 `image_reference`、`first_frame`、`first_last_frame` 分开；普通参考图只控制声明过的身份/场景/空间/材质/区域事实，不被误当 `t0`。首帧只承担真实 `t0`，`t0+1` 后的事件、表演、动作、运镜、物理和结束态必须来自动态合同。
- 每张图必须声明 `preserve / replace / complete / ignore / styleOnly / temporalRole`；局部图必须绑定全景或 Director 区域定位。标注图只允许走 Provider 支持的语义参考模式，圈、线、箭头、轨迹、时间窗与 Prompt 必须同坐标同含义且不进入成片。
- 故事板被明确为风险门禁而非静帧画廊；空间站位、局部定位、复杂接触、运镜和剪辑边界需要视觉证明时必须建立，真正的速度、接触与相邻帧运动则使用 timed previs / `temporalMotionPlan`。
- Shot Prompt 采用逐实体 `t0 → phase boundaries → tEnd` 的事实覆盖法，包含表演微动作、动作源/轨迹/接触/反应、相机路径、结束态和交接；15 秒上限使用真实 `TAIL_CONTINUE` 或 `DUPLICATE_HANDOFF` 及 H0/H1 证据，不再把两个无关片段称为长镜头。
- 重复同一拓扑错误被分类为 `control_modality_failure`，必须换结构控制证据而不是继续堆同义词或盲抽；约 1K、最长边低于 2K 的正常 Provider 尺寸归一化与像素内容错误继续分开判断。ComfyUI 不并入当前主生产路径。
- Skill Creator `quick_validate.py` 已返回 `Skill is valid!`。本轮只改 Skill/参考文档/进度证据，没有 Provider 调用、预算变化或生产状态写入；最近的产品全量基线仍是此前的 323/323，未冒充新一次源码 verify。

final result: durable cross-modal rules are now mandatory Skill gates rather than one-session advice

## 2026-07-22 尸傀群体 Authority ACCEPT 与 P01A r49 语义参考重建

- P01A proof r2 `media-e281f501-f490-4057-a43e-c6e76bd2144f` 已 exact-media REJECT：枕骨符号不等于完整人脸，正常侧脸仍在；该像素不能成为 Authority、关键帧、参考或 P01B 连续性来源。
- 群体扩展板首次编译发现“ensemble 四组正背身份”与继承自单体板的“禁止其他人物/群体”冲突。Authority r26 用 CLI 修正 board scope；产品新增纯策略 `authority-board-constraint-scope-policy.mjs` 与回归测试，不再让单体构图禁令污染群体板。
- 生图授权已扩展为当前任务内可自主低成本迭代，视频权限没有随之扩大。群体 run `run-5cce529c-3ec2-47b8-afc6-77b2f6afc125` 生成 1536×1024 的 `media-711c3702-2b0a-4dcd-9689-517e50896882`，四组正背均通过前无脸/后脑唯一脸/单头中央单颈像素门禁；Authority r27 以 review `review-2c501973-8aa0-4c31-9e0c-c2ec15f5e4ec` 和 version `asset-version-aa1c1d12-0f18-493b-8dff-a3b96f7016c5` 正式 accepted。
- 群体媒体用途被收窄为角色群体身份和普通 Provider reference；不能当首帧、尾帧、动作状态、场景外观或度量站位。单体 accepted media 继续单独控制异常解剖。
- P01A Unit r49 采用九张分职参考：场景外观、白璃/顾沉/洛青身份、尸傀单体解剖、尸傀群体身份、Director start/mid/end 站位。所有图都声明控制/不控制事实，`firstFrameMediaId` 与 `lastFrameMediaId` 为空；4 秒事件、表演、后脑凝视、直推与斗篷 H1 仍完全由详细 Prompt 和 24fps temporal plan 驱动。
- preflight `prompt-compilation-ccc94cf3-8426-4442-9291-eac9a68b0f27` 为 `stale:false / ready:false`，唯一剩余类别是 current-target 专业知识会签和 Owner TeamManifest。P01B fresh compilation `prompt-compilation-ae3092fe-be5a-4551-90b0-972447b7d133` 仍 `ready:false`，无 first frame/reference，continuity source 未接受。
- 验证完成：focused 39/39；完整 `npm run verify` 326/326，Architecture 与 Next.js build 通过。Architecture 的 500 行原子上限只作用于可执行 `.mjs/.js/.jsx` 模块，不把 2870 行 JSON Schema 数据合同误当代码模块；核心 use-case 仍 499 行。预算累计 CNY 52、预留 0，没有视频调用。

下一步是在不放开视频的前提下继续生成/像素审核 P01A 的必要图像证据；只有 Owner 批准 TeamManifest 且当前目标专业会签真实存在后，才允许 P01A 视频 preflight 变为 ready。P01B 必须等待 P01A exact video ACCEPT 和真实 H1。

## 2026-07-22 P01A r3 关键帧候选

- 免费预编译首先确认单关键帧 GPT Image 最多五张参考；九张会以 `single_keyframe_reference_limit_exceeded` 在预算前失败。最终选择场景、三主角、尸傀群体五项高风险身份/外观职责，Director 三态仅保留为文字空间合同；compile `image-prompt-compilation-cf40ca9c-9c70-42cf-943b-2f042c0b09b6` lint clean。
- 批次 `storyboard-batch-9476c61e-2e2a-4f09-b739-39cfa8bd19a3` 只生成一张图片；run `run-748b5ee4-07d6-494b-9343-86062d1cd2ff` → media `media-06bc2416-76d7-4c8a-bbce-5ab35cdb106a` → checksum `a681750d420969cbbfb8c41ee617a94fb6c83036fb12504c1e979e3eaa0319e2`。预算累计 CNY 54、预留 0，视频调用 0。
- 原像素通过 Agent 可见硬门禁：三位入口主角、八名桌席尸傀、身体朝桌/后脑脸朝入口、单闭合皮肤头颅、无骷髅/第二头/双面脸、中央通道和关闭后门均成立。被镜位遮住的头部正前方无脸规则只从 r27 accepted Authority 继承，不伪称本帧独立证明。
- Storyboard shot r114 与图像节点 r10 均为 `agent_hard_gate_pass_owner_pending`；媒体仍 `review_only`，未写 Owner ACCEPT，也未作为视频 reference/first/last/continuity state。
- 源码新增新候选节点投影策略，防止旧 REJECT 文案污染新像素；旧 review ID 转入 history。focused 22/22；全量 verify 326/326，Architecture 与 Next.js build 通过。

下一步只需要 Owner 对这张 exact media 作接受/拒绝；即便接受，P01A 视频仍须 TeamManifest 与 current-target 专业会签，P01B 仍须等待 P01A 视频的真实 accepted H1。

## 2026-07-22 P01A r3 ACCEPT 与 r50 免费 preflight

- Owner 已接受刚刚展示的 P01A r3 exact media；review `review-8b8431e4-ca73-470c-af2d-e2ef54a7a37b` 锁定 media/checksum/Shot r46，并明确不接受首尾帧、动态结果、视频、TeamManifest、会签或 Provider。
- Storyboard r115 将该图选为 `storyboard_composition`，五域 acceptance proof 与 node r14 投影一致。该角色只控制人物、场景、构图和空间关系；画外无脸解剖仍由尸傀 r27 Authority 承担。
- P01A Unit r50 的显式六参考为整镜构图、三主角身份、尸傀单体/群体；编译器补入当前 Director binding 后共七张。`firstFrameMediaId=null`、`lastFrameMediaId=null`，动态完全由 24fps 时间合同和精准 Prompt 驱动。
- compilation `prompt-compilation-cbe15954-2a43-4800-af42-f9cb5cb47145` / preflight `stale:false`；相机、时序、模式、frame policy、生命周期和 Provider 能力均通过，无 degradation。只剩 current-target 专业会签、知识证据、Manifest 绑定与 TeamManifest 五项治理错误。
- P01B compilation `prompt-compilation-f0c0eb60-f6ed-4f86-bb21-490d07838b26` 仍无 first frame/reference，continuity source 仍是 P01A Owner v4 REJECT；不能因 P01A 静帧被接受而提前解锁。
- 没有视频 Provider 调用、没有费用变化；预算仍为 CNY 54 consumed / 0 reserved。当前产品源码基线继续是已完成的 326/326、Architecture 与 Next.js build。

下一步不是直接生成视频，而是补齐真实 TeamManifest 与覆盖 Unit r50 / Shot r46 / Story r7 的专业知识会签；完成后才能申请一次新的 P01A 视频付费批准。

## 2026-07-22 P01A r47/r51 同版本修复与免费专家复审

- 统一知识真实产物：TaskContract `task-924c5781fe06cb17fb87`；候选 TeamManifest `team-a61f0664e7b9e9d0685f`；四个 ExpertPack 为导演 `ep-cec1c2f441cdb47affca`、摄影 `ep-7cbd1d5b66dcb0f4a84f`、连续性 `ep-af5aff6455118c1458bd`、编剧 `ep-387eec1a1664dbab19d0`。TeamManifest 尚未获 Owner 批准，production 仍为空。
- 第一轮四角色全部 REJECT r46/r50，并通过 CLI 持久化四份带 veto 的贡献。产品随后修复“veto contribution 仍可能计作 signoff”和“editor_only Director 图仍进入 Provider”两个硬缺陷；旧否决即使 revision/knowledge/manifest 全匹配也不能再误放行。
- Shot r47/Unit r51 完成实质修复：主动清剿目的贯穿四层；背视镜头不伪称同时看到头前与后脑；2.4–4 秒相机和三主角硬停；相机 pitch/yaw 与 Shot 一致；删除不可见眼线和 0.4 秒 2.4 米冲刺；白璃脚髋胸保持大厅 +Z，只以右肩背驱动斗篷。
- compilation `prompt-compilation-39049321-509d-4de1-b6e7-cdf20e6fa0d6` 为 `stale:false / ready:false`。技术 preflight 全绿；最终 Provider refs 恰好六张且都有 checksum，editor-only 中文标注图被排除，first/last 均为空。剩余门禁为 Shot r47 Owner ACCEPT、r51/r47/r7 同版本专业 PASS、Owner-approved TeamManifest。
- P01A 可见执行节点 revision 101 已刷新到 Unit 51 / Shot 47 / corpse Authority 27 / 六 references；不再显示 r16 candidate 或旧空引用。P01B 未改变：仍须 P01A video exact ACCEPT 与真实 H1。
- 当前编剧同版本复审已 PASS 且 `vetoFindings=[]`；其余角色复审仍须收齐后才可持久化 PASS。任何 PASS 都不替代 Owner Shot/TeamManifest 或视频付费批准。
- focused 18/18。全量测试阶段 328/328 通过；architecture 首次诚实发现 501 行超限，调整后核心 use-case 为 499 行，architecture/build 通过。全流程没有视频 Provider 调用。

## 2026-07-22 P01A Shot r50 / Unit r53 焦点合同与最终免费预检

- 摄影复审发现 r49/r52 的结构化 endpoint 仍把焦点留在约 8.5 米的尸傀，和 3.3–4 秒回拉白璃右肩背、0.25 米贴镜斗篷 H1 的文字相冲突。新增 `focusDistancePlan` 与 temporal camera `focusDistanceMeters`；焦点变化现在必须端点完整、目标可见、插值明确，并在 Shot/Unit 每个共享时间边界逐值一致。
- 当前焦距面时序是 `0/1/2.4/3.3/3.7/4s = 9.92/9.33/8.56/8.56/3.00/0.25m`。Shot 升到 r50，Unit 升到 r53；2.4–4 秒机位、朝向、FOV和三主角站位保持冻结，只允许焦点、白璃右肩背和斗篷按合同运动。
- `storyboard_composition` 已进入逐镜视觉状态载体硬门禁。已接受构图媒体只证明 Shot r46；Shot r50 的构图/状态适用性仍须 Owner exact-media 复核，产品正确返回 `visual_state_carrier_shot_stale`，没有篡改旧 proof。
- 四个角色的新复审全部 PASS、无 veto，并已通过 CLI 持久化到 Story r7 / Shot r50 / Unit r53：导演/剧情、摄影、连续性、编剧。候选 TeamManifest 仍未获 Owner 批准，production `teamManifestIds` 保持空。
- fresh compilation `prompt-compilation-2d4a7170-8331-4b73-80d1-074f3cb18937` 为 `stale:false / ready:false`。技术 preflight 全绿，六张 Provider 语义参考都带 checksum，first/last 均为空，editor-only Director图继续排除；剩余阻断为 Owner Shot r50、r50视觉载体适用性、Manifest binding 与 TeamManifest。
- 画布 P01A 节点 r104 已显示上述焦距面、四专业 PASS 和剩余门禁；P01B 仍等待真实 P01A 视频 exact ACCEPT 与真实 H1。没有调用视频 Provider。
- durable rule 已进入 `ununu-cinematic-production` Skill、跨模态参考和 Shot 合同；`quick_validate.py` 通过。focused 60/60；完整 `npm run verify` 331/331、Architecture 与 production build 通过，核心 use-case 499 行。

下一步只需要 Owner 分别决定 Shot r50、同一构图媒体对 r50 的适用性与候选 TeamManifest；这些决定完成后仍需新的明确视频付费批准，P01B 不提前解锁。

## 2026-07-23 连续视觉工作区一次性产品化

- 新增 `SequencePrevisDocument`、`CutDecision`、`VisualContextBundle`、`VisualTakeMemory`、`CreativeDecisionTrace` 五类公开合同和 JSON Schema；local runtime 使用版本化 Previs、append-only context/memory/trace，不存在 UI-only 状态或直接 SQLite 写入。
- Core 现可保存/更新/读取 Previs、编译每镜视觉上下文、记录实际 take 记忆和创作决策，并把 exact Previs/context 审计注入 GenerationUnit compile/preflight。上下文只选择像素已验收的正向媒体，拒绝证据不再混入 positive reference。
- API、官方 CLI 和 Web 导演台全部接通。Web 新阶段位于锚点与 Prompt 之间，提供真实图片播放、连续时间滑杆、镜头段、切镜/声桥/轴线说明、视觉上下文编译与合同编辑；明显缺帧、缺当前 context 或切镜数量不完整时不提供 Owner ACCEPT。
- Owner review 由专用 Core use case 承担；generic review 无法审批 Previs。专用门禁同时检查真实 image、latest media ACCEPT、当前 revision context、连续时长、Shot 顺序和精确切点；revision 更新自动失效旧接受。
- 真实《血月客栈》已写入无付费 P01A→P01B candidate。P01A 帧和 Authority 像素均经原图复核；P01B 没有合格图，因此保持空白。真实 CLI ACCEPT 尝试按 `sequence_previs_frame_required` 阻断，P01B lifecycle 与 P01A v4 REJECT 谱系没有被篡改。
- 发现旧 P01B context 曾带入未选择/未像素验收图后，保留其 append-only 审计，编译正确零正向引用的新 context，并写 `creative-decision-trace-a2eeb4bb-9e3e-4011-adf9-7c86dd89ffd8` 记录替代原因和禁止 Provider dispatch 的结果。
- `ununu-cinematic-production` Skill 依照 Skill Creator 重构为 236 行入口和 180 行连续视觉 mandatory reference；内容覆盖参考图非首帧、静态/动态分职、局部/全景定位、控制标注、时序表演、镜头轨迹、15 秒分段、重叠交接、实际 take 记忆和 one-variable retake。
- focused 3/3；完整 `npm run verify` 341/341；Architecture boundaries 和 Next.js production build 全过。没有视频 Provider 调用、没有新增费用。

下一步生产动作不是直接重生视频：先为 P01B 形成真实、无冲突、可逐像素 ACCEPT 的局部/全景兼容预演帧，重编 P01B context，完整播放并审批当前 Previs；随后把 exact Previs/context 绑定 P01A GenerationUnit，执行无付费 compile/preflight，再单独申请视频付费授权。

## 2026-07-23 Workflow manifest 与一键编排边界

- 为解决规则写在文档却没有进入执行上下文，新增 `UnunuCinematicWorkflowManifest` 作为持久化运行合同，而不是把一次事故继续堆成 Prompt 口号。
- CLI/API/Core 共用同一 manifest；Skill/version、阶段顺序、目标时长、参考图静态/首尾帧互斥、局部定位图和付费门禁都由合同校验。
- one-shot 是可恢复 DAG 启动器；所有真实媒体仍走 GenerationUnit compile/preflight、实际 take 评审、continuity 和 timeline，不会因启动成功伪称成片完成。
- 本轮仅做源码与测试；没有写 SQLite、没有浏览器生产操作、没有 Provider 调用、没有改动《血月客栈》画布。

## 2026-07-23 P01A 摄影机路径可见性修复与无预算主路径

- 用户验收发现 P01A 的干净起/中/终点图没有摄影机运动线。根因不是“没有运动计划”，而是 Director Stage 只有结构化 `route-camera-p01a-r9`，四个 P01A camera snapshot 的 `routeIds` 没有绑定该路线，因此导出筛选器把路线排除了。
- 通过官方 `unutv director command` CLI 依次写入四个 `upsert_camera` receipt（revision 182→186），再以 hold-fix `upsert_route` 将 Director Stage 推到 revision 187，并选中 `cam-p01a-r10-hold-end` 到 revision 188。现在 `cam-p01a-r9-start/mid/end` 与 `cam-p01a-r10-hold-end` 均绑定 `route-camera-p01a-r9`；路线点为 0/2.4/4 秒，推进方向为 z=-2.4→-1→-1（2.4 秒到位后保持），Director 编辑器绘制可见线/箭头。
- 干净帧仍不得涂线：若 Provider 需要看见线，必须从同一干净空间母版派生独立 `provider_reference_only` 标注图，携带同一 `controlGeometryId`，并禁止把标注图当 Authority、首帧、尾帧或连续性载体。已通过 CLI/API 建立标注节点 `node-ace2a177-9ede-4af3-b7b9-15d20dd8028c`，媒体为 `media-61a4c032-87b0-44bf-a630-f639ec87387d`，checksum 为 `059500b3ba26ac9872f540965ec98844f06fbf0d379840e29b96daa6031e600b`，卡片标题明确“线条仅语义，不是首帧”。截图中的旧 clean 缩略图不会自动变成新导出，必须查看这张独立标注卡或重新从 Director Stage 导出并逐像素核验。
- Shot r53 与 Unit r56 已把该媒体绑定为 `camera_motion_guide`，而非错误的 `camera_motion_reference`；compile 的 camera trajectory/annotation errors 为 0。当前 preflight 只剩 `sequence_state_audit_required`，未调用 Provider。
- 随后通过官方 CLI 将 P01A Unit 更新到 r57，写入完整 `sequenceState`（sequence_first、已发生/本段/后续保留、planned start/end、reanchor policy）；Core 时序审计 `ok:true`，`sequence_state_audit_required` 已清除。Shot 的结构化摄影/调度字段与 0/1/2.4/3.3/3.7/4 秒时间槽补齐至 r55，Prompt 不再混入画幅参数。
- 当前无付费 preflight 的技术层（相机、时间槽、动态、sequence state）全部通过；仍诚实阻断于当前 Shot r55 Owner ACCEPT、最新视觉状态载体、三项最新专业会签和 Owner-approved TeamManifest。没有伪造接受，也没有调用 Provider。
- `apps/web` 的生成单元与批次操作已统一发送 `billingMode:"provider_account"`；operator Skill 和 cinematic canonical docs 已明确电影工业主路径不读取项目预算、不创建预留、不等待 UI 付费批准。Owner 仍只对创意接受、资产晋升、发布和破坏性操作负责。
- 本次仍未调用 Provider；摄影机路径证据已可见，继续无付费 compile/preflight，P01B 保持阻断。源码验证为 347/347，Architecture 与 Next.js production build 通过。

## 2026-07-23 P01A r58/r56 Owner-start gate closure

- 按 Owner 最新“开始”指令，P01A Shot r56 的 Owner ACCEPT 已持久化到 `cinematic-shot:shot-script-script-row-13d94706-568b-41fa-81ed-74695954da48:r56`（review `review-c8d032fd-d3c1-4682-ac62-bce35413a520`）。该接受只覆盖当前 Shot 合同，不扩大到视频 Provider 或 P01B。
- Storyboard composition 的五域像素证明与 Shot r56 同步，P01A GenerationUnit 更新至 r58；`sequenceState`、24fps temporalMotion、相机轨迹/标注图、blocking、performance 和 reference proof 均为同版本可机检证据。摄影机控制标注仍是独立 `provider_reference_only`，不是首帧/尾帧/Authority。
- 导演/剧情、摄影、连续性三项最新专业会签已通过官方 CLI 写入，均覆盖 Story r7 / Shot r56 / Unit r58 / Director stage r188，携带 `cap-* + kn-*`，`vetoFindings=[]`；编剧旧 PASS 不被错误当作当前三项会签。
- Owner 将现有 `team-a61f0664e7b9e9d0685f` 绑定到 production（production revision 6），作为本次明确“开始”指令下的 Owner-approved TeamManifest。重新编译 `prompt-compilation-762186e8-45eb-4dd2-9e30-faf982de42e7`：`lint.ok=true`、`preflight.ok=true`、`ready=true`、`stale=false`，无 degradation。
- 本轮没有调用付费视频 Provider；ready 只表示合同允许进入 Provider boundary，不等于已经生成或验收成片。P01B 仍保持 blocked，必须等待 P01A 真实视频、H1 和最新像素 ACCEPT。

final result: P01A is now technically and governance-ready for the paid Provider boundary; no paid dispatch was made, and P01B remains hard-blocked.

## 2026-07-23 预检结果必须投影回画布执行节点

- 发现并修复真实产品缺陷：Core/CLI 已经返回 `preflight.ready=true` 后，旧的执行节点仍可能显示历史 `blocked` 快照，误导导演台。新增 `projectGenerationUnitPreflightToNode` 与 `syncGenerationUnitPreflightNode`，由官方 `unit preflight` 在同一 API/use-case 边界写回 compilation、Unit/Shot/Story revision、blockers、Provider 状态和下一道门禁。
- P01A 通过官方 CLI 重新预检后，执行节点升至 revision 105，显示 `generationPhase=preflight_ready`、`preflightStatus=ready`、`preflightReady=true`、`generationUnitRevision=58`、`shotRevision=56`、`preflightCompilationId=prompt-compilation-762186e8-45eb-4dd2-9e30-faf982de42e7`，`blockers=[]`。Web 空状态显示“预检通过”，而不是旧的等待/阻断文案。
- 该投影只反映合同预检，不发起 Provider，不把 ready 冒充成成片；P01B 仍因缺少 P01A 真实视频 H1 和最新像素 ACCEPT 保持阻断。
- 回归：focused 12/12；全量 `npm run verify` 348/348；Architecture boundaries 与 Next.js production build 通过。没有视频 Provider 调用。

## 2026-07-23 生成提交前数据一致性缺陷（必须闭环）

用户现场发现：节点只显示四张可解析资源图，但编译提示词引用了参考图 5/6/7，Provider 请求实际带入了更多派生引用。原因是旧 Web 只从资源库解析卡片，Core 在编译时临时合并故事板/导演台引用，运行前没有把最终清单写入 PromptDocument，也没有三方 manifest 等值门禁。该状态不能再称为“工作流完成”。

已修复为 fail-closed：正式运行前审计编译引用绑定、节点参数、PromptDocument 和 Provider 请求的有序 mediaId/role/providerIndex；自动持久化最终引用文档并在画布显示所有锁定引用；缺图、错序、旧构图残留、首尾帧混用或提示词占位符不一致直接阻断。当前 P01A 真实视频候选已冻结，待完整像素/时序审片；P01B 不得启动。修复后 focused 25/25；全量 verify 待本轮源码重启后执行并以实际数字更新。

## 2026-07-23 Skill 不是可执行上下文的缺陷

审计确认：原工作流会自动调度 DAG，但把多个阶段实现成“检查已有产物，缺失就阻断”；工作流 manifest 只有 Skill id/version，没有把当前故事、视觉圣经、权威、分镜、GenerationUnit、审片、时间线的 revision 关系交给 Agent。修复不是继续补 Prompt，而是运行时加载 Skill 与必读参考并建立 `UnunuCinematicAgentContextV1`，启动时持久化、每次 advance 刷新，显式列出 blocker 与 nextStage。缺失产物仍然必须真实创建并通过合同/审片，不能由上下文索引伪造。

## 2026-07-23 外部 Skill OS → 可执行生产闭环

本轮把 Flova Skill Library 与 MIT Seedance 2.0 Skill OS 的共同工作方式落进
运行时：顺序节拍、参考角色、Prompt Draft、预检、实际 take 观察、正典更新和
单变量返工，而不是继续堆一份事故清单。电影主工作流固定为 Provider 账户模式，
不再弹预算/付费审批；旧通用接口仍保留预算兼容性。

新增 `CinematicPromptDraftV1` 并嵌入现有 compilation 持久化记录，正式生成前校验
Draft 与 envelope 的文本、来源 revision、参考图顺序和参数一致。自动重试只保存
Provider/model/execution node 策略，不伪造金额批准；未知提交仍要求显式核对，避免重复。
评审用例已拆出，`cinematic-production-use-cases.mjs` 降至 480 行。

本轮 focused workflow/generation/API/automation 28/28；随后完整 `npm run verify`
354/354、Architecture boundaries 和 Next.js production build 均通过；没有调用
Provider，也没有通过浏览器或 SQLite 改写项目。

## 2026-07-23 一次性修复：输入、参考图、动态与评审闭环

这次不再把“规则写在文档里”当作完成。运行时已强制执行：

1. 用户提供的角色/场景/道具图必须经 UnunuTV API/CLI 导入并带完整绑定；无初始图时先由 UnunuTV 图像阶段生成并选择故事板语义锚点。
2. 语义参考图只负责身份、场景、拓扑和空间；动作时序、表演、运镜和剪辑来自逐镜合同。首帧/首尾帧独立且互斥。
3. 一句 brief 不能生成假的主角、对白、固定机位和通用节拍；缺 StoryPacket、VisualBible、结构化分镜或真实参考时停在 blocker。
4. 生成单元保留镜头真实运动、时长、分辨率和参考顺序；图像阶段后才把故事板图绑定到视频。
5. Provider 回执只能是 candidate；没有真实最新 `CinematicEvaluationRecord` 不得进入连续性、时间线、渲染和交付。

本轮新增回归夹具为 `tests/cinematic-unit-design-reference.test.mjs`；本轮 `npm test` 为 367/367，`npm run build` 通过。没有 Provider 调用、浏览器写入或 SQLite 直写。

## 2026-07-23 一次性修复收口

上段是拆分完成前的中间记录，已被最终验证覆盖：手动 Unit Design 已补齐真实参考绑定/视觉锚点/生成模式传递；基础端口和 automation stage 已拆为原子模块，API/权限/Provider 边界不变。最终 `npm test` **367/367**、`npm run build`、`npm run verify:arch` 均通过。
