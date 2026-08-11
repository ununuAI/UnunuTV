export const CINEMATIC_DELIVERY_ASPECT_RATIOS = Object.freeze(["9:16", "16:9", "1:1"]);

const PROFILE_BY_ASPECT_RATIO = Object.freeze({
  "9:16": Object.freeze({
    profileId: "vertical_short_drama",
    aspectRatio: "9:16",
    imageProviderResolution: "1024x1536",
    imageFrameResolution: "864x1536",
    imageFrameFit: "cover_center",
    videoResolution: "480p",
    deliveryWidth: 480,
    deliveryHeight: 854,
    frameRate: 24
  }),
  "16:9": Object.freeze({
    profileId: "horizontal_screen",
    aspectRatio: "16:9",
    imageProviderResolution: "1536x1024",
    imageFrameResolution: "1536x864",
    imageFrameFit: "cover_center",
    videoResolution: "480p",
    deliveryWidth: 854,
    deliveryHeight: 480,
    frameRate: 24
  }),
  "1:1": Object.freeze({
    profileId: "square_social",
    aspectRatio: "1:1",
    imageProviderResolution: "1024x1024",
    imageFrameResolution: "1024x1024",
    imageFrameFit: "cover_center",
    videoResolution: "480p",
    deliveryWidth: 480,
    deliveryHeight: 480,
    frameRate: 24
  })
});

export function defaultCinematicAspectRatio(projectType) {
  return projectType === "short_drama" ? "9:16" : "16:9";
}

export function resolveCinematicFormatProfile({ aspectRatio, projectType } = {}) {
  const resolvedAspectRatio = aspectRatio || defaultCinematicAspectRatio(projectType);
  const profile = PROFILE_BY_ASPECT_RATIO[resolvedAspectRatio];
  if (!profile) {
    throw Object.assign(
      new Error(`Unsupported cinematic delivery aspect ratio: ${resolvedAspectRatio}`),
      {
        code: "cinematic_format_profile_invalid",
        details: { allowed: CINEMATIC_DELIVERY_ASPECT_RATIOS, aspectRatio: resolvedAspectRatio },
        status: 409
      }
    );
  }
  return { ...profile };
}

export function validateCinematicFormatProfile(value) {
  const expected = PROFILE_BY_ASPECT_RATIO[value?.aspectRatio];
  const issues = [];
  if (!expected) return { ok: false, issues: [{ code: "invalid_enum", path: "formatProfile.aspectRatio", message: "Unsupported aspect ratio." }] };
  for (const field of ["profileId", "imageProviderResolution", "imageFrameResolution", "imageFrameFit", "videoResolution", "deliveryWidth", "deliveryHeight", "frameRate"]) {
    if (value?.[field] !== expected[field]) {
      issues.push({
        code: "format_profile_mismatch",
        path: `formatProfile.${field}`,
        message: `${field} must be ${expected[field]} for ${expected.aspectRatio}.`
      });
    }
  }
  return { ok: issues.length === 0, issues };
}
