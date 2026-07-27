function byteLength(text) {
  return new TextEncoder().encode(text).byteLength;
}

function renderSections(sections) {
  return sections
    .filter((entry) => entry.lines.length)
    .map((entry) => `【${entry.title}】\n${entry.lines.join("\n")}`)
    .join("\n\n")
    .trim();
}

export function cinematicPromptByteLength(text) {
  return byteLength(text);
}

export function fitCinematicPromptByteBudget(sections, maxBytes) {
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) return { droppedFragments: [], droppedSections: [], prompt: renderSections(sections) };
  const active = sections.map((entry) => ({ ...entry, lines: [...entry.lines] }));
  const droppedFragments = [];
  while (byteLength(renderSections(active)) > maxBytes) {
    const candidates = active.flatMap((entry) => entry.priority >= 100 ? [] : entry.lines.map((line, index) => ({ entry, index, line, priority: entry.priority })))
      .sort((a, b) => a.priority - b.priority || b.line.length - a.line.length);
    const candidate = candidates[0];
    if (!candidate) break;
    candidate.entry.lines.splice(candidate.index, 1);
    droppedFragments.push({ section: candidate.entry.title, text: candidate.line });
  }
  return { droppedFragments, droppedSections: [...new Set(droppedFragments.map((entry) => entry.section))], prompt: renderSections(active) };
}
