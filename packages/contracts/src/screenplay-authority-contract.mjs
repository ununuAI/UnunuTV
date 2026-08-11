export const SCREENPLAY_AUTHORITY_CHECKSUM_ALGORITHM = "sha256";

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const SCENE_HEADING_PATTERN = /^(?:#{2,6}\s*)?(?:(?:第?[一二三四五六七八九十百零〇\d]+场|场[一二三四五六七八九十百零〇\d]+)(?:\s|[｜|·:：])|(?:INT|EXT|INT\/EXT|EXT\/INT)\.?\s|(?:内景|外景|内\/外|外\/内)(?:\s|[·.。:：]))/iu;
const INLINE_DIALOGUE_PATTERN = /^(.{1,40}?)(?:（[^）]*）|\([^)]*\))?\s*[：:]\s*(?:“([^”]+)”|「([^」]+)」|"([^"]+)")\s*$/u;
const PERFORMANCE_HINT_PATTERN = /^(?:（[^）]+）|\([^)]+\))$/u;
const MARKDOWN_SPEAKER_PATTERN = /^\*{2}\s*([^*]+?)\s*\*{2}(?:\s*(?:（[^）]*）|\([^)]*\)))?$/u;
const PLAIN_SPEAKER_PATTERN = /^(?:[\p{Script=Han}·]{2,12}|[A-Z][A-Z0-9 ._·'-]{0,30})(?:\s*(?:（[^）]*）|\([^)]*\)))?$/u;
const QUOTED_SPEECH_PATTERN = /“([^”]+)”|「([^」]+)」|"([^"]+)"/gu;
const SPEECH_VERB_PATTERN = /(?:说(?:道)?|问(?:道)?|喊(?:道)?|叫(?:道)?|答(?:道)?|回应|回道|念道|嘀咕)/gu;
const SPEAKER_ACTION_CUE_PATTERN = /(?:一手|挂断|拿|看|笑|压低|接|转身|抬|走|停|把|向|在|从|用|低声|轻声|高声|大声|电话|…|——|，|,)/u;
const UNRESOLVED_SCREENPLAY_STATUS_PATTERN = /^(?:状态|status)\s*[：:]\s*.*(?:草案|待绑定|待复审|待审核|未审核|draft|pending)/iu;

function record(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizedInlineText(value) {
  return text(value);
}

function issue(path, message, code) {
  return { code, message, path };
}

function rotateRight(value, amount) {
  return (value >>> amount) | (value << (32 - amount));
}

/**
 * Browser-safe synchronous SHA-256 for authoritative screenplay text.
 * Keeping this implementation in contracts lets Core, CLI and Web verify the
 * same bytes without trusting client-supplied identity metadata.
 */
export function screenplayContentChecksum(content) {
  const bytes = new TextEncoder().encode(typeof content === "string" ? content : "");
  const bitLength = bytes.length * 8;
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  const bitLengthHigh = Math.floor(bitLength / 0x1_0000_0000);
  const bitLengthLow = bitLength >>> 0;
  view.setUint32(paddedLength - 8, bitLengthHigh);
  view.setUint32(paddedLength - 4, bitLengthLow);

  const constants = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ]);
  const state = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ]);
  const schedule = new Uint32Array(64);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) schedule[index] = view.getUint32(offset + (index * 4));
    for (let index = 16; index < 64; index += 1) {
      const left = schedule[index - 15];
      const right = schedule[index - 2];
      const sigma0 = rotateRight(left, 7) ^ rotateRight(left, 18) ^ (left >>> 3);
      const sigma1 = rotateRight(right, 17) ^ rotateRight(right, 19) ^ (right >>> 10);
      schedule[index] = (schedule[index - 16] + sigma0 + schedule[index - 7] + sigma1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = state;
    for (let index = 0; index < 64; index += 1) {
      const choice = (e & f) ^ (~e & g);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const temporary1 = (h + sum1 + choice + constants[index] + schedule[index]) >>> 0;
      const temporary2 = (sum0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temporary1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temporary1 + temporary2) >>> 0;
    }
    state[0] = (state[0] + a) >>> 0;
    state[1] = (state[1] + b) >>> 0;
    state[2] = (state[2] + c) >>> 0;
    state[3] = (state[3] + d) >>> 0;
    state[4] = (state[4] + e) >>> 0;
    state[5] = (state[5] + f) >>> 0;
    state[6] = (state[6] + g) >>> 0;
    state[7] = (state[7] + h) >>> 0;
  }
  return [...state].map((part) => part.toString(16).padStart(8, "0")).join("");
}

function screenplayLines(content) {
  return String(content).replace(/\r\n?/gu, "\n").split("\n");
}

function normalizedScreenplayLine(rawLine) {
  return text(rawLine).replace(/^(?:[-*]\s+|>\s*)/u, "");
}

function speakerBlockName(line) {
  const markdown = line.match(MARKDOWN_SPEAKER_PATTERN);
  if (markdown) return normalizedInlineText(markdown[1]);
  if (!PLAIN_SPEAKER_PATTERN.test(line) || SCENE_HEADING_PATTERN.test(line)) return "";
  return normalizedInlineText(line.replace(/(?:（[^）]*）|\([^)]*\))\s*$/u, ""));
}

function audibleQuotedSpeech(line) {
  const entries = [];
  QUOTED_SPEECH_PATTERN.lastIndex = 0;
  for (const quote of line.matchAll(QUOTED_SPEECH_PATTERN)) {
    const prefix = line.slice(0, quote.index);
    let speechVerb = null;
    SPEECH_VERB_PATTERN.lastIndex = 0;
    for (const match of prefix.matchAll(SPEECH_VERB_PATTERN)) speechVerb = match;
    if (!speechVerb) continue;

    const beforeVerb = prefix.slice(0, speechVerb.index).trim();
    const actionCue = beforeVerb.match(SPEAKER_ACTION_CUE_PATTERN);
    const speakerCandidate = normalizedInlineText(
      beforeVerb.slice(0, actionCue?.index ?? beforeVerb.length)
    ).replace(/^[\s#>*_-]+|[\s。！？!?：:；;]+$/gu, "");
    if (!speakerCandidate || !/^[\p{L}\p{N}· ._'-]{1,30}$/u.test(speakerCandidate)) continue;
    entries.push({
      speaker: speakerCandidate,
      text: normalizedInlineText(quote[1] ?? quote[2] ?? quote[3])
    });
  }
  return entries.filter((entry) => entry.text);
}

export function extractScreenplayDialogueInventory(screenplayDocument) {
  const lines = screenplayLines(screenplayDocument?.content ?? "").map(normalizedScreenplayLine);
  const found = [];
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const match = line.match(INLINE_DIALOGUE_PATTERN);
    if (match) {
      const speaker = normalizedInlineText(match[1]).replace(/^\*{1,2}|\*{1,2}$/gu, "");
      const spokenText = normalizedInlineText(match[2] ?? match[3] ?? match[4]);
      if (speaker && spokenText && !SCENE_HEADING_PATTERN.test(line)) {
        found.push({ sourceLine: lineIndex + 1, speaker, text: spokenText });
        continue;
      }
    }

    const embedded = audibleQuotedSpeech(line);
    if (embedded.length) {
      for (const entry of embedded) found.push({ sourceLine: lineIndex + 1, ...entry });
      continue;
    }

    const speaker = speakerBlockName(line);
    if (!speaker) continue;
    let dialogueIndex = lineIndex + 1;
    while (dialogueIndex < lines.length && !lines[dialogueIndex]) dialogueIndex += 1;
    while (dialogueIndex < lines.length && PERFORMANCE_HINT_PATTERN.test(lines[dialogueIndex])) {
      dialogueIndex += 1;
      while (dialogueIndex < lines.length && !lines[dialogueIndex]) dialogueIndex += 1;
    }
    const spokenText = normalizedInlineText(lines[dialogueIndex]);
    if (
      !spokenText
      || SCENE_HEADING_PATTERN.test(spokenText)
      || /^#{1,6}\s/u.test(spokenText)
      || speakerBlockName(spokenText)
    ) {
      continue;
    }
    found.push({ sourceLine: dialogueIndex + 1, speaker, text: spokenText });
    lineIndex = dialogueIndex;
  }
  return found
    .sort((left, right) => left.sourceLine - right.sourceLine)
    .map((entry, index) => ({ ordinal: index + 1, ...entry }));
}

export function validateScreenplayAuthorityDocument(value) {
  const issues = [];
  if (!record(value)) {
    return { ok: false, issues: [issue("screenplayDocument", "screenplayDocument must be an object", "invalid_type")] };
  }
  if (!text(value.documentId)) issues.push(issue("documentId", "documentId is required", "required"));
  if (!Number.isInteger(value.revision) || value.revision < 1) {
    issues.push(issue("revision", "revision must be an integer >= 1", "invalid_number"));
  }
  const checksum = text(value.checksum);
  if (!SHA256_PATTERN.test(checksum)) {
    issues.push(issue("checksum", "checksum must be a lowercase SHA-256 content hash", "invalid_checksum"));
  }
  const content = typeof value.content === "string" ? value.content : "";
  if (!text(content)) {
    issues.push(issue("content", "complete screenplay content is required", "required"));
    return { ok: false, issues };
  }
  if (SHA256_PATTERN.test(checksum) && screenplayContentChecksum(content) !== checksum) {
    issues.push(issue("checksum", "checksum does not match the exact screenplay content bytes", "checksum_mismatch"));
  }

  const lines = screenplayLines(content).map((line, index) => ({ line: text(line), sourceLine: index + 1 }));
  const unresolvedStatus = lines.find((entry) => UNRESOLVED_SCREENPLAY_STATUS_PATTERN.test(entry.line));
  if (unresolvedStatus) {
    issues.push(issue(
      `content.line[${unresolvedStatus.sourceLine}]`,
      "authoritative screenplay content still declares itself draft, pending binding, or pending review",
      "screenplay_document_not_final"
    ));
  }
  const sceneIndexes = lines.flatMap((entry, index) => SCENE_HEADING_PATTERN.test(entry.line) ? [index] : []);
  if (!sceneIndexes.length) {
    issues.push(issue("content", "screenplay content must contain at least one explicit scene heading", "screenplay_scene_heading_required"));
  } else {
    for (const [sceneIndex, start] of sceneIndexes.entries()) {
      const end = sceneIndexes[sceneIndex + 1] ?? lines.length;
      const body = lines.slice(start + 1, end).filter((entry) => entry.line && !/^#{1,6}\s/u.test(entry.line));
      if (!body.length) {
        issues.push(issue(
          `content.scene[${sceneIndex}]`,
          `scene heading on line ${lines[start].sourceLine} has no action or dialogue body`,
          "screenplay_scene_body_required"
        ));
      }
    }
  }

  const dialogueInventory = extractScreenplayDialogueInventory(value);
  const dialogueSourceLines = new Set(dialogueInventory.map((entry) => entry.sourceLine));
  const ambiguousAudibleLines = lines.filter((entry) => (
    !dialogueSourceLines.has(entry.sourceLine)
    &&
    audibleQuotedSpeech(entry.line).length === 0
    && /[“”「」"]/.test(entry.line)
    && /(?:说|问|喊|叫|答|回应|回道|念道|嘀咕)/u.test(entry.line)
  ));
  for (const entry of ambiguousAudibleLines) {
    issues.push(issue(
      `content.line[${entry.sourceLine}]`,
      `audible quoted speech on line ${entry.sourceLine} uses an ambiguous dialogue format; normalize it to a speaker block or explicit speaker speech`,
      "ambiguous_dialogue_format"
    ));
  }
  const actionLines = lines.filter((entry) => (
    entry.line
    && !/^#{1,6}\s/u.test(entry.line)
    && !SCENE_HEADING_PATTERN.test(entry.line)
    && !dialogueSourceLines.has(entry.sourceLine)
  ));
  if (!actionLines.length) {
    issues.push(issue("content", "screenplay content must contain at least one action line", "screenplay_action_required"));
  }
  return { ok: issues.length === 0, issues };
}

export function assertScreenplayAuthorityDocument(value) {
  const validation = validateScreenplayAuthorityDocument(value);
  if (!validation.ok) {
    const error = new Error(`ScreenplayAuthorityDocument validation failed: ${validation.issues.map((entry) => `${entry.path}: ${entry.message}`).join("; ")}`);
    error.code = validation.issues.some((entry) => entry.code === "checksum_mismatch")
      ? "screenplay_document_checksum_mismatch"
      : "screenplay_document_identity_invalid";
    error.details = validation.issues;
    error.status = 400;
    throw error;
  }
  return value;
}

export function assertScreenplayDocumentInput(value, { documentId, currentRevision = 0 } = {}) {
  if (!record(value)) {
    const error = new Error("ScreenplayDocumentInputV1 must be an object");
    error.code = "screenplay_document_identity_invalid";
    error.status = 400;
    throw error;
  }
  const forbiddenIdentityFields = ["documentId", "revision"].filter((field) => Object.hasOwn(value, field));
  if (forbiddenIdentityFields.length) {
    const error = new Error("Screenplay document id and revision are server-owned and may not be supplied by authorEpisode");
    error.code = "screenplay_document_identity_invalid";
    error.details = { forbiddenIdentityFields };
    error.status = 400;
    throw error;
  }
  if (value.format !== "ScreenplayDocumentInputV1") {
    const error = new Error("sourceDocument.format must be ScreenplayDocumentInputV1");
    error.code = "screenplay_document_identity_invalid";
    error.status = 400;
    throw error;
  }
  if (!Number.isInteger(value.expectedRevision) || value.expectedRevision < 0) {
    const error = new Error("sourceDocument.expectedRevision must be an integer >= 0");
    error.code = "screenplay_document_identity_invalid";
    error.status = 400;
    throw error;
  }
  const checksum = text(value.checksum);
  if (!SHA256_PATTERN.test(checksum)) {
    const error = new Error("sourceDocument.checksum must be a 64-character lowercase SHA-256 hash");
    error.code = "screenplay_document_identity_invalid";
    error.status = 400;
    throw error;
  }
  assertScreenplayAuthorityDocument({
    documentId,
    revision: Math.max(1, Number(currentRevision) || 0),
    checksum,
    content: value.content
  });
  return {
    format: "ScreenplayDocumentInputV1",
    content: value.content,
    checksum,
    expectedRevision: value.expectedRevision
  };
}

export function assessScreenplayDialogueInventory({ dialogueInventory, screenplayDocument } = {}) {
  const expected = extractScreenplayDialogueInventory(screenplayDocument);
  const actual = Array.isArray(dialogueInventory) ? dialogueInventory : [];
  const mismatches = [];
  const missing = [];
  const extra = [];
  const mismatched = [];
  const maximum = Math.max(expected.length, actual.length);
  for (let index = 0; index < maximum; index += 1) {
    const expectedLine = expected[index] ?? null;
    const actualLine = actual[index] ?? null;
    if (!expectedLine || !record(actualLine)) {
      const mismatch = { ordinal: index + 1, expected: expectedLine, actual: actualLine };
      mismatches.push(mismatch);
      if (!expectedLine) extra.push(mismatch);
      else missing.push(mismatch);
      continue;
    }
    const matches = Number(actualLine.ordinal) === expectedLine.ordinal
      && normalizedInlineText(actualLine.speaker) === expectedLine.speaker
      && normalizedInlineText(actualLine.text) === expectedLine.text;
    if (!matches) {
      const mismatch = { ordinal: index + 1, expected: expectedLine, actual: actualLine };
      mismatches.push(mismatch);
      mismatched.push(mismatch);
    }
  }
  return {
    actualCount: actual.length,
    errors: mismatches.length ? ["dialogue_inventory_incomplete"] : [],
    expected,
    expectedCount: expected.length,
    extra,
    mismatched,
    missing,
    mismatches,
    ok: mismatches.length === 0
  };
}
