const ANNOTATION_PIXEL_CONFLICT_PATTERN = /(?:文字|数字|标题|注释|编号|标签|箭头|标尺|字幕)/u;
const GROUP_BOARD_PATTERN = /(?:群像|群体|多人|多角色|变体|配对|ensemble|crowd|variants?)/iu;
const GROUP_PROHIBITION_PATTERN = /(?:其他人物|群像|多人|多角色|additional characters?|crowd|ensemble)/iu;

function list(value) {
  return Array.isArray(value) ? value.filter((entry) => typeof entry === "string" && entry.trim()) : [];
}

function isGroupExpansionBoard(authorityBoard, subjectMode) {
  if (subjectMode !== "ensemble" || !authorityBoard) return false;
  return GROUP_BOARD_PATTERN.test([
    authorityBoard.boardId,
    authorityBoard.boardType,
    authorityBoard.label,
    authorityBoard.purpose
  ].filter(Boolean).join(" "));
}

function conflictsWithActiveBoard(item, authorityBoard, subjectMode) {
  return isGroupExpansionBoard(authorityBoard, subjectMode) && GROUP_PROHIBITION_PATTERN.test(item);
}

export function scopeAuthorityBoardConstraints({ authorityItems, boardItems, authorityBoard, subjectMode } = {}) {
  const annotatedControl = authorityBoard?.pixelMode === "annotated_control";
  const globalItems = list(authorityItems).filter((item) => {
    if (annotatedControl && ANNOTATION_PIXEL_CONFLICT_PATTERN.test(item)) return false;
    return !conflictsWithActiveBoard(item, authorityBoard, subjectMode);
  });
  return [...globalItems, ...list(boardItems)];
}
