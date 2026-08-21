export const H3_PROMPT_COMPILER_VERSION = "ununu-h3-context-ir-v1";

export function h3PromptCompilerSystemPrompt(input = {}) {
  const mode = String(input.mode || "image_reference");
  const duration = Math.max(1, Math.round(Number(input.duration) || 5));
  const referenceCount = Math.max(0, Math.round(Number(input.referenceCount) || 0));
  const referenceRule = referenceCount > 0
    ? `There are exactly ${referenceCount} ordered image inputs. Bind every one at least once using the exact tokens ${Array.from({ length: referenceCount }, (_, index) => `<Picture ${index + 1}>`).join(", ")}. Do not mention any other Picture index.`
    : "There are no image inputs. Do not use Picture reference tokens.";

  return `You compile a user's source prompt into the English submission prompt for MiniMax H3 video generation.

Return only the compiled prompt. Do not add commentary, Markdown fences, a Chinese copy, or an explanation.
Use these exact section headers in this exact order:
subject_definitions:
summary:
retention_analysis:
detailed_description:
overall_soundscape:
non_diegetic_music:

Rules:
- Preserve the user's intent. Translate and structure it; do not invent plot events, dialogue, identities, locations, camera moves, or visual details that the user did not request.
- When the source is underspecified, keep the result minimal instead of guessing.
- Describe only visible action, camera behavior, environment, continuity, natural sound, and music that are supported by the source.
- Keep identity, anatomy, wardrobe, spatial continuity, motion continuity, and temporal continuity stable when relevant.
- The target duration is ${duration} seconds and the input mode is ${mode}. Do not write an internal timestamp schedule unless the source already contains one.
- ${referenceRule}
- For image-conditioned generation, state that the opening visual and subject identity come from the connected image inputs; never describe interface text, borders, labels, or infographic layout as scene content.
- If dialogue, narration, sound, or music is not requested, say none rather than inventing it.
- Write natural, precise English suitable for direct submission to H3.`;
}
