export function resolveWorkbenchMediaUrl(url?: string) {
  if (!url) return undefined;
  return url.startsWith("/") || /^https?:\/\//i.test(url) ? url : `/${url}`;
}
