# Provider 能力与参数边界

精确能力注册表位于 `packages/contracts/src/video-model-capability-policy.mjs`，知识库不能覆盖。首期只注册运行代码真实存在的 Ark Seedance 2.0 Mini、OpenRouter Grok Imagine Video 和 HappyHorse 1.1。

每个 profile 记录 Provider、模型、模式、生成策略、视觉锚点、时长、分辨率/比例、Prompt 字节上限、原声音频、negative Prompt、内部切镜、时间槽和验证日期。未知能力产生 blocking degradation。

`GenerationParameters` 独立保存 provider、model、mode、duration、aspectRatio、resolution、count、generateAudio、首/尾帧 media、referenceMediaIds 和 providerOptions。它们不进入内容 Prompt。

图片权威与故事板使用独立 `CinematicImageGenerationParameters`，同样把 provider、model、aspectRatio、resolution、count 和 referenceMediaIds 留在参数层。`CinematicImagePromptEnvelopeV2` 可交给现有 UnunuTV 图片节点和 Provider adapter；不建立第二套图片流水线。

图片 Provider 的请求尺寸与实际落盘尺寸必须分开记录。对最长边不超过 2K、常见实际输出约 1K 档的上游，`size` 是请求参数而不是精确像素回执；实际文件只要位于注册上限内、满足板件用途的可审清晰度，并保持所需构图，就不能因 width/height 与请求值不完全相等而降级。精确宽高比只有在 Owner 或下游技术合同明确锁定时才成为硬门禁。

正式生产只通过 GenerationUnit run。必须满足：最新编译 revision、lint 通过、能力预检通过、真实执行视频节点和 `billingMode:"provider_account"`。电影工业主路径不读取项目预算、不创建预算预留、不等待 UI 付费批准；Provider 账户授权由已编译合同与能力预检控制。直接实验仍可使用 node run。Provider 只接收编译 envelope 展开的内容 Prompt 与参数，不重写导演设计。

UnunuTV 是唯一活动运行时。ComfyUI JSON、checkpoint 路径、自定义节点和本地工作流配置只能作为来源证据审阅，不能成为产品依赖、模型注册项、Provider adapter 或执行降级路线。
