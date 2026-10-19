// Explicit, user-curated Context Groups for the right-hand Contexts panel.
//
// Replaces the automatic "always edit the last image in the chat" behaviour
// with named, date-organized Context Groups that can hold up to 10 images and
// multiple text, code, table, or OCR items — each retaining a `ContextSourceRef`
// so the user can jump back to (`→`) and highlight where every item came from,
// or inject (`←`) the entire group into the composer for chat or image tasks.

import type { ImageOrigin } from "./backend";
import { isImageArtifact, type Artifact } from "./artifacts";

export const MAX_CONTEXT_IMAGES = 10;
export const MAX_CONTEXT_TEXT_ITEMS = 20;
export const CONTEXT_DRAG_MIME = "application/x-freetalk-context";
export const CONTEXT_STORAGE_KEY = "freetalk_context_groups_v1";

export type ContextItemKind = "image" | "text" | "code" | "table" | "ocr";

/**
 * Where a context item came from in the app. Powers the right-arrow (`→`)
 * button on every image thumbnail and text/code/table row inside a Context Group.
 */
export interface ContextSourceRef {
  /** Conversation ID the item was dragged or added from. */
  conversationId: string;
  /** Index of the message in `conversation.messages` (`data-message-index`). */
  messageIndex: number;
  /**
   * Optional block offset (`data-artifact-at`) for a code block or table, so
   * clicking `→` flashes that exact block rather than the whole message.
   */
  at?: number;
  /**
   * Optional verbatim snippet for text selections, highlighted inside the
   * target message when located.
   */
  highlightText?: string;
}

export interface ContextImageItem {
  id: string;
  kind: "image";
  /** Puter Drive path (`freetalk-*.png`) or self-contained `data:` URI. */
  ref: string;
  refKind: "drive" | "data";
  origin: ImageOrigin;
  label: string;
  /** True when `ref` was written specifically for this Context Group. */
  ownedPath?: boolean;
  source?: ContextSourceRef;
}

export interface ContextTextItem {
  id: string;
  kind: "text" | "code" | "table" | "ocr";
  /** The text, fenced code, or Markdown table content. */
  text: string;
  /** Short one-line summary shown on the row in the panel. */
  label: string;
  language?: string;
  source?: ContextSourceRef;
}

export type ContextItem = ContextImageItem | ContextTextItem;

export interface ContextGroup {
  id: string;
  /** User-editable title; defaults to `<Date label> — <Topic>`. */
  title: string;
  /** Creation timestamp (epoch ms), used for date bucketing and sorting. */
  createdAt: number;
  /** Last mutation timestamp (epoch ms). */
  updatedAt: number;
  /** Ordered items inside this context group (up to 10 images + 20 text items). */
  items: ContextItem[];
}

export type ContextDropPayload =
  | {
      kind: "image";
      ref: string;
      refKind: "drive" | "data";
      origin: ImageOrigin;
      label: string;
      ownedPath?: boolean;
      source?: ContextSourceRef;
    }
  | {
      kind: "text" | "code" | "table" | "ocr";
      text: string;
      label: string;
      language?: string;
      source?: ContextSourceRef;
    };

export function isContextImageItem(item: ContextItem): item is ContextImageItem {
  return item.kind === "image";
}

export function isContextTextItem(item: ContextItem): item is ContextTextItem {
  return item.kind !== "image";
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Date prefix used in Context Group titles: `"Today, Oct 19"` when created
 * today, else `"Oct 18"` (or `"Oct 18, 2025"` across years).
 */
export function formatContextDatePrefix(createdAt: number, now: number = Date.now()): string {
  const date = new Date(createdAt);
  const current = new Date(now);
  const monthDay = `${MONTHS[date.getMonth()]} ${date.getDate()}`;
  if (isSameLocalDay(date, current)) {
    return `Today, ${monthDay}`;
  }
  if (date.getFullYear() !== current.getFullYear()) {
    return `${monthDay}, ${date.getFullYear()}`;
  }
  return monthDay;
}

/** Short, single-line topic label derived from a seed item or user string. */
export function cleanTopicLabel(raw?: string): string {
  if (!raw) return "New Context";
  const singleLine = raw
    .replace(/^<\/>|^▦/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!singleLine) return "New Context";
  return singleLine.length > 28 ? `${singleLine.slice(0, 28).trimEnd()}…` : singleLine;
}

/**
 * Default date-stamped title for a Context Group, e.g.
 * `"Today, Oct 19 — Boy Dancing Reference"`.
 */
export function formatDefaultContextTitle(
  createdAt: number,
  topic?: string,
  now: number = Date.now()
): string {
  return `${formatContextDatePrefix(createdAt, now)} — ${cleanTopicLabel(topic)}`;
}

function newId(prefix: string, now: number): string {
  return `${prefix}-${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function payloadToItem(payload: ContextDropPayload, now: number): ContextItem {
  const id = newId("ctx-item", now);
  if (payload.kind === "image") {
    return {
      id,
      kind: "image",
      ref: payload.ref,
      refKind: payload.refKind,
      origin: payload.origin,
      label: payload.label.trim() || "Image",
      ...(payload.ownedPath ? { ownedPath: true } : {}),
      ...(payload.source ? { source: payload.source } : {}),
    };
  }
  const cleanText = payload.text.trim();
  const fallbackLabel =
    cleanText.split("\n")[0]?.trim().slice(0, 36) || "Text snippet";
  return {
    id,
    kind: payload.kind,
    text: cleanText,
    label: payload.label.trim() || fallbackLabel,
    ...(payload.language ? { language: payload.language } : {}),
    ...(payload.source ? { source: payload.source } : {}),
  };
}

/**
 * Create a new Context Group, optionally seeded with a first item.
 */
export function createContextGroup(
  seedItem?: ContextDropPayload,
  now: number = Date.now()
): ContextGroup {
  const items: ContextItem[] = [];
  if (seedItem) {
    if (seedItem.kind === "image" && seedItem.ref.trim()) {
      items.push(payloadToItem(seedItem, now));
    } else if (seedItem.kind !== "image" && seedItem.text.trim()) {
      items.push(payloadToItem(seedItem, now));
    }
  }
  const topic = items[0]?.label;
  return {
    id: newId("ctx", now),
    title: formatDefaultContextTitle(now, topic, now),
    createdAt: now,
    updatedAt: now,
    items,
  };
}

/**
 * Append an item to a Context Group while enforcing the per-group limits
 * (up to 10 images and 20 text/code/table items).
 */
export function addItemToContextGroup(
  group: ContextGroup,
  payload: ContextDropPayload,
  now: number = Date.now()
): {
  group: ContextGroup;
  added: boolean;
  reason?: "image_limit" | "text_limit" | "empty";
} {
  if (payload.kind === "image") {
    if (!payload.ref.trim()) return { group, added: false, reason: "empty" };
    const imageCount = group.items.filter(isContextImageItem).length;
    if (imageCount >= MAX_CONTEXT_IMAGES) {
      return { group, added: false, reason: "image_limit" };
    }
  } else {
    if (!payload.text.trim()) return { group, added: false, reason: "empty" };
    const textCount = group.items.filter(isContextTextItem).length;
    if (textCount >= MAX_CONTEXT_TEXT_ITEMS) {
      return { group, added: false, reason: "text_limit" };
    }
  }

  const item = payloadToItem(payload, now);
  const wasUntitled =
    group.items.length === 0 && /—\s*New Context$/.test(group.title);
  const nextTitle = wasUntitled
    ? formatDefaultContextTitle(group.createdAt, item.label, now)
    : group.title;

  return {
    group: {
      ...group,
      title: nextTitle,
      updatedAt: now,
      items: [...group.items, item],
    },
    added: true,
  };
}

/**
 * Remove one item from a Context Group by id, returning the removed item so
 * the caller can reclaim any owned Drive path.
 */
export function removeItemFromContextGroup(
  group: ContextGroup,
  itemId: string,
  now: number = Date.now()
): { group: ContextGroup; removed?: ContextItem } {
  const removed = group.items.find((item) => item.id === itemId);
  if (!removed) return { group };
  return {
    group: {
      ...group,
      updatedAt: now,
      items: group.items.filter((item) => item.id !== itemId),
    },
    removed,
  };
}

/**
 * Drive paths owned exclusively by a set of Context Items, for cleanup on
 * item or group deletion.
 */
export function reclaimContextImagePaths(items: ContextItem[]): string[] {
  const paths = new Set<string>();
  for (const item of items) {
    if (
      item.kind === "image" &&
      item.ownedPath &&
      item.refKind === "drive" &&
      item.ref
    ) {
      paths.add(item.ref);
    }
  }
  return [...paths];
}

/**
 * Convert an Artifact from the Artifacts panel into a ContextDropPayload with
 * its source provenance (`conversationId`, `messageIndex`, `at`) intact.
 */
export function artifactToContextPayload(
  artifact: Artifact,
  conversationId: string
): ContextDropPayload | null {
  if (isImageArtifact(artifact)) {
    if (artifact.path) {
      return {
        kind: "image",
        ref: artifact.path,
        refKind: "drive",
        origin: artifact.kind === "generated" ? "generated" : "attachment",
        label: artifact.label,
        source: {
          conversationId,
          messageIndex: artifact.messageIndex,
        },
      };
    }
    if (artifact.src && artifact.src.startsWith("data:")) {
      return {
        kind: "image",
        ref: artifact.src,
        refKind: "data",
        origin: "generated",
        label: artifact.label,
        source: {
          conversationId,
          messageIndex: artifact.messageIndex,
        },
      };
    }
    return null;
  }

  if (artifact.kind === "code") {
    return {
      kind: "code",
      text: artifact.text,
      label: `</> ${artifact.label}`,
      language: artifact.language,
      source: {
        conversationId,
        messageIndex: artifact.messageIndex,
        at: artifact.at,
      },
    };
  }

  return {
    kind: "table",
    text: artifact.text,
    label: `▦ ${artifact.label}`,
    source: {
      conversationId,
      messageIndex: artifact.messageIndex,
      at: artifact.at,
    },
  };
}

export function encodeContextDragPayload(payload: ContextDropPayload): string {
  return JSON.stringify(payload);
}

export function decodeContextDragPayload(raw: string): ContextDropPayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ContextDropPayload>;
    if (!parsed || typeof parsed !== "object" || typeof parsed.kind !== "string") {
      return null;
    }
    if (parsed.kind === "image") {
      if (
        typeof parsed.ref !== "string" ||
        !parsed.ref ||
        (parsed.refKind !== "drive" && parsed.refKind !== "data")
      ) {
        return null;
      }
      return {
        kind: "image",
        ref: parsed.ref,
        refKind: parsed.refKind,
        origin: parsed.origin === "attachment" ? "attachment" : "generated",
        label: typeof parsed.label === "string" ? parsed.label : "Image",
        ...(parsed.ownedPath ? { ownedPath: true } : {}),
        ...(parsed.source ? { source: parsed.source } : {}),
      };
    }
    if (
      parsed.kind === "text" ||
      parsed.kind === "code" ||
      parsed.kind === "table" ||
      parsed.kind === "ocr"
    ) {
      if (typeof parsed.text !== "string" || !parsed.text.trim()) return null;
      return {
        kind: parsed.kind,
        text: parsed.text,
        label: typeof parsed.label === "string" ? parsed.label : "Text snippet",
        ...(typeof parsed.language === "string" ? { language: parsed.language } : {}),
        ...(parsed.source ? { source: parsed.source } : {}),
      };
    }
    return null;
  } catch {
    return null;
  }
}

function formatTextItemBlock(item: ContextTextItem): string {
  if (item.kind === "code") {
    const lang = item.language ?? "";
    const longestFence = Math.max(
      3,
      ...(item.text.match(/`+/g)?.map((m) => m.length + 1) ?? [3])
    );
    const fence = "`".repeat(longestFence);
    return `${fence}${lang}\n${item.text}\n${fence}`;
  }
  return item.text;
}

export interface ResolvedContextInput {
  /** Formatted text/code/table blocks to combine with the user's prompt. */
  contextText: string;
  /** Data URIs (`data:image/...;base64,...`) resolved from the group's images (up to 10). */
  imageDataUrls: string[];
  /** Provenance for `Message.editedFrom` when used in image-generation mode. */
  primaryImageBase: { src: string; origin: ImageOrigin } | null;
}

/**
 * Turn an injected Context Group into the exact text and image inputs needed
 * by either `handleSendMessage` (chat/vision) or `handleGenerateImage` (`txt2img`).
 */
export async function resolveContextGroupForTask(
  group: ContextGroup,
  loadDataUrl: (path: string) => Promise<string>
): Promise<ResolvedContextInput> {
  const imageItems = group.items
    .filter(isContextImageItem)
    .slice(0, MAX_CONTEXT_IMAGES);
  const textItems = group.items
    .filter(isContextTextItem)
    .slice(0, MAX_CONTEXT_TEXT_ITEMS);

  const imageDataUrls = await Promise.all(
    imageItems.map((item) =>
      item.refKind === "data" ? Promise.resolve(item.ref) : loadDataUrl(item.ref)
    )
  );

  const contextText = textItems.map(formatTextItemBlock).join("\n\n").trim();
  const firstImage = imageItems[0];
  const primaryImageBase = firstImage
    ? { src: firstImage.ref, origin: firstImage.origin }
    : null;

  return {
    contextText,
    imageDataUrls,
    primaryImageBase,
  };
}

/**
 * Combine the user's prompt with the resolved text items from an injected
 * Context Group. Returns `prompt` untouched when the group has no text items.
 */
export function combinePromptWithContext(
  prompt: string,
  groupTitle: string,
  contextText: string,
  mode: "chat" | "image"
): string {
  const cleanContext = contextText.trim();
  if (!cleanContext) return prompt;
  if (mode === "image") {
    return `${prompt}\n\nReference context (${groupTitle}):\n${cleanContext}`;
  }
  return `[Context: ${groupTitle}]\n${cleanContext}\n\n${prompt}`;
}

export function loadContextGroups(): ContextGroup[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CONTEXT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (g): g is ContextGroup =>
        Boolean(g) &&
        typeof g === "object" &&
        typeof g.id === "string" &&
        typeof g.title === "string" &&
        Array.isArray(g.items)
    );
  } catch {
    return [];
  }
}

export function saveContextGroups(groups: ContextGroup[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CONTEXT_STORAGE_KEY, JSON.stringify(groups));
  } catch {
    // Quota exceeded: keep in-memory state working without crashing the app.
  }
}
