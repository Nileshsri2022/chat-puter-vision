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
