const FINAL_SOUND_STATES = new Set(["candidate", "accepted", "rejected"]);

function issue(path, message, code = "invalid_field") {
  return { code, message, path };
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function positiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function finite(value) {
  return Number.isFinite(Number(value));
}

function requiredText(value, path, issues) {
  if (!text(value)) issues.push(issue(path, `${path} is required`, "required"));
}

function requiredTrue(value, path, issues) {
  if (value !== true) issues.push(issue(path, `${path} must be true`, "required"));
}

export function validateCinematicFinalSoundAcceptance(value) {
  const issues = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, issues: [issue("finalSoundAcceptance", "finalSoundAcceptance must be an object", "invalid_type")] };
  }
  for (const field of [
    "finalSoundAcceptanceId",
    "episodeId",
    "masterMediaId",
    "masterChecksum",
    "mixMediaId",
    "mixChecksum",
    "timelineId",
    "soundContributionId"
  ]) requiredText(value[field], field, issues);
  for (const field of ["timelineRevision", "soundContributionRevision", "durationMs"]) {
    if (!positiveInteger(value[field])) issues.push(issue(field, `${field} must be a positive integer`, "invalid_number"));
  }
  if (!FINAL_SOUND_STATES.has(value.state)) issues.push(issue("state", "state is invalid", "invalid_enum"));
  if (!Array.isArray(value.requiredStemRoles) || value.requiredStemRoles.some((entry) => !text(entry))) {
    issues.push(issue("requiredStemRoles", "requiredStemRoles must be an array of non-empty roles", "invalid_type"));
  }
  if (!Array.isArray(value.stemDeliveries)) {
    issues.push(issue("stemDeliveries", "stemDeliveries must be an array", "invalid_type"));
  }
  if (value.state !== "accepted") return { ok: issues.length === 0, issues };

  const inventory = value.dialogueInventory;
  if (!inventory || typeof inventory !== "object" || Array.isArray(inventory)) {
    issues.push(issue("dialogueInventory", "accepted final sound requires dialogueInventory", "required"));
  } else {
    for (const field of ["screenplayDocumentId", "screenplayChecksum", "deliverySetChecksum"]) {
      requiredText(inventory[field], `dialogueInventory.${field}`, issues);
    }
    for (const field of ["screenplayRevision", "lineCount"]) {
      if (!positiveInteger(inventory[field])) issues.push(issue(`dialogueInventory.${field}`, `${field} must be a positive integer`, "invalid_number"));
    }
    if (!Array.isArray(inventory.deliveryMediaIds) || inventory.deliveryMediaIds.some((entry) => !text(entry))) {
      issues.push(issue("dialogueInventory.deliveryMediaIds", "deliveryMediaIds must be an array of media ids", "invalid_type"));
    }
  }

  const playback = value.playbackEvidence;
  if (!playback || typeof playback !== "object" || Array.isArray(playback)) {
    issues.push(issue("playbackEvidence", "accepted final sound requires playbackEvidence", "required"));
  } else {
    for (const field of ["playbackReceiptId", "reviewId"]) requiredText(playback[field], `playbackEvidence.${field}`, issues);
    requiredTrue(playback.fullPlaybackVerified, "playbackEvidence.fullPlaybackVerified", issues);
    requiredTrue(playback.ownerAccepted, "playbackEvidence.ownerAccepted", issues);
    if (text(playback.reviewerType) !== "owner") issues.push(issue("playbackEvidence.reviewerType", "accepted final sound requires Owner review", "required"));
    if (!positiveInteger(playback.coveredDurationMs) || playback.coveredDurationMs < value.durationMs) {
      issues.push(issue("playbackEvidence.coveredDurationMs", "full playback must cover the complete final duration", "mismatch"));
    }
    if (Number(playback.uncoveredDurationMs) !== 0) {
      issues.push(issue("playbackEvidence.uncoveredDurationMs", "accepted playback cannot leave an uncovered interval", "mismatch"));
    }
  }

  const mixPlayback = value.mixPlaybackEvidence;
  if (!mixPlayback || typeof mixPlayback !== "object" || Array.isArray(mixPlayback)) {
    issues.push(issue("mixPlaybackEvidence", "accepted final sound requires complete mix playback evidence", "required"));
  } else {
    requiredText(mixPlayback.reviewId, "mixPlaybackEvidence.reviewId", issues);
    if (!positiveInteger(mixPlayback.durationMs) || mixPlayback.durationMs !== value.durationMs) {
      issues.push(issue("mixPlaybackEvidence.durationMs", "mix playback duration must equal picture lock duration", "mismatch"));
    }
  }

  const technical = value.technicalEvidence;
  if (!technical || typeof technical !== "object" || Array.isArray(technical)) {
    issues.push(issue("technicalEvidence", "accepted final sound requires technicalEvidence", "required"));
  } else {
    requiredText(technical.qcReportId, "technicalEvidence.qcReportId", issues);
    if (technical.status !== "pass") issues.push(issue("technicalEvidence.status", "technical QC must pass", "mismatch"));
    if (technical.audioCodec !== "aac") issues.push(issue("technicalEvidence.audioCodec", "final picture master audio must be AAC", "mismatch"));
    if (Number(technical.sampleRateHz) !== 48000) issues.push(issue("technicalEvidence.sampleRateHz", "final sound must be 48 kHz", "mismatch"));
    if (Number(technical.channels) !== 2 || text(technical.channelLayout).toLowerCase() !== "stereo") {
      issues.push(issue("technicalEvidence.channels", "final sound must be 2-channel stereo", "mismatch"));
    }
    if (!positiveInteger(technical.durationMs)) issues.push(issue("technicalEvidence.durationMs", "technical duration is required", "invalid_number"));
  }

  const loudness = value.loudnessMeasurement;
  if (!loudness || typeof loudness !== "object" || Array.isArray(loudness)) {
    issues.push(issue("loudnessMeasurement", "accepted final sound requires measured loudness", "required"));
  } else {
    for (const field of ["integratedLufs", "truePeakDbtp", "loudnessRangeLu"]) {
      if (!finite(loudness[field])) issues.push(issue(`loudnessMeasurement.${field}`, `${field} must be finite`, "invalid_number"));
    }
    for (const field of ["targetProfile", "measuredBy"]) requiredText(loudness[field], `loudnessMeasurement.${field}`, issues);
    requiredTrue(loudness.complianceVerified, "loudnessMeasurement.complianceVerified", issues);
  }

  const checks = value.contentChecks;
  if (!checks || typeof checks !== "object" || Array.isArray(checks)) {
    issues.push(issue("contentChecks", "accepted final sound requires contentChecks", "required"));
  } else {
    for (const field of [
      "dialogueIntelligibilityVerified",
      "exactDialogueInventoryVerified",
      "syncVerified",
      "ambienceContinuityVerified",
      "foleyBalanceVerified",
      "musicRightsVerified",
      "silenceIntentVerified",
      "seamPlaybackVerified",
      "noDropoutVerified",
      "noClippingVerified",
      "phaseVerified"
    ]) requiredTrue(checks[field], `contentChecks.${field}`, issues);
  }

  const requiredRoles = [...new Set(list(value.requiredStemRoles).map(text).filter(Boolean))];
  const deliveries = list(value.stemDeliveries);
  const deliveredRoles = deliveries.map((entry) => text(entry?.role)).filter(Boolean);
  if (new Set(deliveredRoles).size !== deliveredRoles.length) {
    issues.push(issue("stemDeliveries", "each stem role must have one current delivery", "duplicate"));
  }
  for (const role of requiredRoles) {
    const delivery = deliveries.find((entry) => text(entry?.role) === role);
    if (
      !delivery
      || !text(delivery.mediaId)
      || !text(delivery.mediaChecksum)
      || !text(delivery.reviewId)
      || !positiveInteger(delivery.durationMs)
      || delivery.fullPlaybackVerified !== true
    ) {
      issues.push(issue("stemDeliveries", `required stem ${role} lacks media/checksum/review/full playback`, "required"));
    }
  }
  for (const role of deliveredRoles) {
    if (!requiredRoles.includes(role)) issues.push(issue("stemDeliveries", `unexpected stem role: ${role}`, "unexpected"));
  }
  return { ok: issues.length === 0, issues };
}
