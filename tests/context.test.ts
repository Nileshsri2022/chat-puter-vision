import { test, expect } from "bun:test";
import { mockPuter } from "./helpers";
import { computeContextPlan, type ContextPlan } from "../src/lib/context";
import {
  fitHistory,
  streamAIResponse,
  toHistory,
  type HistoryMessage,
} from "../src/lib/streamingHandler";
import type { CompactionItem, Message } from "../src/lib/backend";

const ART: CompactionItem = { type: "compaction", id: "c1", encrypted_content: "ENC" };

// ---- computeContextPlan ----

test("large Anthropic model: budget leaves room for the reply, trigger at 60%", () => {
  const plan = computeContextPlan({
    id: "claude-opus-4-8",
    provider: "claude",
    context: 200_000,
    maxOutput: 64_000,
  });
  // 200k - 64k reply - 10k margin = 126k input budget; 60% = 75,600.
  expect(plan?.maxInputTokens).toBe(126_000);
  expect(plan?.compaction).toEqual({ trigger_tokens: 75_600 });
});

test("small Anthropic model: trigger below 50k means no compaction", () => {
  const plan = computeContextPlan({
    id: "claude-small",
    provider: "claude",
    context: 64_000,
    maxOutput: 8_000,
  });
  // 64k - 8k - 3.2k = 52.8k budget; 60% = 31,680 < 50,000 minimum.
  expect(plan?.maxInputTokens).toBe(52_800);
  expect(plan?.compaction).toBeUndefined();
});

test("OpenAI model with a small trigger still compacts", () => {
  const plan = computeContextPlan({
    id: "gpt-5.4-nano",
    provider: "openai",
    context: 128_000,
    maxOutput: 16_000,
  });
  expect(plan?.maxInputTokens).toBe(105_600);
  expect(plan?.compaction).toEqual({ trigger_tokens: 63_360 });
});

test("missing max_tokens falls back to 10% of the context", () => {
  const plan = computeContextPlan({ id: "x", context: 100_000 });
  // 100k - 10k (estimated reply) - 5k margin = 85k.
  expect(plan?.maxInputTokens).toBe(85_000);
});

test("unknown context window gives no plan", () => {
  expect(computeContextPlan({ id: "x" })).toBeNull();
  expect(computeContextPlan({ id: "x", context: 0 })).toBeNull();
});

// ---- toHistory keeps summaries ----

test("toHistory keeps a summary on a reply that has no text", () => {
  const history = toHistory([
    { role: "user", content: "hi" },
    { role: "assistant", content: "", model: "m1", compaction: ART },
  ]);
  expect(history[1]).toEqual({ role: "assistant", content: "", model: "m1", compaction: ART });
});

// ---- fitHistory ----

const turns = (n: number, size: number): HistoryMessage[] =>
  Array.from({ length: n }, (_, i) => ({
    role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
    content: `t${i}:` + "x".repeat(size),
  }));

const withCompaction: ContextPlan = {
  maxInputTokens: 100_000,
  compaction: { trigger_tokens: 60_000 },
};

test("fitHistory starts at the latest summary from the same model", () => {
  const history: HistoryMessage[] = [
    { role: "user", content: "u1" },
    { role: "assistant", content: "a1", model: "m1" },
    { role: "user", content: "u2" },
    { role: "assistant", content: "s", model: "m1", compaction: ART },
    { role: "user", content: "u3" },
  ];
  const fitted = fitHistory(history, "m1", withCompaction, 1);
  expect(fitted.map((m) => m.content)).toEqual(["s", "u3"]);
  expect(fitted[0].compaction).toEqual(ART);
});

test("fitHistory ignores a summary made by another model", () => {
  const history: HistoryMessage[] = [
    { role: "user", content: "u1" },
    { role: "assistant", content: "s", model: "m2", compaction: ART },
    { role: "user", content: "u2" },
  ];
  const fitted = fitHistory(history, "m1", withCompaction, 1);
  expect(fitted.map((m) => m.content)).toEqual(["u1", "s", "u2"]);
  expect(fitted.some((m) => m.compaction)).toBe(false);
});

test("fitHistory without a plan keeps the last 20 messages and no summaries", () => {
  const history = turns(60, 10).map((m, i) =>
    i === 50 ? { ...m, model: "m1", compaction: ART } : m
  );
  const fitted = fitHistory(history, "m1", null, 1);
  expect(fitted.length).toBe(20);
  expect(fitted.some((m) => m.compaction)).toBe(false);
});

test("fitHistory drops the oldest turns to fit the budget", () => {
  // 10 turns of 400 chars = 100 tokens each; budget 200 - 1 prompt token.
  const plan: ContextPlan = { maxInputTokens: 200 };
  const fitted = fitHistory(turns(10, 400 - 3), "m1", plan, 1);
  expect(fitted.length).toBe(1);
  expect(fitted[0].content.startsWith("t9:")).toBe(true);
});

test("fitHistory never drops the summary turn", () => {
  const history: HistoryMessage[] = [
    { role: "assistant", content: "s".repeat(400), model: "m1", compaction: ART },
    { role: "user", content: "u".repeat(400) },
  ];
  const plan: ContextPlan = { maxInputTokens: 50, compaction: { trigger_tokens: 30 } };
  const fitted = fitHistory(history, "m1", plan, 1);
  expect(fitted[0].compaction).toEqual(ART);
  expect(fitted.length).toBe(2);
});

// ---- request payload ----

type Sent = { messages: { role: string; content: unknown }[]; options: Record<string, unknown> };

function capture(parts: unknown[] = [{ type: "text", text: "ok" }]): Sent[] {
  const sent: Sent[] = [];
  mockPuter({
    ai: {
      chat: async (messages: Sent["messages"], _test: boolean, options: Sent["options"]) => {
        sent.push({ messages, options });
        return (async function* () {
          for (const p of parts) yield p;
        })();
      },
    },
  });
  return sent;
}

const callbacks = {
  onChunk: () => {},
  onComplete: () => {},
  onError: (e: Error) => {
    throw e;
  },
};

test("compaction option is sent when the plan allows it", async () => {
  const sent = capture();
  await streamAIResponse([], "hi", "m1", callbacks, undefined, undefined, withCompaction);
  expect(sent[0].options.compaction).toEqual({ trigger_tokens: 60_000 });
});

test("no compaction option when the plan has none", async () => {
  const sent = capture();
  await streamAIResponse([], "hi", "m1", callbacks, undefined, undefined, { maxInputTokens: 5000 });
  expect("compaction" in sent[0].options).toBe(false);
});

test("compaction chunk is passed to onComplete", async () => {
  capture([
    { type: "text", text: "Hi" },
    { type: "compaction", id: "c1", encrypted_content: "ENC" },
  ]);
  let got: { full: string; compaction?: CompactionItem } | null = null;
  await streamAIResponse([], "hi", "m1", {
    ...callbacks,
    onComplete: (full, compaction) => {
      got = { full, compaction };
    },
  }, undefined, undefined, withCompaction);
  expect(got).not.toBeNull();
  expect(got!.full).toBe("Hi");
  expect(got!.compaction?.id).toBe("c1");
  expect(got!.compaction?.encrypted_content).toBe("ENC");
});

test("summary is sent as the first block of its assistant turn, and older turns are dropped", async () => {
  const sent = capture();
  const transcript: Message[] = [
    { role: "user", content: "u1" },
    { role: "assistant", content: "a1", model: "m1" },
    { role: "user", content: "u2" },
    { role: "assistant", content: "summary-turn", model: "m1", compaction: ART },
    { role: "user", content: "u3" },
    { role: "assistant", content: "a3", model: "m1" },
  ];
  await streamAIResponse(toHistory(transcript), "u4", "m1", callbacks, undefined, undefined, withCompaction);
  expect(sent[0].messages).toEqual([
    { role: "assistant", content: [ART, { type: "text", text: "summary-turn" }] },
    { role: "user", content: "u3" },
    { role: "assistant", content: "a3" },
    { role: "user", content: "u4" },
  ]);
});

test("a summary from another model is not sent; the full text is", async () => {
  const sent = capture();
  const transcript: Message[] = [
    { role: "user", content: "u1" },
    { role: "assistant", content: "s", model: "m2", compaction: ART },
    { role: "user", content: "u2" },
  ];
  await streamAIResponse(toHistory(transcript), "u3", "m1", callbacks, undefined, undefined, withCompaction);
  expect(sent[0].messages.map((m) => m.content)).toEqual(["u1", "s", "u2", "u3"]);
});

test("without limits, a long transcript sends the last 20 messages", async () => {
  const sent = capture();
  const transcript: Message[] = Array.from({ length: 60 }, (_, i) => ({
    role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
    content: `m${i}`,
  }));
  await streamAIResponse(toHistory(transcript), "now", "m1", callbacks, undefined, undefined, null);
  expect(sent[0].messages.length).toBe(21);
  expect(sent[0].messages[sent[0].messages.length - 1].content).toBe("now");
});
