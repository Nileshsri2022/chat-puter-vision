// Image generation via puter.ai.txt2img.
// Docs: https://docs.puter.com/AI/txt2img/ (read 2026-10-13).
//
// Each image is saved to the user's Puter storage through `puter_output_path`,
// so the chat keeps only a small file path instead of a temporary hosted URL or
// a large data URI. The file is read back with `puter.fs.read` when displayed.

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
 * A unique path relative to the app's writable Puter Drive folder. Writing
 * directly to `~/` is denied because that targets the user's home folder.
 */
export function newImagePath(): string {
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `freetalk-${id}.png`;
}

/**
 * Generate an image and save it to Puter storage.
 * Resolves to the Puter path of the saved file.
 */
export async function generateImage(prompt: string): Promise<string> {
  try {
    const puter = window.puter;
    if (!puter?.ai?.txt2img)
      throw new Error("Image generation is not available.");
    const path = newImagePath();
    const image = await puter.ai.txt2img(prompt, { puter_output_path: path });
    if (!image) throw new Error("Image generation returned no image.");
    return path;
  } catch (error) {
    throw friendlyImageError(error);
  }
}

// Object URLs for saved images, keyed by path. A failed read is evicted so a
// later render can retry it.
const imageUrlCache = new Map<string, Promise<string>>();

/** Resolves to a displayable blob: URL for a Puter file (cached per path). */
export function loadImageUrl(path: string): Promise<string> {
  const cached = imageUrlCache.get(path);
  if (cached) return cached;
  const fs = window.puter?.fs;
  if (!fs?.read) return Promise.reject(new Error("Image storage is not available."));
  const pending = fs.read(path).then((blob) => URL.createObjectURL(blob));
  imageUrlCache.set(path, pending);
  pending.catch(() => imageUrlCache.delete(path));
  return pending;
}
