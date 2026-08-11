import { readFileSync } from "node:fs";
import { parseJson, UnuTvError } from "@ununu/unutv-contracts";

const REQUIRED_ROLES = Object.freeze(["script_doctor", "dialogue_editor", "platform_editor"]);

function requireText(value, flag) {
  if (typeof value !== "string" || !value.trim()) {
    throw new UnuTvError("missing_flag", `--${flag} is required`);
  }
  return value;
}

function currentReviewBinding(status) {
  const blocker = status?.nextAction?.blocker;
  const details = blocker?.details ?? {};
  if (
    status?.nextAction?.type !== "repair"
    || status?.nextAction?.phase !== "script_analysis"
    || blocker?.code !== "cinematic_development_review_required"
  ) {
    throw new UnuTvError(
      "screenplay_development_review_not_current",
      "The current persisted nextAction is not screenplay development review",
      409
    );
  }
  return {
    screenplayChecksum: requireText(details.screenplayDocumentChecksum, "screenplay-checksum"),
    screenplayDocumentId: requireText(details.screenplayDocumentId, "screenplay-document"),
    screenplayRevision: details.screenplayDocumentRevision,
    storyPacketId: requireText(details.storyPacketId, "story-packet"),
    storyRevision: details.storyPacketRevision
  };
}

function bindContribution(draft, binding) {
  const { contributionId, createdAt, revision, updatedAt, ...content } = draft;
  return {
    ...content,
    knowledgeRefs: Array.isArray(content.knowledgeRefs) ? content.knowledgeRefs : [],
    targetType: "StoryProductionPacket",
    targetId: binding.storyPacketId,
    structuredFields: {
      ...content.structuredFields,
      sourceStoryPacketRevision: binding.storyRevision,
      sourceScreenplayDocumentId: binding.screenplayDocumentId,
      sourceScreenplayDocumentRevision: binding.screenplayRevision,
      sourceScreenplayDocumentChecksum: binding.screenplayChecksum
    }
  };
}

function contributionMatchesBinding(contribution, roleId, binding) {
  const fields = contribution?.structuredFields ?? {};
  return contribution?.roleId === roleId
    && contribution?.targetId === binding.storyPacketId
    && fields.sourceStoryPacketRevision === binding.storyRevision
    && fields.sourceScreenplayDocumentId === binding.screenplayDocumentId
    && fields.sourceScreenplayDocumentRevision === binding.screenplayRevision
    && fields.sourceScreenplayDocumentChecksum === binding.screenplayChecksum;
}

export async function executeScreenplayReviewCommand(app, flags) {
  const projectId = requireText(flags.project, "project");
  const automationRunId = requireText(flags["automation-run"], "automation-run");
  const reviewFile = requireText(flags["review-file"], "review-file");
  const status = await app.getCinematicWorkflowStatus({ projectId, automationRunId });
  const binding = currentReviewBinding(status);
  const productionId = requireText(status.run?.configuration?.productionId, "production");
  const bundle = parseJson(readFileSync(reviewFile, "utf8"), {});
  const drafts = Array.isArray(bundle.contributions) ? bundle.contributions : [];
  const roles = drafts.map((entry) => entry?.roleId);
  if (
    drafts.length !== REQUIRED_ROLES.length
    || REQUIRED_ROLES.some((roleId) => roles.filter((entry) => entry === roleId).length !== 1)
  ) {
    throw new UnuTvError(
      "screenplay_development_review_bundle_invalid",
      "Review bundle must contain exactly one script_doctor, dialogue_editor and platform_editor contribution",
      400
    );
  }
  const contributions = [];
  const current = await app.listProfessionalContributions({
    projectId,
    productionId,
    targetType: "StoryProductionPacket",
    targetId: binding.storyPacketId
  });
  const takeoverRequired = status.session?.state !== "manual_editable";
  if (takeoverRequired) {
    if (typeof app.takeoverAutomation !== "function") {
      throw new UnuTvError(
        "screenplay_development_review_takeover_unavailable",
        "The persisted screenplay review nextAction requires an automation takeover before review mutation",
        409,
        { state: status.session?.state ?? null }
      );
    }
    await app.takeoverAutomation({
      projectId,
      automationRunId,
      snapshot: {
        reason: "persisted_screenplay_development_review_next_action",
        screenplayDocumentId: binding.screenplayDocumentId,
        screenplayRevision: binding.screenplayRevision,
        screenplayChecksum: binding.screenplayChecksum,
        storyPacketId: binding.storyPacketId,
        storyRevision: binding.storyRevision
      }
    });
  }
  for (const roleId of REQUIRED_ROLES) {
    const existing = current.find((entry) => contributionMatchesBinding(entry, roleId, binding));
    if (existing) {
      contributions.push(existing);
      continue;
    }
    const contribution = bindContribution(drafts.find((entry) => entry.roleId === roleId), binding);
    contributions.push(await app.addProfessionalContribution({ projectId, productionId, contribution }));
  }
  if (takeoverRequired || (status.session?.state === "manual_editable" && status.run?.status === "taken_over")) {
    await app.resumeAutomation({ projectId, automationRunId });
  }
  const advanceReceipt = await app.advanceCinematicWorkflow({ projectId, automationRunId });
  return {
    format: "ScreenplayDevelopmentReviewReceiptV1",
    reviewFile,
    binding,
    contributionIds: contributions.map((entry) => entry.contributionId),
    advanceReceipt
  };
}
