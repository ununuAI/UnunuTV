import { parseJson, UnuTvError } from "@ununu/unutv-contracts";

function requiredValue(value, flag) {
  if (typeof value !== "string" || !value.trim()) {
    throw new UnuTvError("missing_flag", `--${flag} is required`);
  }
  return value;
}

export function executeScreenplayRevisionCommand(app, flags) {
  const data = parseJson(flags.data, {});
  const rawRevision = flags["expected-revision"] ?? data.expectedScreenplayRevision;
  const expectedScreenplayRevision = Number(rawRevision);
  if (!Number.isFinite(expectedScreenplayRevision)) {
    throw new UnuTvError("invalid_flag", "--expected-revision must be a number");
  }
  return app.reviseCinematicScreenplay({
    projectId: requiredValue(flags.project, "project"),
    automationRunId: requiredValue(flags["automation-run"] ?? data.automationRunId, "automation-run"),
    expectedScreenplayDocumentId: requiredValue(
      flags["expected-document"] ?? data.expectedScreenplayDocumentId,
      "expected-document"
    ),
    expectedScreenplayRevision,
    expectedScreenplayContentChecksum: requiredValue(
      flags["expected-checksum"] ?? data.expectedScreenplayContentChecksum,
      "expected-checksum"
    ),
    reason: requiredValue(flags.reason ?? data.reason, "reason")
  });
}
