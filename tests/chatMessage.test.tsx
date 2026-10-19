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
import { contextPayloadKey } from "@/lib/contextGroups";
import { ImageLightbox } from "@/components/ImageLightbox";
import { collectArtifacts, isImageArtifact } from "@/lib/artifacts";

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

test("messages render no add-to-context (FolderPlus) button", () => {
  // Adding to a context happens by dragging into the Contexts panel (or via
  // the artifacts panel); the per-message button was removed, so neither
  // message kind may render it even with every other action wired up.
  const noop = () => {};
  const user = renderToStaticMarkup(
    <ChatMessage role="user" content="A man dancing in water" onCopy={noop} onEdit={noop} />
  );
  const assistant = renderToStaticMarkup(
    <ChatMessage
      role="assistant"
      content="Quantum computers use qubits."
      onCopy={noop}
      onDelete={noop}
      onRetry={noop}
      onShareExchange={noop}
    />
  );
  for (const html of [user, assistant]) {
    expect(html).not.toContain("Add message to context");
    expect(html).not.toContain("Add selected text to context");
  }
  // The remaining actions still render.
  expect(user).toContain('aria-label="Copy message"');
  expect(user).toContain('aria-label="Edit message"');
  expect(assistant).toContain('aria-label="Copy message"');
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

// ---- Phase 3: block-level locate ----
//
// The artifacts panel locates a code block or table by the offset the
// collector computed; the transcript has to stamp the very same number.

const BLOCKS = [
  "<think>Plan:\n\n```js\nthinking()\n```\n\n| t | u |\n| - | - |\n| 1 | 2 |</think>Here is the script:",
  "",
  "```python",
  "print('hi')",
  "```",
  "",
  "| Item | Price |",
  "| --- | --- |",
  "| Tea | ₹40 |",
  "",
  "- then run:",
  "",
  "      indented()",
].join("\n");

test("the answer's code blocks and tables carry the collector's offsets", () => {
  const html = renderToStaticMarkup(<ChatMessage role="assistant" content={BLOCKS} />);
  const stamped = [...html.matchAll(/data-artifact-at="(\d+)"/g)].map((m) => Number(m[1]));
  const expected = collectArtifacts([{ role: "assistant", content: BLOCKS }]).flatMap((a) =>
    isImageArtifact(a) ? [] : [a.at]
  );
  // Fenced code, a table and code indented inside a list item.
  expect(expected).toHaveLength(3);
  expect(stamped).toEqual(expected);
});

test("blocks in the thinking section carry no offsets", () => {
  const html = renderToStaticMarkup(<ChatMessage role="assistant" content={BLOCKS} />);
  const thinking = /class="msg-think-body"[\s\S]*?class="msg-answer"/.exec(html)?.[0] ?? "";
  // Rendered (thinking opens expanded), with its own code and table...
  expect(thinking).toContain("thinking()");
  expect(thinking).toContain("md-table-wrap");
  // ...but unstamped: its offsets index a different string.
  expect(thinking).not.toContain("data-artifact-at");
});

// ---- Per-artifact `←` use-as-context ----
//
// Every artifact in the transcript (the answer text, a code block, a table, a
// generated image) can be queued straight in the composer, matching the
// Contexts panel's per-item `←` button.

test("the answer, its code block, and its table each offer `←` use-as-context", () => {
  const html = renderToStaticMarkup(
    <ChatMessage role="assistant" content={BLOCKS} onUseAsContext={() => {}} />
  );
  expect(html).toContain('aria-label="Use answer as context"');
  expect(html).toContain('aria-label="Use code block as context"');
  expect(html).toContain('aria-label="Use table as context"');
  // The table bar's passive hint becomes a real control when the action exists
  // (the drag handles keep their own "Drag to add as context" tooltip).
  expect(html).not.toContain("<span>Drag to add as context</span>");
});

test("a generated image offers its own `←` use-as-context control", () => {
  const html = renderToStaticMarkup(
    <ChatMessage
      role="assistant"
      content=""
      image="data:image/png;base64,AAAA"
      onUseAsContext={() => {}}
    />
  );
  expect(html).toContain('aria-label="Use image as context"');
  expect(html).toContain("msg-image-context");
});

test("a user message's text can be queued as context", () => {
  const html = renderToStaticMarkup(
    <ChatMessage
      role="user"
      content="A man dancing in water"
      onUseAsContext={() => {}}
    />
  );
  expect(html).toContain('aria-label="Use message as context"');
});

test("a queued answer reads as pressed instead of offering to queue it again", () => {
  const content = "Quantum computers use qubits.";
  const key = contextPayloadKey({ kind: "text", text: content, label: content });
  const html = renderToStaticMarkup(
    <ChatMessage
      role="assistant"
      content={content}
      onUseAsContext={() => {}}
      injectedContextKeys={new Set([key])}
    />
  );
  expect(html).toContain('aria-label="Remove answer from input context"');
  expect(html).toContain('aria-pressed="true"');
});

test("without a handler, messages render no use-as-context controls", () => {
  const html = renderToStaticMarkup(
    <ChatMessage role="assistant" content={BLOCKS} />
  );
  expect(html).not.toContain("Use answer as context");
  expect(html).not.toContain("Use code block as context");
  expect(html).not.toContain("Use table as context");
  // The drag affordance and its hint remain for the drag-only path.
  expect(html).toContain("Drag to add as context");
});
