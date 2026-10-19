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

test("collapsed context groups show only their title row and quick inject button, while expanded groups show image, text, code, and table items with shared action triggers", () => {
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

  expect(html).toContain("Today, Oct 19 — Boy Dancing Reference");
  expect(html).toContain("Oct 18 — Trip Plan &amp; Code");
  expect(html).not.toContain('title="Flight details"');
  expect(html.match(/class="context-thumb group"/g)).toHaveLength(10);
  expect(html.match(/class="context-item-row"/g)).toHaveLength(3);

  // Every artifact type exposes the same labeled three-dot action-menu trigger.
  expect(html.match(/class="context-thumb-more tap-expand"/g)).toHaveLength(10);
  expect(html.match(/context-item-action context-item-more tap-expand/g)).toHaveLength(3);
  expect(html.match(/aria-label="Actions for [^"]*"/g)).toHaveLength(13);
  expect(html).toContain("Inject into input");
});

test("sourced and unsourced text rows expose an action trigger and no duplicate preview control", () => {
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
      // Dropped from outside the chat: no provenance, so Show in chat is disabled in the menu.
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
      onInjectItem={() => {}}
      onLocateItem={() => {}}
    />
  );

  expect(html).not.toContain('aria-label="Preview ');
  expect(html).not.toContain("context-preview");
  expect(html).not.toContain("Preview text");
  expect(html).toContain('aria-label="Actions for When you measure a qubit…"');
  expect(html).toContain('aria-label="Actions for Pasted reference notes"');
});

test("all item types delegate their actions to the shared portalled dropdown", () => {
  const groups = buildFixtureGroups();
  const html = renderToStaticMarkup(
    <ContextsPanel
      contextGroups={groups}
      expandedGroupId={groups[0].id}
      isOpen
      onToggle={() => {}}
      onExpandGroup={() => {}}
      onCreateGroup={() => {}}
      onAddItem={() => {}}
      onRemoveItem={() => {}}
      onDeleteGroup={() => {}}
      onRenameGroup={() => {}}
      onInjectGroup={() => {}}
      onInjectItem={() => {}}
      onLocateItem={() => {}}
    />
  );

  // Radix portals menu content into document.body only after interaction. The browser E2E
  // checks its visible labels and vertical layout for image, text, code, and table items.
  expect(html).not.toContain("context-thumb-menu");
  expect(html).not.toContain("context-item-inject");
  expect(html).not.toContain("context-actions-menu");
  expect(html.match(/aria-label="Actions for [^"]*"/g)).toHaveLength(13);
});

test("items keep their action trigger when per-item injection is unavailable", () => {
  const groups = buildFixtureGroups();
  const image = groups[0].items.find((item) => item.kind === "image")!;
  const html = renderToStaticMarkup(
    <ContextsPanel
      contextGroups={groups}
      expandedGroupId={groups[0].id}
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

  expect(html).toContain(`aria-label="Actions for ${image.label}"`);
  // The group-level footer action remains separate from per-item dropdown actions.
  expect(html).toContain("Inject into input");
});
