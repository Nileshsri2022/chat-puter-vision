import { test, expect } from "bun:test";
import { mockPuter, throwsMsg } from "./helpers";
import {
  stripMarkdownForSpeech,
  synthesizeSpeech,
  setCurrentSpeech,
  stopAllSpeech,
  TTS_CHAR_LIMIT,
} from "../src/lib/tts";

// ---- stripMarkdownForSpeech ----

test("fenced code blocks become a placeholder", () => {
  expect(stripMarkdownForSpeech('```js\nconst x = 1;\n```')).toBe(
    "[code omitted]"
  );
});

test("inline code keeps its text", () => {
  expect(stripMarkdownForSpeech("use `npm run dev` here")).toBe(
    "use npm run dev here"
  );
});

test("headings lose their markers", () => {
  expect(stripMarkdownForSpeech("## Hello world")).toBe("Hello world");
});

test("bold and italic markers are removed", () => {
  expect(stripMarkdownForSpeech("**bold** and *italic*")).toBe(
    "bold and italic"
  );
});

test("links keep their label text", () => {
  expect(stripMarkdownForSpeech("[docs](https://example.com)")).toBe("docs");
});

test("images keep their alt text", () => {
  expect(stripMarkdownForSpeech("![a cat](cat.png)")).toBe("a cat");
});

test("list markers are removed", () => {
  expect(stripMarkdownForSpeech("- one\n- two")).toBe("one\ntwo");
});

test("blockquotes lose their markers", () => {
  expect(stripMarkdownForSpeech("> quoted")).toBe("quoted");
});

test("whitespace is collapsed", () => {
  expect(stripMarkdownForSpeech("a   b\n\n\nc")).toBe("a b\n\nc");
});

// ---- synthesizeSpeech ----

test("synthesizeSpeech resolves the audio element", async () => {
  const audio = { play: async () => {} };
  mockPuter({ ai: { txt2speech: async () => audio } });
  expect(await synthesizeSpeech("hello")).toBe(audio as never);
});

test("synthesizeSpeech truncates to the API char limit", async () => {
  let seen = "";
  mockPuter({
    ai: {
      txt2speech: async (text: string) => {
        seen = text;
        return {};
      },
    },
  });
  await synthesizeSpeech("x".repeat(5000));
  expect(seen.length).toBe(TTS_CHAR_LIMIT);
  expect(TTS_CHAR_LIMIT).toBe(3000);
});

test("synthesizeSpeech rejects empty input", async () => {
  mockPuter({ ai: { txt2speech: async () => ({}) } });
  expect(await throwsMsg(() => synthesizeSpeech("   "))).toContain(
    "Nothing to read aloud"
  );
});

test("synthesizeSpeech without the SDK", async () => {
  mockPuter({ ai: {} });
  expect(await throwsMsg(() => synthesizeSpeech("hi"))).toContain(
    "not available"
  );
});

test("synthesizeSpeech maps insufficient_funds", async () => {
  mockPuter({
    ai: {
      txt2speech: async () => {
        throw { code: "insufficient_funds" };
      },
    },
  });
  expect(await throwsMsg(() => synthesizeSpeech("hi"))).toContain(
    "credit exhausted"
  );
});

test("synthesizeSpeech passes through backend messages", async () => {
  mockPuter({
    ai: {
      txt2speech: async () => {
        throw { code: "bad_request", message: "voice gone" };
      },
    },
  });
  expect(await throwsMsg(() => synthesizeSpeech("hi"))).toBe("voice gone");
});

// ---- one-at-a-time playback ----

test("stopAllSpeech pauses the current element", () => {
  let paused = 0;
  const audio = { pause: () => paused++ };
  setCurrentSpeech(audio as never);
  stopAllSpeech();
  expect(paused).toBe(1);
  // Second call is a safe no-op.
  stopAllSpeech();
  expect(paused).toBe(1);
});
