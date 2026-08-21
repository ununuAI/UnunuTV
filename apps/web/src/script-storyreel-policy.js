import { scriptRowFieldValue } from "@ununu/unutv-contracts";

export const STORYREEL_STYLES = Object.freeze([
  Object.freeze({
    id: "彩绘",
    judges: "构图、动作、景别落点、光比与明暗面、色温冷暖、氛围",
    prompt: "彩色铅笔手绘分镜风格：纸纹可见，铅笔排线与轮廓线清晰，色相有限而柔和，明暗关系与色温可读，不做照片级写实、不做数码平涂"
  }),
  Object.freeze({
    id: "素描",
    judges: "构图、动作、景别落点、明暗面",
    prompt: "单色铅笔素描分镜风格：灰调排线、线条清晰，只做简单明暗，不上色、不做照片级写实"
  }),
  Object.freeze({
    id: "白模",
    judges: "空间几何、体块位置、遮挡关系、机位与轴线、人物站位",
    prompt: "白模/灰模分镜风格：白色与浅灰无材质体块，只表达几何形体、体积、前后遮挡与摄影机视角；不画材质纹理、不画面部表情、不画光影气氛，均匀漫射照明，人物为简化的无细节人形"
  })
]);

const MOVES = [
  ["push_in", "推近", ["推近", "推进", "向前推"]],
  ["pull_out", "拉远", ["拉远", "后拉", "向后拉"]],
  ["follow", "跟拍", ["跟拍", "跟随", "跟移"]],
  ["pan", "摇摄", ["摇摄", "横摇", "左摇", "右摇"]],
  ["boom", "升降", ["升镜", "降镜", "升降"]],
  ["truck", "平移", ["平移", "横移", "侧移"]],
  ["static", "固定", ["全程固定", "摄影机固定", "机位固定", "保持固定", "固定"]]
];

const SIZE_WORDS = ["大特写", "特写", "中近景", "中全景", "中景", "近景", "大全景", "全景", "远景"];
const DEFAULT_CPS = 4.5;
const DEFAULT_WPS = 2.8;

export function parseScriptDurationSec(row) {
  const numeric = Number(row?.durationSec);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const text = scriptRowFieldValue(row, "duration");
  const match = String(text || "").match(/(\d+(?:\.\d+)?)/);
  const parsed = match ? Number(match[1]) : 0;
  return parsed > 0 ? parsed : 4;
}

export function inferSpeakerGender(name, rows = [], assets = []) {
  const who = String(name || "").trim();
  if (!who) return "";
  const texts = [];
  for (const row of rows) {
    if (row.character1 === who) texts.push(row.characterDescription1, row.characterState1);
    if (row.character2 === who) texts.push(row.characterDescription2, row.characterState2);
  }
  for (const asset of assets) {
    if (asset.name === who) texts.push(asset.description);
  }
  const blob = texts.filter(Boolean).join(" ");
  if (/女|她|少女|女性/.test(blob)) return "female";
  if (/男|他|少年|男性/.test(blob)) return "male";
  return "";
}

export function inferMove(text) {
  const blob = String(text || "");
  for (const [kind, label, keys] of MOVES) {
    if (keys.some((key) => blob.includes(key))) return { kind, label };
  }
  return { kind: "unknown", label: "未标注" };
}

export function speechSeconds(text) {
  const source = String(text || "");
  const cjk = (source.match(/[\u4e00-\u9fff]/g) || []).length;
  const words = (source.match(/[A-Za-z][A-Za-z'’]*/g) || []).length;
  return Math.max(cjk / DEFAULT_CPS + words / DEFAULT_WPS, 0.35);
}

export function placeStoryreelLines(lines, startSec, endSec) {
  if (!lines.length || !(endSec > startSec)) return [];
  const dur = endSec - startSec;
  const need = lines.map((line) => speechSeconds(line.text));
  const lead = Math.min(0.5, dur * 0.12);
  const tail = Math.min(0.5, dur * 0.12);
  const window = dur - lead - tail;
  const gap = lines.length > 1 ? 0.35 : 0;
  const total = need.reduce((sum, item) => sum + item, 0) + gap * (lines.length - 1);
  const overflow = total > window;
  let cursor = startSec + lead;
  return lines.map((line, index) => {
    const item = { ...line, t: cursor, d: need[index], overflow };
    cursor += need[index] + gap;
    return item;
  });
}

function splitDialogue(row) {
  const text = scriptRowFieldValue(row, "dialogue");
  if (!text || text === "未想") return [];
  return text.split(/\s*\/\s*/).map((item) => item.trim()).filter(Boolean);
}

export function storyreelGrid(count) {
  const total = Math.max(1, Number(count) || 1);
  if (total <= 1) return { cols: 1, rows: 1 };
  if (total === 2) return { cols: 2, rows: 1 };
  if (total <= 4) return { cols: 2, rows: 2 };
  if (total <= 6) return { cols: 3, rows: 2 };
  return { cols: 3, rows: 3 };
}

export function storyreelCellPrompt(row) {
  const visual = scriptRowFieldValue(row, "sceneDescription") || `${scriptRowFieldValue(row, "character1") || "人物"}在场`;
  return [
    visual,
    scriptRowFieldValue(row, "shotSize") ? `景别：${scriptRowFieldValue(row, "shotSize")}` : "",
    scriptRowFieldValue(row, "lighting") ? `光影：${scriptRowFieldValue(row, "lighting")}` : "",
    scriptRowFieldValue(row, "videoPrompt") ? `运镜：${scriptRowFieldValue(row, "videoPrompt")}` : ""
  ].filter(Boolean).join("\n");
}

export function resolveScriptAspectRatio({ document = null, rows = [], texts = [] } = {}) {
  const explicit = document?.aspectRatio || document?.aspect || document?.frame;
  if (explicit === "16:9" || explicit === "9:16") return explicit;
  const blob = [
    explicit,
    ...(Array.isArray(rows) ? rows.map((row) => `${row.sceneDescription || ""} ${row.label || ""}`) : []),
    ...texts
  ].filter(Boolean).join("\n");
  const has916 = /9\s*[:：]\s*16/.test(blob);
  const has169 = /16\s*[:：]\s*9/.test(blob);
  if (has916 && !has169) return "9:16";
  if (has169 && !has916) return "16:9";
  if (/竖屏|竖幅/.test(blob)) return "9:16";
  if (/横屏|横幅|宽银幕/.test(blob)) return "16:9";
  return "9:16";
}

export function storyreelImageSize(aspectRatio, grid = { cols: 1, rows: 1 }) {
  const [cellW, cellH] = aspectRatio === "16:9" ? [16, 9] : [9, 16];
  const sheetW = cellW * Math.max(1, Number(grid.cols) || 1);
  const sheetH = cellH * Math.max(1, Number(grid.rows) || 1);
  return sheetW >= sheetH ? "1536x1024" : "1024x1536";
}

const CARD_GAP = 28;
const GROUP_PAD_X = 36;
const GROUP_PAD_Y = 56;
const BLOCK_GAP = 72;

export function isStoryreelCanvasNode(node) {
  return Boolean(node?.payload?.storyreelSheet || node?.payload?.storyreelPanel);
}

export function storyreelCardSize(aspectRatio) {
  return aspectRatio === "16:9"
    ? { width: 360, height: 248 }
    : { width: 240, height: 428 };
}

export function layoutStoryreelCanvasGroup({
  anchor = { x: 0, y: 0, width: 680, height: 280 },
  aspectRatio = "9:16",
  editionIndex = 0,
  grid = { cols: 2, rows: 2 },
  groupSlot = 1,
  panelCount = 4,
  styleIndex = 0
} = {}) {
  const card = storyreelCardSize(aspectRatio);
  const cols = Math.max(1, Number(grid.cols) || 1);
  const rows = Math.max(1, Number(grid.rows) || 1);
  const shotsW = cols * card.width + (cols - 1) * CARD_GAP;
  const shotsH = rows * card.height + (rows - 1) * CARD_GAP;
  const blockW = card.width + CARD_GAP + shotsW;
  const blockH = Math.max(card.height, shotsH);
  const originX = (Number(anchor.x) || 0) + (Number(anchor.width) || 680) + 80
    + Math.max(0, Number(styleIndex) || 0) * (blockW + GROUP_PAD_X * 2 + BLOCK_GAP);
  const originY = (Number(anchor.y) || 0)
    + Math.max(0, (Number(groupSlot) || 1) - 1) * (blockH + GROUP_PAD_Y + BLOCK_GAP)
    + Math.max(0, Number(editionIndex) || 0) * (blockH + GROUP_PAD_Y + BLOCK_GAP);
  const sheet = { key: "sheet", x: originX, y: originY, width: card.width, height: card.height };
  const panels = Array.from({ length: Math.max(0, Number(panelCount) || 0) }, (_, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    return {
      key: `panel-${index}`,
      index,
      x: originX + card.width + CARD_GAP + col * (card.width + CARD_GAP),
      y: originY + row * (card.height + CARD_GAP),
      width: card.width,
      height: card.height
    };
  });
  return {
    card,
    sheet,
    panels,
    group: {
      x: originX - GROUP_PAD_X,
      y: originY - GROUP_PAD_Y,
      width: blockW + GROUP_PAD_X * 2,
      height: blockH + GROUP_PAD_Y + 28
    }
  };
}

export function trackedStoryreelNodeIds(saved) {
  const ids = new Set();
  for (const group of Object.values(saved?.groups || {})) {
    for (const edition of group.editions || []) {
      for (const style of Object.values(edition.styles || {})) {
        if (style?.sheet?.nodeId) ids.add(style.sheet.nodeId);
        for (const panel of Object.values(style?.panels || {})) {
          if (panel?.nodeId) ids.add(panel.nodeId);
        }
      }
    }
  }
  return ids;
}

export function storyreelOrphanNodes(nodes = [], saved) {
  const keep = trackedStoryreelNodeIds(saved);
  return (nodes || []).filter((node) => isStoryreelCanvasNode(node) && !keep.has(node.id));
}

export function mergeStoryreelGroupId(saved, groupNumber, editionId, styleId, groupId) {
  const next = migrateStoryreelState(saved, groupNumber);
  const key = groupKey(groupNumber);
  next.groups[key] = {
    ...next.groups[key],
    editions: next.groups[key].editions.map((edition) => {
      if (edition.id !== editionId) return edition;
      const style = edition.styles?.[styleId] || { panels: {} };
      return {
        ...edition,
        styles: {
          ...(edition.styles || {}),
          [styleId]: { ...style, groupId }
        }
      };
    })
  };
  return next;
}

export function compileStoryreelSheetPrompt(panels = [], styleId = "彩绘", cellText = {}, aspectRatio = "9:16") {
  const style = STORYREEL_STYLES.find((item) => item.id === styleId) || STORYREEL_STYLES[0];
  const { cols, rows } = storyreelGrid(panels.length);
  const frame = aspectRatio === "16:9" ? "横幅16:9" : "竖幅9:16";
  return [
    `一张分镜故事板：${cols}列${rows}行共${cols * rows}格，每格大小完全相同，每格都是${frame}的电影画幅，格与格之间用干净的白色细条分隔。`,
    `统一${style.prompt}。`,
    "画面是纯图像，格内不出现任何文字、数字、字母、编号、标题或对话框。",
    "全部格子里的同一人物五官、发型、体型和服装必须一致，同一场景的空间结构必须一致。",
    "",
    `【${panels.length}格内容，按从左到右、从上到下逐格绘制；镜头运动只画其停点构图】`,
    ...panels.map((panel, index) => `第${index + 1}格（${panel.label}）：${cellText[panel.id] || panel.cell_prompt || panel.panel_prompt || ""}`)
  ].join("\n");
}

export function storyreelSheetCrop(index, cols, rows) {
  const x = index % cols;
  const y = Math.floor(index / cols);
  return {
    backgroundSize: `${cols * 100}% ${rows * 100}%`,
    backgroundPosition: `${cols > 1 ? (x / (cols - 1)) * 100 : 0}% ${rows > 1 ? (y / (rows - 1)) * 100 : 0}%`
  };
}

export function storyreelPanelPrompt(row, styleId = "彩绘", aspectRatio = "9:16") {
  const style = STORYREEL_STYLES.find((item) => item.id === styleId) || STORYREEL_STYLES[0];
  const visual = scriptRowFieldValue(row, "sceneDescription") || `${scriptRowFieldValue(row, "character1") || "人物"}在场`;
  const frame = aspectRatio === "16:9" ? "16:9横幅" : "9:16竖幅";
  return [
    `一张${frame}电影分镜画面。${style.prompt}。`,
    "画面是纯图像，不出现任何文字、数字、字母、编号、标题或对话框。",
    "",
    "【本画面内容】",
    visual,
    scriptRowFieldValue(row, "shotSize") ? `景别：${scriptRowFieldValue(row, "shotSize")}` : "",
    scriptRowFieldValue(row, "lighting") ? `光影：${scriptRowFieldValue(row, "lighting")}` : "",
    scriptRowFieldValue(row, "videoPrompt") ? `运镜：${scriptRowFieldValue(row, "videoPrompt")}` : ""
  ].filter(Boolean).join("\n");
}

function groupKey(groupNumber) {
  return String(Number(groupNumber) || 1);
}

function editionLabel(index) {
  return `版本${index + 1}`;
}

function snapshotPrompts(panels = []) {
  return Object.fromEntries(panels.map((panel) => [panel.id, panel.panel_prompt || ""]));
}

export function migrateStoryreelState(saved, groupNumber = 1) {
  const clone = saved ? JSON.parse(JSON.stringify(saved)) : {};
  const key = groupKey(groupNumber);
  if (clone.groups?.[key]?.editions?.length) return clone;
  const legacyStyles = clone.versions && !clone.groups ? clone.versions : {};
  const first = {
    id: "v1",
    label: "版本1",
    createdAt: clone.createdAt || new Date().toISOString(),
    note: "",
    prompts: {},
    styles: legacyStyles
  };
  return {
    groups: {
      ...(clone.groups || {}),
      [key]: { currentId: "v1", editions: [first] }
    }
  };
}

export function listGroupEditions(saved, groupNumber = 1) {
  return migrateStoryreelState(saved, groupNumber).groups[groupKey(groupNumber)].editions;
}

export function currentGroupEdition(saved, groupNumber = 1) {
  const state = migrateStoryreelState(saved, groupNumber).groups[groupKey(groupNumber)];
  return state.editions.find((item) => item.id === state.currentId) || state.editions[0] || null;
}

export function setCurrentGroupEdition(saved, groupNumber, editionId) {
  const next = migrateStoryreelState(saved, groupNumber);
  const key = groupKey(groupNumber);
  if (!next.groups[key].editions.some((item) => item.id === editionId)) return next;
  next.groups[key] = { ...next.groups[key], currentId: editionId };
  return next;
}

export function createGroupEdition(saved, groupNumber, panels = [], note = "") {
  const next = migrateStoryreelState(saved, groupNumber);
  const key = groupKey(groupNumber);
  const editions = next.groups[key].editions;
  const id = `v${editions.length + 1}`;
  const edition = {
    id,
    label: editionLabel(editions.length),
    createdAt: new Date().toISOString(),
    note,
    prompts: snapshotPrompts(panels),
    styles: {}
  };
  next.groups[key] = { currentId: id, editions: [...editions, edition] };
  return next;
}

export function compileScriptStoryreel({ assets = [], document = null, editionId = null, groupNumber = null, rows = [], storyreel = null, texts = [], title = "导演预演" } = {}) {
  const aspectRatio = resolveScriptAspectRatio({ document, rows, texts });
  let cursor = 0;
  const panels = rows.map((row, index) => {
    const durationSec = parseScriptDurationSec(row);
    const startSec = cursor;
    cursor += durationSec;
    const speaker = scriptRowFieldValue(row, "dialogueSpeaker") || row.character1 || row.character2 || "";
    const gender = inferSpeakerGender(speaker, rows, assets);
    const lines = placeStoryreelLines(
      splitDialogue(row).map((text) => ({ text, speaker, gender, lang: "zh", pitch: 1, timbre: "" })),
      startSec,
      cursor
    );
    const move = inferMove([scriptRowFieldValue(row, "videoPrompt"), scriptRowFieldValue(row, "sceneDescription")].join(" "));
    const size = SIZE_WORDS.find((word) => scriptRowFieldValue(row, "shotSize").includes(word)) || scriptRowFieldValue(row, "shotSize") || "未标注";
    const livePrompt = scriptRowFieldValue(row, "sceneDescription") || "画面未想";
    return {
      id: row.id || `shot-${row.shotNumber || index + 1}`,
      label: `镜头${row.shotNumber || index + 1}`,
      shotNumber: row.shotNumber || index + 1,
      groupNumber: Number(row.groupNumber) || 1,
      start_s: startSec,
      end_s: cursor,
      live_prompt: livePrompt,
      cell_prompt: storyreelCellPrompt(row),
      panel_prompt: livePrompt,
      generate_prompt: Object.fromEntries(STORYREEL_STYLES.map((style) => [style.id, storyreelPanelPrompt(row, style.id, aspectRatio)])),
      lines,
      craft: {
        size,
        move: move.label,
        move_kind: move.kind
      }
    };
  });
  const resolvedGroup = Number(groupNumber) || panels[0]?.groupNumber || 1;
  const saved = migrateStoryreelState(storyreel, resolvedGroup);
  const edition = (editionId
    ? saved.groups[groupKey(resolvedGroup)].editions.find((item) => item.id === editionId)
    : currentGroupEdition(saved, resolvedGroup)) || currentGroupEdition(saved, resolvedGroup);
  const frozen = panels.map((panel) => {
    const prompt = edition?.prompts?.[panel.id] || panel.cell_prompt || panel.live_prompt;
    const row = rows.find((item) => (item.id || `shot-${item.shotNumber}`) === panel.id) || {};
    return {
      ...panel,
      panel_prompt: prompt,
      generate_prompt: Object.fromEntries(STORYREEL_STYLES.map((style) => [style.id, storyreelPanelPrompt({ ...row, sceneDescription: prompt }, style.id, aspectRatio)]))
    };
  });
  return {
    version: "script_storyreel_v1",
    title,
    groupNumber: resolvedGroup,
    totalSec: cursor,
    shotCount: frozen.length,
    aspectRatio,
    styles: STORYREEL_STYLES.map((style) => style.id),
    grid: storyreelGrid(frozen.length),
    saved,
    edition,
    editions: listGroupEditions(saved, resolvedGroup),
    panels: frozen
  };
}

export function storyreelPanelAt(reel, timeSec) {
  const panels = reel?.panels || [];
  if (!panels.length) return null;
  const t = Math.max(0, Number(timeSec) || 0);
  return panels.find((panel) => t >= panel.start_s && t < panel.end_s) || panels[panels.length - 1];
}

export function storyreelStyleState(saved, groupNumber, editionId, styleId) {
  return listGroupEditions(saved, groupNumber).find((item) => item.id === editionId)?.styles?.[styleId] || null;
}

export function storyreelSheet(saved, groupNumber, editionId, styleId) {
  return storyreelStyleState(saved, groupNumber, editionId, styleId)?.sheet || null;
}

export function storyreelPanelMedia(saved, groupNumber, editionId, styleId, panelId) {
  const edition = listGroupEditions(saved, groupNumber).find((item) => item.id === editionId);
  return edition?.styles?.[styleId]?.panels?.[panelId] || null;
}

export function storyreelStyleReady(saved, groupNumber, editionId, styleId, panels = []) {
  if (storyreelSheet(saved, groupNumber, editionId, styleId)?.mediaId) return true;
  return panels.length > 0 && panels.every((panel) => Boolean(storyreelPanelMedia(saved, groupNumber, editionId, styleId, panel.id)?.mediaId));
}

export function mergeStoryreelSheet(saved, groupNumber, editionId, styleId, sheet, prompts = null) {
  const next = migrateStoryreelState(saved, groupNumber);
  const key = groupKey(groupNumber);
  next.groups[key] = {
    ...next.groups[key],
    editions: next.groups[key].editions.map((edition) => {
      if (edition.id !== editionId) return edition;
      const style = edition.styles?.[styleId] || { panels: {} };
      return {
        ...edition,
        prompts: prompts || edition.prompts || {},
        styles: {
          ...(edition.styles || {}),
          [styleId]: { ...style, sheet }
        }
      };
    })
  };
  return next;
}

export function mergeStoryreelPanel(saved, groupNumber, editionId, styleId, panelId, patch, prompts = null) {
  const next = migrateStoryreelState(saved, groupNumber);
  const key = groupKey(groupNumber);
  next.groups[key] = {
    ...next.groups[key],
    editions: next.groups[key].editions.map((edition) => {
      if (edition.id !== editionId) return edition;
      const style = edition.styles?.[styleId] || { panels: {} };
      return {
        ...edition,
        prompts: prompts || edition.prompts || {},
        styles: {
          ...(edition.styles || {}),
          [styleId]: {
            ...style,
            panels: {
              ...(style.panels || {}),
              [panelId]: { ...(style.panels?.[panelId] || {}), ...patch }
            }
          }
        }
      };
    })
  };
  return next;
}

const RASTER_IMAGE_KINDS = new Set(["image", "subject", "upload", "material", "historyPick"]);

export function rasterStoryreelReferences(assets = [], nodes = []) {
  const referenceMediaIds = [];
  const referenceNodeIds = [];
  for (const asset of assets) {
    const node = nodes.find((item) => item.id === asset.nodeId)
      || nodes.find((item) => item.payload?.currentMediaId && item.payload.currentMediaId === asset.mediaId);
    if (!node || !RASTER_IMAGE_KINDS.has(node.kind)) continue;
    const mediaId = node.payload?.currentMediaId || asset.mediaId;
    if (!mediaId || referenceMediaIds.includes(mediaId)) continue;
    referenceMediaIds.push(mediaId);
    referenceNodeIds.push(node.id);
    if (referenceMediaIds.length >= 5) break;
  }
  return { referenceMediaIds, referenceNodeIds };
}
