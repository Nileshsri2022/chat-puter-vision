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
  expect(path).toMatch(/^~\/freetalk-[\w-]+\.png$/);
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
