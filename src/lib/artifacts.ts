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
//
// Phase 3 adds text artifacts (code blocks and tables from assistant answers,
// see lib/artifactBlocks.ts) beside the images. The Phase 1 exports below are
// unchanged; the union and `collectArtifacts` are additive.

import type { Message } from "./backend";
import { hasImageMarker, imageMarkerCount } from "./attachments";
import { extractTextBlocks } from "./artifactBlocks";

export type ImageArtifactKind = "generated" | "attached" | "legacy";

export interface ImageArtifact {
  /** Stable within one derivation: `${messageIndex}:${kind}:${n}`. */
  id: string;
  kind: ImageArtifactKind;
  /** Transcript position — the value `data-message-index` carries. */
  messageIndex: number;
  role: "user" | "assistant";
  /** Drive path for generated/attached images. */
  path?: string;
  /** Direct src for a legacy image (data URI or hosted URL). */
  src?: string;
  /** Original file name, else a plain description of the kind. */
  label: string;
  /** Model that produced a generated image, when the message records one. */
  model?: string;
}

/** Human label per kind, used when there is no file name. */
export const KIND_LABEL: Record<ImageArtifactKind, string> = {
  generated: "Generated image",
  attached: "Attached image",
  legacy: "Image",
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
 * about which image a message shows.
 */
export function collectImageArtifacts(messages: Message[]): ImageArtifact[] {
  const artifacts: ImageArtifact[] = [];

  messages.forEach((message, messageIndex) => {
    if (!message || typeof message !== "object") return;

    const attachments = Array.isArray(message.attachments) ? message.attachments : [];
    attachments.forEach((ref, n) => {
      if (!ref || typeof ref.path !== "string" || !ref.path) return;
      artifacts.push({
        id: `${messageIndex}:attached:${n}`,
        kind: "attached",
        messageIndex,
        role: message.role === "user" ? "user" : "assistant",
        path: ref.path,
        label: ref.name?.trim() || KIND_LABEL.attached,
      });
    });

    if (typeof message.imagePath === "string" && message.imagePath) {
      artifacts.push({
        id: `${messageIndex}:generated:0`,
        kind: "generated",
        messageIndex,
        role: message.role === "user" ? "user" : "assistant",
        path: message.imagePath,
        label: KIND_LABEL.generated,
        model: message.model,
      });
    } else if (typeof message.image === "string" && message.image) {
      artifacts.push({
        id: `${messageIndex}:legacy:0`,
        kind: "legacy",
        messageIndex,
        role: message.role === "user" ? "user" : "assistant",
        src: message.image,
        label: KIND_LABEL.legacy,
        model: message.model,
      });
    }
  });

  return artifacts;
}

/**
 * Images claimed by a legacy `[Images: N attached]` marker that has no refs
 * behind it. Those bytes were never stored anywhere, so the panel says so
 * rather than showing a tile that cannot resolve.
 */
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
  artifacts: ImageArtifact[]
): Record<ImageArtifactKind, number> {
  return artifacts.reduce(
    (acc, a) => {
      acc[a.kind] += 1;
      return acc;
    },
    { generated: 0, attached: 0, legacy: 0 } as Record<ImageArtifactKind, number>
  );
}

// ---- Phase 3: text artifacts ----

/** "ocr" joins in PR 3b, together with the provenance that produces it. */
export type TextArtifactKind = "code" | "table";
/** The flat union: every Phase 1 `a.kind === "generated"` check stays correct. */
export type ArtifactKind = ImageArtifactKind | TextArtifactKind;

interface TextArtifactBase {
  /** `${messageIndex}:${kind}:${n}`, the Phase 1 id scheme; `n` counts from 0. */
  id: string;
  messageIndex: number;
  role: "user" | "assistant";
  /** "Python · 24 lines", "Table · 5 × 3". */
  label: string;
  /** What copy and download start from. */
  text: string;
  model?: string;
}

export interface CodeArtifact extends TextArtifactBase {
  kind: "code";
  /** The fence info string's first word. */
  language?: string;
  lines: number;
  /** Offset of the block in the rendered answer (`data-artifact-at`). */
  at: number;
}

export interface TableArtifact extends TextArtifactBase {
  kind: "table";
  header: string[];
  /** Cell text; `text` holds the table's Markdown. */
  rows: string[][];
  at: number;
}

export type TextArtifact = CodeArtifact | TableArtifact;
export type Artifact = ImageArtifact | TextArtifact;

/**
 * Narrow to the Phase 1 image kinds. Test this first in exhaustive code: with
 * `strict` off, ruling out a single image kind does not remove the member.
 */
export function isImageArtifact(a: Artifact): a is ImageArtifact {
  return a.kind === "generated" || a.kind === "attached" || a.kind === "legacy";
}

/** Where to land when locating an artifact. Without `at`, the message flashes. */
export interface LocateOptions {
  /** A code block's or table's offset in the answer (`data-artifact-at`). */
  at?: number;
}

function textArtifactsOf(message: Message, messageIndex: number): TextArtifact[] {
  const blocks = extractTextBlocks(message);
  if (blocks.length === 0) return [];
  const seen: Record<TextArtifactKind, number> = { code: 0, table: 0 };
  return blocks.map((block): TextArtifact => {
    const base = {
      id: `${messageIndex}:${block.kind}:${seen[block.kind]++}`,
      messageIndex,
      role: "assistant" as const,
      label: block.label,
      text: block.text,
      model: message.model,
    };
    return block.kind === "code"
      ? { ...base, kind: "code", language: block.language, lines: block.lines, at: block.at }
      : { ...base, kind: "table", header: block.header, rows: block.rows, at: block.at };
  });
}

/**
 * Every artifact in the transcript. Messages stay in transcript order; within
 * a message, its images come first (in `collectImageArtifacts` order, which
 * this reuses rather than repeats), then its code blocks and tables in
 * document order. Never throws: text extraction swallows its own failures.
 */
export function collectArtifacts(messages: Message[]): Artifact[] {
  const images = collectImageArtifacts(messages);
  const artifacts: Artifact[] = [];
  let next = 0;
  messages.forEach((message, messageIndex) => {
    while (next < images.length && images[next].messageIndex === messageIndex) {
      artifacts.push(images[next++]);
    }
    artifacts.push(...textArtifactsOf(message, messageIndex));
  });
  // Unreachable while both walks visit the same indices; kept so an image can
  // never be dropped silently if that ever changes.
  while (next < images.length) artifacts.push(images[next++]);
  return artifacts;
}

/** Per-kind counts across every kind, for the panel's chips. */
export function countArtifactKinds(artifacts: Artifact[]): Record<ArtifactKind, number> {
  const counts: Record<ArtifactKind, number> = {
    generated: 0,
    attached: 0,
    legacy: 0,
    code: 0,
    table: 0,
  };
  for (const a of artifacts) counts[a.kind] += 1;
  return counts;
}
