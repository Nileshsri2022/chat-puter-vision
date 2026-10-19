// Explicit, user-curated Context Groups for the right-hand Contexts panel.
//
// Replaces the automatic "always edit the last image in the chat" behaviour
// with named, date-organized Context Groups that can hold up to 10 images and
// multiple text, code, table, or OCR items — each retaining a `ContextSourceRef`
// so the user can jump back to (`→`) and highlight where every item came from,
// or inject (`←`) the entire group into the composer for chat or image tasks.

import type { ImageOrigin } from "./backend";
import { isImageArtifact, type Artifact } from "./artifacts";
import { isImageUrl } from "./dataUrl";

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

/**
 * Stable identity for a Context Item, independent of the generated `id`.
 *
 * The composer's ad-hoc selection toggles items by what they *are* — the same
 * generated image (Drive path or data URI) or the same code/table text — so
 * clicking an item's `←` twice removes it rather than stacking duplicates.
 */
export function contextItemKey(item: ContextItem): string {
  return item.kind === "image"
    ? `image:${item.refKind}:${item.ref}`
    : `${item.kind}:${item.text}`;
}

/** The same identity, computed before a payload has become a stored item. */
export function contextPayloadKey(payload: ContextDropPayload): string {
  return payload.kind === "image"
    ? `image:${payload.refKind}:${payload.ref}`
    : `${payload.kind}:${payload.text}`;
}

/** Convert a stored item back into the payload shape `injectItem` accepts. */
export function contextItemToPayload(item: ContextItem): ContextDropPayload {
  if (item.kind === "image") {
    return {
      kind: "image",
      ref: item.ref,
      refKind: item.refKind,
      origin: item.origin,
      label: item.label,
      ...(item.ownedPath ? { ownedPath: true } : {}),
      ...(item.source ? { source: item.source } : {}),
    };
  }
  return {
    kind: item.kind,
    text: item.text,
    label: item.label,
    ...(item.language ? { language: item.language } : {}),
    ...(item.source ? { source: item.source } : {}),
  };
}

/**
 * Build the ephemeral Context Group that backs a hand-picked selection in the
 * composer. It is never persisted: it only needs the shape
 * `resolveContextGroupForTask` and the Context Pill already understand, so a
 * single item injects through exactly the same path as a whole saved group.
 */
export function createContextSelectionGroup(
  items: ContextItem[],
  now: number = Date.now()
): ContextGroup {
  const first = items[0];
  const topic = first ? cleanTopicLabel(first.label) : "New Context";
  const extra = items.length > 1 ? ` +${items.length - 1}` : "";
  return {
    id: "ctx-selection",
    title: `Selection — ${topic}${extra}`,
    createdAt: now,
    updatedAt: now,
    items,
  };
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

/**
 * Turn one drop payload into a stored Context Item. Exported because the
 * composer can also hold an ad-hoc selection of single items (injected one at a
 * time from the Contexts panel or straight from a chat message) that never
 * becomes a persisted Context Group.
 */
export function contextItemFromPayload(
  payload: ContextDropPayload,
  now: number = Date.now()
): ContextItem {
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
      items.push(contextItemFromPayload(seedItem, now));
    } else if (seedItem.kind !== "image" && seedItem.text.trim()) {
      items.push(contextItemFromPayload(seedItem, now));
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

  const item = contextItemFromPayload(payload, now);
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
  /** Images that could not be resolved to a sendable URL (deleted file, stale ref). */
  missingImages: number;
  /** Provenance for `Message.editedFrom` when used in image-generation mode. */
  primaryImageBase: { src: string; origin: ImageOrigin } | null;
  /**
   * Human-readable count of the items that were actually resolved and sent,
   * e.g. `"2 items (1 image, 1 text item)"`. The chat prompt carries this so
   * the model can answer questions about the context itself; without it, an
   * image and its caption look like a single item.
   */
  itemSummary: string;
}

/** Per-kind item counts used to describe a Context Group to the model. */
interface ContextItemCounts {
  images: number;
  text: number;
  code: number;
  table: number;
  ocr: number;
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * `"2 items (1 image, 1 text item)"` — what the model is told is in the
 * injected context. Counts only what actually resolved, so a deleted image
 * is never claimed to the model.
 */
function formatContextItemSummary(counts: ContextItemCounts): string {
  const parts: string[] = [];
  if (counts.images > 0) parts.push(pluralize(counts.images, "image"));
  if (counts.text > 0) parts.push(pluralize(counts.text, "text item"));
  if (counts.code > 0) parts.push(pluralize(counts.code, "code block"));
  if (counts.table > 0) parts.push(pluralize(counts.table, "table"));
  if (counts.ocr > 0) parts.push(pluralize(counts.ocr, "OCR snippet"));
  const total =
    counts.images + counts.text + counts.code + counts.table + counts.ocr;
  if (total === 0) return "";
  const label = total === 1 ? "item" : "items";
  return `${total} ${label}${parts.length > 0 ? ` (${parts.join(", ")})` : ""}`;
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
    // A malformed persisted item with no text is not context: skip it so the
    // summary and the prompt describe the same set of items.
    .filter((item) => item.text.trim().length > 0)
    .slice(0, MAX_CONTEXT_TEXT_ITEMS);

  // One broken image must never take the whole turn down: the chat API only
  // accepts `data:`/`https:` image URLs, and a stale entry (a `refKind` written
  // by an older build, a Drive file deleted behind our back) would otherwise
  // surface as "Attached images must be data: or https: URLs" and lose the
  // message. Resolve what we can, count the rest, and let the caller say so.
  const resolved = await Promise.all(
    imageItems.map(async (item) => {
      try {
        if (isImageUrl(item.ref)) return item.ref;
        // A stale or mis-typed reference: treat it as a Drive path and try to
        // read it. This also repairs old entries saved with the wrong refKind.
        const dataUrl = await loadDataUrl(item.ref);
        return isImageUrl(dataUrl) ? dataUrl : null;
      } catch {
        return null;
      }
    })
  );
  const imageDataUrls = resolved.filter((url): url is string => Boolean(url));

  const contextText = textItems.map(formatTextItemBlock).join("\n\n").trim();
  const firstImageIndex = resolved.findIndex((url) => url !== null);
  const firstImage = imageItems[firstImageIndex] ?? undefined;
  const primaryImageBase = firstImage
    ? { src: firstImage.ref, origin: firstImage.origin }
    : null;

  const counts: ContextItemCounts = {
    images: imageDataUrls.length,
    text: 0,
    code: 0,
    table: 0,
    ocr: 0,
  };
  for (const item of textItems) counts[item.kind] += 1;

  return {
    contextText,
    imageDataUrls,
    missingImages: imageItems.length - imageDataUrls.length,
    primaryImageBase,
    itemSummary: formatContextItemSummary(counts),
  };
}

/**
 * Combine the user's prompt with the resolved text items from an injected
 * Context Group. Returns `prompt` untouched when there is neither text nor a
 * non-empty item summary.
 *
 * In chat mode `itemSummary` is included as a manifest
 * (`This context group contains 2 items (1 image, 1 text item).`) so the model
 * knows the shape of the context, not just its flattened contents. That is
 * what makes "how many items are in context?" answerable; previously a single
 * image plus its caption looked like one item. Image-generation prompts skip
 * the manifest because it is metadata, not scene content.
 */
export function combinePromptWithContext(
  prompt: string,
  groupTitle: string,
  contextText: string,
  mode: "chat" | "image",
  itemSummary?: string
): string {
  const cleanContext = contextText.trim();
  const manifest =
    mode === "chat" && itemSummary?.trim()
      ? `This context group contains ${itemSummary.trim()}.`
      : "";
  if (!cleanContext && !manifest) return prompt;
  const body = [manifest, cleanContext].filter(Boolean).join("\n");
  if (mode === "image") {
    return `${prompt}\n\nReference context (${groupTitle}):\n${body}`;
  }
  return `[Context: ${groupTitle}]\n${body}\n\n${prompt}`;
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
