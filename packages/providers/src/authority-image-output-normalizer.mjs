function parseRaster(value) {
  const match = String(value || "").match(/^(\d+)x(\d+)$/u);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  return width > 0 && height > 0 ? { width, height } : null;
}

function outputFormat(sharpImage, mimeType) {
  if (mimeType === "image/jpeg") return sharpImage.jpeg({ quality: 95 });
  if (mimeType === "image/webp") return sharpImage.webp({ quality: 95 });
  return sharpImage.png();
}

export async function normalizeAuthorityImageOutput({
  artifact,
  authorityType,
  requestedSize
} = {}) {
  const expected = parseRaster(requestedSize);
  if (!expected || !artifact?.bytes || !authorityType) return { artifact, receipt: null };
  const sharp = (await import("sharp")).default;
  const source = sharp(artifact.bytes, { failOn: "error" });
  const metadata = await source.metadata();
  const actual = { width: Number(metadata.width), height: Number(metadata.height) };
  if (actual.width === expected.width && actual.height === expected.height) {
    return {
      artifact,
      receipt: { actual, expected, fit: "none", normalized: false, policy: "authority_fixed_1k_v1" }
    };
  }
  if (authorityType === "scene") {
    const actualAspect = actual.width / actual.height;
    const expectedAspect = expected.width / expected.height;
    const sameOrientation = Math.sign(actual.width - actual.height) === Math.sign(expected.width - expected.height);
    const aspectDrift = Math.abs(actualAspect - expectedAspect) / expectedAspect;
    if (sameOrientation && aspectDrift <= 0.01) {
      const transformed = source.resize({
        ...expected,
        fit: "fill"
      });
      return {
        artifact: { ...artifact, bytes: await outputFormat(transformed, artifact.mimeType).toBuffer() },
        receipt: {
          actual,
          expected,
          fit: "composition_preserving_resample",
          normalized: true,
          policy: "authority_scene_composition_raster_v1"
        }
      };
    }
    return {
      artifact,
      receipt: { actual, expected, fit: "rejected", normalized: false, policy: "authority_fixed_1k_v1" }
    };
  }
  const fit = "contain";
  const transformed = source.resize({
    ...expected,
    fit,
    position: "centre",
    background: { r: 210, g: 210, b: 206, alpha: 1 }
  });
  return {
    artifact: { ...artifact, bytes: await outputFormat(transformed, artifact.mimeType).toBuffer() },
    receipt: { actual, expected, fit, normalized: true, policy: "authority_fixed_1k_v1" }
  };
}
