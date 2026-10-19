// Image-to-image (img2img) editing — end-to-end recheck of the wire form.
//
// The user must be able to edit an EXISTING image in two ways:
//   1. attach / upload an image + a text prompt  -> edit THAT uploaded image;
//   2. use an image already in the chat as context + a text prompt -> edit it.
// Either way the provider must receive the image as `input_image` (image-to-
// image), never a plain text-to-image that draws a brand-new scene.
//
// This pins the whole chain against a mocked Puter SDK:
//   resolveGenerationEditBase -> loadImageDataUrl -> generateImage -> txt2img.
// A red-capable regression: if the edit base is ever dropped again (the original
// bug), the provider call loses `input_image` and these assertions fail.

import { test, expect, beforeEach } from "bun:test";
import { mockPuter } from "./helpers";
import type { Message } from "../src/lib/backend";
import {
  findCurrentImage,
  resolveGenerationEditBase,
} from "../src/lib/imageContext";
import { generateImage, loadImageDataUrl } from "../src/lib/images";

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 1, 2, 3,
]);
const UPLOAD_URL = "data:image/png;base64,UPLOAD";

interface Txt2ImgCall {
  prompt: string;
  options: Record<string, unknown>;
}
let calls: Txt2ImgCall[];

beforeEach(() => {
  calls = [];
  mockPuter({
    fs: {
      read: async (path: string) => {
        if (path === "freetalk-current.png") {
          return new Blob([PNG_BYTES], { type: "image/png" });
        }
        throw new Error(`no such file: ${path}`);
      },
    },
    ai: {
      txt2img: async (prompt: string, options: Record<string, unknown>) => {
        calls.push({ prompt, options });
        return { src: "data:image/png;base64,OUT" };
      },
    },
  });
});

test("uploading an image and asking for a change edits that image, not a new one", async () => {
  // A fresh chat, no current image: only the uploaded attachment is the edit base.
  const messages: Message[] = [
    { role: "user", content: "hi" },
    { role: "assistant", content: "hello" },
  ];
  const { inputImages, base } = await resolveGenerationEditBase({
    messages,
    attachmentDataUrls: [UPLOAD_URL],
    attachmentBase: { src: "freetalk-upload.png", origin: "attachment" },
    contextImageDataUrls: [],
    contextBase: null,
    loadImageDataUrl,
  });
  expect(inputImages).toEqual([UPLOAD_URL]);
  expect(base).toEqual({ src: "freetalk-upload.png", origin: "attachment" });

  await generateImage("remove the people", { inputImages });
  expect(calls).toHaveLength(1);
  // The model received the uploaded image as the reference -> image-to-image.
  expect(calls[0].options.input_image).toBe(UPLOAD_URL);
  expect(calls[0].options).not.toHaveProperty("input_images");
});

test("a chat image used as context is edited in place via input_image", async () => {
  // Generate a cat, then want a change to THAT cat without re-attaching it.
  const messages: Message[] = [
    {
      role: "user",
      content: "draw a cat",
      attachments: [{ path: "freetalk-upload.png" }],
    },
    {
      role: "assistant",
      content: "",
      imagePath: "freetalk-current.png",
      editedFrom: { src: "freetalk-upload.png", origin: "attachment" },
    },
  ];
  // Sanity: the transcript's current image is the generated result, not the
  // attachment that fed it (a result always beats the attachments that made it).
  expect(findCurrentImage(messages)?.ref).toBe("freetalk-current.png");

  const { inputImages, base } = await resolveGenerationEditBase({
    messages,
    attachmentDataUrls: [],
    attachmentBase: null,
    contextImageDataUrls: [],
    contextBase: null,
    loadImageDataUrl,
  });
  // Read back from Drive resolves to a data URI the provider accepts.
  expect(inputImages).toHaveLength(1);
  expect(inputImages[0].startsWith("data:image/png;base64,")).toBe(true);
  expect(inputImages[0]).not.toBe(UPLOAD_URL);
  expect(base).toEqual({ src: "freetalk-current.png", origin: "generated" });

  await generateImage("make it night", { inputImages });
  expect(calls).toHaveLength(1);
  // The provider got the CURRENT image as the reference -> edits it in place,
  // instead of synthesising a fresh scene.
  expect(calls[0].options.input_image).toBe(inputImages[0]);
  expect(calls[0].options).not.toHaveProperty("input_images");
});

test("with no image anywhere a prompt is a plain text-to-image (input_image absent)", async () => {
  const messages: Message[] = [
    { role: "user", content: "hi" },
    { role: "assistant", content: "hello" },
  ];
  const { inputImages } = await resolveGenerationEditBase({
    messages,
    attachmentDataUrls: [],
    attachmentBase: null,
    contextImageDataUrls: [],
    contextBase: null,
    loadImageDataUrl,
  });
  expect(inputImages).toEqual([]);

  await generateImage("a sunset over mountains", { inputImages });
  expect(calls).toHaveLength(1);
  expect(calls[0].options).not.toHaveProperty("input_image");
  expect(calls[0].options).not.toHaveProperty("input_images");
});
