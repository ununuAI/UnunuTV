import { UnuTvError, assertMediaPreparationV1, createId, nowIso, optionalText, requireEnum, requireNumber, requireText } from "@ununu/unutv-contracts";
import { inferMediaKind } from "../media-policy.mjs";

export function createMediaUseCases(ports) {
  async function importMedia(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const filePath = requireText(input.filePath, "filePath");
    return ports.media.importFile({
      projectId,
      nodeId: input.nodeId ? requireText(input.nodeId, "nodeId") : null,
      filePath,
      kind: inferMediaKind(filePath, input.kind),
      generated: Boolean(input.generated),
      title: optionalText(input.title, "")
    });
  }

  async function importDataMedia(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    return ports.media.importDataUrl({
      projectId,
      nodeId: input.nodeId ? requireText(input.nodeId, "nodeId") : null,
      dataUrl: requireText(input.dataUrl, "dataUrl"),
      kind: requireEnum(input.kind, ["image", "video", "audio"], "kind"),
      title: optionalText(input.title, "")
    });
  }

  async function publishMedia(input = {}) {
    return ports.publisher.publish({
      projectId: requireText(input.projectId, "projectId"),
      mediaId: requireText(input.mediaId, "mediaId"),
      provider: optionalText(input.provider, "ark"),
      expiresInSeconds: requireNumber(input.expiresInSeconds, "expiresInSeconds", 86400)
    });
  }

  async function extractMediaFrame(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const mediaId = requireText(input.mediaId, "mediaId");
    const seconds = requireNumber(input.seconds, "seconds");
    if (seconds < 0) throw new UnuTvError("invalid_frame_time", "seconds must be greater than or equal to 0", 400);
    const source = await ports.projects.getMedia(projectId, mediaId);
    if (!source) throw new UnuTvError("media_not_found", `Media not found: ${mediaId}`, 404);
    if (source.kind !== "video") throw new UnuTvError("video_media_required", "Frame extraction requires video media", 400);
    return ports.media.extractFrame({
      projectId,
      mediaId,
      seconds,
      nodeId: input.nodeId ? requireText(input.nodeId, "nodeId") : null,
      title: optionalText(input.title, "")
    });
  }

  async function getMediaPreparation(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const mediaId = requireText(input.mediaId, "mediaId");
    const preparation = await ports.projects.getMediaPreparation(projectId, mediaId);
    if (!preparation) throw new UnuTvError("media_preparation_not_found", `Media preparation not found: ${mediaId}`, 404);
    return assertMediaPreparationV1(preparation);
  }

  async function prepareMedia(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const mediaId = requireText(input.mediaId, "mediaId");
    const media = await ports.projects.getMedia(projectId, mediaId);
    if (!media) throw new UnuTvError("media_not_found", `Media not found: ${mediaId}`, 404);
    const existing = await ports.projects.getMediaPreparation(projectId, mediaId);
    if (input.force !== true && existing?.status === "succeeded" && existing.sourceChecksum === media.sha256) return assertMediaPreparationV1(existing);
    const timestamp = nowIso();
    const pending = assertMediaPreparationV1({
      version: "media_preparation_v1", id: existing?.id ?? createId("media-preparation"), projectId, mediaId, sourceChecksum: media.sha256,
      status: "pending", probe: null, waveform: null, thumbnailRelativePath: null, proxyRelativePath: null, error: null,
      createdAt: existing?.createdAt ?? timestamp, updatedAt: timestamp
    });
    await ports.projects.saveMediaPreparation(projectId, pending);
    try {
      const artifacts = await ports.media.prepare({ projectId, mediaId });
      const succeeded = assertMediaPreparationV1({ ...pending, ...artifacts, status: "succeeded", error: null, updatedAt: nowIso() });
      return ports.projects.saveMediaPreparation(projectId, succeeded);
    } catch (error) {
      await ports.projects.saveMediaPreparation(projectId, assertMediaPreparationV1({ ...pending, status: "failed", error: { code: error?.code ?? "media_preparation_failed", message: error?.message ?? String(error) }, updatedAt: nowIso() }));
      throw error;
    }
  }

  return { extractMediaFrame, getMediaPreparation, importDataMedia, importMedia, prepareMedia, publishMedia };
}
