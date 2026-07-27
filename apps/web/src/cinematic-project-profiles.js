const resource = (id, label, description, options = {}) => Object.freeze({
  id,
  label,
  description,
  authorityType: null,
  minimum: 1,
  ...options
});

export const CINEMATIC_RESOURCE_CATALOG = Object.freeze({
  story: resource("story", "剧作与内容事实", "主题、因果、对白、节拍、禁提前信息"),
  character: resource("character", "角色与人物身份", "人物数量、脸部、体型、年龄感和表演基线", { authorityType: "character" }),
  scene: resource("scene", "场景与空间", "地点、空间拓扑、陈设、时段和天气", { authorityType: "scene" }),
  prop: resource("prop", "道具与关键物件", "叙事道具、手持物、包装和状态变化", { authorityType: "prop" }),
  wardrobe_makeup_hair: resource("wardrobe_makeup_hair", "服装 / 化妆 / 发型", "按人物、场次和连续性日管理造型版本"),
  brand_product: resource("brand_product", "品牌与产品", "Logo、产品外观、包装、卖点和品牌禁区", { authorityType: "prop" }),
  performance_choreography: resource("performance_choreography", "表演 / 舞蹈 / 调度", "人物目标、微表情、走位、舞段和动作块"),
  camera_lighting_color: resource("camera_lighting_color", "摄影 / 灯光 / 色彩", "镜头语法、镜头组、光线、色彩与曝光保护"),
  voice_dialogue: resource("voice_dialogue", "对白 / 旁白 / 声线", "角色声线、口播、旁白、对白版本和口型"),
  music: resource("music", "音乐与母带", "曲目、节拍、情绪曲线、授权与母带版本"),
  sound: resource("sound", "环境声与音效", "环境声、拟音、特殊音效、静默和混音要求"),
  graphics_titles: resource("graphics_titles", "字幕 / 字幕包装 / 图形", "片名、角标、动效字、歌词、数据图和安全区"),
  vfx_stunt: resource("vfx_stunt", "视效 / 特技 / 高风险动作", "视效镜头、动作阶段、威亚、替身和安全约束"),
  continuity: resource("continuity", "连续性与状态账", "人物、道具、服化、空间、轴线和跨集状态"),
  vehicles_animals: resource("vehicles_animals", "车辆 / 动物 / 特殊主体", "额外身份、动作、安全和拍摄约束", { minimum: 0 }),
  source_footage: resource("source_footage", "素材与实拍源文件", "原始视频、采访、B-roll、扫描件和代理文件"),
  archive_research: resource("archive_research", "档案与调研", "史料、出处、文化研究和事实核验"),
  animation_assets: resource("animation_assets", "动画资产", "角色模型、场景、绑定、材质、缓存和版本"),
  schedule_team: resource("schedule_team", "排期 / 团队 / 供应", "拍摄日、工种、设备、供应商和责任人"),
  rights_releases: resource("rights_releases", "版权 / 肖像 / 授权", "音乐、人物、地点、商标、素材和合同状态"),
  campaign_claims: resource("campaign_claims", "传播主张与合规", "卖点、证据、禁用词、法务意见和免责声明"),
  song_timeline: resource("song_timeline", "歌曲时间线", "歌词、段落、节拍点、表演块和画面锚点"),
  account_series: resource("account_series", "账号 / 栏目 / 发布计划", "账号人设、系列母题、单条编号和更新节奏"),
  episode_tracker: resource("episode_tracker", "季 / 集生产台账", "每集剧本、资产、镜头、生成、审阅和交付状态"),
  edit_master: resource("edit_master", "剪辑 / 调色 / 混音 / 母版", "时间线、锁画、调色、混音、字幕与母版"),
  deliverables: resource("deliverables", "版本与交付规格", "时长、画幅、语言、平台、码率、水印和文件命名"),
  platform_publishing: resource("platform_publishing", "平台发布与运营", "封面、标题、文案、话题、披露、排期和数据回流")
});

const useResources = (...ids) => Object.freeze(ids.map((id) => CINEMATIC_RESOURCE_CATALOG[id]));
const profile = (label, hierarchy, quantities, resourceIds) => Object.freeze({
  label,
  hierarchy: Object.freeze(hierarchy),
  quantityDimensions: Object.freeze(quantities),
  resources: useResources(...resourceIds)
});

const FILM_RESOURCES = ["story", "character", "scene", "prop", "wardrobe_makeup_hair", "performance_choreography", "camera_lighting_color", "voice_dialogue", "music", "sound", "vfx_stunt", "continuity", "vehicles_animals", "schedule_team", "rights_releases", "edit_master", "deliverables"];
const SERIES_RESOURCES = [...FILM_RESOURCES.slice(0, 14), "episode_tracker", "rights_releases", "edit_master", "deliverables"];

export const CINEMATIC_PROJECT_PROFILES = Object.freeze({
  feature_film: profile("电影长片", ["影片", "幕", "段落", "场", "镜头", "生成单元", "母版"], ["幕数", "段落数", "场数", "镜头数", "生成单元数", "拍摄日", "母版数"], FILM_RESOURCES),
  short_film: profile("电影短片", ["影片", "幕", "场", "镜头", "生成单元", "母版"], ["幕数", "场数", "镜头数", "生成单元数", "拍摄日", "母版数"], FILM_RESOURCES),
  episodic_series: profile("剧集", ["系列", "季", "集", "场", "镜头", "生成单元", "单集交付"], ["季数", "集数", "每集场数", "每集镜头数", "生成单元数", "拍摄日", "单集交付数"], SERIES_RESOURCES),
  short_drama: profile("短剧", ["系列", "季", "集", "场", "镜头", "生成单元", "单集交付"], ["季数", "集数", "每集场数", "每集镜头数", "付费卡点数", "生成单元数", "单集交付数"], [...SERIES_RESOURCES, "platform_publishing"]),
  commercial: profile("广告", ["Campaign", "创意概念", "主片", "剪辑版本", "投放位", "交付件"], ["创意概念数", "主片数", "时长版本数", "画幅版本数", "语言版本数", "投放位数", "交付件数"], ["story", "character", "scene", "prop", "brand_product", "wardrobe_makeup_hair", "performance_choreography", "camera_lighting_color", "voice_dialogue", "music", "sound", "graphics_titles", "vfx_stunt", "schedule_team", "rights_releases", "campaign_claims", "edit_master", "deliverables"]),
  music_video: profile("MV", ["曲目", "歌曲段落", "表演 / 叙事块", "场景设置", "镜头", "母版"], ["曲目版本数", "歌曲段落数", "表演块数", "造型数", "场景设置数", "镜头数", "母版数"], ["story", "character", "scene", "prop", "wardrobe_makeup_hair", "performance_choreography", "camera_lighting_color", "song_timeline", "music", "sound", "graphics_titles", "vfx_stunt", "continuity", "schedule_team", "rights_releases", "edit_master", "deliverables"]),
  documentary: profile("纪录片", ["项目", "章节", "人物 / 事件", "采访 / 档案", "场", "镜头", "母版"], ["章节数", "采访人数", "采访次数", "档案条目数", "B-roll 组数", "镜头数", "母版数"], ["story", "character", "scene", "prop", "camera_lighting_color", "voice_dialogue", "music", "sound", "source_footage", "archive_research", "continuity", "schedule_team", "rights_releases", "graphics_titles", "edit_master", "deliverables"]),
  animation: profile("动画", ["影片 / 系列", "集 / 段落", "场", "镜头", "资产", "动画 / 渲染", "母版"], ["集数", "段落数", "场数", "镜头数", "角色资产数", "场景资产数", "渲染任务数", "母版数"], ["story", "character", "scene", "prop", "wardrobe_makeup_hair", "performance_choreography", "camera_lighting_color", "voice_dialogue", "music", "sound", "animation_assets", "vfx_stunt", "continuity", "rights_releases", "edit_master", "deliverables"]),
  trailer: profile("预告片", ["Campaign", "剪辑概念", "叙事节拍", "镜头", "版本", "投放位"], ["剪辑概念数", "叙事节拍数", "镜头数", "时长版本数", "画幅版本数", "语言版本数", "投放位数"], ["story", "character", "scene", "prop", "camera_lighting_color", "voice_dialogue", "music", "sound", "graphics_titles", "source_footage", "rights_releases", "campaign_claims", "edit_master", "deliverables", "platform_publishing"]),
  social_video: profile("账号短视频", ["账号", "栏目 / 系列", "单条", "场", "镜头", "平台版本", "发布记录"], ["账号数", "栏目数", "计划条数", "已发布条数", "角色数", "常驻场景数", "单条镜头数", "平台版本数"], ["account_series", "story", "character", "scene", "prop", "wardrobe_makeup_hair", "performance_choreography", "camera_lighting_color", "voice_dialogue", "music", "sound", "graphics_titles", "continuity", "schedule_team", "rights_releases", "edit_master", "deliverables", "platform_publishing"])
});

export function projectProfileFor(projectType) {
  return CINEMATIC_PROJECT_PROFILES[projectType] || CINEMATIC_PROJECT_PROFILES.short_film;
}

function objectCount(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? Object.keys(value).filter((key) => value[key] !== "" && value[key] != null).length : 0;
}

function plannedOverride(production, id) {
  const value = production?.legacyExtensions?.resourcePlan?.[id];
  return Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : null;
}

export function productionResourceSummary({ production, storyPacket, visualBible, assetAuthorities = [] }) {
  const profileValue = projectProfileFor(production?.projectType);
  const authoritiesByType = (type) => assetAuthorities.filter((item) => item.authorityType === type);
  const acceptedByType = (type) => authoritiesByType(type).filter((item) => item.status === "accepted").length;
  const offCameraCharacters = (storyPacket?.characters || []).filter((character) => /(不露脸|镜头外|持镜者|off.?camera)/iu.test(Object.values(character || {}).filter((value) => typeof value === "string").join(" "))).length;
  const derived = {
    story: storyPacket ? 1 : 0,
    character: Math.max(storyPacket?.characters?.length || 0, authoritiesByType("character").length),
    scene: authoritiesByType("scene").length,
    prop: Math.max(objectCount(visualBible?.propSemantics), authoritiesByType("prop").length),
    wardrobe_makeup_hair: objectCount(visualBible?.costumeNarrative),
    camera_lighting_color: visualBible ? 1 : 0,
    performance_choreography: objectCount(visualBible?.performance),
    voice_dialogue: storyPacket?.dialogue?.length || 0,
    music: visualBible?.sound?.musicPrinciple ? 1 : 0,
    sound: objectCount(visualBible?.sound),
    vfx_stunt: objectCount(visualBible?.vfx),
    continuity: visualBible?.continuityLocks?.length || 0
  };
  return profileValue.resources.map((entry) => {
    const recorded = derived[entry.id] || 0;
    const planned = plannedOverride(production, entry.id) ?? Math.max(entry.minimum, recorded);
    const confirmed = entry.id === "character" ? Math.min(planned, acceptedByType("character") + offCameraCharacters) : entry.authorityType ? acceptedByType(entry.authorityType) : recorded;
    return { ...entry, planned, recorded, confirmed, missing: Math.max(0, planned - confirmed) };
  });
}
