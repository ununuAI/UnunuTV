import {
  compileImageGenerationPrompt,
  resolveImageGenerationTemplateIdForNode
} from "@ununu/unutv-contracts";

export function compileNodeGenerationRequest(node, requested) {
  if (node.kind !== "image") return requested;
  return {
    ...requested,
    prompt: compileImageGenerationPrompt(
      requested.prompt ?? node.payload?.prompt,
      resolveImageGenerationTemplateIdForNode(node)
    )
  };
}
