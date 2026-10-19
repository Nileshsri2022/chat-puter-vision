import { test, expect } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ContextsPanel } from "@/components/ContextsPanel";
import {
  addItemToContextGroup,
  createContextGroup,
  type ContextGroup,
} from "@/lib/contextGroups";

const OCT_19 = new Date(2026, 9, 19, 12, 0, 0).getTime();
const OCT_18 = new Date(2026, 9, 18, 12, 0, 0).getTime();

function buildFixtureGroups(): ContextGroup[] {
  let g1 = createContextGroup(undefined, OCT_19);
  for (let i = 1; i <= 10; i++) {
    g1 = addItemToContextGroup(
      g1,
      {
        kind: "image",
        ref: `freetalk-img-${i}.png`,
        refKind: "drive",
        origin: "generated",
        label: i === 1 ? "Boy Dancing Reference" : `Pose ${i}`,
        source: { conversationId: "conv-1", messageIndex: i },
      },
      OCT_19
    ).group;
  }
  g1 = addItemToContextGroup(
    g1,
    {
      kind: "text",
      text: "Boy dancing in car...",
      label: "Boy dancing in car...",
      source: {
        conversationId: "conv-1",
        messageIndex: 0,
        highlightText: "Boy dancing in car",
      },
    },
    OCT_19
  ).group;
  g1 = addItemToContextGroup(
    g1,
    {
      kind: "code",
      text: "pose = 1",
      language: "python",
      label: "</> Python · pose_config.py",
      source: { conversationId: "conv-1", messageIndex: 2, at: 15 },
    },
    OCT_19
  ).group;
  g1 = addItemToContextGroup(
    g1,
    {
      kind: "table",
      text: "| A | B |\n| - | - |\n| 1 | 2 |",
      label: "▦ Table · Scene & Camera Specs",
      source: { conversationId: "conv-1", messageIndex: 3, at: 30 },
    },
    OCT_19
  ).group;

  const g2 = createContextGroup(
    {
      kind: "text",
      text: "Flight details",
      label: "Trip Plan & Code",
      source: { conversationId: "conv-2", messageIndex: 0 },
    },
    OCT_18
  );

  return [g1, g2];
}

test("collapsed context groups show only their title row and quick inject button, while the expanded group shows all 10 images, text/code/table rows, and right-arrow locate buttons", () => {
  const groups = buildFixtureGroups();
  const html = renderToStaticMarkup(
    <ContextsPanel
      contextGroups={groups}
      expandedGroupId={groups[0].id}
      injectedGroupId={groups[0].id}
      isOpen
      onToggle={() => {}}
      onExpandGroup={() => {}}
      onCreateGroup={() => {}}
      onAddItem={() => {}}
      onRemoveItem={() => {}}
      onDeleteGroup={() => {}}
      onRenameGroup={() => {}}
      onInjectGroup={() => {}}
      onLocateItem={() => {}}
    />
  );

  // Expanded group title and collapsed group title both appear
  expect(html).toContain("Today, Oct 19 — Boy Dancing Reference");
  expect(html).toContain("Oct 18 — Trip Plan &amp; Code");

  // Collapsed group's inner text ("Flight details") is hidden until clicked
  expect(html).not.toContain('title="Flight details"');

  // Expanded group renders all 10 image thumbnails and 3 text/code/table rows
  expect(html.match(/class="context-thumb group"/g)).toHaveLength(10);
  expect(html.match(/class="context-item-row"/g)).toHaveLength(3);

  // Every image (10) and every text/code/table row (3) has a `Show ... in chat` (`→`) button
  expect(html.match(/aria-label="Show [^"]* in chat"/g)).toHaveLength(13);

  // And the `← Inject into input` button is rendered
  expect(html).toContain("Inject into input");
});

test("text, code, and table rows have no eye preview (the arrow shows the text in chat), and rows without a source say so instead of hiding the arrow", () => {
  let group = createContextGroup(undefined, OCT_19);
  group = addItemToContextGroup(
    group,
    {
      kind: "text",
      text: "When you measure a qubit, it stops being in superposition.",
      label: "When you measure a qubit…",
      source: {
        conversationId: "conv-1",
        messageIndex: 0,
        highlightText: "When you measure a qubit",
      },
    },
    OCT_19
  ).group;
  group = addItemToContextGroup(
    group,
    {
      // Dropped from outside the chat: no provenance, so no `→` to offer.
      kind: "text",
      text: "Pasted reference notes",
      label: "Pasted reference notes",
    },
    OCT_19
  ).group;

  const html = renderToStaticMarkup(
    <ContextsPanel
      contextGroups={[group]}
      expandedGroupId={group.id}
      isOpen
      onToggle={() => {}}
      onExpandGroup={() => {}}
      onCreateGroup={() => {}}
      onAddItem={() => {}}
      onRemoveItem={() => {}}
      onDeleteGroup={() => {}}
      onRenameGroup={() => {}}
      onInjectGroup={() => {}}
      onLocateItem={() => {}}
    />
  );

  // No eye/preview control any more: the `→` arrow already shows the saved
  // text in the chat, so a separate preview dialog would duplicate it.
  expect(html).not.toContain('aria-label="Preview ');
  expect(html).not.toContain("context-preview");
  expect(html).not.toContain("Preview text");
  // The row with provenance keeps its locate arrow; the one without renders a
  // disabled placeholder rather than silently dropping the control.
  expect(html.match(/aria-label="Show [^"]* in chat"/g)).toHaveLength(1);
  expect(html).toContain("context-item-action-disabled");
});
