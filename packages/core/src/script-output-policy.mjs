function cleanText(value, fallback = "", maxLength = 4000) {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maxLength) : fallback;
}

function readValue(row, keys) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) return row[key];
  }
  return undefined;
}

function normalizeDuration(value) {
  if (typeof value === "number" && Number.isFinite(value)) return `${value}s`;
  const text = cleanText(value, "4s", 20);
  if (/^\d+(?:\.\d+)?$/.test(text)) return `${text}s`;
  return text;
}

function normalizeShotNumber(value, index) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : index + 1;
}

function normalizeGroupNumber(value, shotNumber) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return Math.max(1, Math.ceil(shotNumber / 4));
}

function normalizeSceneId(value) {
  const text = cleanText(value, "SC01", 40).toUpperCase();
  return /^SC\d{2,}$/.test(text) ? text : "SC01";
}

function durationMilliseconds(value) {
  const match = String(value ?? "").match(/\d+(?:\.\d+)?/);
  return Math.max(500, Math.round((match ? Number.parseFloat(match[0]) : 4) * 1000));
}

function normalizeTakeType(value) {
  return ["continuous_take", "一镜到底", "长镜头"].includes(cleanText(value, "", 40)) ? "continuous_take" : "standard_shot";
}

function defaultPerformanceBeat(durationMs, fallback) {
  return [{
    id: "beat-01",
    startMs: 0,
    endMs: durationMs,
    psychology: fallback.psychology,
    action: fallback.action,
    dialogue: fallback.dialogue,
    camera: fallback.camera,
    endState: fallback.endState
  }];
}

function normalizePerformanceBeats(value, durationMs, fallback) {
  if (!Array.isArray(value) || value.length === 0) return defaultPerformanceBeat(durationMs, fallback);
  const beats = value.slice(0, 20).flatMap((entry, index) => {
    if (!entry || typeof entry !== "object") return [];
    const startMs = Math.round(Number(entry.startMs));
    const endMs = Math.round(Number(entry.endMs));
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs < 0 || endMs <= startMs || endMs > durationMs) return [];
    return [{
      id: cleanText(entry.id, `beat-${String(index + 1).padStart(2, "0")}`, 80),
      startMs,
      endMs,
      psychology: cleanText(entry.psychology, fallback.psychology, 2400),
      action: cleanText(entry.action, fallback.action, 2400),
      dialogue: cleanText(entry.dialogue, "", 2000),
      camera: cleanText(entry.camera, fallback.camera, 2000),
      endState: cleanText(entry.endState, fallback.endState, 2400)
    }];
  });
  const contiguous = beats.length > 0
    && beats[0].startMs === 0
    && beats.every((beat, index) => index === 0 || beat.startMs === beats[index - 1].endMs)
    && beats.at(-1).endMs === durationMs;
  return contiguous ? beats : defaultPerformanceBeat(durationMs, fallback);
}

function normalizeRow(row, index) {
  const shotNumber = normalizeShotNumber(readValue(row, ["shotNumber", "shot", "镜号", "镜头"]), index);
  const sceneDescription = cleanText(readValue(row, ["sceneDescription", "plotDescription", "画面描述", "画面"]), `镜头 ${shotNumber}`, 6000);
  const duration = normalizeDuration(readValue(row, ["duration", "时长"]));
  const normalized = {
    id: cleanText(readValue(row, ["id", "rowId"]), `shot-${String(shotNumber).padStart(2, "0")}`, 80),
    sceneId: normalizeSceneId(readValue(row, ["sceneId", "scene", "场次编号", "场次"])),
    sceneShotNumber: normalizeShotNumber(readValue(row, ["sceneShotNumber", "场内镜号"]), index),
    dramaticBeat: cleanText(readValue(row, ["dramaticBeat", "戏剧节拍", "场内节拍"]), "推进", 80),
    groupNumber: normalizeGroupNumber(readValue(row, ["groupNumber", "generationGroup", "shotGroup", "生成组", "组号", "镜头组"]), shotNumber),
    shotNumber,
    duration,
    takeType: normalizeTakeType(readValue(row, ["takeType", "镜头类型", "拍摄类型"])),
    sceneKey: cleanText(readValue(row, ["sceneKey", "场景编号", "场景键"]), "", 120),
    timeState: cleanText(readValue(row, ["timeState", "时间状态", "场景时态"]), "", 200),
    paletteRef: cleanText(readValue(row, ["paletteRef", "色卡引用", "Palette引用"]), "", 200),
    sceneDescription,
    plotDescription: sceneDescription,
    character1: cleanText(readValue(row, ["character1", "角色1"]), "", 160),
    characterDescription1: cleanText(readValue(row, ["characterDescription1", "角色描述1"]), "", 2000),
    characterPsychology1: cleanText(readValue(row, ["characterPsychology1", "角色心理1", "心理活动1", "心理动机1"]), "", 2400),
    microExpression1: cleanText(readValue(row, ["microExpression1", "微表情1"]), "", 2400),
    humanImperfection1: cleanText(readValue(row, ["humanImperfection1", "真人不完美1", "人物真实细节1"]), "", 2400),
    characterState1: cleanText(readValue(row, ["characterState1", "角色状态1", "角色表演1"]), "", 2000),
    character2: cleanText(readValue(row, ["character2", "角色2"]), "", 160),
    characterDescription2: cleanText(readValue(row, ["characterDescription2", "角色描述2"]), "", 2000),
    characterPsychology2: cleanText(readValue(row, ["characterPsychology2", "角色心理2", "心理活动2", "心理动机2"]), "", 2400),
    microExpression2: cleanText(readValue(row, ["microExpression2", "微表情2"]), "", 2400),
    humanImperfection2: cleanText(readValue(row, ["humanImperfection2", "真人不完美2", "人物真实细节2"]), "", 2400),
    characterState2: cleanText(readValue(row, ["characterState2", "角色状态2", "角色表演2"]), "", 2000),
    shotSize: cleanText(readValue(row, ["shotSize", "景别"]), "", 80),
    atmosphere: cleanText(readValue(row, ["atmosphere", "氛围", "情绪"]), "", 800),
    lighting: cleanText(readValue(row, ["lighting", "光影", "光影氛围"]), "", 1200),
    sound: cleanText(readValue(row, ["sound", "音效"]), "", 1200),
    dialogueSpeaker: cleanText(readValue(row, ["dialogueSpeaker", "台词说话人"]), "", 160),
    dialogue: cleanText(readValue(row, ["dialogue", "台词"]), "", 2000),
    dialogueDelivery: cleanText(readValue(row, ["dialogueDelivery", "台词语气", "对白表演"]), "", 2400),
    dialogueSubtext: cleanText(readValue(row, ["dialogueSubtext", "台词潜台词", "潜台词"]), "", 2400),
    dialoguePause: cleanText(readValue(row, ["dialoguePause", "台词停顿", "对白停顿"]), "", 600),
    voiceoverTrackId: cleanText(readValue(row, ["voiceoverTrackId", "旁白轨编号"]), "", 80),
    voiceoverFlow: cleanText(readValue(row, ["voiceoverFlow", "旁白状态", "旁白衔接"]), "", 40),
    voiceover: cleanText(readValue(row, ["voiceover", "旁白", "画外旁白"]), "", 3000),
    voiceoverPause: cleanText(readValue(row, ["voiceoverPause", "旁白停顿"]), "", 40),
    props: cleanText(readValue(row, ["props", "道具"]), "", 800),
    imagePrompt: cleanText(readValue(row, ["imagePrompt", "分镜提示词", "图像提示词"]), "", 6000),
    videoPrompt: cleanText(readValue(row, ["videoPrompt", "视频运动提示词", "视频提示词"]), "", 6000),
    label: sceneDescription
  };
  normalized.performanceBeats = normalizePerformanceBeats(readValue(row, ["performanceBeats", "表演节拍", "镜头内部节拍"]), durationMilliseconds(duration), {
    psychology: [normalized.characterPsychology1, normalized.characterPsychology2].filter(Boolean).join("；"),
    action: [normalized.characterState1, normalized.characterState2].filter(Boolean).join("；"),
    dialogue: normalized.dialogue,
    camera: normalized.videoPrompt,
    endState: normalized.sceneDescription
  });
  return normalized;
}

function stabilizeSceneAndGenerationNumbers(rows) {
  const sceneCounts = new Map();
  let lastScene = null;
  let lastRequestedGroup = null;
  let generationGroup = 0;
  return rows.map((row) => {
    const sceneShotNumber = (sceneCounts.get(row.sceneId) || 0) + 1;
    sceneCounts.set(row.sceneId, sceneShotNumber);
    if (row.sceneId !== lastScene || row.groupNumber !== lastRequestedGroup) {
      generationGroup += 1;
      lastScene = row.sceneId;
      lastRequestedGroup = row.groupNumber;
    }
    return { ...row, sceneShotNumber, groupNumber: generationGroup };
  });
}

function stabilizeCharacterDescriptions(rows) {
  const descriptions = new Map();
  for (const row of rows) {
    for (const index of [1, 2]) {
      const character = cleanText(row[`character${index}`], "", 160);
      const description = cleanText(row[`characterDescription${index}`], "", 2000);
      if (!character || character === "-" || !description || descriptions.has(character)) continue;
      descriptions.set(character, description);
    }
  }
  return rows.map((row) => ({
    ...row,
    characterDescription1: descriptions.get(row.character1) ?? row.characterDescription1,
    characterDescription2: descriptions.get(row.character2) ?? row.characterDescription2
  }));
}

function parseJsonCandidate(content) {
  const withoutFence = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try {
    return JSON.parse(withoutFence);
  } catch {
    const objectStart = withoutFence.indexOf("{");
    const objectEnd = withoutFence.lastIndexOf("}");
    if (objectStart >= 0 && objectEnd > objectStart) {
      try {
        return JSON.parse(withoutFence.slice(objectStart, objectEnd + 1));
      } catch {
        return undefined;
      }
    }
    const arrayStart = withoutFence.indexOf("[");
    const arrayEnd = withoutFence.lastIndexOf("]");
    if (arrayStart >= 0 && arrayEnd > arrayStart) {
      try {
        return JSON.parse(withoutFence.slice(arrayStart, arrayEnd + 1));
      } catch {
        return undefined;
      }
    }
    return undefined;
  }
}

export function emptyScriptDocument(title = "分镜脚本", createdAt = new Date().toISOString()) {
  return {
    version: "script_document_v1",
    title: cleanText(title, "分镜脚本", 200),
    rows: [],
    createdAt,
    source: "manual"
  };
}

export function parseScriptModelOutput(content, createdAt = new Date().toISOString()) {
  if (typeof content !== "string" || !content.trim()) {
    return { ok: false, issue: "empty_script_output" };
  }

  const parsed = parseJsonCandidate(content);
  const rowsInput = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.rows) ? parsed.rows : [];
  if (rowsInput.length === 0) {
    return { ok: false, issue: "script_rows_required" };
  }

  const rows = stabilizeSceneAndGenerationNumbers(stabilizeCharacterDescriptions(rowsInput.filter((row) => row && typeof row === "object").slice(0, 60).map(normalizeRow)));
  if (rows.length === 0) {
    return { ok: false, issue: "script_rows_invalid" };
  }

  return {
    ok: true,
    document: {
      version: "script_document_v1",
      title: cleanText(parsed?.title, "分镜脚本", 200),
      rows,
      createdAt,
      source: "model"
    }
  };
}
