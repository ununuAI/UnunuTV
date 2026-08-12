import { UnuTvError } from "@ununu/unutv-contracts";

/** 把 Provider 的非 2xx 响应读成统一的错误,body 解析失败时退回状态码。 */
export async function responseError(response, fallback) {
  const payload = await response.json().catch(() => ({}));
  return new UnuTvError("provider_request_failed", payload?.error?.message || payload?.message || `${fallback} (HTTP ${response.status})`, 502);
}
