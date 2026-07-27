import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CINEMATIC_WORKFLOW_SKILL_VERSION } from "@ununu/unutv-contracts";

const REFERENCE_FILES = Object.freeze([
  "references/cross-modal-image-video-control.md",
  "references/sequence-previs-visual-memory-and-trace.md",
  "references/sequence-state-canon-retake-control.md"
]);

function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }

export function loadCinematicSkillContext({ loadedBy = "ununu-cinematic-production", loadedAt = new Date().toISOString() } = {}) {
  const sourceDir = dirname(fileURLToPath(import.meta.url));
  const skillPath = join(sourceDir, "../../../skills/ununu-cinematic-production/SKILL.md");
  if (!existsSync(skillPath)) throw new Error(`Cinematic Skill not found: ${skillPath}`);
  const skillBytes = readFileSync(skillPath);
  const referenceFiles = REFERENCE_FILES.map((relativePath) => {
    const path = join(dirname(skillPath), relativePath);
    if (!existsSync(path)) throw new Error(`Cinematic Skill reference not found: ${path}`);
    return { path, sha256: sha256(readFileSync(path)) };
  });
  return {
    id: "ununu-cinematic-production", version: CINEMATIC_WORKFLOW_SKILL_VERSION, sha256: sha256(skillBytes), path: skillPath,
    loadedBy, loadedAt, referenceFiles
  };
}
