const ABSTRACT_LABELS = Object.freeze([
  { label: "精美", pattern: /精美/u },
  { label: "电影感", pattern: /电影(?:感|级)/u },
  { label: "高级", pattern: /高级(?:感)?/u },
  { label: "悬疑", pattern: /悬疑(?:感|氛围)?/u }
]);

const DOMAIN_LABELS = Object.freeze({
  material_production_design: "材质与生产设计",
  lens_aperture_focus: "焦段、光圈与焦点",
  camera_composition_motion: "机位、构图与运动",
  motivated_lighting: "光向、明暗比、色温与曝光",
  performance_micro_actions: "表演微动作",
  sound: "声音",
  prohibitions: "禁止项"
});

const IMAGE_DOMAINS = Object.freeze([
  "material_production_design",
  "lens_aperture_focus",
  "camera_composition_motion",
  "motivated_lighting",
  "prohibitions"
]);

const VIDEO_DOMAINS = Object.freeze([
  ...IMAGE_DOMAINS.slice(0, 4),
  "performance_micro_actions",
  "sound",
  "prohibitions"
]);

const IMAGE_FACETS = Object.freeze([
  "materials",
  "production_design",
  "focal_length",
  "aperture",
  "focus",
  "camera_placement",
  "composition",
  "light_direction",
  "contrast",
  "color_temperature",
  "exposure",
  "prohibitions"
]);

const VIDEO_FACETS = Object.freeze([
  ...IMAGE_FACETS.slice(0, 7),
  "camera_movement",
  ...IMAGE_FACETS.slice(7, -1),
  "performance",
  "sound",
  "prohibitions"
]);

function record(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value) {
  return typeof value === "string" ? value.replace(/\s+/gu, " ").trim() : "";
}

function values(value) {
  if (Array.isArray(value)) return value.flatMap(values);
  if (record(value)) return Object.values(value).flatMap(values);
  const normalized = text(value);
  return normalized ? [normalized] : [];
}

function abstractOnly(value) {
  const normalized = text(value);
  if (!normalized) return "";
  const stripped = ABSTRACT_LABELS.reduce(
    (current, entry) => current.replace(entry.pattern, ""),
    normalized
  ).replace(/[，、；,;|\s]+/gu, "");
  return stripped.length === 0 ? "" : normalized;
}

function addClauses(target, domain, facet, sourcePath, value) {
  for (const clause of values(value).map(abstractOnly).filter(Boolean)) {
    target.push({ clause, domain, facet, sourcePath });
  }
}

function uniqueClauses(clauses) {
  const seen = new Set();
  return clauses.filter((entry) => {
    const key = `${entry.domain}\u0000${entry.facet}\u0000${entry.clause}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function labelSources({ authority, shots, visualBible }) {
  const candidates = [
    ["visualBible.abstractIntentLabels", visualBible?.abstractIntentLabels],
    ["visualBible.cinematography.grammar", visualBible?.cinematography?.grammar],
    ["visualBible.cinematography.intent", visualBible?.cinematography?.intent],
    ["visualBible.styleTags", visualBible?.styleTags],
    ["authority.abstractIntentLabels", authority?.abstractIntentLabels],
    ["authority.styleIntent", authority?.styleIntent]
  ];
  for (const [index, shot] of (Array.isArray(shots) ? shots : []).entries()) {
    candidates.push(
      [`shots[${index}].abstractIntentLabels`, shot?.abstractIntentLabels],
      [`shots[${index}].cinematicIntent`, shot?.cinematicIntent],
      [`shots[${index}].styleIntent`, shot?.styleIntent]
    );
  }
  return candidates.flatMap(([sourcePath, value]) => values(value).flatMap((sourceValue) =>
    ABSTRACT_LABELS.filter((entry) => entry.pattern.test(sourceValue)).map((entry) => ({
      label: entry.label,
      sourcePath,
      sourceValue
    }))
  ));
}

function supportClauses({ authority, shots, visualBible }) {
  const clauses = [];
  addClauses(clauses, "material_production_design", "production_design", "visualBible.productionDesign.architecture", visualBible?.productionDesign?.architecture);
  addClauses(clauses, "material_production_design", "materials", "visualBible.productionDesign.materials", visualBible?.productionDesign?.materials);
  addClauses(clauses, "material_production_design", "materials", "visualBible.characterLook", visualBible?.characterLook);
  addClauses(clauses, "material_production_design", "materials", "authority.materials", authority?.materials ?? authority?.material);
  addClauses(clauses, "material_production_design", "production_design", "authority.architecture", authority?.architecture);
  addClauses(clauses, "lens_aperture_focus", "focal_length", "visualBible.cinematography.lensPreference", visualBible?.cinematography?.lensPreference);
  addClauses(clauses, "lens_aperture_focus", "aperture", "visualBible.cinematography.aperture", visualBible?.cinematography?.aperture);
  addClauses(clauses, "lens_aperture_focus", "focus", "visualBible.cinematography.focus", visualBible?.cinematography?.focus ?? visualBible?.cinematography?.depthOfField);
  addClauses(clauses, "camera_composition_motion", "camera_placement", "visualBible.cinematography.cameraPlacement", visualBible?.cinematography?.cameraPlacement);
  addClauses(clauses, "camera_composition_motion", "composition", "visualBible.cinematography.composition", visualBible?.cinematography?.composition);
  addClauses(clauses, "motivated_lighting", "light_direction", "visualBible.lighting.direction", visualBible?.lighting?.direction);
  addClauses(clauses, "motivated_lighting", "contrast", "visualBible.lighting.contrast", visualBible?.lighting?.contrast);
  addClauses(clauses, "motivated_lighting", "color_temperature", "visualBible.lighting.colorTemperature", visualBible?.lighting?.colorTemperature);
  addClauses(clauses, "motivated_lighting", "exposure", "visualBible.lighting.exposureProtection", visualBible?.lighting?.exposureProtection);
  addClauses(clauses, "camera_composition_motion", "composition", "visualBible.spatialDramaturgy", visualBible?.spatialDramaturgy);
  addClauses(clauses, "sound", "sound", "visualBible.sound", visualBible?.sound);
  addClauses(clauses, "prohibitions", "prohibitions", "visualBible.styleProhibitions", visualBible?.styleProhibitions);
  for (const [index, shot] of (Array.isArray(shots) ? shots : []).entries()) {
    const camera = shot?.cinematography ?? {};
    addClauses(clauses, "material_production_design", "materials", `shots[${index}].blocking.props`, shot?.blocking?.props);
    addClauses(clauses, "lens_aperture_focus", "focal_length", `shots[${index}].cinematography.focalLength`, camera.focalLength ?? camera.perspective);
    addClauses(clauses, "lens_aperture_focus", "aperture", `shots[${index}].cinematography.aperture`, camera.aperture);
    addClauses(clauses, "lens_aperture_focus", "focus", `shots[${index}].cinematography.focus`, camera.focusPlan ?? camera.focus ?? camera.depthOfField);
    addClauses(clauses, "camera_composition_motion", "camera_placement", `shots[${index}].cinematography.cameraPlacement`, camera.cameraPlacement ?? camera.cameraPosition);
    addClauses(clauses, "camera_composition_motion", "composition", `shots[${index}].cinematography.composition`, camera.composition ?? camera.shotSize);
    addClauses(clauses, "camera_composition_motion", "camera_movement", `shots[${index}].cinematography.movementPath`, {
      movementPath: camera.movementPath,
      speedCurve: camera.speedCurve,
      startPoint: camera.startPoint,
      stopPoint: camera.stopPoint
    });
    addClauses(clauses, "motivated_lighting", "light_direction", `shots[${index}].lighting.direction`, shot?.lighting?.direction ?? shot?.lighting?.source);
    addClauses(clauses, "motivated_lighting", "contrast", `shots[${index}].lighting.contrast`, shot?.lighting?.contrast);
    addClauses(clauses, "motivated_lighting", "color_temperature", `shots[${index}].lighting.colorTemperature`, shot?.lighting?.colorTemperature);
    addClauses(clauses, "motivated_lighting", "exposure", `shots[${index}].lighting.exposureProtection`, shot?.lighting?.exposureProtection);
    addClauses(clauses, "performance_micro_actions", "performance", `shots[${index}].performance`, shot?.performance);
    addClauses(clauses, "performance_micro_actions", "performance", `shots[${index}].actionChain`, shot?.actionChain);
    addClauses(clauses, "sound", "sound", `shots[${index}].sound`, shot?.sound);
    addClauses(clauses, "prohibitions", "prohibitions", `shots[${index}].negativeConstraints`, shot?.negativeConstraints);
    addClauses(clauses, "prohibitions", "prohibitions", `shots[${index}].mustNotAppearYet`, shot?.mustNotAppearYet);
  }
  return uniqueClauses(clauses);
}

export function stripAbstractCinematicIntentLabels(value) {
  return ABSTRACT_LABELS.reduce(
    (current, entry) => current.replace(new RegExp(entry.pattern.source, "gu"), ""),
    text(value)
  ).replace(/\s*([，、；,;])\s*(?=\1|$)/gu, "").replace(/^[，、；,;\s]+|[，、；,;\s]+$/gu, "").trim();
}

export function resolveCinematicAbstractIntent({
  authority = null,
  shots = [],
  target = "video",
  visualBible = null
} = {}) {
  const sources = labelSources({ authority, shots, visualBible });
  const labels = [...new Set(sources.map((entry) => entry.label))];
  const domains = target === "image" ? IMAGE_DOMAINS : VIDEO_DOMAINS;
  const requiredFacets = target === "image" ? IMAGE_FACETS : VIDEO_FACETS;
  const clauses = supportClauses({ authority, shots, visualBible })
    .filter((entry) => domains.includes(entry.domain));
  const missingDomains = labels.length
    ? domains.filter((domain) => !clauses.some((entry) => entry.domain === domain))
    : [];
  const missingFacets = labels.length
    ? requiredFacets.filter((facet) => !clauses.some((entry) => entry.facet === facet))
    : [];
  const errors = missingFacets.length ? [{
    code: "abstract_cinematic_intent_unresolved",
    message: `抽象意图 ${labels.join("、")} 缺少可见/可测结构化支撑：${missingFacets.join("、")}。`,
    labels,
    missingDomains,
    missingFacets
  }] : [];
  const providerClauses = labels.length ? domains.flatMap((domain) => {
    const domainClauses = clauses.filter((entry) => entry.domain === domain);
    return domainClauses.length
      ? [`${DOMAIN_LABELS[domain]}：${domainClauses.map((entry) => entry.clause).join("；")}。`]
      : [];
  }) : [];
  return {
    version: "cinematic_abstract_intent_resolution_v1",
    target,
    labels,
    sources,
    clauses,
    providerClauses,
    requiredDomains: domains,
    requiredFacets,
    missingDomains,
    missingFacets,
    errors,
    ok: errors.length === 0
  };
}
