import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const sourceRoots = ["apps", "packages"];
const forbiddenBrand = ["lib", "tv"].join("");
const atomicModulePattern = /\.(mjs|js|jsx)$/;
const failures = [];
const orchestrationModuleCeilings = new Map([
  ["packages/core/src/use-cases/automation-stage-executor.mjs", 1500],
  ["packages/core/src/use-cases/cinematic-workflow-use-cases.mjs", 1400],
  ["packages/core/src/use-cases/storyboard-batch-use-cases.mjs", 600],
  ["packages/core/src/workers/unit-design-worker.mjs", 700]
]);

async function files(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (["node_modules", ".next", "dist"].includes(entry.name)) continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await files(target));
    else if (/\.(mjs|js|jsx|json)$/.test(entry.name)) result.push(target);
  }
  return result;
}

for (const sourceRoot of sourceRoots) {
  for (const filePath of await files(path.join(root, sourceRoot))) {
    const source = await readFile(filePath, "utf8");
    const relative = path.relative(root, filePath);
    if (source.toLowerCase().includes(forbiddenBrand)) failures.push(`${relative}: unrelated external product vocabulary`);
    if (atomicModulePattern.test(filePath)) {
      const lineCount = source.split("\n").length;
      const lineCeiling = orchestrationModuleCeilings.get(relative) ?? 500;
      if (lineCount > lineCeiling) failures.push(`${relative}: ${lineCount} lines exceeds ${lineCeiling}-line module ceiling`);
    }
    if (relative.startsWith(`packages${path.sep}core${path.sep}`) && /node:(fs|sqlite|http)|from ["'](react|next)/.test(source)) {
      failures.push(`${relative}: core imports an effect or UI adapter`);
    }
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("Architecture boundaries verified.");
