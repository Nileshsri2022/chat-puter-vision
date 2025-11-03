import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronDown, Zap, Brain, Cpu, Wind, Sparkles, Code, Bot, Search, Microscope, MessageSquare, Globe } from "lucide-react";

export interface AIModel {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  badge?: string;
  type: "claude" | "mistral" | "perplexity" | "grok" | "openrouter";
}

interface ModelSelectorProps {
  selectedModel: string;
  onModelChange: (model: string) => void;
}

const CLAUDE_MODELS: AIModel[] = [
  {
    id: "claude-sonnet-4",
    name: "Claude Sonnet 4",
    description: "Fast and capable",
    icon: <Zap className="w-4 h-4" />,
    badge: "Recommended",
    type: "claude"
  },
  {
    id: "claude-opus-4",
    name: "Claude Opus 4",
    description: "Most capable model",
    icon: <Brain className="w-4 h-4" />,
    type: "claude"
  },
  {
    id: "claude-opus-4-1",
    name: "Claude Opus 4.1",
    description: "Enhanced Opus version",
    icon: <Brain className="w-4 h-4" />,
    type: "claude"
  },
  {
    id: "claude-sonnet-4-5",
    name: "Claude Sonnet 4.5",
    description: "Latest Sonnet model",
    icon: <Zap className="w-4 h-4" />,
    type: "claude"
  },
  {
    id: "claude-3-7-sonnet",
    name: "Claude 3.7 Sonnet",
    description: "Advanced reasoning",
    icon: <Cpu className="w-4 h-4" />,
    type: "claude"
  },
  {
    id: "claude-3-7-opus",
    name: "Claude 3.7 Opus",
    description: "Ultimate performance",
    icon: <Brain className="w-4 h-4" />,
    type: "claude"
  },
];

const MISTRAL_MODELS: AIModel[] = [
  {
    id: "mistralai/codestral-2501",
    name: "Codestral 2501",
    description: "Code generation specialist",
    icon: <Code className="w-4 h-4" />,
    type: "mistral"
  },
  {
    id: "mistralai/codestral-2508",
    name: "Codestral 2508",
    description: "Enhanced code model",
    icon: <Code className="w-4 h-4" />,
    type: "mistral"
  },
  {
    id: "mistralai/devstral-medium",
    name: "Devstral Medium",
    description: "Development focused",
    icon: <Bot className="w-4 h-4" />,
    type: "mistral"
  },
  {
    id: "mistralai/devstral-small",
    name: "Devstral Small",
    description: "Lightweight dev model",
    icon: <Bot className="w-4 h-4" />,
    type: "mistral"
  },
  {
    id: "mistralai/devstral-small-2505",
    name: "Devstral Small 2505",
    description: "Optimized small model",
    icon: <Bot className="w-4 h-4" />,
    type: "mistral"
  },
  {
    id: "mistralai/magistral-medium-2506",
    name: "Magistral Medium",
    description: "Magistral series",
    icon: <Sparkles className="w-4 h-4" />,
    type: "mistral"
  },
  {
    id: "mistralai/magistral-small-2506",
    name: "Magistral Small",
    description: "Small Magistral model",
    icon: <Sparkles className="w-4 h-4" />,
    type: "mistral"
  },
  {
    id: "mistralai/ministral-3b",
    name: "Ministral 3B",
    description: "Ultra lightweight",
    icon: <Wind className="w-4 h-4" />,
    type: "mistral"
  },
  {
    id: "mistralai/ministral-8b",
    name: "Ministral 8B",
    description: "Lightweight model",
    icon: <Wind className="w-4 h-4" />,
    type: "mistral"
  },
  {
    id: "mistralai/mistral-large",
    name: "Mistral Large",
    description: "Most capable Mistral",
    icon: <Brain className="w-4 h-4" />,
    badge: "Flagship",
    type: "mistral"
  },
  {
    id: "mistralai/mistral-large-2407",
    name: "Mistral Large 2407",
    description: "Large model v2407",
    icon: <Brain className="w-4 h-4" />,
    type: "mistral"
  },
  {
    id: "mistralai/mistral-large-2411",
    name: "Mistral Large 2411",
    description: "Large model v2411",
    icon: <Brain className="w-4 h-4" />,
    type: "mistral"
  },
  {
    id: "mistralai/mistral-medium-3",
    name: "Mistral Medium 3",
    description: "Medium capability",
    icon: <Cpu className="w-4 h-4" />,
    type: "mistral"
  },
  {
    id: "mistralai/mistral-nemo",
    name: "Mistral Nemo",
    description: "Nemo model",
    icon: <Bot className="w-4 h-4" />,
    type: "mistral"
  },
  {
    id: "mistralai/mistral-small",
    name: "Mistral Small",
    description: "Small efficient model",
    icon: <Wind className="w-4 h-4" />,
    type: "mistral"
  },
  {
    id: "mistralai/mistral-small-24b-instruct-2501",
    name: "Mistral Small 24B",
    description: "24B parameter model",
    icon: <Cpu className="w-4 h-4" />,
    type: "mistral"
  },
  {
    id: "mistralai/mistral-small-3.1-24b-instruct",
    name: "Mistral Small 3.1",
    description: "Small v3.1",
    icon: <Wind className="w-4 h-4" />,
    type: "mistral"
  },
  {
    id: "mistralai/mistral-small-3.2-24b-instruct",
    name: "Mistral Small 3.2",
    description: "Small v3.2",
    icon: <Wind className="w-4 h-4" />,
    type: "mistral"
  },
  {
    id: "mistralai/mistral-tiny",
    name: "Mistral Tiny",
    description: "Ultra compact",
    icon: <Wind className="w-4 h-4" />,
    type: "mistral"
  },
  {
    id: "mistralai/mixtral-8x22b-instruct",
    name: "Mixtral 8x22B",
    description: "Mixture of experts",
    icon: <Sparkles className="w-4 h-4" />,
    type: "mistral"
  },
  {
    id: "mistralai/mixtral-8x7b-instruct",
    name: "Mixtral 8x7B",
    description: "MoE 7B model",
    icon: <Sparkles className="w-4 h-4" />,
    type: "mistral"
  },
  {
    id: "mistralai/pixtral-12b",
    name: "Pixtral 12B",
    description: "Vision capable",
    icon: <Bot className="w-4 h-4" />,
    type: "mistral"
  },
];

const PERPLEXITY_MODELS: AIModel[] = [
  {
    id: "perplexity/r1-1776",
    name: "R1 1776",
    description: "Historical research model",
    icon: <Microscope className="w-4 h-4" />,
    type: "perplexity"
  },
  {
    id: "perplexity/sonar",
    name: "Sonar",
    description: "General research model",
    icon: <Search className="w-4 h-4" />,
    badge: "Recommended",
    type: "perplexity"
  },
  {
    id: "perplexity/sonar-deep-research",
    name: "Sonar Deep Research",
    description: "Comprehensive analysis",
    icon: <Microscope className="w-4 h-4" />,
    type: "perplexity"
  },
  {
    id: "perplexity/sonar-pro",
    name: "Sonar Pro",
    description: "Professional research",
    icon: <Search className="w-4 h-4" />,
    badge: "Pro",
    type: "perplexity"
  },
  {
    id: "perplexity/sonar-reasoning",
    name: "Sonar Reasoning",
    description: "Logical reasoning",
    icon: <Brain className="w-4 h-4" />,
    type: "perplexity"
  },
  {
    id: "perplexity/sonar-reasoning-pro",
    name: "Sonar Reasoning Pro",
    description: "Advanced reasoning",
    icon: <Brain className="w-4 h-4" />,
    badge: "Pro",
    type: "perplexity"
  },
];

const OPENROUTER_MODELS: AIModel[] = [
  {
    id: "openrouter:agentica-org/deepcoder-14b-preview",
    name: "DeepCoder 14B Preview",
    description: "Agentica's DeepCoder 14B preview model",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:agentica-org/deepcoder-14b-preview:free",
    name: "DeepCoder 14B Preview (Free)",
    description: "Agentica's DeepCoder 14B preview model (free tier)",
    icon: <Brain className="w-4 h-4" />,
    badge: "Free",
    type: "openrouter"
  },
  {
    id: "openrouter:ai21/jamba-large-1.7",
    name: "Jamba Large 1.7",
    description: "AI21's Jamba Large 1.7 model",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:ai21/jamba-mini-1.7",
    name: "Jamba Mini 1.7",
    description: "AI21's Jamba Mini 1.7 model",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:aion-labs/aion-1.0",
    name: "Aion 1.0",
    description: "Aion Labs' Aion 1.0 model",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:aion-labs/aion-1.0-mini",
    name: "Aion 1.0 Mini",
    description: "Aion Labs' Aion 1.0 Mini model",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:aion-labs/aion-rp-llama-3.1-8b",
    name: "Aion RP Llama 3.1 8B",
    description: "Aion Labs' roleplay fine-tuned Llama 3.1 8B",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:alfredpros/codellama-7b-instruct-solidity",
    name: "CodeLlama 7B Instruct Solidity",
    description: "AlfredPros' Solidity-specialized CodeLlama 7B",
    icon: <Brain className="w-4 h-4" />,
    badge: "Code",
    type: "openrouter"
  },
  {
    id: "openrouter:alibaba/tongyi-deepresearch-30b-a3b",
    name: "Tongyi DeepResearch 30B",
    description: "Alibaba's Tongyi DeepResearch 30B model",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:alpindale/goliath-120b",
    name: "Goliath 120B",
    description: "Alpindale's Goliath 120B model",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:amazon/nova-lite-v1",
    name: "Nova Lite v1",
    description: "Amazon's Nova Lite v1 model",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:amazon/nova-micro-v1",
    name: "Nova Micro v1",
    description: "Amazon's Nova Micro v1 model",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:amazon/nova-pro-v1",
    name: "Nova Pro v1",
    description: "Amazon's Nova Pro v1 model",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:anthracite-org/magnum-v2-72b",
    name: "Magnum v2 72B",
    description: "Anthracite's Magnum v2 72B model",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:anthracite-org/magnum-v4-72b",
    name: "Magnum v4 72B",
    description: "Anthracite's Magnum v4 72B model",
    icon: <Brain className="w-4 h-4" />,
    badge: "Latest",
    type: "openrouter"
  },
  {
    id: "openrouter:anthropic/claude-3-haiku",
    name: "Claude 3 Haiku",
    description: "Anthropic's fast and efficient Claude 3 Haiku",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:anthropic/claude-3-opus",
    name: "Claude 3 Opus",
    description: "Anthropic's powerful Claude 3 Opus",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:anthropic/claude-3.5-haiku",
    name: "Claude 3.5 Haiku",
    description: "Anthropic's upgraded Claude 3.5 Haiku",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:anthropic/claude-3.5-haiku-20241022",
    name: "Claude 3.5 Haiku (2024-10-22)",
    description: "Anthropic's Claude 3.5 Haiku snapshot",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:anthropic/claude-3.5-sonnet",
    name: "Claude 3.5 Sonnet",
    description: "Anthropic's balanced Claude 3.5 Sonnet",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:anthropic/claude-3.5-sonnet-20240620",
    name: "Claude 3.5 Sonnet (2024-06-20)",
    description: "Anthropic's Claude 3.5 Sonnet snapshot",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:anthropic/claude-3.7-sonnet",
    name: "Claude 3.7 Sonnet",
    description: "Anthropic's advanced Claude 3.7 Sonnet",
    icon: <Brain className="w-4 h-4" />,
    badge: "Latest",
    type: "openrouter"
  },
  {
    id: "openrouter:anthropic/claude-3.7-sonnet:thinking",
    name: "Claude 3.7 Sonnet (Thinking)",
    description: "Anthropic's Claude 3.7 Sonnet with thinking mode",
    icon: <Brain className="w-4 h-4" />,
    badge: "Thinking",
    type: "openrouter"
  },
  {
    id: "openrouter:anthropic/claude-opus-4",
    name: "Claude Opus 4",
    description: "Anthropic's flagship Claude Opus 4",
    icon: <Brain className="w-4 h-4" />,
    badge: "Flagship",
    type: "openrouter"
  },
  {
    id: "openrouter:anthropic/claude-opus-4.1",
    name: "Claude Opus 4.1",
    description: "Anthropic's enhanced Claude Opus 4.1",
    icon: <Brain className="w-4 h-4" />,
    badge: "Latest",
    type: "openrouter"
  },
  {
    id: "openrouter:anthropic/claude-sonnet-4",
    name: "Claude Sonnet 4",
    description: "Anthropic's Claude Sonnet 4 model",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:anthropic/claude-sonnet-4.5",
    name: "Claude Sonnet 4.5",
    description: "Anthropic's advanced Claude Sonnet 4.5",
    icon: <Brain className="w-4 h-4" />,
    badge: "Latest",
    type: "openrouter"
  },
  {
    id: "openrouter:arcee-ai/coder-large",
    name: "Coder Large",
    description: "Arcee's large coding model",
    icon: <Brain className="w-4 h-4" />,
    badge: "Code",
    type: "openrouter"
  },
  {
    id: "openrouter:arcee-ai/maestro-reasoning",
    name: "Maestro Reasoning",
    description: "Arcee's reasoning-focused Maestro model",
    icon: <Brain className="w-4 h-4" />,
    badge: "Reasoning",
    type: "openrouter"
  },
  {
    id: "openrouter:arcee-ai/spotlight",
    name: "Spotlight",
    description: "Arcee's Spotlight model",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:arcee-ai/virtuoso-large",
    name: "Virtuoso Large",
    description: "Arcee's Virtuoso Large model",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:arliai/qwq-32b-arliai-rpr-v1",
    name: "QWQ 32B Arliai RPR v1",
    description: "Arliai's QWQ 32B roleplay model",
    icon: <Brain className="w-4 h-4" />,
    badge: "RP",
    type: "openrouter"
  },
  {
    id: "openrouter:arliai/qwq-32b-arliai-rpr-v1:free",
    name: "QWQ 32B Arliai RPR v1 (Free)",
    description: "Arliai's QWQ 32B roleplay model (free)",
    icon: <Brain className="w-4 h-4" />,
    badge: "Free",
    type: "openrouter"
  },
  {
    id: "openrouter:baidu/ernie-4.5-21b-a3b",
    name: "ERNIE 4.5 21B",
    description: "Baidu's ERNIE 4.5 21B model",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:baidu/ernie-4.5-300b-a47b",
    name: "ERNIE 4.5 300B",
    description: "Baidu's massive ERNIE 4.5 300B model",
    icon: <Brain className="w-4 h-4" />,
    badge: "Large",
    type: "openrouter"
  },
  {
    id: "openrouter:baidu/ernie-4.5-vl-28b-a3b",
    name: "ERNIE 4.5 VL 28B",
    description: "Baidu's vision-language ERNIE 4.5 28B",
    icon: <Brain className="w-4 h-4" />,
    badge: "Vision",
    type: "openrouter"
  },
  {
    id: "openrouter:baidu/ernie-4.5-vl-424b-a47b",
    name: "ERNIE 4.5 VL 424B",
    description: "Baidu's large vision-language ERNIE 4.5 424B",
    icon: <Brain className="w-4 h-4" />,
    badge: "Vision",
    type: "openrouter"
  },
  {
    id: "openrouter:bytedance/ui-tars-1.5-7b",
    name: "UI-TARS 1.5 7B",
    description: "ByteDance's UI-TARS 1.5 7B model",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:bytedance/seed-oss-36b-instruct",
    name: "SEED-OSS 36B Instruct",
    description: "ByteDance's SEED-OSS 36B instruction model",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:cognitivecomputations/dolphin-mistral-24b-venice-edition:free",
    name: "Dolphin Mistral 24B Venice (Free)",
    description: "CognitiveComputations' Dolphin Mistral 24B Venice edition (free)",
    icon: <Brain className="w-4 h-4" />,
    badge: "Free",
    type: "openrouter"
  },
  {
    id: "openrouter:cognitivecomputations/dolphin-mixtral-8x22b",
    name: "Dolphin Mixtral 8x22B",
    description: "CognitiveComputations' Dolphin Mixtral 8x22B",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:cognitivecomputations/dolphin3.0-mistral-24b",
    name: "Dolphin 3.0 Mistral 24B",
    description: "CognitiveComputations' Dolphin 3.0 Mistral 24B",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:cognitivecomputations/dolphin3.0-mistral-24b:free",
    name: "Dolphin 3.0 Mistral 24B (Free)",
    description: "CognitiveComputations' Dolphin 3.0 Mistral 24B (free)",
    icon: <Brain className="w-4 h-4" />,
    badge: "Free",
    type: "openrouter"
  },
  {
    id: "openrouter:cognitivecomputations/dolphin3.0-r1-mistral-24b",
    name: "Dolphin 3.0 R1 Mistral 24B",
    description: "CognitiveComputations' Dolphin 3.0 R1 Mistral 24B",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:cognitivecomputations/dolphin3.0-r1-mistral-24b:free",
    name: "Dolphin 3.0 R1 Mistral 24B (Free)",
    description: "CognitiveComputations' Dolphin 3.0 R1 Mistral 24B (free)",
    icon: <Brain className="w-4 h-4" />,
    badge: "Free",
    type: "openrouter"
  },
  {
    id: "openrouter:cohere/command",
    name: "Command",
    description: "Cohere's Command model",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:cohere/command-a",
    name: "Command A",
    description: "Cohere's Command A model",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:cohere/command-r",
    name: "Command R",
    description: "Cohere's retrieval-augmented Command R",
    icon: <Brain className="w-4 h-4" />,
    badge: "RAG",
    type: "openrouter"
  },
  {
    id: "openrouter:cohere/command-r-03-2024",
    name: "Command R (03-2024)",
    description: "Cohere's Command R snapshot from March 2024",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:cohere/command-r-08-2024",
    name: "Command R (08-2024)",
    description: "Cohere's Command R snapshot from August 2024",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:cohere/command-r-plus",
    name: "Command R+",
    description: "Cohere's enhanced Command R+",
    icon: <Brain className="w-4 h-4" />,
    badge: "Plus",
    type: "openrouter"
  },
  {
    id: "openrouter:cohere/command-r-plus-04-2024",
    name: "Command R+ (04-2024)",
    description: "Cohere's Command R+ snapshot from April 2024",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:cohere/command-r-plus-08-2024",
    name: "Command R+ (08-2024)",
    description: "Cohere's Command R+ snapshot from August 2024",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:cohere/command-r7b-12-2024",
    name: "Command R 7B (12-2024)",
    description: "Cohere's lightweight Command R 7B from December 2024",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:deepcogito/cogito-v2-preview-llama-109b-moe",
    name: "Cogito v2 Preview Llama 109B MoE",
    description: "DeepCogito's Cogito v2 preview with Llama 109B MoE",
    icon: <Brain className="w-4 h-4" />,
    badge: "Preview",
    type: "openrouter"
  },
  {
    id: "openrouter:deepcogito/cogito-v2-preview-deepseek-671b",
    name: "Cogito v2 Preview DeepSeek 671B",
    description: "DeepCogito's Cogito v2 preview with DeepSeek 671B",
    icon: <Brain className="w-4 h-4" />,
    badge: "Preview",
    type: "openrouter"
  },
  {
    id: "openrouter:deepseek/deepseek-chat",
    name: "DeepSeek Chat",
    description: "DeepSeek's general chat model",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:deepseek/deepseek-chat-v3-0324",
    name: "DeepSeek Chat v3 (03-24)",
    description: "DeepSeek Chat v3 snapshot from March 2024",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:deepseek/deepseek-chat-v3-0324:free",
    name: "DeepSeek Chat v3 (03-24) (Free)",
    description: "DeepSeek Chat v3 snapshot (free tier)",
    icon: <Brain className="w-4 h-4" />,
    badge: "Free",
    type: "openrouter"
  },
  {
    id: "openrouter:deepseek/deepseek-chat-v3.1",
    name: "DeepSeek Chat v3.1",
    description: "DeepSeek's improved Chat v3.1",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:deepseek/deepseek-chat-v3.1:free",
    name: "DeepSeek Chat v3.1 (Free)",
    description: "DeepSeek Chat v3.1 (free tier)",
    icon: <Brain className="w-4 h-4" />,
    badge: "Free",
    type: "openrouter"
  },
  {
    id: "openrouter:deepseek/deepseek-prover-v2",
    name: "DeepSeek Prover v2",
    description: "DeepSeek's math and reasoning Prover v2",
    icon: <Brain className="w-4 h-4" />,
    badge: "Math",
    type: "openrouter"
  },
  {
    id: "openrouter:deepseek/deepseek-r1",
    name: "DeepSeek R1",
    description: "DeepSeek's R1 reasoning model",
    icon: <Brain className="w-4 h-4" />,
    badge: "Reasoning",
    type: "openrouter"
  },
  {
    id: "openrouter:deepseek/deepseek-r1-0528",
    name: "DeepSeek R1 (05-28)",
    description: "DeepSeek R1 snapshot from May 2028",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:deepseek/deepseek-r1-0528-qwen3-8b",
    name: "DeepSeek R1 Qwen3 8B (05-28)",
    description: "DeepSeek R1 distilled into Qwen3 8B",
    icon: <Brain className="w-4 h-4" />,
    badge: "Distill",
    type: "openrouter"
  },
  {
    id: "openrouter:deepseek/deepseek-r1-0528-qwen3-8b:free",
    name: "DeepSeek R1 Qwen3 8B (05-28) (Free)",
    description: "DeepSeek R1 Qwen3 8B distill (free)",
    icon: <Brain className="w-4 h-4" />,
    badge: "Free",
    type: "openrouter"
  },
  {
    id: "openrouter:deepseek/deepseek-r1-0528:free",
    name: "DeepSeek R1 (05-28) (Free)",
    description: "DeepSeek R1 snapshot (free tier)",
    icon: <Brain className="w-4 h-4" />,
    badge: "Free",
    type: "openrouter"
  },
  {
    id: "openrouter:deepseek/deepseek-r1-distill-llama-70b",
    name: "DeepSeek R1 Distill Llama 70B",
    description: "DeepSeek R1 distilled into Llama 70B",
    icon: <Brain className="w-4 h-4" />,
    badge: "Distill",
    type: "openrouter"
  },
  {
    id: "openrouter:deepseek/deepseek-r1-distill-llama-70b:free",
    name: "DeepSeek R1 Distill Llama 70B (Free)",
    description: "DeepSeek R1 Llama 70B distill (free)",
    icon: <Brain className="w-4 h-4" />,
    badge: "Free",
    type: "openrouter"
  },
  {
    id: "openrouter:deepseek/deepseek-r1-distill-llama-8b",
    name: "DeepSeek R1 Distill Llama 8B",
    description: "DeepSeek R1 distilled into Llama 8B",
    icon: <Brain className="w-4 h-4" />,
    badge: "Distill",
    type: "openrouter"
  },
  {
    id: "openrouter:deepseek/deepseek-r1-distill-qwen-14b",
    name: "DeepSeek R1 Distill Qwen 14B",
    description: "DeepSeek R1 distilled into Qwen 14B",
    icon: <Brain className="w-4 h-4" />,
    badge: "Distill",
    type: "openrouter"
  },
  {
    id: "openrouter:deepseek/deepseek-r1-distill-qwen-14b:free",
    name: "DeepSeek R1 Distill Qwen 14B (Free)",
    description: "DeepSeek R1 Qwen 14B distill (free)",
    icon: <Brain className="w-4 h-4" />,
    badge: "Free",
    type: "openrouter"
  },
  {
    id: "openrouter:deepseek/deepseek-r1-distill-qwen-32b",
    name: "DeepSeek R1 Distill Qwen 32B",
    description: "DeepSeek R1 distilled into Qwen 32B",
    icon: <Brain className="w-4 h-4" />,
    badge: "Distill",
    type: "openrouter"
  },
  {
    id: "openrouter:deepseek/deepseek-r1:free",
    name: "DeepSeek R1 (Free)",
    description: "DeepSeek R1 reasoning model (free tier)",
    icon: <Brain className="w-4 h-4" />,
    badge: "Free",
    type: "openrouter"
  },
  {
    id: "openrouter:deepseek/deepseek-v3.1-base",
    name: "DeepSeek v3.1 Base",
    description: "DeepSeek's base v3.1 model (pre-trained)",
    icon: <Brain className="w-4 h-4" />,
    badge: "Base",
    type: "openrouter"
  },
  {
    id: "openrouter:deepseek/deepseek-v3.1-terminus",
    name: "DeepSeek v3.1 Terminus",
    description: "DeepSeek's v3.1 Terminus variant",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:deepseek/deepseek-v3.2-exp",
    name: "DeepSeek v3.2 Exp",
    description: "DeepSeek's experimental v3.2 model",
    icon: <Brain className="w-4 h-4" />,
    badge: "Exp",
    type: "openrouter"
  },
  {
    id: "openrouter:eleutherai/llemma_7b",
    name: "Llemma 7B",
    description: "EleutherAI's math-specialized Llemma 7B",
    icon: <Brain className="w-4 h-4" />,
    badge: "Math",
    type: "openrouter"
  },
  {
    id: "openrouter:google/gemini-2.0-flash-001",
    name: "Gemini 2.0 Flash 001",
    description: "Google's Gemini 2.0 Flash snapshot 001",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:google/gemini-2.0-flash-exp:free",
    name: "Gemini 2.0 Flash Exp (Free)",
    description: "Google's experimental Gemini 2.0 Flash (free)",
    icon: <Brain className="w-4 h-4" />,
    badge: "Free",
    type: "openrouter"
  },
  {
    id: "openrouter:google/gemini-2.0-flash-lite-001",
    name: "Gemini 2.0 Flash Lite 001",
    description: "Google's lightweight Gemini 2.0 Flash Lite",
    icon: <Brain className="w-4 h-4" />,
    badge: "Lite",
    type: "openrouter"
  },
  {
    id: "openrouter:google/gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    description: "Google's fast Gemini 2.5 Flash",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:google/gemini-2.5-flash-image-preview",
    name: "Gemini 2.5 Flash Image Preview",
    description: "Google's Gemini 2.5 Flash with image support (preview)",
    icon: <Brain className="w-4 h-4" />,
    badge: "Vision",
    type: "openrouter"
  },
  {
    id: "openrouter:google/gemini-2.5-flash-image-preview:free",
    name: "Gemini 2.5 Flash Image Preview (Free)",
    description: "Google's Gemini 2.5 Flash image preview (free)",
    icon: <Brain className="w-4 h-4" />,
    badge: "Free",
    type: "openrouter"
  },
  {
    id: "openrouter:google/gemini-2.5-flash-lite",
    name: "Gemini 2.5 Flash Lite",
    description: "Google's lightweight Gemini 2.5 Flash Lite",
    icon: <Brain className="w-4 h-4" />,
    badge: "Lite",
    type: "openrouter"
  },
  {
    id: "openrouter:google/gemini-2.5-flash-lite-preview-06-17",
    name: "Gemini 2.5 Flash Lite Preview (06-17)",
    description: "Google's Gemini 2.5 Flash Lite preview from June 2017",
    icon: <Brain className="w-4 h-4" />,
    badge: "Preview",
    type: "openrouter"
  },
  {
    id: "openrouter:google/gemini-2.5-flash-lite-preview-09-2025",
    name: "Gemini 2.5 Flash Lite Preview (09-2025)",
    description: "Google's Gemini 2.5 Flash Lite preview from September 2025",
    icon: <Brain className="w-4 h-4" />,
    badge: "Preview",
    type: "openrouter"
  },
  {
    id: "openrouter:google/gemini-2.5-flash-preview-09-2025",
    name: "Gemini 2.5 Flash Preview (09-2025)",
    description: "Google's Gemini 2.5 Flash preview from September 2025",
    icon: <Brain className="w-4 h-4" />,
    badge: "Preview",
    type: "openrouter"
  },
  {
    id: "openrouter:google/gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    description: "Google's advanced Gemini 2.5 Pro",
    icon: <Brain className="w-4 h-4" />,
    badge: "Pro",
    type: "openrouter"
  },
  {
    id: "openrouter:google/gemini-2.5-pro-exp-03-25",
    name: "Gemini 2.5 Pro Exp (03-25)",
    description: "Google's experimental Gemini 2.5 Pro from March 2025",
    icon: <Brain className="w-4 h-4" />,
    badge: "Exp",
    type: "openrouter"
  },
  {
    id: "openrouter:google/gemini-2.5-pro-preview",
    name: "Gemini 2.5 Pro Preview",
    description: "Google's Gemini 2.5 Pro preview",
    icon: <Brain className="w-4 h-4" />,
    badge: "Preview",
    type: "openrouter"
  },
  {
    id: "openrouter:google/gemini-2.5-pro-preview-05-06",
    name: "Gemini 2.5 Pro Preview (05-06)",
    description: "Google's Gemini 2.5 Pro preview from May 2006",
    icon: <Brain className="w-4 h-4" />,
    badge: "Preview",
    type: "openrouter"
  },
  {
    id: "openrouter:google/gemini-flash-1.5",
    name: "Gemini Flash 1.5",
    description: "Google's fast Gemini Flash 1.5",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:google/gemini-flash-1.5-8b",
    name: "Gemini Flash 1.5 8B",
    description: "Google's lightweight Gemini Flash 1.5 8B",
    icon: <Brain className="w-4 h-4" />,
    badge: "8B",
    type: "openrouter"
  },
  {
    id: "openrouter:google/gemini-pro-1.5",
    name: "Gemini Pro 1.5",
    description: "Google's Gemini Pro 1.5 model",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:google/gemma-2-27b-it",
    name: "Gemma 2 27B IT",
    description: "Google's Gemma for instruction-tuned Gemma 2 27B",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:google/gemma-2-9b-it",
    name: "Gemma 2 9B IT",
    description: "Google's instruction-tuned Gemma 2 9B",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:google/gemma-2-9b-it:free",
    name: "Gemma 2 9B IT (Free)",
    description: "Google's Gemma 2 9B IT (free tier)",
    icon: <Brain className="w-4 h-4" />,
    badge: "Free",
    type: "openrouter"
  },
  {
    id: "openrouter:google/gemma-3-12b-it",
    name: "Gemma 3 12B IT",
    description: "Google's Gemma 3 12B instruction-tuned",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:google/gemma-3-12b-it:free",
    name: "Gemma 3 12B IT (Free)",
    description: "Google's Gemma 3 12B IT (free)",
    icon: <Brain className="w-4 h-4" />,
    badge: "Free",
    type: "openrouter"
  },
  {
    id: "openrouter:google/gemma-3-27b-it",
    name: "Gemma 3 27B IT",
    description: "Google's Gemma 3 27B instruction-tuned",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:google/gemma-3-27b-it:free",
    name: "Gemma 3 27B IT (Free)",
    description: "Google's Gemma 3 27B IT (free)",
    icon: <Brain className="w-4 h-4" />,
    badge: "Free",
    type: "openrouter"
  },
  {
    id: "openrouter:google/gemma-3-4b-it",
    name: "Gemma 3 4B IT",
    description: "Google's lightweight Gemma 3 4B instruction-tuned",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:google/gemma-3-4b-it:free",
    name: "Gemma 3 4B IT (Free)",
    description: "Google's Gemma 3 4B IT (free)",
    icon: <Brain className="w-4 h-4" />,
    badge: "Free",
    type: "openrouter"
  },
  {
    id: "openrouter:google/gemma-3n-e2b-it:free",
    name: "Gemma 3N E2B IT (Free)",
    description: "Google's Gemma 3N E2B IT (free)",
    icon: <Brain className="w-4 h-4" />,
    badge: "Free",
    type: "openrouter"
  },
  {
    id: "openrouter:google/gemma-3n-e4b-it",
    name: "Gemma 3N E4B IT",
    description: "Google's Gemma 3N E4B instruction-tuned",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:google/gemma-3n-e4b-it:free",
    name: "Gemma 3N E4B IT (Free)",
    description: "Google's Gemma 3N E4B IT (free)",
    icon: <Brain className="w-4 h-4" />,
    badge: "Free",
    type: "openrouter"
  },
  {
    id: "openrouter:gryphe/mythomax-l2-13b",
    name: "Mythomax L2 13B",
    description: "Gryphe's Mythomax L2 13B model",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:inception/mercury",
    name: "Mercury",
    description: "Inception's Mercury model",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:inception/mercury-coder",
    name: "Mercury Coder",
    description: "Inception's coding-focused Mercury",
    icon: <Brain className="w-4 h-4" />,
    badge: "Code",
    type: "openrouter"
  },
  {
    id: "openrouter:infermatic/mn-inferor-12b",
    name: "MN Inferor 12B",
    description: "Infermatic's MN Inferor 12B model",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:inflection/inflection-3-pi",
    name: "Inflection 3 Pi",
    description: "Inflection's personal assistant model Inflection 3 Pi",
    icon: <Brain className="w-4 h-4" />,
    badge: "Assistant",
    type: "openrouter"
  },
  {
    id: "openrouter:inflection/inflection-3-productivity",
    name: "Inflection 3 Productivity",
    description: "Inflection's productivity-focused model",
    icon: <Brain className="w-4 h-4" />,
    badge: "Productivity",
    type: "openrouter"
  },
  {
    id: "openrouter:liquid/lfm-3b",
    name: "LFM 3B",
    description: "Liquid's LFM 3B model",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:liquid/lfm-7b",
    name: "LFM 7B",
    description: "Liquid's LFM 7B model",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:mancer/weaver",
    name: "Weaver",
    description: "Mancer's Weaver model",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:meituan/longcat-flash-chat",
    name: "LongCat Flash Chat",
    description: "Meituan's fast LongCat Flash Chat",
    icon: <Brain className="w-4 h-4" />,
    badge: "Fast",
    type: "openrouter"
  },
  {
    id: "openrouter:meta-llama/llama-3-70b-instruct",
    name: "Llama 3 70B Instruct",
    description: "Meta's Llama 3 70B instruction-tuned",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:meta-llama/llama-3-8b-instruct",
    name: "Llama 3 8B Instruct",
    description: "Meta's Llama 3 8B instruction-tuned",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:meta-llama/llama-3.1-405b",
    name: "Llama 3.1 405B",
    description: "Meta's massive Llama 3.1 405B",
    icon: <Brain className="w-4 h-4" />,
    badge: "Large",
    type: "openrouter"
  },
  {
    id: "openrouter:meta-llama/llama-3.1-405b-instruct",
    name: "Llama 3.1 405B Instruct",
    description: "Meta's Llama 3.1 405B instruction-tuned",
    icon: <Brain className="w-4 h-4" />,
    badge: "Large",
    type: "openrouter"
  },
  {
    id: "openrouter:meta-llama/llama-3.1-405b-instruct:free",
    name: "Llama 3.1 405B Instruct (Free)",
    description: "Meta's Llama 3.1 405B instruct (free)",
    icon: <Brain className="w-4 h-4" />,
    badge: "Free",
    type: "openrouter"
  },
  {
    id: "openrouter:meta-llama/llama-3.1-70b-instruct",
    name: "Llama 3.1 70B Instruct",
    description: "Meta's Llama 3.1 70B instruction-tuned",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:meta-llama/llama-3.1-8b-instruct",
    name: "Llama 3.1 8B Instruct",
    description: "Meta's Llama 3.1 8B instruction-tuned",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:meta-llama/llama-3.2-11b-vision-instruct",
    name: "Llama 3.2 11B Vision Instruct",
    description: "Meta's vision-capable Llama 3.2 11B",
    icon: <Brain className="w-4 h-4" />,
    badge: "Vision",
    type: "openrouter"
  },
  {
    id: "openrouter:meta-llama/llama-3.2-1b-instruct",
    name: "Llama 3.2 1B Instruct",
    description: "Meta's tiny Llama 3.2 1B instruction-tuned",
    icon: <Brain className="w-4 h-4" />,
    badge: "Tiny",
    type: "openrouter"
  },
  {
    id: "openrouter:meta-llama/llama-3.2-3b-instruct",
    name: "Llama 3.2 3B Instruct",
    description: "Meta's small Llama 3.2 3B instruction-tuned",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:meta-llama/llama-3.2-3b-instruct:free",
    name: "Llama 3.2 3B Instruct (Free)",
    description: "Meta's Llama 3.2 3B instruct (free)",
    icon: <Brain className="w-4 h-4" />,
    badge: "Free",
    type: "openrouter"
  },
  {
    id: "openrouter:meta-llama/llama-3.2-90b-vision-instruct",
    name: "Llama 3.2 90B Vision Instruct",
    description: "Meta's powerful vision Llama 3.2 90B",
    icon: <Brain className="w-4 h-4" />,
    badge: "Vision",
    type: "openrouter"
  },
  {
    id: "openrouter:meta-llama/llama-3.3-70b-instruct",
    name: "Llama 3.3 70B Instruct",
    description: "Meta's Llama 3.3 70B instruction-tuned",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:meta-llama/llama-3.3-70b-instruct:free",
    name: "Llama 3.3 70B Instruct (Free)",
    description: "Meta's Llama 3.3 70B instruct (free)",
    icon: <Brain className="w-4 h-4" />,
    badge: "Free",
    type: "openrouter"
  },
  {
    id: "openrouter:meta-llama/llama-3.3-8b-instruct:free",
    name: "Llama 3.3 8B Instruct (Free)",
    description: "Meta's Llama 3.3 8B instruct (free)",
    icon: <Brain className="w-4 h-4" />,
    badge: "Free",
    type: "openrouter"
  },
  {
    id: "openrouter:meta-llama/llama-4-maverick",
    name: "Llama 4 Maverick",
    description: "Meta's experimental Llama 4 Maverick",
    icon: <Brain className="w-4 h-4" />,
    badge: "Exp",
    type: "openrouter"
  },
  {
    id: "openrouter:meta-llama/llama-4-maverick:free",
    name: "Llama 4 Maverick (Free)",
    description: "Meta's Llama 4 Maverick (free)",
    icon: <Brain className="w-4 h-4" />,
    badge: "Free",
    type: "openrouter"
  },
  {
    id: "openrouter:meta-llama/llama-4-scout",
    name: "Llama 4 Scout",
    description: "Meta's Llama 4 Scout model",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:meta-llama/llama-4-scout:free",
    name: "Llama 4 Scout (Free)",
    description: "Meta's Llama 4 Scout (free)",
    icon: <Brain className="w-4 h-4" />,
    badge: "Free",
    type: "openrouter"
  },
  {
    id: "openrouter:meta-llama/llama-guard-2-8b",
    name: "Llama Guard 2 8B",
    description: "Meta's safety model Llama Guard 2 8B",
    icon: <Brain className="w-4 h-4" />,
    badge: "Safety",
    type: "openrouter"
  },
  {
    id: "openrouter:meta-llama/llama-guard-3-8b",
    name: "Llama Guard 3 8B",
    description: "Meta's improved Llama Guard 3 8B",
    icon: <Brain className="w-4 h-4" />,
    badge: "Safety",
    type: "openrouter"
  },
  {
    id: "openrouter:meta-llama/llama-guard-4-12b",
    name: "Llama Guard 4 12B",
    description: "Meta's advanced Llama Guard 4 12B",
    icon: <Brain className="w-4 h-4" />,
    badge: "Safety",
    type: "openrouter"
  },
  {
    id: "openrouter:microsoft/mai-ds-r1",
    name: "MAI DS R1",
    description: "Microsoft's MAI DS R1 model",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:microsoft/mai-ds-r1:free",
    name: "MAI DS R1 (Free)",
    description: "Microsoft's MAI DS R1 (free)",
    icon: <Brain className="w-4 h-4" />,
    badge: "Free",
    type: "openrouter"
  },
  {
    id: "openrouter:microsoft/phi-3-medium-128k-instruct",
    name: "Phi-3 Medium 128K Instruct",
    description: "Microsoft's Phi-3 Medium with 128K context",
    icon: <Brain className="w-4 h-4" />,
    badge: "128K",
    type: "openrouter"
  },
  {
    id: "openrouter:microsoft/phi-3-mini-128k-instruct",
    name: "Phi-3 Mini 128K Instruct",
    description: "Microsoft's lightweight Phi-3 Mini 128K",
    icon: <Brain className="w-4 h-4" />,
    badge: "128K",
    type: "openrouter"
  },
  {
    id: "openrouter:microsoft/phi-3.5-mini-128k-instruct",
    name: "Phi-3.5 Mini 128K Instruct",
    description: "Microsoft's Phi-3.5 Mini with 128K context",
    icon: <Brain className="w-4 h-4" />,
    badge: "128K",
    type: "openrouter"
  },
  {
    id: "openrouter:microsoft/phi-4",
    name: "Phi-4",
    description: "Microsoft's Phi-4 model",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:microsoft/phi-4-multimodal-instruct",
    name: "Phi-4 Multimodal Instruct",
    description: "Microsoft's multimodal Phi-4",
    icon: <Brain className="w-4 h-4" />,
    badge: "Vision",
    type: "openrouter"
  },
  {
    id: "openrouter:microsoft/phi-4-reasoning-plus",
    name: "Phi-4 Reasoning Plus",
    description: "Microsoft's enhanced reasoning Phi-4",
    icon: <Brain className="w-4 h-4" />,
    badge: "Reasoning",
    type: "openrouter"
  },
  {
    id: "openrouter:microsoft/wizardlm-2-8x22b",
    name: "WizardLM 2 8x22B",
    description: "Microsoft's WizardLM 2 with 8x22B MoE",
    icon: <Brain className="w-4 h-4" />,
    badge: "MoE",
    type: "openrouter"
  },
  {
    id: "openrouter:minimax/minimax-01",
    name: "MiniMax 01",
    description: "MiniMax's 01 model",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:minimax/minimax-m1",
    name: "MiniMax M1",
    description: "MiniMax's M1 model",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:mistralai/codestral-2501",
    name: "Codestral 2501",
    description: "Mistral's coding model Codestral 2501",
    icon: <Brain className="w-4 h-4" />,
    badge: "Code",
    type: "openrouter"
  },
  {
    id: "openrouter:mistralai/codestral-2508",
    name: "Codestral 2508",
    description: "Mistral's Codestral snapshot 2508",
    icon: <Brain className="w-4 h-4" />,
    badge: "Code",
    type: "openrouter"
  },
  {
    id: "openrouter:mistralai/devstral-medium",
    name: "Devstral Medium",
    description: "Mistral's developer-focused medium model",
    icon: <Brain className="w-4 h-4" />,
    badge: "Dev",
    type: "openrouter"
  },
  {
    id: "openrouter:mistralai/devstral-small",
    name: "Devstral Small",
    description: "Mistral's lightweight Devstral",
    icon: <Brain className="w-4 h-4" />,
    badge: "Dev",
    type: "openrouter"
  },
  {
    id: "openrouter:mistralai/devstral-small-2505",
    name: "Devstral Small 2505",
    description: "Mistral's Devstral Small snapshot 2505",
    icon: <Brain className="w-4 h-4" />,
    badge: "Dev",
    type: "openrouter"
  },
  {
    id: "openrouter:mistralai/devstral-small-2505:free",
    name: "Devstral Small 2505 (Free)",
    description: "Mistral's Devstral Small 2505 (free)",
    icon: <Brain className="w-4 h-4" />,
    badge: "Free",
    type: "openrouter"
  },
  {
    id: "openrouter:mistralai/magistral-medium-2506",
    name: "Magistral Medium 2506",
    description: "Mistral's Magistral Medium snapshot 2506",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:mistralai/magistral-medium-2506:thinking",
    name: "Magistral Medium 2506 (Thinking)",
    description: "Mistral's Magistral Medium with thinking mode",
    icon: <Brain className="w-4 h-4" />,
    badge: "Thinking",
    type: "openrouter"
  },
  {
    id: "openrouter:mistralai/magistral-small-2506",
    name: "Magistral Small 2506",
    description: "Mistral's lightweight Magistral Small 2506",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:mistralai/ministral-3b",
    name: "Ministral 3B",
    description: "Mistral's tiny Ministral 3B",
    icon: <Brain className="w-4 h-4" />,
    badge: "Tiny",
    type: "openrouter"
  },
  {
    id: "openrouter:mistralai/ministral-8b",
    name: "Ministral 8B",
    description: "Mistral's small Ministral 8B",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:mistralai/mistral-7b-instruct",
    name: "Mistral 7B Instruct",
    description: "Mistral's classic 7B instruction model",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:mistralai/mistral-7b-instruct-v0.1",
    name: "Mistral 7B Instruct v0.1",
    description: "Mistral's 7B Instruct version 0.1",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:mistralai/mistral-7b-instruct-v0.3",
    name: "Mistral 7B Instruct v0.3",
    description: "Mistral's 7B Instruct version 0.3",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:mistralai/mistral-7b-instruct:free",
    name: "Mistral 7B Instruct (Free)",
    description: "Mistral's 7B Instruct (free tier)",
    icon: <Brain className="w-4 h-4" />,
    badge: "Free",
    type: "openrouter"
  },
  {
    id: "openrouter:mistralai/mistral-large",
    name: "Mistral Large",
    description: "Mistral's flagship Large model",
    icon: <Brain className="w-4 h-4" />,
    badge: "Flagship",
    type: "openrouter"
  },
  {
    id: "openrouter:mistralai/mistral-large-2407",
    name: "Mistral Large (2407)",
    description: "Mistral Large snapshot from 2407",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:mistralai/mistral-large-2411",
    name: "Mistral Large (2411)",
    description: "Mistral Large snapshot from 2411",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:mistralai/mistral-medium-3",
    name: "Mistral Medium 3",
    description: "Mistral's Medium 3 model",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:mistralai/mistral-medium-3.1",
    name: "Mistral Medium 3.1",
    description: "Mistral's updated Medium 3.1",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:mistralai/mistral-nemo",
    name: "Mistral Nemo",
    description: "Mistral's efficient Nemo model",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:mistralai/mistral-nemo:free",
    name: "Mistral Nemo (Free)",
    description: "Mistral Nemo (free tier)",
    icon: <Brain className="w-4 h-4" />,
    badge: "Free",
    type: "openrouter"
  },
  {
    id: "openrouter:mistralai/mistral-saba",
    name: "Mistral Saba",
    description: "Mistral's Saba variant",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:mistralai/mistral-small",
    name: "Mistral Small",
    description: "Mistral's compact Small model",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:mistralai/mistral-small-24b-instruct-2501",
    name: "Mistral Small 24B Instruct 2501",
    description: "Mistral's 24B Small instruct model 2501",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:mistralai/mistral-small-24b-instruct-2501:free",
    name: "Mistral Small 24B Instruct 2501 (Free)",
    description: "Mistral 24B Small 2501 (free)",
    icon: <Brain className="w-4 h-4" />,
    badge: "Free",
    type: "openrouter"
  },
  {
    id: "openrouter:mistralai/mistral-small-3.1-24b-instruct",
    name: "Mistral Small 3.1 24B Instruct",
    description: "Mistral's Small 3.1 24B instruction model",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:mistralai/mistral-small-3.1-24b-instruct:free",
    name: "Mistral Small 3.1 24B Instruct (Free)",
    description: "Mistral Small 3.1 24B (free)",
    icon: <Brain className="w-4 h-4" />,
    badge: "Free",
    type: "openrouter"
  },
  {
    id: "openrouter:mistralai/mistral-small-3.2-24b-instruct",
    name: "Mistral Small 3.2 24B Instruct",
    description: "Mistral's updated Small 3.2 24B",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:mistralai/mistral-small-3.2-24b-instruct:free",
    name: "Mistral Small 3.2 24B Instruct (Free)",
    description: "Mistral Small 3.2 24B (free)",
    icon: <Brain className="w-4 h-4" />,
    badge: "Free",
    type: "openrouter"
  },
  {
    id: "openrouter:mistralai/mistral-tiny",
    name: "Mistral Tiny",
    description: "Mistral's ultra-small Tiny model",
    icon: <Brain className="w-4 h-4" />,
    badge: "Tiny",
    type: "openrouter"
  },
  {
    id: "openrouter:mistralai/mixtral-8x22b-instruct",
    name: "Mixtral 8x22B Instruct",
    description: "Mistral's MoE Mixtral 8x22B instruction model",
    icon: <Brain className="w-4 h-4" />,
    badge: "MoE",
    type: "openrouter"
  },
  {
    id: "openrouter:mistralai/mixtral-8x7b-instruct",
    name: "Mixtral 8x7B Instruct",
    description: "Mistral's efficient Mixtral 8x7B",
    icon: <Brain className="w-4 h-4" />,
    badge: "MoE",
    type: "openrouter"
  },
  {
    id: "openrouter:mistralai/pixtral-12b",
    name: "Pixtral 12B",
    description: "Mistral's vision-language Pixtral 12B",
    icon: <Brain className="w-4 h-4" />,
    badge: "Vision",
    type: "openrouter"
  },
  {
    id: "openrouter:mistralai/pixtral-large-2411",
    name: "Pixtral Large (2411)",
    description: "Mistral's large Pixtral snapshot 2411",
    icon: <Brain className="w-4 h-4" />,
    badge: "Vision",
    type: "openrouter"
  },
  {
    id: "openrouter:moonshotai/kimi-dev-72b:free",
    name: "Kimi Dev 72B (Free)",
    description: "Moonshot's developer Kimi 72B (free)",
    icon: <Brain className="w-4 h-4" />,
    badge: "Free",
    type: "openrouter"
  },
  {
    id: "openrouter:moonshotai/kimi-k2",
    name: "Kimi K2",
    description: "Moonshot's Kimi K2 model",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:moonshotai/kimi-k2-0905",
    name: "Kimi K2 (0905)",
    description: "Moonshot's Kimi K2 snapshot 0905",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:moonshotai/kimi-k2:free",
    name: "Kimi K2 (Free)",
    description: "Moonshot's Kimi K2 (free)",
    icon: <Brain className="w-4 h-4" />,
    badge: "Free",
    type: "openrouter"
  },
  {
    id: "openrouter:moonshotai/kimi-vl-a3b-thinking",
    name: "Kimi VL A3B Thinking",
    description: "Moonshot's vision-language Kimi with thinking",
    icon: <Brain className="w-4 h-4" />,
    badge: "Vision",
    type: "openrouter"
  },
  {
    id: "openrouter:moonshotai/kimi-vl-a3b-thinking:free",
    name: "Kimi VL A3B Thinking (Free)",
    description: "Moonshot's Kimi VL thinking (free)",
    icon: <Brain className="w-4 h-4" />,
    badge: "Free",
    type: "openrouter"
  },
  {
    id: "openrouter:morph/morph-v3-fast",
    name: "Morph v3 Fast",
    description: "Morph's fast v3 model",
    icon: <Brain className="w-4 h-4" />,
    badge: "Fast",
    type: "openrouter"
  },
  {
    id: "openrouter:morph/morph-v3-large",
    name: "Morph v3 Large",
    description: "Morph's large v3 model",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:neversleep/llama-3-lumimaid-70b",
    name: "Llama 3 Lumimaid 70B",
    description: "Neversleep's uncensored Llama 3 Lumimaid 70B",
    icon: <Brain className="w-4 h-4" />,
    badge: "Uncensored",
    type: "openrouter"
  },
  {
    id: "openrouter:neversleep/llama-3.1-lumimaid-8b",
    name: "Llama 3.1 Lumimaid 8B",
    description: "Neversleep's Llama 3.1 Lumimaid 8B",
    icon: <Brain className="w-4 h-4" />,
    badge: "Uncensored",
    type: "openrouter"
  },
  {
    id: "openrouter:neversleep/noromaid-20b",
    name: "Noromaid 20B",
    description: "Neversleep's Noromaid 20B model",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:nousresearch/deephermes-3-llama-3-8b-preview:free",
    name: "DeepHermes 3 Llama 3 8B Preview (Free)",
    description: "NousResearch's DeepHermes 3 preview (free)",
    icon: <Brain className="w-4 h-4" />,
    badge: "Free",
    type: "openrouter"
  },
  {
    id: "openrouter:nousresearch/deephermes-3-mistral-24b-preview",
    name: "DeepHermes 3 Mistral 24B Preview",
    description: "NousResearch's DeepHermes 3 Mistral preview",
    icon: <Brain className="w-4 h-4" />,
    badge: "Preview",
    type: "openrouter"
  },
  {
    id: "openrouter:nousresearch/hermes-2-pro-llama-3-8b",
    name: "Hermes 2 Pro Llama 3 8B",
    description: "NousResearch's Hermes 2 Pro on Llama 3 8B",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:nousresearch/hermes-3-llama-3.1-405b",
    name: "Hermes 3 Llama 3.1 405B",
    description: "NousResearch's massive Hermes 3 405B",
    icon: <Brain className="w-4 h-4" />,
    badge: "Large",
    type: "openrouter"
  },
  {
    id: "openrouter:nousresearch/hermes-3-llama-3.1-70b",
    name: "Hermes 3 Llama 3.1 70B",
    description: "NousResearch's Hermes 3 on Llama 3.1 70B",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:nousresearch/hermes-4-405b",
    name: "Hermes 4 405B",
    description: "NousResearch's flagship Hermes 4 405B",
    icon: <Brain className="w-4 h-4" />,
    badge: "Flagship",
    type: "openrouter"
  },
  {
    id: "openrouter:nousresearch/hermes-4-70b",
    name: "Hermes 4 70B",
    description: "NousResearch's Hermes 4 70B model",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:nvidia/llama-3.1-nemotron-70b-instruct",
    name: "Llama 3.1 Nemotron 70B Instruct",
    description: "NVIDIA's high-performance Llama 3.1 Nemotron 70B instruction model",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:nvidia/llama-3.1-nemotron-ultra-253b-v1",
    name: "Llama 3.1 Nemotron Ultra 253B v1",
    description: "NVIDIA's massive Nemotron Ultra 253B model based on Llama 3.1",
    icon: <Brain className="w-4 h-4" />,
    badge: "Ultra",
    type: "openrouter"
  },
  {
    id: "openrouter:nvidia/llama-3.1-nemotron-ultra-253b-v1:free",
    name: "Llama 3.1 Nemotron Ultra 253B v1 (Free)",
    description: "NVIDIA's Nemotron Ultra 253B v1 (free tier)",
    icon: <Brain className="w-4 h-4" />,
    badge: "Free",
    type: "openrouter"
  },
  {
    id: "openrouter:nvidia/llama-3.3-nemotron-super-49b-v1",
    name: "Llama 3.3 Nemotron Super 49B v1",
    description: "NVIDIA's optimized Nemotron Super 49B on Llama 3.3",
    icon: <Brain className="w-4 h-4" />,
    badge: "Super",
    type: "openrouter"
  },
  {
    id: "openrouter:nvidia/nemotron-nano-9b-v2",
    name: "Nemotron Nano 9B v2",
    description: "NVIDIA's compact Nemotron Nano 9B v2 model",
    icon: <Brain className="w-4 h-4" />,
    badge: "Nano",
    type: "openrouter"
  },
  {
    id: "openrouter:nvidia/nemotron-nano-9b-v2:free",
    name: "Nemotron Nano 9B v2 (Free)",
    description: "NVIDIA's Nemotron Nano 9B v2 (free)",
    icon: <Brain className="w-4 h-4" />,
    badge: "Free",
    type: "openrouter"
  },
  {
    id: "openrouter:openai/chatgpt-4o-latest",
    name: "ChatGPT-4o Latest",
    description: "OpenAI's latest ChatGPT-4o model",
    icon: <Brain className="w-4 h-4" />,
    badge: "Latest",
    type: "openrouter"
  },
  {
    id: "openrouter:openai/codex-mini",
    name: "Codex Mini",
    description: "OpenAI's lightweight Codex Mini for code generation",
    icon: <Brain className="w-4 h-4" />,
    badge: "Code",
    type: "openrouter"
  },
  {
    id: "openrouter:openai/gpt-3.5-turbo",
    name: "GPT-3.5 Turbo",
    description: "OpenAI's fast and efficient GPT-3.5 Turbo",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:openai/gpt-3.5-turbo-0613",
    name: "GPT-3.5 Turbo (0613)",
    description: "OpenAI's GPT-3.5 Turbo snapshot from June 2023",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:openai/gpt-3.5-turbo-16k",
    name: "GPT-3.5 Turbo 16K",
    description: "OpenAI's GPT-3.5 Turbo with 16K context",
    icon: <Brain className="w-4 h-4" />,
    badge: "16K",
    type: "openrouter"
  },
  {
    id: "openrouter:openai/gpt-3.5-turbo-instruct",
    name: "GPT-3.5 Turbo Instruct",
    description: "OpenAI's instruction-tuned GPT-3.5 Turbo",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:openai/gpt-4",
    name: "GPT-4",
    description: "OpenAI's powerful GPT-4 model",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:openai/gpt-4-0314",
    name: "GPT-4 (0314)",
    description: "OpenAI's GPT-4 snapshot from March 2023",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:openai/gpt-4-1106-preview",
    name: "GPT-4 (1106 Preview)",
    description: "OpenAI's GPT-4 preview from November 2023",
    icon: <Brain className="w-4 h-4" />,
    badge: "Preview",
    type: "openrouter"
  },
  {
    id: "openrouter:openai/gpt-4-turbo",
    name: "GPT-4 Turbo",
    description: "OpenAI's optimized GPT-4 Turbo",
    icon: <Brain className="w-4 h-4" />,
    badge: "Turbo",
    type: "openrouter"
  },
  {
    id: "openrouter:openai/gpt-4-turbo-preview",
    name: "GPT-4 Turbo Preview",
    description: "OpenAI's GPT-4 Turbo preview version",
    icon: <Brain className="w-4 h-4" />,
    badge: "Preview",
    type: "openrouter"
  },
  {
    id: "openrouter:openai/gpt-4.1",
    name: "GPT-4.1",
    description: "OpenAI's enhanced GPT-4.1 model",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:openai/gpt-4.1-mini",
    name: "GPT-4.1 Mini",
    description: "OpenAI's compact GPT-4.1 Mini",
    icon: <Brain className="w-4 h-4" />,
    badge: "Mini",
    type: "openrouter"
  },
  {
    id: "openrouter:openai/gpt-4.1-nano",
    name: "GPT-4.1 Nano",
    description: "OpenAI's ultra-small GPT-4.1 Nano",
    icon: <Brain className="w-4 h-4" />,
    badge: "Nano",
    type: "openrouter"
  },
  {
    id: "openrouter:openai/gpt-4o",
    name: "GPT-4o",
    description: "OpenAI's multimodal GPT-4o model",
    icon: <Brain className="w-4 h-4" />,
    badge: "Multimodal",
    type: "openrouter"
  },
  {
    id: "openrouter:openai/gpt-4o-2024-05-13",
    name: "GPT-4o (2024-05-13)",
    description: "OpenAI's GPT-4o snapshot from May 2024",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:openai/gpt-4o-2024-08-06",
    name: "GPT-4o (2024-08-06)",
    description: "OpenAI's GPT-4o snapshot from August 2024",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:openai/gpt-4o-2024-11-20",
    name: "GPT-4o (2024-11-20)",
    description: "OpenAI's GPT-4o snapshot from November 2024",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:openai/gpt-4o-audio-preview",
    name: "GPT-4o Audio Preview",
    description: "OpenAI's GPT-4o with audio capabilities (preview)",
    icon: <Brain className="w-4 h-4" />,
    badge: "Audio",
    type: "openrouter"
  },
  {
    id: "openrouter:openai/gpt-4o-mini",
    name: "GPT-4o Mini",
    description: "OpenAI's lightweight GPT-4o Mini",
    icon: <Brain className="w-4 h-4" />,
    badge: "Mini",
    type: "openrouter"
  },
  {
    id: "openrouter:openai/gpt-4o-mini-2024-07-18",
    name: "GPT-4o Mini (2024-07-18)",
    description: "OpenAI's GPT-4o Mini snapshot from July 2024",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:openai/gpt-4o-mini-search-preview",
    name: "GPT-4o Mini Search Preview",
    description: "OpenAI's GPT-4o Mini with search (preview)",
    icon: <Brain className="w-4 h-4" />,
    badge: "Search",
    type: "openrouter"
  },
  {
    id: "openrouter:openai/gpt-4o-search-preview",
    name: "GPT-4o Search Preview",
    description: "OpenAI's GPT-4o with search capabilities (preview)",
    icon: <Brain className="w-4 h-4" />,
    badge: "Search",
    type: "openrouter"
  },
  {
    id: "openrouter:openai/gpt-4o:extended",
    name: "GPT-4o Extended",
    description: "OpenAI's GPT-4o with extended capabilities",
    icon: <Brain className="w-4 h-4" />,
    badge: "Extended",
    type: "openrouter"
  },
  {
    id: "openrouter:openai/gpt-5",
    name: "GPT-5",
    description: "OpenAI's next-generation GPT-5 model",
    icon: <Brain className="w-4 h-4" />,
    badge: "Next-Gen",
    type: "openrouter"
  },
  {
    id: "openrouter:openai/gpt-5-chat",
    name: "GPT-5 Chat",
    description: "OpenAI's conversational GPT-5",
    icon: <Brain className="w-4 h-4" />,
    badge: "Chat",
    type: "openrouter"
  },
  {
    id: "openrouter:openai/gpt-5-codex",
    name: "GPT-5 Codex",
    description: "OpenAI's GPT-5 for advanced code generation",
    icon: <Brain className="w-4 h-4" />,
    badge: "Code",
    type: "openrouter"
  },
  {
    id: "openrouter:openai/gpt-5-mini",
    name: "GPT-5 Mini",
    description: "OpenAI's compact GPT-5 Mini",
    icon: <Brain className="w-4 h-4" />,
    badge: "Mini",
    type: "openrouter"
  },
  {
    id: "openrouter:openai/gpt-5-nano",
    name: "GPT-5 Nano",
    description: "OpenAI's ultra-small GPT-5 Nano",
    icon: <Brain className="w-4 h-4" />,
    badge: "Nano",
    type: "openrouter"
  },
  {
    id: "openrouter:openai/gpt-oss-120b",
    name: "GPT-OSS 120B",
    description: "OpenAI's open-source 120B parameter model",
    icon: <Brain className="w-4 h-4" />,
    badge: "OSS",
    type: "openrouter"
  },
  {
    id: "openrouter:openai/gpt-oss-120b:free",
    name: "GPT-OSS 120B (Free)",
    description: "OpenAI's 120B OSS model (free)",
    icon: <Brain className="w-4 h-4" />,
    badge: "Free",
    type: "openrouter"
  },
  {
    id: "openrouter:openai/gpt-oss-20b",
    name: "GPT-OSS 20B",
    description: "OpenAI's open-source 20B model",
    icon: <Brain className="w-4 h-4" />,
    badge: "OSS",
    type: "openrouter"
  },
  {
    id: "openrouter:openai/gpt-oss-20b:free",
    name: "GPT-OSS 20B (Free)",
    description: "OpenAI's 20B OSS model (free)",
    icon: <Brain className="w-4 h-4" />,
    badge: "Free",
    type: "openrouter"
  },
  {
    id: "openrouter:openai/o1",
    name: "o1",
    description: "OpenAI's reasoning model o1",
    icon: <Brain className="w-4 h-4" />,
    badge: "Reasoning",
    type: "openrouter"
  },
  {
    id: "openrouter:openai/o1-mini",
    name: "o1 Mini",
    description: "OpenAI's lightweight reasoning o1 Mini",
    icon: <Brain className="w-4 h-4" />,
    badge: "Mini",
    type: "openrouter"
  },
  {
    id: "openrouter:openai/o1-mini-2024-09-12",
    name: "o1 Mini (2024-09-12)",
    description: "OpenAI's o1 Mini snapshot from September 2024",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:openai/o1-pro",
    name: "o1 Pro",
    description: "OpenAI's professional-grade o1 Pro",
    icon: <Brain className="w-4 h-4" />,
    badge: "Pro",
    type: "openrouter"
  },
  {
    id: "openrouter:openai/o3",
    name: "o3",
    description: "OpenAI's advanced reasoning model o3",
    icon: <Brain className="w-4 h-4" />,
    badge: "Advanced",
    type: "openrouter"
  },
  {
    id: "openrouter:openai/o3-mini",
    name: "o3 Mini",
    description: "OpenAI's compact o3 Mini",
    icon: <Brain className="w-4 h-4" />,
    badge: "Mini",
    type: "openrouter"
  },
  {
    id: "openrouter:openai/o3-mini-high",
    name: "o3 Mini High",
    description: "OpenAI's high-performance o3 Mini",
    icon: <Brain className="w-4 h-4" />,
    badge: "High",
    type: "openrouter"
  },
  {
    id: "openrouter:openai/o3-pro",
    name: "o3 Pro",
    description: "OpenAI's flagship o3 Pro model",
    icon: <Brain className="w-4 h-4" />,
    badge: "Pro",
    type: "openrouter"
  },
  {
    id: "openrouter:openai/o4-mini",
    name: "o4 Mini",
    description: "OpenAI's next-gen lightweight o4 Mini",
    icon: <Brain className="w-4 h-4" />,
    badge: "Mini",
    type: "openrouter"
  },
  {
    id: "openrouter:openai/o4-mini-high",
    name: "o4 Mini High",
    description: "OpenAI's high-performance o4 Mini",
    icon: <Brain className="w-4 h-4" />,
    badge: "High",
    type: "openrouter"
  },
  {
    id: "openrouter:opengvlab/internvl3-14b",
    name: "InternVL3 14B",
    description: "OpenGVLab's vision-language InternVL3 14B",
    icon: <Brain className="w-4 h-4" />,
    badge: "Vision",
    type: "openrouter"
  },
  {
    id: "openrouter:openrouter/auto",
    name: "Auto",
    description: "OpenRouter's automatic model selection",
    icon: <Brain className="w-4 h-4" />,
    badge: "Auto",
    type: "openrouter"
  },
  {
    id: "openrouter:openrouter/sonoma-dusk-alpha",
    name: "Sonoma Dusk Alpha",
    description: "OpenRouter's experimental Sonoma Dusk Alpha",
    icon: <Brain className="w-4 h-4" />,
    badge: "Alpha",
    type: "openrouter"
  },
  {
    id: "openrouter:openrouter/sonoma-sky-alpha",
    name: "Sonoma Sky Alpha",
    description: "OpenRouter's experimental Sonoma Sky Alpha",
    icon: <Brain className="w-4 h-4" />,
    badge: "Alpha",
    type: "openrouter"
  },
  {
    id: "openrouter:perplexity/r1-1776",
    name: "R1-1776",
    description: "Perplexity's R1 model from 1776",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:perplexity/sonar",
    name: "Sonar",
    description: "Perplexity's Sonar search model",
    icon: <Brain className="w-4 h-4" />,
    badge: "Search",
    type: "openrouter"
  },
  {
    id: "openrouter:perplexity/sonar-deep-research",
    name: "Sonar Deep Research",
    description: "Perplexity's in-depth research Sonar",
    icon: <Brain className="w-4 h-4" />,
    badge: "Research",
    type: "openrouter"
  },
  {
    id: "openrouter:perplexity/sonar-pro",
    name: "Sonar Pro",
    description: "Perplexity's professional Sonar Pro",
    icon: <Brain className="w-4 h-4" />,
    badge: "Pro",
    type: "openrouter"
  },
  {
    id: "openrouter:perplexity/sonar-reasoning",
    name: "Sonar Reasoning",
    description: "Perplexity's reasoning-enhanced Sonar",
    icon: <Brain className="w-4 h-4" />,
    badge: "Reasoning",
    type: "openrouter"
  },
  {
    id: "openrouter:perplexity/sonar-reasoning-pro",
    name: "Sonar Reasoning Pro",
    description: "Perplexity's advanced reasoning Sonar Pro",
    icon: <Brain className="w-4 h-4" />,
    badge: "Pro",
    type: "openrouter"
  },
  {
    id: "openrouter:pygmalionai/mythalion-13b",
    name: "Mythalion 13B",
    description: "PygmalionAI's Mythalion 13B roleplay model",
    icon: <Brain className="w-4 h-4" />,
    badge: "RP",
    type: "openrouter"
  },
  {
    id: "openrouter:qwen/qwen-2.5-72b-instruct",
    name: "Qwen 2.5 72B Instruct",
    description: "Alibaba's Qwen 2.5 72B instruction model",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:qwen/qwen-2.5-72b-instruct:free",
    name: "Qwen 2.5 72B Instruct (Free)",
    description: "Alibaba's Qwen 2.5 72B (free)",
    icon: <Brain className="w-4 h-4" />,
    badge: "Free",
    type: "openrouter"
  },
  {
    id: "openrouter:qwen/qwen-2.5-7b-instruct",
    name: "Qwen 2.5 7B Instruct",
    description: "Alibaba's lightweight Qwen 2.5 7B",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:qwen/qwen-2.5-coder-32b-instruct",
    name: "Qwen 2.5 Coder 32B Instruct",
    description: "Alibaba's coding-specialized Qwen 2.5 32B",
    icon: <Brain className="w-4 h-4" />,
    badge: "Code",
    type: "openrouter"
  },
  {
    id: "openrouter:qwen/qwen-2.5-coder-32b-instruct:free",
    name: "Qwen 2.5 Coder 32B (Free)",
    description: "Alibaba's Qwen 2.5 Coder 32B (free)",
    icon: <Brain className="w-4 h-4" />,
    badge: "Free",
    type: "openrouter"
  },
  {
    id: "openrouter:qwen/qwen-2.5-vl-7b-instruct",
    name: "Qwen 2.5 VL 7B Instruct",
    description: "Alibaba's vision-language Qwen 2.5 7B",
    icon: <Brain className="w-4 h-4" />,
    badge: "Vision",
    type: "openrouter"
  },
  {
    id: "openrouter:qwen/qwen-max",
    name: "Qwen Max",
    description: "Alibaba's flagship Qwen Max model",
    icon: <Brain className="w-4 h-4" />,
    badge: "Max",
    type: "openrouter"
  },
  {
    id: "openrouter:qwen/qwen-plus",
    name: "Qwen Plus",
    description: "Alibaba's enhanced Qwen Plus",
    icon: <Brain className="w-4 h-4" />,
    badge: "Plus",
    type: "openrouter"
  },
  {
    id: "openrouter:qwen/qwen-plus-2025-07-28",
    name: "Qwen Plus (2025-07-28)",
    description: "Alibaba's Qwen Plus snapshot from July 2025",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:qwen/qwen-plus-2025-07-28:thinking",
    name: "Qwen Plus (2025-07-28) Thinking",
    description: "Alibaba's Qwen Plus with thinking mode",
    icon: <Brain className="w-4 h-4" />,
    badge: "Thinking",
    type: "openrouter"
  },
  {
    id: "openrouter:qwen/qwen-turbo",
    name: "Qwen Turbo",
    description: "Alibaba's fast Qwen Turbo",
    icon: <Brain className="w-4 h-4" />,
    badge: "Turbo",
    type: "openrouter"
  },
  {
    id: "openrouter:qwen/qwen-vl-max",
    name: "Qwen VL Max",
    description: "Alibaba's vision-language Qwen VL Max",
    icon: <Brain className="w-4 h-4" />,
    badge: "Vision",
    type: "openrouter"
  },
  {
    id: "openrouter:qwen/qwen-vl-plus",
    name: "Qwen VL Plus",
    description: "Alibaba's enhanced vision-language Qwen VL Plus",
    icon: <Brain className="w-4 h-4" />,
    badge: "Vision",
    type: "openrouter"
  },
  {
    id: "openrouter:qwen/qwen2.5-vl-32b-instruct",
    name: "Qwen2.5 VL 32B Instruct",
    description: "Alibaba's Qwen2.5 vision-language 32B",
    icon: <Brain className="w-4 h-4" />,
    badge: "Vision",
    type: "openrouter"
  },
  {
    id: "openrouter:qwen/qwen2.5-vl-32b-instruct:free",
    name: "Qwen2.5 VL 32B (Free)",
    description: "Alibaba's Qwen2.5 VL 32B (free)",
    icon: <Brain className="w-4 h-4" />,
    badge: "Free",
    type: "openrouter"
  },
  {
    id: "openrouter:qwen/qwen2.5-vl-72b-instruct",
    name: "Qwen2.5 VL 72B Instruct",
    description: "Alibaba's large Qwen2.5 VL 72B",
    icon: <Brain className="w-4 h-4" />,
    badge: "Vision",
    type: "openrouter"
  },
  {
    id: "openrouter:qwen/qwen2.5-vl-72b-instruct:free",
    name: "Qwen2.5 VL 72B (Free)",
    description: "Alibaba's Qwen2.5 VL 72B (free)",
    icon: <Brain className="w-4 h-4" />,
    badge: "Free",
    type: "openrouter"
  },
  {
    id: "openrouter:qwen/qwen3-14b",
    name: "Qwen3 14B",
    description: "Alibaba's next-gen Qwen3 14B",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:qwen/qwen3-14b:free",
    name: "Qwen3 14B (Free)",
    description: "Alibaba's Qwen3 14B (free)",
    icon: <Brain className="w-4 h-4" />,
    badge: "Free",
    type: "openrouter"
  },
  {
    id: "openrouter:qwen/qwen3-235b-a22b",
    name: "Qwen3 235B A22B",
    description: "Alibaba's massive Qwen3 235B MoE",
    icon: <Brain className="w-4 h-4" />,
    badge: "MoE",
    type: "openrouter"
  },
  {
    id: "openrouter:qwen/qwen3-235b-a22b-2507",
    name: "Qwen3 235B A22B (2507)",
    description: "Alibaba's Qwen3 235B snapshot 2507",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:qwen/qwen3-235b-a22b-thinking-2507",
    name: "Qwen3 235B A22B Thinking (2507)",
    description: "Alibaba's Qwen3 235B with thinking mode",
    icon: <Brain className="w-4 h-4" />,
    badge: "Thinking",
    type: "openrouter"
  },
  {
    id: "openrouter:qwen/qwen3-235b-a22b:free",
    name: "Qwen3 235B A22B (Free)",
    description: "Alibaba's Qwen3 235B (free)",
    icon: <Brain className="w-4 h-4" />,
    badge: "Free",
    type: "openrouter"
  },
  {
    id: "openrouter:qwen/qwen3-30b-a3b",
    name: "Qwen3 30B A3B",
    description: "Alibaba's Qwen3 30B MoE model",
    icon: <Brain className="w-4 h-4" />,
    badge: "MoE",
    type: "openrouter"
  },
  {
    id: "openrouter:qwen/qwen3-30b-a3b-instruct-2507",
    name: "Qwen3 30B A3B Instruct (2507)",
    description: "Alibaba's Qwen3 30B instruction model",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:qwen/qwen3-30b-a3b-thinking-2507",
    name: "Qwen3 30B A3B Thinking (2507)",
    description: "Alibaba's Qwen3 30B with thinking",
    icon: <Brain className="w-4 h-4" />,
    badge: "Thinking",
    type: "openrouter"
  },
  {
    id: "openrouter:qwen/qwen3-30b-a3b:free",
    name: "Qwen3 30B A3B (Free)",
    description: "Alibaba's Qwen3 30B (free)",
    icon: <Brain className="w-4 h-4" />,
    badge: "Free",
    type: "openrouter"
  },
  {
    id: "openrouter:qwen/qwen3-32b",
    name: "Qwen3 32B",
    description: "Alibaba's Qwen3 32B model",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:qwen/qwen3-4b:free",
    name: "Qwen3 4B (Free)",
    description: "Alibaba's small Qwen3 4B (free)",
    icon: <Brain className="w-4 h-4" />,
    badge: "Free",
    type: "openrouter"
  },
  {
    id: "openrouter:qwen/qwen3-8b",
    name: "Qwen3 8B",
    description: "Alibaba's Qwen3 8B model",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:qwen/qwen3-8b:free",
    name: "Qwen3 8B (Free)",
    description: "Alibaba's Qwen3 8B (free)",
    icon: <Brain className="w-4 h-4" />,
    badge: "Free",
    type: "openrouter"
  },
  {
    id: "openrouter:qwen/qwen3-coder",
    name: "Qwen3 Coder",
    description: "Alibaba's coding-focused Qwen3 Coder",
    icon: <Brain className="w-4 h-4" />,
    badge: "Code",
    type: "openrouter"
  },
  {
    id: "openrouter:qwen/qwen3-coder-flash",
    name: "Qwen3 Coder Flash",
    description: "Alibaba's fast Qwen3 Coder Flash",
    icon: <Brain className="w-4 h-4" />,
    badge: "Fast",
    type: "openrouter"
  },
  {
    id: "openrouter:qwen/qwen3-coder-plus",
    name: "Qwen3 Coder Plus",
    description: "Alibaba's enhanced Qwen3 Coder Plus",
    icon: <Brain className="w-4 h-4" />,
    badge: "Plus",
    type: "openrouter"
  },
  {
    id: "openrouter:qwen/qwen3-coder-30b-a3b-instruct",
    name: "Qwen3 Coder 30B A3B Instruct",
    description: "Alibaba's large Qwen3 Coder 30B",
    icon: <Brain className="w-4 h-4" />,
    badge: "Code",
    type: "openrouter"
  },
  {
    id: "openrouter:qwen/qwen3-coder:free",
    name: "Qwen3 Coder (Free)",
    description: "Alibaba's Qwen3 Coder (free)",
    icon: <Brain className="w-4 h-4" />,
    badge: "Free",
    type: "openrouter"
  },
  {
    id: "openrouter:qwen/qwen3-max",
    name: "Qwen3 Max",
    description: "Alibaba's flagship Qwen3 Max",
    icon: <Brain className="w-4 h-4" />,
    badge: "Max",
    type: "openrouter"
  },
  {
    id: "openrouter:qwen/qwen3-next-80b-a3b-instruct",
    name: "Qwen3 Next 80B A3B Instruct",
    description: "Alibaba's next-gen Qwen3 80B MoE",
    icon: <Brain className="w-4 h-4" />,
    badge: "Next",
    type: "openrouter"
  },
  {
    id: "openrouter:qwen/qwen3-next-80b-a3b-thinking",
    name: "Qwen3 Next 80B A3B Thinking",
    description: "Alibaba's Qwen3 Next with thinking mode",
    icon: <Brain className="w-4 h-4" />,
    badge: "Thinking",
    type: "openrouter"
  },
  {
    id: "openrouter:qwen/qwq-32b",
    name: "QWQ 32B",
    description: "Alibaba's experimental QWQ 32B model",
    icon: <Brain className="w-4 h-4" />,
    badge: "Exp",
    type: "openrouter"
  },
  {
    id: "openrouter:qwen/qwq-32b-preview",
    name: "QWQ 32B Preview",
    description: "Alibaba's QWQ 32B preview model",
    icon: <Brain className="w-4 h-4" />,
    badge: "Preview",
    type: "openrouter"
  },
  {
    id: "openrouter:qwen/qwq-32b:free",
    name: "QWQ 32B (Free)",
    description: "Alibaba's QWQ 32B (free)",
    icon: <Brain className="w-4 h-4" />,
    badge: "Free",
    type: "openrouter"
  },
  {
    id: "openrouter:raifle/sorcererlm-8x22b",
    name: "SorcererLM 8x22B",
    description: "Raifle's MoE SorcererLM 8x22B",
    icon: <Brain className="w-4 h-4" />,
    badge: "MoE",
    type: "openrouter"
  },
  {
    id: "openrouter:rekaai/reka-flash-3:free",
    name: "Reka Flash 3 (Free)",
    description: "RekaAI's fast Reka Flash 3 (free)",
    icon: <Brain className="w-4 h-4" />,
    badge: "Free",
    type: "openrouter"
  },
  {
    id: "openrouter:relace/relace-apply-3",
    name: "Relace Apply 3",
    description: "Relace's application-focused model 3",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:sao10k/l3-euryale-70b",
    name: "L3 Euryale 70B",
    description: "Sao10k's fine-tuned Llama 3 Euryale 70B",
    icon: <Brain className="w-4 h-4" />,
    badge: "RP",
    type: "openrouter"
  },
  {
    id: "openrouter:sao10k/l3-lunaris-8b",
    name: "L3 Lunaris 8B",
    description: "Sao10k's creative Llama 3 Lunaris 8B",
    icon: <Brain className="w-4 h-4" />,
    badge: "Creative",
    type: "openrouter"
  },
  {
    id: "openrouter:sao10k/l3.1-euryale-70b",
    name: "L3.1 Euryale 70B",
    description: "Sao10k's Llama 3.1 Euryale 70B",
    icon: <Brain className="w-4 h-4" />,
    badge: "RP",
    type: "openrouter"
  },
  {
    id: "openrouter:sao10k/l3.3-euryale-70b",
    name: "L3.3 Euryale 70B",
    description: "Sao10k's latest Llama 3.3 Euryale 70B",
    icon: <Brain className="w-4 h-4" />,
    badge: "Latest",
    type: "openrouter"
  },
  {
    id: "openrouter:sarvamai/sarvam-m:free",
    name: "Sarvam M (Free)",
    description: "Sarvam's multilingual model M (free)",
    icon: <Brain className="w-4 h-4" />,
    badge: "Free",
    type: "openrouter"
  },
  {
    id: "openrouter:scb10x/llama3.1-typhoon2-70b-instruct",
    name: "Llama3.1 Typhoon2 70B Instruct",
    description: "SCB10X's Thai-enhanced Llama3.1 Typhoon2 70B",
    icon: <Brain className="w-4 h-4" />,
    badge: "Thai",
    type: "openrouter"
  },
  {
    id: "openrouter:shisa-ai/shisa-v2-llama3.3-70b",
    name: "Shisa v2 Llama3.3 70B",
    description: "Shisa-AI's fine-tuned Shisa v2 on Llama3.3",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:shisa-ai/shisa-v2-llama3.3-70b:free",
    name: "Shisa v2 Llama3.3 70B (Free)",
    description: "Shisa-AI's Shisa v2 70B (free)",
    icon: <Brain className="w-4 h-4" />,
    badge: "Free",
    type: "openrouter"
  },
  {
    id: "openrouter:sophosympatheia/midnight-rose-70b",
    name: "Midnight Rose 70B",
    description: "Sophosympatheia's uncensored Midnight Rose 70B",
    icon: <Brain className="w-4 h-4" />,
    badge: "Uncensored",
    type: "openrouter"
  },
  {
    id: "openrouter:switchpoint/router",
    name: "Switchpoint Router",
    description: "Switchpoint's model routing system",
    icon: <Brain className="w-4 h-4" />,
    badge: "Router",
    type: "openrouter"
  },
  {
    id: "openrouter:tencent/hunyuan-a13b-instruct",
    name: "Hunyuan A13B Instruct",
    description: "Tencent's Hunyuan A13B instruction model",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:tencent/hunyuan-a13b-instruct:free",
    name: "Hunyuan A13B Instruct (Free)",
    description: "Tencent's Hunyuan A13B (free)",
    icon: <Brain className="w-4 h-4" />,
    badge: "Free",
    type: "openrouter"
  },
  {
    id: "openrouter:thedrummer/anubis-70b-v1.1",
    name: "Anubis 70B v1.1",
    description: "TheDrummer's Anubis 70B v1.1",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:thedrummer/anubis-pro-105b-v1",
    name: "Anubis Pro 105B v1",
    description: "TheDrummer's professional Anubis Pro 105B",
    icon: <Brain className="w-4 h-4" />,
    badge: "Pro",
    type: "openrouter"
  },
  {
    id: "openrouter:thedrummer/cydonia-24b-v4.1",
    name: "Cydonia 24B v4.1",
    description: "TheDrummer's Cydonia 24B v4.1",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:thedrummer/rocinante-12b",
    name: "Rocinante 12B",
    description: "TheDrummer's efficient Rocinante 12B",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:thedrummer/skyfall-36b-v2",
    name: "Skyfall 36B v2",
    description: "TheDrummer's Skyfall 36B v2",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:thedrummer/unslopnemo-12b",
    name: "Unslopnemo 12B",
    description: "TheDrummer's cleaned Unslopnemo 12B",
    icon: <Brain className="w-4 h-4" />,
    badge: "Clean",
    type: "openrouter"
  },
  {
    id: "openrouter:thudm/glm-4-32b",
    name: "GLM-4 32B",
    description: "THUDM's GLM-4 32B model",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:thudm/glm-4.1v-9b-thinking",
    name: "GLM-4.1V 9B Thinking",
    description: "THUDM's vision GLM-4.1V 9B with thinking",
    icon: <Brain className="w-4 h-4" />,
    badge: "Vision",
    type: "openrouter"
  },
  {
    id: "openrouter:thudm/glm-z1-32b",
    name: "GLM-Z1 32B",
    description: "THUDM's GLM-Z1 32B model",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:tngtech/deepseek-r1t-chimera",
    name: "DeepSeek R1T Chimera",
    description: "TNGTech's DeepSeek R1T Chimera hybrid",
    icon: <Brain className="w-4 h-4" />,
    badge: "Hybrid",
    type: "openrouter"
  },
  {
    id: "openrouter:tngtech/deepseek-r1t-chimera:free",
    name: "DeepSeek R1T Chimera (Free)",
    description: "TNGTech's Chimera (free)",
    icon: <Brain className="w-4 h-4" />,
    badge: "Free",
    type: "openrouter"
  },
  {
    id: "openrouter:tngtech/deepseek-r1t2-chimera:free",
    name: "DeepSeek R1T2 Chimera (Free)",
    description: "TNGTech's R1T2 Chimera (free)",
    icon: <Brain className="w-4 h-4" />,
    badge: "Free",
    type: "openrouter"
  },
  {
    id: "openrouter:undi95/remm-slerp-l2-13b",
    name: "ReMM SLERP L2 13B",
    description: "Undi95's ReMM SLERP merged L2 13B",
    icon: <Brain className="w-4 h-4" />,
    badge: "Merged",
    type: "openrouter"
  },
  {
    id: "openrouter:x-ai/grok-2-1212",
    name: "Grok-2 (1212)",
    description: "xAI's Grok-2 model from December 2024",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:x-ai/grok-2-vision-1212",
    name: "Grok-2 Vision (1212)",
    description: "xAI's multimodal Grok-2 Vision",
    icon: <Brain className="w-4 h-4" />,
    badge: "Vision",
    type: "openrouter"
  },
  {
    id: "openrouter:x-ai/grok-3",
    name: "Grok-3",
    description: "xAI's advanced Grok-3 model",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:x-ai/grok-3-beta",
    name: "Grok-3 Beta",
    description: "xAI's Grok-3 beta version",
    icon: <Brain className="w-4 h-4" />,
    badge: "Beta",
    type: "openrouter"
  },
  {
    id: "openrouter:x-ai/grok-3-mini",
    name: "Grok-3 Mini",
    description: "xAI's lightweight Grok-3 Mini",
    icon: <Brain className="w-4 h-4" />,
    badge: "Mini",
    type: "openrouter"
  },
  {
    id: "openrouter:x-ai/grok-3-mini-beta",
    name: "Grok-3 Mini Beta",
    description: "xAI's Grok-3 Mini beta",
    icon: <Brain className="w-4 h-4" />,
    badge: "Beta",
    type: "openrouter"
  },
  {
    id: "openrouter:x-ai/grok-4",
    name: "Grok-4",
    description: "xAI's next-generation Grok-4",
    icon: <Brain className="w-4 h-4" />,
    badge: "Next-Gen",
    type: "openrouter"
  },
  {
    id: "openrouter:x-ai/grok-4-fast:free",
    name: "Grok-4 Fast (Free)",
    description: "xAI's fast Grok-4 (free)",
    icon: <Brain className="w-4 h-4" />,
    badge: "Free",
    type: "openrouter"
  },
  {
    id: "openrouter:x-ai/grok-code-fast-1",
    name: "Grok Code Fast 1",
    description: "xAI's coding-optimized Grok Code Fast",
    icon: <Brain className="w-4 h-4" />,
    badge: "Code",
    type: "openrouter"
  },
  {
    id: "openrouter:x-ai/grok-vision-beta",
    name: "Grok Vision Beta",
    description: "xAI's vision-capable Grok beta",
    icon: <Brain className="w-4 h-4" />,
    badge: "Vision",
    type: "openrouter"
  },
  {
    id: "openrouter:z-ai/glm-4-32b",
    name: "GLM-4 32B",
    description: "Z-AI's GLM-4 32B model",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:z-ai/glm-4.5",
    name: "GLM-4.5",
    description: "Z-AI's enhanced GLM-4.5",
    icon: <Brain className="w-4 h-4" />,
    badge: null,
    type: "openrouter"
  },
  {
    id: "openrouter:z-ai/glm-4.5-air",
    name: "GLM-4.5 Air",
    description: "Z-AI's lightweight GLM-4.5 Air",
    icon: <Brain className="w-4 h-4" />,
    badge: "Air",
    type: "openrouter"
  },
  {
    id: "openrouter:z-ai/glm-4.5-air:free",
    name: "GLM-4.5 Air (Free)",
    description: "Z-AI's GLM-4.5 Air (free)",
    icon: <Brain className="w-4 h-4" />,
    badge: "Free",
    type: "openrouter"
  },
  {
    id: "openrouter:z-ai/glm-4.5v",
    name: "GLM-4.5V",
    description: "Z-AI's vision-language GLM-4.5V",
    icon: <Brain className="w-4 h-4" />,
    badge: "Vision",
    type: "openrouter"
  }
];

const GROK_MODELS: AIModel[] = [
  {
    id: "x-ai/grok-4",
    name: "Grok 4",
    description: "Latest Grok model",
    icon: <MessageSquare className="w-4 h-4" />,
    badge: "Recommended",
    type: "grok"
  },
  {
    id: "x-ai/grok-4-fast:free",
    name: "Grok 4 Fast",
    description: "Fast Grok model",
    icon: <Zap className="w-4 h-4" />,
    type: "grok"
  },
  {
    id: "x-ai/grok-3",
    name: "Grok 3",
    description: "Previous generation",
    icon: <Bot className="w-4 h-4" />,
    type: "grok"
  },
  {
    id: "x-ai/grok-3-beta",
    name: "Grok 3 Beta",
    description: "Beta version",
    icon: <Bot className="w-4 h-4" />,
    type: "grok"
  },
  {
    id: "x-ai/grok-3-mini",
    name: "Grok 3 Mini",
    description: "Lightweight model",
    icon: <Wind className="w-4 h-4" />,
    type: "grok"
  },
  {
    id: "x-ai/grok-3-mini-beta",
    name: "Grok 3 Mini Beta",
    description: "Beta lightweight",
    icon: <Wind className="w-4 h-4" />,
    type: "grok"
  },
  {
    id: "x-ai/grok-2-1212",
    name: "Grok 2 1212",
    description: "Grok 2 model",
    icon: <Bot className="w-4 h-4" />,
    type: "grok"
  },
  {
    id: "x-ai/grok-2-vision-1212",
    name: "Grok 2 Vision",
    description: "Vision capable",
    icon: <Bot className="w-4 h-4" />,
    type: "grok"
  },
  {
    id: "x-ai/grok-code-fast-1",
    name: "Grok Code Fast",
    description: "Code specialist",
    icon: <Code className="w-4 h-4" />,
    type: "grok"
  },
  {
    id: "x-ai/grok-vision-beta",
    name: "Grok Vision Beta",
    description: "Beta vision model",
    icon: <Bot className="w-4 h-4" />,
    type: "grok"
  },
];

export const ModelSelector = ({ selectedModel, onModelChange }: ModelSelectorProps) => {
  const [activeTab, setActiveTab] = useState<"claude" | "mistral" | "perplexity" | "grok" | "openrouter">(
    selectedModel.startsWith("claude") ? "claude" :
    selectedModel.startsWith("mistral") ? "mistral" :
    selectedModel.startsWith("perplexity") ? "perplexity" :
    selectedModel.startsWith("x-ai") ? "grok" :
    selectedModel.startsWith("openrouter") ? "openrouter" : "claude"
  );

  const currentModel = [...CLAUDE_MODELS, ...MISTRAL_MODELS, ...PERPLEXITY_MODELS, ...GROK_MODELS, ...OPENROUTER_MODELS].find(model => model.id === selectedModel);

  const handleModelChange = (modelId: string) => {
    onModelChange(modelId);
    // Update active tab based on selected model
    if (modelId.startsWith("claude")) {
      setActiveTab("claude");
    } else if (modelId.startsWith("mistral")) {
      setActiveTab("mistral");
    } else if (modelId.startsWith("perplexity")) {
      setActiveTab("perplexity");
    } else if (modelId.startsWith("x-ai")) {
      setActiveTab("grok");
    } else if (modelId.startsWith("openrouter")) {
      setActiveTab("openrouter");
    } else {
      setActiveTab("claude");
    }
  };

  const handleTabChange = (tab: "claude" | "mistral" | "perplexity" | "grok" | "openrouter") => {
    setActiveTab(tab);
    // Auto-select the first model of the chosen type
    const models = tab === "claude" ? CLAUDE_MODELS :
                    tab === "mistral" ? MISTRAL_MODELS :
                    tab === "perplexity" ? PERPLEXITY_MODELS :
                    tab === "grok" ? GROK_MODELS : OPENROUTER_MODELS;
    if (models.length > 0) {
      handleModelChange(models[0].id);
    }
  };

  return (
    <div className="w-full max-w-md">
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-5 mb-4 h-auto p-1">
          <TabsTrigger
            value="claude"
            className="flex items-center gap-1 md:gap-2 data-[state=inactive]:opacity-60 data-[state=inactive]:cursor-not-allowed text-xs md:text-sm px-2 md:px-3 py-2 transition-all duration-200 hover:bg-accent/50"
          >
            <Brain className="w-3 h-3 md:w-4 md:h-4" />
            <span className="hidden sm:inline">Claude</span>
            <span className="sm:hidden">C</span>
          </TabsTrigger>
          <TabsTrigger
            value="mistral"
            className="flex items-center gap-1 md:gap-2 data-[state=inactive]:opacity-60 data-[state=inactive]:cursor-not-allowed text-xs md:text-sm px-2 md:px-3 py-2 transition-all duration-200 hover:bg-accent/50"
          >
            <Wind className="w-3 h-3 md:w-4 md:h-4" />
            <span className="hidden sm:inline">Mistral</span>
            <span className="sm:hidden">M</span>
          </TabsTrigger>
          <TabsTrigger
            value="perplexity"
            className="flex items-center gap-1 md:gap-2 data-[state=inactive]:opacity-60 data-[state=inactive]:cursor-not-allowed text-xs md:text-sm px-2 md:px-3 py-2 transition-all duration-200 hover:bg-accent/50"
          >
            <Search className="w-3 h-3 md:w-4 md:h-4" />
            <span className="hidden sm:inline">Perplexity</span>
            <span className="sm:hidden">P</span>
          </TabsTrigger>
          <TabsTrigger
            value="grok"
            className="flex items-center gap-1 md:gap-2 data-[state=inactive]:opacity-60 data-[state=inactive]:cursor-not-allowed text-xs md:text-sm px-2 md:px-3 py-2 transition-all duration-200 hover:bg-accent/50"
          >
            <MessageSquare className="w-3 h-3 md:w-4 md:h-4" />
            <span className="hidden sm:inline">Grok</span>
            <span className="sm:hidden">G</span>
          </TabsTrigger>
          <TabsTrigger
            value="openrouter"
            className="flex items-center gap-1 md:gap-2 data-[state=inactive]:opacity-60 data-[state=inactive]:cursor-not-allowed text-xs md:text-sm px-2 md:px-3 py-2 transition-all duration-200 hover:bg-accent/50 col-span-2 md:col-span-1"
          >
            <Globe className="w-3 h-3 md:w-4 md:h-4" />
            <span className="hidden md:inline">OpenRouter</span>
            <span className="md:hidden">OR</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="claude" className="mt-0">
          <Select value={selectedModel} onValueChange={handleModelChange}>
            <SelectTrigger className={`w-full h-10 border-border/50 transition-all duration-200 hover:border-primary/50 focus:border-primary ${(activeTab === "mistral" || activeTab === "perplexity") ? "opacity-60 cursor-not-allowed bg-muted/30" : "bg-background/50 hover:bg-accent/10"}`}>
              <div className="flex items-center gap-2">
                <div className="transition-transform duration-200 group-hover:scale-110">
                  {currentModel?.icon}
                </div>
                <SelectValue>
                  <span className="text-sm font-medium">{currentModel?.name}</span>
                </SelectValue>
              </div>
            </SelectTrigger>
            <SelectContent className="max-h-64">
              {CLAUDE_MODELS.map((model) => (
                <SelectItem
                  key={model.id}
                  value={model.id}
                  disabled={activeTab === "mistral" || activeTab === "perplexity"}
                  className={(activeTab === "mistral" || activeTab === "perplexity") ? "opacity-50" : "hover:bg-accent/50 transition-colors duration-150"}
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2">
                      <div className="transition-transform duration-150 hover:scale-110">
                        {model.icon}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{model.name}</span>
                        <span className="text-xs text-muted-foreground">{model.description}</span>
                      </div>
                    </div>
                    {model.badge && (
                      <Badge variant="secondary" className="text-xs animate-in fade-in duration-200">
                        {model.badge}
                      </Badge>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </TabsContent>

        <TabsContent value="mistral" className="mt-0">
          <Select value={selectedModel} onValueChange={handleModelChange}>
            <SelectTrigger className={`w-full h-10 border-border/50 ${(activeTab === "claude" || activeTab === "perplexity") ? "opacity-60 cursor-not-allowed bg-muted/30" : "bg-background/50"}`}>
              <div className="flex items-center gap-2">
                {currentModel?.icon}
                <SelectValue>
                  <span className="text-sm font-medium">{currentModel?.name}</span>
                </SelectValue>
              </div>
            </SelectTrigger>
            <SelectContent>
              {MISTRAL_MODELS.map((model) => (
                <SelectItem
                  key={model.id}
                  value={model.id}
                  disabled={activeTab === "claude" || activeTab === "perplexity"}
                  className={(activeTab === "claude" || activeTab === "perplexity") ? "opacity-50" : ""}
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2">
                      {model.icon}
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{model.name}</span>
                        <span className="text-xs text-muted-foreground">{model.description}</span>
                      </div>
                    </div>
                    {model.badge && (
                      <Badge variant="secondary" className="text-xs">
                        {model.badge}
                      </Badge>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </TabsContent>

        <TabsContent value="perplexity" className="mt-0">
          <Select value={selectedModel} onValueChange={handleModelChange}>
            <SelectTrigger className={`w-full h-10 border-border/50 ${(activeTab === "claude" || activeTab === "mistral" || activeTab === "grok") ? "opacity-60 cursor-not-allowed bg-muted/30" : "bg-background/50"}`}>
              <div className="flex items-center gap-2">
                {currentModel?.icon}
                <SelectValue>
                  <span className="text-sm font-medium">{currentModel?.name}</span>
                </SelectValue>
              </div>
            </SelectTrigger>
            <SelectContent>
              {PERPLEXITY_MODELS.map((model) => (
                <SelectItem
                  key={model.id}
                  value={model.id}
                  disabled={activeTab === "claude" || activeTab === "mistral" || activeTab === "grok"}
                  className={(activeTab === "claude" || activeTab === "mistral" || activeTab === "grok") ? "opacity-50" : ""}
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2">
                      {model.icon}
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{model.name}</span>
                        <span className="text-xs text-muted-foreground">{model.description}</span>
                      </div>
                    </div>
                    {model.badge && (
                      <Badge variant="secondary" className="text-xs">
                        {model.badge}
                      </Badge>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </TabsContent>

        <TabsContent value="grok" className="mt-0">
          <Select value={selectedModel} onValueChange={handleModelChange}>
            <SelectTrigger className={`w-full h-10 border-border/50 ${(activeTab === "claude" || activeTab === "mistral" || activeTab === "perplexity") ? "opacity-60 cursor-not-allowed bg-muted/30" : "bg-background/50"}`}>
              <div className="flex items-center gap-2">
                {currentModel?.icon}
                <SelectValue>
                  <span className="text-sm font-medium">{currentModel?.name}</span>
                </SelectValue>
              </div>
            </SelectTrigger>
            <SelectContent>
              {GROK_MODELS.map((model) => (
                <SelectItem
                  key={model.id}
                  value={model.id}
                  disabled={activeTab === "claude" || activeTab === "mistral" || activeTab === "perplexity"}
                  className={(activeTab === "claude" || activeTab === "mistral" || activeTab === "perplexity") ? "opacity-50" : ""}
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2">
                      {model.icon}
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{model.name}</span>
                        <span className="text-xs text-muted-foreground">{model.description}</span>
                      </div>
                    </div>
                    {model.badge && (
                      <Badge variant="secondary" className="text-xs">
                        {model.badge}
                      </Badge>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </TabsContent>

        <TabsContent value="openrouter" className="mt-0">
          <Select value={selectedModel} onValueChange={handleModelChange}>
            <SelectTrigger className={`w-full h-10 border-border/50 ${(activeTab === "claude" || activeTab === "mistral" || activeTab === "perplexity" || activeTab === "grok") ? "opacity-60 cursor-not-allowed bg-muted/30" : "bg-background/50"}`}>
              <div className="flex items-center gap-2">
                {currentModel?.icon}
                <SelectValue>
                  <span className="text-sm font-medium">{currentModel?.name}</span>
                </SelectValue>
              </div>
            </SelectTrigger>
            <SelectContent>
              {OPENROUTER_MODELS.map((model) => (
                <SelectItem
                  key={model.id}
                  value={model.id}
                  disabled={activeTab === "claude" || activeTab === "mistral" || activeTab === "perplexity" || activeTab === "grok"}
                  className={(activeTab === "claude" || activeTab === "mistral" || activeTab === "perplexity" || activeTab === "grok") ? "opacity-50" : ""}
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2">
                      {model.icon}
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{model.name}</span>
                        <span className="text-xs text-muted-foreground">{model.description}</span>
                      </div>
                    </div>
                    {model.badge && (
                      <Badge variant="secondary" className="text-xs">
                        {model.badge}
                      </Badge>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </TabsContent>
      </Tabs>
    </div>
  );
};
