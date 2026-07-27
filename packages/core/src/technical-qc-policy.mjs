import { assertTechnicalQcReport, createId, nowIso } from "@ununu/unutv-contracts";

function rate(value) {
  if (typeof value === "number") return value;
  const [left, right = "1"] = String(value || "0").split("/").map(Number);
  return right ? left / right : 0;
}

function check(id, label, status, expected, actual) {
  return { id, label, status, expected, actual };
}

export function buildTechnicalQcReport({ graph, mediaId, probe, projectId, renderJobId }) {
  const streams = Array.isArray(probe.streams) ? probe.streams : [];
  const video = streams.find((stream) => stream.codec_type === "video");
  const audio = streams.find((stream) => stream.codec_type === "audio");
  const actualDurationMs = Math.round(Number(probe.format?.duration || video?.duration || 0) * 1000);
  const actualRate = rate(video?.avg_frame_rate || video?.r_frame_rate);
  const toleranceMs = Math.max(100, Math.ceil(2000 / Math.max(1, graph.frameRate)));
  const checks = graph.audioOnly ? [
    check("audio_stream", "音频流", audio ? "pass" : "fail", "present", audio?.codec_name || "missing"),
    check("sample_rate", "采样率", Number(audio?.sample_rate) === 48000 ? "pass" : "warning", 48000, Number(audio?.sample_rate || 0)),
    check("duration", "时长", Math.abs(actualDurationMs - graph.durationMs) <= 100 ? "pass" : "fail", graph.durationMs, actualDurationMs)
  ] : [
    check("video_stream", "视频流", video ? "pass" : "fail", "present", video?.codec_name || "missing"),
    check("frame_size", "画面尺寸", video?.width === graph.width && video?.height === graph.height ? "pass" : "fail", `${graph.width}x${graph.height}`, video ? `${video.width}x${video.height}` : "missing"),
    check("frame_rate", "帧率", Math.abs(actualRate - graph.frameRate) <= .02 ? "pass" : "fail", graph.frameRate, actualRate),
    check("duration", "时长", Math.abs(actualDurationMs - graph.durationMs) <= toleranceMs ? "pass" : "fail", graph.durationMs, actualDurationMs),
    check("audio_stream", "音频流", audio ? "pass" : "warning", "present when mixed", audio?.codec_name || "not mixed")
  ];
  const status = checks.some((item) => item.status === "fail") ? "fail" : checks.some((item) => item.status === "warning") ? "warning" : "pass";
  return assertTechnicalQcReport({ id: createId("technical-qc"), projectId, renderJobId, mediaId, status, checks, probe, createdAt: nowIso() });
}
