const EXACT_FOCAL_LENGTH_PATTERN = /^(?:[1-9]\d{0,2}(?:\.\d+)?)mm$/u;
const EXACT_APERTURE_PATTERN = /^f\/(?:0\.[1-9]\d*|[1-9]\d*(?:\.\d+)?)$/u;
const PLACEHOLDER_PATTERN = /^(?:auto|automatic|default|n\/a|none|same|tbd|todo|自动|默认|待定|同上)$/iu;
const INTERNAL_CUT_PATTERN = new RegExp([
  "硬切",
  "软切",
  "瞬切",
  "跳切",
  "切镜",
  "切到",
  "切至",
  "切回",
  "镜头切",
  "反打",
  "正反打",
  "组接",
  "匹配切",
  "遮挡切",
  "隐藏切",
  "隐形切",
  "无缝切",
  "多机位",
  "双机位",
  "两机位",
  "三机位",
  "主观(?:镜头)?\\s*(?:转|切|到|→|->)\\s*客观",
  "客观(?:镜头)?\\s*(?:转|切|到|→|->)\\s*主观",
  "\\b(?:hard|soft|smash|jump|match|hidden|invisible)\\s*cut\\b",
  "\\bcut(?:s|ting)?\\s+to\\b",
  "\\bshot\\s*[-/]?\\s*reverse\\s*[-/]?\\s*shot\\b",
  "\\breverse\\s+(?:angle|shot)\\b",
  "\\b(?:pov|subjective)\\s*(?:to|->|→)\\s*(?:objective|master)\\b",
  "\\b(?:objective|master)\\s*(?:to|->|→)\\s*(?:pov|subjective)\\b",
  "\\b(?:multi|two|three)[-\\s]*camera\\b",
  "(?:一号|1号|A)机位[\\s\\S]{0,80}(?:二号|2号|B)机位",
  "\\b(?:camera|cam)\\s*(?:a|1)\\b[\\s\\S]{0,80}\\b(?:camera|cam)\\s*(?:b|2)\\b"
].join("|"), "iu");
const EXECUTABLE_CAMERA_ROUTE_PATTERN = /(?:固定|静止|锁定|推近|推进|前移|拉远|后退|摇镜|摇摄|下摇|上摇|横移|侧移|跟移|跟拍|升高|降低|下降|弧移|弧线|环绕|轨道|手持|斯坦尼康|\bhold\b|\blocked[-\s]?off\b|\bfixed\b|\bdolly\b|\bpush\b|\bpull\b|\bpan\b|\btilt\b|\btrack\b|\btruck\b|\barc\b|\bcrane\b|\borbit\b|\bhandheld\b|\bsteadicam\b|\bpedestal\b)/iu;

const DIRECTOR04_FIELD_IDS = Object.freeze([
  "focal_length",
  "aperture",
  "focus_and_depth",
  "camera_position",
  "composition",
  "camera_behavior",
  "visible_performance",
  "exact_dialogue_and_tone",
  "motivated_lighting",
  "bidirectional_constraints",
  "next_state_handoff"
]);

const CAMERA_SEMANTIC_FIELDS = Object.freeze([
  "shotSize",
  "focalLength",
  "cameraPlacement",
  "cameraPosition",
  "angle",
  "perspective",
  "composition",
  "focusPlan",
  "focus",
  "movementPath",
  "speedCurve",
  "startPoint",
  "stopPoint"
]);

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function meaningfulText(value) {
  const normalized = text(value);
  return Boolean(normalized) && !PLACEHOLDER_PATTERN.test(normalized);
}

function textList(value) {
  return list(value).filter((entry) => meaningfulText(entry));
}

function validTemporalBeats(performance, duration) {
  const beats = list(performance.temporalBeats);
  if (!beats.length) return false;
  return beats.every((beat, index) => {
    const start = Number(beat?.startSeconds);
    const end = Number(beat?.endSeconds);
    const previousEnd = index > 0 ? Number(beats[index - 1]?.endSeconds) : 0;
    return Number.isFinite(start)
      && Number.isFinite(end)
      && start >= 0
      && end > start
      && (!Number.isFinite(duration) || end <= duration)
      && start >= previousEnd
      && meaningfulText(beat?.internalState)
      && meaningfulText(beat?.visibleEvidence);
  });
}

function validDialogueAndVoiceCues(payload, duration) {
  const dialogue = list(payload.dialogue);
  const voiceCues = list(object(payload.sound).voiceCues);
  if (!dialogue.length) return voiceCues.length === 0;
  if (voiceCues.length !== dialogue.length) return false;
  return dialogue.every((entry, index) => {
    const cue = object(voiceCues[index]);
    const cueStart = Number(cue.startSeconds);
    const cueEnd = Number(cue.endSeconds);
    return meaningfulText(entry?.speakerId)
      && meaningfulText(entry?.speakerType)
      && meaningfulText(entry?.speaker)
      && meaningfulText(entry?.text)
      && meaningfulText(entry?.intent)
      && meaningfulText(entry?.tone)
      && cue.speakerId === entry.speakerId
      && cue.speakerType === entry.speakerType
      && cue.text === entry.text
      && Number.isFinite(cueStart)
      && Number.isFinite(cueEnd)
      && cueStart >= 0
      && cueEnd > cueStart
      && (!Number.isFinite(duration) || cueEnd <= duration)
      && meaningfulText(cue.performance)
      && meaningfulText(cue.sync)
      && typeof cue.voiceAuthorityRequired === "boolean"
      && (entry.speakerType !== "character" || cue.voiceAuthorityRequired === true);
  });
}

function cameraSemanticsText(cinematography) {
  return CAMERA_SEMANTIC_FIELDS
    .map((field) => text(cinematography[field]))
    .filter(Boolean)
    .join("\n")
    .replace(
      /(?:不|不得|不要|没有|无|without|no)\s*(?:使用|采用|use|using)?\s*(?:任何)?\s*(?:硬切|软切|瞬切|跳切|切镜|匹配切|隐藏切|隐形切|cut(?:s|ting)?)/giu,
      ""
    );
}

function assessDirector04Contract(payload, duration) {
  const cinematography = object(payload.cinematography);
  const performance = object(payload.performance);
  const lighting = object(payload.lighting);
  const constraints = object(payload.constraints);
  const editContinuity = object(payload.editContinuity);
  const blocking = object(payload.blocking);
  const fieldIssues = {};
  const add = (fieldId, issue) => {
    if (!fieldIssues[fieldId]) fieldIssues[fieldId] = [];
    fieldIssues[fieldId].push(issue);
  };

  if (!EXACT_FOCAL_LENGTH_PATTERN.test(text(cinematography.focalLength))) {
    add("focal_length", "single_exact_focal_length_required");
  }
  if (!EXACT_APERTURE_PATTERN.test(text(cinematography.aperture))) {
    add("aperture", "exact_aperture_required");
  }
  if (
    !meaningfulText(cinematography.focusPlan)
    || !meaningfulText(cinematography.focus)
    || !meaningfulText(cinematography.depthOfField)
  ) {
    add("focus_and_depth", "focus_plan_focus_and_depth_of_field_required");
  }
  if (
    !meaningfulText(cinematography.cameraPlacement)
    || !meaningfulText(cinematography.cameraPosition)
    || !meaningfulText(cinematography.angle)
    || !meaningfulText(cinematography.startPoint)
    || !meaningfulText(cinematography.stopPoint)
  ) {
    add("camera_position", "camera_placement_position_angle_start_stop_required");
  }
  if (
    !meaningfulText(cinematography.shotSize)
    || !meaningfulText(cinematography.perspective)
    || !meaningfulText(cinematography.composition)
  ) {
    add("composition", "shot_size_perspective_and_composition_required");
  }
  if (!meaningfulText(cinematography.movementPath) || !meaningfulText(cinematography.speedCurve)) {
    add("camera_behavior", "movement_path_and_speed_curve_required");
  }
  if (
    meaningfulText(cinematography.movementPath)
    && !EXECUTABLE_CAMERA_ROUTE_PATTERN.test(cinematography.movementPath)
  ) {
    add("camera_behavior", "executable_single_camera_route_required");
  }
  if (INTERNAL_CUT_PATTERN.test(cameraSemanticsText(cinematography))) {
    add("camera_behavior", "single_continuous_camera_path_required");
  }
  if (
    !meaningfulText(performance.visibleEvidence)
    || !meaningfulText(performance.turningPoint)
    || !meaningfulText(performance.endState)
    || textList(performance.forbiddenActing).length !== list(performance.forbiddenActing).length
    || !list(performance.forbiddenActing).length
    || !validTemporalBeats(performance, duration)
  ) {
    add("visible_performance", "timed_visible_performance_semantics_required");
  }
  if (!validDialogueAndVoiceCues(payload, duration)) {
    add("exact_dialogue_and_tone", "dialogue_voice_cue_identity_tone_and_timing_required");
  }
  if (
    !meaningfulText(lighting.source)
    || !meaningfulText(lighting.direction)
    || !meaningfulText(lighting.contrast)
    || !meaningfulText(lighting.motivatedChange)
  ) {
    add("motivated_lighting", "source_direction_contrast_and_motivated_change_required");
  }
  if (
    !list(constraints.preserve).length
    || !list(constraints.forbid).length
    || !list(constraints.physics).length
    || textList(constraints.preserve).length !== list(constraints.preserve).length
    || textList(constraints.forbid).length !== list(constraints.forbid).length
    || textList(constraints.physics).length !== list(constraints.physics).length
  ) {
    add("bidirectional_constraints", "preserve_forbid_and_physics_constraints_required");
  }
  if (
    !meaningfulText(payload.openingState)
    || !meaningfulText(payload.endingState)
    || !meaningfulText(payload.nextHandoff)
    || !meaningfulText(editContinuity.entrance)
    || !meaningfulText(editContinuity.exit)
    || !meaningfulText(editContinuity.axis)
    || !meaningfulText(editContinuity.screenDirection)
    || !meaningfulText(editContinuity.cutIntent)
  ) {
    add("next_state_handoff", "opening_ending_handoff_and_boundary_semantics_required");
  }
  if (
    !meaningfulText(blocking.positions)
    || !list(blocking.actors).length
    || !list(blocking.props).length
    || !meaningfulText(blocking.axis)
    || !meaningfulText(blocking.contacts)
    || !meaningfulText(blocking.paths)
  ) {
    add("camera_position", "blocking_positions_actors_props_axis_contacts_and_paths_required");
  }

  return {
    fieldIssues,
    invalidFieldIds: DIRECTOR04_FIELD_IDS.filter((fieldId) => fieldIssues[fieldId]?.length),
    ok: Object.keys(fieldIssues).length === 0
  };
}

function spokenCharacters(dialogue) {
  return list(dialogue).reduce((total, entry) => {
    const line = typeof entry === "string" ? entry : entry?.text;
    return total + text(line).replace(/\s+/gu, "").length;
  }, 0);
}

export function assessCinematicShotFormation({ rows = [], targetDurationSeconds = null } = {}) {
  const errors = [];
  let durationTotal = 0;
  const normalized = [...list(rows)].sort((left, right) => Number(left?.orderIndex) - Number(right?.orderIndex));
  for (const [index, row] of normalized.entries()) {
    const payload = object(row?.payload);
    const rowId = row?.id ?? `row-${index + 1}`;
    const rowErrors = [];
    if (!text(payload.sceneId) && !text(payload.sceneNumber) && !Number.isFinite(payload.sceneNumber)) rowErrors.push("scene_id_required");
    if (!text(payload.beatId)) rowErrors.push("beat_id_required");
    if (!text(payload.narrativeJob)) rowErrors.push("narrative_job_required");
    if (!text(payload.shotBoundaryReason)) rowErrors.push("shot_boundary_reason_required");
    const duration = Number(payload.durationSeconds ?? payload.duration);
    if (!Number.isFinite(duration) || duration < 4 || duration > 15) rowErrors.push("generation_segment_duration_4_to_15_required");
    else durationTotal += duration;
    for (const field of ["openingState", "endingState", "nextHandoff"]) {
      if (!text(payload[field])) rowErrors.push(`${field}_required`);
    }
    for (const field of ["blocking", "lighting", "performance", "constraints"]) {
      if (!Object.keys(object(payload[field])).length && !list(payload[field]).length) rowErrors.push(`${field}_required`);
    }
    const director04 = assessDirector04Contract(payload, duration);
    if (!director04.ok) rowErrors.push("director04_11_field_contract_incomplete");
    const dialogue = list(payload.dialogue);
    const density = duration > 0 ? spokenCharacters(dialogue) / duration : 0;
    if (density > 6) rowErrors.push("dialogue_density_over_6_chars_per_second");
    if (rowErrors.length) errors.push({
      code: "shot_formation_row_incomplete",
      message: `${rowId} 不是可执行的导演镜头段；不得用默认值或普通剧本文字代替镜头形成决策。`,
      rowId,
      issues: rowErrors,
      director04FieldIssues: director04.fieldIssues,
      invalidDirector04FieldIds: director04.invalidFieldIds,
      speechCharactersPerSecond: Number(density.toFixed(2))
    });
  }
  for (let index = 2; index < normalized.length; index += 1) {
    const durations = normalized.slice(index - 2, index + 1).map((row) => Number(row?.payload?.durationSeconds ?? row?.payload?.duration));
    if (durations.every((duration) => Number.isFinite(duration) && duration === durations[0])) {
      errors.push({
        code: "mechanical_equal_duration_pattern",
        message: `连续三段均为 ${durations[0]} 秒；必须用情绪、故事和动作完成点解释节奏，不能机械等长。`,
        rowIds: normalized.slice(index - 2, index + 1).map((row) => row.id)
      });
    }
  }
  if (Number(targetDurationSeconds) > 0) {
    const delta = Math.abs(durationTotal - Number(targetDurationSeconds));
    if (delta > Math.max(4, Number(targetDurationSeconds) * 0.08)) {
      errors.push({
        code: "shot_duration_plan_mismatch",
        message: `镜头段合计 ${durationTotal} 秒，与目标 ${Number(targetDurationSeconds)} 秒不一致。`,
        durationTotal,
        targetDurationSeconds: Number(targetDurationSeconds)
      });
    }
  }
  return {
    durationTotal,
    errors,
    ok: errors.length === 0,
    rowCount: normalized.length
  };
}
