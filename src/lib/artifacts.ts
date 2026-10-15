// The image index behind the artifacts panel.
//
// Images reach a conversation three ways, and only two of them used to be
// stored: a generated image keeps its Drive path on the message (`imagePath`),
// an attachment now keeps a Drive ref (`attachments`, see lib/images.ts), and
// builds before Drive persistence left a bare `image` src. This module turns a
// transcript into the flat, ordered list the panel renders.
//
// Everything here is pure and derived per render. Messages are keyed by array
// index and deletion splices the array, so a stored index would go stale —
// deriving the list from the transcript makes that impossible.

import type { Message } from "./backend";
import { hasImageMarker, imageMarkerCount } from "./attachments";

/** Kind of artifact, discriminating between different types. */
export type ArtifactKind = "image" | "code" | "table" | "ocr" | "export";

/** Human label per kind, used when there is no file name. */
export const KIND_LABEL: Record<ArtifactKind, string> = {
  image: "Image",
  code: "Code",
  table: "Table",
  ocr: "OCR Text",
  export: "Export",
};

/** Base name of a Drive path, for downloads without a recorded file name. */
export function basenameOf(path: string): string {
  const tail = path.split("/").pop() ?? path;
  return tail || "artifact";
}

/** An artifact represents any piece of content that can be displayed or
 * interacted with in the artifacts panel — images, code blocks, tables,
 * OCR-extracted text, and exports.
 */
export interface Artifact {
  /** Stable within one derivation: `${messageIndex}:${kind}:${n}`. */
  id: string;
  kind: ArtifactKind;
  /** Transcript position — the value `data-message-index` carries. */
  messageIndex: number;
  role: "user" | "assistant";
  /** Kind-specific data. */
  data: ArtifactData;
  /** Original file name, else a plain description of the kind. */
  label: string;
  /** Model that produced this artifact, when applicable. */
  model?: string;
}

/** Kind-specific data for an Artifact. */
export interface ArtifactData {
  /** For "image": the Drive path. */
  image?: { path: string; label: string; model?: string };
  /** For "code": the code content and language. */
  code?: { content: string; language: string; label?: string };
  /** For "table": the table HTML and caption. */
  table?: { html: string; caption?: string; label?: string };
  /** For "ocr": the extracted text. */
  ocr?: { text: string; label?: string };
  /** For "export": the exported file name and content. */
  export?: { filename: string; content: string; label?: string };
}

/** Human label per kind, used when there is no file name. */
export const KIND_LABEL: Record<ArtifactKind, string> = {
  image: "Image",
  code: "Code",
  table: "Table",
  ocr: "OCR Text",
  export: "Export",
};

/** Base name of a Drive path, for downloads without a recorded file name. */
export function basenameOf(path: string): string {
  const tail = path.split("/").pop() ?? path;
  return tail || "image";
}

/**
 * Every image in the transcript, in transcript order.
 *
 * A message contributes its attachments first, then at most one of
 * `imagePath` / `image` — the same precedence `usePuterImage` applies when it
 * falls back to a legacy src, so the panel and the transcript never disagree
/** All artifacts in the transcript, in transcript order.
 *
 * Messages contribute artifacts based on their kind:
 * - Attachments with Drive refs become `kind: "image"` artifacts.
 * - Generated images via `imagePath` become `kind: "image"` artifacts.
 * - Legacy image srcs become `kind: "image"` artifacts.
 * - Other message content (code, tables, OCR text, exports) would be added here.
 *
 * The panel and transcript never disagree about which artifact a message shows
 * because this function derives the list from the transcript on every render.
 */
export function collectArtifacts(messages: Message[]): Artifact[] {
  const artifacts: Artifact[] = [];

  messages.forEach((message, messageIndex) => {
    if (!message || typeof message !== "object") return;

    const attachments = Array.isArray(message.attachments) ? message.attachments : [];
    attachments.forEach((ref, n) => {
      if (!ref || typeof ref.path !== "string" || !ref.path) return;
      artifacts.push({
        id: `${messageIndex}:image:${n}`,
        kind: "image",
        messageIndex,
        role: message.role === "user" ? "user" : "assistant",
        data: { image: { path: ref.path, label: ref.name?.trim() || KIND_LABEL.image, model: message.model } },
        label: ref.name?.trim() || KIND_LABEL.image,
      });
    });

    // TODO: Add code, table, OCR, and export artifact collection when those
    // types are stored on messages.
  });

  return artifacts;
}
export function countUnsavedAttachments(messages: Message[]): number {
  return messages.reduce((total, message) => {
    if (!message || typeof message.content !== "string") return total;
    if (!hasImageMarker(message.content)) return total;
    const stored = Array.isArray(message.attachments) ? message.attachments.length : 0;
    return total + Math.max(0, imageMarkerCount(message.content) - stored);
  }, 0);
}

/**
 * The Drive paths a set of messages owns — everything to reclaim when those
 * messages are deliberately destroyed.
 *
 * Legacy `image` srcs are excluded on purpose: a data URI is inline in the
 * message itself, and a hosted URL belongs to somebody else's server. Only
 * files this app wrote are ours to delete.
 */
export function reclaimImagePaths(messages: Message[]): string[] {
  const paths = new Set<string>();
  for (const message of messages) {
    if (!message || typeof message !== "object") continue;
    if (Array.isArray(message.attachments)) {
      for (const ref of message.attachments) {
        if (ref && typeof ref.path === "string" && ref.path) paths.add(ref.path);
      }
    }
    if (typeof message.imagePath === "string" && message.imagePath) {
      paths.add(message.imagePath);
    }
  }
  return [...paths];
}

/** Per-kind counts, for the panel's filter row. */
export function countByKind(
  artifacts: Artifact[]
): Record<ArtifactKind, number> {
  return artifacts.reduce(
    (acc, a) => {
      acc[a.kind] += 1;
      return acc;
    },
    { image: 0, code: 0, table: 0, ocr: 0, export: 0 } as Record<ArtifactKind, number>
  );
}
