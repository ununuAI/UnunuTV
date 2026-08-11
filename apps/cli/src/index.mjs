#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { parseJson, UnuTvError } from "@ununu/unutv-contracts";
import { createLocalRuntime } from "@ununu/unutv-local-runtime";
import { executeCinematicSequenceCommand } from "./cinematic-sequence-commands.mjs";
import { executeScreenplayAuthoringCommand } from "./screenplay-authoring-command.mjs";
import { executeScreenplayReviewCommand } from "./screenplay-review-command.mjs";
import { executeScreenplayRevisionCommand } from "./screenplay-revision-command.mjs";

function parseArguments(argv) {
  const positionals = [];
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) {
      positionals.push(value);
      continue;
    }
    const [rawName, inline] = value.slice(2).split("=", 2);
    const next = argv[index + 1];
    if (inline !== undefined) flags[rawName] = inline;
    else if (next && !next.startsWith("--")) {
      flags[rawName] = next;
      index += 1;
    } else flags[rawName] = true;
  }
  return { positionals, flags };
}

function required(flags, name) {
  if (typeof flags[name] !== "string" || flags[name].trim() === "") {
    throw new UnuTvError("missing_flag", `--${name} is required`);
  }
  return flags[name];
}

function numeric(flags, name, fallback) {
  if (flags[name] === undefined) return fallback;
  const value = Number(flags[name]);
  if (!Number.isFinite(value)) throw new UnuTvError("invalid_flag", `--${name} must be a number`);
  return value;
}

function objectFlag(flags, name, fallback = {}) {
  return parseJson(flags[name], fallback);
}

function objectFileOrFlag(flags, fileName = "file", dataName = "data", fallback = {}) {
  if (typeof flags[fileName] === "string" && flags[fileName].trim()) {
    return parseJson(readFileSync(flags[fileName], "utf8"), fallback);
  }
  return objectFlag(flags, dataName, fallback);
}

function booleanFlag(flags, name, fallback = false) {
  if (flags[name] === undefined) return fallback;
  if (flags[name] === true || flags[name] === "true") return true;
  if (flags[name] === "false") return false;
  throw new UnuTvError("invalid_flag", `--${name} must be true or false`);
}

function operationContextFromFlags(flags) {
  if (!flags.actor && !flags["automation-run"] && !flags.lease && !flags["task-lease"] && !flags["idempotency-key"]) return null;
  return {
    actorType: flags.actor || "owner",
    actorId: flags["actor-id"] || flags.actor || "cli",
    automationRunId: flags["automation-run"] || null,
    leaseId: flags.lease || null,
    taskLeaseId: flags["task-lease"] || null,
    idempotencyKey: flags["idempotency-key"] || null
  };
}

function withOperationContext(app, operationContext) {
  if (!operationContext) return app;
  return new Proxy(app, {
    get(target, property) {
      const value = target[property];
      if (typeof value !== "function") return value;
      return (input = {}, ...rest) => value({ ...input, operationContext: input.operationContext ?? operationContext }, ...rest);
    }
  });
}

function help() {
  return `UnunuTV local CLI

Usage:
  ununu-unutv project create [--title 标题]
  ununu-unutv project list
  ununu-unutv project open --project ID
  ununu-unutv project rename --project ID --title 标题
  ununu-unutv control status --project ID
  ununu-unutv automation start|runs|pause|resume|cancel|takeover|exit --project ID [--automation-run ID]
  ununu-unutv automation checkpoints --project ID [--automation-run ID]
  ununu-unutv automation tasks|activities --project ID --automation-run ID
  ununu-unutv automation claim|activity|task-complete|task-fail|task-heartbeat|task-budget --project ID --automation-run ID --task ID [--data '{}']
  ununu-unutv automation heartbeat|recover|advance|retry --project ID --automation-run ID [--task ID --data '{}']
  ununu-unutv canvas open --project ID --canvas ID
  ununu-unutv node add --project ID --canvas ID --kind KIND [--title 标题 --x 0 --y 0 --payload '{}']
  ununu-unutv node update --project ID --node ID [--title 标题 --x 0 --y 0 --payload '{}']
  ununu-unutv node delete|run --project ID --node ID
  ununu-unutv prompt get|save --project ID --node ID [--data '{}']
  ununu-unutv grid compose --project ID --node ID [--title 标题]
  ununu-unutv image-edit save --project ID --node ID --file /absolute/path [--data '{}']
  ununu-unutv run poll|cancel --project ID --run ID [--reason TEXT]
  ununu-unutv edge connect --project ID --canvas ID --from ID --to ID [--role input]
  ununu-unutv edge delete --project ID --edge ID
  ununu-unutv group create --project ID --canvas ID [--title 标题]
  ununu-unutv group add --project ID --group ID --node ID
  ununu-unutv media import --project ID --file /absolute/path [--node ID --kind image|video|audio|world --generated]
  ununu-unutv media extract-frame --project ID --media ID --seconds 3.9 [--node ID --title 标题]
  ununu-unutv media qa-sheet --project ID --media ID --node ID [--data '{"times":[0.5,6,11.5]}' --title 标题]
  ununu-unutv media separate-audio --project ID --media ID --node ID [--title 标题]
  ununu-unutv media publish --project ID --media ID [--provider ark --expires 86400]
  ununu-unutv media prepare|preparation --project ID --media ID [--force]
  ununu-unutv asset create|list ...
  ununu-unutv asset version --project ID --asset ID --media ID [--payload '{}']
  ununu-unutv production create|list|get|update|reset|plan-script|breakdowns --project ID [--production ID --source-node ID --data '{}']
  ununu-unutv script get|row-add|row-update|row-delete --project ID --node ID [--row ID --data '{}']
  ununu-unutv story get|save --project ID --production ID [--data '{}']
  ununu-unutv bible get|save --project ID --production ID [--data '{}']
  ununu-unutv contribution add|list --project ID --production ID [--target-type TYPE --target ID --data '{}']
  ununu-unutv authority list|search|get|save|update|bind-voice|route|derive|batch|versions|impact|restore|compile|compilation|run --project ID --production ID [--authority ID --data '{}']
  ununu-unutv budget get|save|reserve|reservations|consume|reconcile|release --project ID [--reservation ID --data '{}']
  ununu-unutv storyboard create|list|get|reorder|versions|shot-versions|compare|update-shot|set-media|reference|references|compile --project ID --production ID [--storyboard ID --storyboard-shot ID --data '{}']
  ununu-unutv storyboard-batch create|list|get|advance|retry|cancel --project ID --production ID --storyboard ID [--job ID --item ID --data '{}']
  ununu-unutv shot list|add|update --project ID --production ID [--shot ID --data '{}']
  ununu-unutv unit list|create|update|compile|preflight|run --project ID --production ID [--unit ID --data '{}']
  ununu-unutv evaluation list|add --project ID --production ID [--data '{}']
  ununu-unutv sequence-previs create|list|get|update|versions|playback-receipt|playback-receipts|review --project ID --production ID [--previs ID --revision N --state accepted|rejected --data '{}']
  ununu-unutv visual-context compile|list --project ID --production ID [--previs ID --shot ID]
  ununu-unutv take-memory add|list --project ID --production ID [--unit ID --data '{}']
  ununu-unutv decision-trace add|list --project ID --production ID [--target-type TYPE --target ID --data '{}']
  ununu-unutv model capabilities
  ununu-unutv workflow get --project ID
  ununu-unutv workflow set --project ID --layer L01 --state draft [--payload '{}']
  ununu-unutv workflow short-drama --brief TEXT [--title TEXT --duration 60 --dry-run]
    (canonical cinematic workflow entry; starts UnunuTV orchestration)
  ununu-unutv workflow one-shot --brief TEXT [--title TEXT --duration 8 --provider ark --model MODEL --dry-run]
    (compatibility alias to the same canonical workflow; never a direct Provider path)
  ununu-unutv workflow cinematic-start --project ID --production ID --source-node ID [--target-duration 30] [--series ID --episode N] [--data '{}']
  ununu-unutv workflow cinematic-status --project ID [--automation-run ID]
  ununu-unutv workflow cinematic-author --project ID [--automation-run ID] --file /absolute/episode-package.json
  ununu-unutv workflow cinematic-author-screenplay --project ID --automation-run ID --screenplay-file /absolute/screenplay.md
  ununu-unutv workflow cinematic-review-screenplay --project ID --automation-run ID --review-file /absolute/reviews.json
  ununu-unutv workflow cinematic-revise-screenplay --project ID --automation-run ID --expected-document ID --expected-revision N --expected-checksum SHA256 --reason TEXT
  ununu-unutv workflow canvas-reflow --project ID [--automation-run ID]
  ununu-unutv workflow provider-reconcile --project ID [--automation-run ID]
  ununu-unutv workflow cinematic-advance --project ID [--automation-run ID]
  ununu-unutv workflow owner-decide --project ID --data '{"targetType":"...","targetId":"...","state":"accepted"}'
  ununu-unutv series create|list|get|create-episode|assets|promote-asset|ledger|ledger-commit [--series ID --project ID --data '{}']
  ununu-unutv knowledge retrieve|stats [--data '{}']
  ununu-unutv unit design|auto-signoff --project ID --production ID [--unit ID --data '{}']
  ununu-unutv director get|save|command|bind-world|bind-shot --project ID --node ID [--world-node ID --capture ID --production ID --shot ID --stage '{}' --data '{}']
  ununu-unutv panorama get|set --project ID --node ID [--media ID --metadata '{}']
  ununu-unutv review add --project ID --target ID --state accepted [--type node --note 文本]
  ununu-unutv timeline create|get|add|move|trim|split|ripple|slip|snap|undo|redo ... [--frame-rate 24 --width 864 --height 496 --color-space Rec.709]
  ununu-unutv timeline track-add|track-update|track-remove|track-reorder --project ID --timeline ID [--track-id ID --data '{}']
  ununu-unutv timeline transition-add|transition-update|transition-remove --project ID --timeline ID [--transition ID --data '{}']
  ununu-unutv timeline effect-add|effect-update|effect-remove --project ID --timeline ID [--clip ID --effect ID --data '{}']
  ununu-unutv timeline marker-add|marker-update|marker-remove --project ID --timeline ID [--marker ID --data '{}']
  ununu-unutv timeline keyframe-add|keyframe-update|keyframe-remove --project ID --timeline ID [--clip ID --keyframe ID --data '{}']
  ununu-unutv render create|list|get|qc|cancel|resume|package|packages --project ID [--timeline ID --render-job ID --preset h264_review]
  ununu-unutv serve [--port 4318]
  ununu-unutv settings status

Automation actors use --actor automation --automation-run ID --lease ID --idempotency-key KEY.
All command results are JSON. Runtime data defaults to ~/.unutv and can be changed with UNUTV_DATA_DIR.`;
}

async function execute(app, positionals, flags) {
  app = withOperationContext(app, operationContextFromFlags(flags));
  const [area, action] = positionals;
  const projectId = flags.project;
  const cinematicSequence = await executeCinematicSequenceCommand(app, area, action, flags); if (cinematicSequence.handled) return cinematicSequence.value;
  if (area === "project" && action === "create") return app.createProject({ title: flags.title });
  if (area === "project" && action === "list") return app.listProjects();
  if (area === "project" && action === "open") return app.openProject({ projectId: required(flags, "project") });
  if (area === "project" && action === "rename") return app.updateProject({ projectId: required(flags, "project"), title: required(flags, "title") });
  if (area === "control" && action === "status") return app.getProjectControl({ projectId: required(flags, "project") });
  if (area === "automation" && action === "start") return app.startAutomation({ projectId: required(flags, "project"), configuration: objectFlag(flags, "data") });
  if (area === "workflow" && action === "short-drama") {
    const data = objectFlag(flags, "data");
    const dryRun = flags["dry-run"] === true || flags["dry-run"] === "true" || data.dryRun === true;
    return app.startShortDramaWorkflow({
      ...data,
      brief: flags.brief || data.brief,
      title: flags.title || data.title,
      seriesTitle: flags["series-title"] || data.seriesTitle,
      seriesId: flags.series || data.seriesId,
      targetDurationSeconds: numeric(flags, "duration", data.targetDurationSeconds ?? 60),
      aspectRatio: flags["aspect-ratio"] || data.aspectRatio || "9:16",
      provider: flags.provider || data.provider || "ark",
      model: flags.model || data.model,
      dryRun,
      fullDelivery: data.fullDelivery !== false && flags["no-delivery"] !== true && flags["no-delivery"] !== "true",
      execute: !dryRun && flags["no-video"] !== true && flags["no-video"] !== "true"
    });
  }
  if (area === "workflow" && action === "one-shot") {
    const data = objectFlag(flags, "data");
    const dryRun = flags["dry-run"] === true || flags["dry-run"] === "true" || data.dryRun === true;
    return app.startShortDramaWorkflow({
      ...data,
      brief: flags.brief || data.brief,
      title: flags.title || data.title,
      seriesTitle: flags["series-title"] || data.seriesTitle,
      seriesId: flags.series || data.seriesId,
      targetDurationSeconds: numeric(flags, "duration", data.targetDurationSeconds ?? 60),
      aspectRatio: flags["aspect-ratio"] || data.aspectRatio || "9:16",
      provider: flags.provider || data.provider || "ark",
      model: flags.model || data.model,
      dryRun,
      fullDelivery: data.fullDelivery !== false && flags["no-delivery"] !== true && flags["no-delivery"] !== "true",
      execute: !dryRun && flags["no-video"] !== true && flags["no-video"] !== "true"
    });
  }
  if (area === "workflow" && action === "cinematic-start") return app.startCinematicWorkflow({
    projectId: required(flags, "project"),
    productionId: flags.production || objectFlag(flags, "data").productionId,
    sourceNodeId: flags["source-node"] || objectFlag(flags, "data").sourceNodeId,
    seriesId: flags.series || objectFlag(flags, "data").seriesId,
    episodeNumber: flags.episode ? Number(flags.episode) : objectFlag(flags, "data").episodeNumber,
    brief: flags.brief || objectFlag(flags, "data").brief,
    targetDurationSeconds: numeric(flags, "target-duration", undefined),
    generationStrategies: objectFlag(flags, "data").generationStrategies,
    configuration: objectFlag(flags, "data")
  });
  if (area === "workflow" && action === "cinematic-status") return app.getCinematicWorkflowStatus({ projectId: required(flags, "project"), automationRunId: flags["automation-run"] || undefined });
  if (area === "workflow" && action === "cinematic-author") return app.authorEpisode({
    projectId: required(flags, "project"),
    automationRunId: flags["automation-run"] || undefined,
    package: objectFileOrFlag(flags)
  });
  if (area === "workflow" && action === "cinematic-author-screenplay") return executeScreenplayAuthoringCommand(app, flags);
  if (area === "workflow" && action === "cinematic-review-screenplay") return executeScreenplayReviewCommand(app, flags);
  if (area === "workflow" && action === "cinematic-revise-screenplay") return executeScreenplayRevisionCommand(app, flags);
  if (area === "workflow" && action === "canvas-reflow") return app.reflowCinematicCanvas({
    projectId: required(flags, "project"),
    automationRunId: flags["automation-run"] || undefined
  });
  if (area === "workflow" && action === "provider-reconcile") return app.reconcileProviderSubmission({
    projectId: required(flags, "project"),
    automationRunId: flags["automation-run"] || undefined
  });
  if (area === "workflow" && action === "cinematic-advance") return app.advanceCinematicWorkflow({ projectId: required(flags, "project"), automationRunId: flags["automation-run"] || undefined });
  if (area === "workflow" && action === "owner-decide") return app.ownerDecision({ projectId: required(flags, "project"), ...objectFlag(flags, "data") });
  if (area === "series" && action === "create") return app.createSeries(objectFlag(flags, "data"));
  if (area === "series" && action === "list") return { series: await app.listSeries() };
  if (area === "series" && action === "get") return app.getSeries({ seriesId: required(flags, "series") });
  if (area === "series" && action === "create-episode") return app.createEpisode({ seriesId: required(flags, "series"), projectId: required(flags, "project"), ...objectFlag(flags, "data") });
  if (area === "series" && action === "assets") return app.listSeriesAssets({ seriesId: required(flags, "series") });
  if (area === "series" && action === "promote-asset") return app.promoteSeriesAsset({ seriesId: required(flags, "series"), ...objectFlag(flags, "data") });
  if (area === "series" && action === "ledger") return app.getSeriesLedger({ seriesId: required(flags, "series") });
  if (area === "series" && action === "ledger-commit") return app.commitSeriesLedger({ seriesId: required(flags, "series"), ...objectFlag(flags, "data") });
  if (area === "knowledge" && action === "retrieve") return app.retrieveKnowledge(objectFlag(flags, "data"));
  if (area === "knowledge" && action === "stats") return app.knowledgeStats();
  if (area === "unit" && action === "design") return app.designGenerationUnits({ projectId: required(flags, "project"), productionId: required(flags, "production"), ...objectFlag(flags, "data") });
  if (area === "unit" && action === "auto-signoff") return app.autoSignoff({ projectId: required(flags, "project"), productionId: required(flags, "production"), generationUnitId: required(flags, "unit"), ...objectFlag(flags, "data") });
  if (area === "automation" && action === "runs") return { runs: await app.listAutomationRuns({ projectId: required(flags, "project") }) };
  if (area === "automation" && action === "checkpoints") return { checkpoints: await app.listAutomationCheckpoints({ projectId: required(flags, "project"), automationRunId: flags["automation-run"] || null }) };
  if (area === "automation" && action === "tasks") return { tasks: await app.listAutomationTasks({ projectId: required(flags, "project"), automationRunId: required(flags, "automation-run") }) };
  if (area === "automation" && action === "activities") return { activities: await app.listAutomationTaskActivities({ projectId: required(flags, "project"), automationRunId: required(flags, "automation-run"), taskId: flags.task || null }) };
  if (area === "automation" && action === "claim") return app.claimAutomationTask({ projectId: required(flags, "project"), automationRunId: required(flags, "automation-run"), taskId: required(flags, "task"), ...objectFlag(flags, "data") });
  if (area === "automation" && action === "activity") return app.reportAutomationTaskActivity({ projectId: required(flags, "project"), automationRunId: required(flags, "automation-run"), taskId: required(flags, "task"), ...objectFlag(flags, "data") });
  if (area === "automation" && action === "task-complete") return app.completeAutomationTask({ projectId: required(flags, "project"), automationRunId: required(flags, "automation-run"), taskId: required(flags, "task"), ...objectFlag(flags, "data") });
  if (area === "automation" && action === "task-fail") return app.failAutomationTask({ projectId: required(flags, "project"), automationRunId: required(flags, "automation-run"), taskId: required(flags, "task"), ...objectFlag(flags, "data") });
  if (area === "automation" && action === "task-heartbeat") return app.heartbeatAutomationTask({ projectId: required(flags, "project"), automationRunId: required(flags, "automation-run"), taskId: required(flags, "task"), ...objectFlag(flags, "data") });
  if (area === "automation" && action === "task-budget") return app.bindAutomationTaskBudget({ projectId: required(flags, "project"), automationRunId: required(flags, "automation-run"), taskId: required(flags, "task"), ...objectFlag(flags, "data") });
  if (area === "automation" && action === "pause") return app.pauseAutomation({ projectId: required(flags, "project"), automationRunId: required(flags, "automation-run"), snapshot: objectFlag(flags, "data") });
  if (area === "automation" && action === "resume") return app.resumeAutomation({ projectId: required(flags, "project"), automationRunId: required(flags, "automation-run") });
  if (area === "automation" && action === "heartbeat") return app.heartbeatAutomation({ projectId: required(flags, "project"), automationRunId: required(flags, "automation-run") });
  if (area === "automation" && action === "recover") return app.recoverAutomation({ projectId: required(flags, "project"), automationRunId: required(flags, "automation-run") });
  if (area === "automation" && action === "cancel") return app.cancelAutomation({ projectId: required(flags, "project"), automationRunId: required(flags, "automation-run") });
  if (area === "automation" && action === "takeover") return app.takeoverAutomation({ projectId: required(flags, "project"), automationRunId: required(flags, "automation-run"), snapshot: objectFlag(flags, "data") });
  if (area === "automation" && action === "exit") return app.exitAutomation({ projectId: required(flags, "project"), automationRunId: required(flags, "automation-run") });
  if (area === "automation" && action === "complete") return app.completeAutomation({ projectId: required(flags, "project"), automationRunId: required(flags, "automation-run") });
  if (area === "automation" && action === "fail") return app.failAutomation({ projectId: required(flags, "project"), automationRunId: required(flags, "automation-run"), failure: objectFlag(flags, "data") });
  if (area === "automation" && action === "advance") return app.advanceAutomation({ projectId: required(flags, "project"), automationRunId: required(flags, "automation-run") });
  if (area === "automation" && action === "retry") return app.retryAutomationTask({ projectId: required(flags, "project"), automationRunId: required(flags, "automation-run"), taskId: required(flags, "task"), ...objectFlag(flags, "data") });
  if (area === "canvas" && action === "create") return app.createCanvas({ projectId: required(flags, "project"), title: flags.title });
  if (area === "canvas" && action === "open") return app.openCanvas({ projectId: required(flags, "project"), canvasId: required(flags, "canvas") });
  if (area === "node" && action === "add") return app.createNode({
    projectId: required(flags, "project"), canvasId: required(flags, "canvas"), kind: required(flags, "kind"),
    title: flags.title, x: numeric(flags, "x", 0), y: numeric(flags, "y", 0), payload: objectFlag(flags, "payload")
  });
  if (area === "node" && action === "update") return app.updateNode({
    projectId: required(flags, "project"), nodeId: required(flags, "node"), title: flags.title,
    x: flags.x === undefined ? undefined : numeric(flags, "x"), y: flags.y === undefined ? undefined : numeric(flags, "y"),
    width: flags.width === undefined ? undefined : numeric(flags, "width"), height: flags.height === undefined ? undefined : numeric(flags, "height"),
    payload: flags.payload === undefined ? undefined : objectFlag(flags, "payload"),
    expectedRevision: flags.revision === undefined ? undefined : numeric(flags, "revision")
  });
  if (area === "node" && action === "delete") return app.deleteNode({ projectId: required(flags, "project"), nodeId: required(flags, "node") });
  if (area === "node" && action === "run") return app.runNode({ projectId: required(flags, "project"), nodeId: required(flags, "node"), request: objectFlag(flags, "request") });
  if (area === "prompt" && action === "get") return { prompt: await app.getNodePrompt({ projectId: required(flags, "project"), nodeId: required(flags, "node") }) };
  if (area === "prompt" && action === "save") return app.saveNodePrompt({ projectId: required(flags, "project"), nodeId: required(flags, "node"), ...objectFlag(flags, "data") });
  if (area === "grid" && action === "compose") return app.composeGridNode({ projectId: required(flags, "project"), nodeId: required(flags, "node"), title: flags.title });
  if (area === "image-edit" && action === "save") return app.saveImageEditResult({ projectId: required(flags, "project"), nodeId: required(flags, "node"), filePath: required(flags, "file"), title: flags.title, document: objectFlag(flags, "data") });
  if (area === "run" && action === "poll") return app.pollRun({ projectId: required(flags, "project"), runId: required(flags, "run") });
  if (area === "run" && action === "cancel") return app.cancelRun({ projectId: required(flags, "project"), runId: required(flags, "run"), reason: flags.reason });
  if (area === "edge" && action === "connect") return app.connectEdge({ projectId: required(flags, "project"), canvasId: required(flags, "canvas"), fromNodeId: required(flags, "from"), toNodeId: required(flags, "to"), role: flags.role });
  if (area === "edge" && action === "delete") return app.disconnectEdge({ projectId: required(flags, "project"), edgeId: required(flags, "edge") });
  if (area === "group" && action === "create") return app.createGroup({ projectId: required(flags, "project"), canvasId: required(flags, "canvas"), title: flags.title, x: numeric(flags, "x", 0), y: numeric(flags, "y", 0), width: numeric(flags, "width", 960), height: numeric(flags, "height", 640) });
  if (area === "group" && action === "add") return app.addGroupMember({ projectId: required(flags, "project"), groupId: required(flags, "group"), nodeId: required(flags, "node") });
  if (area === "media" && action === "import") return app.importMedia({ projectId: required(flags, "project"), filePath: required(flags, "file"), nodeId: flags.node, kind: flags.kind, generated: Boolean(flags.generated), title: flags.title });
  if (area === "media" && action === "extract-frame") return app.extractMediaFrame({ projectId: required(flags, "project"), mediaId: required(flags, "media"), seconds: numeric(flags, "seconds"), nodeId: flags.node, title: flags.title });
  if (area === "media" && action === "qa-sheet") return app.createVideoQaContactSheet({ projectId: required(flags, "project"), mediaId: required(flags, "media"), nodeId: required(flags, "node"), title: flags.title, ...objectFlag(flags, "data") });
  if (area === "media" && action === "separate-audio") return app.separateMediaAudio({ projectId: required(flags, "project"), mediaId: required(flags, "media"), sourceNodeId: required(flags, "node"), title: flags.title });
  if (area === "media" && action === "publish") return app.publishMedia({ projectId: required(flags, "project"), mediaId: required(flags, "media"), provider: flags.provider, expiresInSeconds: numeric(flags, "expires", 86400) });
  if (area === "media" && action === "prepare") return app.prepareMedia({ projectId: required(flags, "project"), mediaId: required(flags, "media"), force: booleanFlag(flags, "force") });
  if (area === "media" && action === "preparation") return app.getMediaPreparation({ projectId: required(flags, "project"), mediaId: required(flags, "media") });
  if (area === "asset" && action === "create") return app.createAsset({ projectId: required(flags, "project"), role: flags.role, title: flags.title });
  if (area === "asset" && action === "list") return { assets: await app.listAssets({ projectId: required(flags, "project") }) };
  if (area === "asset" && action === "version") return app.addAssetVersion({ projectId: required(flags, "project"), assetId: required(flags, "asset"), mediaId: required(flags, "media"), payload: objectFlag(flags, "payload") });
  if (area === "production" && action === "create") return app.createCinematicProduction({
    projectId: required(flags, "project"),
    ...objectFlag(flags, "data"),
    ...(flags["source-node"] ? { sourceNodeId: flags["source-node"] } : {})
  });
  if (area === "production" && action === "list") return { productions: await app.listCinematicProductions({ projectId: required(flags, "project") }) };
  if (area === "production" && action === "get") return app.getCinematicProduction({ projectId: required(flags, "project"), productionId: required(flags, "production") });
  if (area === "production" && action === "update") return app.updateCinematicProduction({ projectId: required(flags, "project"), productionId: required(flags, "production"), ...objectFlag(flags, "data") });
  if (area === "production" && action === "reset") return app.resetCinematicProduction({ projectId: required(flags, "project"), productionId: required(flags, "production"), sourceNodeId: flags["source-node"] || undefined });
  if (area === "production" && action === "plan-script") return app.planCinematicFromScript({ projectId: required(flags, "project"), productionId: required(flags, "production"), sourceNodeId: required(flags, "source-node"), ...objectFlag(flags, "data") });
  if (area === "production" && action === "breakdowns") return { breakdowns: await app.listScriptBreakdowns({ projectId: required(flags, "project"), productionId: required(flags, "production") }) };
  if (area === "script" && action === "get") return app.getScriptDocument({ projectId: required(flags, "project"), nodeId: required(flags, "node") });
  if (area === "script" && action === "row-add") return app.createScriptRow({ projectId: required(flags, "project"), nodeId: required(flags, "node"), ...objectFlag(flags, "data") });
  if (area === "script" && action === "row-update") return app.updateScriptRow({ projectId: required(flags, "project"), nodeId: required(flags, "node"), rowId: required(flags, "row"), ...objectFlag(flags, "data") });
  if (area === "script" && action === "row-delete") return app.deleteScriptRow({ projectId: required(flags, "project"), nodeId: required(flags, "node"), rowId: required(flags, "row") });
  if (area === "story" && action === "get") return { storyPacket: await app.getStoryPacket({ projectId: required(flags, "project"), productionId: required(flags, "production") }) };
  if (area === "story" && action === "save") return app.saveStoryPacket({ projectId: required(flags, "project"), productionId: required(flags, "production"), storyPacket: objectFlag(flags, "data") });
  if (area === "bible" && action === "get") return { visualBible: await app.getVisualBible({ projectId: required(flags, "project"), productionId: required(flags, "production") }) };
  if (area === "bible" && action === "save") return app.saveVisualBible({ projectId: required(flags, "project"), productionId: required(flags, "production"), visualBible: objectFlag(flags, "data") });
  if (area === "contribution" && action === "add") return app.addProfessionalContribution({ projectId: required(flags, "project"), productionId: required(flags, "production"), contribution: objectFlag(flags, "data") });
  if (area === "contribution" && action === "list") return { contributions: await app.listProfessionalContributions({ projectId: required(flags, "project"), productionId: required(flags, "production"), targetType: flags["target-type"] || null, targetId: flags.target || null }) };
  if (area === "authority" && action === "list") return { assetAuthorities: await app.listAssetAuthorities({ projectId: required(flags, "project"), productionId: required(flags, "production") }) };
  if (area === "authority" && action === "search") return app.searchAssetAuthorities({ projectId: required(flags, "project"), productionId: required(flags, "production"), ...objectFlag(flags, "data") });
  if (area === "authority" && action === "get") return app.getAssetAuthority({ projectId: required(flags, "project"), productionId: required(flags, "production"), authorityId: required(flags, "authority") });
  if (area === "authority" && action === "save") return app.saveAssetAuthority({ projectId: required(flags, "project"), productionId: required(flags, "production"), authority: objectFlag(flags, "data") });
  if (area === "authority" && action === "update") return app.updateAssetAuthority({ projectId: required(flags, "project"), productionId: required(flags, "production"), authorityId: required(flags, "authority"), patch: objectFlag(flags, "data") });
  if (area === "authority" && action === "bind-voice") return app.bindCharacterVoiceProfile({ projectId: required(flags, "project"), productionId: required(flags, "production"), authorityId: required(flags, "authority"), ...objectFlag(flags, "data") });
  if (area === "authority" && action === "route") return app.routeAssetAuthorityRequirements({ projectId: required(flags, "project"), productionId: required(flags, "production"), ...objectFlag(flags, "data") });
  if (area === "authority" && action === "derive") return app.deriveAssetAuthoritiesFromStory({ projectId: required(flags, "project"), productionId: required(flags, "production"), ...objectFlag(flags, "data") });
  if (area === "authority" && action === "batch") return app.batchTransitionAssetAuthorities({ projectId: required(flags, "project"), productionId: required(flags, "production"), ...objectFlag(flags, "data") });
  if (area === "authority" && action === "versions") return app.listAssetAuthorityVersions({ projectId: required(flags, "project"), productionId: required(flags, "production"), authorityId: required(flags, "authority"), ...objectFlag(flags, "data") });
  if (area === "authority" && action === "impact") return app.getAssetAuthorityImpact({ projectId: required(flags, "project"), productionId: required(flags, "production"), authorityId: required(flags, "authority") });
  if (area === "authority" && action === "restore") return app.restoreAssetAuthorityVersion({ projectId: required(flags, "project"), productionId: required(flags, "production"), authorityId: required(flags, "authority"), ...objectFlag(flags, "data") });
  if (area === "authority" && action === "compile") return app.compileAssetAuthority({ projectId: required(flags, "project"), productionId: required(flags, "production"), authorityId: required(flags, "authority"), ...objectFlag(flags, "data") });
  if (area === "authority" && action === "compilation") {
    const projectId = required(flags, "project");
    const productionId = required(flags, "production");
    const authorityId = required(flags, "authority");
    const authority = await app.getAssetAuthority({ projectId, productionId, authorityId });
    const data = objectFlag(flags, "data");
    const boardId = data.boardId || (authority.authorityType === "scene" && authority.boardSpecs?.some((entry) => entry.boardId === "space-master") ? "space-master" : null);
    const targetId = boardId && !(authority.authorityType === "character" && boardId === "identity-master") ? `${authorityId}::${boardId}` : authorityId;
    return { compilation: await app.getImagePromptCompilation({ projectId, productionId, targetType: authority.authorityType, targetId }) };
  }
  if (area === "authority" && action === "run") return app.runAssetAuthority({ projectId: required(flags, "project"), productionId: required(flags, "production"), authorityId: required(flags, "authority"), ...objectFlag(flags, "data") });
  if (area === "budget" && action === "get") return { grant: await app.getBudgetGrant({ projectId: required(flags, "project") }) };
  if (area === "budget" && action === "save") return app.saveBudgetGrant({ projectId: required(flags, "project"), ...objectFlag(flags, "data") });
  if (area === "budget" && action === "reserve") return app.reserveBudget({ projectId: required(flags, "project"), ...objectFlag(flags, "data") });
  if (area === "budget" && action === "reservations") return { reservations: await app.listBudgetReservations({ projectId: required(flags, "project"), ...objectFlag(flags, "data") }) };
  if (area === "budget" && action === "consume") return app.consumeBudgetReservation({ projectId: required(flags, "project"), reservationId: required(flags, "reservation"), ...objectFlag(flags, "data") });
  if (area === "budget" && action === "reconcile") return app.reconcileBudgetReservation({ projectId: required(flags, "project"), reservationId: required(flags, "reservation"), ...objectFlag(flags, "data") });
  if (area === "budget" && action === "release") return app.releaseBudgetReservation({ projectId: required(flags, "project"), reservationId: required(flags, "reservation"), ...objectFlag(flags, "data") });
  if (area === "storyboard" && action === "compile") return app.compileStoryboardPrompt({ projectId: required(flags, "project"), productionId: required(flags, "production"), ...objectFlag(flags, "data") });
  if (area === "storyboard" && action === "create") return app.createStoryboard({ projectId: required(flags, "project"), productionId: required(flags, "production"), ...objectFlag(flags, "data") });
  if (area === "storyboard" && action === "list") return { storyboards: await app.listStoryboards({ projectId: required(flags, "project"), productionId: required(flags, "production") }) };
  if (area === "storyboard" && action === "get") return app.getStoryboard({ projectId: required(flags, "project"), productionId: required(flags, "production"), storyboardId: required(flags, "storyboard") });
  if (area === "storyboard" && action === "reorder") return app.reorderStoryboardShots({ projectId: required(flags, "project"), productionId: required(flags, "production"), storyboardId: required(flags, "storyboard"), ...objectFlag(flags, "data") });
  if (area === "storyboard" && action === "versions") return { versions: await app.listStoryboardVersions({ projectId: required(flags, "project"), productionId: required(flags, "production"), storyboardId: required(flags, "storyboard") }) };
  if (area === "storyboard" && action === "shot-versions") return { versions: await app.listStoryboardShotVersions({ projectId: required(flags, "project"), productionId: required(flags, "production"), storyboardId: required(flags, "storyboard"), storyboardShotId: required(flags, "storyboard-shot") }) };
  if (area === "storyboard" && action === "compare") return app.compareStoryboardShotVersions({ projectId: required(flags, "project"), productionId: required(flags, "production"), storyboardId: required(flags, "storyboard"), storyboardShotId: required(flags, "storyboard-shot"), ...objectFlag(flags, "data") });
  if (area === "storyboard" && action === "update-shot") return app.updateStoryboardShot({ projectId: required(flags, "project"), productionId: required(flags, "production"), storyboardId: required(flags, "storyboard"), storyboardShotId: required(flags, "storyboard-shot"), patch: objectFlag(flags, "data") });
  if (area === "storyboard" && action === "set-media") return app.setStoryboardShotMedia({ projectId: required(flags, "project"), productionId: required(flags, "production"), storyboardId: required(flags, "storyboard"), storyboardShotId: required(flags, "storyboard-shot"), ...objectFlag(flags, "data") });
  if (area === "storyboard" && action === "reference") return app.selectStoryboardImageForVideo({ projectId: required(flags, "project"), productionId: required(flags, "production"), storyboardId: required(flags, "storyboard"), storyboardShotId: required(flags, "storyboard-shot"), selected: booleanFlag(flags, "selected"), ...objectFlag(flags, "data") });
  if (area === "storyboard" && action === "references") return { references: await app.getStoryboardVideoReferences({ projectId: required(flags, "project"), productionId: required(flags, "production"), storyboardId: required(flags, "storyboard") }) };
  if (area === "storyboard-batch" && action === "create") return app.createStoryboardBatchJob({ projectId: required(flags, "project"), productionId: required(flags, "production"), storyboardId: required(flags, "storyboard"), ...objectFlag(flags, "data") });
  if (area === "storyboard-batch" && action === "list") return { jobs: await app.listStoryboardBatchJobs({ projectId: required(flags, "project"), productionId: required(flags, "production"), storyboardId: flags.storyboard || null }) };
  if (area === "storyboard-batch" && action === "get") return app.getStoryboardBatchJob({ projectId: required(flags, "project"), productionId: required(flags, "production"), jobId: required(flags, "job") });
  if (area === "storyboard-batch" && action === "advance") return app.advanceStoryboardBatchJob({ projectId: required(flags, "project"), productionId: required(flags, "production"), jobId: required(flags, "job") });
  if (area === "storyboard-batch" && action === "retry") return app.retryStoryboardBatchItem({ projectId: required(flags, "project"), productionId: required(flags, "production"), jobId: required(flags, "job"), itemId: required(flags, "item"), ...objectFlag(flags, "data") });
  if (area === "storyboard-batch" && action === "cancel") return app.cancelStoryboardBatchJob({ projectId: required(flags, "project"), productionId: required(flags, "production"), jobId: required(flags, "job") });
  if (area === "shot" && action === "list") return { shots: await app.listShots({ projectId: required(flags, "project"), productionId: required(flags, "production") }) };
  if (area === "shot" && action === "add") return app.saveShot({ projectId: required(flags, "project"), productionId: required(flags, "production"), shot: objectFlag(flags, "data") });
  if (area === "shot" && action === "update") return app.updateShot({ projectId: required(flags, "project"), productionId: required(flags, "production"), shotId: required(flags, "shot"), patch: objectFlag(flags, "data") });
  if (area === "unit" && action === "list") return { generationUnits: await app.listGenerationUnits({ projectId: required(flags, "project"), productionId: required(flags, "production") }) };
  if (area === "unit" && action === "create") {
    const data = objectFlag(flags, "data");
    return app.saveGenerationUnit({ projectId: required(flags, "project"), productionId: required(flags, "production"), generationUnit: data.generationUnit ?? data, referenceBindings: data.referenceBindings ?? [] });
  }
  if (area === "unit" && action === "update") {
    const data = objectFlag(flags, "data");
    return app.updateGenerationUnit({ projectId: required(flags, "project"), productionId: required(flags, "production"), generationUnitId: required(flags, "unit"), patch: data.generationUnit ?? data, referenceBindings: data.referenceBindings });
  }
  if (area === "unit" && action === "compile") return app.compileGenerationUnit({ projectId: required(flags, "project"), productionId: required(flags, "production"), generationUnitId: required(flags, "unit"), ...objectFlag(flags, "data") });
  if (area === "unit" && action === "preflight") return app.preflightGenerationUnit({ projectId: required(flags, "project"), productionId: required(flags, "production"), generationUnitId: required(flags, "unit"), ...objectFlag(flags, "data") });
  if (area === "unit" && action === "run") return app.runGenerationUnit({ projectId: required(flags, "project"), productionId: required(flags, "production"), generationUnitId: required(flags, "unit"), ...objectFlag(flags, "data") });
  if (area === "evaluation" && action === "list") return { evaluations: await app.listEvaluations({ projectId: required(flags, "project"), productionId: required(flags, "production") }) };
  if (area === "evaluation" && action === "add") return app.addEvaluation({ projectId: required(flags, "project"), productionId: required(flags, "production"), evaluation: objectFlag(flags, "data") });
  if (area === "model" && action === "capabilities") return app.getModelCapabilities({ capability: flags.capability || "video" });
  if (area === "workflow" && action === "get") return { layers: await app.getWorkflow({ projectId: required(flags, "project") }) };
  if (area === "workflow" && action === "set") return app.setWorkflowLayer({ projectId: required(flags, "project"), layer: required(flags, "layer"), reviewState: flags.state || "draft", payload: objectFlag(flags, "payload") });
  if (area === "director" && action === "save") return app.saveDirectorStage({ projectId: required(flags, "project"), nodeId: required(flags, "node"), stage: objectFlag(flags, "stage") });
  if (area === "director" && action === "get") return { director: await app.getDirectorStage({ projectId: required(flags, "project"), nodeId: required(flags, "node") }) };
  if (area === "director" && action === "command") return app.applyDirectorStageCommand({ projectId: required(flags, "project"), nodeId: required(flags, "node"), command: objectFlag(flags, "data") });
  if (area === "director" && action === "bind-world") return app.bindDirectorWorldEnvironment({
    projectId: required(flags, "project"), nodeId: required(flags, "node"), worldNodeId: required(flags, "world-node"),
    mediaId: flags.media, expectedRevision: numeric(flags, "revision"), projection: flags.projection, ...objectFlag(flags, "data")
  });
  if (area === "director" && action === "bind-shot") return app.bindDirectorCaptureToShot({
    projectId: required(flags, "project"), directorNodeId: required(flags, "node"), captureId: required(flags, "capture"),
    productionId: required(flags, "production"), shotId: required(flags, "shot")
  });
  if (area === "panorama" && action === "set") return app.setPanorama({ projectId: required(flags, "project"), nodeId: required(flags, "node"), mediaId: required(flags, "media"), metadata: objectFlag(flags, "metadata") });
  if (area === "panorama" && action === "get") return { panorama: await app.getPanorama({ projectId: required(flags, "project"), nodeId: required(flags, "node") }) };
  if (area === "review" && action === "add") return app.reviewTarget({ projectId: required(flags, "project"), targetType: flags.type, targetId: required(flags, "target"), state: required(flags, "state"), note: flags.note, ...(flags.reviewId ? { reviewId: flags.reviewId } : {}), ...(flags.evidence ? { evidence: objectFlag(flags, "evidence") } : {}) });
  if (area === "timeline" && action === "create") return app.createTimeline({
    projectId: required(flags, "project"),
    title: flags.title,
    frameRate: numeric(flags, "frame-rate", 30),
    width: numeric(flags, "width", 1920),
    height: numeric(flags, "height", 1080),
    colorSpace: flags["color-space"]
  });
  if (area === "timeline" && action === "get") return app.getTimeline({ projectId: required(flags, "project"), timelineId: required(flags, "timeline") });
  if (area === "timeline" && action === "add") return app.addTimelineClip({
    projectId: required(flags, "project"), timelineId: required(flags, "timeline"), nodeId: flags.node, mediaId: flags.media,
    track: numeric(flags, "track", 0), startMs: numeric(flags, "start", 0), durationMs: numeric(flags, "duration", 1000), trimInMs: numeric(flags, "trim", 0), payload: objectFlag(flags, "payload")
  });
  if (area === "timeline" && action === "move") return app.moveTimelineClip({ projectId: required(flags, "project"), timelineId: required(flags, "timeline"), clipId: required(flags, "clip"), startMs: numeric(flags, "start"), track: flags.track === undefined ? undefined : numeric(flags, "track") });
  if (area === "timeline" && action === "trim") return app.trimTimelineClip({ projectId: required(flags, "project"), timelineId: required(flags, "timeline"), clipId: required(flags, "clip"), trimInMs: flags.trim === undefined ? undefined : numeric(flags, "trim"), durationMs: flags.duration === undefined ? undefined : numeric(flags, "duration") });
  if (area === "timeline" && action === "update") return app.updateTimelineClip({ projectId: required(flags, "project"), timelineId: required(flags, "timeline"), clipId: required(flags, "clip"), ...objectFlag(flags, "data") });
  if (area === "timeline" && action === "split") return app.splitTimelineClip({ projectId: required(flags, "project"), timelineId: required(flags, "timeline"), clipId: required(flags, "clip"), splitAtMs: numeric(flags, "at") });
  if (area === "timeline" && action === "ripple") return app.rippleTimelineClip({ projectId: required(flags, "project"), timelineId: required(flags, "timeline"), clipId: required(flags, "clip"), ...objectFlag(flags, "data") });
  if (area === "timeline" && action === "slip") return app.slipTimelineClip({ projectId: required(flags, "project"), timelineId: required(flags, "timeline"), clipId: required(flags, "clip"), ...objectFlag(flags, "data") });
  if (area === "timeline" && action === "snap") return app.snapTimelineClip({ projectId: required(flags, "project"), timelineId: required(flags, "timeline"), clipId: required(flags, "clip"), ...objectFlag(flags, "data") });
  if (area === "timeline" && action === "undo") return app.undoTimelineEdit({ projectId: required(flags, "project"), timelineId: required(flags, "timeline") });
  if (area === "timeline" && action === "redo") return app.redoTimelineEdit({ projectId: required(flags, "project"), timelineId: required(flags, "timeline") });
  if (area === "timeline" && action === "resource-undo") return app.undoTimelineResourceEdit({ projectId: required(flags, "project"), timelineId: required(flags, "timeline") });
  if (area === "timeline" && action === "resource-redo") return app.redoTimelineResourceEdit({ projectId: required(flags, "project"), timelineId: required(flags, "timeline") });
  if (area === "timeline" && action === "track-add") return app.addTimelineTrack({ projectId: required(flags, "project"), timelineId: required(flags, "timeline"), ...objectFlag(flags, "data") });
  if (area === "timeline" && action === "track-update") return app.updateTimelineTrack({ projectId: required(flags, "project"), timelineId: required(flags, "timeline"), trackId: required(flags, "track-id"), patch: objectFlag(flags, "data") });
  if (area === "timeline" && action === "track-remove") return app.removeTimelineTrack({ projectId: required(flags, "project"), timelineId: required(flags, "timeline"), trackId: required(flags, "track-id") });
  if (area === "timeline" && action === "track-reorder") return app.reorderTimelineTracks({ projectId: required(flags, "project"), timelineId: required(flags, "timeline"), trackIds: objectFlag(flags, "data", []) });
  if (area === "timeline" && action === "transition-add") return app.addTimelineTransition({ projectId: required(flags, "project"), timelineId: required(flags, "timeline"), ...objectFlag(flags, "data") });
  if (area === "timeline" && action === "transition-update") return app.updateTimelineTransition({ projectId: required(flags, "project"), timelineId: required(flags, "timeline"), transitionId: required(flags, "transition"), patch: objectFlag(flags, "data") });
  if (area === "timeline" && action === "transition-remove") return app.removeTimelineTransition({ projectId: required(flags, "project"), timelineId: required(flags, "timeline"), transitionId: required(flags, "transition") });
  if (area === "timeline" && action === "effect-add") return app.addTimelineEffect({ projectId: required(flags, "project"), timelineId: required(flags, "timeline"), clipId: required(flags, "clip"), ...objectFlag(flags, "data") });
  if (area === "timeline" && action === "effect-update") return app.updateTimelineEffect({ projectId: required(flags, "project"), timelineId: required(flags, "timeline"), effectId: required(flags, "effect"), patch: objectFlag(flags, "data") });
  if (area === "timeline" && action === "effect-remove") return app.removeTimelineEffect({ projectId: required(flags, "project"), timelineId: required(flags, "timeline"), effectId: required(flags, "effect") });
  if (area === "timeline" && action === "marker-add") return app.addTimelineMarker({ projectId: required(flags, "project"), timelineId: required(flags, "timeline"), ...objectFlag(flags, "data") });
  if (area === "timeline" && action === "marker-update") return app.updateTimelineMarker({ projectId: required(flags, "project"), timelineId: required(flags, "timeline"), markerId: required(flags, "marker"), patch: objectFlag(flags, "data") });
  if (area === "timeline" && action === "marker-remove") return app.removeTimelineMarker({ projectId: required(flags, "project"), timelineId: required(flags, "timeline"), markerId: required(flags, "marker") });
  if (area === "timeline" && action === "keyframe-add") return app.addTimelineKeyframe({ projectId: required(flags, "project"), timelineId: required(flags, "timeline"), clipId: required(flags, "clip"), ...objectFlag(flags, "data") });
  if (area === "timeline" && action === "keyframe-update") return app.updateTimelineKeyframe({ projectId: required(flags, "project"), timelineId: required(flags, "timeline"), keyframeId: required(flags, "keyframe"), patch: objectFlag(flags, "data") });
  if (area === "timeline" && action === "keyframe-remove") return app.removeTimelineKeyframe({ projectId: required(flags, "project"), timelineId: required(flags, "timeline"), keyframeId: required(flags, "keyframe") });
  if (area === "render" && action === "create") return app.createRenderJob({ projectId: required(flags, "project"), timelineId: required(flags, "timeline"), outputNodeId: required(flags, "output-node"), preset: flags.preset, idempotencyKey: flags["idempotency-key"] });
  if (area === "render" && action === "list") return { jobs: await app.listRenderJobs({ projectId: required(flags, "project"), timelineId: flags.timeline || null }) };
  if (area === "render" && action === "get") return app.getRenderJob({ projectId: required(flags, "project"), renderJobId: required(flags, "render-job") });
  if (area === "render" && action === "qc") return app.getTechnicalQcReport({ projectId: required(flags, "project"), renderJobId: required(flags, "render-job") });
  if (area === "render" && action === "cancel") return app.cancelRenderJob({ projectId: required(flags, "project"), renderJobId: required(flags, "render-job") });
  if (area === "render" && action === "resume") return app.resumeRenderJob({ projectId: required(flags, "project"), renderJobId: required(flags, "render-job") });
  if (area === "render" && action === "package") return app.createDeliveryPackage({ projectId: required(flags, "project"), renderJobId: required(flags, "render-job"), acceptWarnings: booleanFlag(flags, "accept-warnings") });
  if (area === "render" && action === "packages") return { packages: await app.listDeliveryPackages({ projectId: required(flags, "project"), renderJobId: flags["render-job"] || null }) };
  if (area === "settings" && action === "status") return app.getProviderSettings();
  throw new UnuTvError("unknown_command", `Unknown command: ${positionals.join(" ") || "none"}`);
}

const parsed = parseArguments(process.argv.slice(2));
if (!parsed.positionals.length || parsed.flags.help || parsed.positionals[0] === "help") {
  console.log(help());
  process.exit(0);
}

if (parsed.positionals[0] === "serve") {
  const { createUnuTvWebServer } = await import("@ununu/unutv-web");
  const service = await createUnuTvWebServer({ port: numeric(parsed.flags, "port", 4318) });
  const address = await service.listen();
  console.log(JSON.stringify({ ok: true, url: `http://127.0.0.1:${address.port}`, dataRoot: service.runtime.dataRoot }, null, 2));
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, async () => { await service.close(); process.exit(0); });
} else {
  // a freshly cancelled run could be revived by the next read-only CLI
  // command before the owner can inspect or edit its persisted state.
  const runtime = createLocalRuntime({ recoverAutomation: false, runAutomationExecutor: false });
  try {
    const result = await execute(runtime.app, parsed.positionals, parsed.flags);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ error: { code: error.code || "command_failed", message: error.message, details: error.details } }, null, 2));
    process.exitCode = 1;
  } finally {
    runtime.close();
  }
}
