import { resolveCinematicAbstractIntent } from "./cinematic-abstract-intent-policy.mjs";

export const CINEMATIC_DIRECTOR_PROMPT_FIELDS = Object.freeze([
  "special_attention",
  "material_anchors",
  "continuity_declaration",
  "scene_anchor",
  "camera_track",
  "performance_track",
  "lighting_color_track",
  "sound_track",
  "hard_locks",
  "dialogue_timing",
  "end_state_handoff"
]);

function record(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value) {
  return typeof value === "string" ? value.replace(/\s+/gu, " ").trim() : "";
}

function render(value) {
  if (Array.isArray(value)) return value.map(render).filter(Boolean).join("；");
  if (record(value)) return Object.entries(value).flatMap(([key, entry]) => {
    const valueText = render(entry);
    return valueText ? [`${key}=${valueText}`] : [];
  }).join("；");
  return text(String(value ?? ""));
}

function clause(sourcePath, value) {
  const rendered = render(value);
  return rendered ? { sourcePath, text: rendered } : null;
}

function clauses(...entries) {
  const seen = new Set();
  return entries.flat().filter(Boolean).filter((entry) => {
    const key = entry.text;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dialogueCharacters(dialogue) {
  return (Array.isArray(dialogue) ? dialogue : []).reduce((total, entry) => {
    const value = typeof entry === "string" ? entry : entry?.text;
    return total + text(value).replace(/\s+/gu, "").length;
  }, 0);
}

function promptMode(generationUnit, shots) {
  const explicit = generationUnit?.promptCompilationIntent;
  if (explicit === "review") return { code: "A", reason: "explicit_review" };
  const highComplexity = explicit === "high_complexity"
    || ["designed_multi_shot", "storyboard_action_sequence"].includes(generationUnit?.strategy)
    || shots.length > 1
    || shots.some((shot) => /(?:打斗|追逐|群像|环绕|复合|高速)/u.test(render([
      shot?.narrativeJob,
      shot?.actionChain,
      shot?.cinematography?.movementPath
    ])));
  return highComplexity
    ? { code: "B", reason: explicit === "high_complexity" ? "explicit_high_complexity" : "derived_high_complexity" }
    : { code: "C", reason: "deterministic_default" };
}

function fieldMap({ generationUnit, referenceBindings, shots, storyPacket, visualBible }) {
  const first = shots[0] ?? {};
  const last = shots.at(-1) ?? {};
  const allDialogue = shots.flatMap((shot) => Array.isArray(shot?.dialogue) ? shot.dialogue : []);
  const durationSeconds = Number(generationUnit?.generationParameters?.duration);
  return {
    special_attention: clauses(
      clause("shots[].narrativeJob", shots.map((shot) => shot?.narrativeJob)),
      clause("shots[].acceptanceCriteria", shots.flatMap((shot) => shot?.acceptanceCriteria ?? []))
    ),
    material_anchors: clauses(
      clause("referenceBindings[].controls", referenceBindings.map((binding) => ({
        name: binding?.promptAlias ?? binding?.displayName,
        controls: binding?.controls,
        doesNotControl: binding?.doesNotControl
      }))),
      clause("visualBible.productionDesign", visualBible?.productionDesign),
      clause("visualBible.characterLook", visualBible?.characterLook)
    ),
    continuity_declaration: clauses(
      clause("generationUnit.sequenceState", generationUnit?.sequenceState),
      clause("generationUnit.continuityBoundary", generationUnit?.continuityBoundary),
      clause("shots[].editContinuity", shots.map((shot) => shot?.editContinuity))
    ),
    scene_anchor: clauses(
      clause("visualBible.productionDesign", visualBible?.productionDesign),
      clause("visualBible.spatialDramaturgy", visualBible?.spatialDramaturgy),
      clause("shots[].blocking", shots.map((shot) => shot?.blocking))
    ),
    camera_track: clauses(
      clause("visualBible.cinematography.lensPreference", visualBible?.cinematography?.lensPreference),
      clause("shots[].cinematography", shots.map((shot) => shot?.cinematography)),
      clause("shots[].cameraTrajectoryPlan", shots.map((shot) => shot?.cameraTrajectoryPlan ?? shot?.orbitCameraTrajectory))
    ),
    performance_track: clauses(
      clause("shots[].openingState", shots.map((shot) => shot?.openingState)),
      clause("shots[].actionChain", shots.map((shot) => shot?.actionChain)),
      clause("shots[].performance", shots.map((shot) => shot?.performance))
    ),
    lighting_color_track: clauses(
      clause("visualBible.lighting", visualBible?.lighting),
      clause("visualBible.color", visualBible?.color),
      clause("shots[].lighting", shots.map((shot) => shot?.lighting)),
      clause("shots[].color", shots.map((shot) => shot?.color))
    ),
    sound_track: clauses(
      clause("visualBible.sound", visualBible?.sound),
      clause("shots[].sound", shots.map((shot) => shot?.sound))
    ),
    hard_locks: clauses(
      clause("storyPacket.lockedStoryFacts", storyPacket?.lockedStoryFacts),
      clause("storyPacket.userLockedText", storyPacket?.userLockedText),
      clause("shots[].mustNotAppearYet", shots.flatMap((shot) => shot?.mustNotAppearYet ?? [])),
      clause("shots[].negativeConstraints", shots.flatMap((shot) => shot?.negativeConstraints ?? [])),
      clause("generationUnit.highRiskNegatives", generationUnit?.highRiskNegatives)
    ),
    dialogue_timing: clauses(
      clause("generationUnit.generationParameters.duration", Number.isFinite(durationSeconds) ? `${durationSeconds}秒` : ""),
      clause("shots[].dialogue", allDialogue)
    ),
    end_state_handoff: clauses(
      clause("shots[].endingState", last?.endingState),
      clause("shots[].nextHandoff", last?.nextHandoff),
      clause("generationUnit.sequenceState.plannedEndState", generationUnit?.sequenceState?.plannedEndState),
      clause("generationUnit.segmentDecision", generationUnit?.segmentDecision)
    ),
    _dialogueMetrics: {
      characters: dialogueCharacters(allDialogue),
      durationSeconds,
      charactersPerSecond: durationSeconds > 0
        ? Number((dialogueCharacters(allDialogue) / durationSeconds).toFixed(2))
        : null
    },
    _entry: first?.openingState ?? null
  };
}

export function compileCinematicDirectorPromptPolicy({
  generationUnit = {},
  providerCapability = null,
  referenceBindings = [],
  shots = [],
  storyPacket = {},
  visualBible = {}
} = {}) {
  const mode = promptMode(generationUnit, shots);
  const mapped = fieldMap({ generationUnit, referenceBindings, shots, storyPacket, visualBible });
  const fields = Object.fromEntries(CINEMATIC_DIRECTOR_PROMPT_FIELDS.map((field) => [
    field,
    { clauses: mapped[field], ok: mapped[field].length > 0 }
  ]));
  const missingFields = CINEMATIC_DIRECTOR_PROMPT_FIELDS.filter((field) => !fields[field].ok);
  const abstractIntent = resolveCinematicAbstractIntent({ shots, target: "video", visualBible });
  const errors = [...abstractIntent.errors];
  if (generationUnit?.executionGates?.requireDirectorPromptCoverage === true && missingFields.length) {
    errors.push({
      code: "director_prompt_field_unresolved",
      message: `导演 Prompt 11 字段未完整解析：${missingFields.join("、")}。`,
      missingFields
    });
  }
  if ((generationUnit?.executionGates?.requireDialogueTimingAudit === true
    || generationUnit?.executionGates?.requireDirectorPromptCoverage === true)
    && mapped._dialogueMetrics.charactersPerSecond > 6) {
    errors.push({
      code: "dialogue_density_over_6_chars_per_second",
      message: "台词字数超过当前段时长可承载上限；必须调整台词或段时长。",
      ...mapped._dialogueMetrics
    });
  }
  return {
    version: "cinematic_director_prompt_policy_v1",
    promptMode: mode,
    providerAdapter: {
      orderedMaterialAliases: [...referenceBindings]
        .sort((left, right) => Number(left?.providerIndex) - Number(right?.providerIndex))
        .map((binding) => ({
          alias: text(binding?.promptAlias ?? binding?.displayName),
          providerIndex: binding?.providerIndex ?? null,
          role: binding?.role ?? "reference"
        })),
      referenceCount: referenceBindings.length
        + (Array.isArray(generationUnit?.generationParameters?.virtualPersonAssetIds)
          ? generationUnit.generationParameters.virtualPersonAssetIds.length
          : 0),
      referenceLimit: providerCapability?.maxReferenceImages ?? null,
      sourceTemplateCharacterRange: { min: 1900, max: 2000 },
      textLengthPolicy: "provider_capability_bound_no_padding",
      deterministicCompression: true
    },
    fields,
    missingFields,
    dialogueMetrics: mapped._dialogueMetrics,
    abstractIntent,
    errors,
    ok: errors.length === 0
  };
}
