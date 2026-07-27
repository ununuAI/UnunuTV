import {
  CINEMATIC_STRATEGY_PROTOCOL,
  assertCinematicContract,
  validateGenerationParameters,
  validateGenerationUnit,
  validateReferenceBindings
} from "./cinematic-contracts.mjs";
import { getVideoModelCapability, preflightVideoModelCapability } from "./video-model-capability-policy.mjs";
import { evaluateCinematicGenerationControl } from "./cinematic-generation-control-policy.mjs";
import { evaluateStructuredCameraTrajectories } from "./cinematic-camera-trajectory-policy.mjs";
import { evaluateTemporalMotionPlan } from "./cinematic-temporal-motion-policy.mjs";
import { evaluatePromptConstraintCoverage } from "./cinematic-prompt-coverage-policy.mjs";
import { evaluateGenerationUnitLifecycle } from "./cinematic-generation-unit-lifecycle-policy.mjs";
import {
  CINEMATIC_CONTROLLED_LEXICON,
  cinematicReferenceAlias,
  cleanCinematicList as cleanList,
  cleanCinematicText as cleanText,
  compileCinematicPromptSections as compileSections,
  dedupeHighRiskNegatives,
  describeCinematicRecord as describeRecord,
  formatCinematicSeconds as formatSeconds
} from "./cinematic-prompt-render-policy.mjs";
import { buildCinematicPromptDraft } from "./cinematic-prompt-draft-contracts.mjs";
import { cinematicPromptPayloadHash as payloadHash } from "./cinematic-prompt-hash-policy.mjs";
import { cinematicPromptByteLength as byteLength, fitCinematicPromptByteBudget as fitByteBudget } from "./cinematic-prompt-fitting-policy.mjs";

export { CINEMATIC_CONTROLLED_LEXICON };

export const CINEMATIC_PROMPT_COMPILER_VERSION = "3.4.0";

// Reject anonymous labels such as `主体1`, but do not treat camera-distance
// phrases such as `距主体2.5米` or `距主体 2 米` as synthetic identities.
const SYNTHETIC_SUBJECT_PATTERN = /(?:^|[^距])主体\s*(?:\d+(?![\d.]|\s*(?:米|m)\b)|[一二三四五六七八九十]+(?!\s*(?:米|m)\b))/u;
const TECHNICAL_PARAMETER_PATTERNS = [
  { code: "aspect_ratio_leak", pattern: /(?:画幅|宽高比|比例)?\s*(?:16\s*:\s*9|9\s*:\s*16|1\s*:\s*1)/iu },
  { code: "resolution_leak", pattern: /(?:分辨率\s*[:：]?\s*)?(?:480p|720p|1080p|2k|4k|8k)\b/iu },
  { code: "generation_count_leak", pattern: /(?:生成|输出)\s*[一二三四五六七八九十\d]+\s*(?:条|个|份)(?:视频|结果|候选)?/u },
  { code: "provider_parameter_leak", pattern: /(?:provider|model|模型)\s*[:：=]\s*[a-z0-9_./-]+/iu },
  { code: "global_duration_leak", pattern: /(?:总时长|视频时长|生成时长|duration)\s*[:：=]?\s*\d+(?:\.\d+)?\s*(?:秒|s\b)/iu }
];
const UNBOUND_IMAGE_PATTERN = /(?:\[图片\]|【照片】|\bimage\s*\d+\b)/iu;
const CLI_ARGUMENT_PATTERN = /(?:^|\s)--(?:ar|v|style|q|seed)\b/iu;
const STYLE_RISK_PATTERN = /(?:模仿|仿照|in the style of|风格完全一致于)\s*[\p{L}\p{N}·._-]{2,}/iu;
const ABSOLUTE_IDENTITY_PATTERN = /(?:百分之百|绝对|完全|永久)(?:保持|一致|还原)(?:人物|身份|面孔|五官)?/u;
const HYPE_PATTERN = /(?:电影级|大师级|顶级|超绝|极致|史诗级|震撼|高级感|8K)/gu;
const INTERNAL_TIME_SLOT_PATTERN = /(?:^|[；。\n])\s*(?:第?\s*)?\d+(?:\.\d+)?\s*(?:秒|s)\s*(?:[-—~至到]\s*\d+(?:\.\d+)?\s*(?:秒|s))?\s*[:：]/imu;

function dialogueTextSet(value) {
  return new Set((Array.isArray(value) ? value : []).map((entry) => cleanText(typeof entry === "string" ? entry : entry?.text ?? entry?.line ?? entry?.dialogue)).filter(Boolean));
}

function unitLockedText(storyPacket, shots) {
  const globalDialogue = dialogueTextSet(storyPacket.dialogue);
  const shotDialogue = shots.flatMap((shot) => cleanList(shot.dialogue));
  const nonDialogueLocks = cleanList(storyPacket.userLockedText).filter((entry) => !globalDialogue.has(entry));
  return { nonDialogueLocks, shotDialogue };
}

function lockedTextCandidates(storyPacket, shots = []) {
  const { nonDialogueLocks, shotDialogue } = unitLockedText(storyPacket, shots);
  return [
    ...shotDialogue.map((line) => line.replace(/^.+?：“/u, "").replace(/”$/u, "")),
    ...nonDialogueLocks
  ].filter((entry) => entry.length >= 2);
}

export function lintCinematicPrompt({ compiledContentPrompt, generationParameters, generationUnit, referenceBindings = [], shots = [], storyPacket, teamManifestIds = [] }) {
  const errors = [];
  const warnings = [];
  const prompt = cleanText(compiledContentPrompt);
  const gates = generationUnit.executionGates && typeof generationUnit.executionGates === "object" ? generationUnit.executionGates : {};
  const gateEvidence = generationUnit.executionGateEvidence && typeof generationUnit.executionGateEvidence === "object" ? generationUnit.executionGateEvidence : {};
  const explicitCinematographyFields = ["shotSize", "cameraPosition", "angle", "perspective", "composition", "depthOfField", "focus", "movementPath", "speedCurve", "startPoint", "stopPoint", "narrativePurpose"];
  const explicitBlockingFields = ["positions", "paths", "gaze", "hands", "props", "contactSurface"];
  const cameraTrajectory = evaluateStructuredCameraTrajectories({ generationUnit, referenceBindings, shots });
  const temporalMotion = evaluateTemporalMotionPlan({ generationUnit });
  errors.push(...cameraTrajectory.errors);
  errors.push(...temporalMotion.errors);
  if (gates.requireSequenceState) {
    const sequenceAudit = gateEvidence.sequenceStateAudit && typeof gateEvidence.sequenceStateAudit === "object" ? gateEvidence.sequenceStateAudit : null;
    if (!sequenceAudit) errors.push({ code: "sequence_state_audit_required", message: "正式生成前必须由 Core 完成已发生/本段/后续保留与实际状态对账。" });
    else for (const entry of Array.isArray(sequenceAudit.errors) ? sequenceAudit.errors : []) errors.push({ code: entry.code || "sequence_state_audit_failed", message: entry.message || "时序状态对账未通过。", sequence: true });
  }
  if (gates.requireSequencePrevis) {
    const audit = gateEvidence.sequenceWorkspaceAudit && typeof gateEvidence.sequenceWorkspaceAudit === "object" ? gateEvidence.sequenceWorkspaceAudit : null;
    if (!audit) errors.push({ code: "sequence_previs_audit_required", message: "正式生成前必须审计连续预演、切镜决策与本镜视觉上下文。" });
    else for (const entry of Array.isArray(audit.errors) ? audit.errors : []) errors.push({ code: entry.code || "sequence_previs_audit_failed", message: entry.message || "连续预演审计未通过。", sequencePrevis: true });
  }
  if (gates.requireOwnerStoryReview || gates.requireOwnerShotReviews) {
    const ownerReview = gateEvidence.ownerStoryShotReview && typeof gateEvidence.ownerStoryShotReview === "object"
      ? gateEvidence.ownerStoryShotReview
      : null;
    if (gates.requireOwnerStoryReview && ownerReview?.story?.accepted !== true) {
      errors.push({
        code: "story_owner_acceptance_required",
        message: `当前剧情合同 ${storyPacket?.storyPacketId ?? "unknown"} r${storyPacket?.revision ?? "?"} 必须先获得最新 Owner ACCEPT。`
      });
    }
    if (gates.requireOwnerShotReviews) {
      const accepted = new Set((Array.isArray(ownerReview?.shots) ? ownerReview.shots : [])
        .filter((entry) => entry?.accepted === true)
        .map((entry) => `${entry.artifactId}:r${entry.artifactRevision}`));
      for (const shot of shots) {
        if (!accepted.has(`${shot.shotId}:r${shot.revision}`)) errors.push({
          code: "shot_script_owner_acceptance_required",
          message: `当前分镜脚本 ${shot.shotId} r${shot.revision} 必须先获得最新 Owner ACCEPT。`,
          shotId: shot.shotId
        });
      }
    }
  }
  if (gates.requireExplicitCinematography) {
    for (const shot of shots) {
      const missing = explicitCinematographyFields.filter((field) => !cleanText(shot.cinematography?.[field]));
      if (missing.length) errors.push({ code: "cinematography_execution_contract_incomplete", message: `${shot.shotId} 缺少可执行摄影字段：${missing.join("、")}` });
    }
  }
  if (gates.requireExplicitBlocking) {
    for (const shot of shots) {
      const missing = explicitBlockingFields.filter((field) => !cleanText(shot.blocking?.[field]));
      if (missing.length) errors.push({ code: "blocking_execution_contract_incomplete", message: `${shot.shotId} 缺少可执行调度字段：${missing.join("、")}` });
    }
  }
  if (gates.requireTimePlan) {
    let plannedDuration = 0;
    for (const shot of shots) {
      if (!Array.isArray(shot.internalTimeSlots) || !shot.internalTimeSlots.length) {
        errors.push({ code: "shot_time_plan_required", message: `${shot.shotId} 缺少内部时间槽。` });
        continue;
      }
      let cursor = 0;
      for (const [index, slot] of shot.internalTimeSlots.entries()) {
        const start = Number(slot?.startSeconds);
        const end = Number(slot?.endSeconds);
        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || Math.abs(start - cursor) > 0.01) {
          errors.push({ code: "shot_time_plan_discontinuous", message: `${shot.shotId} 的时间槽 ${index + 1} 未从 ${formatSeconds(cursor)} 秒连续衔接。` });
          break;
        }
        cursor = end;
      }
      plannedDuration += cursor;
    }
    const requestedDuration = Number(generationParameters?.duration);
    if (Number.isFinite(requestedDuration) && Math.abs(plannedDuration - requestedDuration) > 0.01) {
      errors.push({ code: "generation_time_plan_mismatch", message: `镜头时间线合计 ${formatSeconds(plannedDuration)} 秒，与生成参数 ${formatSeconds(requestedDuration)} 秒不一致。` });
    }
  }
  if (gates.requireDirectorStageBinding) {
    for (const shot of shots) {
      if (!shot.directorStageBinding?.captureId || !shot.directorStageBinding?.mediaId) {
        errors.push({ code: "director_stage_binding_required", message: `${shot.shotId} 尚未绑定3D导演台机位捕获。` });
      }
    }
  }
  if (gates.requireStoryboardReference) {
    const referencedShotIds = new Set(referenceBindings.filter((binding) => String(binding.role || "").startsWith("storyboard_")).map((binding) => binding.shotId));
    for (const shot of shots) {
      if (!referencedShotIds.has(shot.shotId)) errors.push({ code: "storyboard_keyframe_required", message: `${shot.shotId} 尚未选择通过QA的故事板关键帧。` });
    }
  }
  if (gates.requireKeyframeReference) {
    const keyframeRoles = new Set(["shot_keyframe", "continuity_tail", "director_keyframe", "storyboard_first_frame", "storyboard_composition"]);
    if (generationUnit.strategy === "designed_multi_shot") {
      for (const shot of shots) {
        const hasShotKeyframe = referenceBindings.some((binding) => binding.shotId === shot.shotId && keyframeRoles.has(String(binding.role || "")));
        if (!hasShotKeyframe) errors.push({ code: "accepted_shot_keyframe_required", message: `${shot.shotId} 缺少本镜已接受关键帧；多镜头生成段不能共用一张泛化故事板。` });
      }
    } else {
      const hasBoundKeyframe = Boolean(generationParameters?.firstFrameMediaId)
        || referenceBindings.some((binding) => keyframeRoles.has(String(binding.role || "")));
      if (!hasBoundKeyframe) errors.push({ code: "accepted_keyframe_required", message: "正式生成前必须绑定本镜关键帧或上一条已接受的权威尾帧。" });
    }
  }
  if (gates.requireAuthoritativeTailHandoff) {
    const handoff = gateEvidence.authoritativeTailHandoff && typeof gateEvidence.authoritativeTailHandoff === "object"
      ? gateEvidence.authoritativeTailHandoff
      : {};
    const duplicate = generationUnit.continuationHandoff?.mode === "DUPLICATE_HANDOFF";
    const continuityTail = referenceBindings.find((binding) => binding.role === (duplicate ? "handoff_h1" : "continuity_tail"));
    const handoffH0 = referenceBindings.find((binding) => binding.role === "handoff_h0");
    const expectedPolicy = duplicate ? "DUPLICATE_HANDOFF" : "PREVIOUS_ACCEPTED_TAIL";
    if (generationUnit.strategy !== "continuous_segment" || generationUnit.visualAnchorPolicy !== expectedPolicy) {
      errors.push({ code: "authoritative_tail_strategy_required", message: "连续动作段必须在 TAIL_CONTINUE 与 DUPLICATE_HANDOFF 中二选一，并使用匹配的视觉锚点。" });
    }
    if (!duplicate && (!continuityTail || generationParameters?.firstFrameMediaId !== continuityTail.mediaId)) {
      errors.push({ code: "authoritative_tail_first_frame_required", message: "续镜必须把上一条已接受权威尾帧绑定为 Provider 首帧。" });
    }
    if (duplicate && (!handoffH0 || !continuityTail || !generationParameters?.referenceMediaIds?.includes(handoffH0.mediaId) || !generationParameters?.referenceMediaIds?.includes(continuityTail.mediaId))) {
      errors.push({ code: "duplicate_handoff_frames_required", message: "重叠交接必须同时绑定同一已接受上一段的 H0/H1，并把二者送入 Provider。" });
    }
    if (!cleanText(handoff.sourceEvaluationId) || handoff.sourceDecision !== "ACCEPT") {
      errors.push({ code: "authoritative_tail_acceptance_required", message: "续镜首帧缺少上一段 ACCEPT 审片记录。" });
    }
    if (handoff.sourceMediaVerified !== true) {
      errors.push({ code: "authoritative_tail_provenance_invalid", message: "续镜尾帧没有被证明来自对应 ACCEPT 候选媒体与校验和。" });
    }
    if (!continuityTail || handoff.mediaId !== continuityTail.mediaId) {
      errors.push({ code: "authoritative_tail_evidence_mismatch", message: "连续性交接证据与实际首帧媒体不一致。" });
    }
    if (duplicate && handoff.duplicateFramesVerified !== true) errors.push({ code: "duplicate_handoff_provenance_invalid", message: "H0/H1 未被证明来自同一已接受上一段。" });
    for (const field of ["spatialContinuityVerified", "subjectStateVerified", "screenDirectionVerified"]) {
      if (handoff[field] !== true) errors.push({ code: "authoritative_tail_continuity_unverified", message: `连续性交接尚未验证 ${field}。` });
    }
  }
  if (gates.requireAcceptedVisualStateCarrier) {
    const audit = gateEvidence.visualStateCarrierAudit && typeof gateEvidence.visualStateCarrierAudit === "object" ? gateEvidence.visualStateCarrierAudit : null;
    if (!audit) errors.push({ code: "visual_state_carrier_audit_required", message: "图生视频前必须由 Core 审计逐镜状态载体。" });
    else for (const entry of Array.isArray(audit.errors) ? audit.errors : []) errors.push({ code: entry.code || "visual_state_carrier_invalid", message: entry.message || "逐镜状态载体未通过。" });
  }
  if (gates.requireMotionHandoffPlan) {
    const expectedPolicy = generationUnit.continuationHandoff?.mode === "DUPLICATE_HANDOFF" ? "DUPLICATE_HANDOFF" : "PREVIOUS_ACCEPTED_TAIL";
    if (generationUnit.strategy !== "continuous_segment" || generationUnit.visualAnchorPolicy !== expectedPolicy) {
      errors.push({ code: "motion_handoff_strategy_required", message: "超长镜头续段的 TAIL_CONTINUE/DUPLICATE_HANDOFF 模式必须与视觉锚点严格互斥并一致。" });
    }
    if (!generationUnit.continuationHandoff) errors.push({ code: "motion_handoff_plan_required", message: "续段缺少 H0/H1、摄影机、动作相位、裁切规则、焦点曝光与声音的交接计划。" });
    if (!cleanText(generationUnit.continuationHandoff?.h1MediaId)) errors.push({ code: "motion_handoff_frame_required", message: "续段计划尚未绑定来自最新 ACCEPT 上一段的真实 H1 帧。" });
    for (const field of ["cameraStateVerified", "lensFocusExposureVerified", "motionPhaseVerified", "ambientAudioContinuityVerified"]) {
      if (gateEvidence.authoritativeTailHandoff?.[field] !== true) errors.push({ code: "motion_handoff_unverified", message: `连续段尚未验证 ${field}。` });
    }
    if (generationUnit.continuationHandoff?.mode === "DUPLICATE_HANDOFF" && gateEvidence.authoritativeTailHandoff?.overlapHandleVerified !== true) errors.push({ code: "motion_handoff_unverified", message: "重叠交接尚未验证可剪 H0→H1 重复区。" });
  }
  if (gates.requireContinuityStateAudit) {
    const continuityAudit = gateEvidence.continuityAudit && typeof gateEvidence.continuityAudit === "object"
      ? gateEvidence.continuityAudit
      : null;
    if (!continuityAudit) {
      errors.push({ code: "continuity_audit_required", message: "正式生成前必须由 Core 完成结构化相邻镜连续性审计。" });
    } else if (continuityAudit.ok !== true) {
      const auditErrors = Array.isArray(continuityAudit.errors) ? continuityAudit.errors : [];
      if (!auditErrors.length) errors.push({ code: "continuity_audit_failed", message: "结构化相邻镜连续性审计未通过。" });
      for (const entry of auditErrors) errors.push({ code: entry.code || "continuity_audit_failed", message: entry.message || "结构化相邻镜连续性审计未通过。", continuity: true });
    }
  }
  if (Array.isArray(gates.requiredProfessionalRoles)) {
    const available = new Set(Array.isArray(gateEvidence.professionalRoles) ? gateEvidence.professionalRoles : []);
    const missing = gates.requiredProfessionalRoles.filter((role) => !available.has(role));
    if (missing.length) errors.push({ code: "professional_signoff_required", message: `缺少专业角色会签：${missing.join("、")}` });
    if (gates.requireCurrentArtifactSignoff) {
      const current = new Set(Array.isArray(gateEvidence.currentProfessionalRoles) ? gateEvidence.currentProfessionalRoles : []);
      const stale = gates.requiredProfessionalRoles.filter((role) => !current.has(role));
      if (stale.length) errors.push({ code: "professional_signoff_target_stale", message: `专业会签未覆盖当前镜头/生成单元 revision：${stale.join("、")}` });
    }
    if (gates.requireKnowledgeGroundedSignoff) {
      const grounded = new Set(Array.isArray(gateEvidence.knowledgeGroundedProfessionalRoles) ? gateEvidence.knowledgeGroundedProfessionalRoles : []);
      const missingKnowledge = gates.requiredProfessionalRoles.filter((role) => !grounded.has(role));
      if (missingKnowledge.length) errors.push({ code: "professional_signoff_knowledge_required", message: `当前会签缺少能力 ID 与来源知识原子：${missingKnowledge.join("、")}` });
    }
    if (gates.requireManifestBoundSignoff) {
      const manifestBound = new Set(Array.isArray(gateEvidence.manifestBoundProfessionalRoles) ? gateEvidence.manifestBoundProfessionalRoles : []);
      const unbound = gates.requiredProfessionalRoles.filter((role) => !manifestBound.has(role));
      if (unbound.length) errors.push({ code: "professional_signoff_manifest_mismatch", message: `当前知识会签未绑定已批准 TeamManifest：${unbound.join("、")}` });
    }
    if (gates.requireCurrentStorySignoff) {
      const storyRevision = Number(storyPacket?.revision);
      const roleRevisions = gateEvidence.professionalRoleStoryRevisions && typeof gateEvidence.professionalRoleStoryRevisions === "object" ? gateEvidence.professionalRoleStoryRevisions : {};
      const staleRoles = gates.requiredProfessionalRoles.filter((role) => !(Array.isArray(roleRevisions[role]) && roleRevisions[role].includes(storyRevision)));
      if (staleRoles.length) errors.push({ code: "professional_signoff_stale", message: `专业会签未覆盖当前故事合同 r${storyRevision}：${staleRoles.join("、")}` });
    }
  }
  if (gates.requireTeamManifest && (!Array.isArray(teamManifestIds) || teamManifestIds.length === 0)) {
    errors.push({ code: "team_manifest_required", message: "正式生成前必须绑定 Owner 已批准的 TeamManifest。" });
  }
  if (gates.requireAcceptedAssetAuthorities) {
    const accepted = new Set(Array.isArray(gateEvidence.acceptedAuthorityIds) ? gateEvidence.acceptedAuthorityIds : []);
    const required = [...new Set(shots.flatMap((shot) => Array.isArray(shot.requiredAssetIds) ? shot.requiredAssetIds : []))];
    const missing = required.filter((authorityId) => !accepted.has(authorityId));
    if (missing.length) errors.push({ code: "accepted_asset_authority_required", message: `镜头引用了尚未验收的资产权威：${missing.join("、")}` });
  }
  if (gates.rejectGlobalNarrativeJobReuse && cleanText(storyPacket?.scenePurpose)) {
    for (const shot of shots) {
      if (cleanText(shot.narrativeJob) === cleanText(storyPacket.scenePurpose)) {
        errors.push({ code: "global_narrative_job_reused", message: `${shot.shotId} 把全片目标复制成了本格叙事功能。` });
      }
    }
  }
  if (SYNTHETIC_SUBJECT_PATTERN.test(prompt)) errors.push({ code: "synthetic_subject_label", message: "Prompt contains an unbound synthetic subject label such as 主体1." });
  if (UNBOUND_IMAGE_PATTERN.test(prompt)) errors.push({ code: "unbound_image_reference", message: "Prompt contains an image placeholder that is not bound to the final payload order." });
  if (CLI_ARGUMENT_PATTERN.test(prompt)) errors.push({ code: "cli_argument_leak", message: "Image-generation CLI arguments such as --ar/--v/--style must not appear in a video content Prompt." });
  for (const entry of TECHNICAL_PARAMETER_PATTERNS) {
    if (entry.pattern.test(prompt)) errors.push({ code: entry.code, message: "Provider/model parameters must not appear in the content Prompt." });
  }
  for (const value of [generationParameters?.provider, generationParameters?.model].filter(Boolean)) {
    if (prompt.toLocaleLowerCase("en-US").includes(String(value).toLocaleLowerCase("en-US"))) {
      errors.push({ code: "provider_model_leak", message: `Content Prompt contains provider/model identifier ${value}.` });
    }
  }
  const referenceValidation = validateReferenceBindings(referenceBindings, generationParameters);
  errors.push(...referenceValidation.issues.map((entry) => ({ code: entry.code, message: entry.message, path: entry.path })));
  const validIndices = new Set(referenceBindings.map((binding) => binding.providerIndex));
  for (const match of compiledContentPrompt.matchAll(/参考图\s*(\d+)/gu)) {
    if (!validIndices.has(Number(match[1]))) errors.push({ code: "phantom_reference", message: `Prompt refers to absent 参考图${match[1]}.` });
  }
  for (const binding of referenceBindings) {
    if (!compiledContentPrompt.includes(`（参考图${binding.providerIndex}）=${cinematicReferenceAlias(binding)}`)) {
      errors.push({ code: "missing_reference_identity", message: `Missing named reference mapping for ${binding.displayName}.` });
    }
  }
  if (generationUnit.strategy === "single_shot" && /(?:^|\n)镜头\s*[2-9]\d*\s*[:：]/u.test(compiledContentPrompt)) {
    errors.push({ code: "hidden_cut_in_single_shot", message: "Single-shot protocol may not contain internal shot boundaries." });
  }
  if (generationUnit.strategy === "single_shot" && /(?:切到|切回|转场到|画面切换|另一个镜头|镜头二|第二镜)/u.test(compiledContentPrompt)) {
    errors.push({ code: "hidden_cut_in_single_shot", message: "Single-shot protocol contains an implicit edit or transition instruction." });
  }
  if (generationUnit.strategy === "designed_multi_shot") {
    for (const [index, link] of generationUnit.shotLinks.entries()) {
      if (index > 0 && !cleanText(link.cutReason || shots.find((shot) => shot.shotId === link.shotId)?.cutReason)) {
        errors.push({ code: "missing_cut_reason", message: `Shot ${link.order ?? index + 1} has no cut reason.` });
      }
    }
  }
  for (const shot of shots) {
    const cameraText = describeRecord(shot.cinematography);
    if (/(?:固定机位|摄影机固定|机位固定|全程固定)/u.test(cameraText) && /(?:推进|后拉|摇摄|横移|环绕|跟拍|升降|移动机位)/u.test(cameraText)) {
      errors.push({ code: "camera_motion_conflict", message: `Fixed-camera and moving-camera instructions conflict in artistic shot ${shot.shotId}.` });
    }
  }
  const positiveCameraText = compiledContentPrompt.replace(/(?:不得|禁止|不要)(?:推进|后拉|摇摄|横移|环绕|跟拍|升降|移动机位|摄影机移动)/gu, "");
  const positiveCameraMotion = /(?:(?:摄影机|机位|镜头)\s*(?:缓慢|快速|轻微|持续)?\s*(?:推进|后拉|摇摄|横移|环绕|跟拍|升降|移动)|(?:缓慢|快速|向前|向后|横向)\s*(?:推进|后拉|摇摄|横移|环绕|跟拍|升降)|推轨|手持跟拍|移动机位|摄影机移动)/u;
  if (/(?:固定机位|摄影机固定|机位固定|全程固定)/u.test(compiledContentPrompt) && positiveCameraMotion.test(positiveCameraText)) {
    errors.push({ code: "camera_motion_conflict", message: "The compiled/manual Prompt simultaneously requires a fixed and moving camera." });
  }
  const profile = getVideoModelCapability({ model: generationParameters?.model, provider: generationParameters?.provider });
  if (INTERNAL_TIME_SLOT_PATTERN.test(compiledContentPrompt) && !profile?.supportsPromptTimeSlots) {
    errors.push({ code: "unsupported_prompt_time_slots", message: "Internal time slots may only be emitted for a model capability profile that explicitly supports them." });
  }
  const positiveStyleText = prompt.replace(/(?:不得|禁止|不要)(?:模仿|仿照)[^；。\n]*/gu, "");
  if (STYLE_RISK_PATTERN.test(positiveStyleText)) warnings.push({ code: "director_ip_style_risk", message: "Named director/artist or protected-IP imitation should be replaced with concrete visual attributes or reviewed by the Owner." });
  if (ABSOLUTE_IDENTITY_PATTERN.test(prompt)) warnings.push({ code: "absolute_identity_promise", message: "Identity consistency is a target and acceptance criterion, not an absolute model guarantee." });
  if ((prompt.match(HYPE_PATTERN) ?? []).length >= 3) warnings.push({ code: "hype_adjective_stack", message: "Stacked prestige adjectives do not replace concrete cinematic instructions." });
  for (const lockedText of lockedTextCandidates(storyPacket, shots)) {
    if (!compiledContentPrompt.includes(lockedText)) errors.push({ code: "locked_story_loss", message: `Locked story text is missing: ${lockedText}` });
  }
  const byteLimit = getVideoModelCapability({ model: generationParameters?.model, provider: generationParameters?.provider })?.promptMaxBytes;
  const bytes = byteLength(compiledContentPrompt);
  if (byteLimit && bytes > byteLimit) errors.push({ code: "prompt_byte_limit", message: `Prompt is ${bytes} UTF-8 bytes; model limit is ${byteLimit}.` });
  return { bytes, errors, ok: errors.length === 0, warnings };
}

export function compileCinematicPrompt({
  generationUnit,
  referenceBindings = [],
  shots,
  storyPacket,
  visualBible,
  teamManifestIds = [],
  expertPackIds = [],
  knowledgeRefs = [],
  manualOverride = false,
  manualPrompt = ""
}) {
  assertCinematicContract("StoryProductionPacket", storyPacket);
  assertCinematicContract("VisualBible", visualBible);
  for (const shot of shots) assertCinematicContract("CinematicShotSpec", shot);
  const unitValidation = validateGenerationUnit(generationUnit);
  if (!unitValidation.ok) assertCinematicContract("GenerationUnit", generationUnit);
  const parameterValidation = validateGenerationParameters(generationUnit.generationParameters);
  if (!parameterValidation.ok) assertCinematicContract("GenerationParameters", generationUnit.generationParameters);
  assertCinematicContract("ReferenceBinding", referenceBindings, { generationParameters: generationUnit.generationParameters });
  const shotById = new Map(shots.map((shot) => [shot.shotId, shot]));
  const orderedShots = generationUnit.shotLinks.map((link) => shotById.get(link.shotId));
  if (orderedShots.some((shot) => !shot)) throw Object.assign(new Error("Every generation-unit shotLink must resolve to a CinematicShotSpec."), { code: "missing_shot_spec" });
  const profile = getVideoModelCapability({ model: generationUnit.generationParameters.model, provider: generationUnit.generationParameters.provider });
  const sections = compileSections({ profile, referenceBindings, shots: orderedShots, storyPacket, unit: generationUnit, visualBible });
  const fitted = manualOverride
    ? { droppedFragments: [], droppedSections: [], prompt: cleanText(manualPrompt) }
    : fitByteBudget(sections, profile?.promptMaxBytes);
  const lint = lintCinematicPrompt({
    compiledContentPrompt: fitted.prompt,
    generationParameters: generationUnit.generationParameters,
    generationUnit,
    referenceBindings,
    shots: orderedShots,
    storyPacket,
    teamManifestIds
  });
  const capabilityPreflight = preflightVideoModelCapability({
    generationParameters: generationUnit.generationParameters,
    generationUnit,
    promptBytes: lint.bytes,
    referenceBindings
  });
  const modeControl = evaluateCinematicGenerationControl({ generationUnit, referenceBindings });
  const promptCoverage = evaluatePromptConstraintCoverage({
    coverage: generationUnit.promptCoverage,
    includeDynamics: true,
    required: generationUnit.executionGates?.requirePromptCoverage === true
  });
  const cameraTrajectory = evaluateStructuredCameraTrajectories({ generationUnit, referenceBindings, shots: orderedShots });
  const temporalMotion = evaluateTemporalMotionPlan({ generationUnit });
  const unitLifecycle = evaluateGenerationUnitLifecycle({ generationUnit });
  const sequenceState = generationUnit.executionGateEvidence?.sequenceStateAudit ?? null;
  const sequenceErrors = generationUnit.executionGates?.requireSequenceState === true
    ? (Array.isArray(sequenceState?.errors) ? sequenceState.errors : [{ code: "sequence_state_audit_required", message: "缺少 Core 时序状态审计。" }])
    : [];
  const preflight = {
    ...capabilityPreflight,
    errors: [...capabilityPreflight.errors, ...unitLifecycle.errors, ...modeControl.errors, ...promptCoverage.errors, ...cameraTrajectory.errors, ...temporalMotion.errors, ...sequenceErrors],
    cameraTrajectory,
    modeControl,
    promptCoverage,
    temporalMotion,
    sequenceState,
    unitLifecycle,
    ok: capabilityPreflight.ok && unitLifecycle.ok && modeControl.ok && promptCoverage.ok && cameraTrajectory.ok && temporalMotion.ok && sequenceErrors.length === 0
  };
  const envelope = {
    protocolId: CINEMATIC_STRATEGY_PROTOCOL[generationUnit.strategy],
    protocolVersion: "2.0.0",
    generationUnitId: generationUnit.generationUnitId,
    sourceVersions: {
      generationUnitRevision: generationUnit.revision,
      shotRevisions: orderedShots.map((shot) => ({ revision: shot.revision, shotId: shot.shotId })),
      storyPacketId: storyPacket.storyPacketId,
      storyPacketRevision: storyPacket.revision,
      visualBibleId: visualBible.visualBibleId,
      visualBibleRevision: visualBible.revision
    },
    compiledContentPrompt: fitted.prompt,
    promptDraft: buildCinematicPromptDraft({
      // Pure compiler callers may intentionally omit a production binding; the
      // persisted Core use case always supplies the real productionId.
      generationUnit: generationUnit.productionId ? generationUnit : { ...generationUnit, productionId: `unbound:${generationUnit.generationUnitId}` },
      orderedShots,
      storyPacket,
      visualBible,
      sections,
      compiledContentPrompt: fitted.prompt,
      referenceBindings,
      negativeConstraints: dedupeHighRiskNegatives({ shots: orderedShots, storyPacket, unit: generationUnit }),
      status: (lint?.ok !== false && preflight.ok) ? "preflight_ready" : "preflight_blocked"
    }),
    highRiskNegatives: dedupeHighRiskNegatives({ shots: orderedShots, storyPacket, unit: generationUnit }),
    referenceBindings,
    generationParameters: generationUnit.generationParameters,
    capabilitySnapshot: capabilityPreflight.capabilitySnapshot,
    capabilityDegradation: capabilityPreflight.degradations,
    generationControl: modeControl,
    unitLifecycle,
    cameraTrajectory,
    temporalMotion,
    promptCoverage,
    teamManifestIds,
    expertPackIds,
    knowledgeRefs,
    compilerVersion: CINEMATIC_PROMPT_COMPILER_VERSION,
    languageAdaptation: { fieldLexiconVersion: CINEMATIC_PROMPT_COMPILER_VERSION, locale: "zh-CN", promptTimeSlotsEmitted: Boolean(profile?.supportsPromptTimeSlots && orderedShots.some((shot) => Array.isArray(shot.internalTimeSlots) && shot.internalTimeSlots.length)) },
    payloadHash: "",
    droppedSections: fitted.droppedSections,
    droppedFragments: fitted.droppedFragments,
    lint,
    preflight,
    manualOverride,
    requiresPreflight: manualOverride || !lint.ok || !preflight.ok
  };
  envelope.payloadHash = payloadHash({
    compiledContentPrompt: envelope.compiledContentPrompt,
    generationParameters: envelope.generationParameters,
    generationUnitId: envelope.generationUnitId,
    protocolId: envelope.protocolId,
    controlIntent: generationUnit.controlIntent ?? null,
    lifecycle: generationUnit.lifecycle ?? "active",
    promptCoverage: generationUnit.promptCoverage ?? null,
    sequenceState: generationUnit.sequenceState ?? null,
    cameraTrajectoryPlans: orderedShots.map((shot) => shot.cameraTrajectoryPlan ?? shot.orbitCameraTrajectory ?? null),
    temporalMotionPlan: generationUnit.controlIntent?.temporalMotionPlan ?? null,
    referenceBindings: envelope.referenceBindings.map(({ mediaId, providerIndex, role, authorityRevision, semanticControl }) => ({ authorityRevision, mediaId, providerIndex, role, semanticControl: semanticControl ?? null })),
    sourceVersions: envelope.sourceVersions,
    teamManifestIds: envelope.teamManifestIds
  });
  envelope.promptDraft.payloadHash = envelope.payloadHash;
  return envelope;
}
