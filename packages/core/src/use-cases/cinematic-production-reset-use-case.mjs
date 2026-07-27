import { requireText } from "@ununu/unutv-contracts";

function requireResetPort(ports) {
  if (typeof ports.projects?.resetCinematicProduction !== "function") {
    throw new TypeError("Missing cinematic production reset port: projects.resetCinematicProduction");
  }
  return ports.projects.resetCinematicProduction.bind(ports.projects);
}

/**
 * Destructive but scoped reset: keep the real StoryProductionPacket and its
 * source node, remove every downstream cinematic/edit artifact, and return an
 * auditable receipt. The caller must use the CLI/API; Core never opens SQLite.
 */
export function createCinematicProductionResetUseCase(ports) {
  const resetRecord = requireResetPort(ports);

  async function resetCinematicProduction(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const productionId = requireText(input.productionId, "productionId");
    return resetRecord(projectId, productionId, input.sourceNodeId ?? null);
  }

  return { resetCinematicProduction };
}
