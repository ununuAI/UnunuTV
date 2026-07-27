import { UnuTvError, latestCinematicEvaluationsByUnit } from "@ununu/unutv-contracts";
import { generationStrategy } from "./automation-provider-strategy-policy.mjs";

function artifact(resourceType, resourceId, title, extra = {}) {
  return { resourceType, resourceId, ...(title ? { title } : {}), ...extra };
}

function output(artifactRefs = [], details = {}) { return { artifactRefs, ...details }; }

export function createAutomationStageExecutor({ ports, dependencies, isBudgetlessWorkflow } = {}) {
  function requireProduction(resolved) {
    if (!resolved.productionId) throw new UnuTvError("automation_production_required", "Create an Ununu cinematic production before running full-auto", 409);
    return resolved.productionId;
  }

  function requireSource(resolved) {
    if (!resolved.sourceNodeId) throw new UnuTvError("automation_script_required", "Bind a structured script node before running full-auto", 409);
    return resolved.sourceNodeId;
  }

  async function handleStage(projectId, task, resolved, operationContext) {
    const productionId = task.stage === "script_analysis" || task.stage === "block_planning" ? resolved.productionId : requireProduction(resolved);
    if (task.stage === "script_analysis") {
      requireProduction(resolved);
      const packet = await dependencies.cinematic.getStoryPacket({ projectId, productionId });
      if (!packet) throw new UnuTvError("story_packet_required", "StoryProductionPacket is missing; Agent must create or approve story facts", 409);
      return { reused: true, output: output([artifact("story_packet", packet.storyPacketId, "StoryProductionPacket", { versionId: `r${packet.revision}` })]) };
    }
    if (task.stage === "block_planning") {
      const sourceNodeId = requireSource(resolved);
      const document = await dependencies.getScriptDocument({ projectId, nodeId: sourceNodeId });
      if (!document.rows.length) throw new UnuTvError("script_rows_required", "Structured script rows are required for block planning", 409);
      return { output: output([artifact("script_document", sourceNodeId, "结构化剧本", { versionId: `r${document.revision}` })], { rowCount: document.rows.length }) };
    }
    if (task.stage === "visual_bible") {
      const bible = await dependencies.cinematic.getVisualBible({ projectId, productionId });
      if (!bible) throw new UnuTvError("visual_bible_required", "VisualBible is missing; visual rules cannot be invented silently", 409);
      return { reused: true, output: output([artifact("visual_bible", bible.visualBibleId, "VisualBible", { versionId: `r${bible.revision}` })]) };
    }
    if (task.stage === "asset_design") {
      let [assets, authorities] = await Promise.all([
        dependencies.listAssets({ projectId, scope: "project" }),
        dependencies.authorities.listAssetAuthorities({ projectId, productionId })
      ]);
      if (!assets.length && !authorities.length) {
        const derived = await dependencies.authorities.deriveAssetAuthoritiesFromStory({ projectId, productionId, persist: true });
        authorities = derived.candidates;
      }
      if (!assets.length && !authorities.length) throw new UnuTvError("asset_authority_required", "剧作事实不足以派生资产权威；请先补充人物、场景或关键道具事实", 409);
      return { reused: true, output: output([
        ...assets.map((entry) => artifact("asset", entry.id, entry.title, { versionId: entry.currentVersionId })),
        ...authorities.map((entry) => artifact("asset_authority", entry.authorityId, entry.displayName, { versionId: `r${entry.revision}` }))
      ]) };
    }
    if (task.stage === "shot_design") {
      const plan = await dependencies.scriptPlanning.planCinematicFromScript({ projectId, productionId, sourceNodeId: requireSource(resolved), createStoryboard: true });
      return { reused: plan.replayed, output: output([
        artifact("script_breakdown", plan.breakdown.breakdownId, "场/节拍规划", { versionId: `r${plan.breakdown.revision}` }),
        ...plan.shots.map((shot) => artifact("cinematic_shot", shot.shotId, `镜头 ${shot.order}`, { versionId: `r${shot.revision}` })),
        ...(plan.storyboard ? [artifact("storyboard", plan.storyboard.storyboardId, plan.storyboard.title, { versionId: `r${plan.storyboard.revision}` })] : [])
      ]) };
    }
    if (task.stage === "prompt_compile") {
      let units = await dependencies.cinematic.listGenerationUnits({ projectId, productionId });
      if (!units.length) {
        // Platform OS: auto-create units from shots before compile (audit gap fix)
        const { ensureGenerationUnitsForProduction } = await import("../workers/unit-design-worker.mjs");
        await ensureGenerationUnitsForProduction({
          projectId,
          productionId,
          cinematic: dependencies.cinematic,
          projects: ports.projects,
          generationStrategies: resolved.configuration?.generationStrategies
            || resolved.configuration?.workflowManifest?.generationStrategies
            || {},
          storyboards: dependencies.storyboards,
          referenceBindings: resolved.configuration?.referenceBindings || [],
          referenceMediaIds: resolved.configuration?.referenceMediaIds || [],
          visualAnchorPolicy: resolved.configuration?.visualAnchorPolicy || null,
          generationMode: resolved.configuration?.generationMode || null,
          aspectRatio: resolved.configuration?.aspectRatio || resolved.configuration?.workflowManifest?.aspectRatio || "16:9"
        });
        units = await dependencies.cinematic.listGenerationUnits({ projectId, productionId });
      }
      if (!units.length) throw new UnuTvError("generation_units_required", "GenerationUnit 尚未建立；请为已批准镜头选择模型策略", 409);
      // Optional knowledge-grounded auto signoff when knowledge port is wired
      if (dependencies.knowledge) {
        const { autoSignoffGenerationUnit } = await import("../workers/expert-signoff-worker.mjs");
        for (const entry of units) {
          const existing = await dependencies.cinematic.listProfessionalContributions({ projectId, productionId });
          const has = existing.some((item) => item.targetId === entry.generationUnit.generationUnitId
            && Array.isArray(item.knowledgeRefs) && item.knowledgeRefs.some((ref) => String(ref).startsWith("kn-")));
          if (!has) {
            await autoSignoffGenerationUnit({
              projectId,
              productionId,
              generationUnitId: entry.generationUnit.generationUnitId,
              roles: ["continuity", "cinematography"],
              cinematic: dependencies.cinematic,
              knowledge: dependencies.knowledge
            });
          }
        }
      }
      const compilations = [];
      for (const entry of units) {
        const generationUnitId = entry.generationUnit.generationUnitId;
        const compilation = await dependencies.cinematic.compileGenerationUnit({ projectId, productionId, generationUnitId });
        const preflight = await dependencies.cinematic.preflightGenerationUnit({ projectId, productionId, generationUnitId });
        if (!preflight.ready) {
          throw new UnuTvError("automation_generation_unit_preflight_failed", `${generationUnitId} 未通过正式生成预检，Agent 不得继续提交 Provider。`, 409, {
            continuityAudit: preflight.continuityAudit,
            generationUnitId,
            lint: preflight.lint,
            modelPreflight: preflight.preflight,
            staleSources: preflight.staleSources
          });
        }
        compilations.push(compilation);
      }
      return { output: output(compilations.map((entry) => artifact("prompt_compilation", entry.compilationId, "CinematicPromptEnvelopeV2", { versionId: entry.envelope?.payloadHash }))) };
    }
    if (task.stage === "video_generation" && resolved.configuration?.workflowManifest) {
      // Cinematic OS path only: formal GenerationUnit run (no storyboard batch).
      const budgetless = isBudgetlessWorkflow(resolved);
      const units = await dependencies.cinematic.listGenerationUnits({ projectId, productionId });
      if (!units.length) throw new UnuTvError("generation_units_required", "正式视频阶段需要 GenerationUnit；禁止 storyboard batch 冒充 formal 路径", 409);
      const evaluations = await dependencies.cinematic.listEvaluations({ projectId, productionId });
      const latestEvaluations = latestCinematicEvaluationsByUnit(evaluations);
      const pendingUnits = units.filter((entry) => latestEvaluations.get(entry.generationUnit.generationUnitId)?.decision !== "ACCEPT");
      if (!pendingUnits.length) {
        return { reused: true, output: output(units.map((entry) => {
          const accepted = latestEvaluations.get(entry.generationUnit.generationUnitId);
          return artifact("cinematic_evaluation", accepted?.evaluationId || entry.generationUnit.generationUnitId, `已验收 ${entry.generationUnit.generationUnitId}`, { mediaId: accepted?.mediaId, versionId: accepted ? `r${accepted.revision}` : undefined });
        })) };
      }
      const budgetInput = generationStrategy(resolved, "video_generation");
      if (!budgetless && (!budgetInput?.provider || !budgetInput?.model || !(Number(budgetInput.perItemAmount ?? budgetInput.amount) > 0))) {
        throw new UnuTvError("automation_generation_strategy_required", "legacy_budget 自动视频生成需要 Provider、模型与预留金额", 409, { stage: task.stage });
      }
      const receipts = [];
      for (const entry of pendingUnits) {
        const unit = entry.generationUnit;
        const preflight = await dependencies.cinematic.preflightGenerationUnit({ projectId, productionId, generationUnitId: unit.generationUnitId });
        if (!preflight.ready) throw new UnuTvError("automation_generation_unit_preflight_failed", `${unit.generationUnitId} 预检失效，已停止 Provider 提交。`, 409, preflight);
        const receipt = await dependencies.cinematic.runGenerationUnit({
          projectId,
          productionId,
          generationUnitId: unit.generationUnitId,
          ...(budgetless ? { billingMode: "provider_account" } : {
            billingMode: "legacy_budget",
            amount: Number(budgetInput.perItemAmount ?? budgetInput.amount),
            currency: budgetInput.currency
          }),
          idempotencyKey: `${task.idempotencyKey}:attempt:${task.attempt}:unit:${unit.generationUnitId}:provider:v1`,
          operationContext
        });
        if (receipt.outcomeUnknown) throw new UnuTvError("paid_submission_outcome_unknown", `${unit.generationUnitId} Provider 结果待确认，自动流程不会重复提交。`, 409, { runId: receipt.run?.id });
        receipts.push(receipt);
      }
      if (receipts.some((receipt) => receipt.pending)) return { waiting: true, output: output(receipts.map((receipt) => artifact("provider_run", receipt.run.id, "GenerationUnit 视频任务"))) };

      // A generated take is only a candidate. A media receipt is not an
      // evaluation and must never be promoted to ACCEPT by the executor.
      // Persisting it on the storyboard is safe for inspection, while the
      // continuity_qa gate remains blocked until a real evaluation exists.
      for (const receipt of receipts) {
        const generationUnitId = receipt.compilation?.generationUnitId || receipt.generationUnitId;
        const mediaId = receipt.canvasNode?.payload?.currentMediaId
          || receipt.run?.result?.artifacts?.find((item) => item.kind === "video")?.id
          || null;
        if (!generationUnitId || !mediaId || !dependencies.storyboards?.listStoryboards || !dependencies.storyboards?.setStoryboardShotMedia) continue;
        const unitRecord = await dependencies.cinematic.getGenerationUnit({ projectId, productionId, generationUnitId });
        const boards = await dependencies.storyboards.listStoryboards({ projectId, productionId });
        for (const board of boards) {
          for (const shot of board.shots) {
            if (unitRecord.generationUnit.shotLinks.some((link) => link.shotId === shot.shotId) && !shot.videoMediaId) {
              let checksum = mediaId;
              try {
                const opened = ports.media?.open?.(projectId, mediaId);
                checksum = opened?.sha256 || mediaId;
              } catch { /* ignore */ }
              await dependencies.storyboards.setStoryboardShotMedia({
                projectId,
                productionId,
                storyboardId: board.storyboardId,
                storyboardShotId: shot.storyboardShotId,
                videoMediaId: mediaId,
                videoVersionId: `candidate-${generationUnitId}`,
                videoChecksum: checksum
              });
            }
          }
        }
      }

      return { output: output(receipts.map((receipt) => artifact("shot_video", receipt.compilation?.generationUnitId || receipt.run?.id, "GenerationUnit 视频候选", { mediaId: receipt.canvasNode?.payload?.currentMediaId, versionId: receipt.compilation?.envelope?.payloadHash }))) };
    }
    if (task.stage === "image_generation" && resolved.configuration?.workflowManifest) {
      // A semantic reference-driven shot must materialise/select its visual
      // anchor before video generation. The image is not a temporal first
      // frame unless the shot explicitly selected storyboard_first_frame.
      const units = await dependencies.cinematic.listGenerationUnits({ projectId, productionId });
      const needsImages = units.some((entry) => {
        const mode = entry.generationUnit?.generationParameters?.mode;
        const anchors = entry.generationUnit?.visualAnchorPolicy;
        return mode === "image_reference" || (anchors && anchors !== "NONE");
      });
      if (!needsImages) return { reused: true, output: output([artifact("image_stage_not_required", productionId, "本镜明确选择 text_to_video")]) };
    }
    if (task.stage === "image_generation" || task.stage === "video_generation") {
      // Legacy non-cinematic automation may still use storyboard batch for images/videos.
      const budgetless = isBudgetlessWorkflow(resolved);
      const boards = await dependencies.storyboards.listStoryboards({ projectId, productionId });
      const mediaField = task.stage === "image_generation" ? "imageMediaId" : "videoMediaId";
      const missing = boards.flatMap((board) => board.shots.filter((shot) => !shot[mediaField]).map((shot) => ({ storyboardId: board.storyboardId, storyboardShotId: shot.storyboardShotId })));
      if (missing.length) {
        const budgetInput = generationStrategy(resolved, task.stage);
        const units = await dependencies.cinematic.listGenerationUnits({ projectId, productionId });
        const matchingUnit = units.find((entry) => entry.generationUnit?.shotLinks?.some((link) => missing.some((item) => item.storyboardShotId === link.shotId)));
        const fallbackNode = resolved.canvas?.nodes.find((node) => (task.stage === "image_generation" ? ["image", "imageEdit"].includes(node.kind) : ["video", "videoShot", "video-clip"].includes(node.kind)));
        const workflowStrategy = budgetless || !budgetInput ? {
          provider: matchingUnit?.generationUnit?.generationParameters?.provider ?? budgetInput?.provider,
          model: matchingUnit?.generationUnit?.generationParameters?.model ?? budgetInput?.model,
          executionNodeId: matchingUnit?.generationUnit?.executionNodeId ?? budgetInput?.executionNodeId ?? fallbackNode?.id
        } : budgetInput;
        if (!workflowStrategy?.provider || !workflowStrategy?.model || !workflowStrategy?.executionNodeId || (!budgetless && !(Number(budgetInput?.perItemAmount ?? budgetInput?.amount) > 0))) {
          throw new UnuTvError("automation_generation_strategy_required", `${task.stage} 需要已编译的 Provider、模型和执行节点；未发起 Provider 调用。`, 409, { stage: task.stage, missing });
        }
        const kind = task.stage === "image_generation" ? "image" : "video";
        const jobs = [];
        for (const board of boards) {
          const missingShotIds = board.shots.filter((shot) => !shot[mediaField]).map((shot) => shot.storyboardShotId);
          if (!missingShotIds.length) continue;
          const existing = (await dependencies.storyboards.listStoryboardBatchJobs({ projectId, productionId, storyboardId: board.storyboardId }))
            .find((job) => job.kind === kind && job.configuration?.automationTaskId === task.id && job.status !== "cancelled");
          let job = existing ?? await dependencies.storyboards.createStoryboardBatchJob({
            projectId, productionId, storyboardId: board.storyboardId, storyboardShotIds: missingShotIds, kind,
            provider: workflowStrategy.provider, model: workflowStrategy.model,
            configuration: {
              ...(budgetless ? {} : budgetInput?.configuration),
              ...(budgetless ? { billingMode: "provider_account" } : {
                billingMode: "legacy_budget",
                amount: Number(budgetInput.perItemAmount ?? budgetInput.amount), currency: budgetInput.currency
              }),
              executionNodeId: workflowStrategy.executionNodeId, automationTaskId: task.id
            },
            operationContext
          });
          if (!["succeeded", "cancelled"].includes(job.status)) job = await dependencies.storyboards.advanceStoryboardBatchJob({ projectId, productionId, jobId: job.id, operationContext });
          jobs.push(job);
        }
        const failed = jobs.find((job) => ["failed", "cancelled"].includes(job.status) || job.items.some((item) => ["failed", "blocked"].includes(item.status)));
        if (failed) throw new UnuTvError("automation_storyboard_batch_blocked", "自动故事板 Provider 批次被门禁或失败状态阻塞", 409, { jobId: failed.id, status: failed.status, items: failed.items.filter((item) => ["failed", "blocked"].includes(item.status)).map((item) => ({ id: item.id, error: item.error })) });
        if (jobs.some((job) => job.status !== "succeeded")) return { waiting: true, output: output(jobs.map((job) => artifact("storyboard_batch", job.id, `${kind} 批量生产`))) };
      }
      const refreshedBoards = await dependencies.storyboards.listStoryboards({ projectId, productionId });
      if (task.stage === "image_generation" && resolved.configuration?.workflowManifest && dependencies.storyboards?.selectStoryboardImageForVideo) {
        // Every generated storyboard image becomes an explicit semantic
        // reference candidate. This is deliberately separate from
        // storyboard_first_frame selection: the image anchors identity,
        // scene topology and spatial layout; the shot contract controls time,
        // action, performance and camera motion.
        for (const board of refreshedBoards) {
          for (const shot of board.shots) {
            if (!shot.imageMediaId || shot.videoReference?.selected) continue;
            await dependencies.storyboards.selectStoryboardImageForVideo({
              projectId,
              productionId,
              storyboardId: board.storyboardId,
              storyboardShotId: shot.storyboardShotId,
              selected: true,
              role: "storyboard_composition",
              controls: ["人物身份", "场景构图", "空间站位", "服装与道具连续"],
              doesNotControl: ["动作时序", "表演节奏", "摄影机运动", "剪辑时点", "声音与对白"]
            });
          }
        }
      }
      return { reused: missing.length === 0, output: output(refreshedBoards.flatMap((board) => board.shots.map((shot) => artifact(mediaField === "imageMediaId" ? "storyboard_image" : "shot_video", shot.storyboardShotId, shot.title, { mediaId: shot[mediaField] })))) };
    }
    if (task.stage === "sound_design") {
      const budgetless = isBudgetlessWorkflow(resolved);
      // Native-audio formal units already carry dialogue/ambience; soft-pass separate sound stage.
      if (resolved.configuration?.workflowManifest) {
        const units = await dependencies.cinematic.listGenerationUnits({ projectId, productionId });
        const nativeAudio = units.some((entry) => entry.generationUnit?.generationParameters?.generateAudio !== false);
        if (nativeAudio) {
          return {
            reused: true,
            output: output([artifact("native_audio", productionId, "视频原生音频，跳过独立 sound_design")])
          };
        }
      }
      const timelines = await dependencies.timeline.listTimelines({ projectId });
      const audioClips = [];
      for (const summary of timelines) {
        const timeline = await dependencies.timeline.getTimeline({ projectId, timelineId: summary.id });
        audioClips.push(...timeline.clips.filter((clip) => clip.track === 1 && clip.mediaId));
      }
      const audioNodes = resolved.canvas?.nodes.filter((node) => node.kind === "audio" && node.payload?.currentMediaId) ?? [];
      if (!audioClips.length && !audioNodes.length) {
        const budgetInput = generationStrategy(resolved, "sound_design");
        if (!budgetInput?.provider || !budgetInput?.model || !budgetInput?.executionNodeId) {
          throw new UnuTvError(
            "automation_sound_generation_strategy_required",
            "声音资产缺失；请在工作流策略中绑定声音 Provider、模型和音频执行节点，或导入现有音频",
            409,
            { stage: task.stage }
          );
        }
        if (!budgetless && !(Number(budgetInput.amount ?? budgetInput.perItemAmount) > 0)) {
          throw new UnuTvError("automation_generation_strategy_required", "legacy_budget 自动声音生成还需要预留金额", 409, { stage: task.stage });
        }
        const node = resolved.canvas?.nodes.find((entry) => entry.id === budgetInput.executionNodeId && entry.kind === "audio");
        if (!node) throw new UnuTvError("automation_audio_execution_node_invalid", "声音生成必须选择当前画布中的音频节点", 409);
        const idempotencyKey = `${task.idempotencyKey}:attempt:${task.attempt}:provider:v1`;
        let run = (await ports.projects.listRuns(projectId)).find((entry) => entry.nodeId === node.id && entry.request?.idempotencyKey === idempotencyKey) ?? null;
        if (run?.status === "queued") throw new UnuTvError("paid_submission_outcome_unknown", "检测到未确认结果的声音 Provider 提交；为避免重复提交，已停止自动重发", 409, { runId: run.id, idempotencyKey });
        if (!run) run = await dependencies.runNode({
          projectId,
          nodeId: node.id,
          provider: budgetInput.provider,
          request: {
            ...(budgetInput.configuration?.request ?? {}),
            billingMode: budgetless ? "provider_account" : "legacy_budget",
            idempotencyKey,
            model: budgetInput.model,
            text: budgetInput.configuration?.text ?? node.payload?.prompt ?? node.title
          }
        });
        else if (run.status === "running") run = await dependencies.pollRun({ projectId, runId: run.id });
        if (["queued", "running"].includes(run.status)) return { waiting: true, output: output([artifact("provider_run", run.id, "声音 Provider 任务")], { providerRunId: run.id }) };
        if (run.status !== "succeeded") throw new UnuTvError(run.result?.code ?? "automation_sound_provider_failed", run.result?.message ?? "声音 Provider 任务失败", 409, { runId: run.id });
        const generated = (run.result?.artifacts ?? []).filter((entry) => entry.kind === "audio");
        if (!generated.length) throw new UnuTvError("automation_sound_artifact_missing", "声音 Provider 未返回音频产物", 502, { runId: run.id });
        return { output: output(generated.map((entry) => artifact("audio_node", node.id, node.title, { mediaId: entry.id, providerRunId: run.id }))) };
      }
      return { reused: true, output: output([
        ...audioClips.map((clip) => artifact("timeline_audio", clip.id, "时间线音频", { mediaId: clip.mediaId })),
        ...audioNodes.map((node) => artifact("audio_node", node.id, node.title, { mediaId: node.payload.currentMediaId }))
      ]) };
    }
    if (task.stage === "continuity_qa") {
      const evaluations = await dependencies.cinematic.listEvaluations({ projectId, productionId });
      const units = await dependencies.cinematic.listGenerationUnits({ projectId, productionId });
      const strictUnits = units.filter((entry) => entry.generationUnit.executionGates?.requireContinuityStateAudit === true);
      const latestEvaluations = latestCinematicEvaluationsByUnit(evaluations);
      const accepted = strictUnits.length
        ? [...latestEvaluations.values()].filter((entry) => entry.decision === "ACCEPT")
        : evaluations.filter((entry) => entry.decision === "ACCEPT");
      if (!accepted.length) throw new UnuTvError("continuity_evaluation_required", "需要至少一条 ACCEPT 的 CinematicEvaluationRecord 才能进入剪辑", 409);
      for (const entry of strictUnits) {
        const generationUnitId = entry.generationUnit.generationUnitId;
        const evaluation = latestEvaluations.get(generationUnitId);
        if (evaluation?.decision !== "ACCEPT") {
          throw new UnuTvError("latest_cinematic_evaluation_rejected", `${generationUnitId} 的最新审片结论不是 ACCEPT，不能进入剪辑。`, 409, {
            decision: evaluation?.decision ?? null,
            evaluationId: evaluation?.evaluationId ?? null,
            generationUnitId
          });
        }
        if (!evaluation?.actualContinuityState) {
          throw new UnuTvError("structured_continuity_evaluation_required", `${generationUnitId} 缺少带实际出口状态的 ACCEPT 审片记录，不能进入剪辑。`, 409, { generationUnitId });
        }
        const preflight = await dependencies.cinematic.preflightGenerationUnit({ projectId, productionId, generationUnitId, recompile: true });
        if (!preflight.ready) throw new UnuTvError("continuity_chain_preflight_failed", `${generationUnitId} 的相邻镜连续性链在审片后失效。`, 409, preflight);
      }
      return { reused: true, output: output(accepted.map((entry) => artifact("cinematic_evaluation", entry.evaluationId, "连续性审片", { versionId: `r${entry.revision}`, mediaId: entry.mediaId }))) };
    }
    if (task.stage === "timeline_edit") {
      const boards = await dependencies.storyboards.listStoryboards({ projectId, productionId });
      const board = boards.find((entry) => entry.shots.some((shot) => shot.videoMediaId));
      if (!board) throw new UnuTvError("storyboard_video_required", "没有可进入时间线的故事板视频版本", 409);
      const receipt = await dependencies.storyboards.importStoryboardToTimeline({ projectId, productionId, storyboardId: board.storyboardId, timelineId: resolved.configuration.timelineId });
      if (receipt.status === "failed" || receipt.status === "empty") throw new UnuTvError("timeline_import_failed", "故事板未能进入时间线", 409, receipt);
      return { output: output([artifact("timeline", receipt.timelineId, "主时间线")], { importReceipt: receipt }) };
    }
    if (task.stage === "candidate_render") {
      const timelines = await dependencies.timeline.listTimelines({ projectId });
      const timelineId = resolved.configuration.timelineId ?? timelines[0]?.id;
      if (!timelineId) throw new UnuTvError("timeline_required", "候选渲染需要主时间线", 409);
      const jobs = await dependencies.render.listRenderJobs({ projectId, timelineId });
      let job = jobs.find((entry) => entry.idempotencyKey === `${task.automationRunId}:candidate_render:v1`);
      if (!job) job = await dependencies.render.createRenderJob({ projectId, timelineId, preset: resolved.configuration.renderPreset ?? "h264_review", idempotencyKey: `${task.automationRunId}:candidate_render:v1` });
      if (["queued", "running"].includes(job.status)) return { waiting: true, output: output([artifact("render_job", job.id, "候选母版渲染")], { renderJobId: job.id }) };
      if (job.status !== "succeeded") throw new UnuTvError("candidate_render_failed", job.error?.message ?? "候选母版渲染失败", 409, job.error);
      return { output: output([artifact("render_job", job.id, "候选母版", { mediaId: job.outputMediaId })], { renderJobId: job.id }) };
    }
    if (task.stage === "delivery_qc") {
      const jobs = await dependencies.render.listRenderJobs({ projectId });
      const job = jobs.find((entry) => entry.status === "succeeded");
      if (!job) throw new UnuTvError("successful_render_required", "没有成功的候选母版可做交付 QC", 409);
      const manifest = await dependencies.render.createDeliveryPackage({ projectId, renderJobId: job.id, acceptWarnings: resolved.configuration.acceptQcWarnings === true });
      return { output: output([artifact("delivery_package", manifest.id, "交付清单", { mediaId: manifest.mediaId, versionId: manifest.checksum })]) };
    }
    throw new UnuTvError("automation_stage_unimplemented", `Automation stage is not implemented: ${task.stage}`, 500);
  }

  return { handleStage };
}
