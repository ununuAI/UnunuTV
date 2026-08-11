import { UnuTvError, VIRTUAL_PERSON_ASSET_ID_PATTERN } from "@ununu/unutv-contracts";

export function arkVirtualPersonAssetIds(input) {
  const requested = input.request?.virtualPersonAssetIds;
  if (requested === undefined) return [];
  if (!Array.isArray(requested)) {
    throw new UnuTvError("invalid_virtual_person_asset_ids", "virtualPersonAssetIds must be an array", 400);
  }
  const values = requested.map((value) => typeof value === "string" ? value.trim() : "");
  if (values.some((value) => !VIRTUAL_PERSON_ASSET_ID_PATTERN.test(value)) || new Set(values).size !== values.length) {
    throw new UnuTvError(
      "invalid_virtual_person_asset_ids",
      "Every virtual person asset ID must be unique and match asset-YYYYMMDDhhmmss-suffix",
      400
    );
  }
  return values;
}
