import { UnuTvError } from "@ununu/unutv-contracts";

const DEFAULT_TIMEOUT_MS = 1_800_000;
const MINIMUM_TIMEOUT_MS = 300_000;

export function ununuImageTimeoutMs(config) {
  const configured = Number(config.timeoutMs);
  return Number.isFinite(configured) && configured >= MINIMUM_TIMEOUT_MS
    ? configured
    : DEFAULT_TIMEOUT_MS;
}

export async function fetchUnunuImage(fetchImpl, url, options, { requestId, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.code === "paid_submission_outcome_unknown") throw error;
    const timedOut = controller.signal.aborted;
    throw new UnuTvError(
      "paid_submission_outcome_unknown",
      timedOut
        ? `Ununu Image did not return within ${Math.round(timeoutMs / 60_000)} minutes; trace request ${requestId} before retrying`
        : `Ununu Image response was not received; trace request ${requestId} before retrying`,
      502,
      { requestId, cause: timedOut ? "provider_timeout" : error?.message ?? String(error), timeoutMs }
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function readUnunuImageResponse(response, requestId) {
  const responseRequestId = response.headers.get("x-request-id") || requestId;
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new UnuTvError(
      "paid_submission_outcome_unknown",
      `Ununu Image returned an incomplete response; trace request ${responseRequestId} before retrying`,
      502,
      { requestId: responseRequestId, httpStatus: response.status, responseBytes: Buffer.byteLength(text) }
    );
  }
  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || `Ununu Image generation failed (HTTP ${response.status})`;
    if (response.status >= 500) {
      throw new UnuTvError(
        "paid_submission_outcome_unknown",
        `${message}; trace request ${responseRequestId} before retrying`,
        502,
        { requestId: responseRequestId, httpStatus: response.status }
      );
    }
    throw new UnuTvError("provider_request_failed", message, 502, { requestId: responseRequestId, httpStatus: response.status });
  }
  return { payload, responseRequestId };
}
