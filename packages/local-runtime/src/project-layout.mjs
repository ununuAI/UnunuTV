import { mkdirSync } from "node:fs";
import path from "node:path";

export function ensureProjectLayout(stateDirectory, mediaRoot) {
  for (const relative of ["temp", "backups"]) mkdirSync(path.join(stateDirectory, relative), { recursive: true });
  for (const relative of ["Images", "Videos", "Audio", "Worlds", ".cache/thumbnails", ".cache/proxies"]) {
    mkdirSync(path.join(mediaRoot, relative), { recursive: true });
  }
}
