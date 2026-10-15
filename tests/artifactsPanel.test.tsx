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

// ---- Phase 3: code blocks and tables ----

const MIXED: Message[] = [
  { role: "user", content: "Rates in a table, and the script" },
  {
    role: "assistant",
    content:
      "Here:\n\n| Item | Qty | Price |\n| --- | --- | --- |\n| Rice | 2 | ₹120 |\n\n" +
      "```python\nimport requests\n\nprint(requests.get(URL))\n```",
    model: "gpt-4o",
  },
  { role: "assistant", content: "", imagePath: "freetalk-gen.png" },
];

const headingsOf = (html: string) =>
  [...html.matchAll(/<h3 class="artifacts-section-title">([^<]*)/g)].map((m) => m[1]);

test("an image-only chat renders no section headings, exactly as in Phase 1", () => {
  expect(render()).not.toContain("artifacts-section-title");
});

test("a mixed chat renders Images, Code and Tables in order, with chips for what is present", () => {
  const html = render({ artifacts: collectArtifacts(MIXED), unsavedAttachments: 0 });
  expect(headingsOf(html)).toEqual(["Images", "Code", "Tables"]);
  // No attachments in this chat, so no Attached chip.
  const chips = [...html.matchAll(/class="artifacts-filter[^"]*"[^>]*>([^<]*)<span/g)].map((m) => m[1]);
  expect(chips).toEqual(["All", "Generated", "Code", "Tables"]);
  expect(html).toContain('aria-label="Artifacts in this conversation"');
});

test("text rows read their kind, size and message, preview, and offer their actions", () => {
  const html = render({ artifacts: collectArtifacts(MIXED), unsavedAttachments: 0 });
  expect(html).toContain('aria-label="Python, 3 lines, message 2. Show in chat."');
  expect(html).toContain('aria-label="Table, 1 row, 3 columns, message 2. Show in chat."');
  // Code previews its first three non-empty lines; a table previews its header.
  expect(html).toContain("import requests\nprint(requests.get(URL))<");
  expect(html).toContain("Item · Qty · Price");
  // Preview, copy and download on each row, each with an expanded touch target.
  expect(html.match(/class="[^"]*artifact-row-action [^"]*tap-expand/g)).toHaveLength(6);
  expect(html).toContain('title="Copy code"');
  expect(html).toContain('title="Download CSV"');
});

test("a single text kind needs neither chips nor headings", () => {
  const onlyCode = collectArtifacts([MIXED[1]]).filter((a) => a.kind === "code");
  const html = render({ artifacts: onlyCode, unsavedAttachments: 0 });
  expect(html).not.toContain("artifacts-filters");
  expect(html).not.toContain("artifacts-section-title");
  expect(html).toContain("artifact-row-btn");
});

test("a pending generation opens the Images group beside text", () => {
  const html = render({
    artifacts: collectArtifacts([MIXED[1]]),
    unsavedAttachments: 0,
    isGeneratingImage: true,
  });
  expect(headingsOf(html)).toEqual(["Images", "Code", "Tables"]);
  expect(html).toContain("Generating…");
});
