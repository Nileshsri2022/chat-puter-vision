import { test, expect } from "bun:test";
import { mockPuter } from "./helpers";
import {
  stripThinkBlocks,
  splitThinkBlocks,
  streamAIResponse,
} from "../src/lib/streamingHandler";

// ---- stripThinkBlocks ----

test("removes a complete think block", () => {
  expect(stripThinkBlocks("Hello <think>internal reasoning</think> world")).toBe(
    "Hello  world"
  );
});

test("hides a trailing unterminated think block", () => {
  expect(stripThinkBlocks("Hello <think>still thinking...")).toBe("Hello ");
});

test("removes multiple think blocks", () => {
  expect(
    stripThinkBlocks("<think>a</think>one<think>b</think>two")
  ).toBe("onetwo");
});

test("leaves text without think tags untouched", () => {
  const text = "Just a normal **markdown** response.";
  expect(stripThinkBlocks(text)).toBe(text);
});

test("handles multiline think content", () => {
  expect(
    stripThinkBlocks("<think>\nline1\nline2\n</think>\n\nAnswer")
  ).toBe("\n\nAnswer");
});

// ---- splitThinkBlocks ----

test("splits thinking from answer", () => {
  const { thinking, answer, thinkingOpen } = splitThinkBlocks(
    "<think>We need to greet back. Keep concise.</think>\n\nHello! How can I help?"
  );
  expect(thinking).toBe("We need to greet back. Keep concise.");
  expect(answer).toBe("\n\nHello! How can I help?");
  expect(thinkingOpen).toBe(false);
});

test("flags an unterminated trailing think block as open", () => {
  const { thinking, answer, thinkingOpen } = splitThinkBlocks(
    "Partial <think>unfinished reasoning"
  );
  expect(thinking).toBe("unfinished reasoning");
  expect(answer).toBe("Partial ");
  expect(thinkingOpen).toBe(true);
});

test("no think tags means no thinking section", () => {
  const { thinking, answer, thinkingOpen } = splitThinkBlocks("Plain answer.");
  expect(thinking).toBe("");
  expect(answer).toBe("Plain answer.");
  expect(thinkingOpen).toBe(false);
});

// ---- streamAIResponse: raw text passes through; UI splits it ----

/** Build a mock puter SDK whose chat() streams the given text parts. */
function mockStreamingPuter(parts: string[]) {
  mockPuter({
    ai: {
      chat: async () => {
        return (async function* () {
          for (const text of parts) yield { type: "text", text };
        })();
      },
    },
  });
}

test("stream passes think tags through raw for the UI to render", async () => {
  // DeepSeek R1 style: reasoning first, split across chunk boundaries.
  const parts = [
    "<think>",
    "We need to greet back. ",
    "Keep concise.</think>",
    "Hello! How can I help?",
  ];
  mockStreamingPuter(parts);
  const seen: string[] = [];
  let done = "";
  await streamAIResponse([], "hi", "deepseek-r1", {
    onChunk: (chunk) => seen.push(chunk),
    onComplete: (full) => {
      done = full;
    },
    onError: (e) => {
      throw e;
    },
  });
  // Raw deltas, tags included.
  expect(seen.join("")).toBe(parts.join(""));
  expect(done).toBe(parts.join(""));
  // The UI layer splits it into a collapsible section + answer.
  const { thinking, answer, thinkingOpen } = splitThinkBlocks(done);
  expect(thinking).toBe("We need to greet back. Keep concise.");
  expect(answer).toBe("Hello! How can I help?");
  expect(thinkingOpen).toBe(false);
});

test("onAbort keeps the raw partial text", async () => {
  mockStreamingPuter(["Partial <think>unfinished", " reasoning"]);
  const controller = new AbortController();
  let aborted = "";
  await streamAIResponse([], "hi", "deepseek-r1", {
    onChunk: () => controller.abort(),
    onComplete: () => {},
    onError: (e) => {
      throw e;
    },
    onAbort: (partial) => {
      aborted = partial;
    },
  }, undefined, controller.signal);
  expect(aborted).toBe("Partial <think>unfinished");
});
