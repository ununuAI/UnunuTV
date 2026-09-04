#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const skillRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const adjacentRepo = resolve(skillRoot, "../..");
const portableRepo = process.platform === "win32"
  ? join(process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local"), "Ununu", "ununu-unutv")
  : join(homedir(), ".local", "share", "ununu-unutv");
const repo = process.env.UNUTV_ROOT
  || (existsSync(join(adjacentRepo, "apps", "cli", "src", "index.mjs")) ? adjacentRepo : portableRepo);
const api = (process.env.UNUTV_API || "http://127.0.0.1:4318").replace(/\/$/, "");
const cli = join(repo, "apps/cli/src/index.mjs");

function fail(message, extra = {}) {
  console.log(JSON.stringify({ ok: false, error: message, repo, api, skillRoot, ...extra }, null, 2));
  process.exit(1);
}

function print(value) {
  if (typeof value === "string") {
    try {
      console.log(JSON.stringify(JSON.parse(value), null, 2));
      return;
    } catch {
      console.log(value);
      return;
    }
  }
  console.log(JSON.stringify(value, null, 2));
}

async function readBody(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function flag(args, name) {
  const index = args.indexOf(name);
  if (index === -1 || !args[index + 1]) fail("usage", {
    usage: "paired-check --project ID --canvas ID --local-root ABS"
  });
  return args[index + 1];
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail("local_project_json_invalid", { path, detail: String(error.message || error) });
  }
}

function readText(path) {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    fail("local_project_markdown_invalid", { path, detail: String(error.message || error) });
  }
}

function markdownTitle(text, fallback) {
  return text.match(/^#\s+(.+)$/m)?.[1]?.trim() || fallback;
}

function markdownField(text, field) {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.match(new RegExp(`^- \\*\\*${escaped}：\\*\\*\\s*(.+)$`, "m"))?.[1]?.trim() || null;
}

function firstExistingDirectory(localRoot, names) {
  return names.find((name) => existsSync(join(localRoot, name))) || null;
}

function resolveLocalProject(localRootInput) {
  const localRoot = resolve(localRootInput);
  const markdownProjectPath = join(localRoot, "项目.md");
  const markdownProjectScriptDir = firstExistingDirectory(localRoot, [
    "01-分镜剧本",
    "01-剧本"
  ]);
  const markdownProjectRequired = [
    "判据.md",
    "总分镜表.md",
    "02-风格",
    "03-资产",
    "04-场次",
    "99-历史"
  ];
  if (existsSync(markdownProjectPath)
    && markdownProjectScriptDir
    && markdownProjectRequired.every((entry) => existsSync(join(localRoot, entry)))) {
    const project = readText(markdownProjectPath);
    const productionUnit = markdownField(project, "生产单元");
    if (!new Set(["单片", "单集"]).has(productionUnit)) {
      fail("local_markdown_project_contract_invalid", {
        localRoot,
        projectPath: markdownProjectPath,
        productionUnit
      });
    }
    return {
      localRoot,
      localType: productionUnit === "单集" ? "episode" : "single",
      localId: basename(localRoot),
      localTitle: markdownTitle(project, basename(localRoot)),
      localStatus: markdownField(project, "当前阶段状态"),
      contract: markdownProjectScriptDir === "01-分镜剧本"
        ? "ai-film-markdown/v1.1"
        : "ai-film-markdown/v1-legacy",
      scriptDirectory: markdownProjectScriptDir
    };
  }

  const markdownSeriesPath = join(localRoot, "系列.md");
  const markdownSeriesScriptDir = firstExistingDirectory(localRoot, [
    "01-分镜剧本",
    "01-剧本"
  ]);
  const markdownSeriesRequired = [
    "判据.md",
    "02-风格",
    "03-资产",
    "分集",
    "99-历史"
  ];
  if (existsSync(markdownSeriesPath)
    && markdownSeriesScriptDir
    && markdownSeriesRequired.every((entry) => existsSync(join(localRoot, entry)))) {
    const series = readText(markdownSeriesPath);
    return {
      localRoot,
      localType: "series",
      localId: basename(localRoot),
      localTitle: markdownTitle(series, basename(localRoot)),
      localStatus: markdownField(series, "当前阶段状态"),
      contract: markdownSeriesScriptDir === "01-分镜剧本"
        ? "ai-film-markdown-series/v1.1"
        : "ai-film-markdown-series/v1-legacy",
      scriptDirectory: markdownSeriesScriptDir
    };
  }

  const seriesPath = join(localRoot, "系列.json");
  const seriesLedgerPath = join(localRoot, "series_ledger.json");
  if (existsSync(seriesPath) && existsSync(seriesLedgerPath)) {
    const series = readJson(seriesPath);
    const ledger = readJson(seriesLedgerPath);
    if (series.schema_version !== "ununu-video-series/v2"
      || ledger.schema_version !== "ununu-series-ledger/v1"
      || series.series_id !== ledger.series_id) {
      fail("local_series_contract_invalid", { localRoot, seriesPath, seriesLedgerPath });
    }
    return {
      localRoot,
      localType: "series",
      localId: series.series_id,
      localTitle: series.series_name,
      localStatus: series.status
    };
  }

  const projectPath = join(localRoot, "项目.json");
  const productionLedgerPath = join(localRoot, "production_ledger.json");
  const contextPath = join(localRoot, "00-制片", "video_unit_context.json");
  if (existsSync(projectPath) && existsSync(productionLedgerPath) && existsSync(contextPath)) {
    const project = readJson(projectPath);
    const ledger = readJson(productionLedgerPath);
    const context = readJson(contextPath);
    if (context.schema_version !== "ununu-video-unit-context/v2"
      || !["single", "episode"].includes(context.unit_type)) {
      fail("local_video_unit_contract_invalid", {
        localRoot, projectPath, productionLedgerPath, contextPath
      });
    }
    return {
      localRoot,
      localType: context.unit_type,
      localId: project.project_id || context.unit_id,
      localTitle: project.project_name || project.title || null,
      localStatus: ledger.status || null
    };
  }

  fail("paired_local_project_missing", {
    localRoot,
    expected: [
      "项目.md + 判据.md + 总分镜表.md + 01-分镜剧本/ + 02-风格/ + 03-资产/ + 04-场次/ + 99-历史/",
      "系列.md + 判据.md + 01-分镜剧本/ + 02-风格/ + 03-资产/ + 分集/ + 99-历史/",
      "旧项目兼容：01-剧本/ 可继续读取，但新项目必须使用 01-分镜剧本/",
      "系列.json + series_ledger.json",
      "项目.json + production_ledger.json + 00-制片/video_unit_context.json"
    ]
  });
}

function captureCli(args, errorCode) {
  if (!existsSync(cli)) fail("cli_missing", { cli });
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [cli, ...args], { cwd: repo, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => fail(errorCode, { detail: String(error.message || error) }));
    child.on("close", (code) => {
      if (code !== 0) fail(errorCode, { code, detail: stderr.trim() || stdout.trim() });
      try {
        resolvePromise(JSON.parse(stdout));
      } catch (error) {
        fail(errorCode, { detail: "official_cli_returned_invalid_json", stdout: stdout.trim(), stderr: stderr.trim() });
      }
    });
  });
}

async function pairedCheck(args) {
  const projectId = flag(args, "--project");
  const canvasId = flag(args, "--canvas");
  const local = resolveLocalProject(flag(args, "--local-root"));
  const project = await captureCli(["project", "open", "--project", projectId], "paired_unutv_project_missing");
  const canvas = await captureCli(["canvas", "open", "--project", projectId, "--canvas", canvasId], "paired_unutv_canvas_missing");
  if (canvas?.projectId !== projectId) {
    fail("paired_canvas_project_mismatch", {
      projectId,
      canvasId,
      canvasProjectId: canvas?.projectId || null
    });
  }
  print({
    ok: true,
    binding: "paired_canvas_local_project",
    unutv: { projectId, projectTitle: project?.title || null, canvasId, canvasTitle: canvas?.title || null },
    local,
    titleMatch: Boolean(
      project?.title
      && local.localTitle
      && (project.title === local.localTitle
        || project.title.startsWith(`${local.localTitle}·`)
        || project.title.startsWith(`${local.localTitle}：`)
        || project.title.startsWith(`${local.localTitle}:`))
    )
  });
}

async function health() {
  try {
    const response = await fetch(`${api}/api/health`);
    const body = await readBody(response);
    print({
      ok: response.ok,
      status: response.status,
      api,
      repo,
      cliExists: existsSync(cli),
      body
    });
    if (!response.ok) process.exit(1);
  } catch (error) {
    fail("unutv_unreachable", { detail: String(error.message || error) });
  }
}

function runCli(args) {
  if (!existsSync(cli)) fail("cli_missing", { cli });
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [cli, ...args], { cwd: repo, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (code) => {
      if (stdout.trim()) print(stdout.trim());
      if (stderr.trim() && code !== 0) {
        console.error(stderr.trim());
      }
      process.exit(code ?? 1);
      resolvePromise();
    });
  });
}

async function runApi(method, path, jsonText) {
  if (!method || !path) fail("usage", { usage: "api <METHOD> <path> [json]" });
  const url = path.startsWith("http") ? path : `${api}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = { accept: "application/json" };
  const init = { method: method.toUpperCase(), headers };
  if (jsonText !== undefined) {
    headers["content-type"] = "application/json; charset=utf-8";
    JSON.parse(jsonText);
    init.body = jsonText;
  }
  const response = await fetch(url, init);
  const body = await readBody(response);
  print({ ok: response.ok, status: response.status, method: init.method, url, body });
  if (!response.ok) process.exit(1);
}

const [command, ...rest] = process.argv.slice(2);
if (!command || command === "help" || command === "--help") {
  print({
    ok: true,
    usage: [
      "unutv.mjs health",
      "unutv.mjs paired-check --project ID --canvas ID --local-root ABS",
      "unutv.mjs cli <official CLI args>",
      "unutv.mjs api <METHOD> <path> [json]"
    ],
    repo,
    api
  });
  process.exit(0);
}
if (command === "health") await health();
else if (command === "paired-check") await pairedCheck(rest);
else if (command === "cli") await runCli(rest);
else if (command === "api") await runApi(rest[0], rest[1], rest.slice(2).join(" ") || undefined);
else fail("unknown_command", { command });
