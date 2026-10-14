import { test, expect } from "bun:test";
import { mockPuter, throwsMsg } from "./helpers";
import { generateImage, loadImageUrl } from "../src/lib/images";
import { transcribeAudio } from "../src/lib/speech";

// ---- generateImage ----

test("generateImage saves to a Puter path and resolves it", async () => {
  let options: Record<string, unknown> | undefined;
  mockPuter({
    ai: {
      txt2img: async (_prompt: string, opts: Record<string, unknown>) => {
        options = opts;
        return { src: "" };
      },
    },
  });
  const path = await generateImage("a sunset");
  expect(path).toMatch(/^freetalk-[\w-]+\.png$/);
  expect(path).not.toMatch(/^~/);
  expect(options?.puter_output_path).toBe(path);
});

test("generateImage paths are unique per call", async () => {
  mockPuter({ ai: { txt2img: async () => ({ src: "" }) } });
  const a = await generateImage("x");
  const b = await generateImage("x");
  expect(a).not.toBe(b);
});

test("generateImage rejects when the SDK returns nothing", async () => {
  mockPuter({ ai: { txt2img: async () => null } });
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

// ---- loadImageUrl ----

test("loadImageUrl reads the Puter file into an object URL", async () => {
  const reads: string[] = [];
  mockPuter({
    fs: {
      read: async (path: string) => {
        reads.push(path);
        return new Blob(["png"]);
      },
    },
  });
  (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = () =>
    "blob:test-1";
  expect(await loadImageUrl("~/a.png")).toBe("blob:test-1");
  expect(reads).toEqual(["~/a.png"]);
});

test("loadImageUrl caches per path", async () => {
  let reads = 0;
  mockPuter({
    fs: {
      read: async () => {
        reads++;
        return new Blob(["png"]);
      },
    },
  });
  await loadImageUrl("~/cached.png");
  await loadImageUrl("~/cached.png");
  expect(reads).toBe(1);
});

test("loadImageUrl retries a path after a failed read", async () => {
  let calls = 0;
  mockPuter({
    fs: {
      read: async () => {
        calls++;
        if (calls === 1) throw new Error("offline");
        return new Blob(["png"]);
      },
    },
  });
  expect(await throwsMsg(() => loadImageUrl("~/flaky.png"))).toContain("offline");
  expect(await loadImageUrl("~/flaky.png")).toBeTruthy();
  expect(calls).toBe(2);
});

test("loadImageUrl without Puter storage", async () => {
  mockPuter({ ai: {} });
  expect(await throwsMsg(() => loadImageUrl("~/none.png"))).toContain("not available");
});

// ---- transcribeAudio ----

/** A minimal, non-empty recording. */
const recording = () =>
  new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 1, 2, 3])], {
    type: "audio/webm",
  });

test("transcribeAudio accepts a plain string result", async () => {
  mockPuter({ ai: { speech2txt: async () => "  hello world  " } });
  expect(await transcribeAudio(recording())).toBe("hello world");
});

test("transcribeAudio accepts an object result", async () => {
  mockPuter({ ai: { speech2txt: async () => ({ text: "hi there" }) } });
  expect(await transcribeAudio(recording())).toBe("hi there");
});

test("transcribeAudio rejects empty transcripts", async () => {
  mockPuter({ ai: { speech2txt: async () => ({ text: "   " }) } });
  expect(await throwsMsg(() => transcribeAudio(recording()))).toContain(
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
  expect(await throwsMsg(() => transcribeAudio(recording()))).toBe("too long");
});

test("transcribeAudio without the SDK", async () => {
  mockPuter({ ai: {} });
  expect(await throwsMsg(() => transcribeAudio(recording()))).toContain(
    "not available"
  );
});

// ---- transcription payloads ----
//
// The bug these pin: the recorder's media type was passed through verbatim, so
// Chrome's `audio/webm;codecs=opus` (and an empty `mimeType` on other
// browsers) reached the provider as a data URL it could not decode. Recordings
// are now re-encoded to PCM WAV, and the container is sniffed when the
// recorder reports none.

test("prepareAudioForTranscription keeps the raw container when decoding is unavailable", async () => {
  const { prepareAudioForTranscription } = await import("../src/lib/speech");
  const recording = new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3, 4])], {
    type: "audio/webm;codecs=opus",
  });
  const payload = await prepareAudioForTranscription(recording);
  expect(payload.mimeType).toBe("audio/webm");
  expect(payload.dataUrl.startsWith("data:audio/webm;base64,")).toBe(true);
  expect(payload.dataUrl).not.toContain("codecs");
  expect(payload.transcoded).toBe(false);
});

test("prepareAudioForTranscription sniffs a container when the recorder reports none", async () => {
  const { prepareAudioForTranscription } = await import("../src/lib/speech");
  const recording = new Blob([new Uint8Array([0x4f, 0x67, 0x67, 0x53, 0, 2, 0, 0])]);
  const payload = await prepareAudioForTranscription(recording);
  expect(payload.mimeType).toBe("audio/ogg");
});

test("transcribeAudio sends a data URL, never a bare blob or base64", async () => {
  let received: unknown;
  mockPuter({
    ai: {
      speech2txt: async (source: unknown) => {
        received = source;
        return { text: "hello" };
      },
    },
  });
  const recording = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2])], {
    type: "audio/webm",
  });
  expect(await transcribeAudio(recording)).toBe("hello");
  expect(typeof received).toBe("string");
  expect(String(received).startsWith("data:audio/webm;base64,")).toBe(true);
});

test("transcribeAudio reports an empty recording instead of calling the API", async () => {
  let called = false;
  mockPuter({
    ai: {
      speech2txt: async () => {
        called = true;
        return { text: "should not happen" };
      },
    },
  });
  expect(await throwsMsg(() => transcribeAudio(new Blob()))).toContain(
    "No audio was captured"
  );
  expect(called).toBe(false);
});

test("transcribeAudio refuses a recording over the 25 MB input cap", async () => {
  mockPuter({ ai: { speech2txt: async () => ({ text: "nope" }) } });
  const huge = new Blob([new Uint8Array(25 * 1024 * 1024 + 1)], {
    type: "audio/webm",
  });
  expect(await throwsMsg(() => transcribeAudio(huge))).toContain("25 MB");
});

test("transcribeAudio maps input_too_large from the API", async () => {
  mockPuter({
    ai: {
      speech2txt: async () => {
        throw { code: "input_too_large", message: "Input size cannot be larger than 25 MB" };
      },
    },
  });
  const audio = new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])], { type: "audio/webm" });
  expect(await throwsMsg(() => transcribeAudio(audio))).toContain("25 MB");
});

test("transcribeAudio maps a missing auth token", async () => {
  mockPuter({
    ai: {
      speech2txt: async () => {
        throw { code: "unauthorized", message: "Authentication required" };
      },
    },
  });
  const audio = new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])], { type: "audio/webm" });
  expect(await throwsMsg(() => transcribeAudio(audio))).toContain("sign in");
});
