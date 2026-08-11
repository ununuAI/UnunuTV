function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function numberMatches(value, pattern) {
  return [...text(value).matchAll(pattern)]
    .map((match) => Number(match[1]))
    .filter(Number.isFinite);
}

function directionVector(value) {
  const source = text(value);
  if (/东南|南东/.test(source)) return { x: Math.SQRT1_2, z: Math.SQRT1_2 };
  if (/西南|南西/.test(source)) return { x: -Math.SQRT1_2, z: Math.SQRT1_2 };
  if (/东北|北东/.test(source)) return { x: Math.SQRT1_2, z: -Math.SQRT1_2 };
  if (/西北|北西/.test(source)) return { x: -Math.SQRT1_2, z: -Math.SQRT1_2 };
  if (/南侧|向南|南方/.test(source)) return { x: 0, z: 1 };
  if (/北侧|向北|北方/.test(source)) return { x: 0, z: -1 };
  if (/东侧|向东|东方/.test(source)) return { x: 1, z: 0 };
  if (/西侧|向西|西方/.test(source)) return { x: -1, z: 0 };
  return { x: Math.SQRT1_2, z: Math.SQRT1_2 };
}

function normalizedToward(from, to) {
  const dx = Number(to.x) - Number(from.x);
  const dz = Number(to.z) - Number(from.z);
  const length = Math.hypot(dx, dz) || 1;
  return { x: dx / length, z: dz / length };
}

function rounded(value) {
  return Math.round(Number(value) * 1000) / 1000;
}

function point(position, atMs) {
  return {
    x: rounded(position.x),
    y: rounded(position.y),
    z: rounded(position.z),
    atMs: Math.max(0, Math.round(Number(atMs) || 0)),
  };
}

function placementStart(cameraPlacement, lookAt) {
  const placement = text(cameraPlacement);
  const heights = numberMatches(placement, /(?:高|高度|眼平|胸口高度)(\d+(?:\.\d+)?)\s*米/gu);
  const distances = numberMatches(placement, /(?:距[^，；、]*?|侧|方|角)(\d+(?:\.\d+)?)\s*米/gu);
  const distance = distances[0] || 2;
  const direction = directionVector(placement);
  return {
    x: Number(lookAt.x) + direction.x * distance,
    y: heights[0] || (/低位/.test(placement) ? 0.8 : /眼平/.test(placement) ? 1.55 : /胸口/.test(placement) ? 1.35 : 1.55),
    z: Number(lookAt.z) + direction.z * distance,
  };
}

function movementEnd(start, movementPath, cameraPlacement, lookAt) {
  const movement = text(movementPath);
  const end = { ...start };
  const toward = normalizedToward(start, lookAt);
  const pushes = numberMatches(movement, /(?:缓推|轻推|极缓推|推近|向前|前移)(\d+(?:\.\d+)?)\s*米/gu);
  const pullBacks = numberMatches(movement, /(?:后拉|后退)(\d+(?:\.\d+)?)\s*米/gu);
  const eastMoves = numberMatches(movement, /(?:由西向东[^；，]*?|向东[^；，]*?|右移|横移|侧移)(\d+(?:\.\d+)?)\s*米/gu);
  const westMoves = numberMatches(movement, /(?:由东向西[^；，]*?|向西[^；，]*?|左移)(\d+(?:\.\d+)?)\s*米/gu);
  const southMoves = numberMatches(movement, /(?:向南|南向|南侧[^；，]*?跟移)(\d+(?:\.\d+)?)\s*米/gu);
  const northMoves = numberMatches(movement, /(?:向北|北向)(\d+(?:\.\d+)?)\s*米/gu);
  const push = pushes.reduce((sum, value) => sum + value, 0);
  const pull = pullBacks.reduce((sum, value) => sum + value, 0);
  end.x += toward.x * (push - pull);
  end.z += toward.z * (push - pull);
  end.x += eastMoves.reduce((sum, value) => sum + value, 0);
  end.x -= westMoves.reduce((sum, value) => sum + value, 0);
  end.z += southMoves.reduce((sum, value) => sum + value, 0);
  end.z -= northMoves.reduce((sum, value) => sum + value, 0);
  const absoluteHeights = [
    ...numberMatches(cameraPlacement, /(?:升至|降至)(\d+(?:\.\d+)?)\s*米/gu),
    ...numberMatches(movement, /(?:升至|降至)(\d+(?:\.\d+)?)\s*米/gu),
  ];
  if (absoluteHeights.length) end.y = absoluteHeights.at(-1);
  else {
    end.y += numberMatches(movement, /(?:升高|上升)(\d+(?:\.\d+)?)\s*米/gu).reduce((sum, value) => sum + value, 0);
    end.y -= numberMatches(movement, /(?:降低|下降|轻降)(\d+(?:\.\d+)?)\s*米/gu).reduce((sum, value) => sum + value, 0);
  }
  return end;
}

export function deriveDeterministicPrevisCameraRoutePoints(input = {}) {
  const startMs = Math.max(0, Number(input.startMs) || 0);
  const endMs = Math.max(startMs + 1, Number(input.endMs) || startMs + 1);
  const explicit = Array.isArray(input.routePoints) ? input.routePoints : [];
  if (explicit.length >= 2) {
    return explicit.map((entry, index, all) => point({
      x: Number(entry.x) || 0,
      y: Number(entry.y ?? 1.55) || 1.55,
      z: Number(entry.z) || 0,
    }, startMs + ((endMs - startMs) * index) / Math.max(1, all.length - 1)));
  }
  const lookAt = {
    x: Number(input.lookAt?.x) || 6,
    y: Number(input.lookAt?.y) || 1.45,
    z: Number(input.lookAt?.z) || 3.8,
  };
  const start = placementStart(input.cameraPlacement, lookAt);
  const end = movementEnd(start, input.movementPath, input.cameraPlacement, lookAt);
  const pathMode = text(input.pathMode);
  if (["arc_left", "arc_right"].includes(pathMode) || /弧线|弧移|绕至/.test(text(input.movementPath))) {
    const midpoint = {
      x: (start.x + end.x) / 2 + (pathMode === "arc_left" ? -0.35 : 0.35),
      y: (start.y + end.y) / 2,
      z: (start.z + end.z) / 2,
    };
    return [point(start, startMs), point(midpoint, (startMs + endMs) / 2), point(end, endMs)];
  }
  return [point(start, startMs), point(end, endMs)];
}
