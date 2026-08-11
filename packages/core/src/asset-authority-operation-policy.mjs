import { UnuTvError } from "@ununu/unutv-contracts";

const PAGE_SIZE_MAX = 100;
const RISK_ORDER = Object.freeze({ low: 0, medium: 1, high: 2, critical: 3 });

function text(value) { return typeof value === "string" ? value.trim() : ""; }
function words(value) { return Array.isArray(value) ? value.map(text).filter(Boolean) : []; }
function recordText(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  return Object.values(value).flatMap((entry) => typeof entry === "string" ? [entry.trim()] : []).filter(Boolean).join("；");
}

function namedAssetEntries(value) {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => {
      if (typeof entry === "string" && entry.trim()) return [{ displayName: entry.trim() }];
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
      const displayName = text(entry.displayName ?? entry.name ?? entry.label ?? entry.id);
      return displayName ? [{ ...entry, displayName }] : [];
    });
  }
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, entry]) => {
    if (entry === false || entry === null) return [];
    if (typeof entry === "string") return [{ displayName: key, description: entry }];
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      return [{ ...entry, displayName: text(entry.displayName ?? entry.name ?? entry.label) || key }];
    }
    return [{ displayName: key }];
  });
}

function conciseLocationName(value) {
  const location = text(value);
  if (!location) return "";
  return location.split(/[：:；;\n]/u).map((entry) => entry.trim()).find(Boolean) || location;
}

function canonicalPropName(value) {
  return text(value)
    .replace(/^(?:单实例|唯一(?:一只|一个|一件)?|同一只|同一个)\s*/u, "")
    .replace(/\s+/gu, "")
    .toLocaleLowerCase();
}

function characterLookFor(visualBible, displayName) {
  const look = visualBible?.characterLook;
  if (!look || typeof look !== "object" || Array.isArray(look)) return {};
  if (!Object.prototype.hasOwnProperty.call(look, displayName)) return look;
  const named = look[displayName];
  return named && typeof named === "object" && !Array.isArray(named) ? named : { description: text(named) };
}

export function searchAssetAuthorityPage(authorities, input = {}) {
  const page = Math.max(1, Number.parseInt(input.page ?? 1, 10) || 1);
  const pageSize = Math.min(PAGE_SIZE_MAX, Math.max(1, Number.parseInt(input.pageSize ?? 24, 10) || 24));
  const query = text(input.query).toLocaleLowerCase();
  const types = new Set(Array.isArray(input.authorityTypes) ? input.authorityTypes : input.authorityType ? [input.authorityType] : []);
  const statuses = new Set(Array.isArray(input.statuses) ? input.statuses : input.status ? [input.status] : []);
  const riskLevels = new Set(Array.isArray(input.riskLevels) ? input.riskLevels : input.riskLevel ? [input.riskLevel] : []);
  const filtered = authorities.filter((authority) => {
    if (types.size && !types.has(authority.authorityType)) return false;
    if (statuses.size && !statuses.has(authority.status)) return false;
    if (riskLevels.size && !riskLevels.has(authority.riskLevel)) return false;
    if (!query) return true;
    return JSON.stringify({
      displayName: authority.displayName,
      identityDescription: authority.identityDescription,
      architecture: authority.architecture,
      materials: authority.materials,
      narrativeFunction: authority.narrativeFunction,
      referenceAssetIds: authority.referenceAssetIds
    }).toLocaleLowerCase().includes(query);
  });
  const sort = input.sort ?? "updated_desc";
  filtered.sort((left, right) => {
    if (sort === "name_asc") return String(left.displayName).localeCompare(String(right.displayName), "zh-CN");
    if (sort === "risk_desc") return (RISK_ORDER[right.riskLevel] ?? -1) - (RISK_ORDER[left.riskLevel] ?? -1) || String(left.displayName).localeCompare(String(right.displayName), "zh-CN");
    return String(right.updatedAt ?? "").localeCompare(String(left.updatedAt ?? ""));
  });
  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const resolvedPage = Math.min(page, pageCount);
  const offset = (resolvedPage - 1) * pageSize;
  return { items: filtered.slice(offset, offset + pageSize), page: resolvedPage, pageSize, pageCount, total };
}

function view(label, description, controls) {
  return {
    viewId: "identity-front",
    label,
    framing: "半身或能完整判断资产形态的构图",
    angle: "正面平视",
    description,
    background: "中性、无干扰、不得引入未批准叙事元素",
    controls,
    doesNotControl: ["最终镜头表演", "最终镜头灯光", "未写入合同的外观细节"],
    required: true
  };
}

function common(authorityType, displayName, riskLevel, description) {
  return {
    authorityType,
    displayName,
    riskLevel,
    status: "candidate",
    viewSpecs: [view("候选权威基准视图", description, [`${displayName}的可验收连续性`])],
    referenceAssetIds: [],
    acceptanceCriteria: ["仅确认剧作与视觉圣经已有事实；未知细节保持待确认"],
    prohibitedChanges: ["不得把候选自动升级为已确认权威"]
  };
}

export function deriveAssetAuthorityCandidates({ storyPacket, visualBible, shots = [], existingAuthorities = [], requirements = [] }) {
  if (!storyPacket || typeof storyPacket !== "object") throw new UnuTvError("story_packet_required", "StoryProductionPacket is required for authority derivation", 409);
  const existing = new Set(existingAuthorities.map((item) => `${item.authorityType}:${text(item.displayName).toLocaleLowerCase()}`));
  const risk = new Map(requirements.map((item) => [item.authorityType, item.riskLevel]));
  const candidates = [];
  for (const [index, character] of (storyPacket.characters ?? []).entries()) {
    const displayName = text(character.displayName ?? character.name ?? character.characterName ?? character.id) || `人物 ${index + 1}`;
    const facts = recordText(character);
    if (/(不露脸|镜头外|持镜者|off.?camera)/iu.test(facts) || existing.has(`character:${displayName.toLocaleLowerCase()}`)) continue;
    const identityDescription = facts || `剧作登记人物：${displayName}`;
    const virtualPersonAssetId = text(character.virtualPersonAssetId);
    candidates.push({
      ...common("character", displayName, risk.get("character") ?? "medium", identityDescription),
      ...(virtualPersonAssetId ? {
        status: "accepted",
        externalProviderIdentity: {
          provider: "ark",
          capability: "virtual_person_asset",
          assetId: virtualPersonAssetId,
          source: "owner_locked_episode_authoring"
        },
        acceptanceCriteria: [
          `${displayName} 必须使用 Owner 指定的 Seedance 虚拟人物资源`,
          "虚拟人物资源只锁身份外观，不控制站位、动作时序、摄影机或剪辑"
        ],
        prohibitedChanges: ["不得替换、混用或自动生成另一张脸"]
      } : {}),
      identityDescription,
      identityLocks: [displayName, ...words(storyPacket.lockedStoryFacts).filter((item) => item.includes(displayName))],
      wardrobeMakeupHair: characterLookFor(visualBible, displayName)
    });
  }
  const explicitScenes = [
    ...namedAssetEntries(storyPacket.assetRequirements?.scenes),
    ...namedAssetEntries(storyPacket.scenes),
    ...namedAssetEntries(storyPacket.locations)
  ];
  const productionLocation = text(visualBible?.productionDesign?.location ?? visualBible?.productionDesign?.setting);
  const sceneDisplayName = text(explicitScenes[0]?.displayName) || conciseLocationName(productionLocation) || text(storyPacket.scenePurpose);
  const sceneSignals = [
    text(explicitScenes[0]?.description),
    productionLocation,
    text(storyPacket.scenePurpose),
    recordText(visualBible?.productionDesign),
    ...shots.map((shot) => text(shot?.blocking?.positions))
  ].filter(Boolean);
  if (sceneDisplayName && sceneSignals.length && !existing.has(`scene:${sceneDisplayName.toLocaleLowerCase()}`)) {
    const displayName = sceneDisplayName;
    candidates.push({
      ...common("scene", displayName, risk.get("scene") ?? "medium", sceneSignals.join("；")),
      architecture: sceneSignals.join("；"),
      materials: recordText(visualBible?.productionDesign) || "待美术基于剧作事实确认",
      spatialLogic: {
        topologyRevision: "topology-r1",
        sourceSignals: sceneSignals,
        axisLocks: shots.map((shot) => text(shot?.editContinuity?.axis)).filter(Boolean)
      },
      lightingBaseline: visualBible?.lighting && typeof visualBible.lighting === "object" ? visualBible.lighting : {},
      palette: visualBible?.color && typeof visualBible.color === "object" ? visualBible.color : {}
    });
  }
  const explicitProps = [
    ...namedAssetEntries(storyPacket.assetRequirements?.props),
    ...namedAssetEntries(storyPacket.props),
    ...namedAssetEntries(visualBible?.propSemantics)
  ];
  const shotProps = shots.flatMap((shot) => text(shot?.blocking?.props).split(/[、，,；;]+/u).map((item) => item.trim()).filter(Boolean)).map((displayName) => ({ displayName }));
  const propsByName = new Map();
  for (const entry of [...explicitProps, ...shotProps]) {
    const key = canonicalPropName(entry.displayName);
    if (key && !propsByName.has(key)) propsByName.set(key, entry);
  }
  for (const prop of propsByName.values()) {
    const displayName = prop.displayName;
    if (existing.has(`prop:${displayName.toLocaleLowerCase()}`)) continue;
    candidates.push({
      ...common("prop", displayName, prop.riskLevel ?? risk.get("prop") ?? "medium", text(prop.description) || `剧作与美术资产清单明确涉及：${displayName}`),
      narrativeFunction: text(prop.narrativeFunction) || words(storyPacket.causalEventChain).find((item) => item.includes(displayName)) || `镜头调度涉及${displayName}，叙事功能待确认`,
      geometry: text(prop.geometry) || "待资产设计确认",
      material: text(prop.material) || "待资产设计确认",
      scale: text(prop.scale) || "以角色接触与场景空间为准，待确认",
      wearState: text(prop.wearState) || "待连续性确认",
      interactionRules: { shotIds: shots.filter((shot) => text(shot?.blocking?.props).includes(displayName)).map((shot) => shot.shotId) }
    });
  }
  return candidates;
}
