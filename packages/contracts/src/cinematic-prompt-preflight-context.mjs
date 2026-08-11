import { preflightVideoModelCapability } from "./video-model-capability-policy.mjs";
import { auditCinematicVisualInputDecision } from "./cinematic-visual-input-decision-policy.mjs";
import { evaluateCinematicGenerationControl } from "./cinematic-generation-control-policy.mjs";
import { evaluateStructuredCameraTrajectories } from "./cinematic-camera-trajectory-policy.mjs";
import { evaluateTemporalMotionPlan } from "./cinematic-temporal-motion-policy.mjs";
import { evaluatePromptConstraintCoverage } from "./cinematic-prompt-coverage-policy.mjs";
import { evaluateGenerationUnitLifecycle } from "./cinematic-generation-unit-lifecycle-policy.mjs";

export function buildCinematicPromptPreflightContext({
  directorPromptPolicy,
  generationUnit,
  lint,
  manualDraft,
  referenceBindings,
  shots
}) {
  // Director-stage captures may be compiled into the textual directing
  // contract while remaining explicitly ineligible for Provider image input.
  // Mode and Provider-capability audits must inspect only the images that will
  // actually cross the Provider boundary.
  const providerReferenceBindings = referenceBindings.filter(
    (binding) => binding?.providerEligible !== false
  );
  const capabilityPreflight = preflightVideoModelCapability({
    generationParameters: generationUnit.generationParameters,
    generationUnit,
    promptBytes: lint.bytes,
    referenceBindings: providerReferenceBindings
  });
  const visualInputDecision = auditCinematicVisualInputDecision({
    generationUnit,
    referenceBindings: providerReferenceBindings
  });
  const modeControl = evaluateCinematicGenerationControl({
    generationUnit,
    referenceBindings: providerReferenceBindings
  });
  const promptCoverage = evaluatePromptConstraintCoverage({
    coverage: generationUnit.promptCoverage,
    includeDynamics: true,
    required: generationUnit.executionGates?.requirePromptCoverage === true
  });
  const cameraTrajectory = evaluateStructuredCameraTrajectories({ generationUnit, referenceBindings, shots });
  const temporalMotion = evaluateTemporalMotionPlan({ generationUnit });
  const unitLifecycle = evaluateGenerationUnitLifecycle({ generationUnit });
  const sequenceState = generationUnit.executionGateEvidence?.sequenceStateAudit ?? null;
  const sequenceErrors = generationUnit.executionGates?.requireSequenceState === true
    ? (Array.isArray(sequenceState?.errors) ? sequenceState.errors : [{ code: "sequence_state_audit_required", message: "缺少 Core 时序状态审计。" }])
    : [];
  const sequencePrevisAudit = generationUnit.executionGateEvidence?.sequenceWorkspaceAudit ?? null;
  const sequencePrevisErrors = generationUnit.executionGates?.requireSequencePrevis === true
    ? (!generationUnit.sequenceWorkspaceBinding
        ? [{ code: "sequence_previs_required", message: "正式生成前必须绑定已接受的连续预演与本镜视觉上下文。" }]
        : (Array.isArray(sequencePrevisAudit?.errors)
            ? sequencePrevisAudit.errors
            : [{ code: "sequence_previs_audit_required", message: "缺少 Core 连续预演审计。" }]))
    : [];
  const segmentSeamAudit = generationUnit.executionGateEvidence?.segmentSeamAudit ?? null;
  const segmentSeamErrors = generationUnit.executionGates?.requireSegmentSeamDecision === true
    ? (!segmentSeamAudit
        ? [{ code: "segment_seam_audit_required", message: "正式生成前必须由 Core 完成段间接缝审计。" }]
        : (Array.isArray(segmentSeamAudit.errors) ? segmentSeamAudit.errors : []))
    : [];
  const manualDraftErrors = manualDraft ? [{
    code: "manual_prompt_not_formal_runnable",
    message: "人工自由文本只能保存为不可运行的预览草稿；正式 Prompt 必须修改结构化字段后重新编译。"
  }] : [];
  const errors = [
    ...capabilityPreflight.errors,
    ...visualInputDecision.errors,
    ...unitLifecycle.errors,
    ...modeControl.errors,
    ...promptCoverage.errors,
    ...cameraTrajectory.errors,
    ...temporalMotion.errors,
    ...directorPromptPolicy.errors,
    ...sequenceErrors,
    ...sequencePrevisErrors,
    ...segmentSeamErrors,
    ...manualDraftErrors
  ];
  const preflight = {
    ...capabilityPreflight,
    errors,
    cameraTrajectory,
    modeControl,
    directorPromptPolicy,
    promptCoverage,
    temporalMotion,
    sequenceState,
    sequencePrevis: sequencePrevisAudit,
    segmentSeam: segmentSeamAudit,
    unitLifecycle,
    visualInputDecision,
    ok: capabilityPreflight.ok
      && visualInputDecision.ok
      && unitLifecycle.ok
      && modeControl.ok
      && promptCoverage.ok
      && cameraTrajectory.ok
      && temporalMotion.ok
      && directorPromptPolicy.ok
      && sequenceErrors.length === 0
      && sequencePrevisErrors.length === 0
      && segmentSeamErrors.length === 0
      && manualDraftErrors.length === 0
  };
  return {
    capabilityPreflight,
    cameraTrajectory,
    modeControl,
    preflight,
    promptCoverage,
    segmentSeamAudit,
    temporalMotion,
    unitLifecycle,
    visualInputDecision
  };
}
