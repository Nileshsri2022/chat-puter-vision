import { test, expect } from "bun:test";
import { mockPuter } from "./helpers";
import {
  getModelCatalog,
  resolveDefaultModel,
  isModelAvailable,
  modelSupportsVision,
  DEFAULT_MODEL_ID,
  type ModelCatalog,
} from "../src/lib/models";

const catalog = (ids: string[], vision: string[] = []): ModelCatalog => ({
  ids: new Set(ids),
  vision: new Set(vision),
  providerOf: new Map(ids.map((id) => [id, "test"])),
  limits: new Map(),
});

// ---- resolveDefaultModel ----

test("resolveDefaultModel picks the first live fallback", () => {
  const c = catalog(["gpt-5.4-mini", "grok-4.7"]);
  expect(resolveDefaultModel(c)).toBe("gpt-5.4-mini");
});

test("resolveDefaultModel falls back with no matches", () => {
  expect(resolveDefaultModel(catalog(["some-other-model"]))).toBe(
    DEFAULT_MODEL_ID
  );
});

test("resolveDefaultModel falls back without a catalog", () => {
  expect(resolveDefaultModel(null)).toBe(DEFAULT_MODEL_ID);
});

// ---- isModelAvailable ----

test("isModelAvailable is true for catalogued ids", () => {
  expect(isModelAvailable("gpt-5.4-nano", catalog(["gpt-5.4-nano"]))).toBe(
    true
  );
});

test("isModelAvailable is false for dead ids", () => {
  expect(isModelAvailable("dead-model", catalog(["gpt-5.4-nano"]))).toBe(
    false
  );
});

test("isModelAvailable is permissive without a catalog", () => {
  expect(isModelAvailable("anything", null)).toBe(true);
});

// ---- modelSupportsVision ----

test("modelSupportsVision uses live modalities data", () => {
  const c = catalog(["a", "b"], ["a"]);
  expect(modelSupportsVision("a", c)).toBe(true);
  expect(modelSupportsVision("b", c)).toBe(false);
});

test("modelSupportsVision is false without an id", () => {
  expect(modelSupportsVision(undefined, catalog(["a"], ["a"]))).toBe(false);
});

test("modelSupportsVision falls back to keywords offline", () => {
  expect(modelSupportsVision("claude-opus-9", null)).toBe(true);
  expect(modelSupportsVision("gpt-4o-vision", null)).toBe(true);
  expect(modelSupportsVision("gpt-4o", null)).toBe(false);
});

// ---- getModelCatalog ----

test("getModelCatalog returns null without the SDK", async () => {
  mockPuter({ ai: {} });
  expect(await getModelCatalog()).toBeNull();
});

test("getModelCatalog builds ids, vision and providers", async () => {
  mockPuter({
    ai: {
      listModels: async () => [
        {
          id: "gpt-5.4-nano",
          provider: "openai",
          modalities: { input: ["text", "image"] },
        },
        // Mirror entry reusing the bare id as an alias: the primary id's
        // provider must stay authoritative.
        {
          id: "openrouter:openai/gpt-5.4-nano",
          provider: "openrouter",
          aliases: ["openai/gpt-5.4-nano", "gpt-5.4-nano"],
        },
        { id: "text-only-model", provider: "x" },
      ],
    },
  });
  const c = await getModelCatalog();
  expect(c).not.toBeNull();
  expect(c!.ids.has("gpt-5.4-nano")).toBe(true);
  expect(c!.ids.has("openai/gpt-5.4-nano")).toBe(true);
  expect(c!.vision.has("gpt-5.4-nano")).toBe(true);
  expect(c!.vision.has("text-only-model")).toBe(false);
  expect(c!.providerOf.get("gpt-5.4-nano")).toBe("openai");
});

test("getModelCatalog caches for the session", async () => {
  const first = await getModelCatalog();
  mockPuter({ ai: { listModels: async () => [] } });
  expect(await getModelCatalog()).toBe(first);
});
