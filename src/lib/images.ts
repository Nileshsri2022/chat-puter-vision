// Image generation via puter.ai.txt2img.
// Docs: https://docs.puter.com/AI/txt2img/ (read 2026-10-13).
//
// Each image is saved to the user's Puter storage through `puter_output_path`,
// so the chat keeps only a small file path instead of a temporary hosted URL or
// a large data URI. The file is read back with `puter.fs.read` when displayed.
//
// The same call is also the *editing* call: `input_image` / `input_images`
// (docs read 2026-10-19) hand the model pixels to work from, which is what
// turns "remove the people from this image" into an edit instead of a
// brand-new picture. Without them the request is text-to-image, and an
// instruction that refers to "the image" is meaningless to the model.

import { blobToDataUrl, dataUrlMimeType } from "./dataUrl";

interface Txt2ImgErrorBody {
  message?: unknown;
  code?: unknown;
  errorCode?: unknown;
}

/** The error code an SDK rejection carries, when it carries one. */
function errorCodeOf(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const body = error as Txt2ImgErrorBody;
  const code = body.errorCode ?? body.code;
  return typeof code === "string" ? code : undefined;
}

function friendlyImageError(error: unknown): Error {
  const body =
    typeof error === "object" && error !== null
      ? (error as Txt2ImgErrorBody)
      : {};
  const code = errorCodeOf(error);
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
 * How one image-generation call is put together.
 */
export interface GenerateImageOptions {
  /**
   * The images the call edits, as data URIs. Empty (the default) means plain
   * text-to-image.
   */
  inputImages?: string[];
  /** Image model id, e.g. "gpt-image-2". */
  model?: string;
  /** Provider quality tier ("low" | "medium" | "high"). */
  quality?: string;
}

/**
 * The media type every input shares — set only when they all share one, since
 * a single value cannot describe mixed types.
 */
function commonMimeType(dataUrls: string[]): string | undefined {
  const types = dataUrls
    .map((url) => dataUrlMimeType(url))
    .filter((type): type is string => Boolean(type));
  if (types.length === 0) return undefined;
  const first = types[0];
  return types.every((type) => type === first) ? first : undefined;
}

/**
 * The exact option object handed to `puter.ai.txt2img`.
 *
 * Pure, so the wire form can be pinned by a test: one reference goes in as
 * `input_image` (the documented single-image shorthand) and several go in as
 * `input_images`. `input_image_mime_type` is a fallback for providers that
 * label the upload from the option rather than from the payload — Gemini
 * rejects a typeless upload.
 */
export function buildTxt2ImgOptions(
  outputPath: string,
  options: GenerateImageOptions = {}
): Record<string, unknown> {
  const opts: Record<string, unknown> = { puter_output_path: outputPath };
  if (options.model) opts.model = options.model;
  if (options.quality) opts.quality = options.quality;
  const inputs = (options.inputImages ?? []).filter(Boolean);
  if (inputs.length === 0) return opts;
  if (inputs.length === 1) {
    opts.input_image = inputs[0];
  } else {
    opts.input_images = inputs;
  }
  const mimeType = commonMimeType(inputs);
  if (mimeType) opts.input_image_mime_type = mimeType;
  return opts;
}

/**
 * Generate an image and save it to Puter storage.
 * Resolves to the Puter path of the saved file.
 *
 * With `inputImages` the call is an edit: the model receives those pixels and
 * the prompt describes the change. Without them it is a plain
 * text-to-image — the behaviour every caller had before.
 */
export async function generateImage(
  prompt: string,
  options: GenerateImageOptions = {}
): Promise<string> {
  const puter = window.puter;
  if (!puter?.ai?.txt2img)
    throw new Error("Image generation is not available.");
  const path = newImagePath();
  const inputs = options.inputImages ?? [];
  try {
    if (inputs.length > 1) {
      let image: unknown;
      try {
        image = await puter.ai.txt2img(prompt, buildTxt2ImgOptions(path, options));
      } catch (error) {
        // Some routes take a single reference and reject a list with a plain
        // bad_request (Cloudflare FLUX.2 does). Retry with the first image so
        // a multi-attachment turn still edits something instead of failing.
        // bad_request is raised before any credit is checked, so the retry is
        // free.
        if (errorCodeOf(error) !== "bad_request") throw error;
        image = await puter.ai.txt2img(
          prompt,
          buildTxt2ImgOptions(path, { ...options, inputImages: inputs.slice(0, 1) })
        );
      }
      if (!image) throw new Error("Image generation returned no image.");
    } else {
      const image = await puter.ai.txt2img(prompt, buildTxt2ImgOptions(path, options));
      if (!image) throw new Error("Image generation returned no image.");
    }
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
 * Resolves to a stored image encoded as a data URI.
 *
 * This is the form `input_image` wants: the same `data:<mime>;base64,…`
 * shape the chat path sends, which every provider route accepts. The blob
 * comes from the shared per-path cache, so an image already on screen costs
 * one read in total.
 */
export async function loadImageDataUrl(path: string): Promise<string> {
  const blob = await loadImageBlob(path);
  return blobToDataUrl(blob);
}

/**
 * Delete a stored image and forget its cached blob.
 *
 * Best-effort and feature-detected: an SDK without `fs.delete` is a no-op, and
 * a failed delete must never break the user action that asked for it. The cache
 * entries are dropped without revoking the object URL, so a tile that is still
 * mounted keeps showing the image it already resolved.
 */
export async function deleteImage(path: string): Promise<boolean> {
  imageBlobCache.delete(path);
  imageUrlCache.delete(path);
  try {
    const fs = window.puter?.fs;
    if (!fs?.delete) return false;
    await fs.delete(path);
    return true;
  } catch {
    return false;
  }
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
