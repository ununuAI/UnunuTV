import path from "node:path";
import { MEDIA_KINDS, UnuTvError, requireEnum } from "@ununu/unutv-contracts";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".m4v", ".webm"]);
const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".m4a", ".aac", ".flac"]);
const WORLD_EXTENSIONS = new Set([".spz", ".ply", ".splat", ".ksplat", ".sog", ".rad"]);

export function inferMediaKind(filePath, explicitKind) {
  if (explicitKind) return requireEnum(explicitKind, MEDIA_KINDS, "kind");
  const extension = path.extname(filePath).toLowerCase();
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  if (VIDEO_EXTENSIONS.has(extension)) return "video";
  if (AUDIO_EXTENSIONS.has(extension)) return "audio";
  if (WORLD_EXTENSIONS.has(extension)) return "world";
  throw new UnuTvError("unsupported_media", `Unsupported media extension: ${extension || "none"}`);
}

export function mediaDirectoryForKind(kind, generated = false) {
  void generated;
  return kind === "image" ? "Images" : kind === "video" ? "Videos" : kind === "world" ? "Worlds" : "Audio";
}
