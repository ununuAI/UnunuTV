export const VIRTUAL_PERSON_ASSET_ID_PATTERN = /^asset-\d{14}-[a-z0-9]+$/;
export const CINEMATIC_RESERVED_PROVIDER_OPTION_KEYS = Object.freeze([
  "approvedPaid", "prompt", "provider", "model", "mode", "duration", "aspectRatio",
  "resolution", "count", "generateAudio", "firstFrameMediaId", "lastFrameMediaId",
  "referenceMediaIds", "virtualPersonAssetIds"
]);

function issue(path, message, code) {
  return { code, message, path };
}

export function validateVirtualPersonAssetIds(value, path = "virtualPersonAssetIds") {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    return [issue(path, `${path} must be an array`, "invalid_type")];
  }
  const issues = [];
  const seen = new Set();
  value.forEach((assetId, index) => {
    if (typeof assetId !== "string" || !VIRTUAL_PERSON_ASSET_ID_PATTERN.test(assetId)) {
      issues.push(issue(`${path}[${index}]`, "virtual person asset ID must match asset-YYYYMMDDhhmmss-suffix", "invalid_virtual_person_asset_id"));
    } else if (seen.has(assetId)) {
      issues.push(issue(`${path}[${index}]`, "virtual person asset IDs must be unique", "duplicate_virtual_person_asset_id"));
    }
    seen.add(assetId);
  });
  return issues;
}
