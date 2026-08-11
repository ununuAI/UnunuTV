import { UnuTvError } from "@ununu/unutv-contracts";

function parseResolution(value, path) {
  const match = /^(\d+)x(\d+)$/u.exec(String(value ?? ""));
  if (!match) {
    throw new UnuTvError(
      "cinematic_image_frame_resolution_invalid",
      `${path} must be WIDTHxHEIGHT.`,
      409,
      { path, value }
    );
  }
  return { width: Number(match[1]), height: Number(match[2]) };
}

export async function normalizeStoryboardImageFrame({
  deliveryResolution,
  frameFit,
  frameResolution,
  media,
  nodeId,
  ports,
  projectId
}) {
  if (!frameResolution) return media;
  if (frameFit !== "cover_center") {
    throw new UnuTvError(
      "cinematic_image_frame_fit_invalid",
      "Storyboard image normalization requires the canonical cover_center fit.",
      409,
      { frameFit }
    );
  }
  const source = await ports.media.open(projectId, media.id);
  if (!source?.filePath) {
    throw new UnuTvError(
      "cinematic_image_source_media_required",
      "Generated storyboard image is unavailable for deterministic frame normalization.",
      409,
      { mediaId: media.id }
    );
  }
  const target = parseResolution(frameResolution, "imageFrameResolution");
  const sharp = (await import("sharp")).default;
  const metadata = await sharp(source.filePath).metadata();
  if (!(metadata.width > 0) || !(metadata.height > 0)) {
    throw new UnuTvError(
      "cinematic_image_source_dimensions_required",
      "Generated storyboard image dimensions are unavailable.",
      409,
      { mediaId: media.id }
    );
  }
  const actual = { width: metadata.width, height: metadata.height };
  const orientationMismatch = (actual.width > actual.height) !== (target.width > target.height);
  const targetAspect = target.width / target.height;
  const crop = actual.width / actual.height > targetAspect
    ? { width: Math.floor(actual.height * targetAspect), height: actual.height }
    : { width: actual.width, height: Math.floor(actual.width / targetAspect) };
  const delivery = deliveryResolution
    ? parseResolution(deliveryResolution, "deliveryResolution")
    : null;
  const deliverySafeOrientationRecovery = Boolean(
    orientationMismatch
    && delivery
    && crop.width >= delivery.width
    && crop.height >= delivery.height
  );
  if ((actual.width < target.width || actual.height < target.height) && !deliverySafeOrientationRecovery) {
    throw new UnuTvError(
      "cinematic_image_frame_upscale_forbidden",
      "Generated storyboard image is smaller than the locked project frame; upscaling is forbidden.",
      409,
      { actual, expected: target, mediaId: media.id }
    );
  }
  if (actual.width === target.width && actual.height === target.height) return media;
  const recoveryCrop = deliverySafeOrientationRecovery ? {
    left: Math.floor((actual.width - crop.width) / 2),
    top: Math.floor((actual.height - crop.height) / 2),
    width: crop.width,
    height: crop.height
  } : null;
  let transformed = sharp(source.filePath);
  if (recoveryCrop) transformed = transformed.extract(recoveryCrop);
  const bytes = await transformed
    .resize({ ...target, fit: "cover", position: "centre", withoutEnlargement: !deliverySafeOrientationRecovery })
    .png()
    .toBuffer();
  const normalized = await ports.media.importBytes({
    projectId,
    nodeId,
    kind: "image",
    mimeType: "image/png",
    bytes,
    generated: true,
    makeCurrent: false,
    title: `${source.title || "故事板关键帧"} · ${target.width}×${target.height} 项目画幅`
  });
  return {
    ...normalized,
    sourceProviderMediaId: media.id,
    frameNormalization: {
      fit: frameFit,
      sourceWidth: actual.width,
      sourceHeight: actual.height,
      targetWidth: target.width,
      targetHeight: target.height,
      recoveryMode: deliverySafeOrientationRecovery
        ? "orientation_mismatch_center_crop_delivery_safe"
        : "standard_cover_center",
      recoveryCrop,
      deliveryResolution: deliverySafeOrientationRecovery ? delivery : null,
      workingFrameUpscaled: deliverySafeOrientationRecovery
    }
  };
}
