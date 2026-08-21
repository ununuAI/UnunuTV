import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function safeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isLoopbackUrl(value) {
  try {
    return ["127.0.0.1", "localhost", "::1"].includes(new URL(value).hostname);
  } catch {
    return false;
  }
}

function sshArgs(config) {
  const ssh = config?.ssh;
  if (!ssh?.host || !ssh?.port) return null;
  return [
    "-i", safeText(config.ssh_key) || path.join(process.env.HOME || "", ".ssh/autodl_h3"),
    "-o", "StrictHostKeyChecking=no",
    "-o", "ConnectTimeout=10",
    "-o", "BatchMode=yes",
    "-p", String(ssh.port),
    `root@${ssh.host}`
  ];
}

function scpArgs(config) {
  const ssh = config?.ssh;
  if (!ssh?.host || !ssh?.port) return null;
  return [
    "-i", safeText(config.ssh_key) || path.join(process.env.HOME || "", ".ssh/autodl_h3"),
    "-o", "StrictHostKeyChecking=no",
    "-o", "ConnectTimeout=10",
    "-o", "BatchMode=yes",
    "-P", String(ssh.port)
  ];
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'"'"'`)}'`;
}

async function packageSourceHash(rootPath) {
  const hash = createHash("sha256");
  async function walk(current, relative = "") {
    const entries = await readdir(current, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if ([".git", ".DS_Store", "__pycache__"].includes(entry.name)) continue;
      const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
      const child = path.join(current, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`H3 custom-node package contains a symbolic link: ${childRelative}`);
      if (entry.isDirectory()) {
        await walk(child, childRelative);
        continue;
      }
      if (!entry.isFile()) continue;
      hash.update(childRelative);
      hash.update("\0");
      hash.update(await readFile(child));
      hash.update("\0");
    }
  }
  await walk(rootPath);
  return hash.digest("hex");
}

function remoteComfyCommand(config) {
  const remotePort = Number(config.comfy_port) || Number(new URL(config.comfy_url).port) || 6006;
  const directory = safeText(config.comfy_dir) || "/root/autodl-tmp/ComfyUI";
  const python = safeText(config.python) || "/root/miniconda3/bin/python";
  const quote = (value) => `'${String(value).replaceAll("'", "'\\\"'\\\"'")}'`;
  return [
    "set -e",
    `cd ${quote(directory)}`,
    "running=$(ps -eo comm=,args= | awk '$1 ~ /^python/ && $0 ~ /(^|[ \\/])main\\.py( |$)/ {n++} END {print n+0}')",
    "if [ \"$running\" -gt 0 ]; then exit 0; fi",
    "mkdir -p /root/autodl-tmp",
    `nohup ${quote(python)} main.py --listen 0.0.0.0 --port ${remotePort} >/root/autodl-tmp/comfyui.log 2>&1 </dev/null &`
  ].join("; ");
}

function publicHealth(state) {
  return {
    configured: state.configured,
    ok: state.ok,
    state: state.state,
    message: state.message,
    lastCheckedAt: state.lastCheckedAt,
    tunnel: state.tunnel,
    queueRunning: state.queueRunning,
    queuePending: state.queuePending,
    gpu: state.gpu
  };
}

export class LocalH3RemoteRuntime {
  constructor(credentials, options = {}) {
    this.credentials = credentials;
    this.fetchImpl = options.fetchImpl || fetch;
    this.tunnelProcess = null;
    this.pending = null;
    const configured = Boolean(credentials.h3Config?.());
    this.state = {
      configured,
      ok: false,
      state: configured ? "unchecked" : "not_configured",
      message: configured ? "尚未检测" : "尚未导入 H3 私有配置",
      lastCheckedAt: null,
      tunnel: "unknown",
      queueRunning: null,
      queuePending: null,
      gpu: null
    };
  }

  config() {
    return this.credentials.h3Config?.() || null;
  }

  baseUrl() {
    const value = safeText(this.config()?.comfy_url);
    if (!value) throw new Error("H3 comfy_url is not configured");
    return value.replace(/\/+$/, "");
  }

  status() {
    return publicHealth(this.state);
  }

  async probe() {
    const config = this.config();
    if (!config?.comfy_url) return { configured: false, ok: false, state: "not_configured", message: "尚未导入 H3 私有配置" };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    timer.unref?.();
    try {
      const [statsResponse, queueResponse] = await Promise.all([
        this.fetchImpl(`${this.baseUrl()}/system_stats`, { signal: controller.signal }),
        this.fetchImpl(`${this.baseUrl()}/queue`, { signal: controller.signal })
      ]);
      if (!statsResponse.ok || !queueResponse.ok) {
        return { configured: true, ok: false, state: "http_error", message: `远端返回 HTTP ${statsResponse.status}/${queueResponse.status}` };
      }
      const stats = await statsResponse.json();
      const queue = await queueResponse.json();
      const devices = Array.isArray(stats?.devices) ? stats.devices : [];
      return {
        configured: true,
        ok: true,
        state: "ready",
        message: "H3 远端正常",
        tunnel: isLoopbackUrl(config.comfy_url) ? "ready" : "remote_url",
        queueRunning: Array.isArray(queue?.queue_running) ? queue.queue_running.length : 0,
        queuePending: Array.isArray(queue?.queue_pending) ? queue.queue_pending.length : 0,
        gpu: devices[0]?.name || null
      };
    } catch (error) {
      return {
        configured: true,
        ok: false,
        state: error?.name === "AbortError" ? "timeout" : "unreachable",
        message: error?.name === "AbortError" ? "远端检测超时" : "H3 远端不可达"
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async startRemoteAndTunnel() {
    const config = this.config();
    const args = sshArgs(config);
    if (!args || !isLoopbackUrl(config?.comfy_url)) return false;
    try {
      await execFileAsync("ssh", [...args, remoteComfyCommand(config)], { timeout: 30_000, maxBuffer: 256_000 });
    } catch {
      return false;
    }
    if (this.tunnelProcess && this.tunnelProcess.exitCode === null) return true;
    const url = new URL(config.comfy_url);
    const localPort = Number(url.port) || 6006;
    const remotePort = Number(config.comfy_port) || localPort;
    const child = spawn("ssh", [
      "-N",
      ...args.slice(0, -1),
      "-o", "ExitOnForwardFailure=yes",
      "-o", "ServerAliveInterval=30",
      "-o", "ServerAliveCountMax=3",
      "-L", `${localPort}:127.0.0.1:${remotePort}`,
      args.at(-1)
    ], { stdio: "ignore" });
    this.tunnelProcess = child;
    child.once("exit", () => {
      if (this.tunnelProcess === child) this.tunnelProcess = null;
    });
    await Promise.race([
      once(child, "spawn"),
      once(child, "error").then(([error]) => Promise.reject(error))
    ]).catch(() => null);
    return child.exitCode === null;
  }

  async checkHealth({ reconnect = true } = {}) {
    if (this.pending) return this.pending;
    this.pending = (async () => {
      let result = await this.probe();
      if (!result.ok && result.configured && reconnect) {
        const tunnelStarted = await this.startRemoteAndTunnel();
        if (tunnelStarted) {
          for (let attempt = 0; attempt < 10; attempt += 1) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            result = await this.probe();
            if (result.ok) break;
          }
        } else if (isLoopbackUrl(this.config()?.comfy_url)) {
          result = { ...result, state: "ssh_unreachable", message: "SSH 未连接，请确认 GPU 实例已开机", tunnel: "unavailable" };
        }
      }
      this.state = { ...this.state, ...result, lastCheckedAt: new Date().toISOString() };
      return this.status();
    })().finally(() => { this.pending = null; });
    return this.pending;
  }

  async ensureReady() {
    const result = await this.probe();
    if (result.ok) {
      this.state = { ...this.state, ...result, lastCheckedAt: new Date().toISOString() };
      return this.status();
    }
    this.state = { ...this.state, ok: false, lastCheckedAt: new Date().toISOString() };
    return this.checkHealth({ reconnect: true });
  }

  async installMotionContextPackage(input = {}) {
    const packageName = "ComfyUI-H3-Motion-Context";
    const sourcePath = path.resolve(safeText(input.sourcePath));
    if (!sourcePath || path.basename(sourcePath) !== packageName) throw new Error(`Expected a ${packageName} source directory`);
    if (!(await stat(sourcePath)).isDirectory()) throw new Error(`H3 Motion Context source is not a directory: ${sourcePath}`);
    for (const required of ["LICENSE", "pyproject.toml", "__init__.py", "nodes.py", "patch_layout.py", "patch_payload.py"]) {
      if (!(await stat(path.join(sourcePath, required))).isFile()) throw new Error(`H3 Motion Context package is missing ${required}`);
    }
    const sourceHash = await packageSourceHash(sourcePath);
    if (safeText(input.expectedSourceHash) && sourceHash !== safeText(input.expectedSourceHash)) {
      throw new Error("H3 Motion Context source hash changed after review");
    }
    const config = this.config();
    const ssh = sshArgs(config);
    const scp = scpArgs(config);
    if (!ssh || !scp) throw new Error("H3 SSH configuration is unavailable");
    const comfyDirectory = safeText(config.comfy_dir) || "/root/autodl-tmp/ComfyUI";
    const stamp = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
    const remoteArchive = `/root/autodl-tmp/unutv-motion-context-${stamp}.tgz`;
    const targetPath = path.posix.join(comfyDirectory, "custom_nodes", packageName);
    const backupPath = `/root/autodl-tmp/unutv-backups/${packageName}-${stamp}`;
    const failedPath = `/root/autodl-tmp/unutv-backups/${packageName}-${stamp}-failed`;
    const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "unutv-h3-motion-context-"));
    const localArchive = path.join(temporaryDirectory, `${packageName}.tgz`);
    let hadBackup = false;
    try {
      await execFileAsync("tar", [
        "-czf", localArchive,
        "--exclude=.git", "--exclude=.DS_Store", "--exclude=__pycache__", "--exclude=*.pyc",
        "-C", path.dirname(sourcePath), packageName
      ], { timeout: 30_000, maxBuffer: 256_000 });
      await execFileAsync("scp", [...scp, localArchive, `root@${config.ssh.host}:${remoteArchive}`], { timeout: 60_000, maxBuffer: 256_000 });
      const installCommand = [
        "set -e",
        `mkdir -p ${shellQuote(path.posix.dirname(targetPath))} ${shellQuote(path.posix.dirname(backupPath))}`,
        `if [ -e ${shellQuote(targetPath)} ]; then mv ${shellQuote(targetPath)} ${shellQuote(backupPath)}; echo backup=yes; else echo backup=no; fi`,
        `tar -xzf ${shellQuote(remoteArchive)} -C ${shellQuote(path.posix.dirname(targetPath))}`,
        `rm -f ${shellQuote(remoteArchive)}`
      ].join("; ");
      const installed = await execFileAsync("ssh", [...ssh, installCommand], { timeout: 60_000, maxBuffer: 256_000 });
      hadBackup = installed.stdout.includes("backup=yes");
      await this.restartComfyUi();
      const health = await this.checkHealth({ reconnect: false });
      if (!health.ok) throw new Error(health.message || "H3 did not recover after Motion Context installation");
      return { installed: true, packageName, sourceHash, hadBackup, health };
    } catch (error) {
      const rollbackCommand = [
        "set -e",
        `mkdir -p ${shellQuote(path.posix.dirname(failedPath))}`,
        `if [ -e ${shellQuote(targetPath)} ]; then mv ${shellQuote(targetPath)} ${shellQuote(failedPath)}; fi`,
        ...(hadBackup ? [`if [ -e ${shellQuote(backupPath)} ]; then mv ${shellQuote(backupPath)} ${shellQuote(targetPath)}; fi`] : []),
        `rm -f ${shellQuote(remoteArchive)}`
      ].join("; ");
      await execFileAsync("ssh", [...ssh, rollbackCommand], { timeout: 30_000, maxBuffer: 256_000 }).catch(() => null);
      if (hadBackup) await this.restartComfyUi().catch(() => null);
      throw error;
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }

  async exportMotionContextWorkflows(input = {}) {
    const files = Array.isArray(input.files) ? input.files : [];
    if (!files.length || files.length > 8) throw new Error("H3 Motion Context export requires 1-8 files");
    const normalized = files.map((item) => {
      const filename = safeText(item?.filename);
      const kind = item?.kind === "ui" ? "ui" : "api";
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,159}\.json$/.test(filename)) {
        throw new Error(`Invalid H3 workflow export filename: ${filename || "empty"}`);
      }
      if (!item?.data || typeof item.data !== "object" || Array.isArray(item.data)) {
        throw new Error(`H3 workflow export data must be an object: ${filename}`);
      }
      return { filename, kind, text: `${JSON.stringify(item.data, null, 2)}\n` };
    });
    const config = this.config();
    const ssh = sshArgs(config);
    const scp = scpArgs(config);
    if (!ssh || !scp) throw new Error("H3 SSH configuration is unavailable");
    const comfyDirectory = safeText(config.comfy_dir) || "/root/autodl-tmp/ComfyUI";
    const uiDirectory = path.posix.join(comfyDirectory, "user", "default", "workflows", "UnuTV-H3-MotionContext");
    const apiDirectory = path.posix.join(comfyDirectory, "output", "h3_context", "exports");
    const stamp = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
    const backupDirectory = `/root/autodl-tmp/unutv-backups/h3-workflow-export-${stamp}`;
    const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "unutv-h3-workflow-export-"));
    const exported = [];
    try {
      await execFileAsync("ssh", [...ssh, [
        "set -e",
        `mkdir -p ${shellQuote(uiDirectory)} ${shellQuote(apiDirectory)} ${shellQuote(backupDirectory)}`
      ].join("; ")], { timeout: 30_000, maxBuffer: 256_000 });
      for (const item of normalized) {
        const localPath = path.join(temporaryDirectory, item.filename);
        const remoteDirectory = item.kind === "ui" ? uiDirectory : apiDirectory;
        const remotePath = path.posix.join(remoteDirectory, item.filename);
        const remoteTemporaryPath = `${remotePath}.unutv-${stamp}.tmp`;
        const backupPath = path.posix.join(backupDirectory, item.filename);
        await writeFile(localPath, item.text, "utf8");
        await execFileAsync("scp", [...scp, localPath, `root@${config.ssh.host}:${remoteTemporaryPath}`], { timeout: 60_000, maxBuffer: 256_000 });
        const installed = await execFileAsync("ssh", [...ssh, [
          "set -e",
          `if [ -e ${shellQuote(remotePath)} ]; then mv ${shellQuote(remotePath)} ${shellQuote(backupPath)}; echo backup=yes; else echo backup=no; fi`,
          `mv ${shellQuote(remoteTemporaryPath)} ${shellQuote(remotePath)}`
        ].join("; ")], { timeout: 30_000, maxBuffer: 256_000 });
        exported.push({
          filename: item.filename,
          kind: item.kind,
          relativePath: item.kind === "ui"
            ? `user/default/workflows/UnuTV-H3-MotionContext/${item.filename}`
            : `output/h3_context/exports/${item.filename}`,
          bytes: Buffer.byteLength(item.text),
          sha256: createHash("sha256").update(item.text).digest("hex"),
          backedUpPrevious: installed.stdout.includes("backup=yes")
        });
      }
      return { exported, backupCreated: exported.some((item) => item.backedUpPrevious) };
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }

  async restartComfyUi() {
    const config = this.config();
    const ssh = sshArgs(config);
    if (!ssh) throw new Error("H3 SSH configuration is unavailable");
    const remotePort = Number(config.comfy_port) || Number(new URL(config.comfy_url).port) || 6006;
    const directory = safeText(config.comfy_dir) || "/root/autodl-tmp/ComfyUI";
    const python = safeText(config.python) || "/root/miniconda3/bin/python";
    const command = [
      "set -e",
      `cd ${shellQuote(directory)}`,
      `pids=$(ps -eo pid=,comm=,args= | awk -v p=${shellQuote(remotePort)} '$2 ~ /^python/ && $0 ~ /(^|[ \/])main\\.py( |$)/ && $0 ~ ("--port " p "( |$)") {print $1}')`,
      `if [ -n "$pids" ]; then kill $pids; fi`,
      "for i in 1 2 3 4 5 6 7 8 9 10; do if [ -z \"$pids\" ] || ! kill -0 $pids 2>/dev/null; then break; fi; sleep 1; done",
      `nohup ${shellQuote(python)} main.py --listen 0.0.0.0 --port ${remotePort} >/root/autodl-tmp/comfyui.log 2>&1 </dev/null &`
    ].join("; ");
    await execFileAsync("ssh", [...ssh, command], { timeout: 45_000, maxBuffer: 256_000 });
    this.state = { ...this.state, ok: false, state: "restarting", message: "H3 ComfyUI 正在重启" };
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const result = await this.probe();
      if (result.ok) {
        this.state = { ...this.state, ...result, lastCheckedAt: new Date().toISOString() };
        return this.status();
      }
    }
    throw new Error("H3 ComfyUI restart timed out");
  }

  close() {
    if (this.tunnelProcess?.exitCode === null) this.tunnelProcess.kill("SIGTERM");
    this.tunnelProcess = null;
  }
}
