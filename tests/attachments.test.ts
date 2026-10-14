// Attachment preprocessing + the image wire form.
//
// The bug these pin: an image used to be sent as bare base64 with a "b" prefix
// inside `image_url.url`. That is not a URL, so providers failed to load the
// image and every image question came back as an error. The wire form is a
// data URI (what the SDK builds for a File media argument) or an http(s) URL.

import { test, expect } from "bun:test";
import { mockPuter, throwsMsg } from "./helpers";
import {
  MAX_ATTACHMENTS,
  appendImageMarker,
  formatBytes,
  hasImageMarker,
  prepareImageAttachments,
  stripImageMarker,
} from "../src/lib/attachments";
import { buildMessages, streamAIResponse, toImageBlock } from "../src/lib/streamingHandler";

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);

function pngFile(name = "shot.png"): File {
  return new File([PNG_BYTES], name, { type: "image/png" });
}

// ---- toImageBlock ----

test("toImageBlock keeps a data URL and its declared media type", () => {
  const block = toImageBlock("data:image/png;base64,AAAA");
  expect(block).toEqual({
    type: "image_url",
    image_url: { url: "data:image/png;base64,AAAA" },
  });
});

test("toImageBlock accepts an http(s) image URL", () => {
  expect(toImageBlock("https://cdn.test/a.jpeg")).toEqual({
    type: "image_url",
    image_url: { url: "https://cdn.test/a.jpeg" },
  });
});

test("toImageBlock refuses bare base64 instead of sending an unusable URL", () => {
  expect(() => toImageBlock("iVBORw0KGgoAAAANSUhEUg")).toThrow(/data: or https:/);
});

test("toImageBlock refuses the old b-prefixed base64 form", () => {
  // The "b"+base64 marker was never part of the image wire format; it came
  // from the SDK bundle's socket.io packet encoder.
  expect(() => toImageBlock("biVBORw0KGgoAAAANSUhEUg")).toThrow(/data: or https:/);
});

// ---- prepareImageAttachments ----

test("prepareImageAttachments returns data URLs in attachment order", async () => {
  const prepared = await prepareImageAttachments([
    pngFile("first.png"),
    pngFile("second.png"),
  ]);
  expect(prepared).toHaveLength(2);
  expect(prepared[0].dataUrl.startsWith("data:image/png;base64,")).toBe(true);
  expect(prepared[1].dataUrl.startsWith("data:image/png;base64,")).toBe(true);
  expect(prepared[0].mimeType).toBe("image/png");
  expect(prepared[0].dataUrl).not.toContain("data:image/png;base64,data:");
});

test("prepareImageAttachments caps a message at four images", async () => {
  const prepared = await prepareImageAttachments(
    Array.from({ length: MAX_ATTACHMENTS + 3 }, (_, i) => pngFile(`i${i}.png`))
  );
  expect(prepared).toHaveLength(MAX_ATTACHMENTS);
});

test("prepareImageAttachments reports the file it cannot send", async () => {
  const huge = new File([new Uint8Array(5 * 1024 * 1024)], "huge.png", {
    type: "image/png",
  });
  expect(await throwsMsg(() => prepareImageAttachments([huge]))).toContain(
    "huge.png"
  );
});

test("formatBytes reads in KB and MB", () => {
  expect(formatBytes(900)).toBe("900 B");
  expect(formatBytes(2048)).toBe("2 KB");
  expect(formatBytes(3 * 1024 * 1024)).toBe("3.0 MB");
});

// ---- messages on the wire ----

/** Capture the messages array `puter.ai.chat` receives. */
async function sentMessages(
  imageUrls?: string[]
): Promise<Record<string, unknown>[]> {
  let sent: Record<string, unknown>[] = [];
  mockPuter({
    ai: {
      chat: async (messages: Record<string, unknown>[]) => {
        sent = messages;
        return (async function* () {
          yield { type: "text", text: "ok" };
        })();
      },
    },
  });
  await streamAIResponse(
    [
      { role: "user", content: "look at this\n\n[Images: 1 attached]" },
      { role: "assistant", content: "Sure." },
    ],
    "and this one?",
    "gpt-5.4-nano",
    { onChunk: () => {}, onComplete: () => {}, onError: () => {} },
    imageUrls
  );
  return sent;
}

test("the current turn carries one image_url block per attachment", async () => {
  const sent = await sentMessages([
    "data:image/png;base64,AAA",
    "data:image/jpeg;base64,BBB",
  ]);
  const last = sent[sent.length - 1] as { content: unknown[] };
  expect(last.content).toEqual([
    { type: "text", text: "and this one?" },
    { type: "image_url", image_url: { url: "data:image/png;base64,AAA" } },
    { type: "image_url", image_url: { url: "data:image/jpeg;base64,BBB" } },
  ]);
  expect(JSON.stringify(sent)).not.toContain('"url":"b');
});

test("buildMessages keeps history text-only so base64 stays out of it", () => {
  const history = [{ role: "user" as const, content: "hi" }];
  const messages = buildMessages(history, "what is this?", [
    "data:image/png;base64,AAA",
  ]);
  expect(JSON.stringify(messages.slice(0, 1))).not.toContain("data:image");
  expect(messages).toHaveLength(2);
});

test("a bad image payload surfaces as a request error, not a silent drop", async () => {
  let error: Error | undefined;
  mockPuter({ ai: { chat: async () => ({}) } });
  await streamAIResponse(
    [],
    "why?",
    "gpt-5.4-nano",
    { onChunk: () => {}, onComplete: () => {}, onError: (e) => (error = e) },
    ["iVBORw0KGgo"]
  );
  expect(error?.message).toContain("data: or https:");
});

// ---- attachment note on stored messages ----

test("appendImageMarker keeps the prompt and adds the count", () => {
  expect(appendImageMarker("What is this?", 2)).toBe(
    "What is this?\n\n[Images: 2 attached]",
  );
});

test("appendImageMarker stands alone when the prompt was the image", () => {
  expect(appendImageMarker("", 1)).toBe("[Images: 1 attached]");
  expect(appendImageMarker("What is this?", 0)).toBe("What is this?");
});

test("hasImageMarker only matches the note at the end of a message", () => {
  expect(hasImageMarker("Describe it\n\n[Images: 3 attached]")).toBe(true);
  expect(hasImageMarker("[Images: 3 attached]\n\nmore follow-up")).toBe(false);
  expect(hasImageMarker("plain text")).toBe(false);
});

test("stripImageMarker round-trips a message for retry/edit", () => {
  const stored = appendImageMarker("Describe the second one", 2);
  expect(stripImageMarker(stored)).toBe("Describe the second one");
  expect(stripImageMarker("[Images: 1 attached]")).toBe("");
  expect(stripImageMarker("no note here")).toBe("no note here");
});
