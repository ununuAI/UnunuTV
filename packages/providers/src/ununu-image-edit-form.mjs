import { readFile } from "node:fs/promises";
import { UnuTvError } from "@ununu/unutv-contracts";

const SUPPORTED_REFERENCE_MIME_TYPES = Object.freeze(new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"]
]));

export async function buildUnunuImageEditForm(input, requestPayload, referenceIds) {
  if (referenceIds.length > 5) {
    throw new UnuTvError(
      "too_many_image_references",
      "GPT Image 2 accepts at most 5 reference images",
      400
    );
  }
  const form = new FormData();
  form.append("model", requestPayload.model);
  form.append("prompt", requestPayload.prompt);
  form.append("background", requestPayload.background);
  form.append("size", requestPayload.size);
  form.append("quality", requestPayload.quality);
  form.append("n", "1");
  form.append("response_format", requestPayload.response_format);
  form.append("output_format", requestPayload.output_format);
  for (const [index, mediaId] of referenceIds.entries()) {
    const media = input.media.open(input.projectId, mediaId);
    if (!media) {
      throw new UnuTvError("media_not_found", `Reference media not found: ${mediaId}`, 404);
    }
    const extension = SUPPORTED_REFERENCE_MIME_TYPES.get(media.mimeType);
    if (!extension) {
      throw new UnuTvError(
        "image_reference_transport_format_required",
        `GPT Image 2 references must be raster PNG, JPEG or WebP before Provider submission: ${mediaId}`,
        409,
        {
          mediaId,
          mimeType: media.mimeType ?? null,
          sourceNodeId: media.nodeId ?? null,
          supportedMimeTypes: [...SUPPORTED_REFERENCE_MIME_TYPES.keys()]
        }
      );
    }
    const bytes = await readFile(media.filePath);
    form.append(
      "image",
      new Blob([bytes], { type: media.mimeType }),
      `image_${index + 1}.${extension}`
    );
  }
  return form;
}
