.configuration.referenceMediaIds = [
  "media-28707daf-54bd-4711-acc1-7f2c2b7aef45",
  "media-c3366895-58cd-4b31-b719-30e499e625c5",
  "media-f9f082ba-7c5e-479b-bd0b-5ae5369eade1",
  "media-996eda82-e579-46c0-9e91-5aa08b3ec5ee",
  "media-0dbc640d-7817-437a-8353-3fda67b2ba5c"
]
| .configuration.referenceBindings = [
  {
    "assetId": "asset-2ce266d7-ee31-46c0-8713-4166ede00cab",
    "versionId": "asset-version-c0465e41-fada-4299-ba8b-fee191c118b4",
    "mediaId": "media-28707daf-54bd-4711-acc1-7f2c2b7aef45",
    "displayName": "血月客栈室内场景母版",
    "promptAlias": "封闭双层古代木构客栈、右后楼梯、左侧柜台与暖红暗褐材质",
    "role": "scene_authority",
    "authorityRevision": "scene-authority-7c7bb23a-2ffe-4543-9e5c-2e05702360e7:r9",
    "providerIndex": 1,
    "controls": ["古代木构客栈身份", "右后楼梯与左侧柜台", "暖红暗褐材质与曝光"],
    "doesNotControl": ["人物数量", "桌席数量", "尸傀解剖", "视频起始帧", "动态动作"],
    "required": true
  },
  {
    "assetId": "asset-1d109462-0cee-40b3-a36c-0af724c62940",
    "versionId": "asset-version-11a949da-1111-4486-a790-7591d4b5a849",
    "mediaId": "media-c3366895-58cd-4b31-b719-30e499e625c5",
    "displayName": "尸傀后脑唯一脸干净身份母版",
    "promptAlias": "单一普通闭合头颅、后脑枕骨内较小唯一完整皮肤脸、前方平滑无脸、中央单颈",
    "role": "character_authority",
    "authorityRevision": "character-authority-3e1e8177-5413-41d3-83ab-a049297c0a3b:r25",
    "providerIndex": 2,
    "controls": ["尸傀单头解剖", "后脑枕骨内较小唯一完整脸", "前方平滑无眼鼻口", "中央单颈"],
    "doesNotControl": ["客栈场景", "主角身份", "桌席数量", "视频起始帧", "动态动作"],
    "required": true
  },
  {
    "assetId": "asset-1d109462-0cee-40b3-a36c-0af724c62940",
    "versionId": "asset-version-78341e2c-8a34-452c-b1b0-1c1f04b7cf7f",
    "mediaId": "media-f9f082ba-7c5e-479b-bd0b-5ae5369eade1",
    "displayName": "尸傀枕骨嵌入几何标注控制图",
    "promptAlias": "只读取外层单头包络、内层较小脸区、连续头皮环、头底皮肤带与中央颈的几何关系",
    "role": "anatomy_control_annotation",
    "authorityRevision": "character-authority-3e1e8177-5413-41d3-83ab-a049297c0a3b:r23",
    "providerIndex": 3,
    "controls": ["外层单头包络", "内层较小脸区", "脸四周连续头皮环", "脸下方头底皮肤带", "中央单颈"],
    "doesNotControl": ["最终像素", "文字标签", "彩色线框", "箭头标记", "场景", "人物数量", "视频起始帧"],
    "required": true
  },
  {
    "assetId": "director-stage-p01a-r9",
    "versionId": "director-capture-15e3ea91-a237-4401-aef8-571e9f709e27",
    "mediaId": "media-996eda82-e579-46c0-9e91-5aa08b3ec5ee",
    "displayName": "P01A入口阈值起点3D调度底图",
    "promptAlias": "只读取入口摄影机、白璃中顾沉左洛青右的背后三角、四桌八座与八名酒客世界坐标",
    "role": "director_blocking",
    "authorityRevision": "director-stage:r172",
    "providerIndex": 4,
    "controls": ["入口摄影机方位", "三主角背后三角", "恰好四桌八座", "恰好八名酒客", "入口到后出口纵深"],
    "doesNotControl": ["代理人物外观", "网格", "文字标签", "颜色", "最终画风", "尸傀解剖"],
    "required": true
  },
  {
    "assetId": "director-stage-p01a-r9",
    "versionId": "director-capture-e1f3b432-6b8f-4ebd-9de0-ea48c85649f7",
    "mediaId": "media-0dbc640d-7817-437a-8353-3fda67b2ba5c",
    "displayName": "P01A后脑揭示中点3D调度底图",
    "promptAlias": "只读取2.85秒入口侧机位、三主角停步、最近尸傀中景尺度和四桌八座占位",
    "role": "director_blocking",
    "authorityRevision": "director-stage:r175",
    "providerIndex": 5,
    "controls": ["2.85秒机位与焦点", "三主角停步位置", "最近尸傀中景尺寸", "八名酒客固定座位", "四桌空间占位"],
    "doesNotControl": ["代理人物外观", "网格", "文字标签", "颜色", "最终画风", "尸傀解剖"],
    "required": true
  }
]
| .configuration.keyframeMoment = "P01A第2.85秒静止证据时刻：入口侧摄影机从三位主角身后看向客栈纵深。白璃、顾沉、洛青保持中左后右后的三角停步；中后景严格只有八名尸傀，分别占据严格只有四张桌子和八把座椅。八具身体都不回头，只有后脑枕骨内较小的唯一完整皮肤脸睁眼朝入口。尚未发生转肩、斗篷遮幅或攻击。"
| .configuration.spatialState = "把两张3D调度底图当空间测量，不复制其代理人物、网格或标签。严格沿前门—中央—后出口轴线：摄影机在入口侧，三位主角只占前景下方约35%高度；白璃中央、顾沉左后半步、洛青右后半步。客栈内严格只有四张旧木桌，每桌严格两把座椅，每座严格一名坐姿尸傀，总数严格八；不得添加第五桌、第九人或墙边散座。所有八具尸傀臀—座、手或杯—桌接触清楚。至少最近三名尸傀的单头外轮廓、中央颈和枕骨内较小完整脸清晰可验收；其余五名也必须保持相同解剖，不得退化成普通秃头。"
| .configuration.subjectState = "前景三主角只需保持白璃中央月白短斗篷、顾沉左侧深灰黑短打低短尾、洛青右侧墨青战衣高马尾的可读轮廓，本图不承担精确面部身份。八名尸傀穿不同古代酒客服，身体、肩胸髋、膝盖、双手和头部正前方全部朝各自桌案；身体与普通尺度单头都不转向入口。每颗头只有一个闭合外包络和一条从头底几何中央接出的颈：身体朝向那一侧的头部正前方是平滑无眼鼻口皮肤；入口可见的后脑枕骨内嵌一个比头颅外轮廓更小的唯一完整皮肤脸，脸的上左右与下方都留有连续头皮和头底皮肤带。它不是正常人回头，不得出现耳朵、独立下颌、反向侧脸、第二颈或第二头。"
| .configuration.cameraState = "严格采用中点3D调度底图的入口侧35毫米等效平视构图，摄影机高度1.65米；前景三主角背影、中景三名可验收后脑脸、后景其余五名与楼梯形成三层纵深。焦点锁最近三名尸傀的枕骨脸和单头皮肤环；四桌八座仍全部读得清。不环绕、不越轴、不镜像、不俯拍。"
| .configuration.performanceFocus = "静止恐怖：八具身体完全不动、仍面向桌案；杯盏刚停；后脑唯一脸只做睁眼与凝视。三主角停止前进并压低重心。没有对白、回头、站起、攻击、尖叫或技能。"
| .configuration.continuityFocus = "输出只作为P01A的场景拓扑、四桌八座、三主角入口站位与尸傀解剖参考；绝不是视频首帧。标注控制图和3D底图中的文字、色块、箭头、网格、线框、代理人和界面必须完全消失。视频的进入、停杯、睁眼、硬停、白璃转肩和斗篷H1仍全部由24fps动态合同与精准提示词驱动。"
| .configuration.prohibitions += [
  "不得生成九名或更多酒客，不得生成五桌或更多桌案；画面内恰好八名尸傀、四桌、八座",
  "不得把远处尸傀退化成普通秃头后脑；每名可见尸傀都必须有枕骨内唯一完整皮肤脸",
  "不得复制标注控制图或3D底图中的任何文字、数字、字母、色块、圈线、箭头、网格、线框、代理人物或界面",
  "不得让任一后脑脸长出耳朵、独立下颌、第二颈或读成正常人扭头回望"
]
