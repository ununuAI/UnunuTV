import { parseJson, UnuTvError } from "@ununu/unutv-contracts";

function required(flags, name) {
  if (typeof flags[name] !== "string" || !flags[name].trim()) throw new UnuTvError("missing_flag", `--${name} is required`);
  return flags[name];
}
function data(flags) { return parseJson(flags.data, {}); }

export async function executeCinematicSequenceCommand(app, area, action, flags) {
  if (!["sequence-previs", "visual-context", "take-memory", "decision-trace"].includes(area)) return { handled: false };
  const projectId = required(flags, "project"), productionId = required(flags, "production");
  if (area === "sequence-previs" && action === "create") return { handled: true, value: await app.saveSequencePrevis({ projectId, productionId, sequencePrevis: data(flags) }) };
  if (area === "sequence-previs" && action === "list") return { handled: true, value: { sequencePrevis: await app.listSequencePrevis({ projectId, productionId }) } };
  if (area === "sequence-previs" && action === "get") return { handled: true, value: await app.getSequencePrevis({ projectId, productionId, sequencePrevisId: required(flags, "previs") }) };
  if (area === "sequence-previs" && action === "update") return { handled: true, value: await app.updateSequencePrevis({ projectId, productionId, sequencePrevisId: required(flags, "previs"), patch: data(flags) }) };
  if (area === "sequence-previs" && action === "versions") return { handled: true, value: { versions: await app.listSequencePrevisVersions({ projectId, productionId, sequencePrevisId: required(flags, "previs") }) } };
  if (area === "sequence-previs" && action === "review") return { handled: true, value: await app.reviewSequencePrevis({ projectId, productionId, sequencePrevisId: required(flags, "previs"), revision: flags.revision ? Number(flags.revision) : undefined, state: required(flags, "state"), note: flags.note }) };
  if (area === "visual-context" && action === "compile") return { handled: true, value: await app.compileVisualContextBundle({ projectId, productionId, sequencePrevisId: required(flags, "previs"), shotId: required(flags, "shot") }) };
  if (area === "visual-context" && action === "list") return { handled: true, value: { visualContextBundles: await app.listVisualContextBundles({ projectId, productionId, shotId: flags.shot }) } };
  if (area === "take-memory" && action === "add") return { handled: true, value: await app.addVisualTakeMemory({ projectId, productionId, visualTakeMemory: data(flags) }) };
  if (area === "take-memory" && action === "list") return { handled: true, value: { visualTakeMemories: await app.listVisualTakeMemories({ projectId, productionId, generationUnitId: flags.unit }) } };
  if (area === "decision-trace" && action === "add") return { handled: true, value: await app.addCreativeDecisionTrace({ projectId, productionId, creativeDecisionTrace: data(flags) }) };
  if (area === "decision-trace" && action === "list") return { handled: true, value: { creativeDecisionTraces: await app.listCreativeDecisionTraces({ projectId, productionId, targetType: flags["target-type"], targetId: flags.target }) } };
  throw new UnuTvError("unknown_command", `Unknown sequence workspace command: ${area} ${action}`, 400);
}
