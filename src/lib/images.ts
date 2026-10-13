// Image generation via puter.ai.txt2img.
// Docs: https://docs.puter.com/AI/txt2img/ (read 2026-10-13).
//
// Resolves to one HTMLImageElement in browsers; `image.src` is the image URL
// or data URI. Hosted URLs are temporary — the src is persisted as-is, so a
// data URI survives but a hosted URL may expire.

interface Txt2ImgErrorBody {
  message?: unknown;
  code?: unknown;
  errorCode?: unknown;
}

function friendlyImageError(error: unknown): Error {
  const body =
    typeof error === "object" && error !== null
      ? (error as Txt2ImgErrorBody)
      : {};
  const code = body.errorCode ?? body.code;
  const message = typeof body.message === "string" ? body.message : "";
  if (code === "prompt_required")
    return new Error("Please describe the image first.");
  if (code === "moderation_flagged")
    return new Error(
      "That prompt was refused by the image filter. Try different wording."
    );
  if (code === "upstream_failed")
    return new Error(
      "Image generation failed on the provider side. Please try again."
    );
  if (code === "insufficient_funds")
    return new Error("Monthly credit exhausted.");
  if (code === "bad_request")
    return new Error(message || "The image request was rejected.");
  return new Error(message || "Image generation failed.");
}

/**
 * Generate an image from a text prompt.
 * Resolves to the image src (URL or data URI). Uses the default provider.
 */
export async function generateImage(prompt: string): Promise<string> {
  try {
    const puter = window.puter;
    if (!puter?.ai?.txt2img)
      throw new Error("Image generation is not available.");
    const image = await puter.ai.txt2img(prompt);
    if (!image || typeof image.src !== "string" || !image.src) {
      throw new Error("Image generation returned no image.");
    }
    return image.src;
  } catch (error) {
    throw friendlyImageError(error);
  }
}
