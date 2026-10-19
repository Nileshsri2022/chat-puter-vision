// The image an image-generation turn edits.
//
// The bug these pin: attaching an image and asking for a change to it
// produced an unrelated picture. Three gaps fed it — the generate path never
// received the attachments, the SDK's `input_image` option (which is the
// difference between "draw a picture of X" and "change this picture") was
// never sent, and no image context survived a turn, so a follow-up prompt
// started from scratch.
//
// The rules that keep it fixed:
//   - the edit base is the turn's own attachments, else the conversation's
//     current image, else nothing (plain text-to-image);
//   - a generated result beats the attachments that fed it, so an edit chain
//     moves forward instead of stepping back;
//   - the reference reaches the provider as `input_image` / `input_images`.

import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mockPuter, throwsMsg } from "./helpers";
import type { Message } from "../src/lib/backend";
import {
  findCurrentImage,
  resolveGenerationEditBase,
} from "../src/lib/imageContext";
import {
  buildTxt2ImgOptions,
  generateImage,
  loadImageDataUrl,
} from "../src/lib/images";
import { mergeDocs, type SyncDoc } from "../src/lib/sync";

const PNG_URL = "data:image/png;base64,AAAA";
const JPEG_URL = "data:image/jpeg;base64,BBBB";

// ---- findCurrentImage ----

test("a generated image is the conversation's current image", () => {
  const messages: Message[] = [
    { role: "user", content: "draw a sunset" },
    { role: "assistant", content: "", imagePath: "freetalk-abc.png" },
  ];
  expect(findCurrentImage(messages)).toEqual({
    ref: "freetalk-abc.png",
    kind: "drive",
    origin: "generated",
    messageIndex: 1,
  });
});

test("an attached image is the current image when nothing was generated", () => {
  const messages: Message[] = [
    { role: "user", content: "what is this?", attachments: [{ path: "freetalk-upload-1.png" }] },
    { role: "assistant", content: "A diagram." },
  ];
  expect(findCurrentImage(messages)).toEqual({
    ref: "freetalk-upload-1.png",
    kind: "drive",
    origin: "attachment",
    messageIndex: 0,
  });
});

test("a generated result beats the attachments that fed it", () => {
  // The chain must move forward: after an edit, the next prompt means the
  // result, not the original the edit started from.
  const messages: Message[] = [
    { role: "user", content: "remove the people", attachments: [{ path: "freetalk-upload-1.png" }] },
    { role: "assistant", content: "", imagePath: "freetalk-edit-1.png" },
  ];
  expect(findCurrentImage(messages)?.ref).toBe("freetalk-edit-1.png");
  expect(findCurrentImage(messages)?.origin).toBe("generated");
});

test("the newest image in the transcript wins", () => {
  const messages: Message[] = [
    { role: "user", content: "one", attachments: [{ path: "freetalk-upload-1.png" }] },
    { role: "assistant", content: "", imagePath: "freetalk-a.png" },
    { role: "user", content: "two", attachments: [{ path: "freetalk-upload-2.png" }] },
  ];
  expect(findCurrentImage(messages)).toEqual({
    ref: "freetalk-upload-2.png",
    kind: "drive",
    origin: "attachment",
    messageIndex: 2,
  });
});

test("a message with several attachments uses the first one", () => {
  // The first attachment is the primary subject; the rest are secondary
  // references.
  const messages: Message[] = [
    {
      role: "user",
      content: "combine these",
      attachments: [{ path: "freetalk-upload-1.png" }, { path: "freetalk-upload-2.png" }],
    },
  ];
  expect(findCurrentImage(messages)?.ref).toBe("freetalk-upload-1.png");
});

test("a message with an empty attachment list is skipped", () => {
  const messages: Message[] = [
    { role: "user", content: "one", attachments: [] },
    { role: "assistant", content: "", imagePath: "freetalk-a.png" },
  ];
  expect(findCurrentImage(messages)?.ref).toBe("freetalk-a.png");
});

test("a conversation with no images has no current image", () => {
  const messages: Message[] = [
    { role: "user", content: "hello" },
    { role: "assistant", content: "hi" },
  ];
  expect(findCurrentImage(messages)).toBeNull();
});

test("a legacy inline image is a base when it carries its own bytes", () => {
  // Images from before Drive persistence live in `message.image`. A data URI
  // is self-contained, so it can still be edited; a hosted URL may be gone.
  const messages: Message[] = [
    { role: "assistant", content: "", image: PNG_URL },
  ];
  expect(findCurrentImage(messages)).toEqual({
    ref: PNG_URL,
    kind: "data",
    origin: "generated",
    messageIndex: 0,
  });
});

test("a legacy hosted URL is not a base — it may have expired", () => {
  const messages: Message[] = [
    { role: "assistant", content: "", image: "https://cdn.test/old.png" },
  ];
  expect(findCurrentImage(messages)).toBeNull();
});

// ---- buildTxt2ImgOptions ----

test("a plain text-to-image call sends no reference", () => {
  const options = buildTxt2ImgOptions("freetalk-abc.png");
  expect(options).toEqual({ puter_output_path: "freetalk-abc.png" });
  expect(options).not.toHaveProperty("input_image");
  expect(options).not.toHaveProperty("input_images");
});

test("one reference goes in as input_image", () => {
  const options = buildTxt2ImgOptions("freetalk-abc.png", { inputImages: [PNG_URL] });
  expect(options.input_image).toBe(PNG_URL);
  expect(options).not.toHaveProperty("input_images");
});

test("several references go in as input_images", () => {
  const options = buildTxt2ImgOptions("freetalk-abc.png", {
    inputImages: [PNG_URL, JPEG_URL],
  });
  expect(options.input_images).toEqual([PNG_URL, JPEG_URL]);
  expect(options).not.toHaveProperty("input_image");
});

test("a shared media type is passed along for the provider to label the upload", () => {
  const options = buildTxt2ImgOptions("freetalk-abc.png", {
    inputImages: [PNG_URL, PNG_URL],
  });
  expect(options.input_image_mime_type).toBe("image/png");
});

test("mixed media types do not get one misleading label", () => {
  const options = buildTxt2ImgOptions("freetalk-abc.png", {
    inputImages: [PNG_URL, JPEG_URL],
  });
  expect(options).not.toHaveProperty("input_image_mime_type");
});

test("the model and quality are passed through when set", () => {
  const options = buildTxt2ImgOptions("freetalk-abc.png", {
    model: "gpt-image-2",
    quality: "high",
  });
  expect(options.model).toBe("gpt-image-2");
  expect(options.quality).toBe("high");
});

// ---- generateImage ----

interface Call {
  prompt: string;
  options: Record<string, unknown>;
}

/** Mock the SDK's txt2img and record what it was called with. */
function mockTxt2img(
  handler?: (call: Call, attempt: number) => Promise<unknown> | unknown
): Call[] {
  const calls: Call[] = [];
  mockPuter({
    ai: {
      txt2img: async (prompt: string, options: Record<string, unknown>) => {
        const call = { prompt, options };
        calls.push(call);
        if (handler) return await handler(call, calls.length);
        return { src: PNG_URL };
      },
    },
  });
  return calls;
}

test("the call carries the reference and saves the result to Drive", async () => {
  const calls = mockTxt2img();
  const path = await generateImage("remove the people", { inputImages: [PNG_URL] });
  expect(calls).toHaveLength(1);
  expect(calls[0].prompt).toBe("remove the people");
  expect(calls[0].options.input_image).toBe(PNG_URL);
  // The file is saved, so the next edit can read it back.
  expect(calls[0].options.puter_output_path).toBe(path);
  expect(path).toMatch(/^freetalk-[\w-]+\.png$/);
});

test("a text-to-image call is unchanged", async () => {
  const calls = mockTxt2img();
  await generateImage("a sunset over mountains");
  expect(calls[0].options).not.toHaveProperty("input_image");
  expect(calls[0].options).not.toHaveProperty("input_images");
});

test("a route that takes one reference is retried with the first image", async () => {
  // Cloudflare FLUX.2 rejects a list of references with a plain bad_request.
  const calls = mockTxt2img((_call, attempt) => {
    if (attempt === 1) {
      const error = new Error("too many references") as Error & { errorCode?: string };
      error.errorCode = "bad_request";
      throw error;
    }
    return { src: PNG_URL };
  });
  const path = await generateImage("remove the people", {
    inputImages: [PNG_URL, JPEG_URL],
  });
  expect(calls).toHaveLength(2);
  expect(calls[0].options.input_images).toEqual([PNG_URL, JPEG_URL]);
  expect(calls[1].options.input_image).toBe(PNG_URL);
  expect(calls[1].options.puter_output_path).toBe(path);
});

test("a refusal is not retried — it would be refused again", async () => {
  const calls = mockTxt2img(() => {
    const error = new Error("flagged") as Error & { errorCode?: string };
    error.errorCode = "moderation_flagged";
    throw error;
  });
  const message = await throwsMsg(() =>
    generateImage("remove the people", { inputImages: [PNG_URL, JPEG_URL] })
  );
  expect(calls).toHaveLength(1);
  expect(message).toMatch(/refused by the image filter/);
});

test("a retry that also fails surfaces the provider's message", async () => {
  mockTxt2img(() => {
    const error = new Error("reference rejected") as Error & { errorCode?: string };
    error.errorCode = "bad_request";
    throw error;
  });
  const message = await throwsMsg(() =>
    generateImage("remove the people", { inputImages: [PNG_URL, JPEG_URL] })
  );
  expect(message).toMatch(/reference rejected/);
});

test("generation without the SDK says so", async () => {
  mockPuter({});
  const message = await throwsMsg(() => generateImage("a sunset"));
  expect(message).toMatch(/not available/);
});

// ---- reading an edit base back ----

test("a stored image is read back as a data URI", async () => {
  mockPuter({
    fs: {
      read: async () => new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }),
    },
  });
  const url = await loadImageDataUrl("freetalk-abc.png");
  expect(url.startsWith("data:image/png;base64,")).toBe(true);
});

test("a follow-up prompt edits the image the previous turn produced", async () => {
  // The whole chain the bug broke: the transcript's current image → the bytes
  // of that image → the reference the provider receives.
  const calls: Call[] = [];
  const stored = new Map<string, Blob>([
    ["freetalk-edit-1.png", new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" })],
  ]);
  mockPuter({
    fs: {
      read: async (path: string) => {
        const blob = stored.get(path);
        if (!blob) throw new Error(`no such file: ${path}`);
        return blob;
      },
    },
    ai: {
      txt2img: async (prompt: string, options: Record<string, unknown>) => {
        calls.push({ prompt, options });
        return { src: PNG_URL };
      },
    },
  });

  // The transcript after a first edit turn.
  const messages: Message[] = [
    {
      role: "user",
      content: "remove the people\n\n[Images: 1 attached]",
      attachments: [{ path: "freetalk-upload-1.png" }],
    },
    {
      role: "assistant",
      content: "",
      imagePath: "freetalk-edit-1.png",
      editedFrom: { src: "freetalk-upload-1.png", origin: "attachment" },
    },
  ];

  // The follow-up turn: no new attachment, so the base is the current image.
  const base = findCurrentImage(messages);
  expect(base?.ref).toBe("freetalk-edit-1.png");
  const inputImages = [await loadImageDataUrl(base!.ref)];
  await generateImage("now make it night", { inputImages });

  expect(calls).toHaveLength(1);
  expect(calls[0].prompt).toBe("now make it night");
  // The model got pixels to work from — this is what was missing.
  expect(calls[0].options.input_image).toBe(inputImages[0]);
  expect(inputImages[0].startsWith("data:image/png;base64,")).toBe(true);
});

// ---- resolveGenerationEditBase: the decision that picks the edit base ----

// What the page used to get wrong: a follow-up turn with no new attachment does
// not resolve to the conversation's current image, so the prompt "now make it
// night" text-to-images a fresh scene instead of editing the one on screen.
const fakeLoad = (map: Record<string, string>) => async (path: string) => {
  const url = map[path];
  if (!url) throw new Error(`no such file: ${path}`);
  return url;
};

test("a follow-up turn with no attachment edits the conversation's current image", async () => {
  const messages: Message[] = [
    {
      role: "user",
      content: "remove the people\n\n[Images: 1 attached]",
      attachments: [{ path: "freetalk-upload-1.png" }],
    },
    {
      role: "assistant",
      content: "",
      imagePath: "freetalk-edit-1.png",
      editedFrom: { src: "freetalk-upload-1.png", origin: "attachment" },
    },
  ];
  const load = fakeLoad({
    "freetalk-edit-1.png": "data:image/png;base64,EDITED",
  });
  const { inputImages, base } = await resolveGenerationEditBase({
    messages,
    attachmentDataUrls: [],
    attachmentBase: null,
    contextImageDataUrls: [],
    contextBase: null,
    loadImageDataUrl: load,
  });
  // The model gets the current image's pixels — this is what was missing.
  expect(inputImages).toEqual(["data:image/png;base64,EDITED"]);
  expect(base).toEqual({ src: "freetalk-edit-1.png", origin: "generated" });
});

test("a generate turn with no image anywhere is a plain text-to-image", async () => {
  const messages: Message[] = [
    { role: "user", content: "hi" },
    { role: "assistant", content: "hello" },
  ];
  const { inputImages, base } = await resolveGenerationEditBase({
    messages,
    attachmentDataUrls: [],
    attachmentBase: null,
    contextImageDataUrls: [],
    contextBase: null,
    loadImageDataUrl: fakeLoad({}),
  });
  expect(inputImages).toEqual([]);
  expect(base).toBeNull();
});

test("this turn's attachments beat the conversation's current image", async () => {
  let loadCalled = false;
  const messages: Message[] = [
    { role: "assistant", content: "", imagePath: "freetalk-old.png" },
  ];
  const { inputImages, base } = await resolveGenerationEditBase({
    messages,
    attachmentDataUrls: [PNG_URL],
    attachmentBase: { src: "freetalk-upload-1.png", origin: "attachment" },
    contextImageDataUrls: [],
    contextBase: null,
    loadImageDataUrl: async () => {
      loadCalled = true;
      return "data:image/png;base64,x";
    },
  });
  expect(inputImages).toEqual([PNG_URL]);
  expect(base).toEqual({ src: "freetalk-upload-1.png", origin: "attachment" });
  // The current image must not be read when an attachment is explicit.
  expect(loadCalled).toBe(false);
});

test("an injected context group's images are edited when there are no attachments", async () => {
  const messages: Message[] = [
    { role: "assistant", content: "", imagePath: "freetalk-old.png" },
  ];
  const { inputImages, base } = await resolveGenerationEditBase({
    messages,
    attachmentDataUrls: [],
    attachmentBase: null,
    contextImageDataUrls: [JPEG_URL],
    contextBase: { src: "ctx-1.png", origin: "generated" },
    loadImageDataUrl: async () => "data:image/png;base64,x",
  });
  expect(inputImages).toEqual([JPEG_URL]);
  expect(base).toEqual({ src: "ctx-1.png", origin: "generated" });
});

test("a current image whose bytes cannot be read aborts the edit", async () => {
  const messages: Message[] = [
    { role: "assistant", content: "", imagePath: "freetalk-edit-1.png" },
  ];
  await expect(
    resolveGenerationEditBase({
      messages,
      attachmentDataUrls: [],
      attachmentBase: null,
      contextImageDataUrls: [],
      contextBase: null,
      loadImageDataUrl: async () => {
        throw new Error("read failed");
      },
    })
  ).rejects.toThrow();
});

test("multiple attachments on this turn edit all of them, base is the first", async () => {
  // All this turn's attachments go to the model as references (multi-image
  // edit), but the lineage records only the first as the primary subject.
  const messages: Message[] = [
    { role: "user", content: "combine these" },
    { role: "assistant", content: "", imagePath: "freetalk-current.png" },
  ];
  const { inputImages, base } = await resolveGenerationEditBase({
    messages,
    attachmentDataUrls: [PNG_URL, JPEG_URL],
    attachmentBase: { src: "freetalk-upload-1.png", origin: "attachment" },
    contextImageDataUrls: [],
    contextBase: null,
    loadImageDataUrl: fakeLoad({}),
  });
  expect(inputImages).toEqual([PNG_URL, JPEG_URL]);
  expect(base).toEqual({ src: "freetalk-upload-1.png", origin: "attachment" });
});

test("a chat image is used even when the attachment that fed it also exists", async () => {
  // A result must beat the attachments that fed it, so an edit chain moves
  // forward instead of re-anchoring on the original attachment.
  const messages: Message[] = [
    {
      role: "user",
      content: "remove the people",
      attachments: [{ path: "freetalk-upload-1.png" }],
    },
    { role: "assistant", content: "", imagePath: "freetalk-edit-1.png" },
  ];
  const { inputImages, base } = await resolveGenerationEditBase({
    messages,
    attachmentDataUrls: [],
    attachmentBase: null,
    contextImageDataUrls: [],
    contextBase: null,
    loadImageDataUrl: fakeLoad({
      "freetalk-edit-1.png": "data:image/png;base64,EDITED",
    }),
  });
  expect(inputImages).toEqual(["data:image/png;base64,EDITED"]);
  expect(base).toEqual({ src: "freetalk-edit-1.png", origin: "generated" });
});

// ---- the lineage survives a sync ----

interface TestConv {
  id: string;
  title: string;
  timestamp: Date;
  messages: unknown[];
  updatedAt: number;
}

const conv = (id: string, updatedAt: number, messages: unknown[]): TestConv => ({
  id,
  title: id,
  timestamp: new Date(updatedAt),
  messages,
  updatedAt,
});

const doc = (convs: TestConv[]): SyncDoc =>
  ({ version: 1, conversations: convs as never[], deleted: {} }) as SyncDoc;

test("the edit lineage survives a local sync untouched", () => {
  const edited: Message = {
    role: "assistant",
    content: "",
    imagePath: "freetalk-edit-1.png",
    editedFrom: { src: "freetalk-upload-1.png", origin: "attachment" },
  };
  const { doc: merged } = mergeDocs(doc([conv("a", 100, [edited])]), null);
  const messages = (merged.conversations[0] as unknown as TestConv).messages;
  expect(messages[0]).toEqual(edited);
});

// ---- the composer contract ----

const SRC = join(import.meta.dir, "..", "src");
const read = (rel: string) => readFileSync(join(SRC, rel), "utf8");

test("the generate path receives the attachments the user dropped", () => {
  const input = read("components/ChatInput.tsx");
  // The attachments used to be dropped here: the call got the prompt only.
  expect(input).toContain(
    "onGenerateImage(message, images.length > 0 ? images : undefined)"
  );
  // …and they are consumed, so the previews do not linger and look unsent.
  const submit = /const handleSubmit[\s\S]*?\n\s{2}\};/.exec(input)?.[0] ?? "";
  expect(submit).toContain("clearImages()");
});

test("attaching is not gated on the chat model in generation mode", () => {
  const input = read("components/ChatInput.tsx");
  // The image is read by the image model, so the chat model's vision support
  // says nothing about whether an attachment can be made.
  expect(input).toContain(
    "const canAttachImages = imageGenerationMode || modelSupportsImages;"
  );
  // The previews, the attach button and the file input all follow the gate.
  expect(input.match(/canAttachImages &&/g)?.length).toBe(3);
  expect(input).not.toMatch(
    /\{modelSupportsImages\s+&&\s*\(\s*<Button[\s\S]{0,400}?Attach\s+images/
  );
});

test("the page resolves explicit context or attachments and passes the reference on", () => {
  const page = read("pages/Index.tsx");
  expect(page).toContain("resolveContextGroupForTask");
  expect(page).toContain("loadImageDataUrl");
  expect(page).toContain("generateImage(generationPrompt, { inputImages })");
  // A base that cannot be read must not fall back to a text-to-image: that is
  // the bug this whole path exists to fix.
  expect(page).toContain("Could not read the image to edit");
});

test("the generate path edits the conversation's current image when nothing is attached", () => {
  // The img-to-img (image-as-context) bug: a ✨ turn with a current image in
  // the chat but no fresh attachment used to become a plain text-to-image. The
  // page must derive the base from the transcript, not only from this turn's
  // attachments or the injected context.
  const page = read("pages/Index.tsx");
  expect(page).toContain("resolveGenerationEditBase");
  expect(page).toContain("findCurrentImage");
});

test("the composer shows the explicit injected context pill and attachment hint without forcing last-image edit", () => {
  const input = read("components/ChatInput.tsx");
  expect(input).toContain("will be edited.");
  expect(input).toContain("composer-context-pill");
  expect(input).not.toContain("Editing the last image in this chat.");
  expect(input).toContain('aria-live="polite"');
});

test("a stored image with a generic MIME is coerced to an image data URI", async () => {
  // A Drive read can hand back a Blob typed application/octet-stream (or with
  // no type at all). That used to become `data:application/octet-stream;...`,
  // which the chat path rejects as "Attached images must be data: or https:
  // URLs" — the send failed instead of attaching the context image.
  mockPuter({
    fs: {
      read: async () =>
        new Blob([new Uint8Array([1, 2, 3])], { type: "application/octet-stream" }),
    },
  });
  const url = await loadImageDataUrl("freetalk-upload-abc.jpg");
  expect(url.startsWith("data:image/jpeg;base64,")).toBe(true);
});
