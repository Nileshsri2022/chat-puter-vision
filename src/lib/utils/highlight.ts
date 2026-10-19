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

/** A match's character span in the concatenated text of a region. */
export interface MatchSpan {
  start: number;
  end: number;
}

/**
 * Every case-insensitive occurrence of `query` in `texts` read as one string.
 *
 * Splitting the query across the parts is the whole point: markdown renders
 * "**quantum** algorithms" as two text nodes, and a phrase that a user
 * selected naturally spans them. Pure, so the offset maths is testable
 * without a DOM.
 */
export function findMatchSpans(texts: string[], query: string): MatchSpan[] {
  const needle = query.toLowerCase();
  if (!needle) return [];
  const haystack = texts.join("").toLowerCase();
  const spans: MatchSpan[] = [];
  for (
    let at = haystack.indexOf(needle);
    at !== -1;
    at = haystack.indexOf(needle, at + needle.length)
  ) {
    spans.push({ start: at, end: at + needle.length });
  }
  return spans;
}

/**
 * Every case-insensitive occurrence of `query` inside the rendered message, as
 * DOM ranges in document order.
 *
 * Only `[data-search-text]` regions are scanned, so a search for "copy" hits
 * the answer and never the message toolbar.
 *
 * Matches are located across the region's text nodes, not within each one, so
 * a phrase that straddles bold text or an inline code span is still found.
 */
export function collectMatchRanges(root: HTMLElement, query: string): Range[] {
  if (!query.trim()) return [];

  const ranges: Range[] = [];
  for (const region of Array.from(root.querySelectorAll(SEARCHABLE_REGION))) {
    const nodes = textNodes(region);
    if (nodes.length === 0) continue;

    const spans = findMatchSpans(
      nodes.map((node) => node.data),
      query
    );
    if (spans.length === 0) continue;

    // Map a character offset in the concatenated text back to (node, offset).
    const locate = (offset: number): { node: Text; offset: number } | null => {
      let cursor = 0;
      for (const node of nodes) {
        const end = cursor + node.data.length;
        if (offset >= cursor && offset < end) {
          return { node, offset: offset - cursor };
        }
        cursor = end;
      }
      return null;
    };

    for (const span of spans) {
      const start = locate(span.start);
      const end = locate(span.end - 1);
      if (!start || !end) continue;
      try {
        const range = document.createRange();
        range.setStart(start.node, start.offset);
        range.setEnd(end.node, end.offset + 1);
        ranges.push(range);
      } catch {
        // Offsets went stale between the walk and the range; skip this hit.
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
