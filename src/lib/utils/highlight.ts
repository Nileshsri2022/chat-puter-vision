// In-conversation search highlighting (CSS Custom Highlight API).
//
// The transcript is React-managed, so matched text cannot be wrapped in
// `<mark>` elements the way a static page would: splitting React's own text
// nodes makes the next reconcile write half a string and leave stale clones
// behind. The Custom Highlight API paints ranges over the rendered text
// without touching a single node, so highlighting is safe to rebuild on every
// render — which is exactly what a live-updating search input needs.
//
// Browsers without the API (Safari < 17.2, Firefox < 140) skip the in-text
// paint only: match counting, message-level styling and prev/next navigation
// all come from React, so the feature keeps working there.

export const SEARCH_HIT_HIGHLIGHT = "chat-search-hit";
export const SEARCH_ACTIVE_HIGHLIGHT = "chat-search-active";

/** Regions of a message that are searchable — see `data-search-text`. */
const SEARCHABLE_REGION = "[data-search-text]";

/** True when the browser can paint custom highlights. */
export function supportsCustomHighlights(): boolean {
  return (
    typeof CSS !== "undefined" &&
    !!CSS.highlights &&
    typeof Highlight !== "undefined"
  );
}

/** Text nodes under `root`, in document order. */
function textNodes(root: Node): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let node = walker.nextNode();
  while (node) {
    nodes.push(node as Text);
    node = walker.nextNode();
  }
  return nodes;
}

/**
 * Every case-insensitive occurrence of `query` inside the rendered message, as
 * DOM ranges in document order.
 *
 * Only `[data-search-text]` regions are scanned, so a search for "copy" hits
 * the answer and never the message toolbar.
 */
export function collectMatchRanges(root: HTMLElement, query: string): Range[] {
  const needle = query.toLowerCase();
  if (!needle) return [];

  const ranges: Range[] = [];
  for (const region of Array.from(root.querySelectorAll(SEARCHABLE_REGION))) {
    for (const text of textNodes(region)) {
      const haystack = text.data.toLowerCase();
      for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + needle.length)) {
        const range = document.createRange();
        range.setStart(text, at);
        range.setEnd(text, at + needle.length);
        ranges.push(range);
      }
    }
  }
  return ranges;
}

/**
 * Publish the current matches to the highlight registry: `active` paints on top
 * of `hits` (the registry paints in insertion order).
 */
export function paintSearchHighlights(hits: Range[], active: Range[]): void {
  if (!supportsCustomHighlights()) return;
  if (hits.length > 0) {
    CSS.highlights.set(SEARCH_HIT_HIGHLIGHT, new Highlight(...hits));
  } else {
    CSS.highlights.delete(SEARCH_HIT_HIGHLIGHT);
  }
  if (active.length > 0) {
    CSS.highlights.set(SEARCH_ACTIVE_HIGHLIGHT, new Highlight(...active));
  } else {
    CSS.highlights.delete(SEARCH_ACTIVE_HIGHLIGHT);
  }
}

/** Drop this feature's highlights. Other registrations are left alone. */
export function clearSearchHighlights(): void {
  if (!supportsCustomHighlights()) return;
  CSS.highlights.delete(SEARCH_HIT_HIGHLIGHT);
  CSS.highlights.delete(SEARCH_ACTIVE_HIGHLIGHT);
}
