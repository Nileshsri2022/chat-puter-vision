// Canvas-based image preparation for vision models.
//
// Two jobs live here: converting containers the providers reject (HEIC, AVIF,
// BMP, TIFF, SVG…) to PNG, and shrinking images that are bigger than a request
// should carry. Both use the Canvas API, so every helper degrades to "return
// the input unchanged" when it cannot run (no document, undecodable file).

/** Containers every vision provider accepts. */
export const VISION_IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
];

/** The long edge an attachment is shrunk to, in pixels (OpenAI's vision max). */
export const MAX_IMAGE_EDGE = 1568;

/** The largest an attachment may be once prepared, in bytes. */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

/** True for the containers providers decode without conversion. */
export function isSupportedImageFormat(type: string): boolean {
  return VISION_IMAGE_TYPES.includes((type || "").toLowerCase());
}

/** True when a file has to be re-encoded before it can be attached. */
export function needsConversion(type: string): boolean {
  return !isSupportedImageFormat(type);
}

interface ImageSource {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

async function loadImageSource(file: Blob): Promise<ImageSource | null> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      };
    } catch {
      // Fall through to the <img> decoder.
    }
  }
  if (typeof document === "undefined" || typeof URL === "undefined") return null;
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Could not decode the image."));
      element.src = url;
    });
    return {
      source: image,
      width: image.naturalWidth || image.width,
      height: image.naturalHeight || image.height,
      release: () => URL.revokeObjectURL(url),
    };
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), type, quality);
    } catch {
      resolve(null);
    }
  });
}

/** Rename a file for a new container, keeping its stem. */
export function renameForType(name: string, type: string): string {
  const extension =
    type === "image/jpeg"
      ? "jpg"
      : (type.split("/")[1] ?? "png").split("+")[0].replace(/^x-/, "");
  return `${(name || "image").replace(/\.[^./\\]*$/, "")}.${extension}`;
}

/** Re-encode an image file to PNG (used for containers providers reject). */
export async function convertImageToPNG(file: File): Promise<File> {
  if (isSupportedImageFormat(file.type)) return file;

  const loaded = await loadImageSource(file);
  if (!loaded) {
    throw new Error(
      `Could not read ${file.name || "the image"} (${file.type || "unknown type"}).`
    );
  }
  try {
    const canvas = document.createElement("canvas");
    canvas.width = loaded.width;
    canvas.height = loaded.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Failed to get canvas context");
    ctx.drawImage(loaded.source, 0, 0);

    const blob = await canvasToBlob(canvas, "image/png", 0.95);
    if (!blob) throw new Error("Failed to convert image to PNG");
    return new File([blob], renameForType(file.name, "image/png"), {
      type: "image/png",
      lastModified: Date.now(),
    });
  } catch (error) {
    throw new Error(
      `Failed to convert ${file.type || "the image"} to PNG: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

/** Convert multiple images to PNG format, preserving order. */
export async function convertImagesToPNG(files: File[]): Promise<File[]> {
  const converted: File[] = [];
  for (const file of files) converted.push(await convertImageToPNG(file));
  return converted;
}

export interface DownscaleOptions {
  /** Longest edge allowed, in pixels. */
  maxEdge?: number;
  /** Largest the result may be, in bytes. */
  maxBytes?: number;
}

/**
 * Shrink an image so a request stays a sensible size: the long edge is capped
 * at `maxEdge` and the encoded file at `maxBytes` (PNG first when the source
 * may have transparency, then JPEG at falling quality).
 *
 * Returns the original file when it is already small enough, or when the
 * browser cannot decode/canvas it.
 */
export async function downscaleImage(
  file: File,
  { maxEdge = MAX_IMAGE_EDGE, maxBytes = MAX_IMAGE_BYTES }: DownscaleOptions = {}
): Promise<File> {
  if (typeof document === "undefined") return file;
  const loaded = await loadImageSource(file);
  if (!loaded) return file;

  try {
    const longestEdge = Math.max(loaded.width, loaded.height);
    const scale = longestEdge > 0 ? Math.min(1, maxEdge / longestEdge) : 1;
    if (scale === 1 && file.size <= maxBytes) return file;

    const width = Math.max(1, Math.round(loaded.width * scale));
    const height = Math.max(1, Math.round(loaded.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(loaded.source, 0, 0, width, height);

    // PNG/GIF may carry transparency; everything else re-encodes as JPEG.
    const preferred =
      file.type === "image/png" || file.type === "image/gif"
        ? "image/png"
        : "image/jpeg";
    const attempts: Array<[string, number]> = [
      [preferred, 0.9],
      ["image/jpeg", 0.8],
      ["image/jpeg", 0.6],
    ];

    let best: Blob | null = null;
    for (const [type, quality] of attempts) {
      const blob = await canvasToBlob(canvas, type, quality);
      if (!blob) continue;
      best = blob;
      if (blob.size <= maxBytes) break;
    }
    // The last attempt is returned even when it is still over budget: the
    // attachment layer re-checks the hard cap and reports what it cannot send.
    return best ? toFile(best, file) : file;
  } finally {
    loaded.release();
  }
}

function toFile(blob: Blob, original: File): File {
  return new File([blob], renameForType(original.name, blob.type), {
    type: blob.type,
    lastModified: Date.now(),
  });
}
