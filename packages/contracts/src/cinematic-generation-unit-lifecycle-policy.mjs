export const CINEMATIC_GENERATION_UNIT_LIFECYCLES = Object.freeze([
  "active",
  "blocked_by_authority",
  "blocked_by_rejected_continuity_source",
  "superseded"
]);

export function evaluateGenerationUnitLifecycle({ generationUnit } = {}) {
  const lifecycle = generationUnit?.lifecycle ?? "active";
  const errors = [];
  if (!CINEMATIC_GENERATION_UNIT_LIFECYCLES.includes(lifecycle)) {
    errors.push({ code: "generation_unit_lifecycle_invalid", message: `未知的生成单元生命周期：${lifecycle}。` });
  } else if (lifecycle === "superseded") {
    errors.push({
      code: "generation_unit_superseded",
      message: `生成单元已废弃${generationUnit?.supersededReason ? `：${generationUnit.supersededReason}` : "，不得再编译或运行。"}`
    });
  } else if (lifecycle !== "active") {
    errors.push({ code: "generation_unit_lifecycle_blocked", message: `生成单元当前为 ${lifecycle}，必须先解除上游阻断。` });
  }
  return Object.freeze({ active: errors.length === 0, errors: Object.freeze(errors), lifecycle, ok: errors.length === 0 });
}
