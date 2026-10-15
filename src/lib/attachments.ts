// Image attachments for vision models.
//
// The wire form for an attached image is the one the Puter SDK itself builds
// for a `File` media argument: a `data:<mime>;base64,<payload>` URL inside an
// `image_url` content block. The backend canonicalises that block and each
// provider translates it from there (OpenAI passes the data URI through,
// Anthropic splits it into a `base64` source, Moonshot has it inlined).
//
// Bare base64 is *not* accepted anywhere on that path — the URL is handed to
// the provider as-is, so a payload without a `data:` prefix fails as an
// unloadable URL. Every attachment therefore leaves the browser as a data URL,
// re-encoded first when it is a container providers reject or is simply too
// large to send.

import { blobToDataUrl, dataUrlByteLength } from "./dataUrl";
import {
  MAX_IMAGE_BYTES,
  convertImageToPNG,
  downscaleImage,
  isSupportedImageFormat,
} from "./utils/imageConversion";

/** How many images one message may carry (the composer's own limit). */
export const MAX_ATTACHMENTS = 4;

/** What a re-encoded attachment aims for, before quality is traded away. */
export const TARGET_IMAGE_BYTES = 1_200_000;

export interface PreparedAttachment {
  /** The file that was sent (converted/shrunk when the input needed it). */
  file: File;
  /** Exactly what goes in the `image_url` block. */
  dataUrl: string;
  /** Decoded size of the image, in bytes. */
  bytes: number;
  mimeType: string;
}

/** Convert (when needed) and shrink one attachment so it is safe to send. */
export async function normalizeAttachmentFile(file: File): Promise<File> {
  const converted = isSupportedImageFormat(file.type)
    ? file
    : await convertImageToPNG(file);
  return await downscaleImage(converted, { maxBytes: TARGET_IMAGE_BYTES });
}

/**
 * Prepare the images attached to a message, in the order they were attached.
 * Throws with a user-facing message when one of them cannot be sent.
 */
export async function prepareImageAttachments(
  files: File[]
): Promise<PreparedAttachment[]> {
  const prepared: PreparedAttachment[] = [];
  for (const file of files.slice(0, MAX_ATTACHMENTS)) {
    const normalized = await normalizeAttachmentFile(file);
    const dataUrl = await blobToDataUrl(normalized);
    const bytes = dataUrlByteLength(dataUrl);
    if (bytes > MAX_IMAGE_BYTES) {
      throw new Error(
        `${file.name || "That image"} is too large to attach (${formatBytes(
          bytes
        )} after resizing).`
      );
    }
    prepared.push({
      file: normalized,
      dataUrl,
      bytes,
      mimeType: normalized.type || "image/png",
    });
  }
  return prepared;
}

/**
 * Note appended to a user message when images were attached. Messages keep no
 * image data, so the conversation records what was sent instead — and the
 * note has to come off again before a retry or an edit resends the text.
 */
const IMAGE_MARKER_RE = /(?:\n\n|^)\[Images: \d+ attached\]$/;

/** `text` plus the attachment note, e.g. `Ask\n\n[Images: 2 attached]`. */
export function appendImageMarker(text: string, count: number): string {
  if (count <= 0) return text;
  return `${text}${text ? "\n\n" : ""}[Images: ${count} attached]`;
}

/** True when a message carries the attachment note. */
export function hasImageMarker(text: string): boolean {
  return IMAGE_MARKER_RE.test(text);
}

/**
 * How many images the note claims, or 0 when there is none. Lets callers tell
 * an attachment that was persisted (refs on the message) from one that only
 * left this marker behind — the marker is the sole record of the latter.
 */
export function imageMarkerCount(text: string): number {
  const match = /(?:\n\n|^)\[Images: (\d+) attached\]$/.exec(text);
  return match ? Number.parseInt(match[1], 10) || 0 : 0;
}

/** The message text without the attachment note. */
export function stripImageMarker(text: string): string {
  return text.replace(IMAGE_MARKER_RE, "");
}

/** Megabyte-ish display for error messages. */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}
