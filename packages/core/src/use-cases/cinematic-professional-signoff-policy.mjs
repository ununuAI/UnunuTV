function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function integer(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function targetType(value) {
  return text(value).replace(/[^a-z]/giu, "").toLowerCase();
}

function targetRevision(contribution, kind) {
  const fields = contribution?.structuredFields && typeof contribution.structuredFields === "object"
    ? contribution.structuredFields
    : {};
  const specific = kind === "unit" ? fields.sourceGenerationUnitRevision : fields.sourceShotRevision;
  return integer(specific ?? fields.targetRevision);
}

function shotRevisionMap(value) {
  if (Array.isArray(value)) {
    return new Map(value.map((entry) => [text(entry?.shotId), integer(entry?.revision)]).filter(([id, revision]) => id && revision));
  }
  if (!value || typeof value !== "object") return new Map();
  return new Map(Object.entries(value).map(([id, revision]) => [text(id), integer(revision)]).filter(([id, revision]) => id && revision));
}

function matchesUnit(contribution, generationUnit, shots) {
  const type = targetType(contribution?.targetType);
  if (!["generationunit", "generationunitspec"].includes(type)) return false;
  if (text(contribution?.targetId) !== text(generationUnit?.generationUnitId)) return false;
  if (targetRevision(contribution, "unit") !== integer(generationUnit?.revision)) return false;
  const sourceShots = shotRevisionMap(contribution?.structuredFields?.sourceShotRevisions);
  return shots.every((shot) => sourceShots.get(text(shot?.shotId)) === integer(shot?.revision));
}

function matchesShot(contribution, shot) {
  const type = targetType(contribution?.targetType);
  if (!["cinematicshot", "cinematicshotspec", "shot"].includes(type)) return false;
  return text(contribution?.targetId) === text(shot?.shotId)
    && targetRevision(contribution, "shot") === integer(shot?.revision);
}

function hasGroundedKnowledge(contribution, knowledgePort = null) {
  const refs = Array.isArray(contribution?.knowledgeRefs) ? contribution.knowledgeRefs.map(text) : [];
  const hasShape = refs.some((entry) => entry.startsWith("cap-")) && refs.some((entry) => entry.startsWith("kn-"));
  if (!hasShape) return false;
  // When a Knowledge Port is available, require real resolvable IDs (no fake prefix grounding).
  if (knowledgePort?.getKnowledgeByIds) {
    try {
      const resolved = knowledgePort.getKnowledgeByIds(refs);
      const caps = refs.filter((entry) => entry.startsWith("cap-"));
      const kns = refs.filter((entry) => entry.startsWith("kn-"));
      const capMap = resolved.capabilities instanceof Map ? resolved.capabilities : new Map();
      const knMap = resolved.atoms instanceof Map ? resolved.atoms : new Map();
      return caps.every((id) => capMap.has(id)) && kns.every((id) => knMap.has(id));
    } catch {
      return false;
    }
  }
  return hasShape;
}

function belongsToManifest(contribution, manifestIds) {
  return manifestIds.has(text(contribution?.structuredFields?.teamManifestId));
}

function hasNoVeto(contribution) {
  return !Array.isArray(contribution?.vetoFindings) || contribution.vetoFindings.length === 0;
}

function currentEntries(entries, generationUnit, shots, predicate = () => true) {
  const eligible = entries.filter(predicate);
  const unitEntries = eligible.filter((entry) => matchesUnit(entry, generationUnit, shots));
  if (unitEntries.length) return unitEntries;
  const shotEntries = shots.flatMap((shot) => eligible.filter((entry) => matchesShot(entry, shot)));
  const coveredShotIds = new Set(shotEntries.map((entry) => text(entry.targetId)));
  return shots.every((shot) => coveredShotIds.has(text(shot?.shotId))) ? shotEntries : [];
}

export function assessProfessionalSignoffs(professionalContributions, { generationUnit, shots = [], teamManifestIds = [], knowledgePort = null } = {}) {
  const contributions = Array.isArray(professionalContributions) ? professionalContributions : [];
  const roles = [...new Set(contributions.map((entry) => text(entry?.roleId)).filter(Boolean))];
  const manifests = new Set((Array.isArray(teamManifestIds) ? teamManifestIds : []).map(text).filter(Boolean));
  const currentByRole = Object.fromEntries(roles.map((roleId) => [
    roleId,
    currentEntries(contributions.filter((entry) => text(entry?.roleId) === roleId), generationUnit, shots, hasNoVeto)
  ]));
  const groundedByRole = Object.fromEntries(roles.map((roleId) => [
    roleId,
    currentEntries(contributions.filter((entry) => text(entry?.roleId) === roleId), generationUnit, shots, (entry) => hasNoVeto(entry) && hasGroundedKnowledge(entry, knowledgePort))
  ]));
  const manifestByRole = Object.fromEntries(roles.map((roleId) => [
    roleId,
    currentEntries(contributions.filter((entry) => text(entry?.roleId) === roleId), generationUnit, shots, (entry) => hasNoVeto(entry) && hasGroundedKnowledge(entry, knowledgePort) && belongsToManifest(entry, manifests))
  ]));
  const ids = (entries) => [...new Set(entries.map((entry) => entry.contributionId).filter(Boolean))];
  return {
    professionalRoles: roles,
    currentProfessionalRoles: roles.filter((roleId) => currentByRole[roleId].length),
    knowledgeGroundedProfessionalRoles: roles.filter((roleId) => groundedByRole[roleId].length),
    manifestBoundProfessionalRoles: roles.filter((roleId) => manifestByRole[roleId].length),
    currentContributionIdsByRole: Object.fromEntries(roles.map((roleId) => [roleId, ids(currentByRole[roleId])])),
    vetoedContributionIdsByRole: Object.fromEntries(roles.map((roleId) => [roleId, ids(contributions.filter((entry) => text(entry?.roleId) === roleId && !hasNoVeto(entry)))])),
    currentContributions: Object.values(currentByRole).flat(),
    teamManifestIds: [...manifests]
  };
}
