// Render smoke tests for the artifacts panel.
//
// The unit tests in artifacts.test.ts pin the *collection*; these pin the
// component that renders it. The repo's other tests are static guards, so
// nothing else would catch a hook misordering or a bad prop shape here — and a
// crash inside the panel takes the whole shell down through the error boundary.
// `renderToStaticMarkup` runs no effects, so this covers structure and copy,
// not the Drive reads behind each thumbnail.

import { test, expect } from "bun:test";
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ArtifactsPanel } from "@/components/ArtifactsPanel";
import { collectArtifacts, collectImageArtifacts, countUnsavedAttachments } from "@/lib/artifacts";
import type { Message } from "@/lib/backend";

const MESSAGES: Message[] = [
  {
    role: "user",
    content: "What is on this receipt?\n\n[Images: 2 attached]",
    attachments: [
      { path: "freetalk-upload-1.jpg", name: "receipt.jpg", mimeType: "image/jpeg" },
      { path: "freetalk-upload-2.png" },
    ],
  },
  { role: "assistant", content: "It is a grocery bill." },
  { role: "assistant", content: "", imagePath: "freetalk-gen.png", model: "gpt-4o" },
  // A pre-persistence attachment: the marker is all that survives of it.
  { role: "user", content: "And this one?\n\n[Images: 1 attached]" },
];

const render = (overrides: Partial<ComponentProps<typeof ArtifactsPanel>> = {}) =>
  renderToStaticMarkup(
    <ArtifactsPanel
      artifacts={collectImageArtifacts(MESSAGES)}
      unsavedAttachments={countUnsavedAttachments(MESSAGES)}
      isOpen
      onToggle={() => {}}
      onLocate={() => {}}
      {...overrides}
    />
  );

test("every stored image becomes a tile, in transcript order", () => {
  const html = render();
  const labels = [...html.matchAll(/aria-label="([^"]*)\. Show in chat\."/g)].map((m) => m[1]);
  expect(labels).toEqual([
    "receipt.jpg, message 1",
    "Attached image, message 1",
    "Generated image, message 3",
  ]);
  // The legacy marker's image is not among them: it was never stored.
  expect(html).toContain("artifacts-count");
  expect(html).not.toContain("message 4");
});

test("the filter row offers both kinds when the chat has both", () => {
  const html = render();
  expect(html).toContain(">All<span");
  expect(html).toContain(">Generated<span");
  expect(html).toContain(">Attached<span");
  // Counts per kind: three stored images, one generated, two attached.
  const counts = [...html.matchAll(/artifacts-filter-count" aria-hidden="true">(\d+)</g)].map(
    (m) => m[1]
  );
  expect(counts).toEqual(["3", "1", "2"]);
});

test("a single kind hides the filter row — there is nothing to choose", () => {
  const html = render({
    artifacts: collectImageArtifacts([MESSAGES[2]]),
    unsavedAttachments: 0,
  });
  expect(html).not.toContain("artifacts-filters");
});

test("attachments that predate Drive persistence are reported, not tiled", () => {
  const html = render();
  expect(html).toContain("1 image attached before this version isn&#x27;t recoverable.");
  const plural = render({
    artifacts: [],
    unsavedAttachments: 3,
  });
  expect(plural).toContain("3 images attached before this version aren&#x27;t recoverable.");
  // Nothing to report, nothing rendered.
  expect(render({ artifacts: [], unsavedAttachments: 0 })).not.toContain("artifacts-note");
});

test("an empty transcript explains what collects here", () => {
  const html = render({ artifacts: [], unsavedAttachments: 0 });
  expect(html).toContain("Nothing collected in this chat yet");
  expect(html).toContain("artifacts-empty");
});

test("an in-flight generation shows a pending tile", () => {
  const html = render({ artifacts: [], unsavedAttachments: 0, isGeneratingImage: true });
  expect(html).toContain("Generating…");
  expect(html).toContain('role="status"');
  // The pending tile must not suppress the empty state's replacement.
  expect(html).not.toContain("Nothing collected in this chat yet");
});

test("the scrim only exists while the panel is open", () => {
  expect(render()).toContain("artifacts-overlay");
  expect(render({ isOpen: false })).not.toContain("artifacts-overlay");
  // Closed still means mounted (that is what makes it slide), so the panel and
  // its label are in the markup either way.
  expect(render({ isOpen: false })).toContain("artifacts-panel-closed");
  expect(render({ isOpen: false })).toContain('aria-label="Artifacts in this conversation"');
});

test("each tile offers preview, copy and download", () => {
  const html = render();
  expect(html.match(/Open preview of /g)).toHaveLength(3);
  expect(html.match(/title="Copy image"/g)).toHaveLength(3);
  expect(html.match(/title="Download image"/g)).toHaveLength(3);
  expect(html.match(/title="Show in chat — /g)).toHaveLength(3);
});

// ---- Phase 3a: code, tables and the Artifacts title ----

const MIXED: Message[] = [
  ...MESSAGES,
  {
    role: "assistant",
    content: [
      "Here is the script:",
      "",
      "```python",
      ...Array.from({ length: 24 }, (_, i) => `line_${i} = ${i}`),
      "```",
      "",
      "| Item | Price | Qty |",
      "|------|-------|-----|",
      "| tea | 20 | 2 |",
      "| coffee | 45 | 1 |",
    ].join("\n"),
  },
];

const renderMixed = (overrides: Partial<ComponentProps<typeof ArtifactsPanel>> = {}) =>
  renderToStaticMarkup(
    <ArtifactsPanel
      artifacts={collectArtifacts(MIXED)}
      unsavedAttachments={countUnsavedAttachments(MIXED)}
      isOpen
      onToggle={() => {}}
      onLocate={() => {}}
      {...overrides}
    />
  );

test("the title is Artifacts, and the panel is labelled as such", () => {
  const html = render();
  expect(html).toContain('<h2 class="artifacts-title">Artifacts</h2>');
  expect(html).toContain('aria-label="Artifacts in this conversation"');
});

test("a mixed chat renders Images, Code and Tables sections in that order", () => {
  const html = renderMixed();
  const headings = [...html.matchAll(/<h3 class="artifacts-group-title">([^<]*)<\/h3>/g)].map((m) => m[1]);
  expect(headings).toEqual(["Images", "Code", "Tables"]);
  expect(html.indexOf("Images")).toBeLessThan(html.indexOf("Python, 24 lines"));
});

test("an image-only chat has no section headings, like Phase 1", () => {
  const html = render();
  expect(html).not.toContain("artifacts-group-title");
});

test("chips appear only for kinds that are present, with code and tables added", () => {
  const html = renderMixed();
  for (const label of [">Generated<span", ">Attached<span", ">Code<span", ">Tables<span"]) {
    expect(html).toContain(label);
  }
  // Only images, no code: the chips are Generated and Attached alone.
  const imagesOnly = render();
  expect(imagesOnly).not.toContain(">Code<span");
  expect(imagesOnly).not.toContain(">Tables<span");
});

test("a code row's accessible name reads its label with commas, and it locates the block", () => {
  // Static markup runs no handlers, so this checks the accessible names only.
  const html = renderMixed();
  // The mixed answer is the fifth message, after the four Phase 1 messages.
  expect(html).toContain('aria-label="Python, 24 lines, message 5. Show in chat."');
  expect(html).toContain('aria-label="Table, 2 × 3, message 5. Show in chat."');
  expect(html).toContain("Open preview of Python · 24 lines");
  expect(html).toContain("Copy Python · 24 lines");
  expect(html).toContain("Download Python · 24 lines");
});

test("a table row previews its header cells", () => {
  const html = renderMixed();
  expect(html).toContain("Item · Price · Qty");
  expect(html).toContain("Table · 2 × 3");
});

test("the Code chip filters to code rows only", () => {
  const html = renderMixed({ artifacts: collectArtifacts(MIXED).filter((a) => a.kind === "code") });
  // A single kind hides the chip row entirely: there is nothing to choose.
  expect(html).not.toContain("artifacts-filters");
  expect(html).not.toContain("artifacts-group-title");
  expect(html).toContain("Python, 24 lines");
});

test("an empty transcript uses the Phase 3 empty-state copy", () => {
  const html = renderMixed({ artifacts: [], unsavedAttachments: 0 });
  expect(html).toContain("Nothing collected in this chat yet");
  expect(html).toContain("Images, code blocks, tables and text you extract from images collect here.");
});
