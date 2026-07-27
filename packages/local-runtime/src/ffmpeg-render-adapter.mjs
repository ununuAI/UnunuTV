import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { UnuTvError } from "@ununu/unutv-contracts";
import { projectDirectory } from "./paths.mjs";

function presetOutput(preset) {
  if (preset === "prores_master") return { extension: ".mov", videoArgs: ["-c:v", "prores_ks", "-profile:v", "3", "-pix_fmt", "yuv422p10le"], audioArgs: ["-c:a", "pcm_s24le"] };
  if (preset === "wav_mix") return { extension: ".wav", audioOnly: true, audioArgs: ["-c:a", "pcm_s24le", "-ar", "48000"] };
  if (preset === "h265_delivery") return { extension: ".mp4", videoArgs: ["-c:v", "libx265", "-crf", "20", "-tag:v", "hvc1", "-pix_fmt", "yuv420p"], audioArgs: ["-c:a", "aac", "-b:a", "192k"] };
  return { extension: ".mp4", videoArgs: ["-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart"], audioArgs: ["-c:a", "aac", "-b:a", "192k"] };
}

function seconds(milliseconds) { return Math.max(0, milliseconds / 1000).toFixed(3); }
function parseProgress(text, totalSeconds) {
  const match = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(text);
  if (!match) return null;
  const current = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
  return Math.max(0, Math.min(.99, current / Math.max(.001, totalSeconds)));
}

function subtitleTime(milliseconds, srt = false) {
  const value = Math.max(0, Math.round(milliseconds));
  const hours = Math.floor(value / 3_600_000);
  const minutes = Math.floor(value % 3_600_000 / 60_000);
  const secondsValue = Math.floor(value % 60_000 / 1000);
  const millisecondsValue = value % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secondsValue).padStart(2, "0")}${srt ? "," : "."}${String(millisecondsValue).padStart(3, "0")}`;
}

function assColor(value, fallback) {
  const match = /^#([0-9a-f]{6})$/i.exec(String(value || ""));
  if (!match) return fallback;
  const hex = match[1];
  return `&H00${hex.slice(4, 6)}${hex.slice(2, 4)}${hex.slice(0, 2).toUpperCase()}`;
}

async function writeSubtitleSidecars(outputPath, cues = [], style = {}) {
  if (!cues.length) return {};
  const base = outputPath.slice(0, -path.extname(outputPath).length);
  const srtPath = `${base}.srt`;
  const vttPath = `${base}.vtt`;
  const assPath = `${base}.ass`;
  const blocks = cues.map((cue, index) => `${index + 1}\n${subtitleTime(cue.startMs, true)} --> ${subtitleTime(cue.endMs, true)}\n${cue.text}`);
  const webBlocks = cues.map((cue) => `${subtitleTime(cue.startMs)} --> ${subtitleTime(cue.endMs)}\n${cue.text}`);
  const assTime = (milliseconds) => subtitleTime(milliseconds).replace(/^00:/, "0:");
  const assEvents = cues.map((cue) => `Dialogue: 0,${assTime(cue.startMs)},${assTime(cue.endMs)},Default,,0,0,0,,${cue.text.replaceAll("\n", "\\N")}`);
  const alignment = style.alignment === "top_center" ? 8 : style.alignment === "middle_center" ? 5 : 2;
  const ass = `[Script Info]\nScriptType: v4.00+\nWrapStyle: 0\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,${String(style.fontFamily || "PingFang SC").replaceAll(",", " ")},${Number(style.fontSize || 48)},${assColor(style.color, "&H00FFFFFF")},&H000000FF,${assColor(style.outlineColor, "&H00000000")},&H80000000,0,0,0,0,100,100,0,0,1,${Number(style.outlineWidth || 2)},0,${alignment},40,40,${Number(style.marginBottom || 72)},1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n${assEvents.join("\n")}\n`;
  await Promise.all([writeFile(srtPath, `${blocks.join("\n\n")}\n`, "utf8"), writeFile(vttPath, `WEBVTT\n\n${webBlocks.join("\n\n")}\n`, "utf8"), writeFile(assPath, ass, "utf8")]);
  return { assPath, srtPath, vttPath };
}

function frameTime(milliseconds, frameRate) {
  const frames = Math.max(0, Math.round(milliseconds / 1000 * frameRate));
  const frame = frames % frameRate;
  const secondsTotal = Math.floor(frames / frameRate);
  const secondsValue = secondsTotal % 60;
  const minutes = Math.floor(secondsTotal / 60) % 60;
  const hours = Math.floor(secondsTotal / 3600);
  return [hours, minutes, secondsValue, frame].map((value) => String(value).padStart(2, "0")).join(":");
}

function xml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

async function writeExchangeSidecars(outputPath, graph) {
  if (!graph.exchange) return {};
  const base = outputPath.slice(0, -path.extname(outputPath).length);
  const edlPath = `${base}.edl`;
  const fcpxmlPath = `${base}.fcpxml`;
  const edlLines = ["TITLE: UNUNU TIMELINE", "FCM: NON-DROP FRAME", ""];
  graph.clips.forEach((clip, index) => {
    edlLines.push(`${String(index + 1).padStart(3, "0")}  AX       V     C        ${frameTime(clip.trimInMs, graph.frameRate)} ${frameTime(clip.trimInMs + clip.durationMs, graph.frameRate)} ${frameTime(clip.startMs, graph.frameRate)} ${frameTime(clip.startMs + clip.durationMs, graph.frameRate)}`);
    edlLines.push(`* FROM CLIP NAME: ${clip.mediaId}`);
  });
  const assets = graph.clips.map((clip, index) => `<asset id="r${index + 2}" name="${xml(clip.mediaId)}" start="0s" duration="${clip.durationMs}/1000s" hasVideo="1"/>`).join("");
  const clips = graph.clips.map((clip, index) => `<asset-clip ref="r${index + 2}" name="${xml(clip.mediaId)}" offset="${clip.startMs}/1000s" start="${clip.trimInMs}/1000s" duration="${clip.durationMs}/1000s"/>`).join("");
  const fcpxml = `<?xml version="1.0" encoding="UTF-8"?>\n<fcpxml version="1.10"><resources><format id="r1" frameDuration="1/${graph.frameRate}s" width="${graph.width}" height="${graph.height}"/>${assets}</resources><library><event name="UnunuTV"><project name="${xml(graph.timelineId)}"><sequence format="r1" duration="${graph.durationMs}/1000s"><spine>${clips}</spine></sequence></project></event></library></fcpxml>\n`;
  await Promise.all([writeFile(edlPath, `${edlLines.join("\n")}\n`, "utf8"), writeFile(fcpxmlPath, fcpxml, "utf8")]);
  return { edlPath, fcpxmlPath };
}

function runFfmpeg(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk.toString()}`.slice(-12000); });
    child.on("error", (error) => reject(new UnuTvError("render_ffmpeg_unavailable", `无法启动 FFmpeg：${error.message}`, 500)));
    child.on("close", (code) => code === 0 ? resolve() : reject(new UnuTvError("render_sidecar_failed", `FFmpeg sidecar exited with ${code}`, 500, { stderr })));
  });
}

async function writeAudioSidecars(ffmpegPath, outputPath, audioInputs, durationMs, audioOnly) {
  if (!audioInputs.length) return {};
  const base = outputPath.slice(0, -path.extname(outputPath).length);
  const result = {};
  if (audioOnly) result.mixWavPath = outputPath;
  else {
    result.mixWavPath = `${base}.mix.wav`;
    await runFfmpeg(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-y", "-i", outputPath, "-vn", "-c:a", "pcm_s24le", "-ar", "48000", result.mixWavPath]);
  }
  const groups = new Map();
  for (const input of audioInputs) groups.set(input.track, [...(groups.get(input.track) ?? []), input]);
  for (const [track, inputs] of groups) {
    const stemPath = `${base}.stem-${track}.wav`;
    const filters = inputs.map((input, index) => `[${index}:a]atrim=start=${seconds(input.trimInMs)}:duration=${seconds(input.durationMs)},asetpts=PTS-STARTPTS,volume=${Math.max(0, input.volume)},aformat=sample_rates=48000:channel_layouts=stereo,adelay=${input.startMs}|${input.startMs}[s${index}]`);
    filters.push(`${inputs.map((_, index) => `[s${index}]`).join("")}amix=inputs=${inputs.length}:duration=longest:dropout_transition=0,atrim=0:${seconds(durationMs)}[stem]`);
    await runFfmpeg(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-y", ...inputs.flatMap((input) => ["-i", input.filePath]), "-filter_complex", filters.join(";"), "-map", "[stem]", "-c:a", "pcm_s24le", "-ar", "48000", stemPath]);
    result[`stemTrack${track}WavPath`] = stemPath;
  }
  return result;
}

function effectFilters(effects = []) {
  const filters = [];
  for (const effect of effects) {
    const parameters = effect.parameters ?? {};
    if (effect.kind === "color") {
      const brightness = Math.max(-1, Math.min(1, Number(parameters.exposure ?? parameters.brightness ?? 0)));
      const contrast = Math.max(0, Math.min(3, Number(parameters.contrast ?? 1)));
      const saturation = Math.max(0, Math.min(3, Number(parameters.saturation ?? 1)));
      filters.push(`eq=brightness=${brightness}:contrast=${contrast}:saturation=${saturation}`);
    } else if (effect.kind === "blur") filters.push(`gblur=sigma=${Math.max(0, Math.min(100, Number(parameters.sigma ?? 4)))}`);
    else if (effect.kind === "vignette") filters.push("vignette");
  }
  return filters;
}

function transitionName(kind) {
  return ({ crossfade: "fade", dissolve: "dissolve", wipe_left: "wipeleft", wipe_right: "wiperight" })[kind] ?? "fade";
}

async function fileChecksum(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

async function sidecarsWithChecksums(sidecars) {
  return Object.fromEntries(await Promise.all(Object.entries(sidecars).map(async ([role, filePath]) => [role, { path: filePath, checksum: await fileChecksum(filePath) }])));
}

export class LocalFfmpegRenderAdapter {
  constructor(dataRoot, media, options = {}) {
    this.dataRoot = dataRoot;
    this.media = media;
    this.ffmpegPath = options.ffmpegPath ?? process.env.UNUTV_FFMPEG_PATH ?? "ffmpeg";
    this.ffprobePath = options.ffprobePath ?? process.env.UNUTV_FFPROBE_PATH ?? (path.isAbsolute(this.ffmpegPath) ? path.join(path.dirname(this.ffmpegPath), "ffprobe") : "ffprobe");
    this.processes = new Map();
  }

  async start({ projectId, job, graph, onProgress }) {
    const inputs = (graph.audioOnly ? [] : graph.clips).map((clip) => {
      const media = this.media.open(projectId, clip.mediaId);
      if (!media) throw new UnuTvError("render_media_not_found", `Render media not found: ${clip.mediaId}`, 404);
      return { ...clip, filePath: media.filePath, kind: media.kind };
    });
    const audioInputs = (graph.audioClips ?? []).map((clip) => {
      const media = this.media.open(projectId, clip.mediaId);
      if (!media) throw new UnuTvError("render_media_not_found", `Render audio media not found: ${clip.mediaId}`, 404);
      return { ...clip, filePath: media.filePath };
    });
    const embeddedAudioInputs = (await Promise.all(inputs.map(async (input, inputIndex) => {
      if (input.kind !== "video" || input.includeEmbeddedAudio === false) return null;
      const probe = await this.probe(input.filePath);
      if (!(probe.streams ?? []).some((stream) => stream.codec_type === "audio")) return null;
      return {
        ...input,
        inputIndex,
        track: "embedded",
        volume: Math.max(0, Number(input.embeddedAudioVolume ?? 1))
      };
    }))).filter(Boolean);
    const mixedAudioInputs = [
      ...embeddedAudioInputs,
      ...audioInputs.map((input, index) => ({ ...input, inputIndex: inputs.length + index }))
    ];
    const target = presetOutput(job.preset);
    const outputDirectory = path.join(projectDirectory(this.dataRoot, projectId), "exports");
    const outputPath = path.join(outputDirectory, `${job.id}${target.extension}`);
    await mkdir(outputDirectory, { recursive: true });
    const inputArgs = [
      ...inputs.flatMap((input) => input.kind === "image"
        ? ["-loop", "1", "-t", seconds(input.durationMs), "-i", input.filePath]
        : ["-ss", seconds(input.trimInMs), "-t", seconds(input.durationMs), "-i", input.filePath]),
      ...audioInputs.flatMap((input) => ["-i", input.filePath])
    ];
    const filters = [];
    const segments = [];
    let cursorMs = 0;
    inputs.forEach((input, index) => {
      if (input.startMs > cursorMs) {
        const gapLabel = `gap${index}`;
        const gapDurationMs = input.startMs - cursorMs;
        filters.push(`color=c=black:s=${graph.width}x${graph.height}:r=${graph.frameRate}:d=${seconds(gapDurationMs)},settb=AVTB[${gapLabel}]`);
        segments.push({ clipId: null, durationMs: gapDurationMs, label: `[${gapLabel}]`, transition: null });
      }
      const videoLabel = `v${index}`;
      const clipFilters = [`setpts=PTS-STARTPTS`, `scale=${graph.width}:${graph.height}:force_original_aspect_ratio=decrease`, `pad=${graph.width}:${graph.height}:(ow-iw)/2:(oh-ih)/2:black`, "setsar=1", "format=yuv420p", `fps=${graph.frameRate}`, "settb=AVTB", ...effectFilters(input.effects)];
      filters.push(`[${index}:v]${clipFilters.join(",")}[${videoLabel}]`);
      const previous = inputs[index - 1];
      const transition = previous && input.startMs <= cursorMs ? (graph.transitions ?? []).find((entry) => entry.fromClipId === previous.clipId && entry.toClipId === input.clipId) : null;
      segments.push({ clipId: input.clipId, durationMs: input.durationMs, label: `[${videoLabel}]`, transition });
      cursorMs = Math.max(cursorMs, input.startMs + input.durationMs);
    });
    let videoOutput = null;
    if (!target.audioOnly) {
      let chain = { durationMs: segments[0].durationMs, label: segments[0].label };
      for (let index = 1; index < segments.length; index += 1) {
        const segment = segments[index];
        const outputLabel = `chain${index}`;
        const transitionMs = Math.min(segment.transition?.durationMs ?? 0, chain.durationMs, segment.durationMs);
        if (transitionMs > 0) {
          const offset = Math.max(0, (chain.durationMs - transitionMs) / 1000).toFixed(3);
          filters.push(`${chain.label}${segment.label}xfade=transition=${transitionName(segment.transition.kind)}:duration=${seconds(transitionMs)}:offset=${offset}[${outputLabel}]`);
          chain = { durationMs: chain.durationMs + segment.durationMs - transitionMs, label: `[${outputLabel}]` };
        } else {
          filters.push(`${chain.label}${segment.label}concat=n=2:v=1:a=0[${outputLabel}]`);
          chain = { durationMs: chain.durationMs + segment.durationMs, label: `[${outputLabel}]` };
        }
      }
      videoOutput = chain.label;
    }
    if (mixedAudioInputs.length) {
      const audioLabels = mixedAudioInputs.map((input, index) => {
        const label = `a${index}`;
        filters.push(`[${input.inputIndex}:a]atrim=start=${seconds(input.trimInMs)}:duration=${seconds(input.durationMs)},asetpts=PTS-STARTPTS,volume=${Math.max(0, input.volume)},aformat=sample_rates=48000:channel_layouts=stereo,adelay=${input.startMs}|${input.startMs}[${label}]`);
        return `[${label}]`;
      });
      filters.push(`${audioLabels.join("")}amix=inputs=${audioLabels.length}:duration=longest:dropout_transition=0,atrim=0:${seconds(graph.durationMs)}[aout]`);
    }
    const audioArgs = mixedAudioInputs.length ? ["-map", "[aout]", ...target.audioArgs] : ["-an"];
    const args = target.audioOnly
      ? ["-hide_banner", "-y", ...inputArgs, "-filter_complex", filters.join(";"), "-map", "[aout]", ...target.audioArgs, outputPath]
      : ["-hide_banner", "-y", ...inputArgs, "-filter_complex", filters.join(";"), "-map", videoOutput, ...audioArgs, ...target.videoArgs, outputPath];
    return new Promise((resolve, reject) => {
      const child = spawn(this.ffmpegPath, args, { stdio: ["ignore", "ignore", "pipe"] });
      this.processes.set(job.id, child);
      let stderr = "";
      child.stderr.on("data", (chunk) => {
        const text = chunk.toString();
        stderr = `${stderr}${text}`.slice(-16000);
        const progress = parseProgress(text, graph.clips.reduce((sum, clip) => sum + clip.durationMs, 0) / 1000);
        if (progress !== null) onProgress?.(progress);
      });
      child.on("error", (error) => {
        this.processes.delete(job.id);
        reject(new UnuTvError("render_ffmpeg_unavailable", `无法启动 FFmpeg：${error.message}`, 500));
      });
      child.on("close", async (code, signal) => {
        this.processes.delete(job.id);
        if (signal || code !== 0) return reject(new UnuTvError(signal ? "render_cancelled" : "render_failed", signal ? "Render was cancelled" : `FFmpeg exited with ${code}`, signal ? 409 : 500, { args, stderr }));
        try {
          const [subtitleSidecars, exchangeSidecars, audioSidecars] = await Promise.all([
            writeSubtitleSidecars(outputPath, graph.subtitleCues, graph.subtitleStyle),
            writeExchangeSidecars(outputPath, graph),
            writeAudioSidecars(this.ffmpegPath, outputPath, mixedAudioInputs, graph.durationMs, target.audioOnly)
          ]);
          resolve({ kind: target.audioOnly ? "audio" : "video", outputPath, sidecars: await sidecarsWithChecksums({ ...subtitleSidecars, ...exchangeSidecars, ...audioSidecars }) });
        }
        catch (error) { reject(new UnuTvError("subtitle_export_failed", `字幕文件写入失败：${error.message}`, 500)); }
      });
    });
  }

  cancel(jobId) { const child = this.processes.get(jobId); if (!child) return false; child.kill("SIGTERM"); return true; }
  probe(filePath) {
    return new Promise((resolve, reject) => {
      const child = spawn(this.ffprobePath, ["-v", "error", "-show_streams", "-show_format", "-of", "json", filePath], { stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
      child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk.toString()}`.slice(-8000); });
      child.on("error", (error) => reject(new UnuTvError("render_ffprobe_unavailable", `无法启动 FFprobe：${error.message}`, 500)));
      child.on("close", (code) => {
        if (code !== 0) return reject(new UnuTvError("render_probe_failed", `FFprobe exited with ${code}`, 500, { stderr }));
        try { resolve(JSON.parse(stdout)); }
        catch (error) { reject(new UnuTvError("render_probe_invalid", `FFprobe 返回了无效数据：${error.message}`, 500)); }
      });
    });
  }
  close() { for (const child of this.processes.values()) child.kill("SIGTERM"); this.processes.clear(); }
}
