export const MEDIA_IMAGE_RETRY_LIMIT = 4;

export function mediaImageRetryUrl(source, attempt = 0) {
  const value = typeof source === "string" ? source : "";
  if (!value || !Number.isInteger(attempt) || attempt <= 0) return value;
  return `${value}${value.includes("?") ? "&" : "?"}unutv_media_retry=${attempt}`;
}

export function mediaImageRetryDelay(attempt = 0) {
  return Math.min(4_000, 500 * (Math.max(0, Number(attempt) || 0) + 1));
}
