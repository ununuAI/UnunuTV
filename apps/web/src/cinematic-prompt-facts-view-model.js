const DIRECTOR_FIELD_LABELS = Object.freeze({
  narrativeIntent: "叙事意图",
  openingState: "起幅",
  subjectAndPerformance: "主体与表演",
  blockingAndAction: "调度与动作",
  environmentAndProductionDesign: "环境与生产设计",
  cinematography: "摄影机与镜头",
  lighting: "动机光",
  sound: "声音",
  endingState: "落幅",
  continuityAndHandoff: "连续性与交接",
  constraintsAndAcceptance: "禁止项与验收"
});

const list = (value) => Array.isArray(value) ? value : [];
const compact = (value) => typeof value === "string" ? value.replace(/\s+/gu, " ").trim() : "";

function policyFor(node, prompt) {
  return node?.payload?.cinematicDirectorPromptPolicy
    || node?.payload?.directorPromptPolicy
    || prompt?.parameters?.directorPromptPolicy
    || prompt?.directorPromptPolicy
    || null;
}

function abstractIntentFor(node, prompt, policy) {
  return node?.payload?.cinematicAbstractIntentResolution
    || node?.payload?.abstractIntentResolution
    || prompt?.parameters?.abstractIntentResolution
    || prompt?.abstractIntentResolution
    || policy?.abstractIntent
    || null;
}

function fieldFacts(policy) {
  return Object.entries(policy?.fields || {}).flatMap(([field, value]) => {
    const clauses = list(value?.clauses).map((clause) => ({
      text: compact(clause?.text || clause?.clause || clause),
      sourcePath: compact(clause?.sourcePath)
    })).filter((clause) => clause.text);
    return clauses.length ? [{ field, label: DIRECTOR_FIELD_LABELS[field] || field, clauses, ok: value?.ok !== false }] : [];
  });
}

export function cinematicPromptFactsForNode(node, prompt = null) {
  const policy = policyFor(node, prompt);
  const abstractIntent = abstractIntentFor(node, prompt, policy);
  const labels = list(abstractIntent?.labels).map(compact).filter(Boolean);
  const providerClauses = list(abstractIntent?.providerClauses).map(compact).filter(Boolean);
  const sources = list(abstractIntent?.sources).map((source) => ({
    label: compact(source?.label),
    sourcePath: compact(source?.sourcePath),
    sourceValue: compact(source?.sourceValue)
  })).filter((source) => source.label || source.sourcePath);
  const directorFields = fieldFacts(policy);
  const errors = [...list(abstractIntent?.errors), ...list(policy?.errors)].map((error) => ({
    code: compact(error?.code),
    message: compact(error?.message)
  })).filter((error) => error.code || error.message);
  const promptMode = policy?.promptMode || null;
  const providerAdapter = policy?.providerAdapter || null;
  if (!labels.length && !providerClauses.length && !directorFields.length && !promptMode && !errors.length) return null;
  return {
    version: "cinematic_prompt_facts_view_v1",
    ok: errors.length === 0 && abstractIntent?.ok !== false && policy?.ok !== false,
    labels,
    providerClauses,
    sources,
    directorFields,
    promptMode: promptMode ? {
      code: compact(promptMode.code || promptMode.id || promptMode),
      reason: compact(promptMode.reason || promptMode.rationale)
    } : null,
    providerAdapter: providerAdapter ? {
      referenceCount: providerAdapter.referenceCount ?? null,
      referenceLimit: providerAdapter.referenceLimit ?? null,
      deterministicCompression: providerAdapter.deterministicCompression === true
    } : null,
    errors
  };
}
