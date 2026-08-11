import { copyFile, mkdir, mkdtemp, rename, rm, stat, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import path from "node:path";
import { UnuTvError, createId, nowIso } from "@ununu/unutv-contracts";
import { mediaDirectoryForKind } from "@ununu/unutv-core";
import { projectDirectory } from "./paths.mjs";

const MIME_BY_EXTENSION = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".m4v": "video/x-m4v",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".flac": "audio/flac",
  ".spz": "model/vnd.gaussian-splat",
  ".ply": "model/vnd.gaussian-splat",
  ".splat": "model/vnd.gaussian-splat",
  ".ksplat": "model/vnd.gaussian-splat",
  ".sog": "model/vnd.gaussian-splat",
  ".rad": "model/vnd.gaussian-splat"
};

const EXTENSION_BY_MIME = {
  "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp",
  "video/mp4": ".mp4", "video/quicktime": ".mov", "video/webm": ".webm",
  "audio/mpeg": ".mp3", "audio/mp3": ".mp3", "audio/wav": ".wav", "audio/mp4": ".m4a", "audio/aac": ".aac",
  "model/vnd.gaussian-splat": ".spz"
};

async function sha256(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", options.captureStdout ? "pipe" : "ignore", "pipe"] });
    const stdout = [];
    let stdoutBytes = 0;
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes <= (options.maxStdoutBytes ?? 64_000_000)) stdout.push(chunk);
      else child.kill("SIGTERM");
    });
    child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk.toString()}`.slice(-12000); });
    child.on("error", (error) => reject(new UnuTvError(
      options.unavailableCode ?? "media_preparation_tool_unavailable",
      options.unavailableMessage ?? `无法启动媒体准备工具：${error.message}`,
      500,
      { command, cause: error.message }
    )));
    child.on("close", (code, signal) => {
      if (signal || code !== 0) return reject(new UnuTvError(
        options.failureCode ?? "media_preparation_failed",
        options.failureMessage ?? `媒体准备进程退出：${signal || code}`,
        500,
        { command, stderr }
      ));
      resolve(Buffer.concat(stdout));
    });
  });
}

function normalizeWaveform(bytes, bins = 96) {
  const sampleCount = Math.floor(bytes.length / 2);
  if (!sampleCount) return [];
  const width = Math.max(1, Math.floor(sampleCount / bins));
  const raw = [];
  for (let bin = 0; bin < bins; bin += 1) {
    const start = bin * width;
    const end = bin === bins - 1 ? sampleCount : Math.min(sampleCount, start + width);
    let peak = 0;
    for (let index = start; index < end; index += 1) peak = Math.max(peak, Math.abs(bytes.readInt16LE(index * 2)) / 32768);
    raw.push(peak);
  }
  const maximum = Math.max(.0001, ...raw);
  return raw.map((peak) => Math.round(peak / maximum * 1000) / 1000);
}

export class LocalMediaStore {
  constructor(dataRoot, projects, options = {}) {
    this.dataRoot = dataRoot;
    this.projects = projects;
    this.ffmpegPath = options.ffmpegPath ?? process.env.UNUTV_FFMPEG_PATH ?? "ffmpeg";
    this.ffprobePath = options.ffprobePath ?? process.env.UNUTV_FFPROBE_PATH ?? (path.isAbsolute(this.ffmpegPath) ? path.join(path.dirname(this.ffmpegPath), "ffprobe") : "ffprobe");
    this.audioSeparatorPath = options.audioSeparatorPath ?? process.env.UNUTV_AUDIO_SEPARATOR_PATH ?? "demucs";
    this.audioSeparatorModel = options.audioSeparatorModel ?? process.env.UNUTV_AUDIO_SEPARATOR_MODEL ?? "htdemucs";
  }

  async importFile(input) {
    const sourceStat = await stat(input.filePath);
    if (!sourceStat.isFile()) throw new Error(`Media source is not a file: ${input.filePath}`);
    const id = createId("media");
    const extension = path.extname(input.filePath).toLowerCase();
    const relativeDirectory = mediaDirectoryForKind(input.kind, input.generated);
    const relativePath = path.posix.join(relativeDirectory, `${id}${extension}`);
    const directory = path.join(projectDirectory(this.dataRoot, input.projectId), relativeDirectory);
    const targetPath = path.join(projectDirectory(this.dataRoot, input.projectId), relativePath);
    const partialPath = `${targetPath}.partial`;
    await mkdir(directory, { recursive: true });
    await copyFile(input.filePath, partialPath);
    const [targetStat, checksum] = await Promise.all([stat(partialPath), sha256(partialPath)]);
    await rename(partialPath, targetPath);
    return this.projects.recordMedia(input.projectId, {
      id,
      nodeId: input.nodeId,
      kind: input.kind,
      title: input.title || path.basename(input.filePath),
      relativePath,
      mimeType: MIME_BY_EXTENSION[extension] ?? "application/octet-stream",
      sizeBytes: targetStat.size,
      sha256: checksum,
      source: input.generated ? "generated" : "imported",
      createdAt: nowIso()
    });
  }

  async stageRenderFile(input) {
    return this.importFile({ ...input, nodeId: null, generated: true });
  }

  async importBytes(input) {
    const bytes = Buffer.isBuffer(input.bytes) ? input.bytes : Buffer.from(input.bytes);
    if (!bytes.length) throw new Error("Generated media bytes are empty");
    const id = createId("media");
    const extension = EXTENSION_BY_MIME[input.mimeType] || (input.kind === "image" ? ".png" : input.kind === "video" ? ".mp4" : input.kind === "world" ? ".spz" : ".mp3");
    const relativeDirectory = mediaDirectoryForKind(input.kind, true);
    const relativePath = path.posix.join(relativeDirectory, `${id}${extension}`);
    const directory = path.join(projectDirectory(this.dataRoot, input.projectId), relativeDirectory);
    const targetPath = path.join(projectDirectory(this.dataRoot, input.projectId), relativePath);
    const partialPath = `${targetPath}.partial`;
    await mkdir(directory, { recursive: true });
    await writeFile(partialPath, bytes);
    await rename(partialPath, targetPath);
    return this.projects.recordMedia(input.projectId, {
      id,
      nodeId: input.nodeId,
      kind: input.kind,
      title: input.title || `${id}${extension}`,
      relativePath,
      mimeType: input.mimeType,
      sizeBytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      source: "generated",
      makeCurrent: input.makeCurrent !== false,
      createdAt: nowIso()
    });
  }

  async importDataUrl(input) {
    const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=\r\n]+)$/.exec(input.dataUrl);
    if (!match) throw new Error("Media data URL must contain base64 bytes");
    const mimeType = match[1].toLowerCase();
    if (!mimeType.startsWith(`${input.kind}/`)) throw new Error(`Media MIME ${mimeType} does not match ${input.kind}`);
    return this.importBytes({ ...input, mimeType, bytes: Buffer.from(match[2], "base64") });
  }

  async extractFrame(input) {
    const opened = this.open(input.projectId, input.mediaId);
    if (!opened) throw new UnuTvError("media_not_found", `Media not found: ${input.mediaId}`, 404);
    if (opened.kind !== "video") throw new UnuTvError("video_media_required", "Frame extraction requires video media", 400);
    const bytes = await runProcess(this.ffmpegPath, [
      "-hide_banner", "-loglevel", "error", "-ss", String(input.seconds), "-i", opened.filePath,
      "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "pipe:1"
    ], { captureStdout: true, maxStdoutBytes: 64_000_000 });
    return this.importBytes({
      projectId: input.projectId,
      nodeId: input.nodeId ?? null,
      kind: "image",
      mimeType: "image/png",
      bytes,
      title: input.title || `${opened.title} · ${input.seconds}s 权威尾帧`
    });
  }

  async separateAudioStems(input) {
    const opened = this.open(input.projectId, input.mediaId);
    if (!opened) throw new UnuTvError("media_not_found", `Media not found: ${input.mediaId}`, 404);
    if (!["audio", "video"].includes(opened.kind)) {
      throw new UnuTvError("audio_source_media_required", "Audio separation requires audio or video media", 400);
    }
    const projectRoot = projectDirectory(this.dataRoot, input.projectId);
    const temporaryRoot = await mkdtemp(path.join(projectRoot, ".audio-separation-"));
    const sourceBaseName = path.basename(opened.filePath, path.extname(opened.filePath));
    const originalMixPath = path.join(temporaryRoot, "original_mix.wav");
    const outputRoot = path.join(temporaryRoot, "demucs");
    try {
      await runProcess(this.ffmpegPath, [
        "-hide_banner", "-loglevel", "error", "-y", "-i", opened.filePath,
        "-map", "0:a:0", "-vn", "-ac", "2", "-ar", "48000", "-c:a", "pcm_s24le", originalMixPath
      ], {
        failureCode: "source_audio_extract_failed",
        failureMessage: "源媒体没有可供分离的有效音频轨。"
      });
      await runProcess(this.audioSeparatorPath, [
        "--two-stems", "vocals",
        "--name", this.audioSeparatorModel,
        "--out", outputRoot,
        opened.filePath
      ], {
        unavailableCode: "audio_separator_unavailable",
        unavailableMessage: "缺少真正的音源分离引擎。请安装 Python 版 Demucs，或通过 UNUTV_AUDIO_SEPARATOR_PATH 配置兼容命令。",
        failureCode: "audio_separation_failed",
        failureMessage: "音源分离失败；不得用左右声道拆分冒充对白/背景分离。"
      });
      const separatedDirectory = path.join(outputRoot, this.audioSeparatorModel, sourceBaseName);
      const definitions = [
        { filePath: originalMixPath, role: "original_mix", title: "原始混音（审计母本）" },
        { filePath: path.join(separatedDirectory, "vocals.wav"), role: "dialogue_candidate", title: "对白/人声候选 stem（待审核）" },
        { filePath: path.join(separatedDirectory, "no_vocals.wav"), role: "background_candidate", title: "环境/音乐/拟音候选 stem（待审核）" }
      ];
      const stems = [];
      for (const definition of definitions) {
        const media = await this.importFile({
          projectId: input.projectId,
          nodeId: null,
          filePath: definition.filePath,
          kind: "audio",
          generated: true,
          title: `${input.title || opened.title} · ${definition.title}`
        });
        stems.push({ ...definition, filePath: undefined, media, reviewState: "candidate" });
      }
      return {
        engine: "demucs",
        model: this.audioSeparatorModel,
        mode: "dialogue_background_candidates",
        sourceMediaId: opened.id,
        sourceChecksum: opened.sha256,
        stems
      };
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  }

  async prepare(input) {
    const opened = this.open(input.projectId, input.mediaId);
    if (!opened) throw new UnuTvError("media_not_found", `Media not found: ${input.mediaId}`, 404);
    const projectRoot = projectDirectory(this.dataRoot, input.projectId);
    const thumbnailRelativePath = opened.kind === "video" || opened.kind === "image" ? path.posix.join("media/thumbnails", `${opened.id}.jpg`) : null;
    const proxyRelativePath = opened.kind === "video" ? path.posix.join("media/proxies", `${opened.id}.mp4`) : null;
    const thumbnailPath = thumbnailRelativePath ? path.join(projectRoot, thumbnailRelativePath) : null;
    const proxyPath = proxyRelativePath ? path.join(projectRoot, proxyRelativePath) : null;
    const probeBytes = await runProcess(this.ffprobePath, ["-v", "error", "-show_streams", "-show_format", "-of", "json", opened.filePath], { captureStdout: true, maxStdoutBytes: 4_000_000 });
    let probe;
    try { probe = JSON.parse(probeBytes.toString("utf8")); }
    catch (error) { throw new UnuTvError("media_preparation_probe_invalid", `FFprobe 返回无效数据：${error.message}`, 500); }
    if (thumbnailPath) {
      const seek = opened.kind === "video" ? ["-ss", "0.100"] : [];
      await runProcess(this.ffmpegPath, ["-hide_banner", "-loglevel", "error", "-y", ...seek, "-i", opened.filePath, "-frames:v", "1", "-vf", "scale=w='min(640,iw)':h=-2", thumbnailPath]);
    }
    if (proxyPath) {
      await runProcess(this.ffmpegPath, ["-hide_banner", "-loglevel", "error", "-y", "-i", opened.filePath, "-map", "0:v:0", "-map", "0:a?", "-vf", "scale=w='min(960,iw)':h=-2", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", proxyPath]);
    }
    let waveform = null;
    if (["audio", "video"].includes(opened.kind)) {
      try {
        const pcm = await runProcess(this.ffmpegPath, ["-hide_banner", "-loglevel", "error", "-i", opened.filePath, "-map", "0:a:0?", "-vn", "-ac", "1", "-ar", "8000", "-f", "s16le", "pipe:1"], { captureStdout: true, maxStdoutBytes: 64_000_000 });
        waveform = normalizeWaveform(pcm);
      } catch { waveform = []; }
    }
    return { probe, proxyRelativePath, thumbnailRelativePath, waveform };
  }

  open(projectId, mediaId) {
    const media = this.projects.getMedia(projectId, mediaId);
    if (!media) return undefined;
    return { ...media, filePath: path.join(projectDirectory(this.dataRoot, projectId), media.relativePath) };
  }

  openPrepared(projectId, mediaId, role) {
    const preparation = this.projects.getMediaPreparation(projectId, mediaId);
    if (!preparation || preparation.status !== "succeeded") return undefined;
    const relativePath = role === "proxy" ? preparation.proxyRelativePath : role === "thumbnail" ? preparation.thumbnailRelativePath : null;
    if (!relativePath) return undefined;
    return {
      filePath: path.join(projectDirectory(this.dataRoot, projectId), relativePath),
      mimeType: role === "proxy" ? "video/mp4" : "image/jpeg"
    };
  }
}
