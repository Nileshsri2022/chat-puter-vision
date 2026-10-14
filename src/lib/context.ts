// Per-model context budget and compaction threshold.
//
// Limits come from puter.ai.listModels() (`context`, `max_tokens`).
// Compaction (https://docs.puter.com/AI/chat/#compaction) summarizes older
// turns once the input passes `trigger_tokens`. Anthropic models only compact
// above 50,000 tokens, so a lower trigger is not sent for them.

/** Share of the input budget at which compaction starts. */
export const COMPACTION_SHARE = 0.6;

/** Anthropic's minimum compaction threshold (docs: AI/chat, Compaction). */
export const ANTHROPIC_MIN_COMPACTION_TOKENS = 50_000;

/** Rough token estimate: about four characters per token for English text. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export interface ContextPlan {
  /** Input tokens the request may use (history + prompt), before compaction. */
  maxInputTokens: number;
  /** Sent as the `compaction` option. Absent when compaction is not allowed. */
  compaction?: { trigger_tokens: number };
}

export interface ModelLimits {
  /** Context window in tokens. */
  context?: number;
  /** Maximum output tokens. */
  maxOutput?: number;
  /** Provider name from listModels(). */
  provider?: string;
  /** Model ID, used when the provider name is missing. */
  id: string;
}

/** Returns null when the context window is unknown (caller falls back). */
export function computeContextPlan(limits: ModelLimits): ContextPlan | null {
  const context = limits.context;
  if (typeof context !== "number" || !Number.isFinite(context) || context <= 0) {
    return null;
  }
  const maxOutput =
    typeof limits.maxOutput === "number" && limits.maxOutput > 0
      ? limits.maxOutput
      : Math.floor(context * 0.1);
  // Margin for tokenizer differences and system overhead.
  const margin = Math.ceil(context * 0.05);
  const maxInputTokens = Math.max(0, context - maxOutput - margin);
  const trigger = Math.floor(maxInputTokens * COMPACTION_SHARE);
  const isAnthropic = /claude|anthropic/i.test(`${limits.provider ?? ""} ${limits.id}`);
  const canCompact =
    trigger > 0 && (!isAnthropic || trigger >= ANTHROPIC_MIN_COMPACTION_TOKENS);
  return {
    maxInputTokens,
    compaction: canCompact ? { trigger_tokens: trigger } : undefined,
  };
}
