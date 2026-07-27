import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { UnuTvError } from "@ununu/unutv-contracts";

function runFfmpeg(ffmpegPath, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk.toString()}`.slice(-12000); });
    child.on("error", (error) => reject(new UnuTvError("grid_ffmpeg_unavailable", `无法启动 FFmpeg：${error.message}`, 500)));
    child.on("close", (code) => code === 0 ? resolve() : reject(new UnuTvError("grid_compose_failed", `宫格合成失败（FFmpeg ${code}）`, 500, { stderr })));
  });
}

export class LocalFfmpegGridAdapter {
  constructor(media, options = {}) {
    this.media = media;
    this.ffmpegPath = options.ffmpegPath ?? process.env.UNUTV_FFMPEG_PATH ?? "ffmpeg";
  }

  async compose({ aspectRatio, cells, cols, projectId, rows }) {
    const ratio = Number(aspectRatio);
    const outputWidth = Math.ceil(1200 / cols) * cols;
    const outputHeight = Math.ceil(Math.round(outputWidth / ratio) / rows) * rows;
    const cellWidth = outputWidth / cols;
    const cellHeight = outputHeight / rows;
    const inputArgs = [];
    const filters = [];
    const layout = [];

    cells.forEach((mediaId, index) => {
      if (mediaId) {
        const media = this.media.open(projectId, mediaId);
        if (!media) throw new UnuTvError("grid_media_not_found", `宫格素材不存在：${mediaId}`, 404);
        if (media.kind !== "image") throw new UnuTvError("grid_media_invalid", `宫格只接受图片素材：${mediaId}`, 409);
        inputArgs.push("-i", media.filePath);
      } else {
        inputArgs.push("-f", "lavfi", "-i", `color=c=#202124:s=${cellWidth}x${cellHeight}`);
      }
      filters.push(`[${index}:v]scale=${cellWidth}:${cellHeight}:force_original_aspect_ratio=increase,crop=${cellWidth}:${cellHeight},setsar=1[cell${index}]`);
      layout.push(`${index % cols * cellWidth}_${Math.floor(index / cols) * cellHeight}`);
    });
    filters.push(`${cells.map((_cell, index) => `[cell${index}]`).join("")}xstack=inputs=${cells.length}:layout=${layout.join("|")}:fill=#202124[out]`);

    const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "unutv-grid-compose-"));
    const outputPath = path.join(temporaryDirectory, "grid.png");
    try {
      await runFfmpeg(this.ffmpegPath, ["-hide_banner", "-loglevel", "error", "-y", ...inputArgs, "-filter_complex", filters.join(";"), "-map", "[out]", "-frames:v", "1", outputPath]);
      return { kind: "image", mimeType: "image/png", bytes: await readFile(outputPath), title: "grid.png", width: outputWidth, height: outputHeight };
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }
}
