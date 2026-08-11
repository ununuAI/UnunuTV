import {
  assessScreenplayDialogueInventory,
  extractScreenplayDialogueInventory,
  validateScreenplayAuthorityDocument
} from "@ununu/unutv-contracts";

export const CINEMATIC_DEVELOPMENT_REVIEW_ROLES = Object.freeze([
  "script_doctor",
  "dialogue_editor",
  "platform_editor"
]);

const ROLE_DIMENSIONS = Object.freeze({
  script_doctor: Object.freeze([
    "causal_chain",
    "character_objective_resistance",
    "conflict_progression",
    "information_reveal",
    "production_feasibility"
  ]),
  dialogue_editor: Object.freeze([
    "character_voiceprint",
    "subtext",
    "conflict_drive",
    "genre_voice",
    "information_efficiency",
    "rhythm",
    "memorable_line"
  ]),
  platform_editor: Object.freeze([
    "opening_3_seconds",
    "opening_15_seconds",
    "opening_30_seconds",
    "progression_cadence",
    "ending_hook"
  ])
});

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function integer(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function normalizedTargetType(value) {
  return text(value).replace(/[^a-z]/giu, "").toLowerCase();
}

function targetsCurrentStory(contribution, storyPacket) {
  const targetTypes = new Set(["story", "storypacket", "storyproductionpacket"]);
  const fields = contribution?.structuredFields && typeof contribution.structuredFields === "object"
    ? contribution.structuredFields
    : {};
  return targetTypes.has(normalizedTargetType(contribution?.targetType))
    && text(contribution?.targetId) === text(storyPacket?.storyPacketId)
    && integer(fields.sourceStoryPacketRevision ?? fields.targetRevision) === integer(storyPacket?.revision);
}

function screenplayBinding(contribution) {
  const fields = contribution?.structuredFields && typeof contribution.structuredFields === "object"
    ? contribution.structuredFields
    : {};
  return {
    checksum: text(fields.sourceScreenplayDocumentChecksum).toLowerCase(),
    documentId: text(fields.sourceScreenplayDocumentId),
    revision: integer(fields.sourceScreenplayDocumentRevision)
  };
}

function targetsCurrentScreenplay(contribution, screenplayDocument) {
  const binding = screenplayBinding(contribution);
  return binding.documentId === text(screenplayDocument?.documentId)
    && binding.revision === integer(screenplayDocument?.revision)
    && binding.checksum === text(screenplayDocument?.checksum).toLowerCase();
}

function screenplayBindingIssue(contribution, screenplayDocument) {
  const binding = screenplayBinding(contribution);
  const missingFields = [];
  if (!binding.documentId) missingFields.push("sourceScreenplayDocumentId");
  if (!binding.revision) missingFields.push("sourceScreenplayDocumentRevision");
  if (!binding.checksum) missingFields.push("sourceScreenplayDocumentChecksum");
  if (missingFields.length) {
    return {
      code: "screenplay_review_binding_required",
      issues: missingFields,
      message: "审核必须绑定完整剧本文档的 documentId、revision 与正文 checksum；旧 StoryPacket-only 审核已失效。"
    };
  }
  return {
    actual: binding,
    code: "screenplay_review_stale",
    expected: {
      checksum: text(screenplayDocument?.checksum).toLowerCase(),
      documentId: text(screenplayDocument?.documentId),
      revision: integer(screenplayDocument?.revision)
    },
    issues: ["screenplay_binding_mismatch"],
    message: "审核绑定的完整剧本文档不是当前精确版本，必须对当前正文重新审核。"
  };
}

function findingHasEvidence(finding) {
  if (!finding || typeof finding !== "object") return false;
  const priority = text(finding.priority).toLowerCase();
  return ["must_fix", "recommend", "discuss", "protect"].includes(priority)
    && text(finding.evidence)
    && text(finding.diagnosis);
}

function roleAudit(contribution, roleId, screenplayDocument) {
  const fields = contribution?.structuredFields && typeof contribution.structuredFields === "object"
    ? contribution.structuredFields
    : {};
  const dimensions = new Set(list(fields.reviewDimensions).map(text).filter(Boolean));
  const missingDimensions = ROLE_DIMENSIONS[roleId].filter((dimension) => !dimensions.has(dimension));
  const findings = list(fields.findings);
  const errors = [];
  if (!list(fields.evidence).filter(text).length) errors.push("evidence_required");
  if (!findings.length || findings.some((finding) => !findingHasEvidence(finding))) errors.push("evidence_grounded_findings_required");
  if (missingDimensions.length) errors.push("review_dimensions_incomplete");
  if (!list(contribution?.acceptanceCriteria).filter(text).length) errors.push("acceptance_criteria_required");
  if (list(contribution?.vetoFindings).length) errors.push("unresolved_veto_findings");
  let dialogueCoverage = null;
  if (roleId === "dialogue_editor") {
    if (!Array.isArray(fields.dialogueInventory)) {
      errors.push("dialogue_inventory_required");
    } else {
      dialogueCoverage = assessScreenplayDialogueInventory({
        dialogueInventory: fields.dialogueInventory,
        screenplayDocument
      });
      errors.push(...dialogueCoverage.errors);
    }
    if (!fields.speechDensityAudit || typeof fields.speechDensityAudit !== "object") errors.push("speech_density_audit_required");
  }
  if (roleId === "platform_editor") {
    if (!fields.rhythmProfile || typeof fields.rhythmProfile !== "object") errors.push("rhythm_profile_required");
  }
  return { dialogueCoverage, errors: [...new Set(errors)], missingDimensions };
}

export function assessCinematicDevelopmentReviews({ contributions = [], screenplayDocument, storyPacket } = {}) {
  const current = list(contributions).filter((entry) => targetsCurrentStory(entry, storyPacket));
  const reviews = {};
  const errors = [];
  const screenplayValidation = validateScreenplayAuthorityDocument(screenplayDocument);
  if (!screenplayValidation.ok) {
    errors.push({
      code: "screenplay_authority_invalid",
      issues: screenplayValidation.issues,
      message: "必须提交 documentId、revision、正文 SHA-256 与最低结构完整性均可验证的完整剧本文档。"
    });
  }
  if (screenplayValidation.ok && Array.isArray(storyPacket?.dialogue)) {
    const storyDialogueCoverage = assessScreenplayDialogueInventory({
      dialogueInventory: storyPacket.dialogue.map((entry, index) => ({
        ordinal: index + 1,
        speaker: typeof entry === "string" ? "" : entry?.speaker ?? entry?.character ?? entry?.name,
        text: typeof entry === "string" ? entry : entry?.text ?? entry?.dialogue
      })),
      screenplayDocument
    });
    const screenplayDialogue = extractScreenplayDialogueInventory(screenplayDocument);
    if (!storyDialogueCoverage.ok && (storyPacket.dialogue.length || screenplayDialogue.length)) {
      errors.push({
        code: "story_packet_dialogue_mismatch",
        dialogueCoverage: storyDialogueCoverage,
        message: "StoryProductionPacket.dialogue 必须与当前完整剧本正文的全部对白逐条、逐字、逐序对账。"
      });
    }
  }
  for (const roleId of CINEMATIC_DEVELOPMENT_REVIEW_ROLES) {
    const roleCandidates = current.filter((entry) => text(entry?.roleId) === roleId);
    if (!roleCandidates.length) {
      errors.push({
        code: "development_review_role_required",
        message: `当前 StoryProductionPacket 与完整剧本缺少 ${roleId} 的证据化审核。`,
        roleId
      });
      reviews[roleId] = { contribution: null, errors: ["missing"], ok: false };
      continue;
    }
    const currentScreenplayCandidates = screenplayValidation.ok
      ? roleCandidates.filter((entry) => targetsCurrentScreenplay(entry, screenplayDocument))
      : [];
    if (!currentScreenplayCandidates.length) {
      const latest = [...roleCandidates].sort((left, right) => {
        const revisionDelta = integer(right?.revision) - integer(left?.revision);
        return revisionDelta || text(right?.createdAt).localeCompare(text(left?.createdAt));
      })[0];
      const bindingError = screenplayBindingIssue(latest, screenplayDocument);
      errors.push({ ...bindingError, contributionId: latest?.contributionId, roleId });
      reviews[roleId] = {
        contribution: latest,
        errors: bindingError.issues,
        ok: false,
        screenplayBinding: screenplayBinding(latest)
      };
      continue;
    }
    const candidates = currentScreenplayCandidates
      .sort((left, right) => {
        const revisionDelta = integer(right?.revision) - integer(left?.revision);
        return revisionDelta || text(right?.createdAt).localeCompare(text(left?.createdAt));
      });
    const contribution = candidates[0] ?? null;
    const audit = roleAudit(contribution, roleId, screenplayDocument);
    reviews[roleId] = {
      contribution,
      ...audit,
      ok: audit.errors.length === 0,
      screenplayBinding: screenplayBinding(contribution)
    };
    if (audit.errors.length) {
      const dialogueInventoryIncomplete = audit.errors.includes("dialogue_inventory_incomplete");
      errors.push({
        code: dialogueInventoryIncomplete ? "dialogue_inventory_incomplete" : "development_review_incomplete",
        message: `${roleId} 审核缺少导演流程要求的证据、维度或交接字段。`,
        contributionId: contribution.contributionId,
        ...(dialogueInventoryIncomplete ? { dialogueCoverage: audit.dialogueCoverage } : {}),
        roleId,
        issues: audit.errors,
        missingDimensions: audit.missingDimensions
      });
    }
  }
  return {
    currentContributionIds: Object.values(reviews).map((entry) => entry.contribution?.contributionId).filter(Boolean),
    errors,
    ok: errors.length === 0,
    reviews,
    screenplayDocumentChecksum: screenplayDocument?.checksum ?? null,
    screenplayDocumentId: screenplayDocument?.documentId ?? null,
    screenplayDocumentRevision: screenplayDocument?.revision ?? null,
    storyPacketId: storyPacket?.storyPacketId ?? null,
    storyPacketRevision: storyPacket?.revision ?? null
  };
}
