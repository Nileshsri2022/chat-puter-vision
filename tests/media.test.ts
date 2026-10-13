import { test, expect } from "bun:test";
import { mockPuter, throwsMsg } from "./helpers";
import { generateImage } from "../src/lib/images";
import { transcribeAudio } from "../src/lib/speech";

// ---- generateImage ----

test("generateImage resolves the image src", async () => {
  mockPuter({
    ai: { txt2img: async () => ({ src: "https://img/x.png" }) },
  });
  expect(await generateImage("a sunset")).toBe("https://img/x.png");
});

test("generateImage rejects an empty result", async () => {
  mockPuter({ ai: { txt2img: async () => ({ src: "" }) } });
  expect(await throwsMsg(() => generateImage("x"))).toContain("no image");
});

test("generateImage maps prompt_required", async () => {
  mockPuter({
    ai: {
      txt2img: async () => {
        throw { code: "prompt_required" };
      },
    },
  });
  expect(await throwsMsg(() => generateImage("x"))).toContain(
    "describe the image"
  );
});

test("generateImage maps moderation_flagged", async () => {
  mockPuter({
    ai: {
      txt2img: async () => {
        throw { code: "moderation_flagged" };
      },
    },
  });
  expect(await throwsMsg(() => generateImage("x"))).toContain("refused");
});

test("generateImage maps insufficient_funds", async () => {
  mockPuter({
    ai: {
      txt2img: async () => {
        throw { code: "insufficient_funds" };
      },
    },
  });
  expect(await throwsMsg(() => generateImage("x"))).toContain(
    "credit exhausted"
  );
});

test("generateImage without the SDK", async () => {
  mockPuter({ ai: {} });
  expect(await throwsMsg(() => generateImage("x"))).toContain("not available");
});

// ---- transcribeAudio ----

test("transcribeAudio accepts a plain string result", async () => {
  mockPuter({ ai: { speech2txt: async () => "  hello world  " } });
  expect(await transcribeAudio(new Blob())).toBe("hello world");
});

test("transcribeAudio accepts an object result", async () => {
  mockPuter({ ai: { speech2txt: async () => ({ text: "hi there" }) } });
  expect(await transcribeAudio(new Blob())).toBe("hi there");
});

test("transcribeAudio rejects empty transcripts", async () => {
  mockPuter({ ai: { speech2txt: async () => ({ text: "   " }) } });
  expect(await throwsMsg(() => transcribeAudio(new Blob()))).toContain(
    "no text"
  );
});

test("transcribeAudio maps bad_request with message", async () => {
  mockPuter({
    ai: {
      speech2txt: async () => {
        throw { code: "bad_request", message: "too long" };
      },
    },
  });
  expect(await throwsMsg(() => transcribeAudio(new Blob()))).toBe("too long");
});

test("transcribeAudio without the SDK", async () => {
  mockPuter({ ai: {} });
  expect(await throwsMsg(() => transcribeAudio(new Blob()))).toContain(
    "not available"
  );
});
