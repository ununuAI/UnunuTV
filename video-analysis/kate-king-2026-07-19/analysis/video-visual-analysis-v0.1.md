# Video Visual Analysis v0.1

## Method

- Source set: `/Users/zhangxiaohao/Ununu/downloads/KATE_KING_videohao_2026-07-19`
- Visual coverage: 16 个 MP4 的完整时间线，按每秒 1 帧抽取并逐页查看全部联系表。
- Dense frames: 603。
- Contact-sheet pages: 18。
- Duplicate status: 16 个文件 SHA-256 均不同，未发现字节级重复。
- Audio/OCR/ASR status: 16 个视频均有音轨；本轮以画面和屏幕可见 Prompt 卡片为证据，没有把音频转写或小字号 OCR 当作可靠文本。
- Limitation: 4 个视频在精确结束时刻多请求了一帧并返回 `Cannot Open`，均为超出/贴近媒体尾界的末帧，不影响此前每秒时间线；屏幕下半部 Prompt 小字只用于结构观察，不逐字转录。

## Evidence Locations

- Dense manifest: `dense-video-timeline-manifest.json`
- Dense frames: `dense-frames/`
- Contact sheets: `dense-contact-sheets/`
- Timeline index: `dense-video-timeline-index.md`

## Inventory

| ID | Source file | Duration | Dense frames | Contact sheets | Duplicate status |
|---|---|---:|---:|---:|---|
| video-001 | 01_AnBg2wIrY7.mp4 | 46.7s | 48 | 1 | unique |
| video-002 | 02_AS0rC6Ld70.mp4 | 41.2s | 42 | 1 | unique |
| video-003 | 04_Agin4LkDtD.mp4 | 15.0s | 15 | 1 | unique |
| video-004 | 05_ApNbumZuui.mp4 | 38.3s | 39 | 1 | unique |
| video-005 | 06_AKf3UKjjph.mp4 | 32.6s | 34 | 1 | unique |
| video-006 | 07_A9qm9uDYNr.mp4 | 31.3s | 32 | 1 | unique |
| video-007 | 08_Ald9UraLIN.mp4 | 34.5s | 35 | 1 | unique |
| video-008 | 09_AYIcbqbUwP.mp4 | 49.8s | 51 | 2 | unique |
| video-009 | 10_AkHfGI5Ejk.mp4 | 23.8s | 24 | 1 | unique |
| video-010 | 11_A2N1k9CHup.mp4 | 16.0s | 16 | 1 | unique |
| video-011 | 12_A2UeCY6f6g.mp4 | 24.8s | 25 | 1 | unique |
| video-012 | 13_AKAvaiuYfR.mp4 | 61.3s | 62 | 2 | unique |
| video-013 | 14_A0J7rrSRwx.mp4 | 48.0s | 49 | 1 | unique |
| video-014 | 15_Ah6YATHjTT.mp4 | 38.0s | 39 | 1 | unique |
| video-015 | 16_AcYsHD1WFA.mp4 | 48.5s | 49 | 1 | unique |
| video-016 | 17_AFwyfWCyOU.mp4 | 42.5s | 43 | 1 | unique |

## Per-Video Analysis

### video-001 - 古装双人对白与宫廷双人戏

Visual timeline:

- 00:00-00:27: 古装男女在水榭/庭院并行、对话，使用双人中景、单人近景、过肩和反打组织信息。
- 00:28-00:46: 宫廷室内男女双人戏，景别从双人中景切到单人近景，再回到双人关系镜头。

Main content: 屏幕上方连续播放生成片段，下方同时展示参考缩略图和按镜头编号组织的长 Prompt。

Useful observations: Prompt 不是故事梗概，而是把人物关系、镜头编号、景别、表演和对白反应写成有序镜头；同一视频汇编了两个独立生成案例。

Boundary: 小字号 Prompt 未逐字 OCR，模型能力和成功率不可由该展示视频验证。

### video-002 - 古装群戏、夜市与室内对白

Visual timeline:

- 00:00-00:13: 宴席群戏中由多人全景切入双人近景和动作反应。
- 00:14-00:26: 夜市双人行走、对话、递物和近景反应。
- 00:27-00:41: 室内双人关系戏，由全身/中景进入手部和脸部反应。

Main content: 多个带群演和复杂场景的古装案例，画面下方显示 KLING 3.0 Omni Prompt 卡。

Useful observations: 群戏仍先确定关系主轴，再安排群演作为空间背景；手部递物、人物回望和反打均被当作独立动作节拍。

Boundary: 不把界面标注的模型名称和生成效果当作已验证 Provider 能力。

### video-003 - 现代聚会到夜晚独处的单次多镜头序列

Visual timeline:

- 00:00-00:05: 手机特写、聚会环境和举杯动作建立事件。
- 00:06-00:10: 两位女性近景对话与离场。
- 00:11-00:15: 俯拍独处、夜景窗口和情绪收束。

Main content: 一个 15 秒内包含多次设计切镜的现代情绪段落。

Useful observations: 单次生成可以服务多个艺术分镜；关键在明确镜头边界、状态变化和收束画面，而非必须逐镜生成视频。

Boundary: 尾界 14.99 秒的一帧未打开；其余 15 帧完整。

### video-004 - 婚礼主题 MV

Visual timeline:

- 00:00-00:10: 新郎准备、新娘妆发、海边人物分置与手部会合。
- 00:11-00:23: 海边双人关系镜头、近景触碰、落日拥抱和婚纱细节。
- 00:24-00:38: 室内楼梯、草地奔跑、夜景拥抱与远景收束。

Main content: 以婚礼情绪线串联多地点、多时段的 MV 蒙太奇。

Useful observations: 多镜头 Prompt 需要场景级色彩和时间连续性、人物服装连续性、动作连接以及明确的结尾状态。

Boundary: 展示结果不能证明每个镜头由同一次请求生成。

### video-005 - 现代恋爱 MV

Visual timeline:

- 00:00-00:09: 街道相遇、手部接触、并肩行走。
- 00:10-00:20: 咖啡店、极近距离、书店互动和共同阅读。
- 00:21-00:32: 海边落日、肩部拥抱、夜间长椅与公交站告别。

Main content: 通过多个日常地点完成相遇—亲近—分别的状态推进。

Useful observations: 场景切换仍由关系状态驱动；极近景和手部特写承担情感证明，不只是装饰性镜头。

Boundary: 未核验 Prompt 文本与每个实际切点是否一一对应。

### video-006 - 日系冬日恋爱 MV

Visual timeline:

- 00:00-00:10: 户外初遇、热饮、行走和递水。
- 00:11-00:21: 咖啡店、书店、海边围巾互动与落日。
- 00:22-00:31: 夜市、玩偶、围巾整理、夜路同行。

Main content: 连续的冬季服装、柔和日光与暖室内光构成统一视觉基调。

Useful observations: 服装、围巾、饮料等道具是跨镜连续性锚点；Prompt 应记录接触对象和手部动作，而不是只写“甜蜜互动”。

Boundary: 界面呈现不能说明角色一致性是否依赖额外参考图流程。

### video-007 - 黑白悬疑/黑色电影段落

Visual timeline:

- 00:00-00:10: 雨夜巷道双人步行、鞋部水面特写和高位空间镜头。
- 00:11-00:23: 进入室内、开门、文件桌面、人物关系近景。
- 00:24-00:34: 强逆光剪影、手枪/门把等物件特写、眼部极近景与举枪结尾。

Main content: 黑白、高反差、雨夜反射和百叶窗光形成明确的类型片视觉系统。

Useful observations: “电影感”来自可解释的场景光源、光比、构图、物件插入镜头和信息释放次序，而不是抽象风格词。

Boundary: 武器和追踪情节只作为可见画面观察，不推断故事事实。

### video-008 - 古装喜剧多段汇编

Visual timeline:

- 00:00-00:12: 夜市双人拌嘴和物件互动。
- 00:13-00:25: 宫廷夫妇在摊位前对话、尝食和反应。
- 00:26-00:38: 餐桌多人对话与单人反打。
- 00:39-00:50: 夜市双人近景、食物道具和人物反应收束。

Main content: 至少四个场景/角色组合的喜剧对白案例。

Useful observations: 多人对白需要显式说话者、听者反应、视线落点和道具交互；每次切镜都应有信息或笑点原因。

Boundary: 第二页只有最后一个尾帧；没有缺失中间内容。

### video-009 - 两组古风女性动作片段

Visual timeline:

- 00:00-00:13: 室内月夜，人物触碰窗/影、走动、抬头、整理发饰。
- 00:14-00:24: 庭院人物奔跑、裙摆与脚步、花树互动、远景收束。

Main content: 两组由不同参考人物驱动的女性古风片段。

Useful observations: 参考图职责需要与具体人物身份绑定；动作路径、衣料响应和镜头距离必须共同定义。

Boundary: 尾界 23.71 秒的一帧未打开；其余时间线完整。

### video-010 - 古装双人持剑动作

Visual timeline:

- 00:00-00:07: 黑衣/白衣人物的夜间对峙、剑部特写和双人站位。
- 00:08-00:16: 蓝衣/白衣另一组人物对峙、拔剑、受控动作和双人结尾。

Main content: 两组独立参考人物的短动作冲突。

Useful observations: 动作 Prompt 需要攻守方、武器归属、距离、方向、接触前后状态和相机位置，不能只写“激烈打斗”。

Boundary: 尾界 15.95 秒的一帧未打开；没有把展示结果视为物理正确性的证明。

### video-011 - 古装夜市马头面具喜剧

Visual timeline:

- 00:00-00:08: 夜市建立镜头、人物与马头面具角色相遇。
- 00:09-00:16: 双人对话、手势和观众背景反应。
- 00:17-00:25: 空间回切、脸部反应和关系收束。

Main content: 一个完整的多镜头喜剧场景。

Useful observations: 夸张道具的角色归属、面部可见性、说话者和背景群演职责都需明确，避免模型把道具污染到其他人物。

Boundary: 尾界 24.74 秒的一帧未打开；其余时间线完整。

### video-012 - 八段现代情绪戏汇编

Visual timeline:

- 00:00-00:08: 夜晚街边双人争执。
- 00:09-00:15: 图书馆双人轻喜互动。
- 00:16-00:23: 公园告白。
- 00:24-00:31: 室内安慰和拥抱。
- 00:32-00:39: 咖啡店双人交流。
- 00:40-00:47: 雨夜窗边安慰。
- 00:48-00:55: 海边对话。
- 00:56-01:01: 车站奔跑和拥抱。

Main content: 八个相互独立的双人情绪场景，每段有自己的参考人物组合和对白/动作目的。

Useful observations: 批量案例强调“一个情绪词不够”；同为关系戏，争执、安慰、告白、重逢必须采用不同的距离、呼吸、视线、触碰和结束状态。

Boundary: 这是汇编视频，不能把八段误认为一次生成或一个艺术场景。

### video-013 - 四段校园/青春关系戏

Visual timeline:

- 00:00-00:11: 夜市摊位互动和围巾动作。
- 00:12-00:23: 献花和回应。
- 00:24-00:35: 夕阳天台递物与告白。
- 00:36-00:48: 午后室内用餐和照顾动作。

Main content: 四个独立的现代青春情绪片段。

Useful observations: 道具动作是关系变化的外显证据；Prompt 应写清递出、接住、犹豫、接受等动作链和微表情顺序。

Boundary: 只依据可见时间线，不推断人物背景。

### video-014 - 八段单人表演/台词测试

Visual timeline:

- 00:00-00:20: 依次展示恐惧女性、疲惫男性、电话女性、办公室愤怒男性、婚礼女性。
- 00:21-00:38: 讲台男性、办公室男性、户外女性独白。

Main content: 八个独立单人镜头，强调不同表演状态、环境和台词口型。

Useful observations: 单人镜头仍需写目标、视线对象、呼吸、停顿、手部、下颌和情绪解除顺序；“恐惧/疲惫/愤怒”不能单独作为表演设计。

Boundary: 口型准确度和声音质量没有逐帧/逐音素验证。

### video-015 - 五段现代双人对白测试

Visual timeline:

- 00:00-00:09: 家庭空间男女对话。
- 00:10-00:18: 办公室女性主导对话。
- 00:19-00:28: 沙发双人关系戏。
- 00:29-00:39: 办公室两位男性对峙。
- 00:40-00:49: 户外男女对话。

Main content: 五个独立双人对白案例，镜头多为稳定中近景和反应变化。

Useful observations: 双人对白 Prompt 应明确谁发起、谁承受、谁先反应以及事件前不得提前出现的表情；固定机位可以有丰富表演，不等于静态故事梗概。

Boundary: 不把 UI 中的模型版本和作品质量视为外部验证。

### video-016 - 古装节庆人物口播汇编

Visual timeline:

- 00:00-00:14: 古装男女在室内/雪夜进行祝词或节庆台词。
- 00:15-00:28: 多位古装角色依次口播，背景和服装持续变化。
- 00:29-00:43: 长者与节庆角色继续口播，红灯笼和节日美术强化主题。

Main content: 多个独立角色口播片段的界面录屏，展示人物参考、生成画面和 Prompt 输入区域。

Useful observations: 口播类镜头仍需要角色身份、场景动机光、声线、视线落点、嘴部动作和结束姿态；不同角色不能共享含糊“主体”编号。

Boundary: Prompt 区域字号过小，本轮未做逐字转录；各角色是否来自同一项目未知。

## Cross-Video Finding

这 16 个文件不是“70 个视频页”的原始集合，而是 16 个录屏汇编；其中可见大量独立 Prompt 卡和生成片段。共同结构是：上方展示结果，下方保留参考缩略图与编号镜头 Prompt。可复用的核心不是某个固定时长、固定格数或模型名，而是把身份、场景、动作、表演、摄影、灯光、声音、切镜和结束状态写成可执行、可审阅的生成单元。
