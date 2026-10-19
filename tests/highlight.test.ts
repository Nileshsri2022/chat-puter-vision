// Match location for the context `→` locate highlight (and find-in-chat).
//
// The regression this pins: a phrase that a user selected across markdown
// formatting ("**quantum** algorithms") is split into several text nodes in the
// DOM. Matching each node on its own found nothing, so clicking → flashed the
// message but never highlighted the text the user had saved.

import { test, expect } from "bun:test";
import { findMatchSpans } from "../src/lib/utils/highlight";

test("a phrase inside one text node is found once", () => {
  expect(findMatchSpans(["Quantum algorithms are fast"], "algorithms")).toEqual([
    { start: 8, end: 18 },
  ]);
});

test("a phrase split across nodes is found as one span", () => {
  // <strong>quantum</strong> + " algorithms" render as two text nodes.
  const spans = findMatchSpans(["quantum", " algorithms and more"], "quantum algorithms");
  expect(spans).toEqual([{ start: 0, end: 18 }]);
});

test("matching is case-insensitive and finds every occurrence", () => {
  expect(findMatchSpans(["Qubit qubit QUBIT"], "qubit")).toEqual([
    { start: 0, end: 5 },
    { start: 6, end: 11 },
    { start: 12, end: 17 },
  ]);
});

test("empty or absent queries match nothing", () => {
  expect(findMatchSpans(["some text"], "")).toEqual([]);
  expect(findMatchSpans(["some text"], "missing")).toEqual([]);
  expect(findMatchSpans([], "anything")).toEqual([]);
});

test("a cross-node span still reports offsets in the joined string", () => {
  // "Factoring large numbers (important for cryptography)" with the bold part
  // split into its own node, as the quantum-computing answer renders it.
  const nodes = ["Factoring ", "large numbers", " (important for cryptography)"];
  const spans = findMatchSpans(nodes, "large numbers (important");
  expect(spans).toHaveLength(1);
  const joined = nodes.join("");
  expect(joined.slice(spans[0].start, spans[0].end)).toBe("large numbers (important");
});
