const EXTENSION_BY_MIME = Object.freeze({
  "image/avif": ".avif",
  "image/gif": ".gif",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp"
});

export function mediaDownloadFileName(title, mimeType) {
  const base = String(title || "下载图片")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/[. ]+$/g, "") || "下载图片";
  const extension = EXTENSION_BY_MIME[String(mimeType || "").split(";", 1)[0].toLowerCase()] || ".png";
  return /\.(?:avif|gif|jpe?g|png|webp)$/i.test(base) ? base : `${base}${extension}`;
}
