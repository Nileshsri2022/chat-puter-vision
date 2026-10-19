import { test, expect } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ContextsPanel } from "@/components/ContextsPanel";
import {
  addItemToContextGroup,
  contextItemKey,
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

test("collapsed context groups show only their title row and quick inject button, while the expanded group shows all 10 images, text/code/table rows, and consolidated `...` action buttons", () => {
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

  // By default, every image (10) has a bottom `...` button (`context-thumb-more`)
  // and every text/code/table row (3) has a right `...` button (`context-item-more`)
  expect(html.match(/class="context-thumb-more tap-expand"/g)).toHaveLength(10);
  expect(
    html.match(/context-item-action context-item-more tap-expand/g)
  ).toHaveLength(3);
  expect(html.match(/aria-label="Actions for [^"]*"/g)).toHaveLength(13);

  // And the `← Inject into input` button is rendered
  expect(html).toContain("Inject into input");
});

test("text, code, and table rows have no eye preview, and opening a row's `...` menu reveals `←`, `→`, and `×` in order (with a disabled `→` placeholder when there is no source)", () => {
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

  const sourcedRow = group.items[0]!;
  const unsourcedRow = group.items[1]!;

  const htmlWithSourcedOpen = renderToStaticMarkup(
    <ContextsPanel
      contextGroups={[group]}
      expandedGroupId={group.id}
      openActionItemId={sourcedRow.id}
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

  // No eye/preview control any more: the `→` arrow already shows the saved
  // text in the chat, so a separate preview dialog would duplicate it.
  expect(htmlWithSourcedOpen).not.toContain('aria-label="Preview ');
  expect(htmlWithSourcedOpen).not.toContain("context-preview");
  expect(htmlWithSourcedOpen).not.toContain("Preview text");

  // Sourced row's opened `...` menu shows left arrow (`←`), right arrow (`→`), and cancel (`×`) in order.
  const injectIdx = htmlWithSourcedOpen.indexOf("context-item-inject");
  const locateIdx = htmlWithSourcedOpen.indexOf("context-item-locate");
  const removeIdx = htmlWithSourcedOpen.indexOf("context-item-remove");
  expect(injectIdx).toBeGreaterThan(-1);
  expect(locateIdx).toBeGreaterThan(injectIdx);
  expect(removeIdx).toBeGreaterThan(locateIdx);

  // Unsourced row's opened `...` menu renders a disabled `→` placeholder between `←` and `×`.
  const htmlWithUnsourcedOpen = renderToStaticMarkup(
    <ContextsPanel
      contextGroups={[group]}
      expandedGroupId={group.id}
      openActionItemId={unsourcedRow.id}
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
  expect(htmlWithUnsourcedOpen).toContain("context-item-action-disabled");
});

// ---- Per-item `...` menu with `←`, `→`, `×` ----

test("clicking `...` on an image thumbnail or text/code/table row reveals left arrow (`←`), right arrow (`→`), and cancel (`×`), and queued items read as pressed", () => {
  const groups = buildFixtureGroups();
  const items = groups[0].items;
  const queuedImage = items.find((item) => item.kind === "image")!;
  const queuedTable = items.find((item) => item.kind === "table")!;

  const imageMenuHtml = renderToStaticMarkup(
    <ContextsPanel
      contextGroups={groups}
      expandedGroupId={groups[0].id}
      openActionItemId={queuedImage.id}
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
      injectedItemKeys={
        new Set([contextItemKey(queuedImage), contextItemKey(queuedTable)])
      }
      onLocateItem={() => {}}
    />
  );

  // Opening the image's `...` menu reveals `←`, `→`, and `×` in order inside `.context-thumb-menu`.
  expect(imageMenuHtml).toContain("context-thumb-menu");
  const imgInjectIdx = imageMenuHtml.indexOf("context-thumb-inject");
  const imgLocateIdx = imageMenuHtml.indexOf("context-thumb-locate");
  const imgRemoveIdx = imageMenuHtml.indexOf("context-thumb-remove");
  expect(imgInjectIdx).toBeGreaterThan(-1);
  expect(imgLocateIdx).toBeGreaterThan(imgInjectIdx);
  expect(imgRemoveIdx).toBeGreaterThan(imgLocateIdx);
  expect(imageMenuHtml).toContain("context-thumb-inject-active");
  expect(imageMenuHtml).toContain('aria-pressed="true"');

  const tableMenuHtml = renderToStaticMarkup(
    <ContextsPanel
      contextGroups={groups}
      expandedGroupId={groups[0].id}
      openActionItemId={queuedTable.id}
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
      injectedItemKeys={
        new Set([contextItemKey(queuedImage), contextItemKey(queuedTable)])
      }
      onLocateItem={() => {}}
    />
  );

  const rowInjectIdx = tableMenuHtml.indexOf("context-item-inject");
  const rowLocateIdx = tableMenuHtml.indexOf("context-item-locate");
  const rowRemoveIdx = tableMenuHtml.indexOf("context-item-remove");
  expect(rowInjectIdx).toBeGreaterThan(-1);
  expect(rowLocateIdx).toBeGreaterThan(rowInjectIdx);
  expect(rowRemoveIdx).toBeGreaterThan(rowLocateIdx);
  expect(tableMenuHtml).toContain("context-item-row-injected");
  expect(tableMenuHtml).toContain("context-item-action-active");
});

test("without an inject handler, an opened `...` menu renders no per-item `←` controls", () => {
  const groups = buildFixtureGroups();
  const firstImg = groups[0].items.find((item) => item.kind === "image")!;
  const html = renderToStaticMarkup(
    <ContextsPanel
      contextGroups={groups}
      expandedGroupId={groups[0].id}
      openActionItemId={firstImg.id}
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
  expect(html).not.toContain("context-thumb-inject");
  expect(html).not.toContain("context-item-inject");
});
