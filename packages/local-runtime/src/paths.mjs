import os from "node:os";
import path from "node:path";

export function resolveDataRoot(explicitRoot) {
  return path.resolve(explicitRoot || process.env.UNUTV_DATA_DIR || path.join(os.homedir(), ".unutv"));
}

export function projectDirectory(dataRoot, projectId) {
  return path.join(dataRoot, "projects", projectId);
}

export function projectDatabasePath(dataRoot, projectId) {
  return path.join(projectDirectory(dataRoot, projectId), "project.sqlite");
}

