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

/** Extension for a mime type; PNG because that is the conversion fallback. */
function extensionFor(mimeType?: string): string {
  const subtype = /^image\/([a-z0-9.+-]+)$/i.exec(mimeType?.trim() ?? "")?.[1];
  if (!subtype) return "png";
  // Keep the file name boring: jpeg -> jpg, svg+xml -> svg.
  const clean = subtype.split("+")[0].toLowerCase();
  if (clean === "jpeg") return "jpg";
  return /^[a-z0-9]+$/.test(clean) ? clean : "png";
}

/**
 * A unique Drive path for an uploaded attachment. Sibling of `newImagePath`,
 * with its own prefix so uploads and generated images stay tellable apart.
 */
export function newAttachmentPath(mimeType?: string): string {
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `freetalk-upload-${id}.${extensionFor(mimeType)}`;
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

// Stored images, keyed by path: one Blob cache, with object URLs derived from
// it. A failed read is evicted so a later render can retry it.
const imageBlobCache = new Map<string, Promise<Blob>>();
const imageUrlCache = new Map<string, Promise<string>>();

// Writes we started ourselves, keyed by path. Attachments upload in the
// background of a send, so a read issued while that upload is still in flight
// would 404 — and because a failed read sticks the tile on "unavailable" until
// it remounts, the image would stay missing even after the write succeeded.
const pendingWrites = new Map<string, Promise<boolean>>();

/** Resolves to the stored Blob for a Puter file (cached per path). */
export async function loadImageBlob(path: string): Promise<Blob> {
  // Wait out our own write before reading. A write that failed is reported as
  // such instead of issuing a read that cannot succeed.
  const inflight = pendingWrites.get(path);
  if (inflight && !(await inflight)) {
    throw new Error("The image could not be saved to storage.");
  }
  const cached = imageBlobCache.get(path);
  if (cached) return cached;
  const fs = window.puter?.fs;
  if (!fs?.read) throw new Error("Image storage is not available.");
  const pending = fs.read(path);
  imageBlobCache.set(path, pending);
  pending.catch(() => imageBlobCache.delete(path));
  return pending;
}

/** Resolves to a displayable blob: URL for a Puter file (cached per path). */
export function loadImageUrl(path: string): Promise<string> {
  const cached = imageUrlCache.get(path);
  if (cached) return cached;
  const pending = loadImageBlob(path).then((blob) => URL.createObjectURL(blob));
  imageUrlCache.set(path, pending);
  pending.catch(() => imageUrlCache.delete(path));
  return pending;
}

/**
 * Save an attachment to Drive so the conversation keeps a reference to it.
 *
 * Best-effort by design: this runs in the background of a send, and a Drive
 * failure must never lose the user's message. Resolves false when the file
 * could not be written — the caller says so, and `loadImageBlob` reports it
 * instead of leaving the panel to guess why a tile cannot resolve.
 *
 * The write registers itself synchronously, so a read that starts in the same
 * tick as the send still sees it as in flight rather than racing it.
 */
export function persistAttachment(blob: Blob, path: string): Promise<boolean> {
  const done = (async () => {
    try {
      const fs = window.puter?.fs;
      if (!fs?.write) return false;
      await fs.write(path, blob, { dedupeName: false, overwrite: true });
      return true;
    } catch {
      return false;
    }
  })();
  pendingWrites.set(path, done);
  // Once settled the entry is dead weight; a later read goes to Drive directly.
  void done.then(() => {
    if (pendingWrites.get(path) === done) pendingWrites.delete(path);
  });
  return done;
}
