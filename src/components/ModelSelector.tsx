import { useState, useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, Zap, Brain, Cpu, Wind, Sparkles, Code, Bot, Search, Microscope, MessageSquare, Globe, Check, ListFilter } from "lucide-react";
import { PUTER_MODELS_SNAPSHOT, CAT_VISION, CAT_REASONING, CAT_WEBSEARCH, CAT_FUNCTION_CALLING, CAT_AUDIO_IN, CAT_VIDEO_IN, type SnapshotModel } from "@/lib/puterModels.generated";
import "./ModelSelector.css";

export type ProviderId = "claude" | "mistral" | "perplexity" | "grok" | "openrouter" | "kimi" | "openai";

export interface AIModel {
   id: string;
   name: string;
   description: string;
   icon: React.ReactNode;
   badge?: string;
   type: ProviderId;
}

export interface AIProvider {
   id: ProviderId;
   name: string;
   icon: React.ReactNode;
   description: string;
}

interface ModelSelectorProps {
  selectedModel: string;
  onModelChange: (model: string) => void;
  compact?: boolean;
}

const PROVIDERS: AIProvider[] = [
   {
     id: "claude",
     name: "Claude",
     icon: <Brain className="provider-icon" />,
     description: "Anthropic's Claude models"
   },
   {
     id: "mistral",
     name: "Mistral",
     icon: <Wind className="provider-icon" />,
     description: "Mistral AI models"
   },
   {
     id: "perplexity",
     name: "Perplexity",
     icon: <Search className="provider-icon" />,
     description: "Perplexity research models"
   },
   {
     id: "grok",
     name: "Grok",
     icon: <MessageSquare className="provider-icon" />,
     description: "xAI's Grok models"
   },
   {
     id: "kimi",
     name: "Kimi",
     icon: <Brain className="provider-icon" />,
     description: "Moonshot AI's Kimi models"
   },
   {
     id: "openai",
     name: "OpenAI",
     icon: <Brain className="provider-icon" />,
     description: "OpenAI's GPT models"
   },
   {
     id: "openrouter",
     name: "OpenRouter",
     icon: <Globe className="provider-icon" />,
     description: "OpenRouter marketplace"
   }
];

export const CLAUDE_MODELS: AIModel[] = [
  {
    id: "claude-sonnet-5",
    name: "Claude Sonnet 5",
    description: "Latest Sonnet — best balance of speed and smarts",
    badge: "Recommended",
    icon: <Zap className="model-icon" />,
    type: "claude"
  },
  {
    id: "claude-opus-5-5",
    name: "Claude Opus 5.5",
    description: "Most capable Claude for hard problems",
    badge: "Flagship",
    icon: <Brain className="model-icon" />,
    type: "claude"
  },
  {
    id: "claude-haiku-5-5",
    name: "Claude Haiku 5.5",
    description: "Fast and efficient for everyday tasks",
    badge: "Vision",
    icon: <Wind className="model-icon" />,
    type: "claude"
  },
  {
    id: "claude-sonnet-5-5",
    name: "Claude Sonnet 5.5",
    description: "Enhanced Sonnet with deeper reasoning",
    badge: "Vision",
    icon: <Brain className="model-icon" />,
    type: "claude"
  },
  {
    id: "claude-opus-4-8",
    name: "Claude Opus 4.8",
    description: "Previous-gen Opus, still very capable",
    badge: "Vision",
    icon: <Brain className="model-icon" />,
    type: "claude"
  },
  {
    id: "claude-fable-5",
    name: "Claude Fable 5",
    description: "New Claude family entry",
    badge: "Vision",
    icon: <Sparkles className="model-icon" />,
    type: "claude"
  },
];

export const OPENAI_MODELS: AIModel[] = [
  {
    id: "gpt-5.4-nano",
    name: "GPT 5.4 Nano",
    description: "Default — fast, cheap, capable",
    badge: "Recommended",
    icon: <Zap className="model-icon" />,
    type: "openai"
  },
  {
    id: "gpt-5.4",
    name: "GPT 5.4",
    description: "Latest OpenAI flagship",
    badge: "Flagship",
    icon: <Brain className="model-icon" />,
    type: "openai"
  },
  {
    id: "gpt-5.4-mini",
    name: "GPT 5.4 Mini",
    description: "Lighter flagship, quick responses",
    badge: "Vision",
    icon: <Wind className="model-icon" />,
    type: "openai"
  },
  {
    id: "gpt-5.3-codex",
    name: "GPT 5.3 Codex",
    description: "Coding-specialized GPT",
    badge: "Code",
    icon: <Code className="model-icon" />,
    type: "openai"
  },
  {
    id: "gpt-5.2",
    name: "GPT 5.2",
    description: "Previous flagship generation",
    badge: "Vision",
    icon: <Brain className="model-icon" />,
    type: "openai"
  },
  {
    id: "gpt-5",
    name: "GPT 5",
    description: "GPT-5 base model",
    badge: "Vision",
    icon: <Brain className="model-icon" />,
    type: "openai"
  },
  {
    id: "gpt-5-mini",
    name: "GPT 5 Mini",
    description: "Compact GPT-5",
    badge: "Vision",
    icon: <Wind className="model-icon" />,
    type: "openai"
  },
  {
    id: "gpt-4o",
    name: "GPT 4o",
    description: "Multimodal with vision",
    badge: "Vision",
    icon: <Bot className="model-icon" />,
    type: "openai"
  },
  {
    id: "gpt-4.1",
    name: "GPT 4.1",
    description: "Refined GPT-4 generation",
    badge: "Vision",
    icon: <Cpu className="model-icon" />,
    type: "openai"
  },
];

export const GROK_MODELS: AIModel[] = [
  {
    id: "grok-4.7",
    name: "Grok 4.7",
    description: "Latest Grok",
    badge: "Recommended",
    icon: <MessageSquare className="model-icon" />,
    type: "grok"
  },
  {
    id: "grok-4.6",
    name: "Grok 4.6",
    description: "Previous Grok generation",
    badge: "Vision",
    icon: <MessageSquare className="model-icon" />,
    type: "grok"
  },
  {
    id: "grok-4.5",
    name: "Grok 4.5",
    description: "Strong all-rounder",
    badge: "Vision",
    icon: <Bot className="model-icon" />,
    type: "grok"
  },
  {
    id: "grok-4.3",
    name: "Grok 4.3",
    description: "Earlier Grok 4 release",
    badge: "Vision",
    icon: <Bot className="model-icon" />,
    type: "grok"
  },
  {
    id: "grok-4-1-fast-reasoning",
    name: "Grok 4.1 Fast (Reasoning)",
    description: "Fast Grok with reasoning",
    badge: "Vision",
    icon: <Zap className="model-icon" />,
    type: "grok"
  },
  {
    id: "grok-4-1-fast-non-reasoning",
    name: "Grok 4.1 Fast (Non-Reasoning)",
    description: "Fast Grok, non-reasoning",
    badge: "Vision",
    icon: <Wind className="model-icon" />,
    type: "grok"
  },
];

export const MISTRAL_MODELS: AIModel[] = [
  {
    id: "mistral-large-4",
    name: "Mistral Large 4",
    description: "Most capable Mistral",
    badge: "Flagship",
    icon: <Brain className="model-icon" />,
    type: "mistral"
  },
  {
    id: "mistral-large-2512",
    name: "Mistral Large 3",
    description: "Large Mistral snapshot",
    badge: "Vision",
    icon: <Brain className="model-icon" />,
    type: "mistral"
  },
  {
    id: "mistral-medium-2604",
    name: "Mistral Medium 3.5",
    description: "Mid-size Mistral",
    badge: "Vision",
    icon: <Cpu className="model-icon" />,
    type: "mistral"
  },
  {
    id: "mistral-small-2603",
    name: "Mistral Small 4",
    description: "Small efficient Mistral",
    badge: "Vision",
    icon: <Wind className="model-icon" />,
    type: "mistral"
  },
  {
    id: "infron:mistral/mistral-nemo",
    name: "Mistral: Mistral Nemo (Infron)",
    description: "Compact Mistral Nemo",
    icon: <Bot className="model-icon" />,
    type: "mistral"
  },
  {
    id: "codestral-2508",
    name: "Codestral",
    description: "Code generation specialist",
    badge: "Code",
    icon: <Code className="model-icon" />,
    type: "mistral"
  },
];

export const KIMI_MODELS: AIModel[] = [
  {
    id: "infron:moonshotai/kimi-k3",
    name: "Moonshotai: Kimi K3 (Infron)",
    description: "Latest Kimi",
    badge: "Recommended",
    icon: <Sparkles className="model-icon" />,
    type: "kimi"
  },
  {
    id: "infron:moonshotai/kimi-k2.6",
    name: "Moonshot: Kimi K2.6 (Infron)",
    description: "Kimi K2.6",
    icon: <Brain className="model-icon" />,
    type: "kimi"
  },
  {
    id: "infron:moonshotai/kimi-k2.5",
    name: "Moonshot: Kimi K2.5 (Infron)",
    description: "Kimi K2.5",
    icon: <Brain className="model-icon" />,
    type: "kimi"
  },
  {
    id: "infron:moonshotai/kimi-k2-instruct",
    name: "Moonshot: Kimi-K2-Instruct (Infron)",
    description: "Instruction-tuned Kimi",
    icon: <Bot className="model-icon" />,
    type: "kimi"
  },
  {
    id: "infron:moonshotai/kimi-k2-thinking",
    name: "Moonshot: Kimi K2 Thinking (Infron)",
    description: "Reasoning-focused Kimi",
    icon: <Brain className="model-icon" />,
    type: "kimi"
  },
  {
    id: "infron:moonshotai/kimi-k2-0905",
    name: "MoonshotAI: Kimi K2 0905 (Infron)",
    description: "Kimi K2 snapshot",
    icon: <Brain className="model-icon" />,
    type: "kimi"
  },
];

export const PERPLEXITY_MODELS: AIModel[] = [
  {
    id: "openrouter:perplexity/sonar",
    name: "Perplexity: Sonar (OpenRouter)",
    description: "General research model",
    badge: "Recommended",
    icon: <Search className="model-icon" />,
    type: "perplexity"
  },
  {
    id: "openrouter:perplexity/sonar-pro",
    name: "Perplexity: Sonar Pro (OpenRouter)",
    description: "Professional research",
    badge: "Pro",
    icon: <Search className="model-icon" />,
    type: "perplexity"
  },
  {
    id: "openrouter:perplexity/sonar-deep-research",
    name: "Perplexity: Sonar Deep Research (OpenRouter)",
    description: "Comprehensive deep analysis",
    icon: <Microscope className="model-icon" />,
    type: "perplexity"
  },
  {
    id: "openrouter:perplexity/sonar-reasoning-pro",
    name: "Perplexity: Sonar Reasoning Pro (OpenRouter)",
    description: "Advanced reasoning search",
    icon: <Brain className="model-icon" />,
    type: "perplexity"
  },
  {
    id: "openrouter:perplexity/sonar-pro-search",
    name: "Perplexity: Sonar Pro Search (OpenRouter)",
    description: "Pro search variant",
    icon: <Search className="model-icon" />,
    type: "perplexity"
  },
];

export const OPENROUTER_MODELS: AIModel[] = [
  {
    id: "infron:deepseek/deepseek-chat",
    name: "Deepseek: Deepseek Chat (Infron)",
    description: "DeepSeek chat model",
    icon: <Brain className="model-icon" />,
    type: "openrouter"
  },
  {
    id: "infron:deepseek/deepseek-r1",
    name: "Deepseek: Deepseek R1 (Infron)",
    description: "DeepSeek reasoning model",
    badge: "Reasoning",
    icon: <Brain className="model-icon" />,
    type: "openrouter"
  },
  {
    id: "infron:meta-llama/llama-3.3-70b-instruct",
    name: "Meta: Llama 3.3 70B Instruct (Infron)",
    description: "Meta's Llama 3.3 70B",
    icon: <Brain className="model-icon" />,
    type: "openrouter"
  },
  {
    id: "infron:google/gemini-2.5-pro",
    name: "Google: Gemini 2.5 pro (Infron)",
    description: "Google's Gemini 2.5 Pro",
    badge: "Pro",
    icon: <Sparkles className="model-icon" />,
    type: "openrouter"
  },
  {
    id: "infron:google/gemini-2.5-flash",
    name: "Google: Gemini 2.5 flash (Infron)",
    description: "Google's fast Gemini 2.5 Flash",
    icon: <Zap className="model-icon" />,
    type: "openrouter"
  },
  {
    id: "infron:google/gemma-3-27b-it",
    name: "Google: Gemma 3 27B IT (Infron)",
    description: "Google's Gemma 3 27B",
    icon: <Brain className="model-icon" />,
    type: "openrouter"
  },
  {
    id: "infron:qwen/qwen3-235b-a22b",
    name: "Qwen: Qwen3 235B A22B (Infron)",
    description: "Qwen3 235B MoE",
    badge: "Large",
    icon: <Brain className="model-icon" />,
    type: "openrouter"
  },
  {
    id: "infron:qwen/qwen3-32b",
    name: "Qwen: Qwen3 32B (Infron)",
    description: "Qwen3 32B",
    icon: <Cpu className="model-icon" />,
    type: "openrouter"
  },
  {
    id: "openrouter:microsoft/phi-4",
    name: "Microsoft: Phi 4 (OpenRouter)",
    description: "Microsoft's Phi-4",
    icon: <Cpu className="model-icon" />,
    type: "openrouter"
  },
  {
    id: "openrouter:mistralai/mixtral-8x22b-instruct",
    name: "Mistral: Mixtral 8x22B Instruct (OpenRouter)",
    description: "Mixtral 8x22B MoE",
    badge: "MoE",
    icon: <Sparkles className="model-icon" />,
    type: "openrouter"
  },
  {
    id: "openrouter:moonshotai/kimi-k2",
    name: "MoonshotAI: Kimi K2 0711 (OpenRouter)",
    description: "Kimi K2 via OpenRouter",
    icon: <Sparkles className="model-icon" />,
    type: "openrouter"
  },
  {
    id: "infron:openai/gpt-4o",
    name: "OpenAI: Gpt 4o (Infron)",
    description: "GPT-4o via OpenRouter",
    badge: "Vision",
    icon: <Bot className="model-icon" />,
    type: "openrouter"
  },
  {
    id: "infron:z-ai/glm-4.6",
    name: "Z.AI: GLM 4.6 (Infron)",
    description: "Zhipu GLM 4.6",
    icon: <Brain className="model-icon" />,
    type: "openrouter"
  },
  {
    id: "infron:minimax/minimax-m2",
    name: "MiniMax: MiniMax M2 (Infron)",
    description: "MiniMax M2",
    icon: <Brain className="model-icon" />,
    type: "openrouter"
  },
];
/** Display label for a model ID: the ID itself (unambiguous). */
export function modelDisplayName(id?: string): string {
  return id || "AI";
}
// ---- Two-step model picker: pick a provider, then a model from that
// provider's full list. Backed by the static snapshot of the live Puter
// catalog (src/lib/puterModels.generated.ts) — the picker renders instantly,
// no API call on open. Curated entries keep their badges.

const CURATED: AIModel[] = [...CLAUDE_MODELS, ...MISTRAL_MODELS, ...PERPLEXITY_MODELS, ...GROK_MODELS, ...KIMI_MODELS, ...OPENAI_MODELS, ...OPENROUTER_MODELS];

const CURATED_BADGE_OF = new Map(CURATED.filter((m) => m.badge).map((m) => [m.id, m.badge as string]));

// Brand labels for snapshot provider keys. Providers sharing a label merge
// into one group. Unknown keys fall back to a capitalized label + generic icon.
const LIVE_PROVIDER_BRANDS: Record<string, { label: string; icon: React.ReactNode }> = {
  "claude": { label: "Claude", icon: <Brain className="provider-icon" /> },
  "openai-completion": { label: "OpenAI", icon: <Brain className="provider-icon" /> },
  "openai-responses": { label: "OpenAI", icon: <Brain className="provider-icon" /> },
  "azure-openai": { label: "Azure OpenAI", icon: <Cpu className="provider-icon" /> },
  "azure-openai-responses": { label: "Azure OpenAI", icon: <Cpu className="provider-icon" /> },
  "xai": { label: "Grok", icon: <MessageSquare className="provider-icon" /> },
  "mistral": { label: "Mistral", icon: <Wind className="provider-icon" /> },
  "moonshotai": { label: "Kimi", icon: <Brain className="provider-icon" /> },
  "gemini": { label: "Gemini", icon: <Sparkles className="provider-icon" /> },
  "deepseek": { label: "DeepSeek", icon: <Brain className="provider-icon" /> },
  "openrouter": { label: "OpenRouter", icon: <Globe className="provider-icon" /> },
  "infron": { label: "Infron", icon: <Zap className="provider-icon" /> },
  "alibaba": { label: "Alibaba", icon: <Bot className="provider-icon" /> },
  "byteplus": { label: "BytePlus", icon: <Bot className="provider-icon" /> },
  "minimax": { label: "MiniMax", icon: <Bot className="provider-icon" /> },
  "together-ai": { label: "Together AI", icon: <Bot className="provider-icon" /> },
  "zai": { label: "Z.AI", icon: <Bot className="provider-icon" /> },
};

const brandFor = (providerKey: string): { label: string; icon: React.ReactNode } =>
  LIVE_PROVIDER_BRANDS[providerKey] ?? {
    label: providerKey.charAt(0).toUpperCase() + providerKey.slice(1),
    icon: <Bot className="provider-icon" />,
  };

interface BrandGroup {
  label: string;
  icon: React.ReactNode;
  models: SnapshotModel[];
}

/** Snapshot models grouped by brand label: known brands first (in the order
 *  above), then remaining providers by model count. */
function brandGroups(): BrandGroup[] {
  const known = new Map<string, BrandGroup>();
  const knownOrder: string[] = [];
  for (const key of Object.keys(LIVE_PROVIDER_BRANDS)) {
    const b = LIVE_PROVIDER_BRANDS[key];
    if (!known.has(b.label)) {
      known.set(b.label, { label: b.label, icon: b.icon, models: [] });
      knownOrder.push(b.label);
    }
  }
  const extra = new Map<string, BrandGroup>();
  for (const m of PUTER_MODELS_SNAPSHOT) {
    // ":batch" variants only work with Puter's Batch API, never with ai.chat —
    // listing them would let users pick a model that always fails with a 404.
    if (m.id.endsWith(":batch")) continue;
    const b = brandFor(m.provider);
    const target = known.get(b.label) ?? (() => {
      let g = extra.get(b.label);
      if (!g) {
        g = { label: b.label, icon: b.icon, models: [] };
        extra.set(b.label, g);
      }
      return g;
    })();
    target.models.push(m);
  }
  const extras = [...extra.values()]
    .filter((g) => g.models.length > 0)
    .sort((a, b2) => b2.models.length - a.models.length);
  return knownOrder
    .map((label) => known.get(label)!)
    .filter((g) => g.models.length > 0)
    .concat(extras);
}

/** Category filter chips (multi-select). Matches a model having ANY selected category. */
const CATEGORIES = [
  { key: CAT_VISION, label: "Vision" },
  { key: CAT_REASONING, label: "Reasoning" },
  { key: CAT_WEBSEARCH, label: "Web Search" },
  { key: CAT_FUNCTION_CALLING, label: "Function Calling" },
  { key: CAT_AUDIO_IN, label: "Audio Input" },
  { key: CAT_VIDEO_IN, label: "Video Input" },
];

/** Category labels for a model, from its bitmask. */
const catsOf = (m: SnapshotModel): string[] =>
  CATEGORIES.filter((c) => (m.cats & c.key) !== 0).map((c) => c.label);

export const ModelSelector = ({ selectedModel, onModelChange }: ModelSelectorProps) => {
  const [open, setOpen] = useState(false);
  const [brand, setBrand] = useState("");
  const [query, setQuery] = useState("");
  const [catMask, setCatMask] = useState(0);
  const [filterOpen, setFilterOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const groups = useMemo(brandGroups, []);

  const brandOfModel = (id: string): string => {
    const m = PUTER_MODELS_SNAPSHOT.find((s) => s.id === id);
    return m ? brandFor(m.provider).label : "";
  };

  const openPicker = () => {
    setBrand(brandOfModel(selectedModel) || groups[0]?.label || "");
    setQuery("");
    setCatMask(0);
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      // Let the filter dropdown handle its own Escape first.
      if (e.key === "Escape" && !filterOpen) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, filterOpen]);

  // Category mode (multi-select): ignore the provider sidebar, show matching
  // models from all providers. Otherwise the active provider's models.
  const inCategoryMode = catMask !== 0;
  const active = inCategoryMode ? undefined : (groups.find((g) => g.label === brand) ?? groups[0]);
  const allModels = useMemo(() => {
    const seen = new Set<string>();
    const out: SnapshotModel[] = [];
    for (const g of groups)
      for (const m of g.models)
        if (!seen.has(m.id)) {
          seen.add(m.id);
          out.push(m);
        }
    return out;
  }, [groups]);
  const base = inCategoryMode
    ? allModels.filter((m) => (m.cats & catMask) !== 0)
    : (active?.models ?? []);
  const q = query.trim().toLowerCase();
  const models = q
    ? base.filter((m) => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q))
    : base;

  const handleSelect = (id: string) => {
    onModelChange(id);
    setOpen(false);
  };

  const selectProvider = (label: string) => {
    setCatMask(0);
    setBrand(label);
  };

  const catCount = CATEGORIES.filter((c) => (catMask & c.key) !== 0).length;

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="ms-trigger"
        onClick={openPicker}
        aria-label={`Selected model: ${modelDisplayName(selectedModel)}`}
        aria-haspopup="dialog"
      >
        <span className="ms-trigger-label">{modelDisplayName(selectedModel)}</span>
        <ChevronDown className="ms-trigger-chevron" aria-hidden="true" />
      </Button>
      {open && (
        <div className="ms-modal-overlay" onClick={() => setOpen(false)}>
          <div
            className="ms-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Select model"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="ms-topbar">
              <div className="ms-search-wrap">
                <div className="ms-search-relative">
                  <Search className="ms-search-icon" aria-hidden="true" />
                  <Input
                    ref={searchRef}
                    aria-label="Search models"
                    placeholder={inCategoryMode ? "Search all models…" : `Search ${active?.label ?? ""} models…`}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="ms-search-input"
                  />
                </div>
              </div>
              <DropdownMenu onOpenChange={setFilterOpen}>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="ms-filter-btn" aria-label="Filter by category">
                    <ListFilter className="ms-filter-icon" aria-hidden="true" />
                    {catCount > 0 && (
                      <span className="ms-filter-count">{catCount}</span>
                    )}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="ms-filter-menu">
                  <DropdownMenuLabel>Filter by category</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {CATEGORIES.map((c) => (
                    <DropdownMenuCheckboxItem
                      key={c.label}
                      checked={(catMask & c.key) !== 0}
                      onCheckedChange={() => setCatMask((m) => m ^ c.key)}
                      onSelect={(e) => e.preventDefault()}
                    >
                      {c.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                  {catMask !== 0 && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => setCatMask(0)}>
                        Clear filters
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="ms-picker-body">
              <div className="ms-provider-sidebar">
                <div className="ms-provider-list" role="tablist" aria-label="Providers">
                {groups.map((g) => (
                  <button
                    key={g.label}
                    type="button"
                    role="tab"
                    aria-selected={!inCategoryMode && g.label === active?.label}
                    className={"ms-provider-item" + (!inCategoryMode && g.label === active?.label ? " ms-provider-item-active" : "")}
                    onClick={() => selectProvider(g.label)}
                  >
                    <span className="ms-provider-item-label">{g.label}</span>
                    <span className="ms-provider-count">{g.models.length}</span>
                  </button>
                ))}
                </div>
              </div>
              <div className="ms-modal-list">
                {models.length === 0 && (
                  <div className="ms-empty">No models found</div>
                )}
                {models.map((m) => {
                  const catLabels = catsOf(m);
                  const curated = CURATED_BADGE_OF.get(m.id);
                  // Skip a curated badge that duplicates a category tag.
                  const showCurated = curated && !catLabels.includes(curated);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      className={"ms-item" + (m.id === selectedModel ? " ms-item-selected" : "")}
                      onClick={() => handleSelect(m.id)}
                    >
                      <span className="ms-item-name">{m.id}</span>
                      <span className="ms-item-side">
                        {catLabels.map((label) => (
                          <span key={label} className="ms-cat-tag">
                            {label}
                          </span>
                        ))}
                        {showCurated && (
                          <Badge variant="secondary" className="ms-item-badge">
                            {curated}
                          </Badge>
                        )}
                        {m.id === selectedModel && <Check className="ms-item-check" aria-hidden="true" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
