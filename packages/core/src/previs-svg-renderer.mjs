function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function point(value, fallback) {
  const candidate = value && typeof value === "object" ? value : {};
  return {
    x: Number.isFinite(Number(candidate.x)) ? Number(candidate.x) : fallback.x,
    z: Number.isFinite(Number(candidate.z)) ? Number(candidate.z) : fallback.z
  };
}

function screen(value, width = 520, height = 330) {
  return {
    x: 34 + (value.x / 12) * width,
    y: 72 + (value.z / 8) * height
  };
}

export function renderPrevisSvg({ shot, order, durationSeconds, title = "UnuTV 低模预演" } = {}) {
  const actors = Array.isArray(shot?.blocking?.actors) && shot.blocking.actors.length
    ? shot.blocking.actors
    : [{ name: "主体", start: { x: 3, z: 5 }, end: { x: 6, z: 4 } }];
  const route = Array.isArray(shot?.cinematography?.routePoints) && shot.cinematography.routePoints.length
    ? shot.cinematography.routePoints
    : [{ x: 1.5, z: 6.8 }, { x: 4.5, z: 5.2 }];
  const routePoints = route.map((entry, index) => screen(point(entry, { x: 2 + index * 2, z: 6 })));
  const actorMarkup = actors.map((actor, index) => {
    const start = screen(point(actor.start, { x: 2 + index, z: 2 + (index % 3) }));
    const end = screen(point(actor.end, { x: 3 + index, z: 2 + (index % 3) }));
    const hue = (index * 47 + 18) % 360;
    return `
      <line x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}" stroke="hsl(${hue} 72% 62%)" stroke-width="3" stroke-dasharray="7 6" marker-end="url(#arrow)"/>
      <circle cx="${start.x}" cy="${start.y}" r="12" fill="hsl(${hue} 55% 35%)" stroke="#fff" stroke-width="2"/>
      <circle cx="${end.x}" cy="${end.y}" r="7" fill="none" stroke="hsl(${hue} 72% 72%)" stroke-width="2"/>
      <text x="${start.x + 16}" y="${start.y - 8}" fill="#f4f7fb" font-size="13">${escapeXml(actor.name || `人物${index + 1}`)}</text>`;
  }).join("");
  const cameraPolyline = routePoints.map((entry) => `${entry.x},${entry.y}`).join(" ");
  const opening = escapeXml(shot?.openingState || "");
  const ending = escapeXml(shot?.endingState || "");
  const movement = escapeXml(shot?.cinematography?.movementPath || "固定机位");
  const focal = escapeXml(shot?.cinematography?.focalLength || shot?.cinematography?.lens || "35mm");
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#111827"/><stop offset="1" stop-color="#1f2937"/></linearGradient>
    <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#dbeafe"/></marker>
  </defs>
  <rect width="960" height="540" fill="url(#bg)"/>
  <text x="34" y="36" fill="#ffffff" font-size="20" font-family="sans-serif" font-weight="700">${escapeXml(title)} · S${String(order).padStart(2, "0")}</text>
  <text x="34" y="57" fill="#93c5fd" font-size="12" font-family="sans-serif">TOP 2.5D / EDITOR / CAMERA POV · ${Number(durationSeconds) || 0}s</text>
  <rect x="34" y="72" width="520" height="330" rx="10" fill="#172033" stroke="#64748b"/>
  <path d="M34 330 H554 M150 72 V402 M430 72 V402" stroke="#334155" stroke-width="2"/>
  <rect x="52" y="90" width="480" height="290" rx="6" fill="none" stroke="#475569" stroke-width="3"/>
  <rect x="270" y="90" width="70" height="10" fill="#a16207"/>
  <text x="280" y="116" fill="#fbbf24" font-size="12">入口</text>
  <rect x="345" y="260" width="75" height="54" rx="4" fill="#713f12" stroke="#d6a354"/>
  <text x="358" y="292" fill="#fde68a" font-size="12">公共木箱</text>
  ${actorMarkup}
  <polyline points="${cameraPolyline}" fill="none" stroke="#60a5fa" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" marker-end="url(#arrow)"/>
  <text x="52" y="390" fill="#60a5fa" font-size="12">摄影机轨迹：${movement}</text>
  <rect x="584" y="72" width="342" height="184" rx="10" fill="#0b1220" stroke="#64748b"/>
  <path d="M605 225 L755 105 L905 225" fill="none" stroke="#60a5fa" stroke-width="2"/>
  <rect x="670" y="135" width="170" height="80" fill="#1e293b" stroke="#94a3b8"/>
  <text x="604" y="96" fill="#ffffff" font-size="14" font-weight="700">CAMERA POV / 起幅</text>
  <text x="604" y="118" fill="#cbd5e1" font-size="12">${focal} · 9:16 safe framing</text>
  <text x="604" y="278" fill="#ffffff" font-size="14" font-weight="700">起幅状态</text>
  <foreignObject x="604" y="286" width="302" height="55"><div xmlns="http://www.w3.org/1999/xhtml" style="color:#cbd5e1;font:12px sans-serif;line-height:1.4">${opening}</div></foreignObject>
  <text x="604" y="360" fill="#ffffff" font-size="14" font-weight="700">落幅状态</text>
  <foreignObject x="604" y="368" width="302" height="55"><div xmlns="http://www.w3.org/1999/xhtml" style="color:#cbd5e1;font:12px sans-serif;line-height:1.4">${ending}</div></foreignObject>
  <rect x="34" y="430" width="892" height="78" rx="10" fill="#0b1220" stroke="#334155"/>
  <text x="52" y="456" fill="#f8fafc" font-size="14" font-weight="700">${escapeXml(shot?.narrativeJob || shot?.storyBeat || "")}</text>
  <text x="52" y="482" fill="#94a3b8" font-size="12">蓝线=摄影机路线；实心人物=起点；空心人物=终点；虚线=人物移动。此图只锁空间、站位、轴线、起落幅与镜头运动，不定义最终人物外观。</text>
</svg>`);
}

function interpolatePosition(start, end, ratio) {
  return {
    x: start.x + (end.x - start.x) * ratio,
    y: start.y + (end.y - start.y) * ratio,
    z: start.z + (end.z - start.z) * ratio
  };
}

function frameActor(actor, index, ratio) {
  const start = {
    x: Number(actor?.start?.x) || 0,
    y: Number(actor?.start?.y) || 0,
    z: Number(actor?.start?.z) || 0
  };
  const end = {
    x: Number(actor?.end?.x ?? actor?.start?.x) || 0,
    y: Number(actor?.end?.y ?? actor?.start?.y) || 0,
    z: Number(actor?.end?.z ?? actor?.start?.z) || 0
  };
  const position = interpolatePosition(start, end, ratio);
  const depthScale = Math.max(0.72, Math.min(1.25, 1.18 - position.z * 0.025));
  const x = 270 + (position.x - 6) * 36;
  const ground = 790 - position.z * 24;
  const height = 245 * depthScale;
  const width = 68 * depthScale;
  const hue = (index * 47 + 18) % 360;
  return `
    <ellipse cx="${x}" cy="${ground + 10}" rx="${width * 0.62}" ry="${width * 0.18}" fill="#05080d" opacity=".38"/>
    <rect x="${x - width / 2}" y="${ground - height * 0.68}" width="${width}" height="${height * 0.68}" rx="${width * 0.42}" fill="hsl(${hue} 32% 36%)"/>
    <circle cx="${x}" cy="${ground - height * 0.79}" r="${width * 0.34}" fill="hsl(${hue} 28% 58%)"/>
    <path d="M${x - width * 0.22} ${ground - height * 0.45} L${x - width * 0.52} ${ground - height * 0.14} M${x + width * 0.22} ${ground - height * 0.45} L${x + width * 0.52} ${ground - height * 0.14}" stroke="hsl(${hue} 28% 48%)" stroke-width="${Math.max(8, width * 0.15)}" stroke-linecap="round"/>
  `;
}

/**
 * Clean, annotation-free low-poly camera frame. It intentionally contains no
 * route line, arrow, label, timing text or UI chrome, so it may be cited by a
 * cameraTrajectoryPlan as start/mid/end composition evidence.
 */
export function renderCleanPrevisFrameSvg({ shot, phase = "start" } = {}) {
  const ratio = phase === "end" ? 1 : phase === "mid" ? 0.5 : 0;
  const actors = Array.isArray(shot?.blocking?.actors) && shot.blocking.actors.length
    ? shot.blocking.actors
    : [{ start: { x: 6, z: 3 }, end: { x: 6, z: 3 } }];
  const people = actors.map((actor, index) => frameActor(actor, index, ratio)).join("");
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="540" height="960" viewBox="0 0 540 960">
  <defs>
    <linearGradient id="wall" x1="0" x2="0" y1="0" y2="1"><stop stop-color="#25303c"/><stop offset="1" stop-color="#18212a"/></linearGradient>
    <linearGradient id="floor" x1="0" x2="0" y1="0" y2="1"><stop stop-color="#26313b"/><stop offset="1" stop-color="#111820"/></linearGradient>
    <radialGradient id="light" cx=".5" cy=".15" r=".7"><stop stop-color="#8fa2b4" stop-opacity=".28"/><stop offset="1" stop-color="#0b1016" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="540" height="960" fill="#111820"/>
  <path d="M0 0 H540 V655 L0 770 Z" fill="url(#wall)"/>
  <path d="M0 770 L540 655 V960 H0 Z" fill="url(#floor)"/>
  <rect x="224" y="150" width="92" height="360" fill="#101820"/>
  <rect x="236" y="168" width="68" height="342" fill="#26313a"/>
  <rect x="360" y="670" width="112" height="92" rx="4" fill="#6b492c"/>
  <path d="M360 670 L389 642 H495 L472 670 Z" fill="#8a6340"/>
  <path d="M472 670 L495 642 V725 L472 762 Z" fill="#4d3322"/>
  ${people}
  <rect width="540" height="960" fill="url(#light)"/>
</svg>`);
}
