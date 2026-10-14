// Live model catalog, sourced from `puter.ai.listModels()` — the documented
// canonical source of model IDs (https://docs.puter.com/AI/listModels/).
// Hardcoded model IDs rot (273/421 of this app's IDs were dead as of
// 2026-10-13); the catalog lets the UI hide dead models and gate vision
// features on real `modalities` data instead of keyword guessing.

import type { ModelInfo } from "./backend";
import { computeContextPlan, type ContextPlan } from "./context";

export interface ModelCatalog {
  /** Every ID the API accepts: primary id + puterId + aliases. */
  ids: Set<string>;
  /** IDs whose modalities.input includes "image". */
  vision: Set<string>;
  /** Live provider name per accepted ID (primary id + puterId + aliases). */
  providerOf: Map<string, string>;
  /** Context window and output limit per accepted ID, when listModels reports them. */
  limits: Map<string, { context?: number; maxOutput?: number; provider?: string }>;
}

let cache: ModelCatalog | null = null;
let inflight: Promise<ModelCatalog | null> | null = null;

/** Fetch once, cache for the session. Resolves null when unavailable (offline / SDK missing). */
export function getModelCatalog(): Promise<ModelCatalog | null> {
  if (cache) return Promise.resolve(cache);
  if (inflight) return inflight;
  const p: Promise<ModelCatalog | null> = (async () => {
    try {
      const sdk = typeof window !== "undefined" ? window.puter : undefined;
      if (!sdk?.ai?.listModels) return null;
      const models: ModelInfo[] = await sdk.ai.listModels();
      if (!Array.isArray(models) || models.length === 0) return null;
      const ids = new Set<string>();
      const vision = new Set<string>();
      const providerOf = new Map<string, string>();
      const limits = new Map<string, { context?: number; maxOutput?: number; provider?: string }>();
      const recordLimits = (id: string, m: ModelInfo) => {
        if (limits.has(id)) return;
        const context = typeof m.context === "number" ? m.context : undefined;
        if (context === undefined) return;
        limits.set(id, {
          context,
          maxOutput: typeof m.max_tokens === "number" ? m.max_tokens : undefined,
          provider: typeof m.provider === "string" ? m.provider : undefined,
        });
      };
      for (const m of models) {
        if (!m || typeof m.id !== "string") continue;
        ids.add(m.id);
        recordLimits(m.id, m);
        // Primary IDs are authoritative for providerOf: mirror entries
        // (e.g. "openrouter:openai/gpt-5.4-nano") reuse bare IDs as aliases,
        // and must not overwrite the real entry's provider.
        if (typeof m.provider === "string" && !providerOf.has(m.id)) {
          providerOf.set(m.id, m.provider);
        }
        const inputs = m.modalities?.input ?? [];
        if (inputs.includes("image")) vision.add(m.id);
      }
      // puterId/aliases only fill gaps left by primary IDs.
      for (const m of models) {
        if (!m || typeof m.id !== "string" || typeof m.provider !== "string") continue;
        if (typeof m.puterId === "string") {
          ids.add(m.puterId);
          recordLimits(m.puterId, m);
          if (!providerOf.has(m.puterId)) providerOf.set(m.puterId, m.provider);
        }
        for (const a of m.aliases ?? []) {
          if (typeof a !== "string") continue;
          ids.add(a);
          recordLimits(a, m);
          if (!providerOf.has(a)) providerOf.set(a, m.provider);
        }
      }
      cache = { ids, vision, providerOf, limits };
      return cache;
    } catch {
      return null;
    }
  })();
  inflight = p;
  // Clear the in-flight marker once settled so a transient failure can be
  // retried; a successful result stays cached via `cache`.
  const clear = () => {
    if (inflight === p) inflight = null;
  };
  p.then(clear, clear);
  return p;
}

/** The documented default model for puter.ai.chat. Verified live 2026-10-13. */
export const DEFAULT_MODEL_ID = "gpt-5.4-nano";

/** Preferred fallbacks, in order, if the default ever stops resolving. */
const FALLBACK_MODEL_IDS = [
  "gpt-5.4-nano",
  "gpt-5.4-mini",
  "gpt-5-mini",
  "claude-sonnet-5",
  "claude-haiku-5-5",
  "grok-4.7",
];

/** Pick the best default that actually exists in the live catalog. */
export function resolveDefaultModel(catalog: ModelCatalog | null): string {
  if (catalog) {
    for (const id of FALLBACK_MODEL_IDS) {
      if (catalog.ids.has(id)) return id;
    }
  }
  return DEFAULT_MODEL_ID;
}

/** True when the model ID resolves in the live catalog (or catalog unavailable). */
export function isModelAvailable(id: string, catalog: ModelCatalog | null): boolean {
  if (!catalog) return true; // offline fallback: don't hide everything
  return catalog.ids.has(id);
}

const VISION_KEYWORDS = ["vision", "vl", "visual", "image", "pixtral", "llama-3.2", "qwen2.5-vl", "internvl", "gemini"];

/** Vision support: live modalities data first, keyword heuristic as offline fallback. */
export function modelSupportsVision(id: string | undefined, catalog: ModelCatalog | null): boolean {
  if (!id) return false;
  if (catalog) return catalog.vision.has(id);
  const lower = id.toLowerCase();
  if (lower.startsWith("claude")) return true;
  return VISION_KEYWORDS.some((k) => lower.includes(k));
}

let providersCache: string[] | null = null;
let providersInflight: Promise<string[] | null> | null = null;

/**
 * Live provider list from `puter.ai.listModelProviders()`
 * (https://docs.puter.com/AI/listModelProviders/). Cached for the session.
 * Resolves null when unavailable (offline / SDK missing).
 */
export function getModelProviders(): Promise<string[] | null> {
  if (providersCache) return Promise.resolve(providersCache);
  if (providersInflight) return providersInflight;
  providersInflight = (async () => {
    try {
      const sdk = typeof window !== "undefined" ? window.puter : undefined;
      if (!sdk?.ai?.listModelProviders) return null;
      const providers: string[] = await sdk.ai.listModelProviders();
      if (!Array.isArray(providers) || providers.length === 0) return null;
      providersCache = providers.filter((p) => typeof p === "string");
      return providersCache;
    } catch {
      return null;
    } finally {
      providersInflight = null;
    }
  })();
  return providersInflight;
}

/**
 * Live provider name for a model ID, from the catalog's providerOf map.
 * Null when the catalog is unavailable or the ID isn't in it.
 */
export function liveProviderForModelId(id: string, catalog: ModelCatalog | null): string | null {
  return catalog?.providerOf.get(id) ?? null;
}

/**
 * Context budget and compaction threshold for a model, from its listModels()
 * limits. Null when the catalog or the model's context size is unknown.
 */
export function contextPlanFor(
  catalog: ModelCatalog | null,
  modelId: string
): ContextPlan | null {
  const info = catalog?.limits?.get(modelId);
  if (!info) return null;
  return computeContextPlan({
    id: modelId,
    context: info.context,
    maxOutput: info.maxOutput,
    provider: info.provider ?? catalog?.providerOf.get(modelId),
  });
}
