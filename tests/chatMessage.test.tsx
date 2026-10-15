// Render smoke tests for the transcript message and its image preview.
//
// The preview overlay lives inside every message, so a message that has nothing
// to preview must not put a dialog on screen. That regressed once: the preview
// was mounted unconditionally with a null `src`, which the browser rendered as
// a broken-image placeholder ("Image preview") stretched over the app on first
// load. `renderToStaticMarkup` runs no effects, so this pins structure — what
// the first paint contains — which is exactly where the bug showed up.

import { test, expect } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ChatMessage } from "@/components/ChatMessage";
import { ImageLightbox } from "@/components/ImageLightbox";
import { collectArtifacts } from "@/lib/artifacts";

test("a text-only answer opens no overlay", () => {
  const html = renderToStaticMarkup(
    <ChatMessage role="assistant" content="Quantum computers use qubits." />
  );
  expect(html).not.toContain("lightbox");
  expect(html).not.toContain('role="dialog"');
});

test("a user message opens no overlay", () => {
  const html = renderToStaticMarkup(<ChatMessage role="user" content="hello" />);
  expect(html).not.toContain("lightbox");
  expect(html).not.toContain('role="dialog"');
});

test("an image answer previews only once the image is opened", () => {
  const html = renderToStaticMarkup(
    <ChatMessage role="assistant" content="" image="data:image/png;base64,AAAA" />
  );
  // The inline thumbnail is there to click; the overlay is not open yet.
  expect(html).toContain("msg-image");
  expect(html).not.toContain("lightbox");
  expect(html).not.toContain('role="dialog"');
});

test("a restored image message waits for its Drive read without an overlay", () => {
  // The startup case: a stored conversation is replayed before the saved image
  // resolves, so `imageSrc` is null on the first paint.
  const html = renderToStaticMarkup(
    <ChatMessage role="assistant" content="" imagePath="freetalk-gen.png" />
  );
  expect(html).toContain("Loading image…");
  expect(html).not.toContain("lightbox");
  expect(html).not.toContain('role="dialog"');
});

test("the overlay itself refuses to mount without a src", () => {
  expect(renderToStaticMarkup(<ImageLightbox src="" onClose={() => {}} />)).toBe("");
  expect(
    renderToStaticMarkup(<ImageLightbox src="" onClose={() => {}} caption="receipt.jpg" />
  )).toBe("");
});

test("the overlay renders the image it was given", () => {
  const html = renderToStaticMarkup(
    <ImageLightbox
      src="data:image/png;base64,AAAA"
      alt="receipt.jpg"
      caption="receipt.jpg"
      onClose={() => {}}
    />
  );
  expect(html).toContain('role="dialog"');
  expect(html).toContain('src="data:image/png;base64,AAAA"');
  expect(html).toContain("receipt.jpg");
});

// ---- Phase 3a: block offsets (spec §6.5) ----

const MIXED_ANSWER = [
  "Here it is:",
  "",
  "```python",
  "print('hi')",
  "```",
  "",
  "| A | B |",
  "|---|---|",
  "| 1 | 2 |",
  "",
  "    indented()",
].join("\n");

test("the answer stamps each block with the offset the collector reports", () => {
  const html = renderToStaticMarkup(
    <ChatMessage role="assistant" content={MIXED_ANSWER} messageIndex={3} />
  );
  const stamped = [...html.matchAll(/data-artifact-at="(\d+)"/g)].map((m) => Number(m[1]));
  const collected = collectArtifacts([{ role: "assistant", content: MIXED_ANSWER }])
    .filter((a) => a.kind === "code" || a.kind === "table")
    .map((a) => (a.kind === "code" || a.kind === "table" ? a.at : -1));
  expect(collected).toHaveLength(3);
  expect(stamped.sort((a, b) => a - b)).toEqual(collected.sort((a, b) => a - b));
});

test("the thinking section stamps nothing, so its offsets cannot collide", () => {
  const content = "<think>\n```js\nlet a = 1\n```\n</think>\n\nThe answer is 4.";
  const html = renderToStaticMarkup(<ChatMessage role="assistant" content={content} />);
  expect(html).not.toContain("data-artifact-at");
});
