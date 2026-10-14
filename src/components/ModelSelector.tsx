import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, Zap, Brain, Cpu, Wind, Sparkles, Code, Bot, Search, Microscope, MessageSquare, Globe, Check } from "lucide-react";
import { getModelCatalog, getModelProviders, isModelAvailable, liveProviderForModelId, type ModelCatalog } from "@/lib/models";
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
export const ModelSelector = ({ selectedModel, onModelChange }: ModelSelectorProps) => {
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null);
  const [providers, setProviders] = useState<string[] | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  // Live catalog: hide models that no longer resolve (IDs rot; the catalog is
  // the documented source of truth). Offline/unavailable -> show everything.
  useEffect(() => {
    getModelCatalog().then((c) => { if (c) setCatalog(c); });
    getModelProviders().then((p) => { if (p) setProviders(p); });
  }, []);

  const visible = (models: AIModel[]): AIModel[] => {
    const q = query.trim().toLowerCase();
    const byCatalog = catalog ? models.filter((m) => isModelAvailable(m.id, catalog)) : models;
    return q
      ? byCatalog.filter((m) => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q))
      : byCatalog;
  };

  const allModels = [...CLAUDE_MODELS, ...MISTRAL_MODELS, ...PERPLEXITY_MODELS, ...GROK_MODELS, ...KIMI_MODELS, ...OPENAI_MODELS, ...OPENROUTER_MODELS];
  const currentModel = allModels.find((m) => m.id === selectedModel);

  interface ProviderGroup {
    id: string;
    name: string;
    icon: React.ReactNode;
    models: AIModel[];
  }

  // Brand labels for live provider keys (verified against the real API
  // 2026-10-13: gpt-* live under azure-openai(-responses)/openai-completion,
  // grok-* under xai (some under azure-openai), infron:/openrouter: prefixes
  // route through infron/openrouter). Variants sharing a label merge into one
  // group. Unknown keys fall back to a capitalized label + generic icon.
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

  const brandFor = (liveKey: string): { label: string; icon: React.ReactNode } =>
    LIVE_PROVIDER_BRANDS[liveKey] ?? {
      label: liveKey.charAt(0).toUpperCase() + liveKey.slice(1),
      icon: <Bot className="provider-icon" />,
    };

  // Live path: group the curated models by their real provider route,
  // ordered by `puter.ai.listModelProviders()`. Dead IDs vanish via the
  // providerOf lookup; providers with no curated models are hidden.
  // Offline path: the hardcoded groups, unchanged behavior.
  const buildGroups = (): ProviderGroup[] => {
    if (providers && catalog) {
      const liveSet = new Set(providers.map((p) => p.toLowerCase()));
      const order: string[] = [];
      const byBrand = new Map<string, { label: string; icon: React.ReactNode; models: AIModel[] }>();
      for (const p of liveSet) {
        const brand = brandFor(p);
        if (!byBrand.has(brand.label)) {
          byBrand.set(brand.label, { label: brand.label, icon: brand.icon, models: [] });
          order.push(brand.label);
        }
      }
      for (const m of allModels) {
        const live = liveProviderForModelId(m.id, catalog)?.toLowerCase();
        if (!live || !liveSet.has(live)) continue;
        byBrand.get(brandFor(live).label)?.models.push(m);
      }
      return order
        .map((label) => {
          const b = byBrand.get(label)!;
          return { id: label, name: b.label, icon: b.icon, models: visible(b.models) };
        })
        .filter((g) => g.models.length > 0);
    }
    return PROVIDERS.map((p) => ({
      id: p.id,
      name: p.name,
      icon: p.icon,
      models: visible(getModelsForProvider(p.id)),
    })).filter((g) => g.models.length > 0);
  };

  const groups = buildGroups();

  const handleSelect = (modelId: string) => {
    onModelChange(modelId);
    setOpen(false);
    setQuery("");
  };

  return (
    <DropdownMenu open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery(""); }}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="ms-trigger"
          aria-label={`Selected model: ${currentModel?.name ?? "Select model"}`}
        >
          <span className="ms-trigger-label">{currentModel?.name ?? "Select model"}</span>
          <ChevronDown className="ms-trigger-chevron" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="ms-menu">
        <div className="ms-search-wrap">
          <div className="ms-search-relative">
            <Search className="ms-search-icon" aria-hidden="true" />
            <Input
              id="search-models"
              name="search"
              aria-label="Search models"
              placeholder="Search models…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              className="ms-search-input"
            />
          </div>
        </div>
        <div className="ms-list">
          {groups.length === 0 && (
            <div className="ms-empty">
              No models found
            </div>
          )}
          {groups.map((g) => (
            <div key={g.id}>
              <DropdownMenuLabel className="ms-group-label">
                {g.icon}
                {g.name}
              </DropdownMenuLabel>
              {g.models.map((model) => (
                <DropdownMenuItem
                  key={model.id}
                  onSelect={() => handleSelect(model.id)}
                  className="ms-item"
                >
                  <span className="ms-item-main">
                    {model.icon}
                    <span className="ms-item-name">{model.name}</span>
                  </span>
                  <span className="ms-item-side">
                    {model.badge && (
                      <Badge variant="secondary" className="ms-item-badge">
                        {model.badge}
                      </Badge>
                    )}
                    {model.id === selectedModel && <Check className="ms-item-check" />}
                  </span>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
            </div>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

function getModelsForProvider(provider: ProviderId): AIModel[] {
  switch (provider) {
    case "claude": return CLAUDE_MODELS;
    case "mistral": return MISTRAL_MODELS;
    case "perplexity": return PERPLEXITY_MODELS;
    case "grok": return GROK_MODELS;
    case "kimi": return KIMI_MODELS;
    case "openai": return OPENAI_MODELS;
    case "openrouter": return OPENROUTER_MODELS;
    default: return CLAUDE_MODELS;
  }
}
